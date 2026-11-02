import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import Pagefold from '../../src/index'

let pagefold: Pagefold
beforeEach(() => {
  document.body.innerHTML = '<div id="pagefold"><div data-slider></div></div>'
  pagefold = new Pagefold()
})
afterEach(() => pagefold.destroy())

const swap = (html: string) => {
  document.querySelector('#pagefold')!.innerHTML = html
  void pagefold.hooks.call('content:replace', undefined, { page: undefined } as never)
}

test('sets up the elements already on the page', () => {
  const setup = vi.fn()
  pagefold.mount('[data-slider]', setup)
  expect(setup).toHaveBeenCalledTimes(1)
})

test('cleans up what left and sets up what arrived, once each', async () => {
  const cleanup = vi.fn()
  const setup = vi.fn(() => cleanup)
  pagefold.mount('[data-slider]', setup)
  swap('<div data-slider></div><div data-slider></div>')
  await Promise.resolve()
  expect(cleanup).toHaveBeenCalledTimes(1)
  expect(setup).toHaveBeenCalledTimes(3)
  swap('<p>none</p>')
  await Promise.resolve()
  expect(cleanup).toHaveBeenCalledTimes(3)
})

test('the returned function stops it and cleans up', () => {
  const cleanup = vi.fn()
  const stop = pagefold.mount('[data-slider]', () => cleanup)
  stop()
  expect(cleanup).toHaveBeenCalledTimes(1)
  const setup = vi.fn()
  pagefold.mount('[data-slider]', setup)
  stop()
  expect(setup).toHaveBeenCalledTimes(1)
})

test('destroy cleans up everything', async () => {
  const cleanup = vi.fn()
  pagefold.mount('[data-slider]', () => cleanup)
  await pagefold.destroy()
  expect(cleanup).toHaveBeenCalledTimes(1)
})

test('a component that throws does not stop the others or get retried', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  document.body.innerHTML = '<div id="pagefold"><i data-x></i><i data-x></i></div>'
  const setup = vi.fn((el: Element) => {
    if (!el.previousElementSibling) throw new Error('boom')
  })
  pagefold.mount('[data-x]', setup)
  void pagefold.hooks.call('visit:end', undefined, undefined as never)
  expect(setup).toHaveBeenCalledTimes(2)
  expect(error).toHaveBeenCalledTimes(1)
  error.mockRestore()
})
