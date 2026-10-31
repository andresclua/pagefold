import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { Pagefold } from '../../../src/pagefold'
import PagefoldJs from '../../../src/plugins/js'
import { matchPath } from '../../../src/plugins/match-path'
import PagefoldOverlap from '../../../src/plugins/overlap'
import { page, resetDom, stubFetch } from './helpers'

let pf: Pagefold
beforeEach(() => resetDom())
afterEach(async () => {
  await pf?.destroy()
  vi.unstubAllGlobals()
})

describe('matchPath', () => {
  test.each([
    ['/blog/:slug', '/blog/hello', { slug: 'hello' }],
    ['/blog/:slug', '/blog/hello/', { slug: 'hello' }],
    ['/blog/:slug', '/blog/hello?x=1', { slug: 'hello' }],
    ['/blog/:slug', '/blog/a%20b', { slug: 'a b' }],
    ['/docs/(.*)', '/docs/a/b', { '0': 'a/b' }],
    ['(.*)', '/anything/at/all', { '0': '/anything/at/all' }],
    ['/', '/', {}],
  ])('%s matches %s', (pattern, url, params) => {
    expect(matchPath(pattern, url)).toEqual(params)
  })

  test.each([
    ['/blog/:slug', '/blog'],
    ['/blog/:slug', '/news/hello'],
    ['/a.b', '/aXb'],
  ])('%s does not match %s', (pattern, url) => {
    expect(matchPath(pattern, url)).toBeNull()
  })
})

describe('PagefoldJs', () => {
  beforeEach(() => {
    stubFetch({ '/a': page('', 'a'), '/blog/x': page('', 'x') })
  })

  test('runs out, then replaces the content, then runs in; supports callbacks and promises', async () => {
    const order: string[] = []
    pf = new Pagefold({
      animationSelector: false,
      plugins: [
        new PagefoldJs([
          {
            out: (done) => {
              setTimeout(() => {
                order.push('out')
                done()
              }, 5)
            },
            in: async () => {
              await new Promise((r) => setTimeout(r, 5))
              order.push('in')
            },
          },
        ]),
      ],
    })
    pf.hooks.on('content:replace', () => order.push('replace'))
    await pf.navigate('/a')
    expect(order).toEqual(['out', 'replace', 'in'])
  })

  test('passes the matched paths and params', async () => {
    const seen = vi.fn()
    pf = new Pagefold({
      animationSelector: false,
      plugins: [new PagefoldJs({ animations: [{ from: '/', to: '/blog/:slug', out: (done, data) => {
        seen(data)
        done()
      } }] })],
    })
    await pf.navigate('/blog/x')
    const data = seen.mock.calls[0]?.[0] as { direction: string; to: { params: object; pattern: string } }
    expect(data.direction).toBe('out')
    expect(data.to.params).toEqual({ slug: 'x' })
    expect(data.to.pattern).toBe('/blog/:slug')
  })

  test('picks by name, and named animations only run when asked for', async () => {
    const ran: string[] = []
    pf = new Pagefold({
      animationSelector: false,
      plugins: [
        new PagefoldJs([
          { name: 'slide', out: () => void ran.push('slide') },
          { out: () => void ran.push('default') },
        ]),
      ],
    })
    await pf.navigate('/a')
    await pf.navigate('/blog/x', { animation: 'slide' })
    expect(ran).toEqual(['default', 'slide'])
  })

  test('does nothing when no animation matches', async () => {
    const out = vi.fn()
    pf = new Pagefold({
      animationSelector: false,
      plugins: [new PagefoldJs([{ to: '/nowhere', out }])],
    })
    await pf.navigate('/a')
    expect(out).not.toHaveBeenCalled()
  })

  test('a failing animation fails the visit', async () => {
    pf = new Pagefold({
      animationSelector: false,
      plugins: [new PagefoldJs([{ out: () => Promise.reject(new Error('gsap blew up')) }])],
    })
    const failed = vi.fn()
    pf.hooks.replace('visit:fail', (_v, { error }) => failed(error))
    await pf.navigate('/a')
    expect((failed.mock.calls[0]?.[0] as Error).message).toBe('gsap blew up')
  })
})

describe('PagefoldOverlap', () => {
  beforeEach(() => {
    resetDom('<div id="pagefold">old</div>')
    stubFetch({ '/a': page('', 'new') })
  })

  const containers = () => Array.from(document.querySelectorAll('#pagefold'))

  test('keeps both containers while the page animates in, then removes the old one', async () => {
    let release!: () => void
    pf = new Pagefold({ animationSelector: false, plugins: [new PagefoldOverlap()] })
    pf.hooks.replace('animation:in:await', () => new Promise<void>((r) => (release = r)), { once: true })

    const visit = pf.navigate('/a')
    await vi.waitFor(() => expect(containers()).toHaveLength(2))

    const [next, previous] = containers()
    expect(next?.textContent).toBe('new')
    expect(previous?.textContent).toBe('old')
    expect(previous?.classList.contains('is-previous-container')).toBe(true)
    expect(previous?.getAttribute('aria-hidden')).toBe('true')

    release()
    await visit
    expect(containers()).toHaveLength(1)
    expect(containers()[0]?.textContent).toBe('new')
  })

  test('skips the out animation (both run at once)', async () => {
    pf = new Pagefold({ animationSelector: false, plugins: [new PagefoldOverlap()] })
    const skip = vi.fn()
    pf.hooks.on('animation:out:await', (_v, args) => skip(args.skip), { priority: 2 })
    await pf.navigate('/a')
    expect(skip).toHaveBeenCalledWith(true)
  })

  test('keep leaves the previous containers in place', async () => {
    pf = new Pagefold({ animationSelector: false, plugins: [new PagefoldOverlap({ keep: 1 })] })
    await pf.navigate('/a')
    expect(containers()).toHaveLength(2)
    expect(containers()[0]?.textContent).toBe('new')
    expect(containers()[1]?.textContent).toBe('old')
    expect(containers()[1]?.classList.contains('is-kept-container')).toBe(true)
  })

  test('can be disabled per visit', async () => {
    pf = new Pagefold({ animationSelector: false, plugins: [new PagefoldOverlap()] })
    pf.hooks.on('visit:start', (visit) => {
      visit.animation.overlap = false
    })
    await pf.navigate('/a')
    expect(containers()).toHaveLength(1)
    expect(containers()[0]?.textContent).toBe('new')
  })

  test('other containers are still replaced normally', async () => {
    resetDom('<div id="pagefold">old</div><div id="aside">old aside</div>')
    stubFetch({ '/a': `<html><head></head><body><div id="pagefold">new</div><div id="aside">new aside</div></body></html>` })
    pf = new Pagefold({
      animationSelector: false,
      containers: ['#pagefold', '#aside'],
      plugins: [new PagefoldOverlap({ containers: ['#pagefold'] })],
    })
    await pf.navigate('/a')
    expect(document.querySelector('#aside')?.textContent).toBe('new aside')
    expect(containers()).toHaveLength(1)
  })
})
