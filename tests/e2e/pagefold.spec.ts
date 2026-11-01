import { expect, test, type Page } from '@playwright/test'
import { heading, link, open, opacity } from './helpers'

test.describe('navigation', () => {
  test('changes the page without loading a new document', async ({ page }) => {
    await open(page, '/')
    await page.evaluate(() => {
      window.__marker = 'same document'
    })
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    await expect(page).toHaveURL(/\/about$/)
    await expect(page).toHaveTitle('About')
    expect(await page.evaluate(() => window.__marker)).toBe('same document')
  })

  test('back and forward buttons work', async ({ page }) => {
    await open(page, '/')
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    await page.goBack()
    await expect(heading(page)).toHaveText('Home')
    await expect(page).toHaveURL(/\/$/)
    await page.goForward()
    await expect(heading(page)).toHaveText('About')
  })

  test('a page visited twice is requested once', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (r) => {
      if (r.resourceType() === 'fetch') requests.push(new URL(r.url()).pathname)
    })
    await open(page, '/')
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    await link(page, '/').click()
    await expect(heading(page)).toHaveText('Home')
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    expect(requests.filter((p) => p === '/about')).toHaveLength(1)
  })

  test('links that opt out are a normal page load', async ({ page }) => {
    await open(page, '/')
    await page.evaluate(() => {
      window.__marker = 'same document'
      document.querySelector('nav a[href="/about"]')!.setAttribute('data-no-pagefold', '')
    })
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    expect(await page.evaluate(() => window.__marker)).toBeUndefined()
  })

  test('visit.ignore() in link:click hands the visit to the browser', async ({ page }) => {
    await open(page, '/')
    await page.evaluate(() => {
      window.__marker = 'same document'
      window.pagefold.hooks.before('link:click', (visit) => {
        visit.ignore()
      })
    })
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    await expect(page).toHaveURL(/\/about$/)
    expect(await page.evaluate(() => window.__marker)).toBeUndefined() // a full page load
  })

  test('a server error falls back to a normal page load', async ({ page }) => {
    await open(page, '/')
    await link(page, '/boom').click()
    await expect(page).toHaveURL(/\/boom$/)
    await expect(page.locator('body')).toHaveText('server error')
  })

  test('failOnStatus can treat client errors as failures too', async ({ page }) => {
    await open(page, '/', { failOnClientErrors: true })
    await page.evaluate(() => {
      document.querySelector('nav')!.insertAdjacentHTML('beforeend', '<a href="/missing">missing</a>')
    })
    await page.locator('nav a[href="/missing"]').click()
    await expect(page).toHaveURL(/\/missing$/)
    await expect(page.locator('h1')).toHaveText('Not found')
  })

  test('a visit that starts while another loads cancels its request', async ({ page }) => {
    const failed: string[] = []
    page.on('requestfailed', (r) => failed.push(r.url()))
    await open(page, '/')
    await link(page, '/slow?ms=1500').click()
    await page.waitForTimeout(200)
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    await expect.poll(() => failed.some((u) => u.includes('/slow'))).toBe(true)
    await page.waitForTimeout(1600) // the slow page must not show up late
    await expect(heading(page)).toHaveText('About')
  })
})

test.describe('animation', () => {
  test('waits for the CSS transition before replacing the content', async ({ page }) => {
    await open(page, '/')
    const start = Date.now()
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    expect(Date.now() - start).toBeGreaterThanOrEqual(250) // the 300 ms fade
  })

  test('state classes are on the html element during the visit and gone after', async ({ page }) => {
    await open(page, '/')
    await link(page, '/about').click()
    await page.waitForFunction(() => document.documentElement.classList.contains('is-animating'))
    await expect(heading(page)).toHaveText('About')
    await expect(page.locator('html')).not.toHaveClass(/is-/)
  })

  test('hooks run in order', async ({ page }) => {
    await open(page, '/', { record: true })
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    await page.waitForFunction(() => window.__events.includes('visit:end'))
    const events = await page.evaluate(() => window.__events)
    const order = ['link:click', 'visit:start', 'page:load', 'animation:out:start', 'content:replace', 'page:view', 'animation:in:start', 'visit:end']
    expect(order.map((e) => events.indexOf(e))).toEqual([...order.map((e) => events.indexOf(e))].sort((a, b) => a - b))
    expect(order.every((e) => events.includes(e))).toBe(true)
  })

  test('reduced motion skips the animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page, '/', { plugins: [['a11y']], record: true })
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    const events = await page.evaluate(() => window.__events)
    expect(events).toContain('animation:skip')
    expect(events).not.toContain('animation:out:start')
  })

  test('the View Transitions API is used when asked for', async ({ page }) => {
    await page.addInitScript(() => {
      const original = document.startViewTransition?.bind(document)
      window.__vt = 0
      if (original) {
        document.startViewTransition = ((...args: Parameters<typeof original>) => {
          window.__vt = (window.__vt ?? 0) + 1
          return original(...args)
        }) as typeof document.startViewTransition
      }
    })
    await open(page, '/', { options: { native: true } })
    await expect(page.locator('html')).toHaveClass(/pagefold-native/)
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    expect(await page.evaluate(() => window.__vt)).toBe(1)
  })
})

test.describe('script tag (UMD) build', () => {
  test('works from plain script tags with global classes', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/umd-a')
    await page.waitForFunction(() => window.__ready === true)
    expect(await page.evaluate(() => [typeof (window as never as Record<string, unknown>).Pagefold, typeof (window as never as Record<string, unknown>).PagefoldHead])).toEqual(['function', 'function'])
    await page.evaluate(() => {
      window.__marker = 'same document'
    })
    await page.locator('nav a[href="/umd-b"]').click()
    await expect(heading(page)).toHaveText('UMD B')
    await expect(page).toHaveTitle('UMD B') // updated by the head plugin
    await expect(page.locator('.pagefold-announcer')).toHaveText('Navigated to: UMD B')
    expect(await page.evaluate(() => window.__marker)).toBe('same document')
    expect(errors).toEqual([])
  })
})

test.describe('Alpine.js', () => {
  test('components in a new page start working, and the old ones are gone', async ({ page }) => {
    await open(page, '/alpine-a', { alpine: true })
    const counter = page.locator('#n')
    await page.locator('#inc').click()
    await page.locator('#inc').click()
    await expect(counter).toHaveText('2')

    await page.evaluate(() => void window.pagefold.navigate('/alpine-b'))
    await expect(heading(page)).toHaveText('Alpine B')
    await expect(counter).toHaveText('10') // initialized by Alpine, nothing for us to do
    await page.locator('#inc').click()
    await expect(counter).toHaveText('11')

    await page.goBack()
    await expect(heading(page)).toHaveText('Alpine A')
    await expect(counter).toHaveText('0') // a fresh component from the cached page
    await page.locator('#inc').click()
    await expect(counter).toHaveText('1')
  })
})

test.describe('themes', () => {
  const offset = (page: Page) =>
    page.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector('#pagefold')!).transform).m41)

  test('the slide theme moves the page, and goes the other way on back', async ({ page }) => {
    await open(page, '/slide-a', { options: { animateHistoryBrowsing: true } })
    await page.evaluate(() => void window.pagefold.navigate('/slide-b'))
    await page.waitForFunction(() => new DOMMatrix(getComputedStyle(document.querySelector('#pagefold')!).transform).m41 < -1) // leaves to the left
    await expect(heading(page)).toHaveText('Slide B')
    await expect.poll(() => offset(page)).toBe(0)

    await page.goBack()
    await page.waitForFunction(() => new DOMMatrix(getComputedStyle(document.querySelector('#pagefold')!).transform).m41 > 1) // leaves to the right
    await expect(heading(page)).toHaveText('Slide A')
    await expect.poll(() => offset(page)).toBe(0)
  })
})

test.describe('animating in JavaScript', () => {
  for (const engine of ['waapi', 'gsap', 'motion']) {
    test(`works with ${engine}`, async ({ page }) => {
      await open(page, '/plain', { plugins: [['js', { engine }]], options: { animationSelector: false } })
      await link(page, '/plain-b').click()
      // caught mid-fade: the engine really is driving the opacity
      await page.waitForFunction(() => {
        const o = Number(getComputedStyle(document.querySelector('#pagefold')!).opacity)
        return o > 0.05 && o < 0.95
      })
      await expect(heading(page)).toHaveText('Plain B')
      await expect.poll(() => opacity(page)).toBe(1)
    })
  }
})

test.describe('plugins', () => {
  test('overlap keeps both pages in the DOM while they animate', async ({ page }) => {
    await open(page, '/', { plugins: [['overlap']] })
    await link(page, '/about').click()
    await page.waitForFunction(() => document.querySelectorAll('#pagefold').length === 2)
    await expect(page.locator('#pagefold')).toHaveCount(1)
    await expect(heading(page)).toHaveText('About')
  })

  test('preload fetches on hover and the click reuses it', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (r) => {
      if (r.resourceType() === 'fetch') requests.push(new URL(r.url()).pathname)
    })
    await open(page, '/', { plugins: [['preload', { hoverDelay: 0, preloadInitialPage: false }]] })
    await link(page, '/about').hover()
    await expect.poll(() => requests.includes('/about')).toBe(true)
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    expect(requests.filter((p) => p === '/about')).toHaveLength(1)
  })

  test('preload can fetch links that scroll into view', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (r) => {
      if (r.resourceType() === 'fetch') requests.push(new URL(r.url()).pathname)
    })
    await open(page, '/', {
      plugins: [['preload', { preloadHoveredLinks: false, preloadInitialPage: false, preloadVisibleLinks: { delay: 100 } }]],
    })
    await expect.poll(() => requests.includes('/about')).toBe(true)
  })

  test('head updates meta tags and waits for new stylesheets', async ({ page }) => {
    await open(page, '/head-a', { plugins: [['head', { awaitAssets: true }]] })
    await page.evaluate(() => window.pagefold.navigate('/head-b'))
    await page.waitForFunction(() => document.querySelector('#pagefold h1')?.textContent === 'Head B')
    // already styled by the time the page is shown: it waited for the 500 ms stylesheet
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('#pagefold')!).borderLeftColor)).toBe('rgb(0, 0, 255)')
    await expect(page.locator('meta[name=description]')).toHaveAttribute('content', 'about b')
    await expect(page).toHaveTitle('Head B')
    await expect(page.locator('link[href="/css/a.css"]')).toHaveCount(0)
  })

  test('scripts in the new page run once per visit', async ({ page }) => {
    await open(page, '/', { plugins: [['scripts']] })
    await page.evaluate(() => window.pagefold.navigate('/scripts'))
    await expect(heading(page)).toHaveText('Scripts')
    expect(await page.evaluate(() => window.__ran)).toBe(1)
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    await page.evaluate(() => window.pagefold.navigate('/scripts'))
    await expect(heading(page)).toHaveText('Scripts')
    expect(await page.evaluate(() => window.__ran)).toBe(2)
  })

  test('a11y announces the page and moves focus', async ({ page }) => {
    await open(page, '/', { plugins: [['a11y']] })
    await link(page, '/about').click()
    await expect(page.locator('.pagefold-announcer')).toHaveText('Navigated to: About')
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('pagefold')
  })

  test('body-class takes the class of the new page', async ({ page }) => {
    await open(page, '/', { plugins: [['body-class']] })
    await link(page, '/about').click()
    await expect(page.locator('body')).toHaveClass('about-page')
  })

  test('progress shows a bar during a slow visit and removes it after', async ({ page }) => {
    await open(page, '/', { plugins: [['progress', { delay: 100, transition: 100 }]] })
    await link(page, '/slow?ms=1500').click()
    await expect(page.locator('.pagefold-progress-bar')).toBeAttached()
    await expect(heading(page)).toHaveText('Slow')
    await expect(page.locator('.pagefold-progress-bar')).toHaveCount(0)
  })

  test('forms: a GET form becomes a visit', async ({ page }) => {
    await open(page, '/form', { plugins: [['forms']] })
    await page.locator('#get button').click()
    await expect(heading(page)).toHaveText('Results')
    await expect(page.locator('#q')).toHaveText('cats')
    await expect(page).toHaveURL(/\/search\?q=cats$/)
  })

  test('forms: a POST form sends its fields', async ({ page }) => {
    await open(page, '/form', { plugins: [['forms']] })
    await page.locator('#post button').click()
    await expect(page.locator('#method')).toHaveText('POST')
    await expect(page.locator('#body')).toHaveText('note=hello')
  })

  test('fragment replaces only the detail panel', async ({ page }) => {
    const rules = [
      { from: '/list', to: '/detail/:id', containers: ['#detail'], name: 'detail' },
      { from: '/detail/:id', to: '/list', containers: ['#detail'] },
    ]
    await open(page, '/list', { options: { containers: ['#list', '#detail'] }, plugins: [['fragment', { rules }]] })
    await page.evaluate(() => document.querySelector('#list')!.setAttribute('data-keep', 'yes'))
    await page.locator('#list a[href="/detail/1"]').click()
    await expect(page.locator('#detail')).toHaveText('detail one')
    // the list node was not replaced: it still has its marker and its original links
    await expect(page.locator('#list')).toHaveAttribute('data-keep', 'yes')
    await expect(page.locator('#list a[href="/detail/2"]')).toHaveCount(1)
    await expect(page).toHaveURL(/\/detail\/1$/)
  })
})

test.describe('scrolling', () => {
  const scrollY = (page: Page) => page.evaluate(() => window.scrollY)

  test('a new page starts at the top', async ({ page }) => {
    await open(page, '/long')
    await page.evaluate(() => window.scrollTo(0, 2000))
    await page.evaluate(() => document.querySelector<HTMLElement>('nav a[href="/long"]')!.click())
    await expect.poll(() => scrollY(page)).toBe(0)
  })

  test('the scroll plugin animates there', async ({ page }) => {
    await open(page, '/long', { plugins: [['scroll', { duration: 800 }]] })
    await page.evaluate(() => window.scrollTo(0, 2000))
    await page.evaluate(() => document.querySelector<HTMLElement>('nav a[href="/long"]')!.click())
    await page.waitForFunction(() => window.scrollY > 100 && window.scrollY < 1900) // in between
    await expect.poll(() => scrollY(page)).toBe(0)
  })

  test('a link to an anchor on another page lands on it', async ({ page }) => {
    await open(page, '/', { plugins: [['scroll', { duration: 300 }]] })
    await page.locator('#to-long-hash').click()
    await expect(page).toHaveURL(/\/long#bottom$/)
    await page.waitForFunction(() => {
      const target = document.querySelector('#bottom')
      return !!target && Math.abs(target.getBoundingClientRect().top) < 5
    })
  })
})

// The examples in the documentation, run as written. If one of these breaks, the page that shows it is wrong.
test.describe('documentation: recipes', () => {
  test('highlight the current page in the menu', async ({ page }) => {
    await open(page, '/')
    // Starting with "void 0" keeps Playwright from reading the snippet as a single function
    await page.evaluate(`void 0
      function markCurrent() {
        document.querySelectorAll('nav a').forEach((a) => {
          if (a.pathname === location.pathname) a.setAttribute('aria-current', 'page')
          else a.removeAttribute('aria-current')
        })
      }
      markCurrent()
      pagefold.hooks.on('page:view', markCurrent)
    `)
    await expect(link(page, '/')).toHaveAttribute('aria-current', 'page')
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    await expect(link(page, '/about')).toHaveAttribute('aria-current', 'page')
    await expect(link(page, '/')).not.toHaveAttribute('aria-current')
    await page.goBack()
    await expect(heading(page)).toHaveText('Home')
    await expect(link(page, '/')).toHaveAttribute('aria-current', 'page')
    await expect(link(page, '/about')).not.toHaveAttribute('aria-current')
  })

  test('a player outside the container keeps playing', async ({ page }) => {
    await open(page, '/outside-a')
    await page.evaluate(() => {
      const player = document.querySelector('#player') as HTMLElement & { same?: boolean }
      player.same = true
      document.querySelector('nav')!.insertAdjacentHTML('beforeend', '<a href="/outside-b" data-nav>b</a>')
    })
    await link(page, '/outside-b').click()
    await expect(heading(page)).toHaveText('Outside B')
    expect(await page.evaluate(() => (document.querySelector('#player') as HTMLElement & { same?: boolean }).same)).toBe(true)
  })

  test('data-pagefold-persist keeps the same element inside the container', async ({ page }) => {
    await open(page, '/persist-a')
    await page.evaluate(() => {
      const player = document.querySelector('#player') as HTMLElement & { same?: boolean }
      player.same = true
      document.querySelector('nav')!.insertAdjacentHTML('beforeend', '<a href="/persist-b" data-nav>b</a>')
    })
    await link(page, '/persist-b').click()
    await expect(heading(page)).toHaveText('Persist B')
    expect(await page.evaluate(() => (document.querySelector('#player') as HTMLElement & { same?: boolean }).same)).toBe(true)
    await expect(page.locator('#player')).toHaveCount(1)
  })

  test('close a mobile menu when a visit starts', async ({ page }) => {
    await open(page, '/')
    await page.evaluate(`
      document.body.classList.add('menu-open')
      pagefold.hooks.on('visit:start', () => {
        document.body.classList.remove('menu-open')
      })
    `)
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    expect(await page.evaluate(() => document.body.classList.contains('menu-open'))).toBe(false)
  })

  test('turn the animation off for some pages, and leave others to the browser', async ({ page }) => {
    await open(page, '/', { record: true })
    await page.evaluate(`
      pagefold.hooks.on('visit:start', (visit) => {
        if (visit.to.url.startsWith('/admin')) visit.animation.animate = false
      })
    `)
    await page.evaluate(() => {
      document.querySelector('nav')!.insertAdjacentHTML('beforeend', '<a href="/admin" data-nav>admin</a>')
    })
    await link(page, '/admin').click()
    await expect(heading(page)).toHaveText('Admin')
    const events = await page.evaluate(() => window.__events)
    expect(events).toContain('animation:skip')
    expect(events).not.toContain('animation:out:start')
  })

  test('ignoreVisit leaves a page to the browser', async ({ page }) => {
    await open(page, '/', { options: {} })
    await page.evaluate(`
      window.__marker = 'same document'
      pagefold.options.ignoreVisit = (url) => url.startsWith('/admin')
    `)
    await page.evaluate(() => {
      document.querySelector('nav')!.insertAdjacentHTML('beforeend', '<a href="/admin" data-nav>admin</a>')
    })
    await link(page, '/admin').click()
    await expect(page).toHaveURL(/\/admin$/)
    await expect(heading(page)).toHaveText('Admin')
    expect(await page.evaluate(() => window.__marker)).toBeUndefined()
  })

  test('a loading indicator can follow html.is-changing', async ({ page }) => {
    await open(page, '/')
    await page.addStyleTag({ content: `.spinner { display: none; } html.is-changing .spinner { display: block; }` })
    await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<div class="spinner">loading</div>'))
    await expect(page.locator('.spinner')).toHaveCSS('display', 'none')
    await link(page, '/slow?ms=1500').click()
    await expect(page.locator('.spinner')).toHaveCSS('display', 'block')
    await expect(heading(page)).toHaveText('Slow')
    await expect(page.locator('.spinner')).toHaveCSS('display', 'none')
  })

  test('navigate from code, replacing the history entry', async ({ page }) => {
    await open(page, '/')
    const before = await page.evaluate(() => history.length)
    await page.evaluate(`pagefold.navigate('/about', { history: 'replace' })`)
    await expect(heading(page)).toHaveText('About')
    await expect(page).toHaveURL(/\/about$/)
    expect(await page.evaluate(() => history.length)).toBe(before)
  })

  test('page:view runs once per visit with the url and title', async ({ page }) => {
    await open(page, '/')
    await page.evaluate(`
      window.__seen = []
      pagefold.hooks.on('page:view', (visit, { url, title }) => {
        window.__seen.push([url, title])
      })
    `)
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    expect(await page.evaluate(() => (window as unknown as { __seen: unknown[] }).__seen)).toEqual([['/about', 'About']])
  })

  test('replacing visit:fail shows a message and does not fall back to a normal load', async ({ page }) => {
    await open(page, '/')
    await page.evaluate(`
      window.__marker = 'same document'
      window.showToast = (message) => { window.__toast = message }
      pagefold.hooks.replace('visit:fail', (visit, { error }) => {
        showToast('Could not load the page. Try again.')
      })
    `)
    await link(page, '/boom').click()
    await expect.poll(() => page.evaluate(() => (window as unknown as { __toast?: string }).__toast)).toBe('Could not load the page. Try again.')
    expect(await page.evaluate(() => window.__marker)).toBe('same document')
    await expect(heading(page)).toHaveText('Home')
  })
})

test.describe('documentation: your server', () => {
  test('a redirect is followed and the redirected address is not cached', async ({ page }) => {
    await open(page, '/')
    await page.evaluate(`pagefold.navigate('/redirect')`)
    await expect(heading(page)).toHaveText('About')
    expect(await page.evaluate(() => window.pagefold.cache.has('/redirect'))).toBe(false)
  })

  test('cookies travel with the request', async ({ page, context }) => {
    await context.addCookies([{ name: 'user', value: 'ana', url: 'http://localhost:4173' }])
    await open(page, '/')
    await page.evaluate(`pagefold.navigate('/whoami')`)
    await expect(page.locator('#who')).toHaveText('ana')
  })

  test('an empty body fails and the browser loads the page normally', async ({ page }) => {
    await open(page, '/')
    await page.evaluate(() => {
      window.__marker = 'same document'
      document.querySelector('nav')!.insertAdjacentHTML('beforeend', '<a href="/empty" data-nav>empty</a>')
    })
    await link(page, '/empty').click()
    await expect(page).toHaveURL(/\/empty$/)
    await page.waitForFunction(() => window.__marker === undefined)
  })

  test('a page without the container fails and the browser loads it normally', async ({ page }) => {
    await open(page, '/')
    await page.evaluate(() => {
      window.__marker = 'same document'
      document.querySelector('nav')!.insertAdjacentHTML('beforeend', '<a href="/no-container" data-nav>x</a>')
    })
    await link(page, '/no-container').click()
    await expect(page.locator('#other')).toHaveText('this page has no container')
    await page.waitForFunction(() => window.__marker === undefined)
  })

  test('a 404 page is shown like any page, and failOnStatus changes that', async ({ page }) => {
    await open(page, '/')
    await page.evaluate(`pagefold.navigate('/nowhere')`)
    await expect(heading(page)).toHaveText('Not found')
    await expect(page).toHaveURL(/\/nowhere$/)
    await open(page, '/', { options: {}, failOnClientErrors: true })
    await page.evaluate(() => {
      window.__marker = 'same document'
    })
    await page.evaluate(`pagefold.navigate('/nowhere')`)
    await page.waitForFunction(() => window.__marker === undefined)
  })
})

test.describe('documentation: the cache', () => {
  test('cacheMax drops the least recently used page', async ({ page }) => {
    await open(page, '/', { options: { cacheMax: 3 } })
    for (const [href, title] of [['/about', 'About'], ['/long', 'Long'], ['/plain-b', 'Plain B']]) {
      await link(page, href).click()
      await expect(page).toHaveTitle(title)
    }
    await link(page, '/about').click() // used again: it becomes the most recent
    await expect(heading(page)).toHaveText('About')
    await link(page, '/').click() // a fourth page arrives
    await expect(heading(page)).toHaveText('Home')
    const has = await page.evaluate(() => ['/about', '/long', '/plain-b', '/'].map((u) => window.pagefold.cache.has(u)))
    expect(has).toEqual([true, false, true, true])
  })

  test('cacheTtl ignores an expired page, but only frees it when it is asked for', async ({ page }) => {
    await open(page, '/', { options: { cacheTtl: 150 } })
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => window.pagefold.cache.size)).toBeGreaterThan(0)
    expect(await page.evaluate(() => window.pagefold.cache.has('/about'))).toBe(false)
    expect(await page.evaluate(() => window.pagefold.cache.size)).toBe(0)
  })

  test('delete, prune and clear forget pages', async ({ page }) => {
    await open(page, '/')
    for (const [href, title] of [['/about', 'About'], ['/long', 'Long'], ['/plain-b', 'Plain B']]) {
      await link(page, href).click()
      await expect(page).toHaveTitle(title)
    }
    const has = (urls: string[]) => page.evaluate((u) => u.map((x) => window.pagefold.cache.has(x)), urls)
    expect(await has(['/about', '/long', '/plain-b'])).toEqual([true, true, true])
    await page.evaluate(`pagefold.cache.delete('/about')`)
    expect(await has(['/about', '/long', '/plain-b'])).toEqual([false, true, true])
    await page.evaluate(`pagefold.cache.prune((url) => url.startsWith('/plain'))`)
    expect(await has(['/about', '/long', '/plain-b'])).toEqual([false, true, false])
    await page.evaluate(`pagefold.cache.clear()`)
    expect(await has(['/long'])).toEqual([false])
  })

  test('has() tells whether the page needs fetching', async ({ page }) => {
    await open(page, '/')
    expect(await page.evaluate(`pagefold.cache.has('/about')`)).toBe(false)
    await link(page, '/about').click()
    await expect(heading(page)).toHaveText('About')
    expect(await page.evaluate(`pagefold.cache.has('/about')`)).toBe(true)
  })
})
