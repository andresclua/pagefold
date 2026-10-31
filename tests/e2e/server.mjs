// Tiny server for the browser tests: serves the built library, animation engines and fixture pages.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'

const ROOT = new URL('../../', import.meta.url).pathname
const PORT = 4173
const types = { '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const NAV = ['/', '/about', '/long', '/slow?ms=1500', '/boom', '/plain-b']
  .map((href) => `<a href="${href}" data-nav>${href}</a>`)
  .join(' ')

/** Wrap content in the document every fixture page shares. */
const shell = ({ title, body, head = '', bodyClass = '', cls = 'transition-fade', split }) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<link rel="stylesheet" href="/fixtures/style.css">${head}
<script type="module" src="/fixtures/boot.js"></script></head>
<body class="${bodyClass}"><nav>${NAV}</nav>
${split ?? `<div id="pagefold" class="${cls}">${body}</div>`}</body></html>`

// Content after the anchor too, so the browser can scroll it all the way to the top
const long = `<h1>Long</h1><div style="height:1500px">tall</div><h2 id="bottom">Bottom</h2><div style="height:2000px">more</div>`
const pages = {
  '/': { title: 'Home', body: '<h1>Home</h1><a id="to-long-hash" href="/long#bottom">bottom</a>' },
  '/about': { title: 'About', body: '<h1>About</h1>', bodyClass: 'about-page' },
  '/long': { title: 'Long', body: long },
  '/slide-a': { title: 'Slide A', body: '<h1>Slide A</h1>', cls: 'transition-slide', head: '<link rel="stylesheet" href="/dist/css/slide.css">' },
  '/slide-b': { title: 'Slide B', body: '<h1>Slide B</h1>', cls: 'transition-slide', head: '<link rel="stylesheet" href="/dist/css/slide.css">' },
  '/alpine-a': { title: 'Alpine A', body: '<h1>Alpine A</h1><div x-data="{ n: 0 }"><button id="inc" @click="n++">+</button> <span id="n" x-text="n"></span></div>' },
  '/alpine-b': { title: 'Alpine B', body: '<h1>Alpine B</h1><div x-data="{ n: 10 }"><button id="inc" @click="n++">+</button> <span id="n" x-text="n"></span></div>' },
  '/plain': { title: 'Plain', body: '<h1>Plain</h1>', cls: '' },
  '/plain-b': { title: 'Plain B', body: '<h1>Plain B</h1>', cls: '' },
  '/head-a': {
    title: 'Head A',
    body: '<h1>Head A</h1>',
    head: '<meta name="description" content="about a"><link rel="stylesheet" href="/css/a.css">',
  },
  '/head-b': {
    title: 'Head B',
    body: '<h1>Head B</h1>',
    head: '<meta name="description" content="about b"><link rel="stylesheet" href="/css/slow.css?ms=500">',
  },
  '/scripts': {
    title: 'Scripts',
    body: '<h1>Scripts</h1><script>window.__ran = (window.__ran || 0) + 1</script>',
  },
  '/form': {
    title: 'Form',
    body: `<h1>Form</h1>
      <form id="get" data-pagefold-form action="/search" method="get"><input name="q" value="cats"><button>go</button></form>
      <form id="post" data-pagefold-form action="/echo" method="post"><input name="note" value="hello"><button>send</button></form>`,
  },
  '/list': {
    title: 'List',
    split: `<div id="list">users: <a href="/detail/1">one</a> <a href="/detail/2">two</a></div><div id="detail" class="transition-fade">pick one</div>`,
  },
  '/detail/1': { title: 'One', split: `<div id="list">users: <a href="/list">back</a></div><div id="detail" class="transition-fade">detail one</div>` },
  '/detail/2': { title: 'Two', split: `<div id="list">users: <a href="/list">back</a></div><div id="detail" class="transition-fade">detail two</div>` },
}

const html = (res, status, content) => {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' })
  res.end(content)
}

const serveFile = async (res, path) => {
  try {
    const ext = path.slice(path.lastIndexOf('.'))
    res.writeHead(200, { 'content-type': types[ext] ?? 'application/octet-stream' })
    res.end(await readFile(path))
  } catch {
    html(res, 404, 'not found')
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  const { pathname } = url
  const ms = Number(url.searchParams.get('ms') ?? 0)

  if (pathname.startsWith('/dist/')) return serveFile(res, ROOT + pathname.slice(1))
  if (pathname.startsWith('/fixtures/')) return serveFile(res, ROOT + 'tests/e2e' + pathname)
  if (pathname === '/vendor/gsap.js') return serveFile(res, ROOT + 'node_modules/gsap/dist/gsap.min.js')
  if (pathname === '/vendor/alpine.js') return serveFile(res, ROOT + 'node_modules/alpinejs/dist/cdn.min.js')
  if (pathname === '/vendor/motion.js') return serveFile(res, ROOT + 'node_modules/motion/dist/motion.js')

  if (pathname.startsWith('/css/')) {
    await sleep(ms)
    res.writeHead(200, { 'content-type': 'text/css' })
    return res.end(`#pagefold{border-left:6px solid rgb(${pathname.includes('slow') ? '0,0,255' : '255,0,0'})}`)
  }
  if (pathname === '/slow') {
    await sleep(ms)
    return html(res, 200, shell({ title: 'Slow', body: '<h1>Slow</h1>' }))
  }
  if (pathname === '/boom') return html(res, 500, 'server error')
  if (pathname === '/search') {
    const q = url.searchParams.get('q')
    return html(res, 200, shell({ title: 'Search', body: `<h1>Results</h1><p id="q">${q}</p>` }))
  }
  if (pathname === '/echo') {
    let body = ''
    for await (const chunk of req) body += chunk
    return html(res, 200, shell({ title: 'Echo', body: `<h1>Echo</h1><p id="method">${req.method}</p><p id="body">${body}</p>` }))
  }

  const page = pages[pathname]
  return page ? html(res, 200, shell(page)) : html(res, 404, shell({ title: '404', body: '<h1>Not found</h1>' }))
}).listen(PORT, () => console.log(`e2e server on http://localhost:${PORT}`))
