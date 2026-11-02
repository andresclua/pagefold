import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

// The example sites embedded in the documentation, run as a visitor would use them

const errors: string[] = []
test.beforeEach(({ page }) => {
  errors.length = 0
  page.on('pageerror', (e) => errors.push(e.message))
})
test.afterEach(() => expect(errors).toEqual([]))

const go = async (page: Page, name: string) => {
  await page.goto(`/examples/${name}/index.html`)
}

for (const name of ['fade', 'slide', 'overlap', 'native']) {
  test(`${name}: links change the page without a reload and back works`, async ({ page }) => {
    await go(page, name)
    const titles = () =>
      page.evaluate(() => [...document.querySelectorAll('h1')].map((h) => h.textContent))
    await page.evaluate(() => ((window as unknown as { __same: boolean }).__same = true))
    await page.click('nav a[href="about.html"]')
    await expect.poll(titles).toEqual(['About']) // with overlap, the old page is there until the end
    await expect(page).toHaveURL(new RegExp(`/examples/${name}/about.html$`))
    expect(await page.evaluate(() => (window as unknown as { __same?: boolean }).__same)).toBe(true)
    await page.goBack()
    await expect.poll(titles).toEqual(['Home'])
  })
}

test('overlap: two pages are in the document while they cross, tagged, and one is left after', async ({
  page,
}) => {
  await go(page, 'overlap')
  await expect(page.locator('#count')).toHaveText('1')
  await page.click('nav a[href="contact.html"]')
  await expect(page.locator('#count')).toHaveText('2') // the counter in the bar says so
  await expect(page.locator('main.is-previous-container')).toHaveCount(1)
  await expect(page.locator('main')).toHaveCount(2)
  await expect(h1(page)).toHaveText('Contact') // settled: only the new page
  await expect(page.locator('#count')).toHaveText('1')
  await expect(page.locator('main')).toHaveCount(1)
})

test('fragment: the list keeps its scroll, its filter and its time; only the detail changes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 700, height: 300 }) // small, so the list has to scroll
  await go(page, 'fragment')
  const stamp = (where: string) => page.locator(`${where} .stamp`).textContent()
  const listTime = await stamp('#list')
  const detailTime = await stamp('#detail')
  await page.fill('#list input', 'a')
  await page.evaluate(() => (document.querySelector('#list') as HTMLElement).scrollTo(0, 60))
  await page.waitForTimeout(1100) // the clocks show seconds
  await page.locator('#list a[href="grace.html"]').dispatchEvent('click')
  await expect(page.locator('#detail h1')).toHaveText('Grace Hopper')
  await expect(page.locator('#list input')).toHaveValue('a')
  expect(
    await page.evaluate(() => (document.querySelector('#list') as HTMLElement).scrollTop)
  ).toBeGreaterThan(30)
  expect(await stamp('#list')).toBe(listTime) // never redrawn
  expect(await stamp('#detail')).not.toBe(detailTime) // new on every visit
  await expect(page.locator('#list a.is-active')).toHaveAttribute('href', 'grace.html')
  await page.goBack()
  await expect(page.locator('#detail h1')).toHaveText('Ada Lovelace')
  await expect(page.locator('#list input')).toHaveValue('a')
  await expect(page.locator('#list a.is-active')).toHaveAttribute('href', 'index.html')
  expect(await stamp('#list')).toBe(listTime)
})

for (const name of ['fade', 'slide']) {
  test(`${name}: the new content fades in instead of appearing at once`, async ({ page }) => {
    await go(page, name)
    // After the text changes, watch the opacity for a few frames
    const seen = await page.evaluate(
      () =>
        new Promise<number[]>((resolve) => {
          const main = () => document.querySelector('#pagefold') as HTMLElement
          const values: number[] = []
          const tick = () => {
            if (document.querySelector('h1')?.textContent === 'About')
              values.push(+getComputedStyle(main()).opacity)
            if (values.length >= 12) resolve(values)
            else requestAnimationFrame(tick)
          }
          tick()
          document
            .querySelector<HTMLElement>('nav a[href="about.html"]')
            ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        })
    )
    expect(seen[0]).toBeLessThan(0.5)
    expect(seen.some((v) => v > 0.05 && v < 0.95)).toBe(true)
  })
}

// The demos of the documentation load GSAP from a CDN. Here the same files come from node_modules, so the
// tests do not need the network.
const useGsap = (page: Page) =>
  page.route('https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/*', (route) =>
    route.fulfill({
      path: join(
        import.meta.dirname,
        '../../node_modules/gsap/dist',
        new URL(route.request().url()).pathname.split('/').pop() ?? ''
      ),
    })
  )
const markDocument = (page: Page) =>
  page.evaluate(() => ((window as unknown as { __same: boolean }).__same = true))
const sameDocument = (page: Page) =>
  page.evaluate(() => (window as unknown as { __same?: boolean }).__same === true)
const h1 = (page: Page) => page.locator('h1').first()

test.describe('demos', () => {
  test('gsap: the transition leaves no inline style and a link can pick the zoom', async ({
    page,
  }) => {
    await useGsap(page)
    await go(page, 'gsap')
    await markDocument(page)
    await page.click('nav a[href="work.html"]')
    await expect(h1(page)).toHaveText('Selected work')
    await expect(page.locator('#pagefold')).not.toHaveAttribute('style', /.+/) // GSAP gave the page back
    await expect(page.locator('.card').first()).toHaveCSS('opacity', '1')
    await page.click('nav a[data-pagefold-animation="zoom"]')
    await expect(h1(page)).toHaveText('Say hello')
    await expect(page.locator('#pagefold')).not.toHaveAttribute('style', /.+/)
    expect(await sameDocument(page)).toBe(true)
  })

  test('scrolltrigger: the triggers follow the page on screen and do not add up', async ({
    page,
  }) => {
    await useGsap(page)
    await go(page, 'scrolltrigger')
    const alive = () => page.locator('#triggers')
    await expect(alive()).toHaveText('5')
    await page.click('nav a[href="two.html"]')
    await expect(h1(page)).toHaveText('No trigger is left behind')
    await expect(alive()).toHaveText('4')
    await page.click('nav a[href="three.html"]')
    await expect(h1(page)).toHaveText('Back and forward work too')
    await expect(alive()).toHaveText('6')
    await page.goBack()
    await expect(alive()).toHaveText('4')
    await page.goForward()
    await expect(alive()).toHaveText('6')
  })

  test('scrolltrigger: a block comes up when it is reached', async ({ page }) => {
    await useGsap(page)
    await page.setViewportSize({ width: 800, height: 400 })
    await go(page, 'scrolltrigger')
    const last = page.locator('[data-reveal]').last()
    await expect(last).toHaveCSS('opacity', '0')
    await last.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await expect(last).toHaveCSS('opacity', '1')
  })

  test('overlap-gsap: the pages cross, the bar follows and nothing is left behind', async ({
    page,
  }) => {
    await useGsap(page)
    await go(page, 'overlap-gsap')
    const titles = () =>
      page.evaluate(() => [...document.querySelectorAll('h1')].map((h) => h.textContent))
    const bar = () =>
      page.evaluate(() => ({
        count: document.querySelector('.roll')?.textContent,
        current: document.querySelector('#nav [aria-current]')?.textContent,
      }))
    await page.evaluate(() => {
      const w = window as unknown as { __max: number }
      w.__max = 0
      new MutationObserver(
        () => (w.__max = Math.max(w.__max, document.querySelectorAll('#pagefold').length))
      ).observe(document.body, { childList: true, subtree: true })
    })
    expect(await bar()).toEqual({ count: '01', current: 'Home' })
    await page.click('a.project[href="atlas.html"]')
    await expect.poll(titles).toEqual(['Atlas']) // the old page is gone once the timeline is over
    expect(await page.evaluate(() => (window as unknown as { __max: number }).__max)).toBe(2) // both were there
    expect(await bar()).toEqual({ count: '02', current: 'Atlas' })
    // Only what GSAP set was cleared: the page keeps its own style, and nothing is left on the words
    await expect(page.locator('#pagefold')).toHaveAttribute('style', /--a/)
    await expect(page.locator('#pagefold')).not.toHaveCSS('clip-path', /circle/)
    await expect(page.locator('.split .w > span').first()).toHaveCSS('transform', 'none')
    await page.click('a.next')
    await expect.poll(titles).toEqual(['Pulse'])
    expect(await bar()).toEqual({ count: '03', current: 'Pulse' })
    await page.goBack()
    await expect.poll(titles).toEqual(['Atlas'])
    expect(await bar()).toEqual({ count: '02', current: 'Atlas' })
  })

  test('overlap-gsap: with reduced motion the page changes at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await useGsap(page)
    await go(page, 'overlap-gsap')
    await page.click('a.project[href="loom.html"]')
    await expect(h1(page)).toHaveText('Loom')
    await expect(page.locator('#pagefold')).toHaveCount(1)
    await expect(page.locator('.roll')).toHaveText('04')
    await expect(page.locator('#nav [aria-current]')).toHaveText('Loom')
  })

  test('routes: the visit is named after the routes and two pages of one route are marked', async ({
    page,
  }) => {
    await go(page, 'routes')
    await page.click('nav a[href="work.html"]')
    await expect(h1(page)).toHaveText('Work')
    await expect(page.locator('#route-names')).toHaveText('home → work')
    await page.click('nav a[href="project.html"]')
    await expect(h1(page)).toHaveText('Atlas')
    await page.click('nav a[href="project-2.html"]')
    await expect(h1(page)).toHaveText('Pulse')
    await expect(page.locator('#route-names')).toHaveText('project → project')
    await expect(page.locator('#route-classes')).toContainText('to-same-route')
  })

  test('preload: hovering puts the page in the cache, and the log says so', async ({ page }) => {
    await go(page, 'preload')
    const lines = () => page.locator('#lines li')
    await page.hover('a.tile[href="pricing.html"]')
    await expect(lines().filter({ hasText: 'preloaded pricing.html' })).toHaveCount(1)
    await page.click('a.tile[href="pricing.html"]')
    await expect(h1(page)).toHaveText('Pricing')
    await expect(lines().filter({ hasText: /opened pricing\.html · from the cache/ })).toHaveCount(
      1
    )
    // Without a pause on the link there is nothing in the cache
    await page.locator('a.tile[href="team.html"]').dispatchEvent('click')
    await expect(h1(page)).toHaveText('Team')
    await expect(lines().filter({ hasText: /opened team\.html · from the network/ })).toHaveCount(1)
    await page.click('#clear')
    await expect(lines().first()).toHaveText('cache emptied')
  })

  test('components: each one is set up with its page and cleaned up when it leaves', async ({
    page,
  }) => {
    await go(page, 'components')
    const lines = page.locator('#lines')
    await expect(lines).toContainText('set up       counter')
    await page.click('nav a[href="clock.html"]')
    await expect(h1(page)).toHaveText('Clock')
    await expect(lines).toContainText('cleaned      counter')
    await expect(page.locator('#timers')).toHaveText('1')
    await page.click('nav a[href="tabs.html"]')
    await expect(h1(page)).toHaveText('Tabs')
    await expect(lines).toContainText('cleaned      clock')
    await expect(page.locator('#timers')).toHaveText('0')
    await expect(page.locator('#alive')).toHaveText('2') // tabs and a counter, which are the ones on the page
  })

  test('components: without the cleanup, timers and key handlers add up', async ({ page }) => {
    await go(page, 'components')
    await page.uncheck('#cleanup')
    for (const href of ['clock.html', 'tabs.html', 'clock.html', 'tabs.html']) {
      await page.click(`nav a[href="${href}"]`)
      await expect(page.locator('#pagefold h1')).toHaveText(
        href.startsWith('clock') ? 'Clock' : 'Tabs'
      )
    }
    await expect(page.locator('#timers')).toHaveText('2') // two clocks were visited, none stopped
    await expect(page.locator('#lines')).toContainText('NOT cleaned')
    await page.keyboard.press('a')
    // The same key, handled by every tabs that was ever set up
    await expect(page.locator('#lines li').filter({ hasText: /^key "a"/ })).toHaveCount(2)
    // Turning it on again does not undo what already leaked, but stops new leaks
    await page.check('#cleanup')
    await page.click('nav a[href="clock.html"]')
    await expect(page.locator('#pagefold h1')).toHaveText('Clock')
    await page.click('nav a[href="tabs.html"]')
    await expect(page.locator('#lines')).toContainText('cleaned      clock')
  })

  test('inspector: title, description, language, body class, announcement and focus follow the page', async ({
    page,
  }) => {
    await go(page, 'inspector')
    await page.click('nav a[href="spanish.html"]')
    await expect(h1(page)).toHaveText('Sobre nosotros')
    await expect(page.locator('#v-title')).toHaveText('Página en español')
    await expect(page.locator('#v-lang')).toHaveText('es')
    await expect(page.locator('#v-body')).toHaveText('page-es')
    await expect(page.locator('#v-desc')).toContainText('otro idioma')
    await expect(page.locator('#v-said')).toHaveText('Navigated to: Sobre nosotros')
    await expect(page.locator('#v-focus')).toContainText('main')
    await page.click('nav a[href="label.html"]')
    await expect(page.locator('#v-said')).toHaveText(
      'Navigated to: A better name for screen readers'
    )
  })
})
