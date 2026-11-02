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

for (const name of ['fade', 'slide', 'overlap']) {
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

test('fragment: the list keeps its scroll and what was typed; only the detail changes', async ({
  page,
}) => {
  await go(page, 'fragment')
  await page.fill('#list input', 'hello')
  await page.evaluate(() => (document.querySelector('#list') as HTMLElement).scrollTo(0, 80))
  await page.locator('#list a[href="grace.html"]').dispatchEvent('click') // click() would scroll the list back to the link
  await expect(page.locator('#detail h1')).toHaveText('Grace')
  await expect(page.locator('#list input')).toHaveValue('hello')
  expect(
    await page.evaluate(() => (document.querySelector('#list') as HTMLElement).scrollTop)
  ).toBeGreaterThan(40)
  await page.goBack()
  await expect(page.locator('#detail h1')).toHaveText('Ada')
  await expect(page.locator('#list input')).toHaveValue('hello')
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
