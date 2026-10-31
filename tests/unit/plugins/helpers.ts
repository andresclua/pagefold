import { vi } from 'vitest'

export const page = (head: string, body: string, htmlAttrs = '') =>
  `<html ${htmlAttrs}><head>${head}</head><body><div id="pagefold">${body}</div></body></html>`

/** A Response that knows its URL, like a real fetch response. */
export const respond = (path: string, body: string, status = 200): Response => {
  const res = new Response(body, { status })
  Object.defineProperty(res, 'url', { value: new URL(path, window.location.href).href })
  return res
}

/** Serve pages by path from a plain object. */
export const stubFetch = (pages: Record<string, string>) => {
  const mock = vi.fn((url: string, _init?: RequestInit) =>
    Promise.resolve(
      pages[url] !== undefined ? respond(url, pages[url]) : respond(url, 'not found', 404)
    )
  )
  vi.stubGlobal('fetch', mock)
  return mock
}

export const resetDom = (body = '<div id="pagefold">home</div>') => {
  document.head.innerHTML = '<title>Home</title>'
  document.documentElement.removeAttribute('lang')
  document.body.innerHTML = body
  window.history.replaceState(null, '', '/')
  window.scrollTo = vi.fn()
}
