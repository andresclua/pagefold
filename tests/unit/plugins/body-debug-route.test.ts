import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { Pagefold } from '../../../src/pagefold'
import PagefoldBodyClass from '../../../src/plugins/body-class'
import PagefoldDebug from '../../../src/plugins/debug'
import PagefoldRouteName from '../../../src/plugins/route-name'
import { resetDom, stubFetch } from './helpers'

let pf: Pagefold
beforeEach(() => resetDom())
afterEach(async () => {
  await pf?.destroy()
  vi.unstubAllGlobals()
})

const withBody = (cls: string, body = 'x') =>
  `<html><head></head><body class="${cls}"><div id="pagefold">${body}</div></body></html>`

describe('PagefoldBodyClass', () => {
  test('copies the body class from the new page', async () => {
    document.body.className = 'home'
    stubFetch({ '/a': withBody('blog single') })
    pf = new Pagefold({ animationSelector: false, plugins: [new PagefoldBodyClass()] })
    await pf.navigate('/a')
    expect(document.body.className).toBe('blog single')
  })

  test('with a prefix only those classes change', async () => {
    document.body.className = 'js-ready page-home theme-dark'
    stubFetch({ '/a': withBody('page-blog other') })
    pf = new Pagefold({
      animationSelector: false,
      plugins: [new PagefoldBodyClass({ prefix: 'page-' })],
    })
    await pf.navigate('/a')
    expect(Array.from(document.body.classList).sort()).toEqual(['js-ready', 'page-blog', 'theme-dark'])
  })
})

describe('PagefoldDebug', () => {
  const setup = (options: ConstructorParameters<typeof PagefoldDebug>[0] = {}) => {
    const log = vi.fn()
    const debug = new PagefoldDebug({ log, ...options })
    pf = new Pagefold({ animationSelector: false, plugins: [debug] })
    return { log, debug }
  }
  const messages = (log: ReturnType<typeof vi.fn>) => log.mock.calls.map((c) => String(c[0]))

  test('logs hooks in order with the visit and the elapsed time', async () => {
    stubFetch({ '/a': withBody('') })
    const { log } = setup()
    await pf.navigate('/a')
    const hooks = messages(log)
      .map((m) => /^([a-z:]+) ·/.exec(m)?.[1])
      .filter(Boolean)
    expect(hooks.indexOf('visit:start')).toBeLessThan(hooks.indexOf('content:replace'))
    expect(hooks.indexOf('content:replace')).toBeLessThan(hooks.indexOf('visit:end'))
    expect(messages(log).find((m) => m.startsWith('content:replace'))).toMatch(/\/ → \/a \+\d+ms$/)
  })

  test('filter hides hooks', async () => {
    stubFetch({ '/a': withBody('') })
    const { log } = setup({ filter: (hook) => hook.startsWith('visit:') })
    await pf.navigate('/a')
    expect(messages(log).every((m) => m.startsWith('visit:'))).toBe(true)
  })

  test('warns about missing containers', () => {
    const { log } = setup()
    pf.destroy().catch(() => {})
    pf = new Pagefold({
      animationSelector: false,
      containers: ['#nope'],
      plugins: [new PagefoldDebug({ log })],
    })
    expect(messages(log).some((m) => m.includes('`#nope`'))).toBe(true)
  })

  test('takes over pagefold.log and gives it back on unmount', async () => {
    const original = (() => {}) as Pagefold['log']
    const { log, debug } = setup()
    pf.log = original
    await pf.destroy()
    pf = new Pagefold({ animationSelector: false, plugins: [debug] })
    pf.log('hello', { a: 1 })
    expect(log).toHaveBeenCalledWith('hello', { a: 1 })
    pf.unuse(debug)
    expect(pf.log).not.toBe(original)
  })
})

describe('PagefoldRouteName', () => {
  const routes = { home: '/', blog: '/blog', post: '/blog/:slug' }

  beforeEach(() => stubFetch({ '/blog': withBody(''), '/blog/x': withBody('') }))

  test('names the pages of a visit', async () => {
    pf = new Pagefold({ animationSelector: false, plugins: [new PagefoldRouteName({ routes })] })
    let seen: [string | undefined, string | undefined] = [undefined, undefined]
    pf.hooks.on('visit:transition', (v) => {
      seen = [v.from.route, v.to.route]
    })
    await pf.navigate('/blog/x')
    expect(seen).toEqual(['home', 'post'])
  })

  test('adds from and to classes during the visit and removes them after', async () => {
    pf = new Pagefold({ animationSelector: false, plugins: [new PagefoldRouteName({ routes })] })
    let during: string[] = []
    pf.hooks.on('visit:transition', () => {
      during = Array.from(document.documentElement.classList)
    })
    await pf.navigate('/blog')
    expect(during).toEqual(expect.arrayContaining(['from-route-home', 'to-route-blog']))
    expect(document.documentElement.className).not.toMatch(/route/)
  })

  test('picks the animation by route, unless the visit already has one', async () => {
    pf = new Pagefold({
      animationSelector: false,
      plugins: [
        new PagefoldRouteName({
          routes,
          animations: [
            { from: 'home', to: 'blog', animation: 'slide' },
            { to: ['post'], animation: 'zoom' },
          ],
        }),
      ],
    })
    const names: (string | undefined)[] = []
    pf.hooks.on('visit:transition', (v) => {
      names.push(v.animation.name)
    })
    await pf.navigate('/blog')
    await pf.navigate('/blog/x')
    await pf.navigate('/blog', { animation: 'custom' })
    expect(names).toEqual(['slide', 'zoom', 'custom'])
  })

  test('unnamed pages have no route', () => {
    const plugin = new PagefoldRouteName({ routes })
    expect(plugin.routeOf('/somewhere/else')).toBeUndefined()
    expect(plugin.routeOf('/blog/hello?x=1')).toBe('post')
  })
})
