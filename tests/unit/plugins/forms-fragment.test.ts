import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { Pagefold } from '../../../src/pagefold'
import PagefoldForms from '../../../src/plugins/forms'
import PagefoldFragment from '../../../src/plugins/fragment'
import { page, resetDom, stubFetch } from './helpers'

let pf: Pagefold
let fetchMock: ReturnType<typeof stubFetch>
afterEach(async () => {
  await pf?.destroy()
  vi.unstubAllGlobals()
})

describe('PagefoldForms', () => {
  const form = (attrs: string, inner = '') =>
    `<div id="pagefold"><form id="f" ${attrs}><input name="q" value="cats"><input name="tag" value="a b">${inner}<button id="go">go</button></form></div>`

  beforeEach(() => {
    fetchMock = stubFetch({
      '/search?q=cats&tag=a+b': page('<title>Results</title>', 'results'),
      '/other?q=cats&tag=a+b': page('', 'other'),
      '/save': page('', 'saved'),
    })
  })
  const make = (options?: ConstructorParameters<typeof PagefoldForms>[0]) => {
    pf = new Pagefold({ animationSelector: false, plugins: [new PagefoldForms(options)] })
  }
  const submit = (selector = '#f', submitter?: string) => {
    const el = document.querySelector<HTMLFormElement>(selector)!
    el.requestSubmit(submitter ? document.querySelector<HTMLElement>(submitter) : undefined)
  }

  test('a GET form becomes a visit with the fields in the query', async () => {
    resetDom(form('data-pagefold-form action="/search" method="get"'))
    make()
    submit()
    await vi.waitFor(() => expect(document.querySelector('#pagefold')?.textContent).toBe('results'))
    expect(window.location.pathname + window.location.search).toBe('/search?q=cats&tag=a+b')
    expect(document.title).toBe('Results')
  })

  test('a POST form sends the fields in the body and never uses the cache', async () => {
    resetDom(form('data-pagefold-form action="/save" method="post"'))
    make()
    submit()
    await vi.waitFor(() => expect(document.querySelector('#pagefold')?.textContent).toBe('saved'))
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/save')
    expect(init.method).toBe('POST')
    expect(String(init.body)).toBe('q=cats&tag=a+b')
    expect(pf.cache.size).toBe(0)
  })

  test('multipart forms send FormData', async () => {
    resetDom(form('data-pagefold-form action="/save" method="post" enctype="multipart/form-data"'))
    make()
    submit()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).body).toBeInstanceOf(FormData)
  })

  test('a button can override action and method', async () => {
    resetDom(
      form(
        'data-pagefold-form action="/save" method="post"',
        '<button id="alt" formaction="/other" formmethod="get">alt</button>'
      )
    )
    make()
    submit('#f', '#alt')
    await vi.waitFor(() => expect(document.querySelector('#pagefold')?.textContent).toBe('other'))
  })

  test('only forms that match the selector are handled', async () => {
    resetDom(form('action="/search" method="get"'))
    make()
    const event = new Event('submit', { bubbles: true, cancelable: true })
    document.querySelector('#f')!.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)

    await pf.destroy()
    make({ formSelector: 'form' })
    const second = new Event('submit', { bubbles: true, cancelable: true })
    document.querySelector('#f')!.dispatchEvent(second)
    expect(second.defaultPrevented).toBe(true)
  })

  test('forms to another origin, or opting out, are left to the browser', () => {
    resetDom(form('data-pagefold-form action="https://elsewhere.test/x" method="get"'))
    make()
    const event = new Event('submit', { bubbles: true, cancelable: true })
    document.querySelector('#f')!.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })

  test('form:submit lets a handler replace the default', () => {
    resetDom(form('data-pagefold-form action="/search" method="get"'))
    make()
    const seen = vi.fn()
    pf.hooks.replace('form:submit', (_v, { el, event }) => {
      event.preventDefault()
      seen(el.id)
    })
    submit()
    expect(seen).toHaveBeenCalledWith('f')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('PagefoldFragment', () => {
  const layout = (list: string, detail: string) =>
    `<html><head><title>T</title></head><body><div id="list">${list}</div><div id="detail">${detail}</div></body></html>`
  const rules = [{ from: '/users', to: '/user/:id', containers: ['#detail'], name: 'detail' }]

  beforeEach(() => {
    resetDom('<div id="list">users</div><div id="detail">none</div>')
    window.history.replaceState(null, '', '/users')
    stubFetch({
      '/user/1': layout('users', 'user one'),
      '/other': layout('other list', 'other detail'),
      '/user/2': `<html><head></head><body><div id="list">users</div></body></html>`,
    })
  })
  const make = () => {
    pf = new Pagefold({
      animationSelector: false,
      containers: ['#list', '#detail'],
      plugins: [new PagefoldFragment({ rules })],
    })
  }

  test('only the fragment container is replaced', async () => {
    make()
    const list = document.querySelector('#list')
    await pf.navigate('/user/1')
    expect(document.querySelector('#detail')?.textContent).toBe('user one')
    expect(document.querySelector('#list')).toBe(list) // same node, untouched
    expect(window.location.pathname).toBe('/user/1')
  })

  test('animation classes go on the fragment, and the name is set', async () => {
    make()
    let seen: { name?: string | undefined; html: boolean; detail: boolean } | undefined
    pf.hooks.on('animation:out:end', (v) => {
      seen = {
        name: v.animation.name,
        html: document.documentElement.classList.contains('is-animating'),
        detail: document.querySelector('#detail')?.classList.contains('is-animating') ?? false,
      }
    })
    await pf.navigate('/user/1')
    expect(seen).toEqual({ name: 'detail', html: false, detail: true })
    expect(document.querySelector('#detail')?.className).toBe('') // all cleaned up
  })

  test('scroll position is kept unless the rule asks for a reset', async () => {
    make()
    let reset: boolean | undefined
    pf.hooks.on('visit:transition', (v) => {
      reset = v.scroll.reset
    })
    await pf.navigate('/user/1')
    expect(reset).toBe(false)
  })

  test('visits that match no rule replace everything', async () => {
    make()
    await pf.navigate('/other')
    expect(document.querySelector('#list')?.textContent).toBe('other list')
    expect(document.querySelector('#detail')?.textContent).toBe('other detail')
  })

  test('if the new page lacks the fragment container, everything is replaced', async () => {
    make()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await pf.navigate('/user/2')
    // #detail is missing in the new page: the visit falls back to the normal containers
    expect(pf.visit.fragment).toBeUndefined()
    expect(pf.visit.containers).toEqual(['#list', '#detail'])
    warn.mockRestore()
  })

  test('a rule whose container is not on the current page is ignored', () => {
    document.querySelector('#detail')?.remove()
    make()
    const plugin = pf.plugins[0] as PagefoldFragment
    expect(plugin.find(pf.createVisit({ to: '/user/1' }))).toBeUndefined()
  })
})

describe('PagefoldForms: inline forms, empty fields and new tabs', () => {
  const answer = (extra = '') =>
    `<html><head></head><body><div id="pagefold"><p id="other">changed</p><form id="f" data-pagefold-inline-form action="/search">answer${extra}</form></div></body></html>`
  const inlinePage = () =>
    `<div id="pagefold"><p id="other">stay</p><form id="f" data-pagefold-inline-form action="/search"><input name="q" value="cats"><input name="empty" value=""><button id="go">go</button></form></div>`
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn() // jsdom has none
  })
  const make = (options?: ConstructorParameters<typeof PagefoldForms>[0]) => {
    pf = new Pagefold({ animationSelector: false, plugins: [new PagefoldForms(options)] })
  }

  test('an inline form replaces only itself and scrolls to its start', async () => {
    resetDom(inlinePage())
    fetchMock = stubFetch({ '/search?q=cats&empty=': answer() })
    make()
    let seen: { containers: string[]; target: string | false | undefined } | undefined
    pf.hooks.before('visit:transition', (v) => {
      seen = { containers: v.containers, target: v.scroll.target }
    })
    const other = document.querySelector('#other')
    document.querySelector<HTMLFormElement>('#f')!.requestSubmit()
    await vi.waitFor(() => expect(document.querySelector('#f')?.textContent).toBe('answer'))
    expect(seen).toEqual({ containers: ['#f'], target: '#f' })
    expect(document.querySelector('#other')).toBe(other) // outside the form: untouched
    expect(other?.textContent).toBe('stay')
  })

  test('the next visit is a normal one again', async () => {
    resetDom(inlinePage())
    fetchMock = stubFetch({ '/search?q=cats&empty=': answer(), '/page': answer() })
    make()
    document.querySelector<HTMLFormElement>('#f')!.requestSubmit()
    await vi.waitFor(() => expect(document.querySelector('#f')?.textContent).toBe('answer'))
    await pf.navigate('/page')
    expect(document.querySelector('#other')?.textContent).toBe('changed')
  })

  test('stripEmptyParams leaves empty fields out of the address', async () => {
    resetDom(inlinePage())
    fetchMock = stubFetch({ '/search?q=cats': answer() })
    make({ stripEmptyParams: true })
    document.querySelector<HTMLFormElement>('#f')!.requestSubmit()
    await vi.waitFor(() =>
      expect(window.location.pathname + window.location.search).toBe('/search?q=cats')
    )
  })

  test('a form that opens a new tab fires form:submit:newtab and is left to the browser', () => {
    resetDom(
      `<div id="pagefold"><form id="f" data-pagefold-form action="/search" target="_blank"><button>go</button></form></div>`
    )
    fetchMock = stubFetch({})
    make()
    const seen = vi.fn()
    pf.hooks.on('form:submit:newtab', seen)
    const event = new Event('submit', { bubbles: true, cancelable: true })
    document.querySelector('#f')!.dispatchEvent(event)
    expect(seen).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(false)
  })
})

describe('PagefoldFragment: if and scroll', () => {
  const layout = (detail: string) =>
    `<html><head><title>T</title></head><body><div id="list">users</div><div id="detail">${detail}</div></body></html>`
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn() // jsdom has none
    resetDom('<div id="list">users</div><div id="detail">none</div>')
    window.history.replaceState(null, '', '/users')
    stubFetch({ '/user/1': layout('one'), '/user/2': layout('two') })
  })
  const make = (rule: object) => {
    pf = new Pagefold({
      animationSelector: false,
      containers: ['#list', '#detail'],
      plugins: [
        new PagefoldFragment({
          rules: [{ from: '/users', to: '/user/:id', containers: ['#detail'], ...rule }],
        }),
      ],
    })
  }

  test('a rule whose if returns false is skipped', async () => {
    make({ if: (v: { to: { url: string } }) => v.to.url !== '/user/2' })
    const list = document.querySelector('#list')
    await pf.navigate('/user/2')
    expect(document.querySelector('#list')).not.toBe(list) // normal visit: every container replaced
  })

  test('scroll can be a selector or a function', async () => {
    make({ scroll: '#detail' })
    let target: string | false | undefined
    pf.hooks.before('visit:transition', (v) => {
      target = v.scroll.target
    })
    await pf.navigate('/user/1')
    expect(target).toBe('#detail')
    await pf.destroy()
    resetDom('<div id="list">users</div><div id="detail">none</div>')
    window.history.replaceState(null, '', '/users')
    make({ scroll: () => false })
    let reset: boolean | undefined
    pf.hooks.before('visit:transition', (v) => {
      reset = v.scroll.reset
    })
    await pf.navigate('/user/2')
    expect(reset).toBe(false)
  })
})
