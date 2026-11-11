# Tuning the condense weights

Twenty to forty minutes of work that determines whether Brief mode is useful.
Do it before building any UI.

---

## The loop

```bash
node tune.mjs --feed https://techcrunch.com/category/fintech/feed/ --verbose
```

1. Read the output. Not the scores — **the takeaways**. Would they have told
   you what happened?
2. Find the worst one and name what's wrong with it.
3. Match that symptom to a weight in the table below.
4. Change that **one** weight, by a lot.
5. Re-run the same command. Compare.
6. Repeat until it's good enough. It will never be perfect.

Run against at least three different feeds — fintech, AI, and Hacker News
behave differently, and weights that fix one can break another.

---

## Reading the output

```
  ▸ The company raised $6.5 billion at a $50 billion valuation.
    score 6  num+4(2) verb+2
```

The second line is the breakdown: this sentence got 4 points from containing two
numbers, 2 from a reporting verb ("raised"). No lead bonus, so it wasn't in the
first three sentences.

`--verbose` also prints every candidate ranked by score, with `✓` marking the
selected ones. **This is the important view.** When a good sentence is missing,
find it in that list and look at its score — that tells you which signal failed
to fire, which tells you which weight to change.

---

## Symptom → fix

| What you see | What's wrong | Change |
|---|---|---|
| All 4 takeaways restate the headline | Redundancy filter too loose | `redundancy: 0.5` → `0.35` |
| Takeaways are vague; the numbers are elsewhere in the article | Facts undervalued | `perNumber: 2` → `4`, `numberCap: 4` → `6` |
| It picks background/context, misses the actual news | Lead underweighted | `leadFirst: 3` → `5`, `leadSecond: 2` → `4` |
| Executive quotes keep appearing | Quote penalty too weak | `hasQuote: -1` → `-3` |
| Ends with company boilerplate ("Founded in 2011, Acme is…") | Tail penalty too weak | `tailPenalty: -2` → `-4` |
| Sentences start with "He said" / "This means" and dangle | Pronoun penalty too weak | `pronounStart: -2` → `-4` |
| Analyst speculation over what happened | Hedges underweighted | `hedge: -1` → `-3` |
| Conference or newsletter promos selected | Not caught by `isNoise` | Add a pattern to `PROMO` — see below |
| Headline + byline glued together as one "sentence" | Extraction, not scoring | Add a pattern to `BYLINE` |
| Company background chosen over the news | Boilerplate penalty too weak | `boilerplate: -3` → `-5` |
| Off-topic sentences from long articles | Topic relevance underweighted | `perTopicTerm: 2` → `4` |
| Reads as disconnected fragments | Too many selections | `takeaways: 4` → `3` |
| Feels thin, missing obvious facts | Too few | `takeaways: 4` → `5` |
| Good sentences cut off mid-thought | Length filter too tight | `maxChars: 350` → `450` |

---

## Two rules

**Change one weight at a time.** Change three and you won't know which helped.
This is the single most common way tuning goes wrong.

**Change it by a lot.** Go 2 → 4, not 2 → 2.5. Scores are small integers, so a
half-point rarely reorders anything and you'll conclude the weight doesn't
matter when it just wasn't moved far enough.

---

## Noise filtering

Publishers inject conference promos, newsletter pitches, and event ads directly
into article bodies. These score *well* on a naive algorithm because they're
dense with numbers and dates — "save up to $300 on your tickets" reads to a
scorer exactly like a funding figure.

`isNoise()` rejects a sentence outright before scoring. Three families:

- **`PROMO`** — second-person sales language, ticket and discount phrasing,
  event date-plus-city patterns, trailing exclamation marks
- **`BYLINE`** — timestamp fragments like `7:30 AM PDT` that crude extraction
  glues onto real text
- **`BOILERPLATE`** — "was founded in", "is headquartered in": true, but not news

Plus a `secondPerson: -4` score penalty, since news reporting almost never
addresses the reader and marketing almost always does.

**When new noise appears**, add a pattern to the right list rather than fiddling
with weights. Rejection is cleaner than trying to out-score junk. Match on a
phrase distinctive to promos but absent from reporting — `/\byour tickets?\b/i`
is safe; `/\bsave\b/i` would eat legitimate sentences about cost savings.

Key figures are derived from *filtered* sentences, not raw text, so a rejected
promo can't contribute its prices to the figures row.

---

## When to stop

Good enough looks like: **for 7 of 10 articles, the takeaways tell you what
happened without opening the original.** The other 3 will be paywalled,
badly-structured, or opinion pieces that resist extraction.

Chasing 10 of 10 is not worth it. The failure ladder in the PRD handles the
misses gracefully, and a bad summary costs you three seconds of scrolling.

---

## Then

Copy the `WEIGHTS`, `scoreSentence`, `condense`, and helper functions from
`tune.mjs` into `src/lib/condense.js`. Drop the fetching, extraction, and
reporting code — those belong in `extract.js` and the UI. Keep `tune.mjs` around
so you can re-tune later when the output starts annoying you.

Delete `docs-prototype-condense.mjs`; `tune.mjs` supersedes it.
