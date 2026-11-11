import { Readability } from '@mozilla/readability'
import { fetchText } from './feeds.js'

// Readability can't do anything with these — hand back to the failure ladder
// instead of feeding binary data through DOMParser. HN in particular links to
// PDFs, GitHub repos with no article body, and the occasional video.
const NON_ARTICLE = /^(application\/pdf|application\/octet-stream|image\/|video\/|audio\/)/i

// Keeps a single long article from ballooning the condense input or the cache
// entry. News articles rarely run past a few thousand words anyway.
const MAX_CHARS = 8000

// Fetches a URL and pulls out the article body text, stripped of nav, ads,
// and boilerplate. Pure I/O + Readability — no scoring or condensing here.
export async function extractArticle(url) {
  let html, contentType
  try {
    ;({ text: html, contentType } = await fetchText(url))
  } catch (err) {
    return { status: 'failed', title: '', text: '', error: err.message }
  }

  if (contentType && NON_ARTICLE.test(contentType)) {
    return { status: 'unsupported', title: '', text: '' }
  }

  let article = null
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    article = new Readability(doc).parse()
  } catch {
    article = null
  }

  if (!article || !article.textContent || !article.textContent.trim()) {
    return { status: 'failed', title: '', text: '' }
  }

  return {
    status: 'ok',
    title: article.title || '',
    text: article.textContent.replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS),
  }
}
