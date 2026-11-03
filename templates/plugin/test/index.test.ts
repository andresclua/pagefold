import { afterEach, expect, test, vi } from 'vitest'
import { Pagefold } from 'pagefold'
import ExamplePlugin from '../src/index'

let pagefold: Pagefold

afterEach(() => pagefold.destroy())

test('marks the page as busy during a visit', async () => {
  document.body.innerHTML = '<div id="pagefold">home</div>'
  window.scrollTo = vi.fn() // jsdom does not implement it
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const res = new Response('<html><body><div id="pagefold">next</div></body></html>')
      Object.defineProperty(res, 'url', { value: new URL(url, location.href).href })
      return res
    })
  )
  pagefold = new Pagefold({ animationSelector: false, plugins: [new ExamplePlugin()] })

  const seen: boolean[] = []
  pagefold.hooks.on('content:replace', () => {
    seen.push(document.documentElement.classList.contains('is-busy'))
  })
  await pagefold.navigate('/next')

  expect(seen).toEqual([true])
  expect(document.documentElement.classList.contains('is-busy')).toBe(false)
})
