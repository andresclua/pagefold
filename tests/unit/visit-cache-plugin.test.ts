import { afterEach, describe, expect, test, vi } from 'vitest'
import { Cache } from '../../src/cache'
import { Pagefold } from '../../src/pagefold'
import { Plugin, satisfies } from '../../src/plugin'
import { Visit, VisitState } from '../../src/visit'

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

describe('Visit', () => {
  test('starts created, with defaults taken from the options', () => {
    const v = new Visit(ctx, { to: '/a', hash: '#x' })
    expect(v.state).toBe(VisitState.CREATED)
    expect(v.from.url).toBe('/')
    expect(v.to).toEqual({ url: '/a', hash: '#x' })
    expect(v.cache).toEqual({ read: true, write: true })
    expect(v.containers).toEqual(['#app'])
  })

  test('ids are unique', () => {
    expect(new Visit(ctx, { to: '/a' }).id).not.toBe(new Visit(ctx, { to: '/a' }).id)
  })

  test('advance never goes backwards', () => {
    const v = new Visit(ctx, { to: '/a' })
    v.advance(VisitState.ENTERING)
    v.advance(VisitState.STARTED)
    expect(v.state).toBe(VisitState.ENTERING)
    expect(v.done).toBe(false)
  })

  test('abort cancels the request signal and finishes the visit', () => {
    const v = new Visit(ctx, { to: '/a' })
    v.abort()
    expect(v.controller.signal.aborted).toBe(true)
    expect(v.done).toBe(true)
  })

  test('ignore marks the visit for the browser', () => {
    const v = new Visit(ctx, { to: '/a' })
    v.ignore()
    expect(v.ignored && v.done).toBe(true)
  })
})

describe('Cache', () => {
  const page = (url: string) => ({ url, html: `<p>${url}</p>` })

  test('stores and returns copies', () => {
    const cache = new Cache()
    cache.set('/a', page('/a'))
    const got = cache.get('/a')!
    got.html = 'changed'
    expect(cache.get('/a')?.html).toBe('<p>/a</p>')
    expect(cache.has('/b')).toBe(false)
  })

  test('max drops the least recently used page', () => {
    const cache = new Cache({ max: 2 })
    cache.set('/a', page('/a'))
    cache.set('/b', page('/b'))
    cache.get('/a') // /b is now the oldest
    cache.set('/c', page('/c'))
    expect(cache.has('/b')).toBe(false)
    expect(cache.has('/a') && cache.has('/c')).toBe(true)
  })

  test('ttl expires pages', () => {
    vi.useFakeTimers()
    const cache = new Cache({ ttl: 1000 })
    cache.set('/a', page('/a'))
    vi.advanceTimersByTime(1001)
    expect(cache.has('/a')).toBe(false)
    vi.useRealTimers()
  })

  test('is unbounded by default and prune/clear work', () => {
    const onChange = vi.fn()
    const cache = new Cache({}, (u) => u, onChange)
    for (let i = 0; i < 50; i++) cache.set(`/p${i}`, page(`/p${i}`))
    expect(cache.size).toBe(50)
    cache.prune((url) => url.endsWith('0'))
    expect(cache.size).toBe(45)
    cache.clear()
    expect(cache.size).toBe(0)
    expect(onChange).toHaveBeenLastCalledWith('clear')
  })
})

describe('Plugin', () => {
  class Demo extends Plugin {
    name = 'Demo'
    requires = { pagefold: '>=1.2' }
    calls = 0
    override mount() {
      this.on('visit:end', () => {
        this.calls++
      })
    }
  }
  const hosts: Pagefold[] = []
  const host = (version: string) => {
    const instance = Object.assign(new Pagefold(), { version })
    hosts.push(instance)
    return instance
  }
  afterEach(async () => {
    await Promise.all(hosts.splice(0).map((h) => h.destroy()))
  })

  test('hooks registered with this.on are removed on unmount', async () => {
    const plugin = new Demo()
    const h = host('1.2.0')
    plugin.pagefold = h
    plugin.mount()
    await h.hooks.call('visit:end', undefined)
    plugin.unmount()
    await h.hooks.call('visit:end', undefined)
    expect(plugin.calls).toBe(1)
  })

  test('handlers are bound to the plugin', async () => {
    class Bound extends Plugin {
      name = 'Bound'
      seen: unknown
      override mount() {
        this.on('visit:end', function (this: Bound) {
          this.seen = this
        })
      }
    }
    const plugin = new Bound()
    plugin.pagefold = host('1.0.0')
    plugin.mount()
    await plugin.pagefold.hooks.call('visit:end', undefined)
    expect(plugin.seen).toBe(plugin)
  })

  test('requirements are checked against the host version', () => {
    const plugin = new Demo()
    plugin.pagefold = host('1.1.9')
    expect(() => plugin._checkRequirements()).toThrow('requires pagefold >=1.2')
    plugin.pagefold = host('1.2.0')
    expect(() => plugin._checkRequirements()).not.toThrow()
  })

  test('satisfies handles >= ranges', () => {
    expect(satisfies('4.6.0', '>=4')).toBe(true)
    expect(satisfies('3.9.9', '>=4')).toBe(false)
    expect(satisfies('1.2.3', '>=1.2.4')).toBe(false)
    expect(satisfies('1.0.0', '^1')).toBe(false)
  })
})

test('cache.all lists every stored page and is a copy', async () => {
  const { Cache } = await import('../../src/cache')
  const cache = new Cache()
  cache.set('/a', { url: '/a', html: 'A' })
  cache.set('/b', { url: '/b', html: 'B' })
  const all = cache.all
  expect([...all.keys()]).toEqual(['/a', '/b'])
  all.delete('/a')
  expect(cache.has('/a')).toBe(true)
})
