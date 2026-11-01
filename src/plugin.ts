import type { HookDefaultHandler, HookHandler, HookName, HookOptions, HookUnregister } from './hooks.js'
import type { Pagefold } from './pagefold.js'

/** Does `version` satisfy a `>=x.y.z` requirement? Other range types are not supported yet. */
export function satisfies(version: string, range: string): boolean {
  const m = /^>=\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(range.trim())
  if (!m) return false
  const want = [m[1], m[2] ?? '0', m[3] ?? '0'].map(Number)
  const have = version.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const h = have[i] ?? 0
    if (h !== want[i]) return h > want[i]
  }
  return true
}

/**
 * Base class for plugins. Extend it, set a `name`, and register hooks in `mount()`
 * with `this.on()`: they are removed automatically on `unmount()`.
 */
export abstract class Plugin {
  abstract name: string
  readonly isPagefoldPlugin = true
  /** The instance that mounted this plugin, set before `mount()` */
  pagefold!: Pagefold
  version?: string
  /** Version requirements, e.g. `{ pagefold: '>=1' }` */
  requires: Record<string, string> = {}

  private unregisters: HookUnregister[] = []

  mount(): void {}

  unmount(): void {
    this.unregisters.forEach((u) => u())
    this.unregisters = []
  }

  /** Called by the host before `mount()`. */
  _beforeMount(): void {
    if (!this.name) throw new Error('A plugin needs a name')
  }

  /** Called by the host before `mount()`. Throws when a requirement is not met. */
  _checkRequirements(): void {
    for (const [dep, range] of Object.entries(this.requires)) {
      if (dep === 'pagefold' && !satisfies(this.pagefold.version, range)) {
        throw new Error(`Plugin version mismatch: ${this.name} requires pagefold ${range}`)
      }
    }
  }

  protected on<T extends HookName>(hook: T, handler: HookHandler<T>, options: HookOptions = {}) {
    const unregister = this.pagefold.hooks.on(hook, handler.bind(this), options)
    this.unregisters.push(unregister)
    return unregister
  }

  protected once<T extends HookName>(hook: T, handler: HookHandler<T>, options: HookOptions = {}) {
    return this.on(hook, handler, { ...options, once: true })
  }

  protected before<T extends HookName>(hook: T, handler: HookHandler<T>, options: HookOptions = {}) {
    return this.on(hook, handler, { ...options, before: true })
  }

  protected replace<T extends HookName>(
    hook: T,
    handler: HookDefaultHandler<T>,
    options: HookOptions = {}
  ) {
    const unregister = this.pagefold.hooks.on(hook, handler.bind(this), {
      ...options,
      replace: true,
    })
    this.unregisters.push(unregister)
    return unregister
  }
}
