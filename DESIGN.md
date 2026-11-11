# Design spec — Pulse

**Audience:** Claude Code, working in this repo
**Companion doc:** `BRIEF-MODE.md` (the scrollable feed feature)

Do this **after** Brief mode is functional. Styling an interface whose behavior
is still changing means doing the work twice.

---

## 1. Direction

**A mature mobile app, not a dashboard.**

The reference is Apple News, Reddit, Gmail — apps people use daily without
noticing the interface. Dark, quiet, conventional where convention works.
Personality comes from typography and restraint, not from ornament.

The app is fully dark. There is no light theme — one surface done well beats two
done adequately.

### The core structural rule

**Rows, not cards.** Content lives in edge-to-edge list rows separated by 1px
dividers. Cards — bordered, rounded, padded, floating on a canvas — are reserved
for genuinely exceptional content, which in this app means the Brief mode card
and nothing else.

This is the single decision that separates an app from a web page in a wrapper.
A feed of bordered cards reads as a template; a feed of dividers reads as
software.

### What carries identity

- **Type contrast** — serif headlines against monospace metadata. Content versus
  instrumentation. This is what stops it looking generic.
- **The topic spine** — a 3px vertical bar at the left of each row in the topic
  accent, grey when read. Encodes classification and read state in one element,
  with no chips or badges needed.
- **Density** — tight rows, generous line-height inside them.

### What is banned

- Neon glow, `text-shadow` halos, glowing borders
- Glassmorphism, `backdrop-filter`, frosted panels — also a scroll-performance
  killer on Android WebView, see §6
- Gradient meshes, blurred color blobs, aurora backgrounds
- Oversized hero numerals, giant rank digits, decorative topic glyphs
- Pure black `#000000` or pure white `#FFFFFF`
- Drop shadows for elevation — use surface tint, §3
- Monospace for body text. Mono is data only.
- Emoji as UI, `border-radius` above 4px on rows
- Bordered cards as the default content container

---

## 2. Navigation

### 2.1 Information architecture

Four destinations in a persistent bottom tab bar. Fixed — the bar does not hide
on scroll.

| Tab | Icon | Contents |
|---|---|---|
| **Feed** | list | The chronological timeline. Default on launch. |
| **Brief** | cards | Full-screen ranked reading mode |
| **Saved** | bookmark | Items marked to read later |
| **Sources** | settings | Feed management, keyword filters, preferences |

Brief mode becomes a **tab**, not a header toggle. `BRIEF-MODE.md` §1.7
specifies a mode switch in the app bar — supersede that.

Saved is specified in `SAVED.md`. Build it, or ship three tabs — never a dead
fourth.

### 2.2 Tab bar

```
height: 56px + env(safe-area-inset-bottom)
background: #0D1015        /* one step off --void, so it reads as chrome */
border-top: 1px solid var(--hairline)
```

Each tab: 21px outline icon above an 11px label, both `--action` when active and
`--ink-faint` otherwise. No pill, no background fill on the active tab — the
color change is enough.

Icons: inline SVG, 1.5px stroke, outline only. Do not add an icon library for
four glyphs.

### 2.3 App bar

```
height: 52px, plus env(safe-area-inset-top) above it
background: var(--void)
```

Left: screen title, 20px, weight 500, `--ink`. Not a logo — the tab bar already
establishes where you are.

Right: icon actions at 19px, `--ink-dim`, 44px tap targets. Feed gets search and
refresh. Unread count sits left of them in `--t-meta` mono `--ink-faint`.

The app bar is sticky. Its bottom border is `--hairline`, brightening to `--edge`
once content scrolls beneath it — see §7.5.

### 2.4 Filter tabs

Directly under the app bar on Feed: All / Innovation / Fintech / Deep tech.
Horizontally scrollable, no scrollbar.

Active tab is `--ink` with a 2px `--action` underline; inactive is `--ink-faint`
with no underline. 13px, sentence case, **not** uppercase mono — these are
navigation, not data.

---

## 3. Color

### 3.1 Surfaces

```css
--void:      #0A0C10;  /* page background            */
--chrome:    #0D1015;  /* tab bar, sheets            */
--panel:     #111419;  /* Brief card, elevated rows  */
--raised:    #171B22;  /* inputs, pressed states     */
--overlay:   #1E232C;  /* modals, menus              */

--hairline:  #232833;  /* section rules, borders     */
--divider:   #1A1E26;  /* between list rows — quieter */
--edge:      #2E3542;  /* emphasised rules            */
```

Row dividers use `--divider`, not `--hairline`. A list of 40 rows separated by
full-strength rules reads as a table; the divider needs to be barely there.

Never `#000`. `--void` is blue-leaning near-black.

### 3.2 Text

```css
--ink:       #F2F4F8;  /* headlines, primary   — 17.4:1 */
--ink-dim:   #BCC4D2;  /* body, summaries      — 10.6:1 */
--ink-faint: #8D97A8;  /* metadata, timestamps —  5.9:1 */
--ink-off:   #6B7488;  /* read items, disabled —  3.6:1 */
```

Every tier except `--ink-off` clears 4.5:1. Timestamps and source names get real
contrast because you read them while scanning.

**Dark-mode text weight.** Light-on-dark renders visually thinner than the
inverse:

- **Remove `-webkit-font-smoothing: antialiased`** from `body`. It thins glyphs,
  which is the opposite of what a dark theme needs.
- Mono metadata goes to weight 500. Small uppercase mono is the first thing to
  disappear.
- Never weight 600 or above — heavy weights bloom on dark.

### 3.3 Accents

```css
--innovation: #FF8360;  /* ember  */
--fintech:    #3DD9A4;  /* mint   */
--deeptech:   #8B7CFF;  /* violet */

--action:     #6E8CFF;  /* interactive: active tab, focus, links */
--alert:      #FF6B75;  /* errors                                */
```

All clear 4.5:1 against `--void` and `--panel`.

**Accents appear in exactly three places:** the row spine, the active filter-tab
underline, and the Brief progress rail. They never fill backgrounds, never tint
body text, and never appear as chips or badges on rows.

This is deliberate restraint. The earlier draft used colored pills on every row;
it looked like a status dashboard.

---

## 4. Elevation

Shadows barely register on dark and cost repaints while scrolling. Depth comes
from surface tint (§3.1) plus a single hairline. That is the entire system.

The Brief card is the only element with a border and radius:

```css
background: var(--panel);
border: 1px solid var(--hairline);
border-radius: 4px;
```

List rows have no background, no border, no radius — only a bottom divider.

---

## 5. Typography

### 5.1 Faces

| Role | Face | Used for |
|---|---|---|
| Display | Newsreader | Headlines only |
| Body | Spline Sans | Summaries, takeaways, UI labels, tabs |
| Mono | JetBrains Mono | Timestamps, sources, counts, day labels |

Bundle locally in `src/fonts/`, declare `@font-face` with `font-display: swap`,
and remove the Google Fonts `<link>` from `index.html`. The APK should not need
a network round-trip to render text, and a font swap mid-scroll causes a visible
reflow.

### 5.2 Scale

```css
--t-micro: 11px;   /* lh 1.4  — mono: day labels, tab labels     */
--t-meta:  12.5px; /* lh 1.45 — mono: timestamps, sources        */
--t-nav:   13px;   /* lh 1.4  — body: filter tabs                */
--t-row:   15px;   /* lh 1.35 — display: row headlines           */
--t-body:  16px;   /* lh 1.62 — body: summaries, takeaways       */
--t-title: 20px;   /* lh 1.3  — body: app bar title              */
--t-brief: 26px;   /* lh 1.25 — display: Brief headlines         */
```

Nothing below 11px anywhere. Body at 16px — the size at which sustained reading
stops being work.

### 5.3 Treatment

- Mono: uppercase, `letter-spacing: 0.04em`, weight 500
- Display: `letter-spacing: -0.01em`, weight 500
- Body and navigation: sentence case, normal tracking, weight 400
- Filter tabs and nav labels are **sentence case**, never uppercase. Uppercase is
  reserved for mono data.

---

## 6. Scroll performance

**The most important section here.** All of it targets 60fps in the Android
WebView, which is far less forgiving than desktop Chrome.

### 6.1 The one rule

**Only `transform` and `opacity` may animate.** They run on the compositor
without touching layout or paint. Animating `width`, `height`, `top`, `margin`,
or `box-shadow` forces layout every frame and is the main cause of jank.

### 6.2 Never read layout during scroll

`getBoundingClientRect()`, `offsetTop`, and `scrollHeight` force synchronous
layout. Called from a scroll handler they run every frame and guarantee stutter.

Use `IntersectionObserver` for every visibility question — which card is active,
when to mark read, when to prefetch. The browser computes it off the main thread.

```js
useEffect(() => {
  const io = new IntersectionObserver(handle, { threshold: 0.6 })
  cards.forEach(c => io.observe(c))
  return () => io.disconnect()
}, [])
```

If a scroll listener is unavoidable, register it `{ passive: true }` and do
nothing inside but set a flag.

### 6.3 Brief container

```css
.brief {
  height: 100dvh;
  overflow-y: auto;
  scroll-snap-type: y mandatory;
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
}

.brief-card {
  height: 100dvh;
  scroll-snap-align: start;
  scroll-snap-stop: always;
  content-visibility: auto;
  contain-intrinsic-size: 100dvh;
}
```

`content-visibility: auto` is the highest-leverage line — the browser skips
rendering offscreen cards entirely. `contain-intrinsic-size` must accompany it or
the scroll position jumps as cards render.

Use `100dvh`, not `100vh`. `vh` ignores mobile browser chrome and the card gets
clipped.

### 6.4 Long lists

Do not virtualize below 200 items. `content-visibility: auto` on rows covers this
range and the timeline caps well under it. If it ever exceeds 200, cap the render
rather than adding a virtual list library.

### 6.5 `will-change`

Promotes an element to its own compositor layer. Applied broadly it exhausts GPU
memory and makes things slower. Apply only to the element currently animating and
remove after. Never in a static rule matching many elements.

### 6.6 Images

Every `<img>` needs explicit `width` and `height`, or layout shifts as each
loads — visible as content jumping mid-scroll. Also `loading="lazy"` and
`decoding="async"`.

### 6.7 Verify

Chrome DevTools → Performance, record while scrolling. Look for tasks over 50ms
and layout thrash during scroll. Then check on the actual phone; the emulator is
more forgiving than real hardware.

---

## 7. Motion

Motion communicates state change. It is not decoration.

```css
--ease:     cubic-bezier(0.2, 0, 0, 1);
--dur-fast: 120ms;   /* taps, tab switches  */
--dur-base: 200ms;   /* card entry          */
--dur-slow: 300ms;   /* read-state change   */
```

Nothing over 300ms.

**Permitted moments:**

1. **Brief card entry** — 200ms opacity 0→1 with `translateY(8px)→0`
2. **Read-state change** — the row spine fades from accent to `--divider` over
   300ms, so marking read is perceptible
3. **Tap feedback** — `scale(0.98)` over 120ms
4. **Filter tab change** — underline slides via `transform: translateX()`, never
   by animating `left`
5. **Progress rail** — `transform: scaleY()` driven by `animation-timeline:
   scroll()`, never by a scroll handler

All inside `@media (prefers-reduced-motion: no-preference)`. With reduced motion,
snapping still works — only animation drops.

**Not permitted:** page transitions, parallax, staggered list reveals, skeleton
shimmer (static `--raised` blocks instead), spinners on cards, tab bar hiding on
scroll.

### 7.5 App bar border

The app bar's bottom border starts `--hairline` and brightens to `--edge` once
content scrolls under it. Implement as an opacity crossfade between two stacked
1px elements, driven by `IntersectionObserver` on a sentinel div at the top of
the scroll container. Do not animate `border-color`.

---

## 8. Component states

| State | Treatment |
|---|---|
| Default | as specified |
| Hover | background `--raised`. No lift, no scale. |
| Active | `transform: scale(0.98)`, `--dur-fast` |
| Focus-visible | 2px `--action` outline, 2px offset. Never removed. |
| Disabled | `--ink-off`, `pointer-events: none`. No opacity tricks. |

**Wrap all hover rules in `@media (hover: hover)`.** On Android, hover styles
latch after a tap and the element looks stuck.

Tap targets 44px minimum. Reach it with padding, not height.

---

## 9. Screens

### 9.1 Feed

App bar (§2.3) → filter tabs (§2.4) → sticky day label → rows.

**Row anatomy**, 16px horizontal padding, 13px vertical:

```
│ ▌  Stripe launches embedded finance API        │  ← 3px spine, --t-row serif
│ ▌  09:14 · TECHCRUNCH · $6.5B                  │  ← --t-meta mono, --ink-faint
└────────────────────────────────────────────────┘  ← 1px --divider
```

- Spine: 3px wide, full row height, 2px radius, topic accent. `--divider` once
  read.
- Headline: `--t-row`, `--ink`. Two-line clamp.
- Metadata: time, source, and the top key figure if the item has one. Middot
  separated. Key figures appear here, not as a hero element.
- Bookmark icon at the right edge, 20px in a 44px target. See `SAVED.md` §2.2.
- Read rows: headline drops to `--ink-off`, metadata stays `--ink-faint`. Never
  reduce opacity — it makes text muddy on dark.

Day labels: `position: sticky`, `--void` background, `--t-micro` mono
`--ink-faint`, 14px top padding.

### 9.2 Brief

Full-bleed on `--void`, tab bar still visible. Card content constrained to 560px,
vertically centred.

Layout: mono eyebrow (topic · source · time) → headline `--t-brief` → 3–5
takeaways at `--t-body` → key figures row → actions.

Key figures render as small `--raised` chips with `--ink-dim` text and a 1px
`--hairline` border. Not accent-filled.

Progress rail on the right edge: 3px wide, one segment per card, 2px gaps.
Current segment in the topic accent, others `--divider`.

Safe areas matter here — it is the one full-bleed screen:

```css
padding-top: env(safe-area-inset-top);
padding-bottom: calc(56px + env(safe-area-inset-bottom));
```

### 9.3 Sources

Standard settings layout. Grouped sections with `--t-micro` mono uppercase
headers in `--ink-faint`, rows separated by `--divider`.

Each feed row: name in `--t-body`, URL beneath in `--t-meta` mono `--ink-off`,
chevron to a detail screen holding the keyword filter and a remove action. Do not
put an inline text input on every row — it made the list unscannable.

### 9.4 Empty and error states

`--ink-dim` at `--t-body`, left-aligned, `--hairline` top rule. No illustrations,
no icons. Say what happened and what to do.

---

## 10. Implementation order

1. Replace the `:root` block with the tokens above. Verify the app still renders.
2. Build the tab bar and app bar shell. Route between four screens.
3. Convert the timeline from cards to rows with spines and dividers.
4. Apply the type scale. Every hardcoded `px` becomes a token.
5. States and motion.
6. Bundle fonts locally, drop the Google Fonts link.
7. Scroll performance pass — §6 in full, profiled on a real device.

Commit after each. Step 3 is the one that changes how the app feels.

**Every color and size in `styles.css` must reference a token.** If a value is
needed that this document lacks, add a token rather than inlining it.

---

## 11. Acceptance criteria

**Structure**
- [ ] Bottom tab bar persistent across all four screens, does not hide on scroll
- [ ] Feed items are rows with dividers — no bordered cards in the list
- [ ] Brief mode is a tab, not a header toggle
- [ ] App bar title reflects the current screen
- [ ] Safe-area insets handled on tab bar and Brief

**Visual**
- [ ] No `#000` or `#FFF` anywhere
- [ ] Every color and font-size traces to a `:root` token
- [ ] All text except `--ink-off` clears 4.5:1
- [ ] No font-size below 11px
- [ ] `-webkit-font-smoothing: antialiased` removed from body
- [ ] Accents appear only on spines, the active tab underline, and the rail
- [ ] Nothing from §1 "What is banned" appears in the diff

**Performance**
- [ ] No `backdrop-filter` anywhere
- [ ] Only `transform` and `opacity` in transitions and animations
- [ ] No `getBoundingClientRect` or `offsetTop` inside a scroll handler
- [ ] Brief cards use `content-visibility: auto` with `contain-intrinsic-size`
- [ ] All hover rules wrapped in `@media (hover: hover)`
- [ ] Fonts load from `src/fonts/`, no external font requests
- [ ] 60fps scrolling verified on a physical phone
- [ ] Layout intact at 360px wide
- [ ] `prefers-reduced-motion` removes animation, preserves snapping
