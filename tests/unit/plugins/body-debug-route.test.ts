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
    expect(Array.from(document.body.classList).sort()).toEqual([
      'js-ready',
      'page-blog',
      'theme-dark',
    ])
  })
})

describe('PagefoldBodyClass attributes', () => {
  const withBodyAttrs = (attrs: string) =>
    `<html><head></head><body class="x" ${attrs}><div id="pagefold">x</div></body></html>`

  test('copies the listed attributes, by name or by pattern, and removes the ones that are gone', async () => {
    document.body.setAttribute('lang', 'en')
    document.body.setAttribute('data-theme', 'dark')
    document.body.setAttribute('data-keep', '1')
    document.body.setAttribute('role', 'main')
    stubFetch({ '/a': withBodyAttrs('lang="de" data-section="blog"') })
    pf = new Pagefold({
      animationSelector: false,
      plugins: [new PagefoldBodyClass({ attributes: ['lang', /^data-/] })],
    })
    await pf.navigate('/a')
    expect(document.body.getAttribute('lang')).toBe('de')
    expect(document.body.getAttribute('data-section')).toBe('blog')
    expect(document.body.hasAttribute('data-theme')).toBe(false) // matched, and gone from the new page
    expect(document.body.hasAttribute('data-keep')).toBe(false)
    expect(document.body.getAttribute('role')).toBe('main') // not listed: left alone
  })

  test('by default no attribute is touched', async () => {
    document.body.setAttribute('lang', 'en')
    stubFetch({ '/a': withBodyAttrs('lang="de"') })
    pf = new Pagefold({ animationSelector: false, plugins: [new PagefoldBodyClass()] })
    await pf.navigate('/a')
    expect(document.body.getAttribute('lang')).toBe('en')
  })
})

describe('PagefoldDebug globalInstance', () => {
  test('puts the instance on window and takes it away again', async () => {
    pf = new Pagefold({
      animationSelector: false,
      plugins: [new PagefoldDebug({ log: vi.fn(), globalInstance: true })],
    })
    expect((window as unknown as { pagefold?: unknown }).pagefold).toBe(pf)
    await pf.destroy()
    expect((window as unknown as { pagefold?: unknown }).pagefold).toBeUndefined()
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

  test('unnamed pages are called unknown, or have no route when asked', () => {
    const plugin = new PagefoldRouteName({ routes })
    expect(plugin.routeOf('/somewhere/else')).toBe('unknown')
    expect(plugin.routeOf('/blog/hello?x=1')).toBe('post')
    expect(new PagefoldRouteName({ routes, unknownRoute: 'other' }).routeOf('/x/y/z')).toBe('other')
    expect(new PagefoldRouteName({ routes, unknownRoute: false }).routeOf('/x/y/z')).toBeUndefined()
  })

  test('routes can be a list, and the first match wins', () => {
    const plugin = new PagefoldRouteName({
      routes: [
        { name: 'project', path: '/:lang/project/:slug' },
        { name: 'projects', path: '/:lang/projects' },
        { name: 'home', path: '/:lang?' },
        { name: 'any', path: '(.*)' },
      ],
    })
    expect(plugin.routeOf('/en/project/lorem')).toBe('project')
    expect(plugin.routeOf('/en/projects')).toBe('projects')
    expect(plugin.routeOf('/en')).toBe('home')
    expect(plugin.routeOf('/')).toBe('home')
    expect(plugin.routeOf('/en/something/else')).toBe('any')
  })

  test('paths adds a class named after each page, and a visit inside one route is marked', async () => {
    stubFetch({ '/blog': withBody(''), '/blog/x': withBody(''), '/': withBody('') })
    pf = new Pagefold({
      animationSelector: false,
      plugins: [
        new PagefoldRouteName({ routes: { post: '/blog/:slug', blog: '/blog' }, paths: true }),
      ],
    })
    const during: string[][] = []
    pf.hooks.on('visit:transition', () =>
      during.push(Array.from(document.documentElement.classList))
    )
    await pf.navigate('/blog')
    await pf.navigate('/blog/x')
    await pf.navigate('/')
    expect(during[0]).toEqual(
      expect.arrayContaining(['from-homepage', 'to-blog', 'from-route-unknown', 'to-route-blog'])
    )
    expect(during[1]).toEqual(expect.arrayContaining(['from-blog', 'to-blog-x']))
    expect(during[2]).toContain('to-homepage')
    const same = new PagefoldRouteName({ routes: { post: '/blog/:slug' } })
    pf.use(same)
    stubFetch({ '/blog/a': withBody(''), '/blog/b': withBody('') })
    await pf.navigate('/blog/a')
    const sameDuring: string[] = []
    pf.hooks.on('visit:transition', () =>
      sameDuring.push(...Array.from(document.documentElement.classList))
    )
    await pf.navigate('/blog/b')
    expect(sameDuring).toContain('to-same-route')
  })
})
