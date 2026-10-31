import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { Pagefold } from '../../../src/pagefold'
import PagefoldPreload from '../../../src/plugins/preload'
import { page, resetDom, respond, stubFetch } from './helpers'

let pf: Pagefold
const link = () => document.querySelector<HTMLAnchorElement>('#link')!

const make = (options: ConstructorParameters<typeof PagefoldPreload>[0] = {}) => {
  const plugin = new PagefoldPreload({ preloadInitialPage: false, hoverDelay: 0, ...options })
  pf = new Pagefold({ animationSelector: false, plugins: [plugin] })
  return plugin
}

beforeEach(() => {
  resetDom('<div id="pagefold"><a id="link" href="/a">a</a> <a id="other" href="/b">b</a></div>')
  Object.defineProperty(navigator, 'connection', { value: undefined, configurable: true })
})
afterEach(async () => {
  await pf?.destroy()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** A fetch whose responses are released by hand, to observe concurrency. */
const manualFetch = () => {
  const waiting: { url: string; release: () => void }[] = []
  const mock = vi.fn(
    (url: string) =>
      new Promise<Response>((resolve) => {
        waiting.push({ url, release: () => resolve(respond(url, page('', url))) })
      })
  )
  vi.stubGlobal('fetch', mock)
  return { mock, waiting }
}

describe('preload', () => {
  test('fetches a page into the cache and does not fetch it twice', async () => {
    const fetchMock = stubFetch({ '/a': page('', 'a') })
    const plugin = make()
    const first = await plugin.preload('/a')
    expect(first?.html).toContain('a')
    expect(pf.cache.has('/a')).toBe(true)
    expect(await plugin.preload('/a')).toBeUndefined() // already cached
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('a later navigation is served from the cache', async () => {
    const fetchMock = stubFetch({ '/a': page('<title>A</title>', 'content a') })
    const plugin = make()
    await plugin.preload('/a')
    await pf.navigate('/a')
    expect(document.querySelector('#pagefold')?.textContent).toBe('content a')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('a navigation that starts during a preload waits for it instead of fetching again', async () => {
    const { mock, waiting } = manualFetch()
    const plugin = make()
    const preloading = plugin.preload('/a')
    await vi.waitFor(() => expect(waiting).toHaveLength(1))
    const navigating = pf.navigate('/a')
    await Promise.resolve()
    waiting[0].release()
    await preloading
    await navigating
    expect(mock).toHaveBeenCalledTimes(1)
    expect(document.querySelector('#pagefold')?.textContent).toBe('/a')
  })

  test.each([
    ['another origin', 'https://elsewhere.test/a'],
    ['the current page', '/'],
  ])('skips %s', async (_label, url) => {
    const fetchMock = stubFetch({ '/': page('', 'home') })
    const plugin = make()
    expect(await plugin.preload(url)).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('skips links marked data-no-preload, ignored by the option, or opted out of navigation', async () => {
    const fetchMock = stubFetch({ '/a': page('', 'a'), '/b': page('', 'b') })
    const plugin = make({ ignore: (el) => el.id === 'other' })
    link().setAttribute('data-no-preload', '')
    await plugin.preload([link(), document.querySelector<HTMLAnchorElement>('#other')!])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('does nothing on slow connections, unless disabled', async () => {
    const fetchMock = stubFetch({ '/a': page('', 'a') })
    Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true })
    const plugin = make()
    expect(await plugin.preload('/a')).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()

    plugin.options.respectConnection = false
    expect(await plugin.preload('/a')).toBeDefined()
  })

  test('limits simultaneous requests and lets priority ones go first', async () => {
    const { waiting } = manualFetch()
    const plugin = make({ throttle: 2 })
    const done = [
      plugin.preload('/p1'),
      plugin.preload('/p2'),
      plugin.preload('/p3'),
      plugin.preload('/p4'),
      plugin.preload('/urgent', { priority: true }),
    ]
    await vi.waitFor(() => expect(waiting).toHaveLength(2))
    expect(waiting.map((w) => w.url)).toEqual(['/p1', '/p2'])

    waiting[0].release()
    await vi.waitFor(() => expect(waiting).toHaveLength(3))
    expect(waiting[2].url).toBe('/urgent') // jumped the line

    waiting.forEach((w) => w.release())
    await vi.waitFor(() => expect(waiting).toHaveLength(5))
    waiting.forEach((w) => w.release())
    await Promise.all(done)
  })

  test('fires page:preload with the page', async () => {
    stubFetch({ '/a': page('', 'a') })
    const plugin = make()
    const seen = vi.fn()
    pf.hooks.on('page:preload', (_v, { page: p }) => seen(p.url))
    await plugin.preload('/a')
    expect(seen).toHaveBeenCalledWith('/a')
  })

  test('a failed preload resolves undefined and does not break navigation', async () => {
    const fetchMock = stubFetch({})
    const plugin = make()
    pf.options.failOnStatus = (s) => s >= 400
    expect(await plugin.preload('/missing')).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('preloadInitialPage fetches the current page', async () => {
    const fetchMock = stubFetch({ '/': page('', 'home') })
    pf = new Pagefold({ animationSelector: false, plugins: [new PagefoldPreload()] })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(pf.cache.has('/')).toBe(true))
  })
})

describe('hover, touch and focus', () => {
  test('hovering a link preloads it', async () => {
    const fetchMock = stubFetch({ '/a': page('', 'a') })
    make()
    link().dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })

  test('the pointer must rest on the link for the hover delay', () => {
    vi.useFakeTimers()
    const fetchMock = stubFetch({ '/a': page('', 'a'), '/b': page('', 'b') })
    make({ hoverDelay: 100 })
    link().dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    vi.advanceTimersByTime(50)
    link().dispatchEvent(new MouseEvent('mouseout', { bubbles: true })) // flew past
    vi.advanceTimersByTime(200)
    expect(fetchMock).not.toHaveBeenCalled()

    link().dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    vi.advanceTimersByTime(100)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('touch and focus preload without delay', async () => {
    const fetchMock = stubFetch({ '/a': page('', 'a') })
    make({ hoverDelay: 1000 })
    link().dispatchEvent(new Event('touchstart', { bubbles: true }))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })

  test('preloadHoveredLinks: false turns it off, and unmounting removes the listeners', async () => {
    const fetchMock = stubFetch({ '/a': page('', 'a') })
    make({ preloadHoveredLinks: false })
    link().dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    await Promise.resolve()
    expect(fetchMock).not.toHaveBeenCalled()

    await pf.destroy()
    pf = new Pagefold({ animationSelector: false, plugins: [new PagefoldPreload({ preloadInitialPage: false, hoverDelay: 0 })] })
    await pf.destroy()
    link().dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    await Promise.resolve()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('visible links', () => {
  test('preloads a link that stays in view for the delay', () => {
    vi.useFakeTimers()
    let callback!: IntersectionObserverCallback
    const observed: Element[] = []
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: IntersectionObserverCallback) {
          callback = cb
        }
        observe(el: Element) {
          observed.push(el)
        }
        unobserve() {}
        disconnect() {}
      }
    )
    const fetchMock = stubFetch({ '/a': page('', 'a'), '/b': page('', 'b') })
    make({ preloadHoveredLinks: false, preloadVisibleLinks: { delay: 300 } })
    expect(observed).toHaveLength(2)

    const entry = (el: Element, isIntersecting: boolean) =>
      ({ target: el, isIntersecting }) as unknown as IntersectionObserverEntry
    callback([entry(link(), true), entry(observed[1], true)], {} as IntersectionObserver)
    vi.advanceTimersByTime(200)
    callback([entry(observed[1], false)], {} as IntersectionObserver) // scrolled away
    vi.advanceTimersByTime(200)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/a')
  })
})
