// Sticky, per-screen — DESIGN.md §2.3. Not shown in Brief mode, which is
// full-bleed with no app bar at all.
export default function AppBar({ title, children }) {
  return (
    <header className="appbar">
      <h1 className="appbar-title">{title}</h1>
      {children && <div className="appbar-actions">{children}</div>}
    </header>
  )
}
