import BookmarkIcon from './BookmarkIcon'

function FeedIcon() {
  return (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  )
}

function BriefIcon() {
  return (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <line x1="8" y1="9" x2="16" y2="9" strokeLinecap="round" />
      <line x1="8" y1="13" x2="14" y2="13" strokeLinecap="round" />
    </svg>
  )
}

function SourcesIcon() {
  return (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="3.2" />
      <line x1="12" y1="2.5" x2="12" y2="5.5" />
      <line x1="12" y1="18.5" x2="12" y2="21.5" />
      <line x1="2.5" y1="12" x2="5.5" y2="12" />
      <line x1="18.5" y1="12" x2="21.5" y2="12" />
      <line x1="5.1" y1="5.1" x2="7.2" y2="7.2" />
      <line x1="16.8" y1="16.8" x2="18.9" y2="18.9" />
      <line x1="5.1" y1="18.9" x2="7.2" y2="16.8" />
      <line x1="16.8" y1="7.2" x2="18.9" y2="5.1" />
    </svg>
  )
}

const TABS = [
  { key: 'timeline', label: 'Feed', Icon: FeedIcon },
  { key: 'brief', label: 'Brief', Icon: BriefIcon },
  { key: 'saved', label: 'Saved', Icon: () => <BookmarkIcon filled={false} /> },
  { key: 'sources', label: 'Sources', Icon: SourcesIcon },
]

export default function TabBar({ mode, onChange }) {
  return (
    <nav className="tabbar" aria-label="Main navigation">
      {TABS.map(({ key, label, Icon }) => (
        <button
          key={key}
          className={`tabbar-item ${mode === key ? 'tabbar-item-on' : ''}`}
          onClick={() => onChange(key)}
          aria-pressed={mode === key}
        >
          <span className="tabbar-icon" aria-hidden="true">
            <Icon />
          </span>
          <span className="tabbar-label">{label}</span>
        </button>
      ))}
    </nav>
  )
}
