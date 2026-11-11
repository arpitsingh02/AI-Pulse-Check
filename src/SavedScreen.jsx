import { useMemo, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { list, facets, exportMarkdown } from './lib/saved'
import { dayLabel, relativeTime } from './lib/dates'
import { TOPICS, EVENT_TYPES, sectorLabel } from './lib/topics'
import BookmarkIcon from './BookmarkIcon'

const DAY = 86400000

const PRESETS = [
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All time' },
]

const SORTS = [
  { key: 'recentSaved', label: 'Recently saved' },
  { key: 'oldestSaved', label: 'Oldest saved' },
  { key: 'recentPublished', label: 'Recently published' },
  { key: 'sourceAZ', label: 'Source A-Z' },
]

const EMPTY_FILTERS = {
  topic: 'all',
  sectors: [],
  eventTypes: [],
  preset: 'all',
  customFrom: '',
  customTo: '',
  dateField: 'savedAt',
  query: '',
}

function dateRangeFor(f) {
  if (f.customFrom || f.customTo) {
    return {
      from: f.customFrom ? new Date(f.customFrom).getTime() : undefined,
      // Include the whole "to" day, not just its midnight instant.
      to: f.customTo ? new Date(f.customTo).getTime() + DAY - 1 : undefined,
    }
  }
  const now = Date.now()
  switch (f.preset) {
    case '7d':
      return { from: now - 7 * DAY, to: now }
    case '30d':
      return { from: now - 30 * DAY, to: now }
    case '90d':
      return { from: now - 90 * DAY, to: now }
    case 'year':
      return { from: new Date(new Date().getFullYear(), 0, 1).getTime(), to: now }
    default:
      return { from: undefined, to: undefined }
  }
}

function activeFilterLabels(f) {
  const labels = []
  if (f.topic !== 'all') labels.push(TOPICS[f.topic]?.label || f.topic)
  for (const s of f.sectors) labels.push(sectorLabel(s))
  for (const e of f.eventTypes) labels.push(EVENT_TYPES[e]?.label || e)
  if (f.customFrom || f.customTo) labels.push('Custom range')
  else if (f.preset !== 'all') labels.push(PRESETS.find((p) => p.key === f.preset)?.label)
  if (f.query) labels.push(`"${f.query}"`)
  return labels
}

// `savedIdSet` isn't read directly here — it's App.jsx's reactive Set of
// saved ids, passed through purely so its identity change (on every save,
// unsave, or undo-restore, from any screen) is what tells the memos below to
// re-read the store. That keeps this in sync with unsaves/undos that happen
// while this screen isn't even mounted to see them directly.
export default function SavedScreen({ onOpen, onUnsave, savedIdSet }) {
  const [applied, setApplied] = useState(EMPTY_FILTERS)
  const [draft, setDraft] = useState(EMPTY_FILTERS)
  const [panelOpen, setPanelOpen] = useState(false)
  // Sort lives outside the filter sheet (SAVED.md puts it in the overflow
  // menu instead), so it applies immediately rather than waiting on dismiss.
  const [sort, setSort] = useState('recentSaved')

  function openPanel() {
    setDraft(applied)
    setPanelOpen(true)
  }

  // "Applies on dismiss" (SAVED.md §4.2) — chip taps inside the panel only
  // touch `draft`; the visible list re-queries once the panel closes.
  function closePanel() {
    setApplied(draft)
    setPanelOpen(false)
  }

  function toggleDraftArray(field, key) {
    setDraft((d) => {
      const arr = d[field]
      return { ...d, [field]: arr.includes(key) ? arr.filter((k) => k !== key) : [...arr, key] }
    })
  }

  const allFacets = useMemo(() => facets(), [savedIdSet])
  const sectorOptions = useMemo(
    () =>
      Object.entries(allFacets.sectors)
        .map(([key, n]) => ({ key, label: sectorLabel(key), count: n }))
        .sort((a, b) => b.count - a.count),
    [allFacets]
  )
  const eventTypeOptions = useMemo(
    () =>
      Object.entries(allFacets.eventTypes)
        .map(([key, n]) => ({ key, label: EVENT_TYPES[key]?.label || key, count: n }))
        .sort((a, b) => b.count - a.count),
    [allFacets]
  )

  const listOptions = useMemo(() => {
    const { from, to } = dateRangeFor(applied)
    return {
      topic: applied.topic,
      sectors: applied.sectors,
      eventTypes: applied.eventTypes,
      dateField: applied.dateField,
      from,
      to,
      query: applied.query,
      sort,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied, sort])

  const items = useMemo(() => list(listOptions), [listOptions, savedIdSet])
  const totalCount = useMemo(() => list().length, [savedIdSet])

  const groups = useMemo(() => {
    const out = []
    for (const item of items) {
      const label = dayLabel(item.savedAt)
      if (!out.length || out[out.length - 1].label !== label) out.push({ label, items: [] })
      out[out.length - 1].items.push(item)
    }
    return out
  }, [items])

  function clearAll() {
    setApplied(EMPTY_FILTERS)
    setDraft(EMPTY_FILTERS)
  }

  async function handleExport() {
    const { from, to } = dateRangeFor(applied)
    const markdown = exportMarkdown({
      topic: applied.topic,
      sectors: applied.sectors,
      eventTypes: applied.eventTypes,
      dateField: applied.dateField,
      from,
      to,
      query: applied.query,
      sort,
      filterSummary: activeFilterLabels(applied).join(' · '),
    })
    const filename = `pulse-saved-${new Date().toISOString().slice(0, 10)}.md`

    if (Capacitor.isNativePlatform()) {
      await Share.share({ title: 'Pulse — saved items', text: markdown, dialogTitle: 'Export saved items' })
      return
    }

    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="saved-shell">
      <div className="saved-scroll">
        <div className="saved-toolbar">
          <select
            className="saved-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort saved items"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <button className="saved-export" onClick={handleExport} disabled={totalCount === 0}>
            Export
          </button>
        </div>

        <div className="filter-bar">
          {activeFilterLabels(applied).map((label, i) => (
            <button key={i} className="chip chip-on" onClick={openPanel}>
              {label}
            </button>
          ))}
          <button
            className={`chip ${panelOpen ? 'chip-on' : ''}`}
            onClick={() => (panelOpen ? closePanel() : openPanel())}
          >
            Filter
          </button>
        </div>

        {panelOpen && (
          <section className="filter-panel">
            <div className="filter-panel-head">
              <span className="filter-panel-title">Filters</span>
              <button className="clear-all" onClick={clearAll}>
                Clear all
              </button>
            </div>

            <div className="filter-group">
              <h3 className="filter-group-title">Search</h3>
              <input
                className="filter-search"
                type="text"
                value={draft.query}
                onChange={(e) => setDraft((d) => ({ ...d, query: e.target.value }))}
                placeholder="Title, source, or takeaway text"
                aria-label="Search saved items"
              />
            </div>

            <div className="filter-group">
              <h3 className="filter-group-title">Topic</h3>
              <div className="filter-chips">
                <button
                  className={`chip ${draft.topic === 'all' ? 'chip-on' : ''}`}
                  onClick={() => setDraft((d) => ({ ...d, topic: 'all' }))}
                >
                  All
                </button>
                {Object.entries(TOPICS).map(([key, t]) => (
                  <button
                    key={key}
                    className={`chip ${draft.topic === key ? 'chip-on' : ''}`}
                    onClick={() => setDraft((d) => ({ ...d, topic: key }))}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {sectorOptions.length > 0 && (
              <div className="filter-group">
                <h3 className="filter-group-title">Sector</h3>
                <div className="filter-chips">
                  {sectorOptions.map(({ key, label, count }) => (
                    <button
                      key={key}
                      className={`chip ${draft.sectors.includes(key) ? 'chip-on' : ''}`}
                      onClick={() => toggleDraftArray('sectors', key)}
                    >
                      {label} ({count})
                    </button>
                  ))}
                </div>
              </div>
            )}

            {eventTypeOptions.length > 0 && (
              <div className="filter-group">
                <h3 className="filter-group-title">Event type</h3>
                <div className="filter-chips">
                  {eventTypeOptions.map(({ key, label, count }) => (
                    <button
                      key={key}
                      className={`chip ${draft.eventTypes.includes(key) ? 'chip-on' : ''}`}
                      onClick={() => toggleDraftArray('eventTypes', key)}
                    >
                      {label} ({count})
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="filter-group">
              <h3 className="filter-group-title">Date</h3>
              <div className="filter-chips">
                {PRESETS.map((p) => (
                  <button
                    key={p.key}
                    className={`chip ${!draft.customFrom && !draft.customTo && draft.preset === p.key ? 'chip-on' : ''}`}
                    onClick={() => setDraft((d) => ({ ...d, preset: p.key, customFrom: '', customTo: '' }))}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="filter-daterange">
                <input
                  type="date"
                  value={draft.customFrom}
                  onChange={(e) => setDraft((d) => ({ ...d, customFrom: e.target.value }))}
                  aria-label="Custom range start"
                />
                <span>to</span>
                <input
                  type="date"
                  value={draft.customTo}
                  onChange={(e) => setDraft((d) => ({ ...d, customTo: e.target.value }))}
                  aria-label="Custom range end"
                />
              </div>
              <div className="filter-chips">
                <button
                  className={`chip ${draft.dateField === 'savedAt' ? 'chip-on' : ''}`}
                  onClick={() => setDraft((d) => ({ ...d, dateField: 'savedAt' }))}
                >
                  Saved date
                </button>
                <button
                  className={`chip ${draft.dateField === 'published' ? 'chip-on' : ''}`}
                  onClick={() => setDraft((d) => ({ ...d, dateField: 'published' }))}
                >
                  Published date
                </button>
              </div>
            </div>

            <button className="filter-apply" onClick={closePanel}>
              Done
            </button>
          </section>
        )}

        {totalCount === 0 ? (
          <div className="empty">Nothing saved yet. Tap the bookmark icon on any story to keep it here.</div>
        ) : items.length === 0 ? (
          <div className="empty">
            No saved items match these filters.
            <button className="empty-action" onClick={clearAll}>
              Clear filters
            </button>
          </div>
        ) : (
          groups.map((group) => (
            <section className="day" key={group.label}>
              <h2 className="day-label">{group.label}</h2>
              <ol className="entries">
                {group.items.map((item) => (
                  <li key={item.id} className="entry">
                    <span className="node" aria-hidden="true" />
                    <div className="entry-row">
                      <button className="entry-hit" onClick={() => onOpen(item)}>
                        <span className="line">
                          <span className="time">Saved {relativeTime(item.savedAt)}</span>
                          <span className="source">{item.source}</span>
                          {item.summary?.keyFigures?.[0] && (
                            <span className="topic-dot">{item.summary.keyFigures[0]}</span>
                          )}
                        </span>
                        <span className="title">{item.title}</span>
                        {item.summary?.takeaways?.length ? (
                          <span className="summary">{item.summary.takeaways[0]}</span>
                        ) : (
                          <span className="summary saved-no-summary">
                            No summary yet — open in Brief to generate one.
                          </span>
                        )}
                      </button>
                      <button
                        className="bookmark bookmark-on"
                        onClick={(e) => {
                          e.stopPropagation()
                          onUnsave(item.id)
                        }}
                        aria-label="Remove from Saved"
                      >
                        <BookmarkIcon filled />
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
