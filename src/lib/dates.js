// Shared by Timeline and Saved — both group rows into day buckets, just keyed
// off a different timestamp (published vs savedAt).
const DAY = 86400000

export function dayLabel(ms) {
  const d = new Date(ms)
  const today = new Date()
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((startOf(today) - startOf(d)) / DAY)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

// "2d ago" style — once something has sat in a list for a while, how long
// ago it was saved is the useful fact, not the exact time.
export function relativeTime(ms, now = Date.now()) {
  const diff = Math.max(0, now - ms)
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}
