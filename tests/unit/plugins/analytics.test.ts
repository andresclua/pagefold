import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { Pagefold } from '../../../src/pagefold'
import PagefoldAnalytics, { type PageView } from '../../../src/plugins/analytics'
import { page, resetDom, stubFetch } from './helpers'

let pf: Pagefold
type W = { gtag?: unknown; dataLayer?: unknown[]; _paq?: unknown[] }
const w = window as unknown as W

beforeEach(() => {
  resetDom()
  stubFetch({ '/a': page('<title>Page A</title>', 'a'), '/b': page('<title>Page B</title>', 'b') })
})
afterEach(async () => {
  await pf?.destroy()
  vi.unstubAllGlobals()
  delete w.gtag
  delete w.dataLayer
  delete w._paq
})

const make = (options: ConstructorParameters<typeof PagefoldAnalytics>[0]) => {
  pf = new Pagefold({ animationSelector: false, plugins: [new PagefoldAnalytics(options)] })
}

describe('PagefoldAnalytics', () => {
  test('gtag: sends a page_view event after each visit', async () => {
    const gtag = vi.fn()
    w.gtag = gtag
    make({ provider: 'gtag' })
    expect(gtag).not.toHaveBeenCalled() // the first page is not reported by Pagefold
    await pf.navigate('/a')
    expect(gtag).toHaveBeenCalledWith('event', 'page_view', {
      page_title: 'Page A',
      page_location: `${window.location.origin}/a`,
      page_path: '/a',
    })
    await pf.navigate('/b')
    expect(gtag).toHaveBeenCalledTimes(2)
  })

  test('gtm: pushes an event to the data layer, with a custom name', async () => {
    make({ provider: 'gtm', eventName: 'virtual_pageview' })
    await pf.navigate('/a')
    expect(w.dataLayer).toEqual([
      {
        event: 'virtual_pageview',
        page_title: 'Page A',
        page_location: `${window.location.origin}/a`,
        page_path: '/a',
      },
    ])
  })

  test('gtm: keeps what is already in the data layer', async () => {
    w.dataLayer = [{ existing: true }]
    make({ provider: 'gtm' })
    await pf.navigate('/a')
    expect(w.dataLayer).toHaveLength(2)
  })

  test('matomo: sets referrer, url and title, then tracks', async () => {
    make({ provider: 'matomo' })
    await pf.navigate('/a')
    expect(w._paq).toEqual([
      ['setReferrerUrl', `${window.location.origin}/`],
      ['setCustomUrl', `${window.location.origin}/a`],
      ['setDocumentTitle', 'Page A'],
      ['trackPageView'],
    ])
  })

  test('a function receives the page view, with the previous page as referrer', async () => {
    const track = vi.fn<(view: PageView) => void>()
    make({ provider: track })
    await pf.navigate('/a')
    await pf.navigate('/b')
    expect(track.mock.calls[1]?.[0]).toEqual({
      url: '/b',
      title: 'Page B',
      location: `${window.location.origin}/b`,
      referrer: `${window.location.origin}/a`,
    })
  })

  test('warns once when gtag is missing, and keeps working', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    make({ provider: 'gtag' })
    await pf.navigate('/a')
    await pf.navigate('/b')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(document.querySelector('#pagefold')?.textContent).toBe('b')
    warn.mockRestore()
  })
})
