// Hovering a link fetches its page and puts it in the cache before the click
const pagefold = new Pagefold({ plugins: [new PagefoldPreload()] })

const lines = document.querySelector('#lines')
const path = (url) => url.split('/').pop()
const log = (text, kind) => {
  const li = document.createElement('li')
  li.className = kind
  li.textContent = text
  lines.prepend(li)
}

// A page was fetched ahead of the click
pagefold.hooks.on('page:preload', (visit, { page }) => log(`preloaded ${path(page.url)}`, 'pre'))

// A visit: was the page already in the cache, and how long did it take to have it?
let started = 0
let cached = false
pagefold.hooks.on('visit:start', (visit) => {
  started = performance.now()
  cached = pagefold.cache.has(visit.to.url)
})
pagefold.hooks.on('page:load', (visit) => {
  const ms = Math.round(performance.now() - started)
  log(`opened ${path(visit.to.url)} · ${cached ? 'from the cache' : 'from the network'} · ${ms} ms`, cached ? 'hit' : 'miss')
})

// Forget everything, as you would after a login or a change of language
document.querySelector('#clear').addEventListener('click', () => {
  pagefold.cache.clear()
  log('cache emptied', 'pre')
})
