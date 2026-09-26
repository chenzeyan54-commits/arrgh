// Behavior tests for ADR 0031 new plugins.
// Each suite stubs fetch with minimal HTML/JSON fixtures and asserts on output shapes.
// Tests are RED until plugin dirs are created; GREEN after implementation.
// Fixtures define the parsing contract — implementations must match these structures.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// ── Imports (fail until plugin dirs exist) ────────────────────────────────────

import * as asurascans   from '../../plugins/asurascans/src/index'
import * as wuxiaworld   from '../../plugins/wuxiaworld/src/index'
import * as manga18fx    from '../../plugins/manga18fx/src/index'
import * as royalroad    from '../../plugins/royalroad/src/index'
import * as nhentai       from '../../plugins/nhentai/src/index'
import * as novelfullnet from '../../plugins/novelfullnet/src/index'
import * as novelupdates from '../../plugins/novelupdates/src/index'
import { parseSearchHtml as nuParseSearchHtml } from '../../plugins/novelupdates/src/novelupdates'

// ── Fixture helpers ───────────────────────────────────────────────────────────

function mockFetch(responses: Record<string, { ok?: boolean; text?: string; json?: unknown }>) {
  return vi.fn().mockImplementation((url: string) => {
    const key = Object.keys(responses).find((k) => url.toString().includes(k))
    const resp = key ? responses[key] : { ok: false, text: '', json: {} }
    return Promise.resolve({
      ok: resp.ok ?? true,
      text: async () => resp.text ?? '',
      json: async () => resp.json ?? {},
    })
  })
}

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { vi.unstubAllGlobals() })

// ═══════════════════════════════════════════════════════════════════════════════
// AsuraScans
// ═══════════════════════════════════════════════════════════════════════════════

const ASURA_SEARCH_HTML = `
<div class="grid grid-cols-2 gap-3 p-4">
  <div class="group/tipmanga">
    <a href="/comics/solo-leveling-abc123" class="slide-link block">
      <img src="https://gg.asuracomic.net/storage/covers/solo-leveling.jpg" class="rounded" alt="Solo Leveling">
      <div class="col-span-8 flex flex-col">
        <span class="block font-bold text-white">Solo Leveling</span>
        <span class="text-xs">Manhwa</span>
        <span class="text-xs text-[#ff7e2e]">ONGOING</span>
      </div>
    </a>
  </div>
  <div class="group/tipmanga">
    <a href="/comics/return-of-the-mount-hua-sect-xyz789" class="slide-link block">
      <img src="https://gg.asuracomic.net/storage/covers/rmhs.jpg" class="rounded" alt="Return of the Mount Hua Sect">
      <div class="col-span-8 flex flex-col">
        <span class="block font-bold text-white">Return of the Mount Hua Sect</span>
        <span class="text-xs">Manhwa</span>
        <span class="text-xs text-[#ff7e2e]">ONGOING</span>
      </div>
    </a>
  </div>
</div>
`

const ASURA_CHAPTERS_HTML = `
<div class="scrollbar-thumb-themecolor overflow-y-auto">
  <div class="py-2 border-b flex items-center" data-num="180">
    <a href="https://asuracomic.net/series/solo-leveling-abc123/chapter/180">
      <span>Chapter 180</span>
    </a>
  </div>
  <div class="py-2 border-b flex items-center" data-num="179">
    <a href="https://asuracomic.net/series/solo-leveling-abc123/chapter/179">
      <span>Chapter 179</span>
    </a>
  </div>
</div>
`

const ASURA_PAGES_HTML = `
<div class="flex flex-col items-center">
  <img src="https://gg.asuracomic.net/storage/media/ch180/001.jpg" class="object-cover" alt="page 1">
  <img src="https://gg.asuracomic.net/storage/media/ch180/002.jpg" class="object-cover" alt="page 2">
  <img src="https://gg.asuracomic.net/storage/media/ch180/003.jpg" class="object-cover" alt="page 3">
</div>
`

describe('asurascans — search', () => {
  it('returns array with required fields', async () => {
    vi.stubGlobal('fetch', mockFetch({ 'asurascans': { text: ASURA_SEARCH_HTML } }))
    const results = await asurascans.search('solo leveling')
    expect(Array.isArray(results)).toBe(true)
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(r).toHaveProperty('id')
      expect(r).toHaveProperty('title')
      expect(r).toHaveProperty('cover_url')
      expect(r).toHaveProperty('status')
      expect(r).toHaveProperty('content_type')
    }
  })

  it('extracts id from series URL slug', async () => {
    vi.stubGlobal('fetch', mockFetch({ 'asurascans': { text: ASURA_SEARCH_HTML } }))
    const [first] = await asurascans.search('solo leveling')
    expect(first.id).toBe('solo-leveling-abc123')
    expect(first.title).toBe('Solo Leveling')
    expect(first.content_type).toBe('manhwa')
  })

  it('status is lowercase normalised', async () => {
    vi.stubGlobal('fetch', mockFetch({ 'asurascans': { text: ASURA_SEARCH_HTML } }))
    const [first] = await asurascans.search('solo leveling')
    expect(first.status).toBe('ongoing')
  })

  it('returns empty array when no results', async () => {
    vi.stubGlobal('fetch', mockFetch({ 'asurascans': { text: '<div></div>' } }))
    const results = await asurascans.search('nothing')
    expect(results).toEqual([])
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', mockFetch({ 'asurascans': { ok: false } }))
    await expect(asurascans.search('test')).rejects.toThrow()
  })
})

describe('asurascans — chapters', () => {
  it('returns chapters with source_id and number', async () => {
    vi.stubGlobal('fetch', mockFetch({ 'asurascans': { text: ASURA_CHAPTERS_HTML } }))
    const chapters = await asurascans.chapters('solo-leveling-abc123')
    expect(Array.isArray(chapters)).toBe(true)
    expect(chapters.length).toBeGreaterThan(0)
    for (const ch of chapters) {
      expect(ch).toHaveProperty('source_id')
      expect(ch).toHaveProperty('number')
      expect(typeof ch.number).toBe('number')
    }
  })

  it('source_id is the chapter URL path', async () => {
    vi.stubGlobal('fetch', mockFetch({ 'asurascans': { text: ASURA_CHAPTERS_HTML } }))
    const chapters = await asurascans.chapters('solo-leveling-abc123')
    const ch180 = chapters.find((c) => c.number === 180)
    expect(ch180).toBeDefined()
    expect(ch180!.source_id).toContain('solo-leveling-abc123')
  })
})

describe('asurascans — pages', () => {
  it('returns image URL array', async () => {
    vi.stubGlobal('fetch', mockFetch({ 'asurascans': { text: ASURA_PAGES_HTML } }))
    const pages = await asurascans.pages('solo-leveling-abc123/chapter/180')
    expect(Array.isArray(pages)).toBe(true)
    expect(pages.length).toBe(3)
    for (const p of pages) {
      expect(typeof p).toBe('string')
      expect(p.startsWith('http')).toBe(true)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// WuxiaWorld
// ═══════════════════════════════════════════════════════════════════════════════

const WUXIA_SEARCH_JSON = {
  items: [
    {
      id: 12,
      slug: 'swallowed-star',
      name: 'Swallowed Star',
      coverUrl: 'https://cdn.wuxiaworld.com/covers/swallowed-star.jpg',
      status: 0,
      authorName: 'I Eat Tomatoes',
      tags: ['Chinese', 'Completed'],
      genres: ['Sci-fi', 'Action'],
    },
    {
      id: 34,
      slug: 'martial-world',
      name: 'Martial World',
      coverUrl: 'https://cdn.wuxiaworld.com/covers/martial-world.jpg',
      status: 0,
      authorName: 'Cocooned Cow',
      tags: ['Chinese', 'Completed'],
      genres: ['Martial Arts'],
    },
  ],
}

// chapters() parses embedded React Query state from the chapters page HTML.
// Both groups use fromChapterNumber.units=1 — matching WuxiaWorld's real decimal format
// where all groups report units=1 (chapters are sub-1.0 decimals internally).
// The implementation must use cumulative numbering, not fromChapterNumber.units + i.
const WUXIA_CHAPTERS_HTML = `<html><body><script>
window.__REACT_QUERY_STATE__ = {"queries":[{"queryKey":["novel","swallowed-star",null],"state":{"data":{"item":{
  "chapterInfo":{
    "chapterCount":{"value":3},
    "firstChapter":{"slug":"swallowed-star-chapter-1","name":"Chapter 1 — The Swift as Lightning Technique","offset":1},
    "chapterGroups":[
      {"id":1,"title":"Volume 1","order":1,
       "fromChapterNumber":{"units":1,"nanos":0},"toChapterNumber":{"units":1,"nanos":999999900},
       "counts":{"total":2,"advance":0,"normal":2},"chapterList":[]},
      {"id":2,"title":"Volume 2","order":2,
       "fromChapterNumber":{"units":1,"nanos":0},"toChapterNumber":{"units":1,"nanos":999999900},
       "counts":{"total":1,"advance":0,"normal":1},"chapterList":[]}
    ]
  }
}}}}]};
</script></body></html>`

const WUXIA_CHAPTER_HTML = `
<div class="chapter-content">
  <p>Luo Feng, a young man living in Jiangnan base city…</p>
  <p>He had awakened as a genetic warrior, able to breathe underwater.</p>
</div>
`

describe('wuxiaworld — search', () => {
  it('returns array with required fields', async () => {
    vi.stubGlobal('fetch', mockFetch({ 'wuxiaworld': { json: WUXIA_SEARCH_JSON } }))
    const results = await wuxiaworld.search('swallowed star')
    expect(Array.isArray(results)).toBe(true)
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(r).toHaveProperty('id')
      expect(r).toHaveProperty('title')
      expect(r).toHaveProperty('cover_url')
      expect(r).toHaveProperty('status')
      expect(r).toHaveProperty('content_type')
      expect(r.content_type).toBe('novel')
    }
  })

  it('maps API response fields', async () => {
    vi.stubGlobal('fetch', mockFetch({ 'wuxiaworld': { json: WUXIA_SEARCH_JSON } }))
    const [first] = await wuxiaworld.search('swallowed star')
    expect(first.id).toBe('swallowed-star')
    expect(first.title).toBe('Swallowed Star')
    expect(first.cover_url).toBe('https://cdn.wuxiaworld.com/covers/swallowed-star.jpg')
    expect(first.status.toLowerCase()).toBe('completed')
    expect(first.author).toBe('I Eat Tomatoes')
  })

  it('returns empty array when items is empty', async () => {
    vi.stubGlobal('fetch', mockFetch({ 'wuxiaworld': { json: { items: [], total: 0 } } }))
    const results = await wuxiaworld.search('xyzzy')
    expect(results).toEqual([])
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', mockFetch({ 'wuxiaworld': { ok: false } }))
    await expect(wuxiaworld.search('test')).rejects.toThrow()
  })
})

describe('wuxiaworld — chapters', () => {
  it('returns all chapters from chapterGroups count', async () => {
    vi.stubGlobal('fetch', mockFetch({ 'wuxiaworld': { text: WUXIA_CHAPTERS_HTML } }))
    const chapters = await wuxiaworld.chapters('swallowed-star')
    expect(Array.isArray(chapters)).toBe(true)
    // fixture has chapterCount=3 across 2 groups (2+1)
    expect(chapters.length).toBe(3)
    for (const ch of chapters) {
      expect(ch).toHaveProperty('source_id')
      expect(ch).toHaveProperty('number')
      expect(typeof ch.number).toBe('number')
    }
  })

  it('chapter 1 source_id uses real slug from firstChapter', async () => {
    vi.stubGlobal('fetch', mockFetch({ 'wuxiaworld': { text: WUXIA_CHAPTERS_HTML } }))
    const [ch1] = await wuxiaworld.chapters('swallowed-star')
    expect(ch1.source_id).toBe('swallowed-star/swallowed-star-chapter-1')
    expect(ch1.number).toBe(1)
    expect(ch1.title).toBe('Chapter 1 — The Swift as Lightning Technique')
  })

  it('chapters 2+ use numeric source_id {novelSlug}/chapter/{N}', async () => {
    vi.stubGlobal('fetch', mockFetch({ 'wuxiaworld': { text: WUXIA_CHAPTERS_HTML } }))
    const chapters = await wuxiaworld.chapters('swallowed-star')
    expect(chapters[1].source_id).toBe('swallowed-star/chapter/2')
    expect(chapters[2].source_id).toBe('swallowed-star/chapter/3')
  })

  it('volume set to chapterGroup order', async () => {
    vi.stubGlobal('fetch', mockFetch({ 'wuxiaworld': { text: WUXIA_CHAPTERS_HTML } }))
    const chapters = await wuxiaworld.chapters('swallowed-star')
    // group 1 covers chapters 1-2 (order=1), group 2 covers chapter 3 (order=2)
    expect(chapters[0].volume).toBe(1)
    expect(chapters[1].volume).toBe(1)
    expect(chapters[2].volume).toBe(2)
  })

  it('returns empty array when chapterInfo missing', async () => {
    const emptyHtml = `<html><body><script>window.__REACT_QUERY_STATE__ = {"queries":[]};</script></body></html>`
    vi.stubGlobal('fetch', mockFetch({ 'wuxiaworld': { text: emptyHtml } }))
    const chapters = await wuxiaworld.chapters('swallowed-star')
    expect(chapters).toEqual([])
  })
})

describe('wuxiaworld — chapterText', () => {
  it('returns string content', async () => {
    vi.stubGlobal('fetch', mockFetch({ 'wuxiaworld': { text: WUXIA_CHAPTER_HTML } }))
    const text = await wuxiaworld.chapterText('swallowed-star/swallowed-star-chapter-1')
    expect(typeof text).toBe('string')
    expect(text.length).toBeGreaterThan(0)
  })

  it('extracts chapter text content', async () => {
    vi.stubGlobal('fetch', mockFetch({ 'wuxiaworld': { text: WUXIA_CHAPTER_HTML } }))
    const text = await wuxiaworld.chapterText('swallowed-star/swallowed-star-chapter-1')
    expect(text).toContain('Luo Feng')
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', mockFetch({ 'wuxiaworld': { ok: false } }))
    await expect(wuxiaworld.chapterText('test/test-chapter-1')).rejects.toThrow()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// NovelUpdates (metadata-only — uses CloakBrowser; fake getBrowser for the URL test)
// ═══════════════════════════════════════════════════════════════════════════════

// Live capture 2026-09-26: https://www.novelupdates.com/series-finder/?sf=1&sh=reverend+insanity
// (spec 022). Trimmed to one .search_main_box_nu row; genre list + long synopsis cut.
const NU_SEARCH_HTML = `
<html><body><div class="w-blog-content">
<div class="search_main_box_nu" dp="yes"><div class="search_img_nu" dp="yes"><img dp="yes" src="https://cdn.novelupdates.com/imgmid/series_6780.jpg"><div dp="yes" class="search_stars"><i class="fa fa-star"></i><i class="fa fa-star"></i><i class="fa fa-star"></i><i class="fa fa-star"></i><i class="fa fa-star-half-o"></i></div>
			<div dp="yes" class="search_ratings"><span class="orgcn" style="font-weight: bold;">CN</span> (4.3)</div>
			</div><div class="search_body_nu"><div class="search_title"><span id="sid6780" class="rl_icons_en"></span><a href="https://www.novelupdates.com/series/reverend-insanity/">Reverend Insanity</a></div><div class="search_stats"><span class="ss_desk"><i title="Chapter Count" style="padding-left: 0px;" class="fa fa-list-alt pad" aria-hidden="true"></i> 121 Chapters</span><span class="ss_desk"><i title="Last Updated" class="fa fa-calendar pad" aria-hidden="true"></i> 02-01-2026</span></div><div class="search_genre"><a class="gennew search" gid="8" href="https://www.novelupdates.com/genre/action/" title="View All Action Related Series">Action</a></div>Human beings are the very spirit of all life, while Gu embody the essence of heaven and earth.<span class="dots">... </span></div></div>
</div></body></html>
`

describe('novelupdates — parseSearchHtml (live Series Finder capture)', () => {
  it('extracts id (slug), title, cover_url, content_type', () => {
    const results = nuParseSearchHtml(NU_SEARCH_HTML)
    expect(results.length).toBe(1)
    const [ri] = results
    expect(ri.id).toBe('reverend-insanity')
    expect(ri.title).toBe('Reverend Insanity')
    expect(ri.cover_url).toContain('cdn.novelupdates.com')
    expect(ri.content_type).toBe('novel')
  })

  it('description is the synopsis — not title, stats or genres', () => {
    const d = nuParseSearchHtml(NU_SEARCH_HTML)[0].description!
    expect(d).toMatch(/^Human beings are the very spirit of all life/)
    expect(d).not.toMatch(/Chapters|Action|Reverend Insanity|\.\.\./)
  })

  it('description includes the collapsed "more>>" remainder', () => {
    const html = NU_SEARCH_HTML.replace('<span class="dots">... </span>',
      '<span class="dots">... </span><span class="morelink list" href="#" onclick="showtext(this); return false;">more&gt;&gt;</span><span class="testhide" style="display:none"><p style="margin-top:-5px;"></p>\nWhen one’s worldview, values, and philosophy become twisted, they are no longer human but demon reborn.<span class="morelink list" href="#" onclick="hidetext(this); return false;"> &lt;&lt;less</span></span>')
    const d = nuParseSearchHtml(html)[0].description!
    expect(d).toContain('they are no longer human but demon reborn.')
    expect(d).not.toMatch(/more>>|<<less/)
  })

  it('status is unknown (Series Finder rows carry no status)', () => {
    expect(nuParseSearchHtml(NU_SEARCH_HTML)[0].status).toBe('unknown')
  })

  it('returns empty array for empty HTML', () => {
    expect(nuParseSearchHtml('<html><body></body></html>')).toEqual([])
  })
})

describe('novelupdates — search URL (spec 022)', () => {
  it('requests the Series Finder URL and parses the page', async () => {
    const visited: string[] = []
    const page = {
      goto: async (url: string) => { visited.push(url) },
      content: async () => NU_SEARCH_HTML,
      close: async () => {},
    }
    const browser = {
      isConnected: () => true,
      newContext: async () => ({ newPage: async () => page, close: async () => {} }),
    }
    novelupdates.init({ getBrowser: async () => browser, logger: console })
    const results = await novelupdates.search('reverend insanity')
    expect(visited).toEqual(['https://www.novelupdates.com/series-finder/?sf=1&sh=reverend%20insanity'])
    expect(results).toHaveLength(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Manga18fx
// ═══════════════════════════════════════════════════════════════════════════════

// Search results: WordPress site, anchors with /manga/{slug} hrefs containing cover imgs
const MANGA18FX_SEARCH_HTML = `
<html><body>
<div class="search-results">
  <div class="item">
    <a href="/manga/tower-of-god">
      <img src="https://manga18fx.com/webtoon/tower-of-godm.jpg" alt="Tower of God">
    </a>
    <h3><a href="/manga/tower-of-god">Tower of God</a></h3>
  </div>
  <div class="item">
    <a href="/manga/solo-leveling">
      <img src="https://manga18fx.com/webtoon/solo-levelingm.jpg" alt="Solo Leveling">
    </a>
    <h3><a href="/manga/solo-leveling">Solo Leveling</a></h3>
  </div>
</div>
</body></html>
`

// Manga detail page: static chapter list
const MANGA18FX_DETAIL_HTML = `
<html><body>
<h1>Tower of God</h1>
<div class="chapter-list">
  <ul>
    <li><a href="/manga/tower-of-god/chapter-1">Chapter 1</a></li>
    <li><a href="/manga/tower-of-god/chapter-2">Chapter 2</a></li>
    <li><a href="/manga/tower-of-god/chapter-100">Chapter 100</a></li>
  </ul>
</div>
</body></html>
`

// Real manga18fx detail pages include a "Most Popular Manga" sidebar with chapter links
// from OTHER series. This fixture replicates that — the bug was: a[href*="/chapter-"]
// picked up all cross-series chapter links, contaminating the chapter list.
const MANGA18FX_DETAIL_WITH_SIDEBAR_HTML = `
<html><body>
<h1>Moby Dick</h1>
<div class="chapter-list">
  <ul>
    <li><a href="/manga/moby-dick/chapter-93">Chapter 93</a></li>
    <li><a href="/manga/moby-dick/chapter-92">Chapter 92</a></li>
    <li><a href="/manga/moby-dick/chapter-1">Chapter 1</a></li>
  </ul>
</div>
<div class="most-popular">
  <h3>Most Popular Manga</h3>
  <a href="/manga/secret-class/chapter-307">Chapter 307</a>
  <a href="/manga/secret-class/chapter-306">Chapter 306</a>
  <a href="/manga/announcer/chapter-10">Chapter 10</a>
  <a href="/manga/just-right-there/chapter-61">Chapter 61</a>
</div>
</body></html>
`

// Chapter page: <img src="https://img01.manga18fx.com/uploads/...">
const MANGA18FX_CHAPTER_HTML = `
<html><body>
<div class="reading-content">
  <img src="https://img01.manga18fx.com/uploads/4337/1/1-abc.jpg">
  <img src="https://img01.manga18fx.com/uploads/4337/1/2-abc.jpg">
  <img src="https://img01.manga18fx.com/uploads/4337/1/3-abc.jpg">
</div>
</body></html>
`

// Mixed lazy+eager: first 2 imgs have only src (eager), last 3 have placeholder src + data-src (lazy)
const MANGA18FX_CHAPTER_MIXED_HTML = `
<html><body>
<div class="reading-content">
  <img src="https://img01.manga18fx.com/uploads/4337/200/1-abc.jpg">
  <img src="https://img01.manga18fx.com/uploads/4337/200/2-abc.jpg">
  <img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" data-src="https://img01.manga18fx.com/uploads/4337/200/3-abc.jpg">
  <img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" data-src="https://img01.manga18fx.com/uploads/4337/200/4-abc.jpg">
  <img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" data-src="https://img01.manga18fx.com/uploads/4337/200/5-abc.jpg">
</div>
</body></html>
`

// Lazy-load variant: src is a placeholder, real URL is in data-src
const MANGA18FX_CHAPTER_LAZY_HTML = `
<html><body>
<div class="reading-content">
  <img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" data-src="https://img01.manga18fx.com/uploads/4337/161/1-abc.jpg">
  <img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" data-src="https://img01.manga18fx.com/uploads/4337/161/2-abc.jpg">
  <img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" data-src="https://img01.manga18fx.com/uploads/4337/161/3-abc.jpg">
</div>
</body></html>
`

describe('manga18fx', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.unstubAllGlobals() })

  describe('search', () => {
    it('returns results with id and title', async () => {
      vi.stubGlobal('fetch', mockFetch({ '/search?q=': { text: MANGA18FX_SEARCH_HTML } }))
      const results = await manga18fx.search('tower of god')
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results[0].id).toBe('tower-of-god')
      expect(results[0].title).toBe('Tower of God')
    })

    it('extracts slug as id from /manga/{slug} href', async () => {
      vi.stubGlobal('fetch', mockFetch({ '/search?q=': { text: MANGA18FX_SEARCH_HTML } }))
      const results = await manga18fx.search('test')
      for (const r of results) {
        expect(r.id).not.toContain('/')
        expect(r.id).not.toContain('manga')
      }
    })

    it('sets content_type to manhwa', async () => {
      vi.stubGlobal('fetch', mockFetch({ '/search?q=': { text: MANGA18FX_SEARCH_HTML } }))
      const results = await manga18fx.search('test')
      for (const r of results) expect(r.content_type).toBe('manhwa')
    })

    it('includes cover_url', async () => {
      vi.stubGlobal('fetch', mockFetch({ '/search?q=': { text: MANGA18FX_SEARCH_HTML } }))
      const results = await manga18fx.search('test')
      expect(results[0].cover_url).toContain('manga18fx.com')
    })

    it('deduplicates results by slug', async () => {
      const dupHtml = MANGA18FX_SEARCH_HTML.replace(
        '<div class="item">',
        '<div class="item">' + MANGA18FX_SEARCH_HTML.split('<div class="item">')[1].split('</div>')[0] + '</div><div class="item">',
      )
      vi.stubGlobal('fetch', mockFetch({ '/search?q=': { text: dupHtml } }))
      const results = await manga18fx.search('test')
      const ids = results.map(r => r.id)
      expect(ids.length).toBe(new Set(ids).size)
    })

    it('calls /search?q= endpoint (not /?s= WordPress fallback)', async () => {
      // This test exists to catch search URL regressions. The plugin used /?s= at first
      // (wrong) and behavior tests passed because mock and impl used the same wrong URL.
      // Asserting the actual URL called prevents that class of silent mismatch.
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true, text: async () => MANGA18FX_SEARCH_HTML,
      })
      vi.stubGlobal('fetch', fetchSpy)
      await manga18fx.search('Tower of God')
      const calledUrl = fetchSpy.mock.calls[0][0] as string
      expect(calledUrl).toContain('/search?q=')
      expect(calledUrl).not.toContain('/?s=')
    })

    it('returns empty array on fetch error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
      const results = await manga18fx.search('test').catch(() => [])
      expect(Array.isArray(results)).toBe(true)
    })
  })

  describe('chapters', () => {
    it('extracts chapter numbers from static HTML list', async () => {
      vi.stubGlobal('fetch', mockFetch({ '/manga/tower-of-god': { text: MANGA18FX_DETAIL_HTML } }))
      const chapters = await manga18fx.chapters('tower-of-god')
      expect(chapters.length).toBe(3)
      expect(chapters.map(c => c.number)).toEqual([1, 2, 100])
    })

    it('source_id is the chapter URL path', async () => {
      vi.stubGlobal('fetch', mockFetch({ '/manga/tower-of-god': { text: MANGA18FX_DETAIL_HTML } }))
      const chapters = await manga18fx.chapters('tower-of-god')
      expect(chapters[0].source_id).toContain('/chapter-1')
    })

    it('results sorted ascending by number', async () => {
      vi.stubGlobal('fetch', mockFetch({ '/manga/tower-of-god': { text: MANGA18FX_DETAIL_HTML } }))
      const chapters = await manga18fx.chapters('tower-of-god')
      for (let i = 1; i < chapters.length; i++)
        expect(chapters[i].number).toBeGreaterThan(chapters[i - 1].number)
    })

    it('does not include chapter links from sidebar/popular sections of other series', async () => {
      // Regression: a[href*="/chapter-"] picked up Secret Class chapter-307/306 from the
      // "Most Popular Manga" sidebar, contaminating unrelated titles with wrong chapters.
      vi.stubGlobal('fetch', mockFetch({ '/manga/moby-dick': { text: MANGA18FX_DETAIL_WITH_SIDEBAR_HTML } }))
      const chapters = await manga18fx.chapters('moby-dick')
      const nums = chapters.map(c => c.number)
      expect(nums).toEqual([1, 92, 93])
      expect(nums).not.toContain(306)
      expect(nums).not.toContain(307)
    })
  })

  describe('pages', () => {
    it('returns image URLs from chapter page', async () => {
      vi.stubGlobal('fetch', mockFetch({ '/manga/tower-of-god/chapter-1': { text: MANGA18FX_CHAPTER_HTML } }))
      const pages = await manga18fx.pages('/manga/tower-of-god/chapter-1')
      expect(pages.length).toBe(3)
      expect(pages[0]).toContain('img01.manga18fx.com')
    })

    it('all returned URLs start with https', async () => {
      vi.stubGlobal('fetch', mockFetch({ '/manga/tower-of-god/chapter-1': { text: MANGA18FX_CHAPTER_HTML } }))
      const pages = await manga18fx.pages('/manga/tower-of-god/chapter-1')
      for (const p of pages) expect(p).toMatch(/^https:\/\//)
    })

    it('extracts URLs from data-src when site uses lazy loading (src is placeholder)', async () => {
      vi.stubGlobal('fetch', mockFetch({ '/manga/everything-is-agreed-01/chapter-161': { text: MANGA18FX_CHAPTER_LAZY_HTML } }))
      const pages = await manga18fx.pages('/manga/everything-is-agreed-01/chapter-161')
      expect(pages.length).toBe(3)
      expect(pages[0]).toContain('img01.manga18fx.com')
      expect(pages[0]).not.toContain('data:image')
    })

    it('returns data-src value, not placeholder src, for lazy-loaded images', async () => {
      vi.stubGlobal('fetch', mockFetch({ '/manga/everything-is-agreed-01/chapter-161': { text: MANGA18FX_CHAPTER_LAZY_HTML } }))
      const pages = await manga18fx.pages('/manga/everything-is-agreed-01/chapter-161')
      for (const p of pages) expect(p).toMatch(/^https:\/\/img01\.manga18fx\.com\/uploads\//)
    })

    it('returns all CDN URLs from mixed lazy+eager document (some data-src, some src-only)', async () => {
      vi.stubGlobal('fetch', mockFetch({ '/manga/test/chapter-200': { text: MANGA18FX_CHAPTER_MIXED_HTML } }))
      const pages = await manga18fx.pages('/manga/test/chapter-200')
      expect(pages.length).toBe(5)
      for (const p of pages) expect(p).toMatch(/^https:\/\/img01\.manga18fx\.com\/uploads\//)
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Royal Road (ADR 0034) — fixtures trimmed from live royalroad.com, 2026-09-25
// ═══════════════════════════════════════════════════════════════════════════════

const RR_SEARCH_HTML = `
<div class="row fiction-list-item">
<figure class="col-sm-2 col-md-3 col-lg-2 text-center">
<a href="/fiction/36049/the-primal-hunter">
<img data-type="cover" onLoad="this.dataset.loaded = 1" alt="The Primal Hunter" src="https://www.royalroadcdn.com/public/covers-full/36049-the-primal-hunter.jpg?time=1641580443" />
</a>
</figure>
<div class="col-sm-10 col-md-8 col-lg-9 col-xs-12 search-content">
<h2 class="fiction-title">
<a href="/fiction/36049/the-primal-hunter" class="font-red-sunglo bold">The Primal Hunter</a>
</h2>
<div class="margin-bottom-10">
<span class="label label-default label-sm bg-blue-hoki">Original</span>
<span class="tags">
<a class="label label-default label-sm bg-blue-dark fiction-tag" href="/fictions/search?tagsAdd=litrpg">LitRPG</a>
<a class="label label-default label-sm bg-blue-dark fiction-tag" href="/fictions/search?tagsAdd=progression">Progression</a>
</span>
</div>
<div id="description-36049" class="margin-top-10 col-xs-12" style="display: none">
<p>On just another normal Monday, the world changed.</p>
<p>Perhaps… Jake was born for this kind of world, to begin with.</p>
</div>
</div>
</div>
`

const RR_FICTION_HTML = `
<html><head><meta property="books:author" content="Zogarth"/></head><body>
<div class="cover-art-container">
<img class="thumbnail inline-block" data-type="cover" alt="The Primal Hunter" src="https://www.royalroadcdn.com/public/covers-full/36049-the-primal-hunter.jpg?time=1641580443" />
</div>
<div class="description">
<input type="checkbox" value="" id="showMore"/>
<div class="hidden-content">
<p>On just another normal Monday, the world changed.</p>
</div>
</div>
<div class="tags"><a class="label fiction-tag">LitRPG</a><a class="label fiction-tag">Progression</a></div>
<table class="table no-border" id="chapters" data-chapters="3">
<tbody>
<tr data-url="/fiction/36049/the-primal-hunter/chapter/557051/chapter-1-another-monday-morning" class="chapter-row">
<td><a href="/fiction/36049/the-primal-hunter/chapter/557051/chapter-1-another-monday-morning">
Chapter 1 - Another Monday morning
</a></td>
<td class="text-right"><a href="/fiction/36049/the-primal-hunter/chapter/557051/chapter-1-another-monday-morning"><time>6 years</time> ago</a></td>
</tr>
<tr data-url="/fiction/36049/the-primal-hunter/chapter/557071/chapter-2-introduction" class="chapter-row">
<td><a href="/fiction/36049/the-primal-hunter/chapter/557071/chapter-2-introduction">
Chapter 2 - Introduction
</a></td>
</tr>
<tr data-url="/fiction/36049/the-primal-hunter/chapter/4008007/chapter-1389-antechamber" class="chapter-row">
<td><a href="/fiction/36049/the-primal-hunter/chapter/4008007/chapter-1389-antechamber">
Chapter 1389 - Antechamber
</a></td>
</tr>
</tbody>
</table>
</body></html>
`

const RR_FICTION_UNNUMBERED_HTML = `
<table id="chapters"><tbody>
<tr class="chapter-row"><td><a href="/fiction/1/x/chapter/10/prologue">Prologue</a></td></tr>
<tr class="chapter-row"><td><a href="/fiction/1/x/chapter/11/the-beginning">The Beginning</a></td></tr>
</tbody></table>
`

// Live 2026-09-26: fiction 29358 (Dungeon Crawler Carl Book 6, a STUB) — its full chapter table.
const RR_FICTION_LETTERED_HTML = `
<table id="chapters"><tbody>
<tr class="chapter-row"><td><a href="/fiction/29358/dungeon-crawler-carl-book-6-the-ghosts-of-earth/chapter/442507/chapter-1">Chapter 1</a></td></tr>
<tr class="chapter-row"><td><a href="/fiction/29358/dungeon-crawler-carl-book-6-the-ghosts-of-earth/chapter/442714/chapter-2a">Chapter 2.A</a></td></tr>
<tr class="chapter-row"><td><a href="/fiction/29358/dungeon-crawler-carl-book-6-the-ghosts-of-earth/chapter/442757/chapter-2b">Chapter 2.B</a></td></tr>
<tr class="chapter-row"><td><a href="/fiction/29358/dungeon-crawler-carl-book-6-the-ghosts-of-earth/chapter/442823/chapter-2c">Chapter 2.C</a></td></tr>
<tr class="chapter-row"><td><a href="/fiction/29358/dungeon-crawler-carl-book-6-the-ghosts-of-earth/chapter/996461/book-5-recap">Book 5 Recap</a></td></tr>
<tr class="chapter-row"><td><a href="/fiction/29358/dungeon-crawler-carl-book-6-the-ghosts-of-earth/chapter/996463/book-6-prologue-chapter-198">Book 6, prologue (Chapter 198)</a></td></tr>
<tr class="chapter-row"><td><a href="/fiction/29358/dungeon-crawler-carl-book-6-the-ghosts-of-earth/chapter/996937/chapter-199">Chapter 199</a></td></tr>
</tbody></table>
`

const RR_CHAPTER_HTML = `
<html><head>
<style>
    .cjE2ZmJhOTE5NjU3ZDQ1NmFiYjQwNTRhMWMxMDAzYzk4{
        display: none;
        speak: never;
    }
</style>
</head><body>
<div class="chapter-inner chapter-content">
<p class="cnNlZDM3ZTI5ZjEzNjQxYzVhYmJlM2UwNzllY2JjZDU1">It was just another boring Monday morning.</p>
<span class="cjE2ZmJhOTE5NjU3ZDQ1NmFiYjQwNTRhMWMxMDAzYzk4"><br>The tale has been stolen; if detected on Amazon, report the violation.<br></span>
<p class="cnM2NDcwNjc3NjMxYzQxYmI5NTRkZTA4NzA4YjQxYWUy">Jake had always been a rather laid-back person.</p>
</div>
</body></html>
`

describe('royalroad', () => {
  describe('royalroad — search', () => {
    it('parses id, title, cover, description, tags', async () => {
      vi.stubGlobal('fetch', mockFetch({ 'royalroad.com/fictions/search': { text: RR_SEARCH_HTML } }))
      const [r] = await royalroad.search('the primal hunter')
      expect(r.id).toBe('36049')
      expect(r.title).toBe('The Primal Hunter')
      expect(r.cover_url).toBe('https://www.royalroadcdn.com/public/covers-full/36049-the-primal-hunter.jpg?time=1641580443')
      expect(r.description).toContain('On just another normal Monday')
      expect(r.tags).toContain('LitRPG')
      expect(r.author).toBeNull()
    })

    it('throws on non-OK response', async () => {
      vi.stubGlobal('fetch', mockFetch({ 'royalroad.com': { ok: false } }))
      await expect(royalroad.search('x')).rejects.toThrow()
    })

    // Live 2026-09-26: fictions without a cover (e.g. 186037 "The Arcane King")
    // serve src="/dist/img/nocover-new-min.png" — relative, and only a placeholder.
    it('no-cover placeholder → null cover_url', async () => {
      const html = RR_SEARCH_HTML.replace(/src="https:\/\/www\.royalroadcdn\.com[^"]*"/, 'src="/dist/img/nocover-new-min.png"')
      vi.stubGlobal('fetch', mockFetch({ 'royalroad.com/fictions/search': { text: html } }))
      const [r] = await royalroad.search('x')
      expect(r.cover_url).toBeNull()
    })

    it('other relative cover paths are made absolute', async () => {
      const html = RR_SEARCH_HTML.replace(/src="https:\/\/www\.royalroadcdn\.com[^"]*"/, 'src="/covers/36049.jpg"')
      vi.stubGlobal('fetch', mockFetch({ 'royalroad.com/fictions/search': { text: html } }))
      const [r] = await royalroad.search('x')
      expect(r.cover_url).toBe('https://www.royalroad.com/covers/36049.jpg')
    })
  })

  describe('royalroad — meta', () => {
    it('no-cover placeholder → null cover_url', async () => {
      const html = RR_FICTION_HTML.replace(/src="https:\/\/www\.royalroadcdn\.com[^"]*"/, 'src="/dist/img/nocover-new-min.png"')
      vi.stubGlobal('fetch', mockFetch({ '/fiction/36049': { text: html } }))
      expect((await royalroad.meta('36049')).cover_url).toBeNull()
    })

    it('reads author from books:author meta, plus description and cover', async () => {
      vi.stubGlobal('fetch', mockFetch({ '/fiction/36049': { text: RR_FICTION_HTML } }))
      const m = await royalroad.meta('36049')
      expect(m.author).toBe('Zogarth')
      expect(m.description).toContain('On just another normal Monday')
      expect(m.cover_url).toContain('royalroadcdn.com')
      expect(m.tags).toContain('LitRPG')
    })
  })

  describe('royalroad — chapters', () => {
    it('numbers stub chapters by their real number, not position', async () => {
      vi.stubGlobal('fetch', mockFetch({ '/fiction/36049': { text: RR_FICTION_HTML } }))
      const chs = await royalroad.chapters('36049')
      expect(chs.map((c) => c.number)).toEqual([1, 2, 1389])
      for (const c of chs) {
        expect(c.chapter_format).toBe('text')
        expect(c.source_id.startsWith('fiction/36049/')).toBe(true)
      }
    })

    // Lettered parts ("Chapter 2.A/B/C") used to all parse as 2 and collapse into one
    // chapter (chapters dedup by number); an unnumbered entry took its list position (5),
    // which can collide with a real chapter 5. 7 chapters became 5.
    it('keeps lettered parts and unnumbered entries distinct and in order', async () => {
      vi.stubGlobal('fetch', mockFetch({ '/fiction/29358': { text: RR_FICTION_LETTERED_HTML } }))
      const chs = await royalroad.chapters('29358')
      expect(chs.map((c) => c.number)).toEqual([1, 2.1, 2.2, 2.3, 2.31, 198, 199])
      expect(new Set(chs.map((c) => c.number)).size).toBe(7)
    })

    it('falls back to 1-based position when no number parses', async () => {
      vi.stubGlobal('fetch', mockFetch({ '/fiction/1': { text: RR_FICTION_UNNUMBERED_HTML } }))
      const chs = await royalroad.chapters('1')
      expect(chs.map((c) => c.number)).toEqual([1, 2])
    })
  })

  describe('royalroad — chapterText', () => {
    it('returns chapter markdown', async () => {
      vi.stubGlobal('fetch', mockFetch({ 'chapter/557051': { text: RR_CHAPTER_HTML } }))
      const md = await royalroad.chapterText('fiction/36049/the-primal-hunter/chapter/557051/chapter-1-another-monday-morning')
      expect(md).toContain('It was just another boring Monday morning.')
      expect(md).toContain('Jake had always been a rather laid-back person.')
    })

    it('strips hidden anti-piracy lines (class hidden via inline <style>)', async () => {
      vi.stubGlobal('fetch', mockFetch({ 'chapter/557051': { text: RR_CHAPTER_HTML } }))
      const md = await royalroad.chapterText('fiction/36049/the-primal-hunter/chapter/557051/chapter-1-another-monday-morning')
      expect(md).not.toContain('Amazon')
    })

    it('throws when chapter content is absent', async () => {
      vi.stubGlobal('fetch', mockFetch({ 'chapter/1': { text: '<div></div>' } }))
      await expect(royalroad.chapterText('fiction/1/x/chapter/1/y')).rejects.toThrow()
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// nhentai — direct v2 API first, CloakBrowser fallback on challenge (spec 023)
// ═══════════════════════════════════════════════════════════════════════════════

// Live captures 2026-09-26 (plain HTTP, no browser): search trimmed to 2 results,
// gallery trimmed to id/media_id/title/num_pages + 3 pages.
const NH_SEARCH_JSON = {
  "result": [
    {
      "id": 675926,
      "media_id": "4139058",
      "english_title": "[Tadaichidono (Haiboku)] Ground Berserker Minamoto no Raikou /  Ground Berserker Minamoto no Raikou ~ What Happened When I Started Using My Command Seal Willy Nillym on Minamoto no Raikou [SHORTENED] (FGO) [English] {Doujins.com}",
      "japanese_title": "[ただ一度の (敗北)] グラウンドバーサーカー源頼光~源頼光に軽率に令呪を使ってみた結果 (Fate/Grand Order) [DL版] [英訳]",
      "thumbnail": "galleries/4139058/thumb.webp",
      "thumbnail_width": 250,
      "thumbnail_height": 351,
      "num_pages": 28,
      "num_favorites": 2335,
      "tag_ids": [
        2937,
        12227,
        13989,
        16828,
        17249,
        33172,
        35605,
        35762,
        35763,
        50981,
        50982,
        51810,
        71442,
        122908
      ],
      "blacklisted": false
    },
    {
      "id": 653307,
      "media_id": "3962988",
      "english_title": "[Neko Plus] Berserk Grandma ENG",
      "japanese_title": "",
      "thumbnail": "galleries/3962988/thumb.webp",
      "thumbnail_width": 250,
      "thumbnail_height": 383,
      "num_pages": 41,
      "num_favorites": 924,
      "tag_ids": [
        2937,
        8653,
        12227,
        20905,
        33172,
        80718,
        90671,
        150201
      ],
      "blacklisted": false
    }
  ],
  "num_pages": 2,
  "per_page": 25,
  "total": 28
}
const NH_GALLERY_JSON = {
  "id": 675926,
  "media_id": "4139058",
  "title": {
    "english": "[Tadaichidono (Haiboku)] Ground Berserker Minamoto no Raikou /  Ground Berserker Minamoto no Raikou ~ What Happened When I Started Using My Command Seal Willy Nillym on Minamoto no Raikou [SHORTENED] (FGO) [English] {Doujins.com}",
    "japanese": "[ただ一度の (敗北)] グラウンドバーサーカー源頼光~源頼光に軽率に令呪を使ってみた結果 (Fate/Grand Order) [DL版] [英訳]",
    "pretty": "Ground Berserker Minamoto no Raikou /  Ground Berserker Minamoto no Raikou ~ What Happened When I Started Using My Command Seal Willy Nillym on Minamoto no Raikou"
  },
  "num_pages": 28,
  "pages": [
    {
      "number": 1,
      "path": "galleries/4139058/1.webp",
      "width": 1280,
      "height": 1797,
      "thumbnail": "galleries/4139058/1t.webp",
      "thumbnail_width": 200,
      "thumbnail_height": 281
    },
    {
      "number": 2,
      "path": "galleries/4139058/2.webp",
      "width": 1280,
      "height": 1864,
      "thumbnail": "galleries/4139058/2t.webp.webp",
      "thumbnail_width": 200,
      "thumbnail_height": 291
    },
    {
      "number": 3,
      "path": "galleries/4139058/3.webp",
      "width": 1280,
      "height": 1864,
      "thumbnail": "galleries/4139058/3t.webp",
      "thumbnail_width": 200,
      "thumbnail_height": 291
    }
  ]
}
const NH_SEARCH_URL = 'https://nhentai.net/api/v2/search?query=berserk%20language%3Aenglish&page=1'

function nhFetch(res: { status?: number; contentType?: string; body: unknown }) {
  const status = res.status ?? 200
  return vi.fn().mockImplementation(() => Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? res.contentType ?? 'application/json' : null) },
    json: async () => res.body,
    text: async () => (typeof res.body === 'string' ? res.body : JSON.stringify(res.body)),
  }))
}

function nhBrowser(evaluateResult: unknown) {
  const getBrowser = vi.fn().mockImplementation(async () => {
    const page = {
      goto: async () => {},
      content: async () => '',
      evaluate: async () => evaluateResult,
      close: async () => {},
    }
    return { isConnected: () => true, newContext: async () => ({ newPage: async () => page, close: async () => {} }) }
  })
  return getBrowser
}

const noBrowser = () => vi.fn().mockRejectedValue(new Error('browser must not be used'))

describe('nhentai — direct API (spec 023)', () => {
  it('search: direct v2 call, no browser, virtual result id = encoded query', async () => {
    const f = nhFetch({ body: NH_SEARCH_JSON })
    vi.stubGlobal('fetch', f)
    const getBrowser = noBrowser()
    nhentai.init({ getBrowser, logger: console })
    const results = await nhentai.search('berserk')
    expect(results).toEqual([{ id: 'berserk', title: 'berserk', status: 'complete' }])
    expect(f.mock.calls[0][0]).toBe(NH_SEARCH_URL)
    expect(getBrowser).not.toHaveBeenCalled()
  })

  it('chapters: galleries sorted by id, titled', async () => {
    vi.stubGlobal('fetch', nhFetch({ body: NH_SEARCH_JSON }))
    nhentai.init({ getBrowser: noBrowser(), logger: console })
    const chs = await nhentai.chapters('berserk')
    expect(chs.map((c) => c.source_id)).toEqual(['653307', '675926'])
    expect(chs.map((c) => c.number)).toEqual([1, 2])
    expect(chs[0].title).toBe('[Neko Plus] Berserk Grandma ENG')
  })

  it('pages: image URLs from gallery JSON, no browser', async () => {
    const f = nhFetch({ body: NH_GALLERY_JSON })
    vi.stubGlobal('fetch', f)
    const getBrowser = noBrowser()
    nhentai.init({ getBrowser, logger: console })
    const urls = await nhentai.pages('675926')
    expect(f.mock.calls[0][0]).toBe('https://nhentai.net/api/v2/galleries/675926')
    expect(urls).toEqual([
      'https://i.nhentai.net/galleries/4139058/1.webp',
      'https://i.nhentai.net/galleries/4139058/2.webp',
      'https://i.nhentai.net/galleries/4139058/3.webp',
    ])
    expect(getBrowser).not.toHaveBeenCalled()
  })

  it('empty result is a real "no results" — no browser fallback', async () => {
    vi.stubGlobal('fetch', nhFetch({ body: { result: [] } }))
    const getBrowser = noBrowser()
    nhentai.init({ getBrowser, logger: console })
    expect(await nhentai.search('zzzznothing')).toEqual([])
    expect(getBrowser).not.toHaveBeenCalled()
  })

  it('403 challenge page → falls back to the browser once', async () => {
    vi.stubGlobal('fetch', nhFetch({ status: 403, contentType: 'text/html', body: '<title>Just a moment...</title>' }))
    const getBrowser = nhBrowser(NH_SEARCH_JSON)
    nhentai.init({ getBrowser, logger: console })
    expect(await nhentai.search('berserk')).toHaveLength(1)
    expect(getBrowser).toHaveBeenCalledTimes(1)
  })

  it('200 HTML (non-JSON) is treated as a challenge too', async () => {
    vi.stubGlobal('fetch', nhFetch({ contentType: 'text/html', body: '<html></html>' }))
    const getBrowser = nhBrowser(NH_SEARCH_JSON)
    nhentai.init({ getBrowser, logger: console })
    expect(await nhentai.search('berserk')).toHaveLength(1)
    expect(getBrowser).toHaveBeenCalledTimes(1)
  })

  it('challenge + browser failure → search rejects', async () => {
    vi.stubGlobal('fetch', nhFetch({ status: 403, contentType: 'text/html', body: '' }))
    nhentai.init({ getBrowser: vi.fn().mockRejectedValue(new Error('CLOAKBROWSER_WS_URL is not set')), logger: console })
    await expect(nhentai.search('berserk')).rejects.toThrow()
  })

  it('404 JSON is a genuine API error — no browser fallback', async () => {
    vi.stubGlobal('fetch', nhFetch({ status: 404, body: { error: 'not found' } }))
    const getBrowser = noBrowser()
    nhentai.init({ getBrowser, logger: console })
    await expect(nhentai.pages('1')).rejects.toThrow(/404/)
    expect(getBrowser).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// NovelFull.net (spec 027) — CloakBrowser; fake getBrowser for the flow tests
// ═══════════════════════════════════════════════════════════════════════════════

// Live captures 2026-09-26 (novelfull.net via CloakBrowser), trimmed.
const NFN_SEARCH_HTML = "<div class=\"ul-list1 ul-list1-2 ss-custom rank-list fwn-rank-list\"><div class=\"li-row\"><div class=\"li\"><div class=\"con\"><div class=\"pic\"><a href=\"/the-primal-hunter.html\" title=\"The Primal Hunter\"><img src=\"/uploads/thumbs/the-primal-hunter-d86bb7582b-62edfae1765bfa449809fbe82f43d02b.jpg\" alt=\"The Primal Hunter\" width=\"100\" height=\"136\" loading=\"lazy\" decoding=\"async\"></a></div><div class=\"txt\"><h3 class=\"tit\"><a href=\"/the-primal-hunter.html\" title=\"The Primal Hunter\">The Primal Hunter</a></h3><div class=\"core\" title=\"Rating 4.5/5\"><span>4.5</span><i class=\"fwn-hot-starbar\" style=\"--pct:90%\" aria-hidden=\"true\"></i></div><div class=\"desc\">English NovelFantasy, Action1390 Chapters</div></div></div></div></div></div>"
const NFN_SERIES_HTML = "<html><head><meta property=\"og:image\" content=\"https://novelfull.net/uploads/thumbs/the-primal-hunter-d86bb7582b-1575ca067cec288d95c9ddebdb017317.jpg\"></head><body><div class=\"m-book1\"><div class=\"txt\"><div class=\"item\"><span class=\"glyphicon glyphicon-user\" title=\"Author\" aria-hidden=\"true\"></span><div class=\"right\"><a href=\"/author/Zogarth\" class=\"a1\" title=\"Zogarth\">Zogarth</a></div></div><div class=\"item\"><span class=\"glyphicon glyphicon-th-list\" title=\"Genre\" aria-hidden=\"true\"></span><div class=\"right\"><a href=\"/genre/Fantasy\" class=\"a1\" title=\"Fantasy Novels\">Fantasy</a>\n                                                            ,                                 <a href=\"/genre/Action\" class=\"a1\" title=\"Action Novels\">Action</a>\n                                                            ,                                 <a href=\"/genre/Adventure\" class=\"a1\" title=\"Adventure Novels\">Adventure</a></div></div><div class=\"item\"><span class=\"glyphicon glyphicon-globe\" title=\"Language\" aria-hidden=\"true\"></span><div class=\"right\"><!-- Language of the served edition, not a guessed original language. --><span class=\"s1\"><span class=\"a1\" title=\"Language: English\">English</span></span></div></div><div class=\"item\"><span class=\"glyphicon glyphicon-time\" title=\"Status\" aria-hidden=\"true\"></span><div class=\"right\"><span class=\"s1 s2\"><a href=\"/latest-release-novel\" title=\"OnGoing\">OnGoing</a></span></div></div></div></div><div class=\"inner\" id=\"novel-summary-inner\"><p>On just another normal Monday, the world changed. The universe had reached a threshold humanity didn’t even know existed, and it was time to finally be integrated into the vast multiverse. A world where power is the only thing that one can truly rely on.</p><p>Jake, a seemingly average office worker, finds himself thrust into this new world. Into a tutorial filled with dangers and opportunities. In a world that should breed fear and concern, an environment that makes his fellow coworkers falter, Jake instead finds himself thriving.</p><p>Perhaps… Jake was born for this kind of world, to begin with.</p></div><div class=\"m-newest2\" id=\"list-chapter\" data-novel-id=\"2864\" data-current-page=\"1\" data-page-size=\"40\" data-total-page=\"35\" data-total-chapters=\"1390\" data-list-url=\"/ajax-chapter-list\" data-base-url=\"/the-primal-hunter.html\"><div class=\"g-tit\" id=\"link1\"><h3 class=\"tit\"><span class=\"glyphicon glyphicon-list\" aria-hidden=\"true\"></span>\n            Chapter List\n        </h3></div><ul class=\"ul-list5\" id=\"idData\"><li><span class=\"glyphicon glyphicon-book right-5\" aria-hidden=\"true\"></span><a href=\"/the-primal-hunter/chapter-1-another-monday-morning.html\" class=\"con\" title=\"Chapter 1 - Another Monday Morning\"><span class=\"chapter-text\">Chapter 1 - Another Monday Morning</span></a></li><li><span class=\"glyphicon glyphicon-book right-5\" aria-hidden=\"true\"></span><a href=\"/the-primal-hunter/chapter-2-introduction.html\" class=\"con\" title=\"Chapter 2 - Introduction\"><span class=\"chapter-text\">Chapter 2 - Introduction</span></a></li><li><span class=\"glyphicon glyphicon-book right-5\" aria-hidden=\"true\"></span><a href=\"/the-primal-hunter/chapter-3-the-tutorial-commences.html\" class=\"con\" title=\"Chapter 3 - The Tutorial Commences\"><span class=\"chapter-text\">Chapter 3 - The Tutorial Commences</span></a></li></ul><div class=\"page\" id=\"barcon\" name=\"barcon\"><a class=\"index-container-btn\" href=\"/the-primal-hunter.html\" data-page-action=\"first\">First</a><a class=\"index-container-btn none\" id=\"prevBtn\">None</a><select id=\"indexselect\" aria-label=\"Chapter range\"><option value=\"1\" data-url=\"/the-primal-hunter.html\" selected=\"\">\n                        C.1 - C.40                    </option><option value=\"2\" data-url=\"/the-primal-hunter.html?page=2\">\n                        C.41 - C.80                    </option><option value=\"3\" data-url=\"/the-primal-hunter.html?page=3\">\n                        C.81 - C.120                    </option><option value=\"4\" data-url=\"/the-primal-hunter.html?page=4\">\n                        C.121 - C.160                    </option><option value=\"5\" data-url=\"/the-primal-hunter.html?page=5\">\n                        C.161 - C.200                    </option><option value=\"6\" data-url=\"/the-primal-hunter.html?page=6\">\n                        C.201 - C.240                    </option><option value=\"7\" data-url=\"/the-primal-hunter.html?page=7\">\n                        C.241 - C.280                    </option><option value=\"8\" data-url=\"/the-primal-hunter.html?page=8\">\n                        C.281 - C.320                    </option><option value=\"9\" data-url=\"/the-primal-hunter.html?page=9\">\n                        C.321 - C.360                    </option><option value=\"10\" data-url=\"/the-primal-hunter.html?page=10\">\n                        C.361 - C.400                    </option><option value=\"11\" data-url=\"/the-primal-hunter.html?page=11\">\n                        C.401 - C.440                    </option><option value=\"12\" data-url=\"/the-primal-hunter.html?page=12\">\n                        C.441 - C.480                    </option><option value=\"13\" data-url=\"/the-primal-hunter.html?page=13\">\n                        C.481 - C.520                    </option><option value=\"14\" data-url=\"/the-primal-hunter.html?page=14\">\n                        C.521 - C.560                    </option><option value=\"15\" data-url=\"/the-primal-hunter.html?page=15\">\n                        C.561 - C.600                    </option><option value=\"16\" data-url=\"/the-primal-hunter.html?page=16\">\n                        C.601 - C.640                    </option><option value=\"17\" data-url=\"/the-primal-hunter.html?page=17\">\n                        C.641 - C.680                    </option><option value=\"18\" data-url=\"/the-primal-hunter.html?page=18\">\n                        C.681 - C.720                    </option><option value=\"19\" data-url=\"/the-primal-hunter.html?page=19\">\n                        C.721 - C.760                    </option><option value=\"20\" data-url=\"/the-primal-hunter.html?page=20\">\n                        C.761 - C.800                    </option><option value=\"21\" data-url=\"/the-primal-hunter.html?page=21\">\n                        C.801 - C.840                    </option><option value=\"22\" data-url=\"/the-primal-hunter.html?page=22\">\n                        C.841 - C.880                    </option><option value=\"23\" data-url=\"/the-primal-hunter.html?page=23\">\n                        C.881 - C.920                    </option><option value=\"24\" data-url=\"/the-primal-hunter.html?page=24\">\n                        C.921 - C.960                    </option><option value=\"25\" data-url=\"/the-primal-hunter.html?page=25\">\n                        C.961 - C.1000                    </option><option value=\"26\" data-url=\"/the-primal-hunter.html?page=26\">\n                        C.1001 - C.1040                    </option><option value=\"27\" data-url=\"/the-primal-hunter.html?page=27\">\n                        C.1041 - C.1080                    </option><option value=\"28\" data-url=\"/the-primal-hunter.html?page=28\">\n                        C.1081 - C.1120                    </option><option value=\"29\" data-url=\"/the-primal-hunter.html?page=29\">\n                        C.1121 - C.1160                    </option><option value=\"30\" data-url=\"/the-primal-hunter.html?page=30\">\n                        C.1161 - C.1200                    </option><option value=\"31\" data-url=\"/the-primal-hunter.html?page=31\">\n                        C.1201 - C.1240                    </option><option value=\"32\" data-url=\"/the-primal-hunter.html?page=32\">\n                        C.1241 - C.1280                    </option><option value=\"33\" data-url=\"/the-primal-hunter.html?page=33\">\n                        C.1281 - C.1320                    </option><option value=\"34\" data-url=\"/the-primal-hunter.html?page=34\">\n                        C.1321 - C.1360                    </option><option value=\"35\" data-url=\"/the-primal-hunter.html?page=35\">\n                        C.1361 - C.1390                    </option></select><a class=\"index-container-btn\" id=\"nextBtn\" rel=\"next\" href=\"/the-primal-hunter.html?page=2\" data-page-action=\"next\">Next</a><a class=\"index-container-btn\" href=\"/the-primal-hunter.html?page=35\" data-page-action=\"last\">Last</a></div><input id=\"truyen-id\" type=\"hidden\" value=\"2864\"><input id=\"total-page\" type=\"hidden\" value=\"35\"><input name=\"truyen\" type=\"hidden\" value=\"the-primal-hunter\"></div></body></html>"
const NFN_AJAX_PAGE_1 = {"code": 200, "html": "<li>\n    <span class=\"glyphicon glyphicon-book right-5\" aria-hidden=\"true\"></span>\n    <a href=\"/the-primal-hunter/chapter-1-another-monday-morning.html\" class=\"con\" title=\"Chapter 1 - Another Monday Morning\">\n        <span class=\"chapter-text\">Chapter 1 - Another Monday Morning</span>\n    </a>\n</li>\n<li>\n    <span class=\"glyphicon glyphicon-book right-5\" aria-hidden=\"true\"></span>\n    <a href=\"/the-primal-hunter/chapter-2-introduction.html\" class=\"con\" title=\"Chapter 2 - Introduction\">\n        <span class=\"chapter-text\">Chapter 2 - Introduction</span>\n    </a>\n</li>\n<li>\n    <span class=\"glyphicon glyphicon-book right-5\" aria-hidden=\"true\"></span>\n    <a href=\"/the-primal-hunter/chapter-3-the-tutorial-commences.html\" class=\"con\" title=\"Chapter 3 - The Tutorial Commences\">\n        <span class=\"chapter-text\">Chapter 3 - The Tutorial Commences</span>\n    </a>\n</li>", "page": 1, "pageSize": 40, "totalPage": 35, "totalChapters": 1390}
const NFN_AJAX_PAGE_35 = {"code": 200, "html": "<li>\n    <span class=\"glyphicon glyphicon-book right-5\" aria-hidden=\"true\"></span>\n    <a href=\"/the-primal-hunter/chapter-1389-antechamber.html\" class=\"con\" title=\"Chapter 1389 - Antechamber\">\n        <span class=\"chapter-text\">Chapter 1389 - Antechamber</span>\n    </a>\n</li>\n<li>\n    <span class=\"glyphicon glyphicon-book right-5\" aria-hidden=\"true\"></span>\n    <a href=\"/the-primal-hunter/chapter-1390-disparity-among-geniuses.html\" class=\"con\" title=\"Chapter 1390 - Disparity Among Geniuses\">\n        <span class=\"chapter-text\">Chapter 1390 - Disparity Among Geniuses</span>\n    </a>\n</li>", "page": 35, "pageSize": 40, "totalPage": 35, "totalChapters": 1390}
const NFN_CHAPTER_HTML = "<html><body><div class=\"txt\"><div id=\"chapter-content\" class=\"chapter-c\" style=\"font-family: Arial, Helvetica, sans-serif; font-size: 18px; line-height: 160%;\"><p data-reader-original-text=\"\"></p><p data-reader-original-text=\" It was just another boring Monday morning. The sparse rays of sunlight that found their way through the blinders’ narrow gaps did little to disturb the man sleeping deeply on the bed. However, the serene peace was short-lived as the accursed sound of his alarm began its daily ritual of ruining a good dream. \"> It was just another boring Monday morning. The sparse rays of sunlight that found their way through the blinders’ narrow gaps did little to disturb the man sleeping deeply on the bed. However, the serene peace was short-lived as the accursed sound of his alarm began its daily ritual of ruining a good dream. </p><p data-reader-original-text=\" Jake, previously enjoying the sweet embrace of his blankets, was startled awake, fumbling around until his hand finally found his phone. Grumbling, he rolled out of bed and started his usual morning routine, preparing for yet another day at work. \"> Jake, previously enjoying the sweet embrace of his blankets, was startled awake, fumbling around until his hand finally found his phone. Grumbling, he rolled out of bed and started his usual morning routine, preparing for yet another day at work. </p><p data-reader-original-text=\" He went for a warm shower, a quick breakfast, got himself dressed, before he finally grabbed his stuff and headed out the door. The entire morning routine was done in less than half an hour. \"> He went for a warm shower, a quick breakfast, got himself dressed, before he finally grabbed his stuff and headed out the door. The entire morning routine was done in less than half an hour. </p><div class=\"fwn-slot-host fwn-slot-mid text-center skiptranslate\" data-ad-slot=\"chapter_mid\" translate=\"no\"><script async=\"\" data-cfasync=\"false\" src=\"https://platform.pubadx.one/v2/tag.js\"></script><ins class=\"pubadx-slot\" data-zoneid=\"11623\"></ins></div></div></body></html>"

function nfnBrowser(html: string, ajax: Record<number, unknown> = {}) {
  const visited: string[] = []
  const fetched: string[] = []
  const page = {
    goto: async (url: string) => { visited.push(url) },
    content: async () => html,
    // chapters() runs the ajax loop in-page: evaluate(fn, arg) with a stubbed global fetch
    evaluate: async (fn: (arg: unknown) => unknown, arg: unknown) => {
      const realFetch = globalThis.fetch
      globalThis.fetch = (async (u: string) => {
        fetched.push(String(u))
        const pageNo = Number(new URL(String(u), 'https://novelfull.net').searchParams.get('page'))
        return { json: async () => ajax[pageNo] } as Response
      }) as typeof fetch
      try { return await fn(arg) } finally { globalThis.fetch = realFetch }
    },
    close: async () => {},
  }
  const browser = { isConnected: () => true, newContext: async () => ({ newPage: async () => page, close: async () => {} }) }
  return { getBrowser: async () => browser, visited, fetched }
}

describe('novelfullnet — parsers (live captures)', () => {
  it('parseSearchHtml: slug id, title, absolute cover', () => {
    const [r, ...rest] = novelfullnet.parseSearchHtml(NFN_SEARCH_HTML)
    expect(rest).toHaveLength(0)
    expect(r.id).toBe('the-primal-hunter')
    expect(r.title).toBe('The Primal Hunter')
    expect(r.cover_url).toMatch(/^https:\/\/novelfull\.net\/uploads\/thumbs\/the-primal-hunter-/)
  })

  it('parseChapterList: paths, real numbers from titles', () => {
    const chs = novelfullnet.parseChapterList((NFN_AJAX_PAGE_1 as { html: string }).html + (NFN_AJAX_PAGE_35 as { html: string }).html)
    expect(chs.map((c) => c.number)).toEqual([1, 2, 3, 1389, 1390])
    expect(chs[0]).toEqual({
      source_id: 'the-primal-hunter/chapter-1-another-monday-morning.html',
      number: 1,
      title: 'Chapter 1 - Another Monday Morning',
      chapter_format: 'text',
    })
  })

  it('parseChapterList: no numbers anywhere → list position', () => {
    const html = '<li><a href="/x/prologue.html" title="Prologue">Prologue</a></li><li><a href="/x/the-start.html" title="The Start">The Start</a></li>'
    expect(novelfullnet.parseChapterList(html).map((c) => c.number)).toEqual([1, 2])
  })

  it('parseChapterList: lettered parts stay distinct; unnumbered entries sit after their predecessor', () => {
    const html = ['Chapter 1', 'Chapter 2.A', 'Chapter 2.B', 'Side Story', 'Chapter 3']
      .map((t, i) => `<li><a href="/x/c${i}.html" title="${t}">${t}</a></li>`).join('')
    expect(novelfullnet.parseChapterList(html).map((c) => c.number)).toEqual([1, 2.1, 2.2, 2.21, 3])
  })

  it('parseChapterText: paragraphs kept, ad slot + scripts stripped', () => {
    const text = novelfullnet.parseChapterText(NFN_CHAPTER_HTML)
    expect(text).toContain('It was just another boring Monday morning.')
    expect(text).not.toContain('pubadx')
    expect(text).not.toContain('<')
  })

  it('parseChapterText: throws when there is no chapter content', () => {
    expect(() => novelfullnet.parseChapterText('<html><body></body></html>')).toThrow()
  })

  it('parseMeta: description, cover, tags, chapter count, novel id', () => {
    const m = novelfullnet.parseMeta(NFN_SERIES_HTML)
    expect(m.description).toContain('On just another normal Monday, the world changed.')
    expect(m.cover_url).toMatch(/^https:\/\/novelfull\.net\/uploads\/thumbs\//)
    expect(m.tags).toBe('Fantasy, Action, Adventure')
    expect(m.chapter_count).toBe(1390)
    expect(m.novel_id).toBe('2864')
  })
})

describe('novelfullnet — flows (fake browser)', () => {
  it('search requests the search URL and parses the page', async () => {
    const b = nfnBrowser(NFN_SEARCH_HTML)
    novelfullnet.init({ getBrowser: b.getBrowser, logger: console })
    const results = await novelfullnet.search('primal hunter')
    expect(b.visited).toEqual(['https://novelfull.net/search?keyword=primal%20hunter'])
    expect(results).toHaveLength(1)
  })

  it('chapters opens the series page, then collects every ajax page in-page', async () => {
    const page2 = { ...(NFN_AJAX_PAGE_35 as object), page: 2, totalPage: 2 }
    const b = nfnBrowser(NFN_SERIES_HTML, { 1: { ...(NFN_AJAX_PAGE_1 as object), totalPage: 2 }, 2: page2 })
    novelfullnet.init({ getBrowser: b.getBrowser, logger: console })
    const chs = await novelfullnet.chapters('the-primal-hunter')
    expect(b.visited).toEqual(['https://novelfull.net/the-primal-hunter.html'])
    expect(b.fetched).toEqual([
      '/ajax-chapter-list?novelId=2864&page=1',
      '/ajax-chapter-list?novelId=2864&page=2',
    ])
    expect(chs.map((c) => c.number)).toEqual([1, 2, 3, 1389, 1390])
  })

  it('chapterText requests the chapter URL', async () => {
    const b = nfnBrowser(NFN_CHAPTER_HTML)
    novelfullnet.init({ getBrowser: b.getBrowser, logger: console })
    const text = await novelfullnet.chapterText('the-primal-hunter/chapter-1-another-monday-morning.html')
    expect(b.visited).toEqual(['https://novelfull.net/the-primal-hunter/chapter-1-another-monday-morning.html'])
    expect(text).toContain('Monday morning')
  })
})
