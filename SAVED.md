# Requirements — Saved

**Project:** Pulse
**Status:** Ready to implement
**Audience:** Claude Code, working in this repo
**Companion docs:** `DESIGN.md` (§2.1 navigation, §9 screens), `BRIEF-MODE.md`

---

## 0. Context

`DESIGN.md` specifies a four-tab bottom bar, one of which is Saved. This
document specifies what sits behind it: a reliable "read this later" store with
enough filtering to still be useful once it holds a few hundred items.

---

## 1. What is stored, and what is not

### 1.1 The rule

**Store the derived summary and the link. Never store article body text.**

| Stored | Not stored |
|---|---|
| Headline | The article body |
| Canonical link | Extracted full text |
| Source name, publication date | Images or media |
| 3–5 condensed takeaway sentences | Anything beyond the takeaway cap below |
| Key figures (amounts, percentages) | Page HTML |
| Topic, sector, event type | |
| Save timestamp | |

The condense pipeline in `BRIEF-MODE.md` holds extracted body text in memory
while it works. **That text is never persisted.** Only the derived summary
reaches storage. If a `saved:` or `summary:` entry ever contains a body-length
string, something is wrong.

Hard limits, enforced in code at save time:

- Maximum **5** takeaways per item
- Maximum **280 characters** per takeaway, truncated with an ellipsis
- Maximum **1200 characters** of takeaway text total per item

These are belt-and-braces. The condense algorithm already produces less than
this; the cap exists so a future change can't quietly turn Saved into an
article archive.

### 1.2 Why snapshot rather than reference

RSS feeds are windows, not archives. TechCrunch's returns roughly 20 items;
Hacker News returns the current front page. An item saved today is out of the
feed within hours.

If Saved stored only an ID and looked it up in the live feed at render time, the
list would empty itself overnight — working perfectly in testing and failing
silently a day later. So the metadata and summary are copied at save time.

The stored record is a **citation with notes**: enough to remember why you saved
it and find it again, not a copy of the work. It is also what makes Saved
function with no network.

### 1.3 Attribution and redistribution

Every stored item keeps its source name, publication date, and canonical link,
and every surface that displays a saved item shows all three. Attribution is not
optional and is not a display preference.

Export (§5) is a personal-archive convenience. Each exported item carries its
source and link. The export header states that the content is summarised for
personal reference and links to the originals.

Out of scope permanently, not just for v1: publishing saved items, sharing
generated digests publicly, server-side sync, or any feature that moves stored
takeaways off the user's device automatically.

---

## 2. The feature

### 2.1 User story

> Something looks worth reading properly but I'm scrolling on a train. I tap the
> bookmark and keep going. Later I open Saved, filter to fintech funding from the
> last month, and there it is — with the takeaways attached and a link to the
> original, even though the feed moved on days ago.

### 2.2 Entry points

**From a Feed row.** A bookmark icon at the row's right edge, 20px in a 44px tap
target. `--ink-off` unsaved, `--action` saved. Tapping toggles; it does not open
the article or mark it read.

The icon is always visible rather than appearing on hover — hover doesn't exist
on a phone, and an icon that materialises on tap is undiscoverable.

**From a Brief card.** In the action row beside "Open original", with a "Save" /
"Saved" label. Larger target, since the card has room.

**Not in v1:** swipe-to-save. Nicer gesture, but it fights vertical scroll and
needs careful threshold tuning. Revisit if the tap target proves annoying.

---

## 3. Segmentation

Saved items carry three orthogonal classifications. All are derived at save
time from text the app already has, so none requires extra work from the user.

### 3.1 Topic — existing

The three from `topics.js`: Innovation, Fintech, Deep tech AI. Already computed
by `classify()`. Stored as-is.

### 3.2 Sector — new

A finer classification inside each topic. Add to `topics.js` as `SECTORS`, using
the same strong-term matching approach:

| Sector | Strong terms (starting set) |
|---|---|
| Payments | payments, card issuing, acquiring, POS, cross-border, interchange |
| Banking | neobank, core banking, deposits, challenger bank, digital bank |
| Lending | lending, credit, BNPL, underwriting, origination, mortgage |
| Digital assets | stablecoin, tokenisation, custody, on-chain, digital asset |
| Insurance | insurtech, underwriting, claims, actuarial, reinsurance |
| Wealth | wealthtech, brokerage, robo-advisor, asset management |
| AI models | foundation model, frontier model, LLM, reasoning model, multimodal |
| AI infrastructure | inference, training run, GPU, TPU, accelerator, datacenter, compute |
| Semiconductors | semiconductor, chip, fab, node, wafer, lithography |
| Robotics | robotics, autonomous, humanoid, actuator, teleoperation |
| Quantum | quantum, qubit, error correction, annealing |
| Security | cybersecurity, breach, zero-day, encryption, threat |

Unmatched items get `sector: null` and appear only under "All". Do not invent a
catch-all bucket — an "Other" filter nobody uses is worse than no filter.

An item may match several sectors; keep the highest-scoring one plus up to two
more in a `sectors` array. Filter on any match.

### 3.3 Event type — new

What kind of thing happened. For tracking innovation this is often the most
useful axis, and it is cheap to derive from the headline.

| Type | Detected by |
|---|---|
| Launch | launches, unveils, debuts, introduces, ships, now available, GA |
| Funding | raises, funding, Series A–F, seed, valuation, led by |
| M&A | acquires, acquisition, merger, buys, takeover, stake |
| Regulation | regulator, SEC, FCA, ruling, fine, compliance, licence, antitrust |
| Research | paper, study, benchmark, researchers, preprint, arXiv |
| Partnership | partners with, teams up, integration, joint venture |

Match against the headline first — it is where the verb lives. Fall back to the
takeaways. Unmatched is `null`.

---

## 4. The Saved screen

### 4.1 Layout

App bar: title "Saved", count in `--t-meta` mono on the right, plus a filter icon
and an overflow menu.

Below the app bar, a single **filter bar** — one horizontally scrolling row of
chips showing only the *active* filters plus a "Filter" chip that opens the
sheet. When nothing is active it shows just "Filter". This keeps three filter
axes from consuming half the screen.

Rows follow `DESIGN.md` §9.1, with two changes:

- Metadata shows **save date**, not publication date: `Saved 2d ago ·
  TECHCRUNCH · $6.5B`. Once something has sat in a list for a week, how long it
  has been there is the useful fact.
- The bookmark icon is filled `--action` and unsaves on tap.

Default sort: newest saved first, grouped by save date with sticky day labels.

### 4.2 Filter sheet

A bottom sheet with four sections. Applies on dismiss; a "Clear all" action sits
in the header.

**Topic** — All / Innovation / Fintech / Deep tech AI. Single select.

**Sector** — multi-select chips. Only sectors present in the current saved set
are shown; an empty filter is a dead end.

**Event type** — multi-select chips. Same rule.

**Date** — presets: Last 7 days, Last 30 days, Last 90 days, This year, All time.
Plus a custom range with two date inputs.

Alongside the date presets, a toggle: **Saved date** / **Published date**. These
diverge — you might save a two-year-old research paper today. Default to saved
date; published date is what you want when asking "what happened in Q1".

### 4.3 Search

A search field in the filter sheet, matching against title, source, and
takeaways. Case-insensitive substring; no fuzzy matching. Combines with the other
filters by AND.

### 4.4 Sort

In the overflow menu: Recently saved (default), Oldest saved, Recently
published, Source A–Z.

### 4.5 Empty states

Distinguish two cases, because they need different responses:

- **Nothing saved at all** — "Nothing saved yet." plus one line explaining the
  bookmark icon.
- **Filters match nothing** — "No saved items match these filters." plus a
  "Clear filters" action.

Per `DESIGN.md` §9.4: no illustrations.

---

## 5. API

`src/lib/saved.js`. Pure storage and query logic, no React.

```js
save(item, summary?)      // → SavedItem. Derives sector + eventType. Idempotent.
unsave(id)                // → SavedItem | null (returned for undo)
toggle(item, summary?)    // → boolean (new saved state)
isSaved(id)               // → boolean
get(id)                   // → SavedItem | null
backfillSummary(id, summary)  // attach takeaways to an item saved before condensing

list(options?)            // → SavedItem[]
// options: {
//   topic, sectors[], eventTypes[],
//   from, to, dateField: 'savedAt' | 'published',
//   query, sort, limit, offset
// }

facets()                  // → { sectors: {name: count}, eventTypes: {...}, topics: {...} }
count()                   // → number
exportMarkdown(options?)  // → string, honours the same filter options
clear()                   // → void, requires explicit confirmation in the UI
```

`facets()` exists so the filter sheet can show only categories that are actually
present, with counts. Compute it in one pass over the index, not per chip.

### 5.1 Data model

```js
// key: saved:<itemId>
{
  id, title, link, source, sourceUrl, published,
  topic,                  // 'innovation' | 'fintech' | 'deeptech' | null
  sectors,                // string[], max 3
  eventType,              // string | null
  summary: {
    takeaways,            // string[], max 5, each ≤ 280 chars
    keyFigures,           // string[], max 6
    readingMinutes
  } | null,
  savedAt,
  version: 2
}
```

- **Individual keys, not one array.** A single blob means every toggle rewrites
  the whole list.
- Maintain `saved:index` — an array of `{id, savedAt, published, topic, sectors,
  eventType, source}`. Filtering, sorting, and faceting read only the index; full
  records are fetched for the visible rows. This keeps the Saved screen fast as
  the list grows.
- Write index and record in the same operation.
- `summary` may be null if the item was saved from the Feed before Brief mode
  condensed it. Backfill via `backfillSummary` when it is later opened in Brief.
- Bump the main storage key to `pulse.v5` and migrate `read` state forward.

### 5.2 Capacity

An entry runs about 1.5KB. localStorage caps near 5MB. Cap at **500 items**: on
exceeding it, refuse the save and show "Saved list is full — remove some items."

Never silently evict. These are things the user deliberately kept.

---

## 6. Unsave and undo

Unsaving removes the row immediately, with a snackbar above the tab bar for 4
seconds: "Removed" and an "Undo" action.

Undo matters more here than usual — the record is the only copy, and if the feed
has rolled over, an accidental unsave is unrecoverable. Hold the removed entry in
memory until the snackbar expires.

---

## 7. Export

Overflow menu → **Export saved**. Produces Markdown and hands it to the Android
share sheet via a Blob download.

Honours the active filters, so "export fintech funding from Q1" works. State the
active filters in the file header.

```markdown
# Pulse — saved items

Exported 26 Aug 2026 · 14 items · Fintech · Funding · Last 90 days
Summaries generated for personal reference. Follow the links for full articles.

---

## Stripe launches embedded finance API for neobanks

TechCrunch · Published 24 Aug 2026 · Saved 24 Aug 2026
https://techcrunch.com/...

- Stripe announced a new embedded finance API aimed at neobanks.
- The API is generally available in the US today.

Key figures: $6.5B · $50B
```

Every item carries source, date, and link. That is what makes the export
defensible as a personal archive rather than a scrape.

---

## 8. Implementation order

Commit after each step and check the browser.

1. **`SECTORS` and `EVENT_TYPES` in `topics.js`**, plus `classifySector()` and
   `classifyEvent()`. Test with a scratch script against real headlines — the
   same approach as `TUNING.md`.
2. **`src/lib/saved.js`** — save, unsave, isSaved, list, index maintenance.
   Verify in the console before any UI.
3. **Bookmark toggle on Feed rows.** Check persistence across reload.
4. **Saved screen** — rows, grouping, empty states. No filters yet.
5. **Filter sheet** — topic, then sectors, then event type, then date. One at a
   time; each is independently verifiable.
6. **Brief card action** and `backfillSummary`.
7. **Undo snackbar.**
8. **Search, sort, export.**

Steps 1–4 are the feature. Everything after makes it usable at scale.

---

## 9. Acceptance criteria

**Storage boundary**
- [ ] No `saved:` or `summary:` record contains article body text
- [ ] Takeaway count and length caps enforced at save time, not just in the UI
- [ ] Every displayed saved item shows source, date, and a working link

**Correctness**
- [ ] **A saved item still renders after it drops out of its source feed** —
      test by saving an item, removing that feed, then refreshing
- [ ] Saved items render with no network connection
- [ ] Saving from Feed does not open the article or mark it read
- [ ] Saving from Brief captures takeaways and key figures
- [ ] An item saved from Feed, later opened in Brief, gets its summary backfilled
- [ ] Bookmark state is consistent across Feed, Brief, and Saved
- [ ] Unsave shows an undo snackbar that restores the entry
- [ ] Exceeding 500 saves shows a clear message and saves nothing

**Filtering**
- [ ] Sector and event type are derived at save time and stored
- [ ] Filter sheet shows only categories present in the saved set, with counts
- [ ] Date filter toggles correctly between saved and published date
- [ ] Filters combine by AND; "Clear all" resets every axis
- [ ] Filtered-empty and nothing-saved states are visually distinct
- [ ] Export honours active filters and states them in the header

**Interaction**
- [ ] Tap targets 44px; the bookmark icon does not swallow row taps
- [ ] Filter bar shows only active filters, not all three axes at once

---

## 10. Out of scope

- Folders, tags, collections, or user-defined categories
- Notes or highlights
- Cross-device sync
- Full article text capture, in any form
- Swipe gestures
- Public sharing or publishing of saved items

---

## 11. Known risks

| Risk | Mitigation |
|---|---|
| Feed rollover empties Saved | Snapshot at save time, §1.2 |
| Scope creep toward archiving articles | Hard caps in §1.1, enforced in code |
| Filter UI eats the screen | Single filter bar showing active filters only, §4.1 |
| Saved screen slows as the list grows | Index-based filtering, §5.1 |
| localStorage fills | 500-item cap with an explicit message |
| Bookmark tap triggers the row's open action | Stop propagation; verify on a real device |
| Sector keywords misfire | Tune with a scratch script, same method as `TUNING.md` |
| Saved link 404s later | The record still renders. Optionally note a dead link; don't block on it. |

---

## 12. Open questions

1. Should saving auto-condense an item with no summary yet? Recommend no — it
   fires a network request from a tap that should feel instant. Backfill on open
   in Brief instead.
2. Should saved items be excluded from the Feed? Recommend no. Saving is not
   dismissing.
3. Should sectors be user-editable? Recommend not in v1 — ship the derived ones,
   see whether they misclassify enough to matter.
