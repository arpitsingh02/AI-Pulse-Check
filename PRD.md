# PRD — Brief mode and visual refresh

**Project:** Pulse
**Status:** Ready to implement
**Audience:** Claude Code, working in this repo

---

## 1. Context

Pulse currently shows a chronological timeline of items from topic-specific RSS
feeds, with a ranked "Top right now" band. It works. Two gaps:

1. Scanning headlines doesn't tell you what actually happened. RSS descriptions
   are one-line excerpts, and Hacker News items have no description at all.
2. The interface is functional but plain, and the reading experience is the
   product.

This document specifies two changes. **Feature A is the substantial one** and has
a genuine architectural decision inside it. Feature B is presentation work.

---

## 2. Feature A — Brief mode

### 2.1 User story

> I open Pulse with five minutes free. I switch to Brief mode and swipe through
> ranked stories one screen at a time. Each screen tells me what happened and
> why it matters in about fifteen seconds. When something is worth more, I tap
> through to the original.

### 2.2 The hard part, stated plainly

**RSS feeds do not contain enough text to summarize.**

This is the crux of the feature and must be solved before anything else.
Observed reality across the configured feeds:

| Feed | What `<description>` contains |
|---|---|
| TechCrunch (all) | One-paragraph excerpt, ~40 words |
| VentureBeat AI | One-paragraph excerpt |
| Engadget | Short excerpt |
| Hacker News (hnrss) | Points and comment count only — no article text |
| CB Insights | Varies, often marketing copy |

So a "meaty, informative summary" requires **fetching the article itself**, then
condensing it. That is a three-stage pipeline: fetch → extract → summarize.

### 2.3 Pipeline

```
item ──▶ [0] feed has full text? ──▶ yes ──────────────────┐
             content:encoded                                  │
                  │ no                                        ▼
                  ▼                                     [3] condense ──▶ cache ──▶ render
         [1] fetch article HTML ──▶ [2] extract text ──▶   local, free    localStorage
             CapacitorHttp             Readability
             / dev proxy
```

**Stage 1 — Fetch.** Reuse the existing transport in `src/lib/feeds.js`
(`CapacitorHttp` on native, `/__feed` proxy in dev). Extend `fetchRaw` or extract
a shared `fetchText(url)` helper. Do not write a second fetch path.

**Stage 2 — Extract.** Strip nav, ads, and boilerplate to get article body text.
Use `@mozilla/readability` with `linkedom` (works in both browser and WebView),
or DOMParser plus a heuristic that scores `<article>`, `<main>`, and the densest
`<p>` cluster. Cap extracted text at ~8000 characters before sending onward.

**Stage 3 — Condense.** Score and select the most informative sentences from the
extracted text. No network call, no API key, no cost. See §2.4 for the algorithm.

**Before stages 1–2, check the feed first.** WordPress feeds (TechCrunch,
VentureBeat, CB Insights) often carry the entire article in a `content:encoded`
element that the current parser ignores. When present and over ~1200 characters,
use it and skip fetching the page. This is free, instant, and avoids anti-bot
blocks. Add `content:encoded` handling to `parseFeed` in `feeds.js` — it is
namespaced, so `getElementsByTagName('content:encoded')` may need
`getElementsByTagNameNS` or a fallback scan.

### 2.4 Condensing without an LLM

**Decision made: no LLM API.** No key to manage, no per-article cost, no
exposure in the APK, and it works offline once cached.

The tradeoff, stated honestly: this **selects** sentences rather than writing
new ones. Output will read slightly choppier than generated prose, and
significance can't be synthesized — so there is no "why it matters" line. What
it does well is surface the sentences carrying actual facts, which is most of
the value.

This works better than it sounds for news specifically. Articles are written
inverted-pyramid: the lead paragraphs contain who, what, how much, and when.
Selecting well-chosen sentences from a news article gets you most of the way;
the same approach on an essay would not.

**Algorithm** (`src/lib/condense.js`, pure functions, no I/O):

1. **Split into sentences.** Use `Intl.Segmenter` with `{ granularity: 'sentence' }`
   where available — it handles abbreviations far better than a regex. Fall back
   to a period/question/exclamation split guarded against `Mr.`, `Inc.`, `U.S.`,
   and decimals.

2. **Discard junk.** Drop sentences under 40 or over 350 characters, plus
   boilerplate: "Sign up for", "Read more", "This article originally", bylines,
   photo credits, cookie notices.

3. **Score each sentence** and sum:

   | Signal | Weight | Rationale |
   |---|---|---|
   | Position — first 3 sentences | +3, +2, +1 | Inverted pyramid: the lead holds the news |
   | Numbers, currency, percentages | +2 each, cap +4 | Facts, not framing |
   | Capitalized multi-word phrases (companies, people) | +1 each, cap +3 | Concrete actors |
   | Topic terms from `topics.js` `strong` list | +2 each, cap +4 | Relevance to this reader |
   | Reporting verbs — launched, raised, acquired, announced, shipped | +2 | Events over commentary |
   | Quote marks | −1 | Reactions are usually less informative than facts |
   | Hedges — could, may, might, reportedly | −1 | Speculation |

4. **Remove redundancy.** Greedily select highest-scoring, but skip any sentence
   whose bag-of-words overlaps an already-selected one by more than 50%
   (Jaccard). Otherwise the top 3 are often three restatements of the headline.

5. **Restore reading order.** Output selected sentences in their original
   document order, not score order, so they read as a coherent passage.

6. **Take 3–5**, targeting roughly 60–90 words total.

**Also extract, since it's free and useful:**

- **Key figures** — every currency amount, percentage, and round name (Series A/B/C)
  found in the text, deduplicated. Renders as chips. Replaces "why it matters"
  in the card, and is often the single most useful element on screen.
- **Reading time** — word count / 220, rounded up.

**A working implementation already exists in `tune.mjs`.** It fetches real
articles from a feed, condenses them, and prints per-sentence score breakdowns.
Port `WEIGHTS`, `scoreSentence`, and `condense` from it into `condense.js`
rather than writing from scratch — drop the fetching and reporting code.

**Tune before building UI.** See `TUNING.md` for the method. This is 20–40
minutes that determines whether the feature is useful, and it is far faster than
tuning through the interface.

**Hacker News caveat.** HN items link to the underlying article, so stage 1
fetches that and condensing works normally. But HN links to PDFs, GitHub repos,
and video — detect non-HTML content types and skip to the failure ladder rather
than condensing markup.

### 2.5 Caching and cost control

Condensing is free, but fetching articles is slow and can be rate-limited by
publishers. An article doesn't change, so cache hard.

- Key: `summary:<item.id>` in localStorage, alongside existing keys
- Store `{ takeaways, keyFigures, readingMinutes, wordCount, generatedAt, source, status }`
- Never re-summarize a cached item
- Evict oldest when the cache passes ~300 entries (localStorage limits are
  around 5MB; a summary is roughly 1KB)
- **Fetch lazily.** Only cards the user actually reaches get fetched. Never
  batch-fetch the whole feed on refresh — hammering a publisher with 50 requests
  is the fastest way to get your IP blocked.
- Items whose text came from `content:encoded` need no fetch at all and can be
  condensed instantly on refresh.
- Prefetch **2 cards ahead** of the current position, max **2 concurrent**
  requests

### 2.6 Failure ladder

Every stage can fail. A card must never render blank. Degrade in this order:

1. Full pipeline succeeded → takeaways + key figures
2. Text extracted but too short to condense (< ~5 usable sentences) → show it
   verbatim, marked "Excerpt"
3. Extraction failed (paywall, JS-rendered page, 403) → show RSS description,
   marked "From feed"
4. Nothing available → headline, source, timestamp, and a clear "Open original"
   action

Paywalled sources will hit level 3 routinely. That is expected, not a bug. Show
the state honestly rather than hiding it.

### 2.7 Interaction

- Vertical, one card per viewport, CSS `scroll-snap-type: y mandatory`
- Works with touch swipe, trackpad, and arrow keys / `j`/`k`
- Cards ordered by the existing `rank()` score from `topics.js`, not
  chronologically — Brief mode is a highlights reel, not an archive
- Respects the active topic tab
- Reaching a card marks it read after ~2 seconds visible (not instantly — a fast
  scroll past shouldn't count as read)
- Entry point: a mode toggle in the header, `Timeline` / `Brief`
- Exiting Brief returns to the timeline at roughly the equivalent position
- `prefers-reduced-motion`: disable smooth-scroll animation, keep snapping

### 2.8 Loading state

Summaries take a few seconds. Never show a spinner on a blank card. Render the
headline, source, topic tag, and timestamp immediately — those are already
known — and skeleton-load only the takeaway block. The card should feel present
from the moment it's reached.

---

## 3. Feature B — Visual refresh

### 3.1 Principles

Keep the existing identity; sharpen it. Do not restyle wholesale, and do not
introduce a component library.

Two things are load-bearing and must survive:
- **The timeline gutter** — hairline rule, filled dot for unread, hollow for
  read, day breaks labelled in the gutter. This is the app's signature.
- **The type contrast** — serif headlines (content) against mono metadata
  (instrumentation). Titles are the only thing actually read.

### 3.2 Topic colors

Currently one indigo accent does all the work. Give each topic its own hue, so
color carries information instead of decoration:

```css
--signal:     #3A2FBF;  /* existing indigo — UI actions, unchanged        */
--innovation: #B0453B;  /* clay red                                        */
--fintech:    #0E7C6B;  /* deep teal                                       */
--deeptech:   #4A3AAE;  /* violet, adjacent to signal                      */
```

Apply to topic tags, tab underlines, and Brief mode card accents. Do **not**
tint headline text or backgrounds — legibility first. All four must clear 4.5:1
against `--paper` and `--card`.

### 3.3 Brief mode surface

Brief mode inverts to a dark surface. This is deliberate and is the one place
the app departs from the light timeline: a full-bleed immersive reading mode
benefits from a receding background, the same reason reading apps offer one.

```css
--brief-bg:    #14161C;
--brief-card:  #1C1F27;
--brief-ink:   #ECEDF0;
--brief-muted: #8A909D;
```

Topic accents stay the same hues, lightened for dark-surface contrast.

### 3.4 Brief card anatomy

```
┌────────────────────────────────────┐
│ FINTECH · TECHCRUNCH · 2H AGO    ▌ │  ← mono eyebrow, topic-colored
│                                  ▌ │
│ Stripe launches embedded         ▐ │  ← Newsreader, 26–30px, max 3 lines
│ finance API for neobanks         ▌ │
│                                  ▌ │  ← progress rail, right edge
│ ─────                            ▌ │
│                                  ▌ │
│ ▸ Concrete takeaway with a       ▌ │  ← 3–5 items, body face, 15px
│   number or name in it.          ▌ │
│ ▸ Second takeaway.               ▌ │
│ ▸ Third takeaway.                ▌ │
│                                  ▌ │
│ KEY FIGURES                      ▌ │  ← mono label
│ [$200M] [Series C] [40%]         ▌ │  ← extracted chips, topic-colored
│                                  ▌ │
│ [ Open original ]      4 min read  │
└────────────────────────────────────┘
```

**Signature element: the progress rail.** A thin vertical bar on the right edge
showing position in the ranked stack — segment count equals card count, current
segment filled in the topic color. It encodes real information (how many
remain), which is exactly what's missing from an infinite-feed interface, and it
gives the mode a recognizable silhouette.

### 3.5 Type scale

The current scale jumps from 10.5px mono to 19px serif with nothing between,
which is why the timeline reads flat. Replace with an explicit scale and use
only these values:

| Token | Size / line-height | Face | Used for |
|---|---|---|---|
| `--t-micro` | 10px / 1.4 | mono | rank numbers, day labels, tags |
| `--t-meta` | 11.5px / 1.45 | mono | timestamps, source names, buttons |
| `--t-body` | 14.5px / 1.55 | body | summaries, takeaways, descriptions |
| `--t-title` | 18px / 1.3 | display | timeline headlines |
| `--t-lead` | 22px / 1.28 | display | Top band headlines |
| `--t-brief` | 27px / 1.22 | display | Brief mode headlines |

Mono is always uppercase with `letter-spacing: 0.06em`. Display is always
`letter-spacing: -0.01em` — serifs at size need tightening, small caps need
opening. That contrast is the type system's whole idea.

### 3.6 Spacing

Use a 4px base. Only these: `4, 8, 12, 16, 24, 32, 48`. No arbitrary values.
Vertical rhythm inside a card should be tighter than the gap between cards, so
grouping is obvious without borders doing the work.

### 3.7 Component states

Every interactive element needs four states defined. Currently only default and
focus exist, which is why the app feels static:

| State | Treatment |
|---|---|
| Default | as specified |
| Hover (pointer only) | background lifts one step; no movement, no scale |
| Active / pressed | background darkens one step, `transform: scale(0.98)` |
| Focus-visible | 2px `--signal` outline, 2px offset — never removed |
| Disabled | `--muted` text, no pointer events, no opacity tricks |

Wrap hover rules in `@media (hover: hover)`. On Android, hover styles stick
after a tap and look broken.

### 3.8 Motion

Sparing and purposeful. Three moments only:

1. **Card entry in Brief mode** — 180ms fade + 6px rise as a card snaps in
2. **Read-state change** — the timeline dot transitions from filled to hollow
   over 240ms, so marking read is visible rather than instant
3. **Refresh** — the progress counter updates; no spinner

Easing: `cubic-bezier(0.2, 0, 0, 1)` throughout. Nothing longer than 300ms.
All of it inside `@media (prefers-reduced-motion: no-preference)`.

**No** page transitions, parallax, staggered list animations, or skeleton
shimmer. Skeletons should be static blocks in `--rule`.

### 3.9 Timeline refinements

Specific, bounded changes — not a redesign:

- Day labels stick to the top of the viewport while their group scrolls
  (`position: sticky`), with the gutter rule passing behind them
- Refresh button shows progress as `3 / 7` rather than a static "Checking…"
- Top band rank numbers get `font-variant-numeric: tabular-nums` and more room
- Each topic tab gets an unread count in `--t-micro`
- Source names truncate with ellipsis at one line rather than wrapping

### 3.10 What not to do

Explicitly out of bounds. These are the defaults that would make it look like
every other generated interface:

- No gradients anywhere, including on the Brief cards
- No drop shadows — separation comes from hairline rules and surface color
- No border-radius above 3px; the current 2px is the house style
- No icon library. The few icons needed should be inline SVG.
- No emoji as UI elements
- No card-hover-lift effects
- Don't replace the timeline gutter with a standard card list. It is the one
  thing that makes this app look like itself.

### 3.11 Quality floor

Non-negotiable, and not worth announcing in the UI:

- Works down to 360px wide (the Android target)
- Visible keyboard focus on every interactive element
- `prefers-reduced-motion` respected throughout
- Safe-area insets handled — Brief mode is full-bleed and will otherwise collide
  with the notch and gesture bar
- Tap targets at least 44px
- All text passes 4.5:1 against its background, in both light and Brief surfaces

## 4. Data model changes

`storage.js` gains:

```js
// New keys
summary:<itemId>   → { takeaways, keyFigures, readingMinutes, wordCount,
                       generatedAt, source: 'feed'|'article'|'excerpt', status }
prefs              → { mode: 'timeline' | 'brief', topic, unreadOnly }
```

Bump `KEY` to `pulse.v4`. Preserve existing `read` state across the bump — losing
read history on upgrade is a bad experience. Write a small migration that reads
`pulse.v3` if `pulse.v4` is absent.

---

## 5. Implementation order

Do these in sequence and verify each in the browser before continuing. **Commit
after each step.**

1. **`src/lib/extract.js`** — fetch + Readability extraction. Test standalone
   against a TechCrunch URL and an HN link before wiring anything to it.
2. **`src/lib/condense.js`** — sentence splitting, scoring, redundancy removal,
   key-figure extraction. Pure functions, no I/O. Test with a scratch script over
   pasted article text before connecting to stage 1. **Tune the weights here**
   before building any UI.
3. **`src/lib/summaryCache.js`** — read/write/evict. Verify a summary survives a
   page reload.
4. **`src/BriefMode.jsx`** — scroll-snap container and card. Build with
   **mocked** summary data first, so layout problems don't hide behind API
   problems.
5. Wire 1–3 into 4. Add lazy loading and prefetch.
6. Mode toggle in `App.jsx`, prefs persistence.
7. Feature B: tokens, topic colors, timeline refinements.

Steps 4 and 5 being separate matters. Debugging a scroll container and an API
pipeline simultaneously is where this goes wrong.

---

## 6. Acceptance criteria

**Brief mode**
- [ ] Toggling to Brief shows ranked items, one per viewport, snapping cleanly
- [ ] First card is readable within 1 second (headline immediately, takeaways streaming in)
- [ ] Takeaways contain concrete facts, not three restatements of the headline
- [ ] Key figures chips show real amounts where the article has them
- [ ] A paywalled article degrades to the feed excerpt with an honest label, no crash
- [ ] Scrolling back to a seen card does **not** re-summarize (verify in the network tab)
- [ ] A 20-card session makes at most ~22 article fetches, not one per render
- [ ] Feeds carrying `content:encoded` render instantly with no fetch at all
- [ ] Works with keyboard alone
- [ ] Read state syncs between Brief and Timeline

**Visual**
- [ ] Topic colors appear on tags, tabs, and Brief accents, and pass 4.5:1
- [ ] The timeline gutter is unchanged in behavior
- [ ] Every size in the CSS maps to a type-scale token; no stray px values
- [ ] Hover states are wrapped in `@media (hover: hover)`
- [ ] Nothing in §3.10 appears anywhere in the diff
- [ ] Nothing clips or overflows at 360px
- [ ] Brief mode respects safe-area insets on a real phone
- [ ] `prefers-reduced-motion` disables scroll animation but preserves snapping

---

## 7. Out of scope

Deliberately excluded — do not build these:

- Push notifications, background sync
- Multi-device sync or accounts
- Full-text search across history
- Sharing, saving to read-later services
- Comments or social features
- Play Store distribution

---

## 8. Known risks

| Risk | Mitigation |
|---|---|
| Runaway API cost from over-eager prefetch | Lazy summarize, cache hard, prefetch cap of 2. Log call count in dev. |
| Paywalled sources extract poorly | Failure ladder. Accept it. If a source fails consistently, drop the feed. |
| Article fetch blocked by anti-bot (403) | Falls to level 3. Do not build scraping workarounds. |
| Condensed output reads choppily | Tune weights against real articles (§2.4). Accept some roughness — this is the cost of avoiding an LLM. |
| Sentence splitting mangles abbreviations | Use `Intl.Segmenter`; check Android WebView support and keep the regex fallback. |
| localStorage full | Eviction policy in §2.5. Test by filling it deliberately. |
| Scroll-snap quirks in Android WebView | Test on the actual device, not just desktop Chrome. Have a JS scroll fallback ready. |

---

## 9. Open questions for the human

1. Should Brief mode include everything ranked, or only items above a score
   threshold? Recommend: everything with a topic, capped at 30 cards.
2. Should read items be excluded from Brief? Recommend: yes by default, with a
   toggle.
