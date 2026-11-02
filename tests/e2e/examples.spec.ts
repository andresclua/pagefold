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
    await page.evaluate(() => ((window as unknown as { __same: boolean }).__same = true))
    await page.click('nav a[href="about.html"]')
    await expect(page.locator('h1')).toHaveText('About')
    await expect(page).toHaveURL(new RegExp(`/examples/${name}/about.html$`))
    expect(await page.evaluate(() => (window as unknown as { __same?: boolean }).__same)).toBe(true)
    await page.goBack()
    await expect(page.locator('h1')).toHaveText('Home')
    expect(await page.locator('#pagefold').count()).toBe(1)
  })
}

test('overlap: both pages are in the DOM during the visit and one is left after', async ({
  page,
}) => {
  await go(page, 'overlap')
  await page.evaluate(() => {
    const w = window as unknown as { __max: number }
    w.__max = 0
    new MutationObserver(
      () => (w.__max = Math.max(w.__max, document.querySelectorAll('#pagefold').length))
    ).observe(document.body, { childList: true, subtree: true })
  })
  await page.click('nav a[href="contact.html"]')
  await expect(page.locator('h1')).toHaveText('Contact')
  await expect(page.locator('#pagefold')).toHaveCount(1)
  expect(await page.evaluate(() => (window as unknown as { __max: number }).__max)).toBe(2)
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
