import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { Pagefold } from '../../../src/pagefold'
import PagefoldScroll, { easeInOutCubic } from '../../../src/plugins/scroll'
import { page, resetDom, stubFetch } from './helpers'

let pf: Pagefold
let plugin: PagefoldScroll
let scrollTo: ReturnType<typeof vi.fn>
let scrollIntoView: ReturnType<typeof vi.fn>

const make = (options: ConstructorParameters<typeof PagefoldScroll>[0] = {}) => {
  plugin = new PagefoldScroll({ duration: 1000, ...options })
  pf = new Pagefold({ animationSelector: false, plugins: [plugin] })
}

const setScrollY = (y: number) =>
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true, writable: true })

beforeEach(() => {
  resetDom(
    '<div id="pagefold"><a id="jump" href="/#section">jump</a><a id="self" href="/">self</a><h2 id="section">Section</h2></div>'
  )
  vi.useFakeTimers({
    toFake: [
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
      'setTimeout',
      'clearTimeout',
    ],
  })
  setScrollY(0)
  scrollTo = vi.fn((opts: ScrollToOptions) => setScrollY(opts.top ?? 0))
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo
  scrollIntoView = vi.fn()
  Element.prototype.scrollIntoView =
    scrollIntoView as unknown as typeof Element.prototype.scrollIntoView
  stubFetch({ '/a': page('', 'a') })
})
afterEach(async () => {
  await pf?.destroy()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(window, 'matchMedia')
})

describe('easing', () => {
  test('starts at 0, ends at 1 and is symmetric', () => {
    expect(easeInOutCubic(0)).toBe(0)
    expect(easeInOutCubic(1)).toBe(1)
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5)
    expect(easeInOutCubic(0.25) + easeInOutCubic(0.75)).toBeCloseTo(1)
  })
})

describe('scrollTo', () => {
  test('animates to the position over the duration', async () => {
    make()
    const done = plugin.scrollTo(500)
    await vi.advanceTimersByTimeAsync(500)
    expect(window.scrollY).toBeGreaterThan(0)
    expect(window.scrollY).toBeLessThan(500)
    await vi.advanceTimersByTimeAsync(600)
    await done
    expect(window.scrollY).toBe(500)
  })

  test('jumps when not animated', async () => {
    make()
    await plugin.scrollTo(300, false)
    expect(window.scrollY).toBe(300)
    expect(scrollTo).toHaveBeenCalledTimes(1)
  })

  test('the user taking over (wheel) stops the animation', async () => {
    make()
    const done = plugin.scrollTo(500)
    await vi.advanceTimersByTimeAsync(300)
    const reached = window.scrollY
    window.dispatchEvent(new Event('wheel'))
    await done
    await vi.advanceTimersByTimeAsync(1000)
    expect(window.scrollY).toBe(reached)
    expect(reached).toBeLessThan(500)
  })

  test('scrolls to an element, minus the offset', async () => {
    make({ offset: 100 })
    const el = document.querySelector('#section')!
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ top: 700 } as DOMRect)
    const done = plugin.scrollTo(el)
    await vi.advanceTimersByTimeAsync(1100)
    await done
    expect(window.scrollY).toBe(600)
  })

  test('offset can depend on the target', async () => {
    make({ offset: (el) => (el.id === 'section' ? 50 : 0) })
    const el = document.querySelector('#section')!
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ top: 400 } as DOMRect)
    await plugin.scrollTo(el, false)
    expect(window.scrollY).toBe(350)
  })
})

describe('as a plugin', () => {
  test('a visit to another page animates back to the top', async () => {
    make()
    setScrollY(800)
    await pf.navigate('/a')
    await vi.advanceTimersByTimeAsync(1100)
    expect(window.scrollY).toBe(0)
    expect(scrollTo.mock.calls.length).toBeGreaterThan(2) // many frames, not one jump
  })

  test('betweenPages: false jumps straight away', async () => {
    make({ animateScroll: { betweenPages: false } })
    setScrollY(800)
    await pf.navigate('/a')
    expect(window.scrollY).toBe(0)
    expect(scrollTo).toHaveBeenCalledTimes(1)
  })

  test('animateScroll: false never animates', async () => {
    make({ animateScroll: false })
    setScrollY(800)
    await pf.navigate('/a')
    expect(scrollTo).toHaveBeenCalledTimes(1)
  })

  test('a link to an anchor on the same page animates to it', async () => {
    make({ offset: 20 })
    const section = document.querySelector('#section')!
    vi.spyOn(section, 'getBoundingClientRect').mockReturnValue({ top: 520 } as DOMRect)
    document
      .querySelector('#jump')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    await vi.advanceTimersByTimeAsync(1100)
    expect(window.scrollY).toBe(500)
  })

  test('samePageWithHash: false falls back to the instant default', () => {
    make({ animateScroll: { samePageWithHash: false } })
    document
      .querySelector('#jump')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollTo).not.toHaveBeenCalled()
  })

  test('reduced motion jumps instead of animating', async () => {
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
    make()
    setScrollY(800)
    await pf.navigate('/a')
    expect(window.scrollY).toBe(0)
    expect(scrollTo).toHaveBeenCalledTimes(1)
  })

  test('starting a new visit stops a running animation', async () => {
    make()
    const done = plugin.scrollTo(900)
    await vi.advanceTimersByTimeAsync(200)
    const reached = window.scrollY
    await pf.navigate('/a', { animate: false })
    await done
    expect(reached).toBeGreaterThan(0)
    expect(window.scrollY).toBeLessThanOrEqual(reached) // nothing kept pushing it down the page
  })
})

describe('getAnchorElement', () => {
  test('a custom finder decides what a hash points to', () => {
    resetDom(
      '<div id="pagefold"><a id="jump" href="/#section">jump</a><h2 data-target="section">Section</h2></div>'
    )
    const found = vi.fn((hash: string): Element | null =>
      document.querySelector<Element>(`[data-target="${hash.slice(1)}"]`)
    )
    make({ animateScroll: false, getAnchorElement: found })
    document.querySelector<HTMLAnchorElement>('#jump')!.click()
    expect(found).toHaveBeenCalledWith('#section')
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })
})
