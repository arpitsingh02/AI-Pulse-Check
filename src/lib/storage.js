// localStorage persists inside the Android WebView the same way it does in a
// browser, so the feed list and read state survive app restarts.
const KEY = 'pulse.v4'
// v3 predates Brief mode's `prefs` key. Read from it once so upgrading users
// don't lose their feed list and read history.
const OLD_KEY = 'pulse.v3'

// `match` is optional. When set, only items whose title or summary contain one
// of the comma-separated keywords are kept. Topic-specific feeds usually don't
// need it; the firehose feeds do.
const DEFAULTS = {
  feeds: [
    // Deep tech / AI
    { url: 'https://techcrunch.com/category/artificial-intelligence/feed/', name: 'TechCrunch AI', match: '' },
    { url: 'https://venturebeat.com/category/ai/feed/', name: 'VentureBeat AI', match: '' },

    // Fintech
    { url: 'https://techcrunch.com/category/fintech/feed/', name: 'TechCrunch Fintech', match: '' },

    // Funding and venture — where most innovation signal shows up first
    { url: 'https://techcrunch.com/tag/funding/feed/', name: 'TechCrunch Funding', match: '' },

    // Hacker News, filtered to stories that actually landed
    { url: 'https://hnrss.org/frontpage?points=150&count=50', name: 'Hacker News', match: '' },

    // Broad feeds, narrowed by keyword
    { url: 'https://www.engadget.com/rss.xml', name: 'Engadget', match: 'launches, unveils, announces, introduces, debuts, first' },
    { url: 'https://www.cbinsights.com/research/feed/', name: 'CB Insights', match: '' },
  ],
  read: [],
  lastSync: null,
  prefs: { mode: 'timeline', topic: 'all', unreadOnly: false },
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }

    // First run after the v4 upgrade — carry feeds and read history forward.
    // The old blob has no `prefs`, so it just falls through to the default.
    const legacy = localStorage.getItem(OLD_KEY)
    if (legacy) return { ...DEFAULTS, ...JSON.parse(legacy) }

    return { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

export function save(state) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        feeds: state.feeds,
        // Cap the read log so it can't grow without bound.
        read: state.read.slice(-4000),
        lastSync: state.lastSync,
        prefs: state.prefs,
      })
    )
  } catch {
    // Storage full or blocked — the app still works for this session.
  }
}

export function defaultFeeds() {
  return DEFAULTS.feeds.map((f) => ({ ...f }))
}
