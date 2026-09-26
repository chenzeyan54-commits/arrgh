import * as cheerio from 'cheerio'
import TurndownService from 'turndown'

const BASE = 'https://www.royalroad.com'

// Fictions without a cover serve a relative placeholder ("/dist/img/nocover-new-min.png");
// treat it as no cover, and make any other relative src absolute (the image proxy needs a full URL).
function coverUrl(src: string | undefined): string | null {
  if (!src || src.includes('/nocover')) return null
  return src.startsWith('http') ? src : `${BASE}/${src.replace(/^\//, '')}`
}

const td = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
})

// Strip author-note asides from chapter text before conversion
td.addRule('remove-author-note', {
  filter: (node) => {
    const el = node as { nodeName?: string; className?: string }
    return el.nodeName === 'DIV' && /author.*note/i.test(el.className ?? '')
  },
  replacement: () => '',
})

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })
  if (!res.ok) throw new Error(`royalroad: ${url} returned ${res.status}`)
  return res.text()
}

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
  author: string | null
  chapter_count: number
  tags: string | null
}

// source_id = fiction numeric ID (e.g. "21220")
// Fiction URL: https://www.royalroad.com/fiction/<id> → redirects to /<id>/<slug>
// Chapter source_id = relative path: "fiction/<fid>/<fslug>/chapter/<cid>/<cslug>"

export async function search(query: string): Promise<SearchResult[]> {
  const url = `${BASE}/fictions/search?title=${encodeURIComponent(query)}&orderBy=relevance`
  const html = await fetchHtml(url)
  const $ = cheerio.load(html)
  const results: SearchResult[] = []

  $('.fiction-list-item').each((_, el) => {
    const $el = $(el)
    const linkEl = $el.find('h2.fiction-title a').first()
    const href = linkEl.attr('href') ?? ''
    // href = "/fiction/21220/fiction-slug"
    const match = href.match(/\/fiction\/(\d+)/)
    if (!match) return

    const id = match[1]!
    const title = linkEl.text().trim()
    if (!title) return

    const cover = coverUrl($el.find('img[data-type="cover"]').first().attr('src'))
    const desc = $el.find(`#description-${id}`).text().trim() || null
    const tags = $el.find('.tags .label')
      .map((_, t) => $(t).text().trim())
      .get()
      .filter(Boolean)
      .join(', ') || null

    // Author isn't on the search page — fetched via meta() at add time.
    results.push({ id, title, description: desc, cover_url: cover, status: 'ongoing', author: null, year: null, tags })
  })

  return results
}

export async function chapters(fictionId: string): Promise<ChapterResult[]> {
  const $ = cheerio.load(await fetchHtml(`${BASE}/fiction/${fictionId}`))
  const results: ChapterResult[] = []

  $('table#chapters tbody tr, .chapter-row').each((i, el) => {
    const linkEl = $(el).find('a[href*="/chapter/"]').first()
    const href = linkEl.attr('href') ?? ''
    if (!href.includes('/chapter/')) return
    const title = linkEl.text().trim() || null
    results.push({
      source_id: href.slice(1),  // "fiction/<fid>/<slug>/chapter/<cid>/<slug>"
      number: chapterNumber(title, href) ?? NaN,  // NaN = unnumbered, resolved below
      title,
      chapter_format: 'text',
    })
  })

  // No numbers anywhere ("Prologue", "The Beginning"…) → plain list position.
  if (results.every((c) => Number.isNaN(c.number))) return results.map((c, i) => ({ ...c, number: i + 1 }))
  // Otherwise an unnumbered entry ("Book 5 Recap") sits just after its predecessor
  // (+0.01) — list position could collide with a real chapter of that number, and
  // chapters dedup by number.
  let prev = 0
  for (const c of results) {
    if (Number.isNaN(c.number)) c.number = Math.round((prev + 0.01) * 100) / 100
    prev = c.number
  }
  return results
}

// STUB fictions (chapters removed after publishing) keep e.g. 1–8 then 1216+,
// so position ≠ chapter number. Parse "Chapter 1389" from the title, then the
// slug ("chapter-1389-antechamber"); unnumbered entries are resolved in chapters().
// Lettered parts ("Chapter 2.A", slug "chapter-2a") → 2.1, 2.2, … so each part
// stays a distinct chapter.
const CHAPTER_NUM = /chapter[-\s]*(\d+(?:\.\d+)?)(?:\.?([a-i])\b)?/i
function chapterNumber(title: string | null, href: string): number | null {
  const slug = href.split('/chapter/')[1]?.split('/')[1] ?? ''
  const m = (title ?? '').match(CHAPTER_NUM) ?? slug.match(CHAPTER_NUM)
  if (!m) return null
  const part = m[2] ? (m[2].toLowerCase().charCodeAt(0) - 96) / 10 : 0
  return Math.round((Number(m[1]) + part) * 100) / 100
}

export async function chapterText(chapterPath: string): Promise<string> {
  // chapterPath = "fiction/21220/wandering-inn/chapter/1234567/chapter-title"
  const url = `${BASE}/${chapterPath}`
  const html = await fetchHtml(url)
  const $ = cheerio.load(html)

  const contentEl = $('.chapter-inner.chapter-content, .chapter-content').first()
  if (!contentEl.length) throw new Error(`royalroad: no chapter content found at ${url}`)

  // Remove ads and spoiler toggles before converting
  contentEl.find('.ads-container, .spoiler-toggle, script, style').remove()

  // Royal Road injects anti-piracy lines ("…report the violation") in elements
  // whose random class an inline <style> sets to display:none.
  const hidden = $('style').text().matchAll(/\.([\w-]+)\s*\{[^}]*display:\s*none/g)
  for (const [, cls] of hidden) contentEl.find(`.${cls}`).remove()

  const markdown = td.turndown(contentEl.html() ?? '')
  return markdown
}

export async function meta(fictionId: string): Promise<MetaResult> {
  const $ = cheerio.load(await fetchHtml(`${BASE}/fiction/${fictionId}`))

  const tags = $('.tags .label')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean)
    .join(', ') || null

  return {
    description: $('.description .hidden-content').text().trim() || null,
    cover_url: coverUrl($('img[data-type="cover"]').first().attr('src')),
    author: $('meta[property="books:author"]').attr('content')?.trim() || null,
    chapter_count: $('table#chapters tbody tr, .chapter-row').length,
    tags,
  }
}
