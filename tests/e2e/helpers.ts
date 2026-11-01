import type { Page } from '@playwright/test'

export interface Config {
  options?: Record<string, unknown>
  plugins?: [string, Record<string, unknown>?][]
  record?: boolean
  alpine?: boolean
  failOnClientErrors?: boolean
}

/** Open a page with a Pagefold instance built from `config` (see fixtures/boot.js). */
export async function open(page: Page, path: string, config: Config = {}) {
  await page.addInitScript((c) => {
    window.__pf = c
  }, config)
  await page.goto(path)
  await page.waitForFunction(() => window.__ready === true)
}

export const heading = (page: Page) => page.locator('#pagefold h1')
export const link = (page: Page, href: string) => page.locator(`nav a[href="${href}"]`)
export const opacity = (page: Page) =>
  page.evaluate(() => Number(getComputedStyle(document.querySelector('#pagefold')!).opacity))
