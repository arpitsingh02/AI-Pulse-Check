import { useCallback, useEffect, useRef, useState } from 'react'
import { TOPICS } from './lib/topics'
import { extractArticle } from './lib/extract'
import { condense } from './lib/condense'
import { getSummary, setSummary } from './lib/summaryCache'
import { prefersReducedMotion } from './lib/motion'
import { isSaved, backfillSummary } from './lib/saved'

const READ_DELAY_MS = 2000
const PREFETCH_AHEAD = 2
const MAX_CONCURRENT = 2

// Only a real condensed summary or genuine extracted text is worth saving —
// the 'feed' (RSS-description fallback) and 'empty' rungs of the failure
// ladder stay null in Saved so a later successful extraction can still
// backfill them (SAVED.md §12 Q1).
const SAVEABLE_STATUSES = new Set(['full', 'short'])

// An item saved from Feed before this ran has summary: null — fill that gap
// now that a real one exists. Shared by both the fresh-fetch and
// already-cached paths below, since either can be the first time a given
// item's real summary becomes known to this session.
function maybeBackfill(itemId, entry) {
  if (SAVEABLE_STATUSES.has(entry.status) && isSaved(itemId)) {
    backfillSummary(itemId, entry)
  }
}

// The four-level failure ladder from BRIEF-MODE.md §1.6, as a single async
// step: try the best available source, condense it, and degrade honestly
// when a stage comes up short instead of ever returning a blank card.
async function summarizeItem(item) {
  let text = item.fullText || ''
  let gotText = Boolean(text)
  let textSource = 'feed' // content:encoded — already have it, no fetch needed

  if (!gotText && item.link) {
    const extracted = await extractArticle(item.link)
    if (extracted.status === 'ok') {
      text = extracted.text
      gotText = true
      textSource = 'article'
    }
  }

  if (gotText) {
    const c = condense(text)
    if (c.sentenceCount >= 5) {
      return {
        status: 'full',
        takeaways: c.takeaways,
        keyFigures: c.keyFigures,
        readingMinutes: c.readingMinutes,
        wordCount: c.wordCount,
        source: textSource,
      }
    }
    // Extracted fine, but too little material to condense reliably — show
    // the extracted text itself rather than pretending a real summary exists.
    return {
      status: 'short',
      takeaways: [text.slice(0, 600)],
      keyFigures: c.keyFigures,
      readingMinutes: c.readingMinutes,
      wordCount: c.wordCount,
      source: textSource,
    }
  }

  // Extraction failed outright (paywall, JS-rendered page, 403, unsupported
  // content type) or there was no link to try — fall back to the feed's own
  // one-line description.
  if (item.summary) {
    return {
      status: 'feed',
      takeaways: [item.summary],
      keyFigures: [],
      readingMinutes: 1,
      wordCount: item.summary.split(/\s+/).filter(Boolean).length,
      source: 'feed',
    }
  }

  return { status: 'empty', takeaways: [], keyFigures: [], readingMinutes: 0, wordCount: 0, source: 'feed' }
}

const dateLabel = (ms) =>
  new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

const BADGES = { short: 'Excerpt', feed: 'From feed' }

function BriefCard({ item, summary, active, onRead, saved, onToggleSave }) {
  const readTimer = useRef(null)

  // Only counts as read once the card has actually sat on screen for a
  // couple of seconds — a fast scroll-past shouldn't mark it read.
  useEffect(() => {
    if (!active) return undefined
    readTimer.current = setTimeout(() => onRead(item.id), READ_DELAY_MS)
    return () => clearTimeout(readTimer.current)
  }, [active, item.id, onRead])

  const badge = summary ? BADGES[summary.status] : null

  return (
    <div className="brief-card" style={item.topic ? { '--row-accent': `var(--${item.topic})` } : undefined}>
      <div className="brief-card-inner">
        <div className="brief-meta">
          <span className="brief-source">{item.source}</span>
          {item.topic && <span className="brief-topic">{TOPICS[item.topic].label}</span>}
          <span className="brief-time">{dateLabel(item.published)}</span>
        </div>

        <h2 className="brief-title">{item.title}</h2>

        {!summary ? (
          <div className="brief-skeleton" aria-hidden="true">
            <span className="brief-skeleton-line" />
            <span className="brief-skeleton-line" />
            <span className="brief-skeleton-line short" />
          </div>
        ) : summary.status === 'empty' ? (
          <p className="brief-empty-note">Nothing available for this one — open the original.</p>
        ) : (
          <>
            {badge && <span className="brief-badge">{badge}</span>}
            <ul className="brief-takeaways">
              {summary.takeaways.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
            {summary.keyFigures.length > 0 && (
              <div className="brief-figures">
                {summary.keyFigures.map((f) => (
                  <span className="brief-chip" key={f}>{f}</span>
                ))}
              </div>
            )}
            {summary.readingMinutes > 0 && (
              <span className="brief-read-time">{summary.readingMinutes} min read</span>
            )}
          </>
        )}

        <div className="brief-actions">
          {item.link && (
            <a className="brief-open" href={item.link} target="_blank" rel="noopener noreferrer">
              Open original →
            </a>
          )}
          <button
            className={`brief-save ${saved ? 'brief-save-on' : ''}`}
            onClick={() => onToggleSave(item, summary)}
            aria-pressed={saved}
          >
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function BriefMode({
  items,
  onRead,
  onExit,
  onRefresh,
  refreshing,
  onActiveChange,
  savedIdSet,
  onToggleSave,
}) {
  // Only pass along a summary that actually has real content — a degraded
  // 'feed'/'empty' one should leave the saved record's summary null so it
  // can still be backfilled later.
  const handleToggleSave = useCallback(
    (item, summary) => onToggleSave(item, summary && SAVEABLE_STATUSES.has(summary.status) ? summary : undefined),
    [onToggleSave]
  )
  const scrollerRef = useRef(null)
  const [activeId, setActiveId] = useState(items[0]?.id ?? null)
  const [summaries, setSummaries] = useState({})

  // Reports which card is on screen so App.jsx can scroll Timeline to roughly
  // the same story when the user exits.
  useEffect(() => {
    onActiveChange?.(activeId)
  }, [activeId, onActiveChange])

  // Mutable bookkeeping for the fetch queue — refs, not state, so pumping
  // the queue never triggers its own re-render.
  const summariesRef = useRef(summaries)
  summariesRef.current = summaries
  const inFlight = useRef(new Set())
  const queue = useRef([])
  const activeCount = useRef(0)

  const pump = useCallback(() => {
    while (activeCount.current < MAX_CONCURRENT && queue.current.length) {
      const item = queue.current.shift()
      if (summariesRef.current[item.id] || inFlight.current.has(item.id)) continue
      inFlight.current.add(item.id)
      activeCount.current += 1
      summarizeItem(item)
        .catch(() => ({ status: 'empty', takeaways: [], keyFigures: [], readingMinutes: 0, wordCount: 0, source: 'feed' }))
        .then((entry) => {
          setSummary(item.id, entry) // persist — never re-summarize a cached item
          setSummaries((prev) => ({ ...prev, [item.id]: entry }))
          maybeBackfill(item.id, entry)
        })
        .finally(() => {
          inFlight.current.delete(item.id)
          activeCount.current -= 1
          pump()
        })
    }
  }, [])

  const ensureSummary = useCallback(
    (item) => {
      if (!item || summariesRef.current[item.id] || inFlight.current.has(item.id)) return
      const cached = getSummary(item.id)
      if (cached) {
        setSummaries((prev) => ({ ...prev, [item.id]: cached }))
        maybeBackfill(item.id, cached)
        return
      }
      queue.current.push(item)
      pump()
    },
    [pump]
  )

  // Which card is on screen comes from IntersectionObserver rather than
  // hand-rolled scroll math — it stays correct across touch, trackpad, and
  // the keyboard-driven scrollBy() below.
  useEffect(() => {
    const root = scrollerRef.current
    if (!root) return undefined
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting && e.intersectionRatio > 0.6)
        if (hit) setActiveId(hit.target.dataset.itemId)
      },
      { root, threshold: [0, 0.6, 1] }
    )
    root.querySelectorAll('[data-item-id]').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [items])

  // Only the current card and up to two ahead ever get summarized — never
  // the whole feed at once (BRIEF-MODE.md §1.5).
  useEffect(() => {
    const idx = items.findIndex((i) => i.id === activeId)
    if (idx === -1) return
    for (let i = idx; i <= idx + PREFETCH_AHEAD && i < items.length; i++) {
      ensureSummary(items[i])
    }
  }, [activeId, items, ensureSummary])

  const scrollByCard = useCallback((dir) => {
    const root = scrollerRef.current
    if (!root) return
    root.scrollBy({ top: dir * root.clientHeight, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); scrollByCard(1) }
      else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); scrollByCard(-1) }
      else if (e.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [scrollByCard, onExit])

  if (!items.length) {
    return (
      <div className="brief-empty">
        <p>Nothing ranked yet. Hit Check now, or switch tabs.</p>
        <button className="brief-exit-inline" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? 'Checking…' : 'Check now'}
        </button>
      </div>
    )
  }

  return (
    <div className="brief-shell">
      <button
        className="brief-refresh"
        onClick={onRefresh}
        disabled={refreshing}
        aria-label="Check for new stories"
      >
        {refreshing ? 'Checking…' : 'Check now'}
      </button>
      <div className="brief-scroller" ref={scrollerRef}>
        {items.map((item) => (
          <div className="brief-slide" key={item.id} data-item-id={item.id}>
            <BriefCard
              item={item}
              summary={summaries[item.id]}
              active={activeId === item.id}
              onRead={onRead}
              saved={savedIdSet.has(item.id)}
              onToggleSave={handleToggleSave}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
