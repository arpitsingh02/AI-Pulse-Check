#!/usr/bin/env node
/*
 * Tuning harness for the condense algorithm.
 *
 *   node tune.mjs                          # built-in sample articles
 *   node tune.mjs --feed <feedUrl>         # pull 5 articles from a feed
 *   node tune.mjs <articleUrl>             # one specific article
 *   node tune.mjs --feed <url> --verbose   # show every sentence + score breakdown
 *
 * Edit WEIGHTS below, re-run, compare. That's the whole loop.
 */

// ─────────────────────────────────────────────────────────────
// THE ONLY PART YOU EDIT
// ─────────────────────────────────────────────────────────────
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

const TOPIC_TERMS = [
  'fintech', 'payments', 'neobank', 'stablecoin', 'embedded finance',
  'open banking', 'lending', 'insurtech', 'bnpl',
  'foundation model', 'frontier model', 'llm', 'inference', 'multimodal',
  'ai agent', 'agentic', 'semiconductor', 'chip', 'gpu', 'quantum',
  'robotics', 'autonomous', 'fine-tuning', 'benchmark',
]

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
// subscription promos directly into article bodies, and they score well because
// they're stuffed with numbers and dates. This is the main noise source.
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

// ─────────────────────────────────────────────────────────────
// Algorithm — mirrors what condense.js should do
// ─────────────────────────────────────────────────────────────
function splitSentences(text) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const seg = new Intl.Segmenter('en', { granularity: 'sentence' })
    return [...seg.segment(text)].map((s) => s.segment.trim()).filter(Boolean)
  }
  return (text.match(/[^.!?]+[.!?]+/g) || []).map((s) => s.trim())
}

function scoreSentence(sentence, index, total) {
  const low = sentence.toLowerCase()
  const parts = []
  let score = 0

  if (index === 0) { score += WEIGHTS.leadFirst; parts.push(`lead+${WEIGHTS.leadFirst}`) }
  else if (index === 1) { score += WEIGHTS.leadSecond; parts.push(`lead+${WEIGHTS.leadSecond}`) }
  else if (index === 2) { score += WEIGHTS.leadThird; parts.push(`lead+${WEIGHTS.leadThird}`) }

  if (index > total * 0.85) { score += WEIGHTS.tailPenalty; parts.push(`tail${WEIGHTS.tailPenalty}`) }

  const numbers = sentence.match(/\$[\d.,]+\s?(billion|million|trillion|[MBK])?|\d+(\.\d+)?%|\b\d{2,}\b/gi) || []
  if (numbers.length) {
    const v = Math.min(WEIGHTS.numberCap, numbers.length * WEIGHTS.perNumber)
    score += v; parts.push(`num+${v}(${numbers.length})`)
  }

  const entities = sentence.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/g) || []
  if (entities.length) {
    const v = Math.min(WEIGHTS.entityCap, entities.length * WEIGHTS.perEntity)
    score += v; parts.push(`ent+${v}`)
  }

  const topics = TOPIC_TERMS.filter((t) => low.includes(t))
  if (topics.length) {
    const v = Math.min(WEIGHTS.topicCap, topics.length * WEIGHTS.perTopicTerm)
    score += v; parts.push(`topic+${v}`)
  }

  if (REPORTING_VERBS.some((v) => low.includes(v))) { score += WEIGHTS.reportingVerb; parts.push(`verb+${WEIGHTS.reportingVerb}`) }
  if (/["\u201c\u201d]/.test(sentence)) { score += WEIGHTS.hasQuote; parts.push(`quote${WEIGHTS.hasQuote}`) }
  if (HEDGES.some((r) => r.test(sentence))) { score += WEIGHTS.hedge; parts.push(`hedge${WEIGHTS.hedge}`) }
  if (PRONOUN_START.test(sentence)) { score += WEIGHTS.pronounStart; parts.push(`pron${WEIGHTS.pronounStart}`) }
  if (BOILERPLATE.some((r) => r.test(sentence))) { score += WEIGHTS.boilerplate; parts.push(`boiler${WEIGHTS.boilerplate}`) }
  // News reporting rarely addresses the reader. Marketing always does.
  if (/\b(you|your|you're|yours)\b/i.test(sentence)) { score += WEIGHTS.secondPerson; parts.push(`2nd${WEIGHTS.secondPerson}`) }

  return { score, parts }
}

const bagOfWords = (s) => new Set(s.toLowerCase().match(/[a-z]{4,}/g) || [])
function jaccard(a, b) {
  const inter = [...a].filter((x) => b.has(x)).length
  const union = a.size + b.size - inter
  return union ? inter / union : 0
}

export function condense(text) {
  const all = splitSentences(text)
  const usable = all
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.length >= WEIGHTS.minChars && s.length <= WEIGHTS.maxChars && !isNoise(s))

  const scored = usable.map((o) => ({ ...o, ...scoreSentence(o.s, o.i, all.length) }))
  const ranked = [...scored].sort((a, b) => b.score - a.score)

  const chosen = []
  for (const cand of ranked) {
    if (chosen.some((c) => jaccard(bagOfWords(c.s), bagOfWords(cand.s)) > WEIGHTS.redundancy)) continue
    chosen.push(cand)
    if (chosen.length === WEIGHTS.takeaways) break
  }

  return {
    takeaways: chosen.sort((a, b) => a.i - b.i),
    scored,
    // Derived from filtered sentences, not raw text — otherwise promo prices
    // ("save $300 on tickets!") end up presented as article facts.
    keyFigures: [...new Set(
      (usable.map((o) => o.s).join(' ')
        .match(/\$[\d.,]+\s?(billion|million|trillion|bn|m)?|\d+(\.\d+)?\s?(%|percent)|\d+(\.\d+)?\s?(nm|GB|TB|MW|x)\b|Series [A-F]\b/gi) || [])
        .map((f) => f.trim())
    )].slice(0, 6),
    readingMinutes: Math.max(1, Math.ceil(text.split(/\s+/).length / 220)),
  }
}

// ─────────────────────────────────────────────────────────────
// Fetching + crude extraction (good enough for tuning)
// ─────────────────────────────────────────────────────────────
async function fetchText(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; PulseTuner/0.1)' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

function extractArticle(html) {
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(nav|header|footer|aside|figure)[\s\S]*?<\/\1>/gi, ' ')

  const paras = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) =>
      m[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
        .replace(/&amp;/g, '&')
        .replace(/&rsquo;|&lsquo;/g, "'")
        .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
        .replace(/&mdash;/g, '\u2014')
        .replace(/&ndash;/g, '\u2013')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter((p) => p.length > 60)

  return paras.join(' ')
}

async function feedArticleUrls(feedUrl, n = 5) {
  const xml = await fetchText(feedUrl)
  const links = [...xml.matchAll(/<link[^>]*>([^<]*?)<\/link>|<link[^>]+href="([^"]+)"/gi)]
    .map((m) => (m[1] || m[2] || '').trim())
    .filter((u) => /^https?:\/\//.test(u) && !u.includes('/feed'))
  return [...new Set(links)].slice(1, n + 1)
}

// ─────────────────────────────────────────────────────────────
// Reporting
// ─────────────────────────────────────────────────────────────
const DIM = '\x1b[2m', BOLD = '\x1b[1m', GREEN = '\x1b[32m', RESET = '\x1b[0m'

function report(title, text, verbose) {
  const r = condense(text)
  console.log(`\n${BOLD}${title}${RESET}`)
  console.log(DIM + '─'.repeat(72) + RESET)

  if (!r.takeaways.length) {
    console.log('  (nothing usable extracted — likely a paywall or JS-rendered page)')
    return r
  }

  for (const t of r.takeaways) {
    console.log(`  ${GREEN}▸${RESET} ${t.s}`)
    console.log(`    ${DIM}score ${t.score}  ${t.parts.join(' ')}${RESET}`)
  }
  if (r.keyFigures.length) console.log(`\n  ${DIM}figures:${RESET} ${r.keyFigures.join('  ')}`)
  console.log(`  ${DIM}${r.readingMinutes} min read${RESET}`)

  if (verbose) {
    console.log(`\n  ${DIM}── all candidates by score ──${RESET}`)
    const picked = new Set(r.takeaways.map((t) => t.i))
    for (const s of [...r.scored].sort((a, b) => b.score - a.score).slice(0, 18)) {
      const mark = picked.has(s.i) ? `${GREEN}✓${RESET}` : ' '
      console.log(`  ${mark} ${String(s.score).padStart(3)}  ${DIM}${s.s.slice(0, 88)}${RESET}`)
    }
  }
  return r
}

const SAMPLES = [
  {
    title: 'SAMPLE — funding story',
    text: `Stripe announced on Tuesday that it has launched a new embedded finance API aimed at neobanks and vertical software companies. The product, called Treasury Connect, lets platforms issue accounts and move money without holding a banking license themselves. Stripe said the API is generally available in the United States today and will expand to the European Union in early 2027. "We think this is the beginning of something big," said one executive at the company. The company raised $6.5 billion at a $50 billion valuation in its most recent funding round. Analysts reportedly expect the embedded finance market could reach $320 billion by 2030. Sign up for our newsletter to get more coverage like this. Rivals including Adyen and Marqeta offer competing products, though neither bundles account issuance with payments in the same way. The launch follows eighteen months of private beta testing with 40 companies. He said the rollout would be gradual.`,
  },
  {
    title: 'SAMPLE — model release',
    text: `Nvidia unveiled its next-generation inference accelerator at a conference in San Jose on Wednesday. The chip, codenamed Rubin, delivers roughly 2.5 times the throughput of the previous generation on large language model workloads. Nvidia said the part will ship to cloud partners in the first quarter of 2027 at an undisclosed price. Industry analysts may see this as a response to competing silicon from AMD and Google. "The demand signal has been extraordinary," the chief executive told attendees. Rubin uses a 3nm process and packs 288 gigabytes of high-bandwidth memory. Follow us on social media for live updates from the show floor. The company also announced a partnership with three hyperscalers covering an estimated 40 percent of global inference capacity.`,
  },
]

async function main() {
  const args = process.argv.slice(2)
  const verbose = args.includes('--verbose')
  const clean = args.filter((a) => a !== '--verbose')

  if (clean[0] === '--feed') {
    const feed = clean[1]
    if (!feed) return console.error('Usage: node tune.mjs --feed <feedUrl>')
    console.log(`Pulling articles from ${feed} …`)
    const urls = await feedArticleUrls(feed)
    for (const url of urls) {
      try {
        const text = extractArticle(await fetchText(url))
        if (text.length < 400) { console.log(`\n${BOLD}${url}${RESET}\n  (too little text — paywall or JS-rendered)`); continue }
        report(url, text, verbose)
      } catch (err) {
        console.log(`\n${BOLD}${url}${RESET}\n  fetch failed: ${err.message}`)
      }
    }
  } else if (clean[0]) {
    const text = extractArticle(await fetchText(clean[0]))
    report(clean[0], text, verbose)
  } else {
    for (const s of SAMPLES) report(s.title, s.text, verbose)
    console.log(`\n${DIM}Try: node tune.mjs --feed https://techcrunch.com/category/fintech/feed/ --verbose${RESET}`)
  }
}

main().catch((err) => { console.error(err.message); process.exit(1) })
