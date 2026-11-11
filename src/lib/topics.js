// Three topics, each a weighted keyword set. `strong` terms are unambiguous
// signals; `weak` terms only count when something else already matched, so a
// passing mention of "model" doesn't classify a phone review as deep tech.
export const TOPICS = {
  innovation: {
    label: 'Innovation',
    strong: [
      'launches', 'launched', 'unveils', 'unveiled', 'debuts', 'introduces',
      'announces', 'rolls out', 'now available', 'general availability',
      'breakthrough', 'first-ever', 'patent', 'prototype', 'r&d',
    ],
    weak: ['new', 'release', 'ships', 'preview', 'beta', 'pilot'],
  },
  fintech: {
    label: 'Fintech',
    strong: [
      'fintech', 'payments', 'neobank', 'challenger bank', 'stablecoin',
      'embedded finance', 'open banking', 'digital bank', 'lending',
      'insurtech', 'wealthtech', 'regtech', 'card issuing', 'bnpl',
      'cross-border payments', 'treasury', 'core banking', 'kyc', 'aml',
    ],
    weak: ['bank', 'finance', 'financial', 'crypto', 'blockchain', 'payment'],
  },
  deeptech: {
    label: 'Deep tech AI',
    strong: [
      'foundation model', 'frontier model', 'large language model', 'llm',
      'inference', 'training run', 'transformer', 'reinforcement learning',
      'multimodal', 'reasoning model', 'agentic', 'ai agent', 'fine-tuning',
      'neural', 'semiconductor', 'chip', 'gpu', 'tpu', 'accelerator',
      'quantum', 'robotics', 'autonomous', 'compute cluster', 'datacenter',
      'open-weight', 'benchmark', 'diffusion model',
    ],
    weak: ['ai', 'artificial intelligence', 'machine learning', 'model', 'research'],
  },
}

// A finer classification inside fintech and deep tech AI, for Saved (see
// SAVED.md §3.2). Innovation gets none — its stories are broad enough that a
// sub-category would mostly come back null.
export const SECTORS = {
  fintech: {
    payments: { label: 'Payments', strong: ['payments', 'card issuing', 'acquiring', 'point of sale', 'cross-border', 'interchange'] },
    banking: { label: 'Banking', strong: ['neobank', 'core banking', 'deposits', 'challenger bank', 'digital bank'] },
    lending: { label: 'Lending', strong: ['lending', 'credit', 'bnpl', 'underwriting', 'origination', 'mortgage'] },
    digitalAssets: { label: 'Digital assets', strong: ['stablecoin', 'tokenisation', 'tokenization', 'custody', 'on-chain', 'digital asset'] },
    insurance: { label: 'Insurance', strong: ['insurtech', 'underwriting', 'claims', 'actuarial', 'reinsurance'] },
    wealth: { label: 'Wealth', strong: ['wealthtech', 'brokerage', 'robo-advisor', 'asset management'] },
  },
  deeptech: {
    aiModels: { label: 'AI models', strong: ['foundation model', 'frontier model', 'llm', 'reasoning model', 'multimodal'] },
    aiInfrastructure: { label: 'AI infrastructure', strong: ['inference', 'training run', 'gpu', 'tpu', 'accelerator', 'datacenter', 'compute'] },
    semiconductors: { label: 'Semiconductors', strong: ['semiconductor', 'chip', 'fab', 'node', 'wafer', 'lithography'] },
    robotics: { label: 'Robotics', strong: ['robotics', 'autonomous', 'humanoid', 'actuator', 'teleoperation'] },
    quantum: { label: 'Quantum', strong: ['quantum', 'qubit', 'error correction', 'annealing'] },
    security: { label: 'Security', strong: ['cybersecurity', 'breach', 'zero-day', 'encryption', 'threat'] },
  },
}

// What kind of thing happened — topic-independent, cheap to read off the
// headline. See SAVED.md §3.3.
export const EVENT_TYPES = {
  launch: { label: 'Launch', strong: ['launches', 'launched', 'unveils', 'unveiled', 'debuts', 'introduces', 'ships', 'now available', 'general availability'] },
  funding: { label: 'Funding', strong: ['raises', 'raised', 'funding', 'series a', 'series b', 'series c', 'series d', 'series e', 'series f', 'seed round', 'valuation', 'led by'] },
  ma: { label: 'M&A', strong: ['acquires', 'acquired', 'acquisition', 'merger', 'buys', 'takeover', 'stake'] },
  // 'sec' is dropped — as a bare 3-letter substring it matches inside
  // "second", "security", "sector", far too common to be a useful signal.
  regulation: { label: 'Regulation', strong: ['regulator', 'fca', 'ruling', 'fined', 'compliance', 'licence', 'license', 'antitrust'] },
  research: { label: 'Research', strong: ['paper', 'study', 'benchmark', 'researchers', 'preprint', 'arxiv'] },
  partnership: { label: 'Partnership', strong: ['partners with', 'teams up', 'integration', 'joint venture'] },
}

const HALF_LIFE_HOURS = 20

function countHits(haystack, terms) {
  let hits = 0
  for (const term of terms) if (haystack.includes(term)) hits += 1
  return hits
}

// hnrss puts "Points: 240" in the description. That's a real popularity signal,
// so use it where it exists rather than pretending all sources are equal.
function popularity(item) {
  const points = /points:\s*(\d+)/i.exec(item.summary)
  const comments = /comments:\s*(\d+)/i.exec(item.summary)
  const p = points ? Number(points[1]) : 0
  const c = comments ? Number(comments[1]) : 0
  if (!p && !c) return 0
  return Math.min(3, Math.log10(1 + p + c * 2))
}

export function classify(item) {
  const title = item.title.toLowerCase()
  const body = `${item.title} ${item.summary}`.toLowerCase()
  const scores = {}

  for (const [key, topic] of Object.entries(TOPICS)) {
    // Title hits weigh triple — headlines state what a piece is actually about.
    const strong = countHits(title, topic.strong) * 3 + countHits(body, topic.strong)
    if (strong === 0) {
      scores[key] = 0
      continue
    }
    const weak = countHits(title, topic.weak) * 0.5 + countHits(body, topic.weak) * 0.2
    scores[key] = strong + Math.min(weak, 3)
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]
  return {
    scores,
    topic: best && best[1] > 0 ? best[0] : null,
    topicScore: best ? best[1] : 0,
  }
}

// Sub-category inside item.topic (see SECTORS). An item can plausibly fit a
// couple — e.g. a piece about BNPL underwriting is both lending and payments
// — so this keeps the top match plus up to two runners-up rather than forcing
// one bucket.
export function classifySector(item) {
  const { topic } = classify(item)
  const group = SECTORS[topic]
  if (!group) return []

  const body = `${item.title} ${item.summary}`.toLowerCase()
  return Object.entries(group)
    .map(([key, sector]) => [key, countHits(body, sector.strong)])
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key]) => key)
}

// A sector key on its own doesn't say which topic group it belongs to, so
// resolving its label means checking both.
export function sectorLabel(key) {
  for (const group of Object.values(SECTORS)) {
    if (group[key]) return group[key].label
  }
  return key
}

function bestEventMatch(haystack) {
  let best = null
  let bestScore = 0
  for (const [key, type] of Object.entries(EVENT_TYPES)) {
    const score = countHits(haystack, type.strong)
    if (score > bestScore) {
      best = key
      bestScore = score
    }
  }
  return best
}

// The headline is where the verb lives, so it's checked first. `extraText`
// (typically the Brief takeaways, when they exist) is a fallback only —
// defaults to the RSS excerpt if the caller doesn't have anything richer.
export function classifyEvent(item, extraText = '') {
  const headlineMatch = bestEventMatch(item.title.toLowerCase())
  if (headlineMatch) return headlineMatch

  const fallback = extraText || item.summary || ''
  return fallback ? bestEventMatch(fallback.toLowerCase()) : null
}

export function rank(item, now = Date.now()) {
  const { scores, topic, topicScore } = classify(item)
  if (!topic) return { topic: null, score: 0, scores }

  const ageHours = Math.max(0, (now - item.published) / 3600000)
  const freshness = Math.pow(0.5, ageHours / HALF_LIFE_HOURS)

  // Items hitting two topics at once (fintech + AI, say) are the most
  // interesting ones, so give a modest bonus for breadth.
  const breadth = Object.values(scores).filter((s) => s > 0).length - 1

  const score = (topicScore + popularity(item) + breadth * 1.5) * (0.35 + 0.65 * freshness)
  return { topic, score, scores }
}

// Top picks, capped per source so one prolific feed can't own the whole band.
export function pickTop(items, { limit = 5, perSource = 2, maxAgeHours = 72 } = {}) {
  const now = Date.now()
  const cutoff = now - maxAgeHours * 3600000

  const scored = items
    .filter((item) => item.published >= cutoff)
    .map((item) => ({ item, ...rank(item, now) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)

  const chosen = []
  const bySource = {}
  for (const entry of scored) {
    const src = entry.item.source
    if ((bySource[src] || 0) >= perSource) continue
    bySource[src] = (bySource[src] || 0) + 1
    chosen.push(entry)
    if (chosen.length === limit) break
  }
  return chosen
}
