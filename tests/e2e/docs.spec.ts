// The examples and claims in the documentation, run as written. If one of these breaks, the page
// that shows it is wrong, so fix the page or the library, never just the test.
import { expect, test, type Page } from '@playwright/test'
import { heading, link, open } from './helpers'

const win = <T = unknown>(page: Page, name: string) =>
  page.evaluate((n) => (window as never as Record<string, T>)[n], name)
const done = (page: Page) =>
  page.waitForFunction(() => !document.documentElement.classList.contains('is-changing'))

test.describe('overlap', () => {
  const slow = `.transition-fade { transition-duration: 1.2s !important }`
  const openOverlap = async (page: Page, options: Record<string, unknown> = {}) => {
    await open(page, '/', { plugins: [['overlap', options]] })
    await page.addStyleTag({ content: slow })
  }
  const bothThere = (page: Page) =>
    page.waitForFunction(() => document.querySelectorAll('#pagefold').length === 2)
  const tops = (page: Page) =>
    page.evaluate(() =>
      [...document.querySelectorAll('#pagefold')].map((el) =>
        Math.round(el.getBoundingClientRect().top)
      )
    )

  test('the incoming container goes first, the outgoing one is hidden from screen readers', async ({
    page,
  }) => {
    await openOverlap(page)
    await link(page, '/about').click()
    await bothThere(page)
    const info = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('#pagefold')].map((el) => ({
        previous: el.classList.contains('is-previous-container'),
        hidden: el.getAttribute('aria-hidden'),
        position: el.style.getPropertyValue('--pagefold-overlap-container'),
        text: el.querySelector('h1')!.textContent,
      }))
    )
    expect(info).toEqual([
      { previous: false, hidden: null, position: '0', text: 'About' },
      { previous: true, hidden: 'true', position: '1', text: 'Home' },
    ])
    await done(page)
    await expect(page.locator('#pagefold')).toHaveCount(1)
  })

  test('without extra CSS the two pages stack one under the other', async ({ page }) => {
    await openOverlap(page)
    await link(page, '/about').click()
    await bothThere(page)
    const [first, second] = await tops(page)
    expect(second).toBeGreaterThan(first)
  })

  test('position: absolute puts them on top of each other', async ({ page }) => {
    await openOverlap(page)
    await page.addStyleTag({
      content: `#pagefold { position: absolute; top: 60px; left: 0; right: 0 }`,
    })
    await link(page, '/about').click()
    await bothThere(page)
    const [first, second] = await tops(page)
    expect(second).toBe(first)
  })

  test('a shared grid cell puts them on top of each other', async ({ page }) => {
    await openOverlap(page)
    await page.addStyleTag({ content: `body { display: grid } #pagefold { grid-area: 2 / 1 }` })
    await link(page, '/about').click()
    await bothThere(page)
    const [first, second] = await tops(page)
    expect(second).toBe(first)
  })

  test('keep holds on to previous containers', async ({ page }) => {
    await openOverlap(page, { keep: 1 })
    await link(page, '/about').click()
    await bothThere(page)
    await done(page)
    await expect(page.locator('#pagefold')).toHaveCount(2)
    await expect(page.locator('#pagefold.is-kept-container')).toHaveCount(1)
  })

  test('visit.animation.overlap = false opts a visit out', async ({ page }) => {
    await openOverlap(page)
    await page.evaluate(`
      pagefold.hooks.on('visit:start', (visit) => {
        if (visit.to.url.startsWith('/about')) visit.animation.overlap = false
      })
      window.__max = 0
      setInterval(() => { window.__max = Math.max(window.__max, document.querySelectorAll('#pagefold').length) }, 10)
    `)
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    await done(page)
    expect(await win(page, '__max')).toBe(1)
  })

  test('content:insert and content:remove fire with the containers', async ({ page }) => {
    await openOverlap(page)
    await page.evaluate(`
      window.__seen = []
      pagefold.hooks.on('content:insert', (v, { containers }) => window.__seen.push(['insert', containers.length]))
      pagefold.hooks.on('content:remove', (v, { containers }) => window.__seen.push(['remove', containers.length]))
    `)
    await link(page, '/about').click()
    await page.waitForFunction(() => (window as never as { __seen: unknown[] }).__seen.length === 2)
    expect(await win(page, '__seen')).toEqual([
      ['insert', 1],
      ['remove', 1],
    ])
  })
})

test.describe('using hooks', () => {
  test('on() returns a function that stops listening', async ({ page }) => {
    await open(page, '/')
    await page.evaluate(`
      window.__n = 0
      const handler = () => { window.__n++ }
      const off = pagefold.hooks.on('page:view', handler)
      window.__off = off
    `)
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    expect(await win(page, '__n')).toBe(1)
    await page.evaluate(`window.__off()`)
    await link(page, '/plain-b').click()
    await expect(heading(page)).toHaveText('Plain B')
    expect(await win(page, '__n')).toBe(1)
  })

  test('an async handler is waited for', async ({ page }) => {
    await open(page, '/')
    await page.evaluate(`
      pagefold.hooks.on('content:replace', async () => {
        await new Promise((resolve) => setTimeout(resolve, 400))
        window.__slowDone = Date.now()
      })
      pagefold.hooks.on('page:view', () => { window.__viewAt = Date.now() })
    `)
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    await page.waitForFunction(
      () => (window as never as { __viewAt?: number }).__viewAt !== undefined
    )
    const [slowDone, viewAt] = await Promise.all([
      win<number>(page, '__slowDone'),
      win<number>(page, '__viewAt'),
    ])
    expect(viewAt).toBeGreaterThanOrEqual(slowDone)
  })

  test('the hooks option, with before and once, and destroy()', async ({ page }) => {
    await open(page, '/')
    expect(
      await page.evaluate(() => document.documentElement.classList.contains('pagefold-enabled'))
    ).toBe(true)
    await page.evaluate(`(async () => {
      await pagefold.destroy()
      window.__afterDestroy = document.documentElement.classList.contains('pagefold-enabled')
      const { default: Pagefold } = await import('/dist/index.js')
      window.__log = []
      window.pagefold = new Pagefold({
        animationSelector: false,
        hooks: {
          'page:view': (visit, args) => { window.__log.push('view') },
          'content:replace.before': (visit, args) => { window.__log.push('before') },
          'visit:end.once': (visit, args) => { window.__log.push('end-once') },
        },
      })
    })()`)
    expect(await win(page, '__afterDestroy')).toBe(false)
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    await link(page, '/plain-b').click()
    await expect(heading(page)).toHaveText('Plain B')
    await page.waitForFunction(() => (window as never as { __log: string[] }).__log.length >= 5)
    expect(await win(page, '__log')).toEqual(['before', 'view', 'end-once', 'before', 'view'])
  })

  test('replace scroll:top, and call the default for everything else', async ({ page }) => {
    await open(page, '/')
    await page.evaluate(`
      document.body.style.minHeight = '3000px'
      window.scrollTo(0, 500)
      pagefold.hooks.replace('scroll:top', (visit, { options }, defaultHandler) => {
        if (visit.to.url.startsWith('/about')) return false // do not scroll
        return defaultHandler(visit, { options })
      })
    `)
    // Not a click: Playwright would scroll the menu into view first
    await page.evaluate(`pagefold.navigate('/about')`)
    await expect(heading(page)).toHaveText('About')
    expect(await page.evaluate(() => window.scrollY)).toBe(500)
    await page.evaluate(`pagefold.navigate('/plain-b')`)
    await expect(heading(page)).toHaveText('Plain B')
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  })

  test('a plugin with a hook of its own (the Cart example)', async ({ page }) => {
    await open(page, '/')
    const result = await page.evaluate(`(async () => {
      const { Plugin } = await import('/dist/index.js')
      window.__tracked = []
      window.analytics = { track: (name, args) => window.__tracked.push([name, { ...args }]) }

      class Cart extends Plugin {
        name = 'Cart'
        items = []

        mount() {
          // 1. Register the hook name. Do it once, before anyone listens.
          this.pagefold.hooks.create('cart:add')
        }

        add(id, quantity = 1) {
          const args = { id, quantity }

          // 2. Fire it. The last function is what happens by default.
          return this.pagefold.hooks.call('cart:add', undefined, args, (visit, args) => {
            this.items.push({ id: args.id, quantity: args.quantity })
            return this.items.length // the value call gives back
          })
        }
      }

      const cart = new Cart()
      pagefold.use(cart)

      // Before the default: change the arguments, or stop it by throwing
      pagefold.hooks.before('cart:add', (visit, args) => {
        if (args.quantity > 10) args.quantity = 10
      })

      // After the default: react to it
      pagefold.hooks.on('cart:add', (visit, args) => {
        analytics.track('add_to_cart', args)
      })

      // Instead of the default: take over, and call the original if you want it
      pagefold.hooks.replace('cart:add', (visit, args, original) => {
        return original(visit, args)
      })

      const count = await cart.add('sku-1', 50)
      return { count, items: cart.items, tracked: window.__tracked }
    })()`)
    expect(result).toEqual({
      count: 1,
      items: [{ id: 'sku-1', quantity: 10 }],
      tracked: [['add_to_cart', { id: 'sku-1', quantity: 10 }]],
    })
  })
})

test.describe('animation hooks', () => {
  const slow = `.transition-fade { transition-duration: 1.5s !important }`

  test('args.skip makes out:await not wait', async ({ page }) => {
    await open(page, '/')
    await page.addStyleTag({ content: slow })
    await page.evaluate(`
      pagefold.hooks.before('animation:out:await', (visit, args) => {
        if (visit.to.url === '/about') args.skip = true
      })
    `)
    const start = Date.now()
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    expect(Date.now() - start).toBeLessThan(1200)
    // Other pages still wait for the animation
    const later = Date.now()
    await link(page, '/plain-b').click()
    await expect(heading(page)).toHaveText('Plain B')
    expect(Date.now() - later).toBeGreaterThan(1200)
  })

  test('replacing out:await lets you do the waiting yourself', async ({ page }) => {
    await open(page, '/')
    await page.addStyleTag({ content: slow })
    await page.evaluate(`
      const myAnimation = () => new Promise((resolve) => setTimeout(resolve, 200))
      pagefold.hooks.replace('animation:out:await', async (visit, { skip }) => {
        if (skip) return
        await myAnimation()
      })
    `)
    const start = Date.now()
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    expect(Date.now() - start).toBeLessThan(1200)
  })
})

test.describe('network hooks', () => {
  test('before fetch:request can add a header, and Pagefold sends its own', async ({ page }) => {
    await open(page, '/')
    await page.evaluate(`
      const token = () => 't0k'
      pagefold.hooks.before('fetch:request', (visit, { options }) => {
        options.headers = { ...options.headers, Authorization: \`Bearer \${token()}\` }
      })
      pagefold.navigate('/headers')
    `)
    await expect(page.locator('#auth')).toHaveText('Bearer t0k')
    await expect(page.locator('#xrw')).toHaveText('pagefold')
    await expect(page.locator('#accept')).toContainText('text/html')
  })

  test('replace fetch:request to use your own fetch', async ({ page, context }) => {
    await context.addCookies([{ name: 'user', value: 'ana', url: 'http://localhost:4173' }])
    await open(page, '/')
    await page.evaluate(`
      pagefold.hooks.replace('fetch:request', (visit, { url, options }) =>
        fetch(url, { ...options, credentials: 'include' })
      )
      pagefold.navigate('/whoami')
    `)
    await expect(page.locator('#who')).toHaveText('ana')
  })

  test('fetch:error receives the status, then the browser loads the page', async ({ page }) => {
    await open(page, '/')
    await page.evaluate(`
      window.__marker = 'same document'
      const reportError = (message) => sessionStorage.setItem('reported', message)
      pagefold.hooks.on('fetch:error', (visit, { status, url }) => {
        reportError(\`Page \${url} answered \${status}\`)
      })
    `)
    await link(page, '/boom').click()
    await expect(page).toHaveURL(/\/boom$/)
    await page.waitForFunction(() => window.__marker === undefined)
    expect(await page.evaluate(() => sessionStorage.getItem('reported'))).toBe(
      'Page http://localhost:4173/boom answered 500'
    )
  })

  test('the timeout option fires fetch:timeout and falls back to a normal load', async ({
    page,
  }) => {
    await open(page, '/', { options: { timeout: 300 } })
    await page.evaluate(`
      window.__marker = 'same document'
      pagefold.hooks.on('fetch:timeout', (visit, { url }) => sessionStorage.setItem('timedOut', url))
    `)
    await link(page, '/slow?ms=1500').click()
    await expect(page).toHaveURL(/\/slow\?ms=1500$/)
    await page.waitForFunction(() => window.__marker === undefined)
    expect(await page.evaluate(() => sessionStorage.getItem('timedOut'))).toContain('/slow?ms=1500')
  })

  test('cache:set tells which page was stored', async ({ page }) => {
    await open(page, '/')
    await page.evaluate(`
      window.__cached = []
      pagefold.hooks.on('cache:set', (visit, { page }) => { window.__cached.push(page.url) })
    `)
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    expect(await win(page, '__cached')).toContain('/about')
  })
})

test.describe('visit, link and content hooks', () => {
  test('page:load can be replaced with your own loader', async ({ page }) => {
    await open(page, '/')
    await page.evaluate(`
      const myLoader = async (url) => '<!doctype html><title>Custom</title><div id="pagefold"><h1>Custom for ' + url + '</h1></div>'
      pagefold.hooks.replace('page:load', async (visit, args) => ({
        url: visit.to.url,
        html: await myLoader(visit.to.url),
      }))
    `)
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('Custom for /about')
  })

  test('visit:abort fires when a new visit starts while one is loading', async ({ page }) => {
    await open(page, '/')
    await page.evaluate(
      `pagefold.hooks.on('visit:abort', () => { window.__aborted = (window.__aborted || 0) + 1 })`
    )
    await link(page, '/slow?ms=1500').click()
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    expect(await win(page, '__aborted')).toBe(1)
  })

  test('history:popstate: the direction is known before the visit starts', async ({ page }) => {
    await open(page, '/')
    await page.evaluate(`
      window.__names = []
      pagefold.hooks.before('history:popstate', (visit) => {
        if (visit.history.direction === 'backwards') visit.animation.name = 'reverse'
      })
      pagefold.hooks.on('content:replace', (visit) => window.__names.push([visit.history.direction ?? null, visit.animation.name ?? null]))
    `)
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    await page.goBack()
    await expect(heading(page)).toHaveText('Home')
    await page.goForward()
    await expect(heading(page)).toHaveText('About')
    expect(await win(page, '__names')).toEqual([
      [null, null],
      ['backwards', 'reverse'],
      ['forwards', null],
    ])
  })

  test('before content:replace can change the incoming document', async ({ page }) => {
    await open(page, '/')
    await page.evaluate(`
      pagefold.hooks.before('content:replace', (visit) => {
        visit.to.document.querySelectorAll('h1').forEach((h) => (h.dataset.touched = 'yes'))
      })
    `)
    await link(page, '/about').click()
    await expect(page.locator('#pagefold h1[data-touched="yes"]')).toHaveText('About')
  })

  test('before scroll:anchor can set the scroll behavior', async ({ page }) => {
    await open(page, '/')
    await page.evaluate(`
      const original = Element.prototype.scrollIntoView
      Element.prototype.scrollIntoView = function (options) { window.__behavior = options?.behavior; return original.call(this, options) }
      pagefold.hooks.before('scroll:anchor', (visit, args) => {
        args.options.behavior = 'smooth'
      })
    `)
    await page.locator('#to-long-hash').click()
    await expect(heading(page)).toHaveText('Long')
    expect(await win(page, '__behavior')).toBe('smooth')
  })

  test('on scroll:anchor runs after the default, so it is too late to change the behavior', async ({
    page,
  }) => {
    await open(page, '/')
    await page.evaluate(`
      const original = Element.prototype.scrollIntoView
      Element.prototype.scrollIntoView = function (options) { window.__behavior = options?.behavior; return original.call(this, options) }
      pagefold.hooks.on('scroll:anchor', (visit, args) => {
        args.options.behavior = 'smooth'
      })
    `)
    await page.locator('#to-long-hash').click()
    await expect(heading(page)).toHaveText('Long')
    expect(await win(page, '__behavior')).not.toBe('smooth')
  })

  test('visit.state only moves forward, in the order the docs list', async ({ page }) => {
    await open(page, '/')
    const result = await page.evaluate(`(async () => {
      const { VisitState } = await import('/dist/index.js')
      const seen = []
      for (const hook of ['visit:start', 'animation:out:start', 'page:load', 'content:replace', 'animation:in:start', 'visit:end']) {
        pagefold.hooks.on(hook, (visit) => seen.push([hook, visit.state]))
      }
      await pagefold.navigate('/about')
      return { seen, VisitState }
    })()`)
    const { seen, VisitState } = result as {
      seen: [string, number][]
      VisitState: Record<string, number>
    }
    const order = Object.entries(VisitState)
      .sort((a, b) => a[1] - b[1])
      .map(([name]) => name)
    expect(order).toEqual([
      'CREATED',
      'QUEUED',
      'STARTED',
      'LEAVING',
      'LOADED',
      'ENTERING',
      'COMPLETED',
      'ABORTED',
      'FAILED',
      'IGNORED',
    ])
    const states = seen.map(([, state]) => state)
    expect(states).toEqual([...states].sort((a, b) => a - b))
    const at = Object.fromEntries(seen)
    expect(at['visit:start']).toBe(VisitState.CREATED)
    expect(at['animation:out:start']).toBe(VisitState.LEAVING)
    expect(at['content:replace']).toBe(VisitState.ENTERING)
    expect(await page.evaluate(() => window.pagefold.visit.state)).toBe(VisitState.COMPLETED)
  })

  test('visit.abort() and visit.ignore() end a visit early', async ({ page }) => {
    await open(page, '/')
    await page.evaluate(`
      pagefold.hooks.on('visit:start', (visit) => {
        window.__states = window.__states || []
        if (visit.to.url === '/about') visit.abort()
        window.__states.push(visit.done)
      })
    `)
    await link(page, '/about').click()
    await page.waitForFunction(
      () => (window as never as { __states?: boolean[] }).__states?.length === 1
    )
    expect(await win(page, '__states')).toEqual([true])
    await expect(heading(page)).toHaveText('Home')
  })
})

test.describe('state classes', () => {
  test('the classes follow the timeline in the docs', async ({ page }) => {
    await open(page, '/')
    await page.evaluate(`
      window.__classes = []
      const names = () => [...document.documentElement.classList].filter((c) => /^(is-|to-)/.test(c)).sort()
      for (const hook of ['animation:out:start', 'animation:out:end', 'content:replace', 'animation:in:start', 'animation:in:end', 'visit:end']) {
        pagefold.hooks.on(hook, () => window.__classes.push([hook, names()]))
      }
    `)
    await page.evaluate(`pagefold.navigate('/about', { animation: 'slide' })`)
    await page.waitForFunction(
      () => (window as never as { __classes: unknown[] }).__classes.length === 6
    )
    expect(await win(page, '__classes')).toEqual([
      ['animation:out:start', ['is-animating', 'is-changing', 'is-leaving', 'to-slide']],
      ['animation:out:end', ['is-animating', 'is-changing', 'is-leaving', 'to-slide']],
      ['content:replace', ['is-animating', 'is-changing', 'is-rendering', 'to-slide']],
      ['animation:in:start', ['is-changing', 'is-rendering', 'to-slide']],
      ['animation:in:end', ['is-changing', 'is-rendering', 'to-slide']],
      ['visit:end', []],
    ])
  })

  test('a visit that starts after the content was replaced waits, and only the last of several runs', async ({
    page,
  }) => {
    await open(page, '/')
    await page.addStyleTag({ content: `.transition-fade { transition-duration: 0.8s !important }` })
    await page.evaluate(`
      window.__rendered = []
      pagefold.hooks.on('content:replace', (visit) => window.__rendered.push(visit.to.url))
    `)
    await page.evaluate(`pagefold.navigate('/about')`)
    await page.waitForFunction(
      () => (window as never as { __rendered: string[] }).__rendered.length === 1
    )
    // /about has replaced the content and is animating in. Three more arrive.
    await page.evaluate(
      `pagefold.navigate('/long'); pagefold.navigate('/plain-b'); pagefold.navigate('/contact')`
    )
    await expect(page).toHaveTitle('Contact')
    await done(page)
    expect(await win(page, '__rendered')).toEqual(['/about', '/contact'])
  })
})

test.describe('which links are handled', () => {
  test('the questions in the flow, in code', async ({ page }) => {
    await open(page, '/')
    const make = (html: string) =>
      page.evaluate((h) => {
        document.body.insertAdjacentHTML('beforeend', h)
        return true
      }, html)
    await make(
      '<div id="b"><a href="/x" target="_blank">x</a></div><div id="d"><a href="/x" download>x</a></div>'
    )
    await make(
      '<div id="o" data-no-pagefold><a href="/x">x</a></div><div id="n"><a href="/about">x</a></div>'
    )
    const ignored = await page.evaluate(() => {
      const check = (href: string, selector?: string) =>
        window.pagefold.shouldIgnoreVisit(href, {
          el: selector ? document.querySelector(selector)! : undefined,
        })
      return {
        otherOrigin: check('https://example.com/x'),
        blank: check('/x', '#b a'),
        download: check('/x', '#d a'),
        optOut: check('/x', '#o a'),
        normal: check('/about', '#n a'),
      }
    })
    expect(ignored).toEqual({
      otherOrigin: true,
      blank: true,
      download: true,
      optOut: true,
      normal: false,
    })
  })

  test('the ignoreVisit option decides too', async ({ page }) => {
    await open(page, '/')
    await page.evaluate(`(async () => {
      await pagefold.destroy()
      const { default: Pagefold } = await import('/dist/index.js')
      window.pagefold = new Pagefold({ ignoreVisit: (url) => url.startsWith('/admin') })
    })()`)
    expect(await page.evaluate(`pagefold.shouldIgnoreVisit('/admin/users')`)).toBe(true)
    expect(await page.evaluate(`pagefold.shouldIgnoreVisit('/about')`)).toBe(false)
  })

  test('a modifier key leaves the link to the browser and fires link:newtab', async ({ page }) => {
    await open(page, '/', { record: true })
    const popup = page.waitForEvent('popup', { timeout: 3000 }).catch(() => null)
    await link(page, '/about').click({ modifiers: ['ControlOrMeta'] })
    await popup
    const events = await page.evaluate(() => window.__events)
    expect(events).toContain('link:newtab')
    expect(events).not.toContain('visit:start')
    await expect(heading(page)).toHaveText('Home')
  })

  test('data-pagefold-animation names the animation and data-pagefold-history replaces the entry', async ({
    page,
  }) => {
    await open(page, '/')
    const before = await page.evaluate(() => history.length)
    await page.evaluate(`
      window.__name = []
      pagefold.hooks.on('content:replace', (visit) => window.__name.push([visit.animation.name, visit.history.action]))
      const a = document.querySelector('nav a[href="/about"]')
      a.setAttribute('data-pagefold-animation', 'slide')
      a.setAttribute('data-pagefold-history', 'replace')
    `)
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    expect(await win(page, '__name')).toEqual([['slide', 'replace']])
    expect(await page.evaluate(() => history.length)).toBe(before)
  })

  test('a #section link on the same page fires link:anchor, and the current page fires link:self', async ({
    page,
  }) => {
    await open(page, '/long', { record: true })
    await page.evaluate(() => {
      document.body.insertAdjacentHTML(
        'beforeend',
        '<a id="same" href="#bottom">bottom</a><a id="self" href="/long">self</a>'
      )
    })
    await page.locator('#same').click()
    await page.locator('#self').click()
    const events = await page.evaluate(() => window.__events)
    expect(events).toContain('link:anchor')
    expect(events).toContain('link:self')
    expect(events).not.toContain('visit:start')
  })

  test('linkToSelf: navigate loads the current page again through Pagefold', async ({ page }) => {
    await open(page, '/long', { record: true, options: { linkToSelf: 'navigate' } })
    await page.evaluate(() =>
      document.body.insertAdjacentHTML('beforeend', '<a id="self" href="/long">self</a>')
    )
    await page.locator('#self').click()
    await expect.poll(() => page.evaluate(() => window.__events.includes('visit:start'))).toBe(true)
  })
})

test.describe('the instance', () => {
  test('navigate with a POST body and cache: false', async ({ page }) => {
    await open(page, '/')
    await page.evaluate(`
      pagefold.navigate('/echo', {
        method: 'POST',
        body: new URLSearchParams({ q: 'cats' }),
        cache: false,
      })
    `)
    await expect(page.locator('#method')).toHaveText('POST')
    await expect(page.locator('#body')).toHaveText('q=cats')
    expect(await page.evaluate(() => window.pagefold.cache.has('/echo'))).toBe(false)
  })

  test('the html element has pagefold-enabled until destroy()', async ({ page }) => {
    await open(page, '/')
    await expect(page.locator('html')).toHaveClass(/pagefold-enabled/)
    await page.evaluate(`pagefold.destroy()`)
    await expect(page.locator('html')).not.toHaveClass(/pagefold-enabled/)
    await page.evaluate(() => {
      window.__marker = 'same document'
    })
    await link(page, '/about').click()
    await expect(page).toHaveURL(/\/about$/)
    await page.waitForFunction(() => window.__marker === undefined)
  })
})

test.describe('plugin API', () => {
  test('a plugin class from the docs: bound handlers, findPlugin and unuse', async ({ page }) => {
    await open(page, '/')
    await page.evaluate(`(async () => {
      const { Plugin } = await import('/dist/index.js')
      window.__gtag = []
      window.gtag = (...args) => window.__gtag.push(args)

      class AnalyticsPlugin extends Plugin {
        name = 'AnalyticsPlugin'

        options
        static defaults = { trackingId: null }

        constructor(options = {}) {
          super()
          this.options = { ...AnalyticsPlugin.defaults, ...options }
        }

        mount() {
          this.on('page:view', this.track)
        }

        track(visit, { url, title }) {
          window.gtag?.('config', this.options.trackingId, { page_path: url, page_title: title })
        }
      }

      pagefold.use(new AnalyticsPlugin({ trackingId: 'G-XXXX' }))
    })()`)
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    expect(await win(page, '__gtag')).toEqual([
      ['config', 'G-XXXX', { page_path: '/about', page_title: 'About' }],
    ])
    expect(await page.evaluate(`pagefold.findPlugin('AnalyticsPlugin') !== undefined`)).toBe(true)
    await page.evaluate(`pagefold.unuse('AnalyticsPlugin')`)
    await link(page, '/plain-b').click()
    await expect(heading(page)).toHaveText('Plain B')
    expect(await win<unknown[]>(page, '__gtag')).toHaveLength(1)
  })

  test('a plugin that cleans up after itself (ScrollSpy)', async ({ page }) => {
    await open(page, '/')
    await page.evaluate(`(async () => {
      const { Plugin } = await import('/dist/index.js')
      window.__added = 0
      window.__removed = 0
      window.__resets = 0
      const add = window.addEventListener.bind(window)
      const remove = window.removeEventListener.bind(window)
      window.addEventListener = (type, fn, ...rest) => { if (type === 'scroll') window.__added++; return add(type, fn, ...rest) }
      window.removeEventListener = (type, fn, ...rest) => { if (type === 'scroll') window.__removed++; return remove(type, fn, ...rest) }

      class ScrollSpy extends Plugin {
        name = 'ScrollSpy'

        mount() {
          window.addEventListener('scroll', this.onScroll)
          this.on('visit:start', this.reset)
        }

        unmount() {
          window.removeEventListener('scroll', this.onScroll)
          super.unmount()
        }

        onScroll = () => {}
        reset = () => { window.__resets++ }
      }
      pagefold.use(new ScrollSpy())
    })()`)
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    expect(await win(page, '__resets')).toBe(1)
    await page.evaluate(`pagefold.unuse('ScrollSpy')`)
    expect([await win(page, '__added'), await win(page, '__removed')]).toEqual([1, 1])
    await link(page, '/plain-b').click()
    await expect(heading(page)).toHaveText('Plain B')
    expect(await win(page, '__resets')).toBe(1) // its hook went away with it
  })

  test('requires: a version that is too new fails with a clear error', async ({ page }) => {
    await open(page, '/')
    const message = await page.evaluate(`(async () => {
      const { Plugin } = await import('/dist/index.js')
      class Needy extends Plugin { name = 'Needy'; requires = { pagefold: '>=99' } }
      try { pagefold.use(new Needy()); return 'no error' } catch (error) { return String(error.message) }
    })()`)
    expect(message).toMatch(/pagefold/i)
    expect(message).not.toBe('no error')
  })
})

test.describe('JS plugin', () => {
  test('which animation runs: the examples in the table', async ({ page }) => {
    await open(page, '/', { options: { animationSelector: false } })
    await page.evaluate(`(async () => {
      const { default: PagefoldJs } = await import('/dist/js.js')
      window.__ran = []
      const entry = (label, extra = {}) => ({
        ...extra,
        out: (done) => { window.__ran.push(label); done() },
        in: (done) => done(),
      })
      pagefold.use(new PagefoldJs([
        entry('slide', { name: 'slide' }),
        entry('zoom', { from: '/', to: '/blog/:slug' }),
        entry('fade'),
      ]))
    })()`)
    const go = async (url: string, animation?: string) => {
      await page.evaluate(
        ([u, a]) => window.pagefold.navigate(u!, a ? { animation: a } : {}),
        [url, animation]
      )
    }
    await go('/blog/hello') // from / : zoom
    await go('/contact') // no pattern matches: the first entry without a name
    await go('/about', 'slide') // a name wins
    await go('/') // back to the start (fade)
    await go('/blog/hello', 'slide') // the name wins over the patterns
    expect(await win(page, '__ran')).toEqual(['zoom', 'fade', 'slide', 'fade', 'slide'])
  })
})

test.describe('route name', () => {
  test('route names, classes and the animation name', async ({ page }) => {
    await open(page, '/work', {
      plugins: [
        [
          'route-name',
          {
            routes: { home: '/', work: '/work', project: '/work/:slug' },
            animations: [
              { from: 'work', to: 'project', animation: 'expand' },
              { from: 'project', to: 'work', animation: 'collapse' },
            ],
          },
        ],
      ],
    })
    await page.evaluate(`
      window.__seen = []
      pagefold.hooks.on('content:replace', (visit) => {
        window.__seen.push({
          from: visit.from.route, to: visit.to.route,
          classes: [...document.documentElement.classList].filter((c) => /^(from-route|to-)/.test(c)).sort(),
        })
      })
    `)
    await page.evaluate(`pagefold.navigate('/work/hello')`)
    await expect(heading(page)).toHaveText('Hello project')
    await done(page)
    expect(await win(page, '__seen')).toEqual([
      {
        from: 'work',
        to: 'project',
        classes: ['from-route-work', 'to-expand', 'to-route-project'],
      },
    ])
    expect(
      await page.evaluate(() =>
        [...document.documentElement.classList].filter((c) => /^(from-route|to-)/.test(c))
      )
    ).toEqual([])
  })
})

test.describe('body class', () => {
  const scenario = async (page: Page, plugins: [string, Record<string, unknown>?][]) => {
    await open(page, '/page-home', { plugins })
    await page.evaluate(`document.body.classList.add('menu-open')`)
    await page.evaluate(`pagefold.navigate('/page-blog')`)
    await expect(heading(page)).toHaveText('Page blog')
    return page.evaluate(() => [...document.body.classList].sort())
  }

  test('without the plugin the old classes stay', async ({ page }) => {
    expect(await scenario(page, [])).toEqual(['menu-open', 'page-home', 'theme-light'])
  })
  test('with the plugin and no prefix the whole attribute is replaced', async ({ page }) => {
    expect(await scenario(page, [['body-class']])).toEqual(['page-blog', 'theme-light'])
  })
  test('with a prefix only those classes are swapped', async ({ page }) => {
    expect(await scenario(page, [['body-class', { prefix: 'page-' }]])).toEqual([
      'menu-open',
      'page-blog',
      'theme-light',
    ])
  })
})

test.describe('a11y', () => {
  test('a custom announcement uses the page heading', async ({ page }) => {
    await open(page, '/', { plugins: [['a11y', { announcement: 'Ahora en: {title}' }]] })
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    await expect(page.locator('[role="status"][aria-live="polite"]')).toHaveText('Ahora en: About')
  })

  test('focus goes to the content and the temporary tabindex goes away', async ({ page }) => {
    await open(page, '/', { plugins: [['a11y']] })
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    await expect(page.locator('#pagefold')).toBeFocused()
    await expect(page.locator('#pagefold')).toHaveAttribute('tabindex', '-1')
    await page.locator('body').evaluate((b) => (b as HTMLElement).focus())
    await page.evaluate(`document.querySelector('nav a').focus()`)
    await expect(page.locator('#pagefold')).not.toHaveAttribute('tabindex', /.*/)
  })

  test('focus stays in a text field', async ({ page }) => {
    await open(page, '/', { plugins: [['a11y']] })
    await page.evaluate(`
      document.body.insertAdjacentHTML('beforeend', '<input id="outside">')
      document.querySelector('#outside').focus()
    `)
    await page.evaluate(`pagefold.navigate('/about')`)
    await expect(heading(page)).toHaveText('About')
    await expect(page.locator('#outside')).toBeFocused()
    await expect(page.locator('#pagefold')).not.toBeFocused()
  })
})

test.describe('progress', () => {
  test('styles: false leaves the styling to you, and the bar is decoration', async ({ page }) => {
    await open(page, '/', { plugins: [['progress', { styles: false, delay: 0 }]] })
    await page.evaluate(`void pagefold.navigate('/slow?ms=1200')`)
    const bar = page.locator('.pagefold-progress-bar')
    await expect(bar).toHaveCount(1)
    await expect(bar).toHaveAttribute('aria-hidden', 'true')
    expect(await bar.evaluate((el) => (el as HTMLElement).style.zIndex)).toBe('')
  })

  test('the default bar has a high z-index', async ({ page }) => {
    await open(page, '/', { plugins: [['progress', { delay: 0 }]] })
    await page.evaluate(`void pagefold.navigate('/slow?ms=1200')`)
    const bar = page.locator('.pagefold-progress-bar')
    await expect(bar).toHaveCount(1)
    expect(await bar.evaluate((el) => (el as HTMLElement).style.zIndex)).toBe('99999')
  })

  const barsDuring = async (
    page: Page,
    options: Record<string, unknown>,
    config: Record<string, unknown> = {}
  ) => {
    await open(page, '/', { plugins: [['progress', options]], ...config })
    await page.evaluate(
      `window.__bars = 0; new MutationObserver(() => { window.__bars = Math.max(window.__bars, document.querySelectorAll('.pagefold-progress-bar').length) }).observe(document.body, { childList: true, subtree: true })`
    )
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    await done(page)
    return win(page, '__bars')
  }

  test('a visit that is over before the delay shows nothing', async ({ page }) => {
    expect(await barsDuring(page, { delay: 300 }, { options: { animationSelector: false } })).toBe(
      0
    )
  })

  test('the delay counts from the click, so it includes the animation out', async ({ page }) => {
    // The page is in the cache of the server and instant, but the fade out takes 300 ms
    expect(await barsDuring(page, { delay: 100 })).toBe(1)
  })
})

test.describe('preload', () => {
  const fetched = (page: Page) => {
    const urls: string[] = []
    page.on('request', (r) => {
      if (r.resourceType() === 'fetch')
        urls.push(new URL(r.url()).pathname + new URL(r.url()).search)
    })
    return urls
  }
  const quiet = { preloadHoveredLinks: false, preloadInitialPage: false }

  test('preload() takes a URL, a link, a list, and preloadLinks() every link inside', async ({
    page,
  }) => {
    const urls = fetched(page)
    await open(page, '/', { plugins: [['preload', quiet]] })
    await page.evaluate(`(async () => {
      const preload = pagefold.findPlugin('PagefoldPreload')
      const linkElement = document.querySelector('nav a[href="/about"]')
      await preload.preload('/contact')
      await preload.preload(linkElement)
      await preload.preload(['/work', '/work/hello'])
      await preload.preload('/page-home', { priority: true })
      await preload.preloadLinks(document.querySelector('nav'))
    })()`)
    for (const path of [
      '/contact',
      '/about',
      '/work',
      '/work/hello',
      '/page-home',
      '/long',
      '/plain-b',
    ]) {
      expect(urls).toContain(path)
    }
    expect(urls.filter((u) => u === '/about')).toHaveLength(1) // asked for twice, fetched once
  })

  test('a click that comes while the page is still being preloaded waits for the same request', async ({
    page,
  }) => {
    const urls = fetched(page)
    await open(page, '/', { plugins: [['preload', { hoverDelay: 0, preloadInitialPage: false }]] })
    await link(page, '/slow?ms=1500').hover()
    await expect.poll(() => urls.filter((u) => u.startsWith('/slow')).length).toBe(1)
    await link(page, '/slow?ms=1500').click()
    await expect(heading(page)).toHaveText('Slow')
    expect(urls.filter((u) => u.startsWith('/slow'))).toHaveLength(1)
  })

  test('data-no-preload and ignore skip a link', async ({ page }) => {
    const urls = fetched(page)
    await open(page, '/', { plugins: [['preload', { hoverDelay: 0, preloadInitialPage: false }]] })
    await page.evaluate(
      `document.querySelector('nav a[href="/about"]').setAttribute('data-no-preload', '')`
    )
    await link(page, '/about').hover()
    await link(page, '/long').hover()
    await expect.poll(() => urls.includes('/long')).toBe(true)
    expect(urls).not.toContain('/about')
  })
})

test.describe('head and scripts', () => {
  test('identical tags are not touched, tags only the old page has are removed', async ({
    page,
  }) => {
    await open(page, '/head-keep-a', { plugins: [['head']] })
    await page.evaluate(`document.querySelector('link[href="/fixtures/style.css"]').same = true`)
    await expect(page.locator('#only-a')).toHaveCount(1)
    await page.evaluate(`pagefold.navigate('/head-keep-b')`)
    await expect(heading(page)).toHaveText('Keep B')
    expect(
      await page.evaluate(
        () =>
          (
            document.querySelector('link[href="/fixtures/style.css"]') as HTMLLinkElement & {
              same?: boolean
            }
          ).same
      )
    ).toBe(true)
    await expect(page.locator('#only-a')).toHaveCount(0)
  })

  test('persistTags keeps a tag the new page does not have', async ({ page }) => {
    await open(page, '/head-keep-a', { plugins: [['head', { persistTags: '#only-a' }]] })
    await page.evaluate(`pagefold.navigate('/head-keep-b')`)
    await expect(heading(page)).toHaveText('Keep B')
    await expect(page.locator('#only-a')).toHaveCount(1)
  })

  test('data-pagefold-ignore-script is never run, others are', async ({ page }) => {
    await open(page, '/', { plugins: [['scripts']] })
    await page.evaluate(`pagefold.navigate('/ignored-script')`)
    await expect(heading(page)).toHaveText('Ignored script')
    await page.waitForFunction(() => (window as never as { __ran2?: boolean }).__ran2 === true)
    expect(await win(page, '__ignored')).toBeUndefined()
  })

  test('optin: true runs only the scripts you mark', async ({ page }) => {
    await open(page, '/', { plugins: [['scripts', { optin: true }]] })
    await page.evaluate(`pagefold.navigate('/ignored-script')`)
    await expect(heading(page)).toHaveText('Ignored script')
    await page.waitForTimeout(200)
    expect(await win(page, '__ran2')).toBeUndefined()
  })
})

test.describe('forms and fragment', () => {
  test('forms: the questions in the flow', async ({ page }) => {
    await open(page, '/forms2', { plugins: [['forms']], record: true })
    // A form without data-pagefold-form is left to the browser: a normal load
    await page.evaluate(() => {
      window.__marker = 'same document'
    })
    await page.evaluate(`document.querySelector('#dialog button').click()`)
    await page.waitForTimeout(200)
    expect(await page.evaluate(() => window.__events)).not.toContain('visit:start')
    await page.locator('#plain button').click()
    await expect(page).toHaveURL(/\/search\?q=x$/)
    await page.waitForFunction(() => window.__marker === undefined)
  })

  test('fragment: a rule is dropped when the new page lacks the container, and the way back needs a rule', async ({
    page,
  }) => {
    await open(page, '/nested-a', {
      plugins: [
        [
          'fragment',
          { rules: [{ from: '/nested-:x', to: '/nested-:y', containers: ['#detail'] }] },
        ],
      ],
    })
    await page.evaluate(`document.querySelector('#stay').same = true`)
    await page.evaluate(`pagefold.navigate('/nested-b')`)
    await expect(page.locator('#detail')).toHaveText('detail b')
    expect(
      await page.evaluate(
        () => (document.querySelector('#stay') as HTMLElement & { same?: boolean }).same
      )
    ).toBe(true)
    // The new page has no #detail: everything is replaced instead
    await page.evaluate(`pagefold.navigate('/nested-c')`)
    await expect(page.locator('#stay')).toHaveText('no detail here')
    await expect(page.locator('#detail')).toHaveCount(0)
  })

  test('fragment: with two normal containers, a page without one of them falls back to the browser', async ({
    page,
  }) => {
    await open(page, '/list', {
      options: { containers: ['#list', '#detail'] },
      plugins: [
        ['fragment', { rules: [{ from: '/list', to: '/dashboard', containers: ['#detail'] }] }],
      ],
    })
    await page.evaluate(() => {
      window.__marker = 'same document'
    })
    await page.evaluate(`pagefold.navigate('/dashboard')`)
    await page.waitForFunction(() => window.__marker === undefined)
    await expect(page.locator('#list')).toHaveText('dashboard')
  })
})

test.describe('themes and view transitions', () => {
  test('--pagefold-duration changes the slide theme', async ({ page }) => {
    await open(page, '/slide-a')
    const duration = () =>
      page.evaluate(() => getComputedStyle(document.querySelector('#pagefold')!).transitionDuration)
    expect(await duration()).not.toContain('0.6s')
    await page.addStyleTag({
      content: `:root { --pagefold-duration: 0.6s; --pagefold-distance: 6rem; }`,
    })
    expect(await duration()).toContain('0.6s')
  })
})

const loadVendor = (page: Page, name: string) =>
  page.evaluate(
    (src) =>
      new Promise<void>((resolve, reject) => {
        const s = document.createElement('script')
        s.src = src
        s.onload = () => resolve()
        s.onerror = reject
        document.head.append(s)
      }),
    `/vendor/${name}.js`
  )

test.describe('animating in JavaScript', () => {
  const noCss = { options: { animationSelector: false } }

  test('the contract: done(), a promise, or nothing at all', async ({ page }) => {
    await open(page, '/', noCss)
    await page.evaluate(`(async () => {
      const { default: PagefoldJs } = await import('/dist/js.js')
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      pagefold.use(new PagefoldJs([
        { name: 'callback', out: (done) => setTimeout(done, 400), in: (done) => done() },
        { name: 'promise', out: () => wait(400), in: () => {} },
        { name: 'nothing', out: () => { wait(400) }, in: () => {} },
      ]))
    })()`)
    const time = async (name: string) => {
      const start = Date.now()
      await page.evaluate(
        (n) => window.pagefold.navigate('/about?' + n, { animation: n, cache: false }),
        name
      )
      return Date.now() - start
    }
    expect(await time('callback')).toBeGreaterThanOrEqual(380)
    expect(await time('promise')).toBeGreaterThanOrEqual(380)
    expect(await time('nothing')).toBeLessThan(380)
  })

  test('the second argument has the visit, the direction and both pages with their parameters', async ({
    page,
  }) => {
    await open(page, '/', noCss)
    await page.evaluate(`(async () => {
      const { default: PagefoldJs } = await import('/dist/js.js')
      pagefold.use(new PagefoldJs([
        { from: '/', to: '/blog/:slug', out: (done, data) => {
          window.__data = { keys: Object.keys(data).sort(), slug: data.to.params.slug, pattern: data.to.pattern, fromUrl: data.from.url, hasVisit: !!data.visit }
          done()
        }, in: (done) => done() },
      ]))
    })()`)
    await page.evaluate(`pagefold.navigate('/blog/hello')`)
    expect(await win(page, '__data')).toEqual({
      keys: ['direction', 'from', 'to', 'visit'],
      slug: 'hello',
      pattern: '/blog/:slug',
      fromUrl: '/',
      hasVisit: true,
    })
  })

  test('if your function throws, the visit fails and the browser loads the page', async ({
    page,
  }) => {
    await open(page, '/', noCss)
    await page.evaluate(`(async () => {
      const { default: PagefoldJs } = await import('/dist/js.js')
      window.__marker = 'same document'
      pagefold.use(new PagefoldJs([{ out: () => { throw new Error('boom') }, in: (done) => done() }]))
    })()`)
    await link(page, '/about').click()
    await expect(page).toHaveURL(/\/about$/)
    await page.waitForFunction(() => window.__marker === undefined)
  })

  test('GSAP: a timeline, and an animation per page', async ({ page }) => {
    await open(page, '/', noCss)
    await loadVendor(page, 'gsap')
    await page.evaluate(`(async () => {
      const { default: PagefoldJs } = await import('/dist/js.js')
      const { gsap } = window
      window.__used = []
      const expandOut = (done) => { window.__used.push('expand'); gsap.to('#pagefold', { opacity: 0, duration: 0.2, onComplete: done }) }
      const expandIn = (done) => gsap.fromTo('#pagefold', { opacity: 0 }, { opacity: 1, duration: 0.2, onComplete: done })
      const curtainOut = (done) => { window.__used.push('curtain'); gsap.to('#pagefold', { opacity: 0, duration: 0.2, onComplete: done }) }
      const curtainIn = (done) => gsap.fromTo('#pagefold', { opacity: 0 }, { opacity: 1, duration: 0.2, onComplete: done })
      const fadeOut = (done) => {
        window.__used.push('fade')
        gsap
          .timeline({ onComplete: done })
          .to('#pagefold h1', { y: -30, opacity: 0, duration: 0.3 })
          .to('#pagefold .content', { opacity: 0, duration: 0.3 }, '<')
      }
      const fadeIn = (done) => {
        gsap
          .timeline({ onComplete: done })
          .from('#pagefold h1', { y: 30, opacity: 0, duration: 0.4 })
          .from('#pagefold .content', { opacity: 0, duration: 0.4 }, '<0.1')
      }
      pagefold.use(new PagefoldJs({ animations: [
        { from: '/', to: '/work/:slug', out: expandOut, in: expandIn },
        { name: 'curtain', out: curtainOut, in: curtainIn },
        { out: fadeOut, in: fadeIn }, // default
      ] }))
    })()`)
    // The docs timeline animates a .content element too: give the pages one
    await page.evaluate(() =>
      document
        .querySelector('#pagefold')!
        .insertAdjacentHTML('beforeend', '<div class="content">x</div>')
    )
    await page.evaluate(`pagefold.navigate('/work/hello')`)
    await page.evaluate(`pagefold.navigate('/about', { animation: 'curtain' })`)
    await page.evaluate(`pagefold.navigate('/contact')`)
    await expect(heading(page)).toHaveText('Contact')
    expect(await win(page, '__used')).toEqual(['expand', 'curtain', 'fade'])
    // The timeline came back to rest
    expect(
      await page.evaluate(() =>
        Number(getComputedStyle(document.querySelector('#pagefold h1')!).opacity)
      )
    ).toBe(1)
  })

  test('GSAP: kill ScrollTrigger instances before the content is replaced, create new ones on page:view', async ({
    page,
  }) => {
    await open(page, '/long')
    await loadVendor(page, 'gsap')
    await loadVendor(page, 'scrolltrigger')
    await page.evaluate(`
      gsap.registerPlugin(ScrollTrigger)
      window.__created = 0
      const initPageAnimations = () => { ScrollTrigger.create({ trigger: '#pagefold h1', start: 'top 80%' }); window.__created++ }
      initPageAnimations()
      pagefold.hooks.before('content:replace', () => ScrollTrigger.getAll().forEach((t) => t.kill()))
      pagefold.hooks.on('page:view', () => initPageAnimations())
      window.__counts = []
      pagefold.hooks.on('content:replace', () => window.__counts.push(ScrollTrigger.getAll().length))
    `)
    expect(
      await page.evaluate(
        () =>
          (window as never as { ScrollTrigger: { getAll(): unknown[] } }).ScrollTrigger.getAll()
            .length
      )
    ).toBe(1)
    await page.evaluate(`pagefold.navigate('/about')`)
    await expect(heading(page)).toHaveText('About')
    expect(await win(page, '__counts')).toEqual([0]) // the old one was gone when the content changed
    expect(
      await page.evaluate(
        () =>
          (window as never as { ScrollTrigger: { getAll(): unknown[] } }).ScrollTrigger.getAll()
            .length
      )
    ).toBe(1)
    expect(await win(page, '__created')).toBe(2)
  })

  test('Motion: an animation per page, and springs with stagger', async ({ page }) => {
    await open(page, '/', noCss)
    await loadVendor(page, 'motion')
    await page.evaluate(`(async () => {
      const { default: PagefoldJs } = await import('/dist/js.js')
      const { animate, stagger } = window.Motion
      window.__used = []
      pagefold.use(new PagefoldJs({ animations: [
        {
          from: '/',
          to: '/work/:slug',
          out: () => { window.__used.push('zoom'); return animate('#pagefold', { opacity: 0, scale: 0.96 }, { duration: 0.3 }) },
          in: () => animate('#pagefold', { opacity: [0, 1], scale: [1.04, 1] }, { duration: 0.4 }),
        },
        {
          out: () => { window.__used.push('fade'); return animate('#pagefold', { opacity: 0 }, { duration: 0.3 }) },
          in: () => animate(
            '#pagefold h1, #pagefold p',
            { opacity: [0, 1], transform: ['translateY(20px)', 'none'] },
            { type: 'spring', stiffness: 200, damping: 20, delay: stagger(0.08) }
          ),
        },
      ] }))
    })()`)
    await page.evaluate(`pagefold.navigate('/work/hello')`)
    await page.evaluate(`pagefold.navigate('/about')`)
    await expect(heading(page)).toHaveText('About')
    expect(await win(page, '__used')).toEqual(['zoom', 'fade'])
    await expect
      .poll(() =>
        page.evaluate(() =>
          Number(getComputedStyle(document.querySelector('#pagefold h1')!).opacity)
        )
      )
      .toBe(1)
  })

  test('Web Animations API: the slide', async ({ page }) => {
    await open(page, '/', noCss)
    await page.evaluate(`(async () => {
      const { default: PagefoldJs } = await import('/dist/js.js')
      const el = () => document.querySelector('#pagefold')
      pagefold.use(new PagefoldJs({ animations: [{
        out: () =>
          el().animate(
            [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-24px)' }],
            { duration: 300, easing: 'ease-in', fill: 'forwards' }
          ).finished,
        in: () =>
          el().animate(
            [{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'translateY(0)' }],
            { duration: 400, easing: 'ease-out' }
          ).finished,
      }] }))
    })()`)
    await page.evaluate(`pagefold.navigate('/about')`)
    await expect(heading(page)).toHaveText('About')
    await expect
      .poll(() =>
        page.evaluate(() => getComputedStyle(document.querySelector('#pagefold')!).opacity)
      )
      .toBe('1')
  })
})

test.describe('CSS animations', () => {
  const still = `.transition-fade { transition: none !important }`
  const transforms = async (page: Page, hooks: string[]) => {
    await page.evaluate(`
      window.__t = []
      for (const hook of ${JSON.stringify(hooks)}) {
        pagefold.hooks.on(hook, () => {
          const style = getComputedStyle(document.querySelector('#pagefold'))
          window.__t.push([hook, style.transform, style.opacity])
        })
      }
    `)
    await page.evaluate(`pagefold.navigate('/about')`)
    await done(page)
    return win<[string, string, string][]>(page, '__t')
  }

  test('different animations going in and out', async ({ page }) => {
    await open(page, '/')
    await page.addStyleTag({
      content: `${still}
        html.is-animating .transition-fade { opacity: 0; }
        html.is-leaving.is-animating .transition-fade { transform: translateX(-2rem); }
        html.is-rendering.is-animating .transition-fade { transform: translateX(2rem); }`,
    })
    const t = await transforms(page, [
      'animation:out:start',
      'content:replace',
      'animation:in:start',
      'visit:end',
    ])
    expect(t).toEqual([
      ['animation:out:start', 'matrix(1, 0, 0, 1, -32, 0)', '0'],
      ['content:replace', 'matrix(1, 0, 0, 1, 32, 0)', '0'],
      ['animation:in:start', 'none', '1'],
      ['visit:end', 'none', '1'],
    ])
  })

  test('without is-animating the offset stays until the very end of the visit', async ({
    page,
  }) => {
    await open(page, '/')
    await page.addStyleTag({
      content: `${still} html.is-rendering .transition-fade { transform: translateX(2rem); }`,
    })
    const t = await transforms(page, ['animation:in:start', 'animation:in:end', 'visit:end'])
    expect(t.map(([hook, transform]) => [hook, transform])).toEqual([
      ['animation:in:start', 'matrix(1, 0, 0, 1, 32, 0)'],
      ['animation:in:end', 'matrix(1, 0, 0, 1, 32, 0)'],
      ['visit:end', 'none'],
    ])
  })

  test('history visits are not animated unless animateHistoryBrowsing is on, and is-popstate marks them', async ({
    page,
  }) => {
    await open(page, '/', { record: true })
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    await page.evaluate(() => (window.__events.length = 0))
    await page.goBack()
    await expect(heading(page)).toHaveText('Home')
    expect(await page.evaluate(() => window.__events)).not.toContain('animation:out:start')

    await open(page, '/', { record: true, options: { animateHistoryBrowsing: true } })
    await page.evaluate(`
      window.__pop = []
      pagefold.hooks.on('animation:out:start', () => window.__pop.push(document.documentElement.classList.contains('is-popstate')))
    `)
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    await page.goBack()
    await expect(heading(page)).toHaveText('Home')
    expect(await win(page, '__pop')).toEqual([false, true])
  })

  test('animationSelector: false does not wait for anything', async ({ page }) => {
    await open(page, '/', { options: { animationSelector: false } })
    await page.addStyleTag({ content: `.transition-fade { transition-duration: 2s !important }` })
    const start = Date.now()
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    expect(Date.now() - start).toBeLessThan(1500)
  })

  test('the two console warnings in the docs', async ({ page }) => {
    const warnings: string[] = []
    page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()))
    await open(page, '/plain')
    await page.evaluate(`pagefold.navigate('/plain-b')`)
    expect(warnings.some((w) => w.includes('No elements match animationSelector'))).toBe(true)

    await page.addStyleTag({ content: `.no-motion { color: red }` })
    await page.evaluate(`document.querySelector('#pagefold').className = 'transition-x no-motion'`)
    await page.evaluate(`pagefold.navigate('/about?x=1')`)
    expect(warnings.some((w) => w.includes('No CSS animation duration defined'))).toBe(true)
  })
})

test.describe('Alpine', () => {
  test('a component outside the container keeps its state, a store survives, and a persisted one keeps its state', async ({
    page,
  }) => {
    await open(page, '/alpine-p1', { alpine: true })
    await page.evaluate(`
      document.body.insertAdjacentHTML('afterbegin', '<div id="menu" x-data="{ open: false }"><button id="toggle" @click="open = !open">Menu</button><span id="state" x-text="open"></span></div>')
      Alpine.store('cart', { items: [] })
      Alpine.store('cart').items.push('a')
    `)
    await page.locator('#toggle').click()
    await expect(page.locator('#state')).toHaveText('true')
    await page.locator('#pagefold #inc').click()
    await page.locator('#pagefold #inc').click()
    await expect(page.locator('#pagefold #n')).toHaveText('2')
    await page.evaluate(`pagefold.navigate('/alpine-p2')`)
    await expect(heading(page)).toHaveText('Alpine P2')
    await expect(page.locator('#state')).toHaveText('true') // outside the container
    await expect(page.locator('#pagefold #n')).toHaveText('2') // data-pagefold-persist
    expect(await page.evaluate(`Alpine.store('cart').items`)).toEqual(['a'])
  })

  test('without persist the component starts again', async ({ page }) => {
    await open(page, '/alpine-a', { alpine: true })
    await page.locator('#inc').click()
    await expect(page.locator('#n')).toHaveText('1')
    await page.evaluate(`pagefold.navigate('/alpine-b')`)
    await expect(page.locator('#n')).toHaveText('10')
    await page.goBack()
    await expect(page.locator('#n')).toHaveText('0')
  })
})

test.describe('scroll, debug, forms, preload and analytics', () => {
  test('scroll: scrollTo from code, animated or as a jump, with an offset', async ({ page }) => {
    await open(page, '/long', { plugins: [['scroll', { duration: 300 }]] })
    await page.evaluate(`(async () => {
      const scroll = pagefold.findPlugin('PagefoldScroll')
      scroll.options.offset = () => 100
      window.__scroll = scroll
    })()`)
    await page.evaluate(`window.__scroll.scrollTo(300, false)`) // jump
    expect(await page.evaluate(() => window.scrollY)).toBe(300)
    const start = Date.now()
    await page.evaluate(`window.__scroll.scrollTo(0)`) // animated
    expect(Date.now() - start).toBeGreaterThanOrEqual(250)
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
    await page.evaluate(`window.__scroll.scrollTo(document.querySelector('#bottom'))`)
    const [y, top] = await page.evaluate(() => [
      Math.round(window.scrollY),
      Math.round(document.querySelector('#bottom')!.getBoundingClientRect().top + window.scrollY),
    ])
    expect(Math.abs(y - (top - 100))).toBeLessThanOrEqual(1) // the offset leaves room for a sticky header (a pixel of rounding in WebKit)
  })

  test('scroll: animateScroll betweenPages false jumps, anchors glide', async ({ page }) => {
    await open(page, '/long', {
      plugins: [['scroll', { duration: 600, animateScroll: { betweenPages: false } }]],
    })
    await page.evaluate(`window.scrollTo(0, 500)`)
    const start = Date.now()
    await page.evaluate(`pagefold.navigate('/about')`)
    await expect(heading(page)).toHaveText('About')
    expect(Date.now() - start).toBeLessThan(900)
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
  })

  test('debug: lines look like the docs, and filter limits them', async ({ page }) => {
    const lines: string[] = []
    page.on('console', (m) => lines.push(m.text()))
    await open(page, '/', { plugins: [['debug']] })
    await page.evaluate(`pagefold.navigate('/about')`)
    await expect.poll(() => lines.some((l) => l.includes('visit:end'))).toBe(true)
    const start = lines.find((l) => l.includes('visit:start'))!
    expect(start).toMatch(/visit:start · visit #\d+ \/ → \/about \+\d+ms/)
    expect(lines.some((l) => l.includes('animation:out:start'))).toBe(true)

    lines.length = 0
    await page.evaluate(`(async () => {
      const { default: PagefoldDebug } = await import('/dist/debug.js')
      pagefold.unuse('PagefoldDebug')
      pagefold.use(new PagefoldDebug({ filter: (hook) => hook.startsWith('visit:') }))
    })()`)
    await page.evaluate(`pagefold.navigate('/plain-b')`)
    await expect.poll(() => lines.some((l) => l.includes('visit:end'))).toBe(true)
    expect(lines.some((l) => l.includes('animation:'))).toBe(false)
  })

  test('forms: form:submit with on lets the plugin work, replacing it hands the submit to you', async ({
    page,
  }) => {
    await open(page, '/form', { plugins: [['forms']] })
    await page.evaluate(`
      window.__tracked = []
      const analytics = { track: (name, data) => window.__tracked.push([name, data]) }
      pagefold.hooks.on('form:submit', (visit, { el }) => {
        analytics.track('submit', { form: el.id })
      })
    `)
    await page.locator('#get button').click()
    await expect(heading(page)).toHaveText('Results')
    expect(await win(page, '__tracked')).toEqual([['submit', { form: 'get' }]])

    // Replace it and forget preventDefault(): the browser submits the form itself
    await open(page, '/form', { plugins: [['forms']] })
    await page.evaluate(`
      window.__marker = 'same document'
      pagefold.hooks.replace('form:submit', () => {})
    `)
    await page.locator('#get button').click()
    await expect(page).toHaveURL(/\/search\?q=cats$/)
    await page.waitForFunction(() => window.__marker === undefined)
  })

  test('preload: the page:preload hook gets the page', async ({ page }) => {
    await open(page, '/', {
      plugins: [['preload', { preloadHoveredLinks: false, preloadInitialPage: false }]],
    })
    await page.evaluate(`
      window.__pre = []
      pagefold.hooks.on('page:preload', (visit, { page }) => window.__pre.push(page.url))
      pagefold.findPlugin('PagefoldPreload').preload('/about')
    `)
    await expect.poll(() => win(page, '__pre')).toEqual(['/about'])
  })

  test('analytics: a function provider and sending by hand', async ({ page }) => {
    await open(page, '/')
    await page.evaluate(`(async () => {
      const { default: PagefoldAnalytics } = await import('/dist/analytics.js')
      window.__sent = []
      const plausible = (name, data) => window.__sent.push([name, data])
      const analytics = new PagefoldAnalytics({
        provider: ({ url, title }) => plausible('pageview', { u: location.href, props: { title }, url }),
      })
      pagefold.use(analytics)
      window.__analytics = analytics
    })()`)
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    expect(await win(page, '__sent')).toEqual([
      ['pageview', { u: 'http://localhost:4173/about', props: { title: 'About' }, url: '/about' }],
    ])
    await page.evaluate(
      `window.__analytics.send({ url: '/virtual', title: 'Virtual page', location: location.href, referrer: document.referrer })`
    )
    expect((await win<unknown[]>(page, '__sent')).length).toBe(2)
  })

  test('analytics: the referrer is the full address of the page that was left', async ({
    page,
  }) => {
    await open(page, '/long')
    await page.evaluate(`(async () => {
      const { default: PagefoldAnalytics } = await import('/dist/analytics.js')
      window.__ref = []
      pagefold.use(new PagefoldAnalytics({ provider: ({ referrer }) => window.__ref.push(referrer) }))
    })()`)
    await page.evaluate(`pagefold.navigate('/about')`)
    await expect(heading(page)).toHaveText('About')
    expect(await win(page, '__ref')).toEqual(['http://localhost:4173/long'])
  })
})

test.describe('options and navigate()', () => {
  test('resolveUrl makes two addresses one page', async ({ page }) => {
    const urls: string[] = []
    page.on('request', (r) => r.resourceType() === 'fetch' && urls.push(new URL(r.url()).pathname))
    await open(page, '/')
    await page.evaluate(`(async () => {
      await pagefold.destroy()
      const { default: Pagefold } = await import('/dist/index.js')
      window.pagefold = new Pagefold({ resolveUrl: (url) => url.replace(/^\\/en/, '') || '/' })
    })()`)
    await page.evaluate(`pagefold.navigate('/about')`)
    await expect(heading(page)).toHaveText('About')
    await page.evaluate(`pagefold.navigate('/en/about')`)
    await expect(heading(page)).toHaveText('About')
    expect(urls.filter((u) => u === '/about')).toHaveLength(1)
  })

  test('requestHeaders replaces the headers Pagefold sends', async ({ page }) => {
    await open(page, '/', { options: { requestHeaders: { 'X-Requested-With': 'my-app' } } })
    await page.evaluate(`pagefold.navigate('/headers')`)
    await expect(page.locator('#xrw')).toHaveText('my-app')
  })

  test('linkSelector: only the links you choose are handled', async ({ page }) => {
    await open(page, '/', { options: { linkSelector: '#pagefold a[href]' }, record: true })
    await page.evaluate(() => {
      window.__marker = 'same document'
    })
    await link(page, '/about').click() // the menu is outside the container: left to the browser
    await expect(page).toHaveURL(/\/about$/)
    await page.waitForFunction(() => window.__marker === undefined)
  })

  test('cache: false fetches again on every visit', async ({ page }) => {
    const urls: string[] = []
    page.on('request', (r) => r.resourceType() === 'fetch' && urls.push(new URL(r.url()).pathname))
    await open(page, '/', { options: { cache: false } })
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    await link(page, '/').click()
    await expect(heading(page)).toHaveText('Home')
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    expect(urls.filter((u) => u === '/about')).toHaveLength(2)
  })

  test('navigate options: animate false', async ({ page }) => {
    await open(page, '/', { record: true })
    await page.evaluate(`pagefold.navigate('/about', { animate: false })`)
    await expect(heading(page)).toHaveText('About')
    expect(await page.evaluate(() => window.__events)).not.toContain('animation:out:start')
  })

  test('navigate options: cache { read: false } refetches but stores, cache: false does neither', async ({
    page,
  }) => {
    const urls: string[] = []
    page.on('request', (r) => r.resourceType() === 'fetch' && urls.push(new URL(r.url()).pathname))
    await open(page, '/')
    await page.evaluate(`pagefold.navigate('/about')`)
    await page.evaluate(`pagefold.navigate('/about', { cache: { read: false } })`)
    expect(urls.filter((u) => u === '/about')).toHaveLength(2)
    expect(await page.evaluate(() => window.pagefold.cache.has('/about'))).toBe(true)
    await page.evaluate(`pagefold.navigate('/plain-b', { cache: false })`)
    expect(await page.evaluate(() => window.pagefold.cache.has('/plain-b'))).toBe(false)
  })

  test('navigate options: meta and headers', async ({ page }) => {
    await open(page, '/')
    await page.evaluate(`
      window.__meta = []
      pagefold.hooks.on('visit:start', (visit) => window.__meta.push(visit.meta))
      pagefold.navigate('/headers', { meta: { from: 'menu' }, headers: { Authorization: 'Bearer x' } })
    `)
    await expect(page.locator('#auth')).toHaveText('Bearer x')
    expect(await win(page, '__meta')).toEqual([{ from: 'menu' }])
  })

  test('navigate: a signal cancels the request and the page stays', async ({ page }) => {
    const finished: string[] = []
    page.on('requestfailed', (r) => r.url().includes('/slow') && finished.push('cancelled'))
    await open(page, '/')
    await page.evaluate(`
      window.__marker = 'same document'
      const controller = new AbortController()
      window.__result = pagefold.navigate('/slow?ms=1500', { signal: controller.signal }).then(() => 'resolved', () => 'rejected')
      setTimeout(() => controller.abort(), 100)
    `)
    expect(
      await page.evaluate(() => (window as never as { __result: Promise<string> }).__result)
    ).toBe('resolved')
    expect(await win(page, '__marker')).toBe('same document')
    await expect(heading(page)).toHaveText('Home')
    expect(finished).toEqual(['cancelled'])
  })

  test('several containers are replaced together', async ({ page }) => {
    await open(page, '/list', { options: { containers: ['#list', '#detail'] } })
    await page.evaluate(`pagefold.navigate('/detail/1')`)
    await expect(page.locator('#detail')).toHaveText('detail one')
    await expect(page.locator('#list')).toContainText('back')
  })
})

test.describe('components: pagefold.mount', () => {
  // The snippet of the guide, with counters so the test can see what ran
  const mountSliders = (page: Page) =>
    page.evaluate(() => {
      const w = window as never as { __up: number; __down: number }
      w.__up = 0
      w.__down = 0
      ;(
        window as never as {
          pagefold: { mount: (s: string, f: (el: Element) => () => void) => void }
        }
      ).pagefold.mount('[data-slider]', () => {
        w.__up++
        return () => w.__down++
      })
    })
  const counts = (page: Page) =>
    page.evaluate(() => [
      (window as never as { __up: number }).__up,
      (window as never as { __down: number }).__down,
    ])

  test('sets up now and after each visit, cleans up what leaves, back included', async ({
    page,
  }) => {
    await open(page, '/widgets-a')
    await mountSliders(page)
    expect(await counts(page)).toEqual([1, 0])
    await page.evaluate(
      () =>
        void (window as never as { pagefold: { navigate: (u: string) => void } }).pagefold.navigate(
          '/widgets-b'
        )
    )
    await expect(heading(page)).toHaveText('Widgets B')
    await done(page)
    expect(await counts(page)).toEqual([3, 1])
    await page.goBack()
    await expect(heading(page)).toHaveText('Widgets A')
    await done(page)
    expect(await counts(page)).toEqual([4, 3])
  })

  test('with Overlap the old page is cleaned up when it is removed', async ({ page }) => {
    await open(page, '/widgets-a', { plugins: [['overlap']] })
    await mountSliders(page)
    await page.evaluate(
      () =>
        void (window as never as { pagefold: { navigate: (u: string) => void } }).pagefold.navigate(
          '/widgets-b'
        )
    )
    await done(page)
    await expect(page.locator('#pagefold')).toHaveCount(1)
    await expect(heading(page)).toHaveText('Widgets B')
    expect(await counts(page)).toEqual([3, 1])
  })

  test('the function it returns stops it and cleans up; destroy cleans up the rest', async ({
    page,
  }) => {
    await open(page, '/widgets-a')
    await page.evaluate(() => {
      const w = window as never as {
        __down: number
        __stop: () => void
        pagefold: { mount: (s: string, f: () => () => void) => () => void }
      }
      w.__down = 0
      w.__stop = w.pagefold.mount('[data-slider]', () => () => w.__down++)
      w.__stop()
    })
    expect(await page.evaluate(() => (window as never as { __down: number }).__down)).toBe(1)
    await page.evaluate(async () => {
      const w = window as never as {
        pagefold: { mount: (s: string, f: () => () => void) => void; destroy: () => Promise<void> }
      }
      w.pagefold.mount(
        '[data-slider]',
        () => () => ((window as never as { __down: number }).__down += 10)
      )
      await w.pagefold.destroy()
    })
    expect(await page.evaluate(() => (window as never as { __down: number }).__down)).toBe(11)
  })
})

test.describe('view transitions: visit.transition and types', () => {
  type W = {
    pagefold: {
      navigate: (u: string) => void
      hooks: {
        on: (
          n: string,
          f: (v: { transition?: ViewTransition; animation: { types: string[] } }) => void
        ) => void
      }
    }
    __seen: { transition: boolean; types: string[] }[]
  }
  const watch = async (page: Page, addType?: string) => {
    await page.evaluate((type) => {
      const w = window as never as W
      w.__seen = []
      w.pagefold.hooks.on('visit:start', (v) => {
        if (type) v.animation.types.push(type)
      })
      w.pagefold.hooks.on('content:replace', (v) => {
        w.__seen.push({
          transition: v.transition instanceof ViewTransition,
          types: v.transition ? [...(v.transition.types ?? [])] : [],
        })
      })
    }, addType)
  }
  const supported = (page: Page) => page.evaluate(() => 'startViewTransition' in document)
  const typed = (page: Page) =>
    page.evaluate(() => 'ViewTransition' in window && 'types' in ViewTransition.prototype)
  const seen = (page: Page) => page.evaluate(() => (window as never as W).__seen)

  test('the hooks can reach the browser transition', async ({ page }) => {
    await open(page, '/', { options: { native: true } })
    test.skip(!(await supported(page)), 'this browser has no View Transitions')
    await watch(page)
    await page.evaluate(() => (window as never as W).pagefold.navigate('/about'))
    await expect(heading(page)).toHaveText('About')
    expect(await seen(page)).toEqual([{ transition: true, types: expect.any(Array) }])
  })

  test('types added to the visit reach the transition, and history visits get their direction', async ({
    page,
  }) => {
    await open(page, '/', { options: { native: true, animateHistoryBrowsing: true } })
    test.skip(
      !(await supported(page)) || !(await typed(page)),
      'this browser has no transition types'
    )
    await watch(page, 'fancy')
    await page.evaluate(() => (window as never as W).pagefold.navigate('/about'))
    await expect(heading(page)).toHaveText('About')
    await done(page)
    await page.goBack()
    await expect(heading(page)).toHaveText('Home')
    const [first, second] = await seen(page)
    expect(first.types).toEqual(['fancy'])
    expect(second.types).toEqual(['fancy', 'backwards'])
  })

  test('without native there is no transition object', async ({ page }) => {
    await open(page, '/')
    await watch(page)
    await page.evaluate(() => (window as never as W).pagefold.navigate('/about'))
    await expect(heading(page)).toHaveText('About')
    expect(await seen(page)).toEqual([{ transition: false, types: [] }])
  })
})

test.describe('view transitions: animating the snapshots', () => {
  test('the snippet of the guide animates the new snapshot and does not block the visit', async ({
    page,
  }) => {
    await open(page, '/', { options: { native: true } })
    test.skip(
      !(await page.evaluate(() => 'startViewTransition' in document)),
      'this browser has no View Transitions'
    )
    await page.evaluate(() => {
      const w = window as never as {
        __pseudo: string[]
        pagefold: {
          hooks: { on: (n: string, f: (v: { transition?: ViewTransition }) => void) => void }
        }
      }
      w.__pseudo = []
      w.pagefold.hooks.on('page:view', (visit) => {
        void visit.transition?.ready.then(() => {
          const a = document.documentElement.animate(
            { clipPath: ['circle(0 at 50% 50%)', 'circle(150% at 50% 50%)'] },
            { duration: 600, pseudoElement: '::view-transition-new(root)' }
          )
          w.__pseudo.push((a.effect as KeyframeEffect).pseudoElement ?? '')
        })
      })
    })
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    await done(page)
    expect(await page.evaluate(() => (window as never as { __pseudo: string[] }).__pseudo)).toEqual(
      ['::view-transition-new(root)']
    )
  })
})

test.describe('preload: speculation rules', () => {
  test('the browser prefetch is reused by fetch() only when the server allows caching', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'only Chromium has speculation rules')
    await open(page, '/')
    test.skip(
      !(await page.evaluate(() => HTMLScriptElement.supports('speculationrules'))),
      'this browser has no speculation rules'
    )
    const id = Math.random().toString(36).slice(2)
    const cached = `/spec-cached?id=${id}`
    const plain = `/spec-plain?id=${id}`
    const hits = (url: string) =>
      page.evaluate(
        async (u) => Number(await (await fetch(`/spec-hits?of=${encodeURIComponent(u)}`)).text()),
        url
      )
    await page.evaluate(
      ([a, b]) => {
        const s = document.createElement('script')
        s.type = 'speculationrules'
        s.textContent = JSON.stringify({ prefetch: [{ urls: [a, b] }] })
        document.head.append(s)
      },
      [cached, plain]
    )
    await expect.poll(async () => (await hits(cached)) + (await hits(plain))).toBe(2)
    await page.evaluate(([a, b]) => Promise.all([fetch(a), fetch(b)]), [cached, plain])
    expect(await hits(cached)).toBe(1) // answered from the browser's cache
    expect(await hits(plain)).toBe(2) // asked again
  })
})

test.describe('components: Gia', () => {
  test('the snippet of the guide sets components up and destroys them with the page', async ({
    page,
  }) => {
    await open(page, '/gia-a')
    await page.evaluate(() => {
      const w = window as never as Record<string, unknown> & {
        gia: Record<string, never>
        pagefold: never
      }
      const { Component, loadComponents, removeComponents } = w.gia as never as {
        Component: new (el: Element) => { mount?: () => void; unmount?: () => void }
        loadComponents: (c: object) => void
        removeComponents: (ctx: Element) => void
      }
      w.__up = 0
      w.__down = 0
      const counters = window as never as { __up: number; __down: number }
      // What the guide shows
      class Counter extends (Component as never as new (el: Element) => object) {
        mount() {
          counters.__up++
        }
        unmount() {
          counters.__down++
        }
      }
      const components = { Counter }
      loadComponents(components)
      const pagefold = w.pagefold as {
        options: { containers: string[] }
        hooks: {
          before: (n: string, f: () => void) => void
          on: (n: string, f: () => void) => void
        }
      }
      pagefold.hooks.before('content:replace', () => {
        pagefold.options.containers.forEach((selector) => {
          const el = document.querySelector(selector)
          if (el) removeComponents(el)
        })
      })
      pagefold.hooks.on('content:replace', () => loadComponents(components))
    })
    const counts = () =>
      page.evaluate(() => [
        (window as never as { __up: number }).__up,
        (window as never as { __down: number }).__down,
      ])
    expect(await counts()).toEqual([2, 0]) // one outside the container, one inside
    await page.evaluate(
      () =>
        void (window as never as { pagefold: { navigate: (u: string) => void } }).pagefold.navigate(
          '/gia-b'
        )
    )
    await expect(heading(page)).toHaveText('Gia B')
    await done(page)
    expect(await counts()).toEqual([4, 1]) // the one outside kept running; the old one was destroyed; two arrived
    await page.goBack()
    await expect(heading(page)).toHaveText('Gia A')
    await done(page)
    expect(await counts()).toEqual([5, 3])
  })
})
