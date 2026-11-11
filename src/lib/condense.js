// Selects the most informative sentences from article text without an LLM —
// see BRIEF-MODE.md §1.4 for why. Ported from tune.mjs, which stays around as
// the tuning harness (see TUNING.md): re-tune by editing WEIGHTS there, and
// copy the whole block back here when it's better. Pure functions, no I/O.
import { TOPICS } from './topics.js'

const WEIGHTS = {
  leadFirst: 3, // 1st sentence of the article
  leadSecond: 2, // 2nd
  leadThird: 1, // 3rd
  tailPenalty: -2, // last 15% of the article (usually boilerplate)

  perNumber: 2, // each $amount, %, or 2+ digit number
  numberCap: 4,

  perEntity: 1, // each multi-word capitalized phrase
  entityCap: 3,

  perTopicTerm: 2, // each strong topic term from topics.js
  topicCap: 4,

  reportingVerb: 2, // launched / raised / acquired / announced …
  hasQuote: -1, // direct quotes: reactions, not facts
  hedge: -1, // could / may / reportedly …
  pronounStart: -2, // "He said…" — loses its antecedent when extracted
  boilerplate: -3, // "was founded in 1998…" — background, not news
  secondPerson: -4, // "your", "you" — reporting doesn't address the reader

  redundancy: 0.5, // 0–1. Lower = stricter about near-duplicates
  takeaways: 4, // how many sentences to select
  minChars: 40,
  maxChars: 350,
}

// Every "strong" term across all three topics — a sentence naming any of
// these is relevant to this reader regardless of which tab they're viewing.
const TOPIC_TERMS = Object.values(TOPICS).flatMap((t) => t.strong)

const REPORTING_VERBS = [
  'launched', 'launches', 'raised', 'raises', 'acquired', 'acquires',
  'announced', 'announces', 'unveiled', 'unveils', 'shipped', 'ships',
  'released', 'releases', 'introduced', 'introduces', 'filed', 'partnered',
]

const HEDGES = [/\bcould\b/i, /\bmay\b(?!\s+\d)/i, /\bmight\b/i, /\breportedly\b/i, /\bexpected to\b/i, /\bplans to\b/i, /\baims to\b/i]
const PRONOUN_START = /^(he|she|they|it|this|that|these|those|we|his|her|their)\b/i

// Anchored at the start — these only appear as a whole line.
const JUNK_PREFIX = /^(sign up|subscribe|read more|related:|photo|image|credit|follow us|share this|advertisement|this article originally)/i

// Matched ANYWHERE in the sentence. Publishers inject conference and
// subscription promos directly into article bodies, and they score well
// because they're stuffed with numbers and dates. This is the main noise
// source — see TUNING.md "Noise filtering" before adding to this list.
const PROMO = [
  /\byour (chance|tickets?|seat|spot|pass|last)\b/i,
  /\bsave (up to )?\$?\d/i,
  /\b(early bird|last chance|don't miss|book now|register (now|today)|limited time|act now)\b/i,
  /\btickets? (are |will |on sale|end)/i,
  /\b(discount|promo code|sale ends|offer ends|expires)\b/i,
  /\bjoin us\b/i,
  /\b(subscribe|sign up) (to|for|now)\b/i,
  /\b\d{1,2}\s?[–—-]\s?\d{1,2}\s+(San Francisco|New York|London|Las Vegas|Austin|Boston)\b/i, // event date + city
  /\bnewsletter\b/i,
]

// Byline and timestamp fragments that crude extraction glues onto real text.
const BYLINE = [
  /\b\d{1,2}:\d{2}\s?(AM|PM)\s?(PDT|PST|EDT|EST|CDT|CST|UTC|GMT|BST)\b/i,
  /^(by\s+)?[A-Z][a-z]+\s+[A-Z][a-z]+\s+\d{1,2}:\d{2}/,
  /\b(image|photo) credits?:/i,
]

// Background filler — true, but not news.
const BOILERPLATE = [
  /\bwas founded in\b/i,
  /\bis headquartered in\b/i,
  /\bis a leading (provider|platform|company)\b/i,
  /\babout (the company|us)\b/i,
]

const isNoise = (s) =>
  JUNK_PREFIX.test(s) ||
  PROMO.some((r) => r.test(s)) ||
  BYLINE.some((r) => r.test(s)) ||
  // Exclamation marks are near-universal in promos and near-absent in reporting.
  /!\s*$/.test(s)

function splitSentences(text) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const seg = new Intl.Segmenter('en', { granularity: 'sentence' })
    return [...seg.segment(text)].map((s) => s.segment.trim()).filter(Boolean)
  }
  return (text.match(/[^.!?]+[.!?]+/g) || []).map((s) => s.trim())
}

function scoreSentence(sentence, index, total) {
  const low = sentence.toLowerCase()
  let score = 0

  if (index === 0) score += WEIGHTS.leadFirst
  else if (index === 1) score += WEIGHTS.leadSecond
  else if (index === 2) score += WEIGHTS.leadThird

  if (index > total * 0.85) score += WEIGHTS.tailPenalty

  const numbers = sentence.match(/\$[\d.,]+\s?(billion|million|trillion|[MBK])?|\d+(\.\d+)?%|\b\d{2,}\b/gi) || []
  if (numbers.length) score += Math.min(WEIGHTS.numberCap, numbers.length * WEIGHTS.perNumber)

  const entities = sentence.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/g) || []
  if (entities.length) score += Math.min(WEIGHTS.entityCap, entities.length * WEIGHTS.perEntity)

  const topics = TOPIC_TERMS.filter((t) => low.includes(t))
  if (topics.length) score += Math.min(WEIGHTS.topicCap, topics.length * WEIGHTS.perTopicTerm)

  if (REPORTING_VERBS.some((v) => low.includes(v))) score += WEIGHTS.reportingVerb
  if (/["“”]/.test(sentence)) score += WEIGHTS.hasQuote
  if (HEDGES.some((r) => r.test(sentence))) score += WEIGHTS.hedge
  if (PRONOUN_START.test(sentence)) score += WEIGHTS.pronounStart
  if (BOILERPLATE.some((r) => r.test(sentence))) score += WEIGHTS.boilerplate
  // News reporting rarely addresses the reader. Marketing always does.
  if (/\b(you|your|you're|yours)\b/i.test(sentence)) score += WEIGHTS.secondPerson

  return score
}

const bagOfWords = (s) => new Set(s.toLowerCase().match(/[a-z]{4,}/g) || [])
function jaccard(a, b) {
  const inter = [...a].filter((x) => b.has(x)).length
  const union = a.size + b.size - inter
  return union ? inter / union : 0
}

const KEY_FIGURE_PATTERN = /\$[\d.,]+\s?(billion|million|trillion|bn|m)?|\d+(\.\d+)?\s?(%|percent)|\d+(\.\d+)?\s?(nm|GB|TB|MW|x)\b|Series [A-F]\b/gi

// Selects 3-5 sentences from `text` carrying the actual news, restored to
// original reading order, plus any dollar amounts / percentages / funding
// rounds found. `sentenceCount` is exposed so a caller can decide whether
// there was enough usable text to condense at all (BRIEF-MODE.md §1.6 level 2).
export function condense(text) {
  const all = splitSentences(text)
  const usable = all
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.length >= WEIGHTS.minChars && s.length <= WEIGHTS.maxChars && !isNoise(s))

  const scored = usable.map((o) => ({ ...o, score: scoreSentence(o.s, o.i, all.length) }))
  const ranked = [...scored].sort((a, b) => b.score - a.score)

  const chosen = []
  for (const cand of ranked) {
    if (chosen.some((c) => jaccard(bagOfWords(c.s), bagOfWords(cand.s)) > WEIGHTS.redundancy)) continue
    chosen.push(cand)
    if (chosen.length === WEIGHTS.takeaways) break
  }
  chosen.sort((a, b) => a.i - b.i)

  const keyFigures = [...new Set(
    (usable.map((o) => o.s).join(' ').match(KEY_FIGURE_PATTERN) || []).map((f) => f.trim())
  )].slice(0, 6)

  const words = text.split(/\s+/).filter(Boolean)

  return {
    takeaways: chosen.map((c) => c.s),
    keyFigures,
    readingMinutes: Math.max(1, Math.ceil(words.length / 220)),
    wordCount: words.length,
    sentenceCount: usable.length,
  }
}
