// "Read this later" store. Snapshots the derived summary and metadata at save
// time — never the article body — so a saved item still renders once its
// source feed has moved on. See SAVED.md §1-§5.
//
// One localStorage key per record (`saved:<id>`), plus a single `saved:index`
// array carrying just the fields needed to filter/sort/facet without
// hydrating every full record. Write both together, always.
import { classify, classifySector, classifyEvent, TOPICS, EVENT_TYPES, sectorLabel } from './topics.js'

const INDEX_KEY = 'saved:index'
const RECORD_PREFIX = 'saved:'
const MAX_ITEMS = 500

const MAX_TAKEAWAYS = 5
const MAX_CHARS_PER_TAKEAWAY = 280
const MAX_TOTAL_CHARS = 1200

function truncate(s, max) {
  if (s.length <= max) return s
  return `${s.slice(0, max - 1).trimEnd()}…`
}

// Belt-and-braces per SAVED.md §1.1: the condense algorithm already produces
// less than this, but a future change to it can't quietly turn Saved into an
// article archive, because this is enforced here regardless of the input.
function capSummary(summary) {
  if (!summary) return null
  const takeaways = (summary.takeaways || [])
    .slice(0, MAX_TAKEAWAYS)
    .map((t) => truncate(t, MAX_CHARS_PER_TAKEAWAY))

  const kept = []
  let total = 0
  for (const t of takeaways) {
    if (total + t.length > MAX_TOTAL_CHARS) break
    kept.push(t)
    total += t.length
  }

  return {
    takeaways: kept,
    keyFigures: (summary.keyFigures || []).slice(0, 6),
    readingMinutes: summary.readingMinutes || 0,
  }
}

function recordKey(id) {
  return `${RECORD_PREFIX}${id}`
}

export function get(id) {
  try {
    const raw = localStorage.getItem(recordKey(id))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeRecord(record) {
  try {
    localStorage.setItem(recordKey(record.id), JSON.stringify(record))
  } catch {
    // Storage full or blocked — the record just won't persist this time.
  }
}

function removeRecord(id) {
  localStorage.removeItem(recordKey(id))
}

function index() {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeIndex(entries) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(entries))
  } catch {
    // Storage full or blocked.
  }
}

function indexEntryFor(record) {
  return {
    id: record.id,
    savedAt: record.savedAt,
    published: record.published,
    topic: record.topic,
    sectors: record.sectors,
    eventType: record.eventType,
    source: record.source,
  }
}

function upsertIndexEntry(record) {
  const entries = index().filter((e) => e.id !== record.id)
  entries.push(indexEntryFor(record))
  writeIndex(entries)
}

function removeIndexEntry(id) {
  writeIndex(index().filter((e) => e.id !== id))
}

export function isSaved(id) {
  return get(id) !== null
}

export function count() {
  return index().length
}

// Cheap enough to call at startup — one index read, no record hydration —
// so the UI can build a reactive Set of saved ids without touching every
// full record just to know which rows show a filled bookmark.
export function savedIds() {
  return index().map((e) => e.id)
}

// Derives sector + event type, applies the storage caps, and writes both the
// record and its index entry together. Idempotent — saving an already-saved
// item updates it in place rather than duplicating, and preserves the
// original savedAt and any manual classification override (§ manual sector
// override) rather than re-deriving over it.
export function save(item, summary = null) {
  const existing = get(item.id)
  if (!existing && count() >= MAX_ITEMS) {
    return { ok: false, reason: 'full' }
  }

  const overridden = existing?.overridden || false
  const topic = overridden ? existing.topic : item.topic ?? classify(item).topic
  const sectors = overridden ? existing.sectors : classifySector(item)
  const eventType = overridden
    ? existing.eventType
    : classifyEvent(item, summary?.takeaways?.join(' '))

  const record = {
    id: item.id,
    title: item.title,
    link: item.link,
    source: item.source,
    sourceUrl: item.sourceUrl,
    published: item.published,
    topic,
    sectors,
    eventType,
    overridden,
    summary: capSummary(summary) ?? existing?.summary ?? null,
    savedAt: existing?.savedAt ?? Date.now(),
    version: 2,
  }

  writeRecord(record)
  upsertIndexEntry(record)
  return { ok: true, item: record }
}

// Returns the removed record so the caller can offer undo — it's the only
// copy, and if the source feed has rolled over, this is unrecoverable
// otherwise.
export function unsave(id) {
  const existing = get(id)
  if (!existing) return null
  removeRecord(id)
  removeIndexEntry(id)
  return existing
}

export function toggle(item, summary = null) {
  if (isSaved(item.id)) {
    unsave(item.id)
    return { saved: false }
  }
  const result = save(item, summary)
  return { saved: result.ok, reason: result.ok ? undefined : result.reason }
}

// Only fills a gap — never overwrites a summary that's already there, so an
// item saved from Feed and later opened in Brief picks up its takeaways
// exactly once.
export function backfillSummary(id, summary) {
  const existing = get(id)
  if (!existing || existing.summary) return null
  const updated = { ...existing, summary: capSummary(summary) }
  writeRecord(updated)
  return updated
}

// Manual override within the fixed sector/event-type vocabulary (never
// free-text — see SAVED.md §10's ban on user-defined categories). Marks the
// record so future saves/backfills don't silently re-derive over the choice.
export function setClassification(id, { sectors, eventType } = {}) {
  const existing = get(id)
  if (!existing) return null
  const updated = {
    ...existing,
    sectors: sectors ?? existing.sectors,
    eventType: eventType !== undefined ? eventType : existing.eventType,
    overridden: true,
  }
  writeRecord(updated)
  upsertIndexEntry(updated)
  return updated
}

// Puts back an exact record removed via unsave() — bypasses save()'s
// derivation entirely, so an undo can never lose a manual classification
// override or drift from what was actually removed.
export function restore(record) {
  if (!record) return null
  if (!isSaved(record.id) && count() >= MAX_ITEMS) {
    return { ok: false, reason: 'full' }
  }
  writeRecord(record)
  upsertIndexEntry(record)
  return { ok: true, item: record }
}

const SORTS = {
  recentSaved: (a, b) => b.savedAt - a.savedAt,
  oldestSaved: (a, b) => a.savedAt - b.savedAt,
  recentPublished: (a, b) => b.published - a.published,
  sourceAZ: (a, b) => a.source.localeCompare(b.source),
}

// Filtering, sorting, and (in the common case) paging all run against the
// index alone; full records are only hydrated for the page actually
// rendered. A text query is the exception — it needs title/takeaway text
// that only lives on the full record, so it hydrates everything that passed
// the index-level filters first.
export function list(options = {}) {
  const {
    topic,
    sectors,
    eventTypes,
    from,
    to,
    dateField = 'savedAt',
    query,
    sort = 'recentSaved',
    limit,
    offset = 0,
  } = options

  let entries = index()
  if (topic && topic !== 'all') entries = entries.filter((e) => e.topic === topic)
  if (sectors?.length) entries = entries.filter((e) => e.sectors.some((s) => sectors.includes(s)))
  if (eventTypes?.length) entries = entries.filter((e) => eventTypes.includes(e.eventType))
  if (from != null) entries = entries.filter((e) => e[dateField] >= from)
  if (to != null) entries = entries.filter((e) => e[dateField] <= to)
  entries = [...entries].sort(SORTS[sort] || SORTS.recentSaved)

  if (!query) {
    const page = limit != null ? entries.slice(offset, offset + limit) : entries.slice(offset)
    return page.map((e) => get(e.id)).filter(Boolean)
  }

  const q = query.trim().toLowerCase()
  const matched = entries
    .map((e) => get(e.id))
    .filter(Boolean)
    .filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.source.toLowerCase().includes(q) ||
        (r.summary?.takeaways || []).some((t) => t.toLowerCase().includes(q))
    )
  return limit != null ? matched.slice(offset, offset + limit) : matched.slice(offset)
}

// One pass over the index, so the filter UI can show only categories
// actually present, with counts, without hydrating a single full record.
export function facets() {
  const topics = {}
  const sectorCounts = {}
  const eventTypeCounts = {}
  for (const e of index()) {
    if (e.topic) topics[e.topic] = (topics[e.topic] || 0) + 1
    for (const s of e.sectors || []) sectorCounts[s] = (sectorCounts[s] || 0) + 1
    if (e.eventType) eventTypeCounts[e.eventType] = (eventTypeCounts[e.eventType] || 0) + 1
  }
  return { topics, sectors: sectorCounts, eventTypes: eventTypeCounts }
}

// Destructive — the caller is responsible for confirming with the user
// first. This just does it.
export function clear() {
  for (const e of index()) removeRecord(e.id)
  localStorage.removeItem(INDEX_KEY)
}

// Best-effort description of the active filters for the export header. A
// caller that already has a nicer label (e.g. a named date preset like "Last
// 90 days", which this module has no notion of) can pass `filterSummary` to
// use verbatim instead.
function describeFilters(options) {
  if (options.filterSummary) return options.filterSummary
  const parts = []
  if (options.topic && options.topic !== 'all') parts.push(TOPICS[options.topic]?.label || options.topic)
  if (options.sectors?.length) parts.push(options.sectors.map(sectorLabel).join('/'))
  if (options.eventTypes?.length) parts.push(options.eventTypes.map((k) => EVENT_TYPES[k]?.label || k).join('/'))
  if (options.query) parts.push(`"${options.query}"`)
  return parts.join(' · ')
}

const fmtDate = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

// Every item carries source, date, and link — what makes this defensible as
// a personal archive rather than a scrape (SAVED.md §1.3, §7).
export function exportMarkdown(options = {}) {
  const items = list({ ...options, limit: undefined, offset: 0 })
  const filterDesc = describeFilters(options)

  const headerLine = [
    `Exported ${fmtDate(Date.now())}`,
    `${items.length} item${items.length === 1 ? '' : 's'}`,
    filterDesc,
  ]
    .filter(Boolean)
    .join(' · ')

  const header =
    `# Pulse — saved items\n\n${headerLine}\n` +
    `Summaries generated for personal reference. Follow the links for full articles.`

  const body = items
    .map((item) => {
      const takeaways = (item.summary?.takeaways || []).map((t) => `- ${t}`).join('\n')
      const figures = item.summary?.keyFigures?.length
        ? `\nKey figures: ${item.summary.keyFigures.join(' · ')}`
        : ''
      return (
        `## ${item.title}\n\n` +
        `${item.source} · Published ${fmtDate(item.published)} · Saved ${fmtDate(item.savedAt)}\n` +
        `${item.link}\n` +
        (takeaways ? `\n${takeaways}\n` : '\n') +
        figures
      )
    })
    .join('\n\n---\n\n')

  return `${header}\n\n---\n\n${body}\n`
}
