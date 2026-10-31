import { expect, test } from 'vitest'
import Pagefold from '../../src/index'

test('default export is constructible', () => {
  expect(new Pagefold()).toBeInstanceOf(Pagefold)
})
