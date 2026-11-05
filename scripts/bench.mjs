// Measures how long it takes to show a docs page: a full page load, a Pagefold visit,
// and a Pagefold visit with the link hovered first (Preload). Serves docs/dist like a
// static host: gzip, ETag + must-revalidate, redirect to the trailing slash.
// Run `pnpm build && pnpm docs:build` first, then `pnpm bench`.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../docs/dist')
const PORT = 4411
const START = '/docs/getting-started/'
const TARGETS = ['options', 'plugin-api', 'preload', 'scroll', 'fragment', 'a11y', 'how-it-works', 'caching-and-history']
const HOVER_MS = 300
const PROFILES = [
  { name: 'No throttling', cfg: null, reps: 5 },
  { name: 'Fast 4G', cfg: { latency: 170, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 }, reps: 5 },
  { name: 'Slow 3G', cfg: { latency: 400, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8 }, reps: 3 },
]
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain' }
const GZIP = new Set(['.html', '.js', '.css', '.svg', '.json', '.xml', '.txt'])

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('docs/dist not found. Run `pnpm build && pnpm docs:build` first.')
  process.exit(1)
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  const p = decodeURIComponent(url.pathname)
  let file = path.join(DIST, p)
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    if (!p.endsWith('/')) {
      res.writeHead(301, { Location: p + '/' + url.search })
      return res.end()
    }
    file = path.join(file, 'index.html')
  }
  if (!fs.existsSync(file)) {
    res.writeHead(404)
    return res.end()
  }
  const ext = path.extname(file)
  let body = fs.readFileSync(file)
  const etag = '"' + crypto.createHash('md5').update(body).digest('hex') + '"'
  const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream', ETag: etag, 'Cache-Control': 'public,max-age=0,must-revalidate' }
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers)
    return res.end()
  }
  if (GZIP.has(ext)) {
    body = zlib.gzipSync(body, { level: 6 })
    headers['Content-Encoding'] = 'gzip'
  }
  headers['Content-Length'] = body.length
  res.writeHead(200, headers)
  res.end(body)
})

const median = (a) => {
  const s = [...a].sort((x, y) => x - y)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// A browser context that counts the bytes and requests of the network.
async function open(browser, profile) {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  const net = { open: new Set(), bytes: 0, requests: 0, last: Date.now() }
  cdp.on('Network.requestWillBeSent', (e) => {
    net.open.add(e.requestId)
    net.requests++
    net.last = Date.now()
    if (e.redirectResponse) net.bytes += e.redirectResponse.encodedDataLength || 0
  })
  cdp.on('Network.loadingFinished', (e) => {
    net.open.delete(e.requestId)
    net.bytes += e.encodedDataLength
    net.last = Date.now()
  })
  cdp.on('Network.loadingFailed', (e) => {
    net.open.delete(e.requestId)
    net.last = Date.now()
  })
  return {
    ctx,
    page,
    net,
    reset: () => Object.assign(net, { bytes: 0, requests: 0 }),
    idle: async () => {
      for (const t = Date.now(); Date.now() - t < 60000; ) {
        if (net.open.size === 0 && Date.now() - net.last > 500) return
        await new Promise((r) => setTimeout(r, 50))
      }
    },
    throttle: () => profile.cfg && cdp.send('Network.emulateNetworkConditions', { offline: false, ...profile.cfg }),
  }
}

const origin = `http://localhost:${PORT}`

// Opening each page with the browser: assets are cached by the warm-up load, the page is not.
async function runFull(browser, profile, titles) {
  const s = await open(browser, profile)
  await s.page.goto(origin + START, { waitUntil: 'load' })
  await s.idle()
  await s.throttle()
  const rows = []
  for (const t of TARGETS) {
    s.reset()
    await s.page.goto(`${origin}/docs/${t}/`, { waitUntil: 'load' })
    const ms = await s.page.evaluate(() => {
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]
      return fcp ? fcp.startTime : performance.getEntriesByType('navigation')[0].loadEventEnd
    })
    await s.idle()
    titles[t] = await s.page.title()
    rows.push({ ms, bytes: s.net.bytes, requests: s.net.requests })
  }
  await s.ctx.close()
  return rows
}

// Clicking each link of the guide: the time until the title of the new page is on screen.
async function runPagefold(browser, profile, titles, hover) {
  const s = await open(browser, profile)
  await s.page.goto(origin + START, { waitUntil: 'load' })
  await s.idle()
  await s.throttle()
  const rows = []
  for (const t of TARGETS) {
    s.reset()
    const href = `/docs/${t}/`
    if (hover) {
      await s.page.hover(`main a[href="${href}"]`)
      await new Promise((r) => setTimeout(r, HOVER_MS))
    }
    const ms = await s.page.evaluate(
      ({ title, href }) =>
        new Promise((resolve, reject) => {
          const a = document.querySelector(`main a[href="${href}"]`)
          if (!a) return reject(new Error('no link ' + href))
          const t0 = performance.now()
          const check = () => (document.title === title ? resolve(performance.now() - t0) : requestAnimationFrame(check))
          a.click()
          check()
        }),
      { title: titles[t], href }
    )
    await s.idle()
    if ((await s.page.evaluate(() => location.pathname)) !== href) throw new Error(`landed on another page for ${href}`)
    rows.push({ ms, bytes: s.net.bytes, requests: s.net.requests })
  }
  await s.ctx.close()
  return rows
}

const summarize = (runs) => {
  const col = (k) => median(runs.flatMap((r) => r.map((x) => x[k])))
  return { ms: Math.round(col('ms')), kb: (col('bytes') / 1024).toFixed(1), requests: col('requests') }
}

await new Promise((r) => server.listen(PORT, r))
const browser = await chromium.launch()
const lines = [`Chromium ${browser.version()}, ${TARGETS.length} pages of the guide, median per page. Preload: ${HOVER_MS} ms of hover before the click.`, '']
lines.push('| Connection | Full page load | Pagefold | Pagefold + Preload |', '| --- | --- | --- | --- |')
try {
  const titles = {}
  for (const profile of PROFILES) {
    const full = []
    const nav = []
    const pre = []
    for (let i = 0; i < profile.reps; i++) {
      full.push(await runFull(browser, profile, titles))
      nav.push(await runPagefold(browser, profile, titles, false))
      pre.push(await runPagefold(browser, profile, titles, true))
    }
    const cell = (runs) => {
      const r = summarize(runs)
      return `${r.ms} ms · ${r.kb} KB · ${r.requests} req`
    }
    lines.push(`| ${profile.name} | ${cell(full)} | ${cell(nav)} | ${cell(pre)} |`)
    process.stderr.write(`${profile.name} done\n`)
  }
} finally {
  await browser.close()
  server.close()
}
console.log(lines.join('\n'))
