import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadAll } from './lib/feeds'
import { load, save } from './lib/storage'
import { TOPICS, classify, pickTop, rank } from './lib/topics'
import BriefMode from './BriefMode'
import SavedScreen from './SavedScreen'
import SourcesScreen from './SourcesScreen'
import BookmarkIcon from './BookmarkIcon'
import AppBar from './AppBar'
import TabBar from './TabBar'
import { SearchIcon, RefreshIcon } from './icons'
import { prefersReducedMotion } from './lib/motion'
import { dayLabel } from './lib/dates'
import { hostOf } from './lib/url'
import {
  toggle as toggleSavedItem,
  savedIds,
  unsave as unsaveSavedItem,
  restore as restoreSavedItem,
} from './lib/saved'

const TITLES = { timeline: 'Feed', saved: 'Saved', sources: 'Sources' }

const clock = (ms) =>
  new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })

export default function App() {
  const initial = useRef(load()).current
  const [feeds, setFeeds] = useState(initial.feeds)
  const [read, setRead] = useState(() => new Set(initial.read))
  const [lastSync, setLastSync] = useState(initial.lastSync)

  const [items, setItems] = useState([])
  const [errors, setErrors] = useState([])
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [unreadOnly, setUnreadOnly] = useState(initial.prefs.unreadOnly)
  const [topic, setTopic] = useState(initial.prefs.topic)
  const [draft, setDraft] = useState('')
  const [mode, setMode] = useState(initial.prefs.mode)
  const [savedIdSet, setSavedIdSet] = useState(() => new Set(savedIds()))

  // The story Brief mode was showing when last active, so leaving it can
  // scroll Timeline back to roughly the same place.
  const lastBriefActive = useRef(null)
  const onBriefActiveChange = useCallback((id) => {
    lastBriefActive.current = id
  }, [])

  // Minimal toast, reused by the undo snackbar — one mechanism for both
  // "list is full" and "removed, undo?" messages.
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)
  function showToast(message, action) {
    clearTimeout(toastTimer.current)
    setToast({ message, ...action })
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }

  // Centralizes every unsave path — Feed's bookmark toggling off, Brief's
  // Save button toggling off, and Saved's own remove button — so savedIdSet
  // (which drives the bookmark icon everywhere) and the undo snackbar stay
  // consistent no matter where the unsave happened.
  function unsaveWithUndo(id) {
    const removed = unsaveSavedItem(id)
    setSavedIdSet((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    if (removed) {
      showToast('Removed', {
        actionLabel: 'Undo',
        onAction: () => {
          const result = restoreSavedItem(removed)
          if (result?.ok) setSavedIdSet((prev) => new Set(prev).add(id))
          else if (result?.reason === 'full') showToast('Saved list is full — remove some items.')
        },
      })
    }
    return removed
  }

  function toggleSave(item, summary) {
    if (savedIdSet.has(item.id)) {
      unsaveWithUndo(item.id)
      return
    }
    const result = toggleSavedItem(item, summary)
    if (result.reason === 'full') {
      showToast('Saved list is full — remove some items.')
      return
    }
    setSavedIdSet((prev) => new Set(prev).add(item.id))
  }

  useEffect(() => {
    save({ feeds, read: [...read], lastSync, prefs: { mode, topic, unreadOnly } })
  }, [feeds, read, lastSync, mode, topic, unreadOnly])

  async function refresh() {
    if (busy || !feeds.length) return
    setBusy(true)
    const result = await loadAll(feeds)
    setItems(result.items)
    setErrors(result.errors)
    setLastSync(Date.now())
    setBusy(false)
  }

  useEffect(() => {
    refresh()
    // Refresh once on launch; the button covers everything after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Classify once per fetch, not once per render.
  const tagged = useMemo(
    () => items.map((item) => ({ ...item, topic: classify(item).topic })),
    [items]
  )

  const top = useMemo(() => pickTop(tagged), [tagged])
  const topIds = useMemo(() => new Set(top.map((e) => e.item.id)), [top])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tagged.filter((item) => {
      if (unreadOnly && read.has(item.id)) return false
      if (topic !== 'all' && item.topic !== topic) return false
      if (!q) return true
      return (
        item.title.toLowerCase().includes(q) ||
        item.source.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q)
      )
    })
  }, [tagged, query, unreadOnly, read, topic])

  const groups = useMemo(() => {
    const out = []
    for (const item of visible) {
      const label = dayLabel(item.published)
      if (!out.length || out[out.length - 1].label !== label) out.push({ label, items: [] })
      out[out.length - 1].items.push(item)
    }
    return out
  }, [visible])

  const unreadCount = items.filter((i) => !read.has(i.id)).length

  // Ranked, not chronological — everything with a topic, capped at 30, no
  // per-source cap (that's specific to the "Top right now" band).
  const briefItems = useMemo(
    () =>
      tagged
        .filter((item) => item.topic)
        .map((item) => ({ item, score: rank(item).score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 30)
        .map((entry) => entry.item),
    [tagged]
  )

  function markRead(id) {
    setRead((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
  }

  function open(item) {
    markRead(item.id)
    if (item.link) window.open(item.link, '_blank', 'noopener')
  }

  // Timeline's entries stay mounted the whole time Brief is showing (Brief is
  // just another routed screen now, not an overlay), so this can scroll
  // straight to the target without waiting on a re-render. Runs on any nav
  // away from Brief, not just a dedicated exit button — the tab bar is the
  // only way to leave now.
  function goToTab(nextMode) {
    if (mode === 'brief' && nextMode !== 'brief') {
      const id = lastBriefActive.current
      if (id) {
        document
          .getElementById(`entry-${id}`)
          ?.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
      }
    }
    setMode(nextMode)
  }

  function addFeed(e) {
    e.preventDefault()
    let url = draft.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`
    if (feeds.some((f) => f.url === url)) return setDraft('')
    setFeeds([...feeds, { url }])
    setDraft('')
  }

  return (
    <div className="app-shell">
      {mode !== 'brief' && (
        <AppBar title={TITLES[mode]}>
          {mode === 'timeline' && (
            <>
              {unreadCount > 0 && <span className="appbar-unread">{unreadCount} new</span>}
              <button
                className="appbar-action"
                onClick={() => setSearchOpen((v) => !v)}
                aria-pressed={searchOpen}
                aria-label="Search"
              >
                <SearchIcon />
              </button>
              <button
                className="appbar-action"
                onClick={refresh}
                disabled={busy || !feeds.length}
                aria-label={busy ? 'Checking' : 'Check now'}
              >
                <RefreshIcon />
              </button>
            </>
          )}
          {mode === 'saved' && <span className="appbar-unread">{savedIdSet.size}</span>}
        </AppBar>
      )}

      <main className="app-content">
        {mode === 'timeline' && (
          <>
            {searchOpen && (
              <div className="controls">
                <input
                  className="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter by keyword"
                  aria-label="Filter releases by keyword"
                  autoFocus
                />
                <button
                  className={`chip ${unreadOnly ? 'chip-on' : ''}`}
                  onClick={() => setUnreadOnly((v) => !v)}
                  aria-pressed={unreadOnly}
                >
                  Unread
                </button>
              </div>
            )}

            {errors.length > 0 && (
              <section className="trouble">
                {errors.map((err) => (
                  <p key={err.url}>
                    <strong>{hostOf(err.url)}</strong> didn't respond. {err.message}
                  </p>
                ))}
              </section>
            )}

            <nav className="topics" aria-label="Filter by topic">
              <button
                className={`tab ${topic === 'all' ? 'tab-on' : ''}`}
                onClick={() => setTopic('all')}
                aria-pressed={topic === 'all'}
              >
                Everything
              </button>
              {Object.entries(TOPICS).map(([key, t]) => (
                <button
                  key={key}
                  className={`tab ${topic === key ? 'tab-on' : ''}`}
                  onClick={() => setTopic(key)}
                  aria-pressed={topic === key}
                >
                  {t.label}
                </button>
              ))}
            </nav>

            {topic === 'all' && !query && top.length > 0 && (
              <section className="top" aria-label="Top stories right now">
                <h2 className="top-head">Top right now</h2>
                <ol className="top-list">
                  {top.map((entry, i) => (
                    <li
                      key={entry.item.id}
                      className={read.has(entry.item.id) ? 'is-read' : ''}
                      style={{ '--row-accent': `var(--${entry.topic})` }}
                    >
                      <span className="rank">{String(i + 1).padStart(2, '0')}</span>
                      <button className="top-hit" onClick={() => open(entry.item)}>
                        <span className="top-title">{entry.item.title}</span>
                        <span className="top-meta">
                          <span className="tag">{TOPICS[entry.topic].label}</span>
                          <span className="top-source">{entry.item.source}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <div className="stream">
              {groups.length === 0 && !busy && (
                <div className="empty">
                  {feeds.length === 0
                    ? 'No sources yet. Open Sources and paste a feed URL to start tracking.'
                    : query || unreadOnly
                      ? 'Nothing matches that filter.'
                      : 'No releases found yet. Try Check now.'}
                </div>
              )}

              {groups.map((group) => (
                <section className="day" key={group.label}>
                  <h2 className="day-label">{group.label}</h2>
                  <ol className="entries">
                    {group.items.map((item) => {
                      const isRead = read.has(item.id)
                      const isTop = topIds.has(item.id) && topic === 'all' && !query
                      return (
                        <li
                          key={item.id}
                          id={`entry-${item.id}`}
                          className={`entry ${isRead ? 'is-read' : ''} ${isTop ? 'is-top' : ''}`}
                          style={item.topic ? { '--row-accent': `var(--${item.topic})` } : undefined}
                        >
                          <span className="node" aria-hidden="true" />
                          <div className="entry-row">
                            <button className="entry-hit" onClick={() => open(item)}>
                              <span className="line">
                                <span className="time">{clock(item.published)}</span>
                                <span className="source">{item.source}</span>
                                {item.topic && <span className="topic-dot">{TOPICS[item.topic].label}</span>}
                              </span>
                              <span className="title">{item.title}</span>
                              {item.summary && <span className="summary">{item.summary}</span>}
                            </button>
                            <button
                              className={`bookmark ${savedIdSet.has(item.id) ? 'bookmark-on' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleSave(item)
                              }}
                              aria-pressed={savedIdSet.has(item.id)}
                              aria-label={savedIdSet.has(item.id) ? 'Remove from Saved' : 'Save for later'}
                            >
                              <BookmarkIcon filled={savedIdSet.has(item.id)} />
                            </button>
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                </section>
              ))}
            </div>
          </>
        )}

        {mode === 'sources' && (
          <SourcesScreen feeds={feeds} setFeeds={setFeeds} draft={draft} setDraft={setDraft} addFeed={addFeed} />
        )}
      </main>

      {mode === 'brief' && (
        <BriefMode
          items={briefItems}
          onRead={markRead}
          onExit={() => goToTab('timeline')}
          onRefresh={refresh}
          refreshing={busy}
          onActiveChange={onBriefActiveChange}
          savedIdSet={savedIdSet}
          onToggleSave={toggleSave}
        />
      )}

      {mode === 'saved' && <SavedScreen onOpen={open} onUnsave={unsaveWithUndo} savedIdSet={savedIdSet} />}

      <TabBar mode={mode} onChange={goToTab} />

      {toast && (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.actionLabel && (
            <button
              onClick={() => {
                toast.onAction?.()
                setToast(null)
                clearTimeout(toastTimer.current)
              }}
            >
              {toast.actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
