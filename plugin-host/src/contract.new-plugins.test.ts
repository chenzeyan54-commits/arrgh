// TDD contract tests for ADR 0031 new plugins.

import { describe, it, expect } from 'vitest'

import * as asurascans from '../../plugins/asurascans/src/index'
import * as wuxiaworld from '../../plugins/wuxiaworld/src/index'
import * as manga18fx  from '../../plugins/manga18fx/src/index'
import * as royalroad  from '../../plugins/royalroad/src/index'
import * as novelfullnet from '../../plugins/novelfullnet/src/index'
import { readFileSync } from 'node:fs'

// ── AsuraScans (manhwa) ───────────────────────────────────────────────────────

describe('asurascans', () => {
  it('info.id is asurascans',  () => expect(asurascans.info.id).toBe('asurascans'))
  it('name is non-empty',      () => expect(asurascans.info.name.length).toBeGreaterThan(0))
  it('default_explicit false', () => expect(asurascans.info.default_explicit).toBe(false))

  it('content_types covers manhwa', () => expect(asurascans.info.content_types).toContain('manhwa'))
  it('no manga in content_types',   () => expect(asurascans.info.content_types).not.toContain('manga'))
  it('no manhua in content_types',  () => expect(asurascans.info.content_types).not.toContain('manhua'))

  it('exports search fn',   () => expect(typeof asurascans.search).toBe('function'))
  it('exports chapters fn', () => expect(typeof asurascans.chapters).toBe('function'))
  it('exports pages fn',    () => expect(typeof asurascans.pages).toBe('function'))
})

// ── WuxiaWorld (novel) ────────────────────────────────────────────────────────

describe('wuxiaworld', () => {
  it('info.id is wuxiaworld',  () => expect(wuxiaworld.info.id).toBe('wuxiaworld'))
  it('name is non-empty',      () => expect(wuxiaworld.info.name.length).toBeGreaterThan(0))
  it('default_explicit false', () => expect(wuxiaworld.info.default_explicit).toBe(false))

  it('content_types covers novel', () => expect(wuxiaworld.info.content_types).toContain('novel'))
  it('no manga in content_types',  () => expect(wuxiaworld.info.content_types).not.toContain('manga'))
  it('no manhwa in content_types', () => expect(wuxiaworld.info.content_types).not.toContain('manhwa'))

  it('exports search fn',      () => expect(typeof wuxiaworld.search).toBe('function'))
  it('exports chapters fn',    () => expect(typeof wuxiaworld.chapters).toBe('function'))
  it('exports chapterText fn', () => expect(typeof wuxiaworld.chapterText).toBe('function'))
  it('no pages fn',            () => expect(wuxiaworld.pages).toBeUndefined())
})

// ── Manga18fx (manhwa, explicit) ──────────────────────────────────────────────

describe('manga18fx', () => {
  it('info.id is manga18fx',    () => expect(manga18fx.info.id).toBe('manga18fx'))
  it('name is non-empty',       () => expect(manga18fx.info.name.length).toBeGreaterThan(0))
  it('default_explicit true',   () => expect(manga18fx.info.default_explicit).toBe(true))

  it('content_types covers manhwa', () => expect(manga18fx.info.content_types).toContain('manhwa'))
  it('no manga in content_types',   () => expect(manga18fx.info.content_types).not.toContain('manga'))
  it('no manhua in content_types',  () => expect(manga18fx.info.content_types).not.toContain('manhua'))

  it('exports search fn',   () => expect(typeof manga18fx.search).toBe('function'))
  it('exports chapters fn', () => expect(typeof manga18fx.chapters).toBe('function'))
  it('exports pages fn',    () => expect(typeof manga18fx.pages).toBe('function'))
  it('no chapterText fn',   () => expect((manga18fx as any).chapterText).toBeUndefined())
})

// ── Royal Road (novel, English originals — ADR 0034) ──────────────────────────

describe('royalroad', () => {
  it('info.id is royalroad',   () => expect(royalroad.info.id).toBe('royalroad'))
  it('name is Royal Road',     () => expect(royalroad.info.name).toBe('Royal Road'))
  it('default_explicit false', () => expect(royalroad.info.default_explicit).toBe(false))
  it('content_types is novel', () => expect(royalroad.info.content_types).toEqual(['novel']))

  it('exports search fn',      () => expect(typeof royalroad.search).toBe('function'))
  it('exports meta fn',        () => expect(typeof royalroad.meta).toBe('function'))
  it('exports chapters fn',    () => expect(typeof royalroad.chapters).toBe('function'))
  it('exports chapterText fn', () => expect(typeof royalroad.chapterText).toBe('function'))
})

// ── NovelFull.net (novel, CloakBrowser — spec 027) ────────────────────────────

describe('novelfullnet', () => {
  it('info.id is novelfullnet',   () => expect(novelfullnet.info.id).toBe('novelfullnet'))
  it('name is NovelFull.net',     () => expect(novelfullnet.info.name).toBe('NovelFull.net'))
  it('default_explicit false',    () => expect(novelfullnet.info.default_explicit).toBe(false))
  it('content_types is novel',    () => expect(novelfullnet.info.content_types).toEqual(['novel']))

  it('exports search fn',      () => expect(typeof novelfullnet.search).toBe('function'))
  it('exports meta fn',        () => expect(typeof novelfullnet.meta).toBe('function'))
  it('exports chapters fn',    () => expect(typeof novelfullnet.chapters).toBe('function'))
  it('exports chapterText fn', () => expect(typeof novelfullnet.chapterText).toBe('function'))

  it('plugin-index lists it as a bundled novel source', () => {
    const index = JSON.parse(readFileSync(new URL('../../plugin-index/index.json', import.meta.url), 'utf8')) as
      { id: string; bundled?: boolean; content_types: string[] }[]
    const entry = index.find((p) => p.id === 'novelfullnet')
    expect(entry?.bundled).toBe(true)
    expect(entry?.content_types).toEqual(['novel'])
  })
})
