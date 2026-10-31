import { describe, expect, test, vi } from 'vitest'
import { Hooks } from '../../src/hooks'
import { Visit } from '../../src/visit'

const ctx = {
  location: { url: '/', hash: '' },
  options: {
    containers: ['#app'],
    native: false,
    animationScope: 'html' as const,
    animationSelector: false as const,
    cache: true,
  },
}
const setup = () => {
  const owner = { visit: new Visit(ctx, { to: '/a' }) }
  return { owner, hooks: new Hooks(owner) }
}

describe('Hooks', () => {
  test('runs before handlers, default handler, then after handlers', async () => {
    const { hooks } = setup()
    const order: string[] = []
    hooks.on('visit:end', () => order.push('after'))
    hooks.before('visit:end', () => order.push('before'))
    await hooks.call('visit:end', undefined, undefined, () => order.push('default'))
    expect(order).toEqual(['before', 'default', 'after'])
  })

  test('priority orders handlers, lower first', async () => {
    const { hooks } = setup()
    const order: number[] = []
    hooks.on('visit:end', () => order.push(2), { priority: 2 })
    hooks.on('visit:end', () => order.push(-1), { priority: -1 })
    hooks.on('visit:end', () => order.push(0))
    await hooks.call('visit:end', undefined)
    expect(order).toEqual([-1, 0, 2])
  })

  test('awaits async handlers in sequence', async () => {
    const { hooks } = setup()
    const order: string[] = []
    hooks.on('visit:end', async () => {
      await new Promise((r) => setTimeout(r, 10))
      order.push('slow')
    })
    hooks.on('visit:end', () => order.push('fast'))
    await hooks.call('visit:end', undefined)
    expect(order).toEqual(['slow', 'fast'])
  })

  test('replace skips the default handler and can still call it', async () => {
    const { hooks } = setup()
    const def = vi.fn(() => true)
    hooks.replace('scroll:top', () => false)
    expect(await hooks.call('scroll:top', undefined, { options: {} }, def)).toBe(false)
    expect(def).not.toHaveBeenCalled()

    const h2 = setup().hooks
    h2.replace('scroll:top', (_v, _a, next) => next!(_v, _a))
    expect(await h2.call('scroll:top', undefined, { options: {} }, () => true)).toBe(true)
  })

  test('once runs a single time', async () => {
    const { hooks } = setup()
    const fn = vi.fn()
    hooks.once('visit:end', fn)
    await hooks.call('visit:end', undefined)
    await hooks.call('visit:end', undefined)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('on returns an unregister function and off removes handlers', async () => {
    const { hooks } = setup()
    const a = vi.fn()
    const b = vi.fn()
    const unregister = hooks.on('visit:end', a)
    hooks.on('visit:end', b)
    unregister()
    await hooks.call('visit:end', undefined)
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)
    hooks.off('visit:end')
    await hooks.call('visit:end', undefined)
    expect(b).toHaveBeenCalledTimes(1)
  })

  test('passes the visit, falling back to the owner visit, and shares args', async () => {
    const { hooks, owner } = setup()
    const seen: Visit[] = []
    hooks.on('animation:out:await', (visit, args) => {
      seen.push(visit)
      args.skip = true
    })
    const args = { skip: false }
    await hooks.call('animation:out:await', undefined, args)
    expect(seen[0]).toBe(owner.visit)
    expect(args.skip).toBe(true)
  })

  test('supports the call without a visit', async () => {
    const { hooks } = setup()
    const fn = vi.fn()
    hooks.on('link:anchor', fn)
    await hooks.call('link:anchor', { hash: '#x' })
    expect(fn.mock.calls[0]?.[1]).toEqual({ hash: '#x' })
  })

  test('callSync runs everything without awaiting', () => {
    const { hooks } = setup()
    const order: string[] = []
    hooks.on('scroll:top', () => order.push('after'))
    const result = hooks.callSync('scroll:top', undefined, { options: {} }, () => {
      order.push('default')
      return true
    })
    expect(result).toBe(true)
    expect(order).toEqual(['default', 'after'])
  })

  test('a handler error rejects the call', async () => {
    const { hooks } = setup()
    hooks.on('visit:end', () => {
      throw new Error('boom')
    })
    await expect(hooks.call('visit:end', undefined)).rejects.toThrow('boom')
  })

  test('custom hooks can be created and parseName reads modifiers', () => {
    const { hooks } = setup()
    expect(hooks.exists('content:insert')).toBe(false)
    hooks.create('content:insert')
    expect(hooks.exists('content:insert')).toBe(true)
    expect(hooks.parseName('content:replace.before.once')).toEqual([
      'content:replace',
      { before: true, once: true },
    ])
  })
})
