import { Capacitor, CapacitorHttp } from '@capacitor/core'

// --- Fetching -------------------------------------------------------------
// On Android, CapacitorHttp goes through the native HTTP stack, which is not
// subject to CORS at all. In the browser we fall back to the Vite dev proxy.
// This is the one transport for all outbound requests — feeds here, and
// article pages fetched by extract.js. Anything that needs a URL fetched
// should call this rather than a bare fetch().
export async function fetchText(url) {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({
      url,
      headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, */*' },
      responseType: 'text',
    })
    if (res.status >= 400) throw new Error(`Server returned ${res.status}`)
    const contentType = res.headers?.['Content-Type'] || res.headers?.['content-type'] || ''
    return { text: typeof res.data === 'string' ? res.data : String(res.data), contentType }
  }

  const res = await fetch(`/__feed?url=${encodeURIComponent(url)}`)
  const body = await res.text()
  if (!res.ok) throw new Error(body.slice(0, 140) || `Server returned ${res.status}`)
  return { text: body, contentType: res.headers.get('content-type') || '' }
}

// --- Parsing --------------------------------------------------------------
const text = (node, ...names) => {
  for (const name of names) {
    const el = node.getElementsByTagName(name)[0]
    if (el && el.textContent && el.textContent.trim()) return el.textContent.trim()
  }
  return ''
}

function linkOf(node) {
  const direct = text(node, 'link')
  if (direct) return direct
  // Atom puts the URL in an attribute, and may list several rel types.
  const links = Array.from(node.getElementsByTagName('link'))
  const alt = links.find((l) => (l.getAttribute('rel') || 'alternate') === 'alternate')
  return (alt || links[0])?.getAttribute('href') || ''
}

// WordPress feeds (TechCrunch, VentureBeat, CB Insights) often carry the full
// article in <content:encoded>. When it's substantial, Brief mode can condense
// it directly and skip fetching the article page. The tag is namespaced, so a
// literal-name lookup is tried first and a namespace scan backs it up.
function encodedContent(node) {
  const direct = node.getElementsByTagName('content:encoded')[0]
  if (direct && direct.textContent) return direct.textContent
  const ns = node.getElementsByTagNameNS('*', 'encoded')[0]
  return ns && ns.textContent ? ns.textContent : ''
}

function stripHtml(html) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim()
}

function parseDate(raw) {
  if (!raw) return null
  const ms = Date.parse(raw)
  return Number.isNaN(ms) ? null : ms
}

export function parseFeed(xml, sourceUrl) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error('That URL did not return valid XML — is it the feed address?')
  }

  const channel = doc.getElementsByTagName('channel')[0] || doc.documentElement
  const feedTitle =
    text(channel, 'title') || new URL(sourceUrl).hostname.replace(/^www\./, '')

  // RSS 2.0 and RDF both use <item>; Atom uses <entry>.
  const nodes = [
    ...Array.from(doc.getElementsByTagName('item')),
    ...Array.from(doc.getElementsByTagName('entry')),
  ]

  const items = nodes.map((node) => {
    const link = linkOf(node)
    const title = text(node, 'title') || '(untitled)'
    const guid = text(node, 'guid', 'id') || link || `${feedTitle}::${title}`
    const published =
      parseDate(text(node, 'pubDate', 'published', 'updated', 'dc:date', 'date')) ?? Date.now()

    // Only keep it when substantial — a short <content:encoded> is usually
    // just the excerpt duplicated, not the full article.
    const encoded = stripHtml(encodedContent(node))

    return {
      id: `${sourceUrl}::${guid}`,
      title,
      link,
      published,
      source: feedTitle,
      sourceUrl,
      summary: stripHtml(text(node, 'description', 'summary', 'content')).slice(0, 320),
      fullText: encoded.length > 1200 ? encoded : '',
    }
  })

  return { feedTitle, items }
}

export async function loadFeed(url) {
  const { text: xml } = await fetchText(url)
  return parseFeed(xml, url)
}

// A feed's `match` field is a comma-separated keyword list. Empty means keep all.
function applyMatch(items, match) {
  const terms = (match || '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
  if (!terms.length) return items
  return items.filter((item) => {
    const hay = `${item.title} ${item.summary}`.toLowerCase()
    return terms.some((t) => hay.includes(t))
  })
}

export async function loadAll(feeds, onProgress) {
  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      const parsed = await loadFeed(feed.url)
      onProgress?.(feed.url)
      // A custom name beats whatever the feed calls itself.
      const named = feed.name
        ? parsed.items.map((item) => ({ ...item, source: feed.name }))
        : parsed.items
      return { ...parsed, items: applyMatch(named, feed.match) }
    })
  )

  const items = []
  const errors = []
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') items.push(...result.value.items)
    else errors.push({ url: feeds[i].url, message: result.reason?.message || 'Could not reach it' })
  })

  // De-duplicate: the same story can appear in two feeds.
  const seen = new Set()
  const unique = items.filter((item) => {
    const key = item.link || item.id
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  unique.sort((a, b) => b.published - a.published)
  return { items: unique, errors }
}
