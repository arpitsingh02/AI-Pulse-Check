import { hostOf } from './lib/url'

// DESIGN.md §9.3 describes a two-level list -> per-feed detail screen so the
// keyword input isn't inline on every row. Keeping the existing single-level
// list for now — the structural win here is Sources being a real screen
// instead of a panel buried inside Feed; the drill-down detail view is a
// further refinement, not done in this pass.
export default function SourcesScreen({ feeds, setFeeds, draft, setDraft, addFeed }) {
  return (
    <div className="sources-screen">
      <ul className="sources">
        {feeds.map((feed) => (
          <li key={feed.url}>
            <span className="host">{feed.name || hostOf(feed.url)}</span>
            <span className="path">{feed.url}</span>
            <input
              className="match"
              value={feed.match || ''}
              onChange={(e) =>
                setFeeds(feeds.map((f) => (f.url === feed.url ? { ...f, match: e.target.value } : f)))
              }
              placeholder="Only show items matching: launch, raises, releases…"
              aria-label={`Keyword filter for ${feed.name || hostOf(feed.url)}`}
            />
            <button
              className="drop"
              onClick={() => setFeeds(feeds.filter((f) => f.url !== feed.url))}
              aria-label={`Remove ${feed.name || hostOf(feed.url)}`}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form className="add" onSubmit={addFeed}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Paste a feed URL"
          aria-label="Feed URL"
        />
        <button type="submit">Add feed</button>
      </form>
    </div>
  )
}
