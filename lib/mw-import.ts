// 👉 Reading Semrush's own CSV exports, so the dashboard works without API access.
//
// Rif is on a Pro plan: the Standard API (the v3 domain reports this was built
// on) is a Business-tier feature, and the v4 keys his account can issue are
// rejected by that endpoint. Rather than lose competitor and keyword data, the
// same reports are exported by hand from the Semrush UI and dropped here. The
// plan is monthly and the gap quarterly, so that is ten minutes of somebody's
// time a month, not a daily chore (owner, 30 Sep 2026).
//
// NOTHING IS GUESSED. A file whose report type or market cannot be identified
// is refused with the reason, not imported on a hunch — a gap file silently
// read as a positions file would put confident nonsense in front of the team.

import { COUNTRIES, dbOf } from './mw-markets'
import type { SemrushKeyword, SemrushCompetitor } from './mw-semrush'

export type ReportKind = 'positions' | 'competitors' | 'gap'

export type ParsedFile = {
  name: string
  kind: ReportKind | null
  /** /locations/<key>, once identified. */
  country: string | null
  market: string | null
  db: string | null
  rows: number
  /** Why this file could not be used, if it could not. */
  problem: string | null
  keywords?: SemrushKeyword[]
  competitors?: SemrushCompetitor[]
  gap?: { q: string; vol: number; cpc: number; kd: number; theirBest: number; rival: string }[]
  /** Domains found in a gap file's header, so the UI can show who it compared. */
  rivals?: string[]
}

const num = (v: string | undefined) => {
  // Semrush exports are quoted and may carry thousands separators.
  const x = Number(String(v ?? '').replace(/["\s,]/g, ''))
  return Number.isFinite(x) ? x : 0
}

/** Semrush wraps every field in quotes when export_escape is on. */
const unquote = (s: string) => s.replace(/^"([^]*)"$/, '$1').trim()

export function splitCsv(text: string): { head: string[]; rows: Record<string, string>[] } {
  const lines = String(text || '').replace(/^﻿/, '')
    .split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.trim())
  if (lines.length < 2) return { head: [], rows: [] }
  // Semrush uses ';' but a few exports come out comma-separated; pick whichever
  // the header actually contains more of.
  const sep = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ';' : ','
  const head = lines[0].split(sep).map(h => unquote(h).toLowerCase())
  const rows = lines.slice(1).map(l => {
    const cells = l.split(sep)
    const r: Record<string, string> = {}
    head.forEach((h, i) => { r[h] = unquote(String(cells[i] ?? '')) })
    return r
  })
  return { head, rows }
}

/**
 * Which report this is, from its columns alone.
 *
 * Filenames are a hint, not evidence — people rename downloads. The header is
 * what the file actually contains.
 */
export function detectKind(head: string[]): ReportKind | null {
  const has = (h: string) => head.includes(h)
  if (has('domain') && (has('competitor relevance') || has('common keywords'))) return 'competitors'
  // A gap export has one column per domain compared, so a keyword column plus
  // two or more columns that look like domains.
  const domainCols = head.filter(h => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h))
  if (has('keyword') && domainCols.length >= 2) return 'gap'
  if (has('keyword') && has('position') && (has('search volume') || has('volume'))) return 'positions'
  return null
}

/**
 * Which market, from the filename.
 *
 * Semrush names exports like
 *   www.movingwalls.com-organic.Positions-in-2026-09-30T08_12_00Z.csv
 * where "in" is the regional database. That token is matched against the
 * databases we know; anything ambiguous is handed back for a human to say.
 */
export function detectCountry(name: string): { country: string; market: string; db: string } | null {
  const tokens = String(name || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  const hits = COUNTRIES
    .map(({ country, market }) => ({ country, market, db: dbOf(country) }))
    .filter((x): x is { country: typeof x.country; market: typeof x.market; db: string } => !!x.db)
    // A database code is two letters; only match it as a whole token, or
    // "us" would match inside "august" and every file would look American.
    .filter(x => tokens.includes(x.db))
  if (hits.length !== 1) return null
  return { country: hits[0].country.key, market: hits[0].market.key, db: hits[0].db }
}

const col = (r: Record<string, string>, ...names: string[]) =>
  names.map(n => r[n]).find(v => v !== undefined)

/** One uploaded file, read as far as it can be. Never throws. */
export function readFile(name: string, text: string, forced?: { country: string; market: string; db: string }): ParsedFile {
  const base: ParsedFile = { name, kind: null, country: null, market: null, db: null, rows: 0, problem: null }
  try {
    const { head, rows } = splitCsv(text)
    if (!head.length) return { ...base, problem: 'not a CSV, or it has no header row' }

    const kind = detectKind(head)
    if (!kind) return { ...base, problem: `columns not recognised (${head.slice(0, 5).join(', ')}…)` }

    const where = forced ?? detectCountry(name)
    if (!where) {
      return {
        ...base, kind, rows: rows.length,
        problem: 'could not tell which market this is from the filename — pick it by hand',
      }
    }

    const out: ParsedFile = {
      ...base, kind, rows: rows.length,
      country: where.country, market: where.market, db: where.db,
    }

    if (kind === 'positions') {
      out.keywords = rows.map(r => ({
        q: String(col(r, 'keyword') ?? '').trim(),
        pos: num(col(r, 'position')),
        prev: col(r, 'previous position') === undefined ? -1 : num(col(r, 'previous position')),
        vol: num(col(r, 'search volume', 'volume')),
        cpc: num(col(r, 'cpc')),
        url: String(col(r, 'url') ?? '').trim(),
        traffic: num(col(r, 'traffic')),
        kd: num(col(r, 'keyword difficulty', 'kd')),
        intent: 0,
      })).filter(k => k.q)
      if (!out.keywords.length) out.problem = 'no keyword rows in the file'
    }

    if (kind === 'competitors') {
      out.competitors = rows.map(r => ({
        domain: String(col(r, 'domain') ?? '').trim(),
        common: num(col(r, 'common keywords')),
        keywords: num(col(r, 'organic keywords')),
        traffic: num(col(r, 'organic traffic')),
      })).filter(c => c.domain)
      if (!out.competitors.length) out.problem = 'no competitor rows in the file'
    }

    if (kind === 'gap') {
      const rivals = head.filter(h => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h) && !h.includes('movingwalls'))
      out.rivals = rivals
      out.gap = rows.map(r => {
        let theirBest = 999, rival = ''
        for (const d of rivals) {
          const p = num(r[d])
          if (p > 0 && p < theirBest) { theirBest = p; rival = d }
        }
        return {
          q: String(col(r, 'keyword') ?? '').trim(),
          vol: num(col(r, 'search volume', 'volume')),
          cpc: num(col(r, 'cpc')),
          kd: num(col(r, 'keyword difficulty', 'kd')),
          theirBest: theirBest === 999 ? 0 : theirBest,
          rival,
        }
      }).filter(g => g.q)
      if (!rivals.length) out.problem = 'no competitor columns found — is this a Keyword Gap export?'
      else if (!out.gap.length) out.problem = 'no keyword rows in the file'
    }

    return out
  } catch (e: any) {
    return { ...base, problem: `could not be read: ${String(e?.message ?? e).slice(0, 80)}` }
  }
}

/** A one-line summary a person can check at a glance. */
export function describe(f: ParsedFile): string {
  if (f.problem) return `${f.name} — skipped: ${f.problem}`
  const what = f.kind === 'positions' ? `${f.keywords?.length ?? 0} ranking keywords`
    : f.kind === 'competitors' ? `${f.competitors?.length ?? 0} competitors`
      : `${f.gap?.length ?? 0} gap keywords vs ${f.rivals?.join(', ')}`
  return `${f.name} — ${f.country}: ${what}`
}
