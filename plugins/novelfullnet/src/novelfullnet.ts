// NovelFull.net (spec 027): same site as novelfull.com on another domain, with
// a different catalog and page template — hence its own plugin. Cloudflare
// challenges plain requests, so every page goes through CloakBrowser.
import * as cheerio from 'cheerio'
import TurndownService from 'turndown'

const BASE = 'https://novelfull.net'
const td = new TurndownService({ headingStyle: 'atx', hr: '---', bulletListMarker: '-' })

// ── Minimal browser interface (duck-typed, no playwright dep in bundle) ───────

interface BrowserPage {
  goto(url: string, opts?: { waitUntil?: string; timeout?: number }): Promise<unknown>
  content(): Promise<string>
  evaluate<T, A>(fn: (arg: A) => T | Promise<T>, arg: A): Promise<T>
  close(): Promise<void>
}
interface BrowserContextLike {
  newPage(): Promise<BrowserPage>
  close(): Promise<void>
}
interface BrowserLike {
  newContext(opts?: Record<string, unknown>): Promise<BrowserContextLike>
  isConnected(): boolean
}
export interface PluginContext {
  getBrowser: () => Promise<BrowserLike>
  logger: typeof console
}

let _ctx: PluginContext | null = null

export function setContext(ctx: PluginContext): void {
  _ctx = ctx
}

async function withPage<T>(url: string, fn: (page: BrowserPage, html: string) => Promise<T>): Promise<T> {
  const browser = await _ctx!.getBrowser()
  const bctx = await browser.newContext()
  const page = await bctx.newPage()
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    return await fn(page, await page.content())
  } finally {
    await bctx.close()
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SearchResult {
  id: string
  title: string
  description: string | null
  cover_url: string | null
  status: string
  author: string | null
  year: number | null
  tags: string | null
}

export interface ChapterResult {
  source_id: string
  number: number
  title: string | null
  chapter_format: 'text'
}

export interface MetaResult {
  description: string | null
  cover_url: string | null
  chapter_count: number
  tags: string | null
  novel_id: string | null
}

// ── Parsers (exported for tests) ──────────────────────────────────────────────

function absUrl(src: string | undefined): string | null {
  if (!src) return null
  return src.startsWith('http') ? src : `${BASE}/${src.replace(/^\//, '')}`
}

export function parseSearchHtml(html: string): SearchResult[] {
  const $ = cheerio.load(html)
  const results: SearchResult[] = []
  $('.ul-list1 .li-row').each((_, el) => {
    const link = $(el).find('h3.tit a').first()
    const id = (link.attr('href') ?? '').replace(/^\//, '').replace(/\.html$/, '')
    const title = link.text().trim()
    if (!id || !title) return
    const img = $(el).find('.pic img').first()
    results.push({
      id,
      title,
      // `.desc` here is "English Novel · genres · N Chapters", not a synopsis.
      description: null,
      cover_url: absUrl(img.attr('data-src') ?? img.attr('src')),
      status: 'ongoing',
      author: null,
      year: null,
      tags: null,
    })
  })
  return results
}

// Titles are "Chapter 41: Clash" / "Chapter 1 - Another Monday Morning"; use the
// real number so chapters merge correctly with other sources (e.g. Royal Road).
// Lettered parts ("Chapter 2.A") → 2.1, 2.2, … (same rules as the Royal Road plugin).
const CHAPTER_NUM = /chapter[-\s]*(\d+(?:\.\d+)?)(?:\.?([a-i])\b)?/i
const round2 = (n: number) => Math.round(n * 100) / 100

function chapterNumber(title: string | null, path: string): number | null {
  const m = (title ?? '').match(CHAPTER_NUM) ?? path.split('/').pop()!.match(CHAPTER_NUM)
  if (!m) return null
  return round2(Number(m[1]) + (m[2] ? (m[2].toLowerCase().charCodeAt(0) - 96) / 10 : 0))
}

export function parseChapterList(html: string): ChapterResult[] {
  const $ = cheerio.load(`<ul>${html}</ul>`)
  const results: ChapterResult[] = []
  $('li a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? ''
    const path = href.replace(/^https?:\/\/[^/]+/, '').replace(/^\//, '')
    if (!path) return
    const title = ($(el).attr('title') ?? $(el).text()).trim() || null
    results.push({ source_id: path, number: chapterNumber(title, path) ?? NaN, title, chapter_format: 'text' })
  })
  // No numbers anywhere → list position; otherwise an unnumbered entry sits just
  // after its predecessor (+0.01) so it can't collide with a real chapter number.
  if (results.every((c) => Number.isNaN(c.number))) return results.map((c, i) => ({ ...c, number: i + 1 }))
  let prev = 0
  for (const c of results) {
    if (Number.isNaN(c.number)) c.number = round2(prev + 0.01)
    prev = c.number
  }
  return results
}

export function parseChapterText(html: string): string {
  const $ = cheerio.load(html)
  const content = $('#chapter-content').first()
  if (!content.length) throw new Error('novelfullnet: no chapter content')
  content.find('script, ins, .fwn-slot-host, [class*="ads"]').remove()
  return td.turndown(content.html() ?? '').trim()
}

export function parseMeta(html: string): MetaResult {
  const $ = cheerio.load(html)
  const description = $('#novel-summary-inner p')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean)
    .join('\n\n') || null
  const tags = $('.m-book1 .txt a[href^="/genre/"]')
    .map((_, el) => $(el).text().trim())
    .get()
    .join(', ') || null
  const list = $('#list-chapter')
  return {
    description,
    cover_url: absUrl($('meta[property="og:image"]').attr('content')),
    chapter_count: Number(list.attr('data-total-chapters')) || 0,
    tags,
    novel_id: list.attr('data-novel-id') ?? null,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function search(query: string): Promise<SearchResult[]> {
  return withPage(`${BASE}/search?keyword=${encodeURIComponent(query)}`, async (_page, html) => parseSearchHtml(html))
}

export async function meta(slug: string): Promise<MetaResult> {
  return withPage(`${BASE}/${slug}.html`, async (_page, html) => parseMeta(html))
}

// The series page shows 40 chapters; the rest come from the site's own list
// endpoint (40/page, size not configurable), fetched in-page so the Cloudflare
// session applies — one browser load for the whole list.
export async function chapters(slug: string): Promise<ChapterResult[]> {
  return withPage(`${BASE}/${slug}.html`, async (page, html) => {
    const novelId = parseMeta(html).novel_id
    if (!novelId) throw new Error(`novelfullnet: no novel id on ${slug}`)
    const pages = await page.evaluate(async (id: string) => {
      const get = async (n: number) =>
        (await (await fetch(`/ajax-chapter-list?novelId=${id}&page=${n}`)).json()) as { html: string; totalPage: number }
      const first = await get(1)
      const out = [first.html]
      for (let n = 2; n <= first.totalPage; n++) out.push((await get(n)).html)
      return out
    }, novelId)
    return parseChapterList(pages.join('\n'))
  })
}

export async function chapterText(chapterPath: string): Promise<string> {
  return withPage(`${BASE}/${chapterPath}`, async (_page, html) => parseChapterText(html))
}
