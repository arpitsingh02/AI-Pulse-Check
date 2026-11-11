// Caches condensed article summaries, one localStorage entry per item —
// separate from the single feeds/read blob in storage.js, so writing or
// evicting one summary never touches the rest of that state. See
// BRIEF-MODE.md §1.5 and §2.
const PREFIX = 'summary:'
const MAX_ENTRIES = 300

const keyFor = (itemId) => `${PREFIX}${itemId}`

export function getSummary(itemId) {
  try {
    const raw = localStorage.getItem(keyFor(itemId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function hasSummary(itemId) {
  return localStorage.getItem(keyFor(itemId)) !== null
}

// entry: { takeaways, keyFigures, readingMinutes, wordCount, source, status }
// `generatedAt` is stamped here rather than by the caller, so eviction
// ordering is always trustworthy. Callers should check hasSummary() first —
// this module doesn't dedupe on its own.
export function setSummary(itemId, entry) {
  const record = { ...entry, generatedAt: Date.now() }
  const json = JSON.stringify(record)
  try {
    localStorage.setItem(keyFor(itemId), json)
  } catch {
    // Storage full — evict the oldest quarter and retry once.
    evictOldest(Math.ceil(MAX_ENTRIES / 4))
    try {
      localStorage.setItem(keyFor(itemId), json)
    } catch {
      // Still failing — give up silently, same as storage.js's save().
      return
    }
  }
  enforceLimit()
}

// localStorage.key(i) enumeration order isn't guaranteed by the spec, so
// "oldest" is always determined by each entry's own generatedAt, never by
// scan position.
function allEntries() {
  const entries = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k || !k.startsWith(PREFIX)) continue
    let generatedAt = 0
    try {
      generatedAt = JSON.parse(localStorage.getItem(k))?.generatedAt || 0
    } catch {
      // Corrupt entry — treat as oldest so it gets cleared first.
    }
    entries.push({ key: k, generatedAt })
  }
  return entries
}

function evictOldest(count) {
  const oldest = allEntries()
    .sort((a, b) => a.generatedAt - b.generatedAt)
    .slice(0, count)
  for (const e of oldest) localStorage.removeItem(e.key)
}

function enforceLimit() {
  const entries = allEntries()
  if (entries.length > MAX_ENTRIES) evictOldest(entries.length - MAX_ENTRIES)
}
