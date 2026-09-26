import * as cheerio from 'cheerio'
import TurndownService from 'turndown'

const BASE = 'https://www.wuxiaworld.com'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' })

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } })
  if (!res.ok) throw new Error(`wuxiaworld: ${url} returned ${res.status}`)
  return res.json() as Promise<T>
}

async function getHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`wuxiaworld: ${url} returned ${res.status}`)
  return res.text()
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface WuxiaSearchItem {
  id: number
  slug: string
  name: string
  coverUrl?: string
  status?: number
  authorName?: string | null
  synopsis?: string | null
  tags?: string[]
  genres?: string[]
}

interface WuxiaSearchResponse {
  items: WuxiaSearchItem[]
}

export interface SearchItem {
  id: string
  title: string
  description: string | null
  cover_url: string | null
  status: string
  author: string | null
  year: number | null
  tags: string | null
  content_type: string
}

export interface ChapterItem {
  source_id: string
  number: number
  volume: number | null
  title: string | null
}

function mapStatus(s?: number): string {
  if (s === 0) return 'completed'
  if (s === 1) return 'ongoing'
  return 'unknown'
}

// ── Search ────────────────────────────────────────────────────────────────────

export async function search(query: string): Promise<SearchItem[]> {
  const q = encodeURIComponent(query)
  const data = await getJson<WuxiaSearchResponse>(`${BASE}/api/novels/search?query=${q}&pageSize=20`)
  return (data.items ?? []).map((s) => ({
    id: s.slug,
    title: s.name,
    description: s.synopsis ? s.synopsis.replace(/<[^>]+>/g, '').trim() || null : null,
    cover_url: s.coverUrl ?? null,
    status: mapStatus(s.status),
    author: s.authorName ?? null,
    year: null,
    tags: [...(s.tags ?? []), ...(s.genres ?? [])].join(', ') || null,
    content_type: 'novel',
  }))
}

// ── Chapters ──────────────────────────────────────────────────────────────────
// The novel id comes from the React Query state embedded in the chapters page;
// the chapter list (with each chapter's real slug) from the site's own gRPC-web
// API — the same call the SPA makes. Guessing "{novel}/chapter/{N}" doesn't work:
// WuxiaWorld serves those URLs as an empty client-rendered shell (GH #173).
// ponytail: hand-rolled protobuf for the ~6 fields we read; regenerate from
// .proto only if the API grows beyond that.

const API = 'https://api2.wuxiaworld.com/wuxiaworld.api.v2.Chapters/GetChapterList'

type Fields = Map<number, (number | Uint8Array)[]>

function readVarint(buf: Uint8Array, pos: number): [number, number] {
  let result = 0, shift = 0, byte: number
  do {
    byte = buf[pos++]
    result += (byte & 0x7f) * 2 ** shift
    shift += 7
  } while (byte & 0x80)
  return [result, pos]
}

/** Decodes one protobuf message into field number → values (varints as numbers, length-delimited as bytes). */
function readFields(buf: Uint8Array): Fields {
  const fields: Fields = new Map()
  let pos = 0
  while (pos < buf.length) {
    let key: number
    ;[key, pos] = readVarint(buf, pos)
    const field = Math.floor(key / 8), type = key & 7
    let value: number | Uint8Array
    if (type === 0) [value, pos] = readVarint(buf, pos)
    else if (type === 2) {
      let len: number
      ;[len, pos] = readVarint(buf, pos)
      value = buf.subarray(pos, pos + len)
      pos += len
    } else if (type === 5) { value = 0; pos += 4 }
    else if (type === 1) { value = 0; pos += 8 }
    else throw new Error(`wuxiaworld: unexpected protobuf wire type ${type}`)
    fields.set(field, [...(fields.get(field) ?? []), value])
  }
  return fields
}

const decoder = new TextDecoder()
const str = (f: Fields, n: number) => { const v = f.get(n)?.[0]; return v instanceof Uint8Array ? decoder.decode(v) : null }
const num = (f: Fields, n: number) => { const v = f.get(n)?.[0]; return typeof v === 'number' ? v : null }

// GetChapterListResponse: 1 = repeated ChapterGroup { 3 = order, 6 = repeated Chapter }
// Chapter: 2 = name, 3 = slug, 13 = karmaInfo { 2 = isKarmaRequired },
//          17 = position in the whole novel (the site's chapter number)
export function parseChapterList(novelSlug: string, body: Uint8Array): ChapterItem[] {
  const result: ChapterItem[] = []
  // grpc-web body = frames of [flag:1][length:4][payload]; flag 0 = message, 0x80 = trailers
  for (let pos = 0; pos + 5 <= body.length;) {
    const flag = body[pos]
    const len = new DataView(body.buffer, body.byteOffset + pos + 1, 4).getUint32(0)
    const payload = body.subarray(pos + 5, pos + 5 + len)
    pos += 5 + len
    if (flag !== 0) continue
    for (const group of readFields(payload).get(1) ?? []) {
      if (!(group instanceof Uint8Array)) continue
      const g = readFields(group)
      for (const chapter of g.get(6) ?? []) {
        if (!(chapter instanceof Uint8Array)) continue
        const c = readFields(chapter)
        const slug = str(c, 3), number = num(c, 17)
        if (!slug || number === null) continue
        // Karma-locked: without an account the site only serves a teaser — skip it
        // rather than download a truncated preview as the chapter.
        const karma = c.get(13)?.[0]
        if (karma instanceof Uint8Array && num(readFields(karma), 2) === 1) continue
        result.push({ source_id: `${novelSlug}/${slug}`, number, volume: num(g, 3), title: str(c, 2) })
      }
    }
  }
  return result
}

export async function chapters(novelSlug: string): Promise<ChapterItem[]> {
  const html = await getHtml(`${BASE}/novel/${novelSlug}/chapters`)
  const novelId = extractNovelId(html)
  if (!novelId) return []

  // GetChapterListRequest { 1: novelId } in a grpc-web frame — all groups, all chapters.
  const msg = [0x08, ...varintBytes(novelId)]
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/grpc-web+proto', 'X-Grpc-Web': '1', 'User-Agent': UA },
    body: new Uint8Array([0, 0, 0, 0, msg.length, ...msg]),
  })
  if (!res.ok) throw new Error(`wuxiaworld: chapter list for ${novelSlug} returned ${res.status}`)
  return parseChapterList(novelSlug, new Uint8Array(await res.arrayBuffer()))
}

function varintBytes(n: number): number[] {
  const out: number[] = []
  while (n > 0x7f) { out.push((n & 0x7f) | 0x80); n = Math.floor(n / 128) }
  out.push(n)
  return out
}

function extractNovelId(html: string): number | null {
  const match = html.match(/window\.__REACT_QUERY_STATE__\s*=\s*(\{.*?\});\s*/s)
  if (!match) return null
  try {
    const state = JSON.parse(match[1]) as { queries?: { queryKey?: unknown[]; state?: { data?: { item?: { id?: number } } } }[] }
    const novelQuery = state.queries?.find(q => Array.isArray(q.queryKey) && q.queryKey.includes('novel'))
    return novelQuery?.state?.data?.item?.id ?? null
  } catch {
    return null
  }
}

// ── Chapter text ──────────────────────────────────────────────────────────────
// source_id = "novelSlug/chapterSlug" → URL: /novel/novelSlug/chapterSlug

export async function chapterText(chapterId: string): Promise<string> {
  const url = `${BASE}/novel/${chapterId}`
  const html = await getHtml(url)
  if (isTeaser(html, chapterId.split('/').pop()!)) {
    throw new Error(`locked chapter ${chapterId}: WuxiaWorld only serves a teaser without Karma/VIP`)
  }
  const $ = cheerio.load(html)
  const content = $('.chapter-content').first().html() || ''
  const result = td.turndown(content).trim()
  // A chapter-page fallback URL (chapters 2+) can serve a client-side-rendered-only shell —
  // .chapter-content exists but is never populated without JS. Treat that the same as a fetch
  // failure instead of silently returning empty content (GH #173).
  if (result.length <= 30) throw new Error(`empty chapter content for ${chapterId} (possible CSR-only page)`)
  return result
}

function isTeaser(html: string, chapterSlug: string): boolean {
  const match = html.match(/window\.__REACT_QUERY_STATE__\s*=\s*(\{.*?\});\s*/s)
  if (!match) return false
  try {
    const state = JSON.parse(match[1]) as { queries?: { state?: { data?: { item?: { slug?: string; isTeaser?: boolean } } } }[] }
    return state.queries?.some((q) => q.state?.data?.item?.slug === chapterSlug && q.state.data.item.isTeaser === true) ?? false
  } catch {
    return false
  }
}
