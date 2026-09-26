import { render, screen } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'
import SearchProgress from './SearchProgress.svelte'
import type { SourceInfo } from '../../lib/api'

const SOURCES: SourceInfo[] = [
  { key: 'mangaupdates', label: 'MangaUpdates' },
  { key: 'royalroad', label: 'Royal Road' },
  { key: 'novelupdates', label: 'NovelUpdates' },
  { key: 'wuxiaworld', label: 'WuxiaWorld' },
  { key: 'anilist', label: 'AniList' },
]

type Entry = { status: 'searching' | 'found' | 'empty' | 'error' | 'timeout'; count?: number }

function pill(container: HTMLElement, key: string) {
  return container.querySelector(`[data-testid="source-pill-${key}"]`) as HTMLElement
}

describe('SearchProgress', () => {
  it('renders exactly the sources it is given (no hard-coded list)', () => {
    const { container } = render(SearchProgress, { sources: SOURCES.slice(0, 2), state: new Map() })
    const pills = container.querySelectorAll('[data-testid^="source-pill-"]')
    expect(pills.length).toBe(2)
    expect(pill(container, 'royalroad').textContent).toContain('Royal Road')
    expect(pill(container, 'nhentai')).toBeNull()
  })

  it('searching → pulsing violet pill and "Searching sources…" heading', () => {
    const state = new Map<string, Entry>([['mangaupdates', { status: 'searching' }]])
    const { container } = render(SearchProgress, { sources: SOURCES.slice(0, 1), state })
    expect(screen.getByText(/searching sources/i)).toBeDefined()
    expect(pill(container, 'mangaupdates').className).toContain('text-primary')
    expect(pill(container, 'mangaupdates').querySelector('[data-testid="source-dot"]')!.className).toContain('animate-pulse')
  })

  it('found → green with the count, empty → grey "no results", error/timeout → amber', () => {
    const state = new Map<string, Entry>([
      ['mangaupdates', { status: 'found', count: 12 }],
      ['royalroad', { status: 'empty', count: 0 }],
      ['novelupdates', { status: 'timeout', count: 0 }],
      ['wuxiaworld', { status: 'error', count: 0 }],
      ['anilist', { status: 'found', count: 3 }],
    ])
    const { container } = render(SearchProgress, { sources: SOURCES, state })
    const mu = pill(container, 'mangaupdates')
    expect(mu.className).toContain('text-green')
    expect(mu.textContent).toContain('12')
    expect(mu.querySelector('[data-testid="source-dot"]')!.className).not.toContain('animate-pulse')

    const rr = pill(container, 'royalroad')
    expect(rr.className).toContain('opacity-50')
    expect(rr.getAttribute('title')).toBe('no results')

    expect(pill(container, 'novelupdates').className).toContain('text-amber')
    expect(pill(container, 'novelupdates').getAttribute('title')).toBe('timed out')
    expect(pill(container, 'wuxiaworld').className).toContain('text-amber')
    expect(pill(container, 'wuxiaworld').getAttribute('title')).toBe('error')
  })

  it('all settled → "Results from…" heading', () => {
    const state = new Map<string, Entry>([['mangaupdates', { status: 'found', count: 1 }]])
    render(SearchProgress, { sources: SOURCES.slice(0, 1), state })
    expect(screen.getByText(/results from/i)).toBeDefined()
  })

  it('a source with no state yet counts as searching', () => {
    const { container } = render(SearchProgress, { sources: SOURCES.slice(0, 1), state: new Map() })
    expect(screen.getByText(/searching sources/i)).toBeDefined()
    expect(pill(container, 'mangaupdates').className).toContain('text-primary')
  })

  it('renders skeleton rows only when asked', () => {
    const { container, unmount } = render(SearchProgress, { sources: SOURCES, state: new Map(), skeleton: true })
    expect(container.querySelector('[data-testid="skeleton-rows"]')).not.toBeNull()
    unmount()
    const r = render(SearchProgress, { sources: SOURCES, state: new Map() })
    expect(r.container.querySelector('[data-testid="skeleton-rows"]')).toBeNull()
  })
})
