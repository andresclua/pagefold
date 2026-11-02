import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { Pagefold } from '../../../src/pagefold'
import PagefoldProgress from '../../../src/plugins/progress'
import { page, resetDom, stubFetch } from './helpers'

let pf: Pagefold
const bar = () => document.querySelector<HTMLElement>('.pagefold-progress-bar')
const make = (options: ConstructorParameters<typeof PagefoldProgress>[0] = {}) => {
  pf = new Pagefold({ animationSelector: false, plugins: [new PagefoldProgress(options)] })
}

beforeEach(() => {
  resetDom()
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'],
  })
  stubFetch({ '/a': page('', 'a') })
})
afterEach(async () => {
  await pf?.destroy()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const scale = () => Number(/scaleX\(([\d.]+)\)/.exec(bar()?.style.transform ?? '')?.[1])

describe('PagefoldProgress', () => {
  test('shows nothing for a quick visit', async () => {
    make({ delay: 300 })
    await pf.hooks.call('visit:start', undefined)
    await vi.advanceTimersByTimeAsync(200)
    expect(bar()).toBeNull()
    await pf.hooks.call('page:view', undefined, { url: '/a', title: '' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(bar()).toBeNull()
  })

  test('appears after the delay, starts at the initial value and trickles forward', async () => {
    make({ delay: 300, initialValue: 0.25 })
    await pf.hooks.call('visit:start', undefined)
    await vi.advanceTimersByTimeAsync(300)
    expect(bar()).not.toBeNull()
    expect(scale()).toBeCloseTo(0.25)
    await vi.advanceTimersByTimeAsync(1000)
    expect(scale()).toBeGreaterThan(0.25)
    expect(scale()).toBeLessThan(0.99)
  })

  test('runs to the end and then removes itself when the page is viewed', async () => {
    make({ delay: 100, transition: 300 })
    await pf.hooks.call('visit:start', undefined)
    await vi.advanceTimersByTimeAsync(150)
    await pf.hooks.call('page:view', undefined, { url: '/a', title: '' })
    expect(scale()).toBe(1)
    await vi.advanceTimersByTimeAsync(300)
    expect(bar()).toBeNull()
  })

  test('finishAnimation: false removes it straight away', async () => {
    make({ delay: 100, finishAnimation: false })
    await pf.hooks.call('visit:start', undefined)
    await vi.advanceTimersByTimeAsync(150)
    await pf.hooks.call('page:view', undefined, { url: '/a', title: '' })
    expect(bar()).toBeNull()
  })

  test('a failed visit removes the bar', async () => {
    make({ delay: 100 })
    await pf.hooks.call('visit:start', undefined)
    await vi.advanceTimersByTimeAsync(150)
    await pf.hooks.call('visit:fail', undefined, { error: new Error('x') })
    expect(bar()).toBeNull()
  })

  test('works through a real visit', async () => {
    make({ delay: 0, transition: 50 })
    await pf.navigate('/a')
    await vi.advanceTimersByTimeAsync(100)
    expect(bar()).toBeNull()
  })

  test('styles: false leaves styling to you; unmounting cleans up', async () => {
    make({ delay: 0, styles: false })
    await pf.hooks.call('visit:start', undefined)
    await vi.advanceTimersByTimeAsync(10)
    expect(bar()?.style.cssText).toBe('transform: scaleX(0.25);')
    await pf.destroy()
    expect(bar()).toBeNull()
  })
})
