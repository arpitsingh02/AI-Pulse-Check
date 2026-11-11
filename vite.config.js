import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Feeds (and, for Brief mode, article pages) almost never send CORS headers,
// so the browser can't fetch them directly. In dev we route through this tiny
// server-side middleware instead. In the packaged Android app this is unused
// — CapacitorHttp fetches natively.
function feedProxy() {
  return {
    name: 'feed-proxy',
    configureServer(server) {
      server.middlewares.use('/__feed', async (req, res) => {
        const target = new URL(req.url, 'http://localhost').searchParams.get('url')
        if (!target) {
          res.statusCode = 400
          return res.end('Missing url parameter')
        }
        try {
          const upstream = await fetch(target, {
            redirect: 'follow',
            headers: {
              'user-agent': 'Mozilla/5.0 (compatible; PulseReader/0.1)',
              accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, */*',
            },
          })
          const body = await upstream.text()
          res.statusCode = upstream.status
          // Forward the real content type — extract.js needs it to tell an
          // article page apart from a PDF or video HN sometimes links to.
          res.setHeader('content-type', upstream.headers.get('content-type') || 'text/plain; charset=utf-8')
          res.end(body)
        } catch (err) {
          res.statusCode = 502
          res.end(String(err && err.message ? err.message : err))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), feedProxy()],
  build: { outDir: 'dist' },
})
