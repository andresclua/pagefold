import { afterEach, beforeEach, describe, expect, test, vi, type Mock } from 'vitest'
import { Pagefold } from '../../src/pagefold'
import { VisitState } from '../../src/visit'

const html = (title: string, body: string) =>
  `<html><head><title>${title}</title></head><body><div id="pagefold">${body}</div></body></html>`

/** A Response that knows its URL, like a real fetch response. */
const respond = (path: string, body: string, status = 200): Response => {
  const res = new Response(body, { status })
  Object.defineProperty(res, 'url', { value: new URL(path, window.location.href).href })
  return res
}

let pf: Pagefold
let pages: Record<string, { body: string; status?: number }>
let fetchMock: Mock<(url: string, init?: RequestInit) => Promise<Response>>

const make = (options: ConstructorParameters<typeof Pagefold>[0] = {}) => {
  pf = new Pagefold({ containers: ['#pagefold'], animationSelector: false, ...options })
  return pf
}

beforeEach(() => {
  document.title = 'Home'
  document.body.innerHTML = '<div id="pagefold"><a id="link" href="/a">to a</a></div>'
  window.history.replaceState(null, '', '/')
  window.scrollTo = vi.fn()
  pages = {
    '/a': { body: html('Page A', 'content a') },
    '/b': { body: html('Page B', 'content b') },
  }
  fetchMock = vi.fn((url: string, _init?: RequestInit) => {
    const page = pages[url]
    return Promise.resolve(page ? respond(url, page.body, page.status) : respond(url, 'nope', 404))
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(async () => {
  await pf.destroy()
  vi.unstubAllGlobals()
})

const content = () => document.querySelector('#pagefold')?.textContent

describe('navigate', () => {
  test('loads the page, replaces the content and title, and adds a history entry', async () => {
    make()
    const order: string[] = []
    for (const hook of [
      'visit:start',
      'page:load',
      'content:replace',
      'page:view',
      'visit:end',
    ] as const) {
      pf.hooks.on(hook, () => order.push(hook))
    }
    await pf.navigate('/a')
    expect(content()).toBe('content a')
    expect(document.title).toBe('Page A')
    expect(window.location.pathname).toBe('/a')
    expect(pf.visit.state).toBe(VisitState.COMPLETED)
    expect(order).toEqual(['visit:start', 'page:load', 'content:replace', 'page:view', 'visit:end'])
  })

  test('uses the cache on a second visit', async () => {
    make()
    await pf.navigate('/a')
    await pf.navigate('/b')
    await pf.navigate('/a')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(content()).toBe('content a')
  })

  test('cache: false skips reading and writing', async () => {
    make()
    await pf.navigate('/a', { cache: false })
    await pf.navigate('/a', { cache: false })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(pf.cache.size).toBe(0)
  })

  test('a new visit cancels the request of the one still loading', async () => {
    make()
    let firstSignal: AbortSignal | undefined
    fetchMock.mockImplementationOnce(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          firstSignal = init?.signal ?? undefined
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError'))
          )
        })
    )
    const first = pf.navigate('/a')
    await Promise.resolve()
    const firstVisit = pf.visit
    await pf.navigate('/b')
    await first
    expect(firstSignal?.aborted).toBe(true)
    expect(firstVisit.state).toBe(VisitState.ABORTED)
    expect(content()).toBe('content b')
  })

  test('a visit that is already rendering finishes before the next one runs', async () => {
    make()
    let release!: () => void
    pf.hooks.replace('animation:in:await', () => new Promise<void>((r) => (release = r)), {
      once: true,
    })
    const first = pf.navigate('/a')
    // wait until the first visit has rendered and is waiting on its in-animation
    await vi.waitFor(() => expect(pf.visit.state).toBe(VisitState.ENTERING))
    expect(content()).toBe('content a')
    const second = pf.navigate('/b')
    await second
    expect(content()).toBe('content a') // queued, not started yet
    release()
    await first
    await vi.waitFor(() => expect(content()).toBe('content b'))
  })

  test('failOnStatus decides what counts as a failed visit', async () => {
    make({ failOnStatus: (s) => s >= 400 })
    const failed = vi.fn()
    pf.hooks.replace('visit:fail', (_v, { error }) => failed(error))
    await pf.navigate('/missing')
    expect(failed).toHaveBeenCalledTimes(1)
    expect(pf.visit.state).toBe(VisitState.FAILED)
  })

  test('by default only 500 fails; a 404 page is rendered', async () => {
    make()
    pages['/gone'] = { body: html('Gone', 'not found page'), status: 404 }
    await pf.navigate('/gone')
    expect(content()).toBe('not found page')

    pages['/boom'] = { body: html('Boom', 'x'), status: 500 }
    const failed = vi.fn()
    pf.hooks.replace('visit:fail', (_v, { error }) => failed(error))
    await pf.navigate('/boom')
    expect(failed).toHaveBeenCalledTimes(1)
  })

  test('elements with data-pagefold-persist survive the replacement', async () => {
    make()
    pages['/a'] = {
      body: html('A', '<div data-pagefold-persist="player">new player</div>content a'),
    }
    document.querySelector('#pagefold')!.innerHTML =
      '<div data-pagefold-persist="player" id="orig">old player</div>'
    const original = document.querySelector('#orig')
    await pf.navigate('/a')
    expect(document.querySelector('[data-pagefold-persist="player"]')).toBe(original)
  })
})

describe('links', () => {
  /** Dispatch a click and report whether Pagefold took it over (prevented the browser default). */
  const click = (el: Element, init: MouseEventInit = {}): boolean => {
    let handled = false
    const probe = (e: Event) => {
      handled = e.defaultPrevented
      e.preventDefault() // keep jsdom from trying a real navigation
    }
    window.addEventListener('click', probe)
    el.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init })
    )
    window.removeEventListener('click', probe)
    return handled
  }

  test('a click on a link navigates without a page load', async () => {
    make()
    expect(click(document.querySelector('#link')!)).toBe(true)
    await vi.waitFor(() => expect(content()).toBe('content a'))
  })

  test('modifier keys, new-tab and cross-origin links are left to the browser', () => {
    make()
    const link = document.querySelector<HTMLAnchorElement>('#link')!
    const newTab = vi.fn()
    pf.hooks.on('link:newtab', newTab)
    expect(click(link, { metaKey: true })).toBe(false)
    expect(newTab).toHaveBeenCalledTimes(1)

    link.target = '_blank'
    expect(click(link)).toBe(false)
    link.removeAttribute('target')

    link.href = 'https://elsewhere.test/x'
    expect(click(link)).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('data-no-pagefold opts a link out', () => {
    make()
    const link = document.querySelector('#link')!
    link.setAttribute('data-no-pagefold', '')
    expect(click(link)).toBe(false)
  })
})

describe('lifecycle', () => {
  test('destroy stops handling clicks and removes the class', async () => {
    make()
    await pf.destroy()
    let prevented = true
    const probe = (e: Event) => {
      prevented = e.defaultPrevented
      e.preventDefault()
    }
    window.addEventListener('click', probe)
    document
      .querySelector('#link')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    window.removeEventListener('click', probe)
    expect(prevented).toBe(false)
    expect(document.documentElement.classList.contains('pagefold-enabled')).toBe(false)
  })

  test('enable adds the class to the html element', async () => {
    make()
    await vi.waitFor(() =>
      expect(document.documentElement.classList.contains('pagefold-enabled')).toBe(true)
    )
  })
})
