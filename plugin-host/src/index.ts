import express from 'express'
import fs from 'fs'
import path from 'path'
import { chromium } from 'playwright-core'
import type { Browser } from 'playwright-core'

const PORT = parseInt(process.env.PORT ?? '4000', 10)
const BUNDLES_DIR = process.env.BUNDLES_DIR ?? path.join(__dirname, '..', 'bundles')
const COMMUNITY_BUNDLES_DIR = process.env.COMMUNITY_BUNDLES_DIR ?? path.join(__dirname, '..', 'community-bundles')
const LANGS = (process.env.LANGUAGES ?? 'en').split(',').map((s) => s.trim()).filter(Boolean)
const CLOAKBROWSER_WS_URL = process.env.CLOAKBROWSER_WS_URL ?? ''
// Upper bound on one plugin call. Generous: a long novel's chapter list can page for a while.
const PLUGIN_CALL_TIMEOUT_MS = parseInt(process.env.PLUGIN_CALL_TIMEOUT_MS ?? '180000', 10)

class PluginTimeoutError extends Error {}

// ponytail: stops waiting, doesn't cancel — the plugin API has no AbortSignal, so a hung
// fetch/CDP call keeps running in the background. Thread a signal through if that leaks.
function withTimeout<T>(call: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PluginTimeoutError(`${what} timed out after ${ms}ms`)), ms)
  })
  return Promise.race([call, deadline]).finally(() => clearTimeout(timer))
}

const errorStatus = (e: unknown) => (e instanceof PluginTimeoutError ? 504 : 502)

// ── CloakBrowser connection ───────────────────────────────────────────────────

// Rewrite the host portion of a CDP WebSocket URL reported by /json/version to the
// host from the configured CLOAKBROWSER_WS_URL. CloakBrowser self-reports 0.0.0.0 or
// its internal container hostname — neither is reachable from outside. Using the
// configured URL's host works for both local dev (localhost:3001) and Docker-to-Docker
// (cloakbrowser:3000) without any special-casing.
export function rewriteCdpHost(cdpWsUrl: string, configUrl: string): string {
  const { host } = new URL(configUrl)
  return cdpWsUrl.replace(/^ws:\/\/[^/]+/, `ws://${host}`)
}

let browser: Browser | null = null

async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser
  if (!CLOAKBROWSER_WS_URL) {
    throw new Error('CLOAKBROWSER_WS_URL is not set — CF-dependent plugins will not work')
  }
  console.log('[plugin-host] connecting to CloakBrowser…')
  // Fetch WS URL from /json/version and rewrite the host to match CLOAKBROWSER_WS_URL.
  // CloakBrowser reports its own internal hostname in the WS URL (e.g. 0.0.0.0), which is
  // unreachable from outside. Use the host from CLOAKBROWSER_WS_URL instead — this works for
  // both local dev (localhost:3001) and Docker-to-Docker (cloakbrowser:3000).
  const versionRes = await fetch(`${CLOAKBROWSER_WS_URL}/json/version`)
  const { webSocketDebuggerUrl } = await versionRes.json() as { webSocketDebuggerUrl: string }
  const wsUrl = rewriteCdpHost(webSocketDebuggerUrl, CLOAKBROWSER_WS_URL)
  browser = await chromium.connectOverCDP(wsUrl)
  browser.on('disconnected', () => {
    console.warn('[plugin-host] CloakBrowser disconnected — will reconnect on next request')
    browser = null
  })
  console.log('[plugin-host] connected to CloakBrowser')
  return browser
}

// ── Plugin protocol types ─────────────────────────────────────────────────────

export interface PluginInfo {
  id: string
  name: string
  default_explicit: boolean
  content_types: string[]
  is_community?: boolean
}

export interface PluginContext {
  getBrowser: () => Promise<Browser>
  logger: typeof console
}

export interface PluginBundle {
  info: PluginInfo
  init?: (ctx: PluginContext) => void | Promise<void>
  search: (q: string) => Promise<unknown[]>
  chapters: (id: string, langs: string[]) => Promise<unknown[]>
  pages?: (id: string) => Promise<unknown[]>
  trending?: () => Promise<unknown[]>
  meta?: (id: string, langs: string[]) => Promise<unknown>
  cover?: (url: string) => Promise<Buffer>
  chapterText?: (id: string) => Promise<string>
}

// ── Registry ──────────────────────────────────────────────────────────────────

const plugins = new Map<string, PluginBundle>()
const communityIds = new Set<string>()

const ctx: PluginContext = {
  getBrowser,
  logger: console,
}

/** Which plugin id each loaded bundle file registered — so a removed file can be unloaded. */
const bundleFileIds = new Map<string, string>()

/** Watcher event: (re)load a changed bundle file, or unload it if the file was removed (spec 020). */
export async function onBundleChange(
  registry: Map<string, PluginBundle>,
  communitySet: Set<string>,
  file: string,
  isCommunity: boolean,
): Promise<void> {
  const abs = path.resolve(file)
  if (fs.existsSync(abs)) return loadBundle(registry, communitySet, abs, isCommunity)
  const id = bundleFileIds.get(abs)
  if (!id) return
  bundleFileIds.delete(abs)
  registry.delete(id)
  communitySet.delete(id)
  console.log(`[plugin-host] unloaded: ${id} (bundle removed)`)
}

async function loadBundle(
  registry: Map<string, PluginBundle>,
  communitySet: Set<string>,
  file: string,
  isCommunity = false,
): Promise<void> {
  const abs = path.resolve(file)
  try {
    delete require.cache[abs]
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bundle: PluginBundle = require(abs)
    if (bundle.init) await bundle.init(ctx)
    registry.set(bundle.info.id, bundle)
    bundleFileIds.set(abs, bundle.info.id)
    if (isCommunity) communitySet.add(bundle.info.id)
    console.log(`[plugin-host] loaded: ${bundle.info.id} (${bundle.info.name})${isCommunity ? ' [community]' : ''}`)
  } catch (e) {
    console.error(`[plugin-host] failed to load ${path.basename(file)}:`, e)
  }
}

async function loadAll(): Promise<void> {
  if (fs.existsSync(BUNDLES_DIR)) {
    const files = fs.readdirSync(BUNDLES_DIR).filter((f) => f.endsWith('.js'))
    for (const f of files) await loadBundle(plugins, communityIds, path.join(BUNDLES_DIR, f), false)
  } else {
    console.warn(`[plugin-host] bundles dir not found: ${BUNDLES_DIR}`)
  }

  if (fs.existsSync(COMMUNITY_BUNDLES_DIR)) {
    const files = fs.readdirSync(COMMUNITY_BUNDLES_DIR).filter((f) => f.endsWith('.js'))
    for (const f of files) await loadBundle(plugins, communityIds, path.join(COMMUNITY_BUNDLES_DIR, f), true)
  }
}

function watchBundles(): void {
  for (const [dir, isCommunity] of [[BUNDLES_DIR, false], [COMMUNITY_BUNDLES_DIR, true]] as const) {
    if (!fs.existsSync(dir)) continue
    fs.watch(dir, (_event, filename) => {
      if (filename && filename.endsWith('.js')) {
        onBundleChange(plugins, communityIds, path.join(dir, filename), isCommunity).catch(console.error)
      }
    })
  }
  console.log(`[plugin-host] watching bundle directories`)
}

// ── App factory ───────────────────────────────────────────────────────────────

export function createApp(
  registry: Map<string, PluginBundle>,
  communityPluginIds: Set<string> = new Set(),
  { callTimeoutMs = PLUGIN_CALL_TIMEOUT_MS }: { callTimeoutMs?: number } = {},
): express.Application {
  const app = express()
  const call = <T>(req: express.Request, fn: string, work: Promise<T>) =>
    withTimeout(work, callTimeoutMs, `${req.params.plugin} ${fn}`)
  app.use(express.json())

  function getPlugin(id: string, res: express.Response): PluginBundle | null {
    const p = registry.get(id)
    if (!p) {
      res.status(404).json({ error: `plugin not found: ${id}` })
      return null
    }
    return p
  }

  app.get('/plugins', (_req, res) => {
    res.json(Array.from(registry.values()).map((p) => ({
      ...p.info,
      is_community: communityPluginIds.has(p.info.id),
    })))
  })

  app.get('/:plugin/info', (req, res) => {
    const p = registry.get(req.params.plugin)
    if (!p) return void res.status(404).json({ error: `plugin not found: ${req.params.plugin}` })
    res.json({ ...p.info, is_community: communityPluginIds.has(p.info.id) })
  })

  app.post('/plugins/install', async (req, res) => {
    const url = String(req.body?.url ?? '').trim()
    if (!url) return void res.status(400).json({ error: 'url required' })

    fs.mkdirSync(COMMUNITY_BUNDLES_DIR, { recursive: true })

    let bundleCode: string
    try {
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`download failed: ${resp.status}`)
      bundleCode = await resp.text()
    } catch (e) {
      return void res.status(502).json({ error: String(e) })
    }

    const filename = path.basename(new URL(url).pathname)
    if (!filename.endsWith('.js')) {
      return void res.status(400).json({ error: 'download_url must end with .js' })
    }
    const dest = path.join(COMMUNITY_BUNDLES_DIR, filename)
    fs.writeFileSync(dest, bundleCode, 'utf-8')

    await loadBundle(registry, communityPluginIds, dest, true)
    res.status(201).json({ ok: true })
  })

  app.delete('/plugins/:id', (req, res) => {
    const id = req.params.id
    if (!communityPluginIds.has(id)) {
      return void res.status(403).json({ error: 'cannot delete a bundled default plugin' })
    }

    registry.delete(id)
    communityPluginIds.delete(id)

    if (fs.existsSync(COMMUNITY_BUNDLES_DIR)) {
      const file = fs.readdirSync(COMMUNITY_BUNDLES_DIR).find((f) => f.startsWith(id))
      if (file) {
        try { fs.unlinkSync(path.join(COMMUNITY_BUNDLES_DIR, file)) } catch { /* ignore */ }
      }
    }

    res.status(204).send()
  })

  app.get('/:plugin/search', async (req, res) => {
    const p = getPlugin(req.params.plugin, res)
    if (!p) return
    const q = String(req.query['q'] ?? '').trim()
    if (!q) return void res.json([])
    try {
      res.json(await call(req, 'search', p.search(q)))
    } catch (e) {
      console.error(`[${req.params.plugin}] search error:`, e)
      res.status(errorStatus(e)).json({ error: String(e) })
    }
  })

  app.get('/:plugin/trending', async (req, res) => {
    const p = getPlugin(req.params.plugin, res)
    if (!p) return
    if (!p.trending) return void res.status(404).json({ error: 'trending not supported' })
    try {
      res.json(await call(req, 'trending', p.trending()))
    } catch (e) {
      console.error(`[${req.params.plugin}] trending error:`, e)
      res.status(errorStatus(e)).json({ error: String(e) })
    }
  })

  app.get('/:plugin/manga/:id/meta', async (req, res) => {
    const p = getPlugin(req.params.plugin, res)
    if (!p) return
    if (!p.meta) return void res.status(404).json({ error: 'meta not supported' })
    try {
      res.json(await call(req, 'meta', p.meta(decodeURIComponent(req.params.id), LANGS)))
    } catch (e) {
      console.error(`[${req.params.plugin}] meta error:`, e)
      res.status(errorStatus(e)).json({ error: String(e) })
    }
  })

  app.get('/:plugin/manga/:id/chapters', async (req, res) => {
    const p = getPlugin(req.params.plugin, res)
    if (!p) return
    try {
      res.json(await call(req, 'chapters', p.chapters(decodeURIComponent(req.params.id), LANGS)))
    } catch (e) {
      console.error(`[${req.params.plugin}] chapters error:`, e)
      res.status(errorStatus(e)).json({ error: String(e) })
    }
  })

  app.get('/:plugin/chapter/:id/pages', async (req, res) => {
    const p = getPlugin(req.params.plugin, res)
    if (!p) return
    if (!p.pages) return void res.status(404).json({ error: 'pages not supported by this plugin' })
    try {
      res.json(await call(req, 'pages', p.pages(decodeURIComponent(req.params.id))))
    } catch (e) {
      console.error(`[${req.params.plugin}] pages error:`, e)
      res.status(errorStatus(e)).json({ error: String(e) })
    }
  })

  app.get('/:plugin/chapter/:id/text', async (req, res) => {
    const p = getPlugin(req.params.plugin, res)
    if (!p) return
    if (!p.chapterText) return void res.status(404).json({ error: 'chapter text not supported by this plugin' })
    try {
      const text = await call(req, 'chapterText', p.chapterText(decodeURIComponent(req.params.id)))
      res.type('text/plain').send(text)
    } catch (e) {
      console.error(`[${req.params.plugin}] chapter text error:`, e)
      res.status(errorStatus(e)).json({ error: String(e) })
    }
  })

  app.get('/:plugin/cover', async (req, res) => {
    const p = getPlugin(req.params.plugin, res)
    if (!p) return
    if (!p.cover) return void res.status(501).json({ error: 'cover proxy not implemented' })
    const url = String(req.query['url'] ?? '')
    if (!url) return void res.status(400).json({ error: 'url query param required' })
    try {
      const buf = await call(req, 'cover', p.cover(url))
      res.set('Content-Type', 'image/jpeg').send(buf)
    } catch (e) {
      res.status(errorStatus(e)).json({ error: String(e) })
    }
  })

  return app
}

// ── Boot ──────────────────────────────────────────────────────────────────────

// Tests import createApp from this module; don't also boot a real host
// (it would load real bundles and collide with a running dev host on :PORT).
if (!process.env.VITEST) loadAll().then(() => {
  watchBundles()
  const app = createApp(plugins, communityIds)
  app.listen(PORT, () => {
    console.log(`[plugin-host] listening on :${PORT} — ${plugins.size} plugin(s) loaded`)
    console.log(`[plugin-host] languages: ${LANGS.join(', ')}`)
    console.log(`[plugin-host] cloakbrowser: ${CLOAKBROWSER_WS_URL || 'not configured (CF plugins will fail)'}`)
  })
}).catch((e) => {
  console.error('[plugin-host] boot failed:', e)
  process.exit(1)
})
