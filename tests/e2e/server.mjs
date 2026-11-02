// Tiny server for the browser tests: serves the built library, animation engines and fixture pages.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'

const ROOT = new URL('../../', import.meta.url).pathname
const PORT = 4173
const types = { '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json', '.html': 'text/html; charset=utf-8' }
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
  '/blog/hello': { title: 'Hello post', body: '<h1>Hello post</h1>' },
  '/contact': { title: 'Contact', body: '<h1>Contact</h1>' },
  '/work': { title: 'Work', body: '<h1>Work</h1>' },
  '/work/hello': { title: 'Hello project', body: '<h1>Hello project</h1>' },
  '/page-home': { title: 'Page home', body: '<h1>Page home</h1>', bodyClass: 'page-home theme-light' },
  '/page-blog': { title: 'Page blog', body: '<h1>Page blog</h1>', bodyClass: 'page-blog theme-light' },
  '/dashboard': { title: 'Dashboard', split: '<div id="list">dashboard</div>' },
  '/nested-a': { title: 'Nested A', body: '<div id="detail">detail a</div><p id="stay">outside the detail</p>' },
  '/nested-b': { title: 'Nested B', body: '<div id="detail">detail b</div><p id="stay">outside the detail</p>' },
  '/nested-c': { title: 'Nested C', body: '<p id="stay">no detail here</p>' },
  '/forms2': {
    title: 'Forms 2',
    body: `<h1>Forms 2</h1>
      <form id="plain" action="/search" method="get"><input name="q" value="x"><button>go</button></form>
      <form id="blank" data-pagefold-form action="/search" method="get" target="_blank"><input name="q" value="x"><button>go</button></form>
      <form id="dialog" data-pagefold-form method="dialog"><button>close</button></form>`,
  },
  '/head-keep-a': { title: 'Keep A', body: '<h1>Keep A</h1>', head: '<link rel="stylesheet" href="/css/a.css" id="only-a">' },
  '/head-keep-b': { title: 'Keep B', body: '<h1>Keep B</h1>' },
  '/ignored-script': {
    title: 'Ignored script',
    body: '<h1>Ignored script</h1><script data-pagefold-ignore-script>window.__ignored = true</script><script>window.__ran2 = true</script>',
  },
  '/alpine-p1': { title: 'Alpine P1', body: '<h1>Alpine P1</h1><div data-pagefold-persist="counter" x-data="{ n: 0 }"><button id="inc" @click="n++">+</button> <span id="n" x-text="n"></span></div>' },
  '/alpine-p2': { title: 'Alpine P2', body: '<h1>Alpine P2</h1><div data-pagefold-persist="counter" x-data="{ n: 0 }"><button id="inc" @click="n++">+</button> <span id="n" x-text="n"></span></div>' },
  '/admin': { title: 'Admin', body: '<h1>Admin</h1>' },
  '/widgets-a': { title: 'Widgets A', body: '<h1>Widgets A</h1><div data-slider></div>' },
  '/widgets-b': { title: 'Widgets B', body: '<h1>Widgets B</h1><div data-slider></div><div data-slider></div>' },
  '/persist-a': { title: 'Persist A', body: '<h1>Persist A</h1><audio id="player" data-pagefold-persist="player" controls></audio>' },
  '/persist-b': { title: 'Persist B', body: '<h1>Persist B</h1><audio id="player" data-pagefold-persist="player" controls></audio>' },
  '/outside-a': { title: 'Outside A', split: '<audio id="player" controls></audio><div id="pagefold" class="transition-fade"><h1>Outside A</h1></div>' },
  '/outside-b': { title: 'Outside B', split: '<audio id="player" controls></audio><div id="pagefold" class="transition-fade"><h1>Outside B</h1></div>' },
  '/no-container': { title: 'No container', split: '<p id="other">this page has no container</p>' },
  '/list': {
    title: 'List',
    split: `<div id="list">users: <a href="/detail/1">one</a> <a href="/detail/2">two</a></div><div id="detail" class="transition-fade">pick one</div>`,
  },
  '/detail/1': { title: 'One', split: `<div id="list">users: <a href="/list">back</a></div><div id="detail" class="transition-fade">detail one</div>` },
  '/detail/2': { title: 'Two', split: `<div id="list">users: <a href="/list">back</a></div><div id="detail" class="transition-fade">detail two</div>` },
}

/** A page that loads Pagefold the old way: plain script tags and globals, no modules. */
const umdPage = (title, body) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<meta name="description" content="${title} description"></head>
<body><nav><a href="/umd-a" data-nav>a</a> <a href="/umd-b" data-nav>b</a></nav>
<div id="pagefold">${body}</div>
<script src="/dist/umd/pagefold.js"></script>
<script src="/dist/umd/head.js"></script>
<script src="/dist/umd/a11y.js"></script>
<script>
  window.pagefold = new Pagefold({ animationSelector: false, plugins: [new PagefoldHead(), new PagefoldA11y()] })
  window.__ready = true
</script></body></html>`

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
  // The example sites, as the docs serve them: their library files live in /examples/_lib
  if (pathname.startsWith('/examples/_lib/')) {
    const f = pathname.slice('/examples/_lib/'.length)
    return serveFile(res, ROOT + (f.endsWith('.css') ? 'dist/css/' : 'dist/umd/') + f)
  }
  if (pathname.startsWith('/examples/')) return serveFile(res, ROOT + pathname.slice(1))
  if (pathname.startsWith('/fixtures/')) return serveFile(res, ROOT + 'tests/e2e' + pathname)
  if (pathname === '/vendor/gsap.js') return serveFile(res, ROOT + 'node_modules/gsap/dist/gsap.min.js')
  if (pathname === '/vendor/alpine.js') return serveFile(res, ROOT + 'node_modules/alpinejs/dist/cdn.min.js')
  if (pathname === '/vendor/scrolltrigger.js') return serveFile(res, ROOT + 'node_modules/gsap/dist/ScrollTrigger.min.js')
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
  if (pathname === '/redirect') {
    res.writeHead(302, { location: '/about' })
    return res.end()
  }
  if (pathname === '/headers') {
    const h = req.headers
    return html(res, 200, shell({ title: 'Headers', body: `<h1>Headers</h1><p id="auth">${h.authorization ?? ''}</p><p id="xrw">${h['x-requested-with'] ?? ''}</p><p id="accept">${h.accept ?? ''}</p>` }))
  }
  if (pathname === '/empty') return html(res, 200, '')
  if (pathname === '/whoami') {
    const who = /(?:^|; )user=([^;]*)/.exec(req.headers.cookie ?? '')?.[1] ?? 'nobody'
    return html(res, 200, shell({ title: 'Who', body: `<h1>Who</h1><p id="who">${who}</p>` }))
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

  if (pathname === '/umd-a') return html(res, 200, umdPage('UMD A', '<h1>UMD A</h1>'))
  if (pathname === '/umd-b') return html(res, 200, umdPage('UMD B', '<h1>UMD B</h1>'))

  const page = pages[pathname]
  return page ? html(res, 200, shell(page)) : html(res, 404, shell({ title: '404', body: '<h1>Not found</h1>' }))
}).listen(PORT, () => console.log(`e2e server on http://localhost:${PORT}`))
