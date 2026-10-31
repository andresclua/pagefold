import type { FetchOptions, PageData } from './types'
import { Visit } from './visit'

/** Arguments of every hook. Plugins add their own by augmenting this interface. */
export interface HookDefinitions {
  'animation:out:start': undefined
  'animation:out:await': { skip: boolean }
  'animation:out:end': undefined
  'animation:in:start': undefined
  'animation:in:await': { skip: boolean }
  'animation:in:end': undefined
  'animation:skip': undefined
  'cache:clear': undefined
  'cache:set': { page: PageData }
  'content:replace': { page: PageData }
  'content:scroll': undefined
  enable: undefined
  disable: undefined
  'fetch:request': { url: string; options: FetchOptions }
  'fetch:error': { url: string; status: number; response: Response }
  'fetch:timeout': { url: string }
  'history:popstate': { event: PopStateEvent }
  'link:click': { el: HTMLAnchorElement; event: MouseEvent }
  'link:self': undefined
  'link:anchor': { hash: string }
  'link:newtab': { href: string }
  'page:load': { page?: PageData; cache?: boolean; options: FetchOptions }
  'page:view': { url: string; title: string }
  'scroll:top': { options: ScrollIntoViewOptions }
  'scroll:anchor': { hash: string; options: ScrollIntoViewOptions }
  'visit:start': undefined
  'visit:transition': undefined
  'visit:abort': undefined
  'visit:end': undefined
  'visit:fail': { error: unknown }
}

/** Hooks whose default handler returns something useful. */
export interface HookReturnValues {
  'content:scroll': Promise<boolean> | boolean
  'fetch:request': Promise<Response>
  'page:load': Promise<PageData>
  'scroll:top': boolean
  'scroll:anchor': boolean
}

export type HookName = keyof HookDefinitions
export type HookArguments<T extends HookName> = HookDefinitions[T]
type HookResult<T extends HookName> = T extends keyof HookReturnValues
  ? Awaited<HookReturnValues[T]>
  : unknown

export type HookHandler<T extends HookName> = (visit: Visit, args: HookArguments<T>) => unknown

export type HookDefaultHandler<T extends HookName> = (
  visit: Visit,
  args: HookArguments<T>,
  defaultHandler?: HookDefaultHandler<T>
) => T extends keyof HookReturnValues ? HookReturnValues[T] : unknown

export type HookUnregister = () => void

export interface HookOptions {
  /** Run once, then remove the handler */
  once?: boolean
  /** Run before the default handler */
  before?: boolean
  /** Lower numbers run first. Default: 0 */
  priority?: number
  /** Replace the default handler */
  replace?: boolean
}

type Modifier = 'once' | 'before' | 'replace'

/** Handlers can be registered with a modifier suffix: `'content:replace.before'`. */
export type HookInitOptions = {
  [K in HookName as K | `${K}.${Modifier}` | `${K}.${Modifier}.${Modifier}`]: HookHandler<K>
}

// Typed as a Record so the compiler fails when a hook is added to HookDefinitions but not here.
const hookNames: Record<HookName, true> = {
  'animation:out:start': true,
  'animation:out:await': true,
  'animation:out:end': true,
  'animation:in:start': true,
  'animation:in:await': true,
  'animation:in:end': true,
  'animation:skip': true,
  'cache:clear': true,
  'cache:set': true,
  'content:replace': true,
  'content:scroll': true,
  enable: true,
  disable: true,
  'fetch:request': true,
  'fetch:error': true,
  'fetch:timeout': true,
  'history:popstate': true,
  'link:click': true,
  'link:self': true,
  'link:anchor': true,
  'link:newtab': true,
  'page:load': true,
  'page:view': true,
  'scroll:top': true,
  'scroll:anchor': true,
  'visit:start': true,
  'visit:transition': true,
  'visit:abort': true,
  'visit:end': true,
  'visit:fail': true,
}

type AnyHandler = (visit: Visit, args: unknown, next?: AnyHandler) => unknown

interface Registration extends HookOptions {
  id: number
  handler: AnyHandler
}

export class Hooks {
  private registry = new Map<string, Registration[]>()
  private nextId = 0

  /** `owner.visit` is the fallback when a call does not pass a visit. */
  constructor(private owner: { visit: Visit }) {
    Object.keys(hookNames).forEach((name) => this.create(name))
  }

  /** Create a custom hook (used by plugins). */
  create(hook: string): void {
    if (!this.registry.has(hook)) this.registry.set(hook, [])
  }

  exists(hook: string): boolean {
    return this.registry.has(hook)
  }

  on<T extends HookName>(
    hook: T,
    handler: HookHandler<T>,
    options: HookOptions = {}
  ): HookUnregister {
    const list = this.registry.get(hook)
    if (!list) {
      console.warn(`[pagefold] Unknown hook '${hook}'`)
      return () => {}
    }
    const registration: Registration = {
      ...options,
      id: ++this.nextId,
      handler: handler as AnyHandler,
    }
    list.push(registration)
    return () => this.remove(hook, registration)
  }

  before<T extends HookName>(hook: T, handler: HookHandler<T>, options: HookOptions = {}) {
    return this.on(hook, handler, { ...options, before: true })
  }

  once<T extends HookName>(hook: T, handler: HookHandler<T>, options: HookOptions = {}) {
    return this.on(hook, handler, { ...options, once: true })
  }

  replace<T extends HookName>(hook: T, handler: HookDefaultHandler<T>, options: HookOptions = {}) {
    return this.on(hook, handler, { ...options, replace: true })
  }

  /** Remove one handler, or every handler of the hook when none is given. */
  off<T extends HookName>(hook: T, handler?: HookHandler<T> | HookDefaultHandler<T>): void {
    const list = this.registry.get(hook)
    if (!list) return
    this.registry.set(
      hook,
      handler ? list.filter((r) => r.handler !== (handler as AnyHandler)) : []
    )
  }

  clear(): void {
    this.registry.forEach((_, hook) => this.registry.set(hook, []))
  }

  /** Split `'content:replace.before.once'` into the hook name and its options. */
  parseName(name: string): [HookName, HookOptions] {
    const [hook, ...mods] = name.split('.')
    const options: HookOptions = {}
    for (const m of mods) {
      if (m === 'once' || m === 'before' || m === 'replace') options[m] = true
    }
    return [hook as HookName, options]
  }

  /**
   * Run a hook: `before` handlers, then the default handler (or the `replace`
   * handler that stands in for it), then the remaining handlers. Awaits each step.
   */
  call<T extends HookName>(
    hook: T,
    visit: Visit | undefined,
    args?: HookArguments<T>,
    defaultHandler?: HookDefaultHandler<T>
  ): Promise<HookResult<T>>
  call<T extends HookName>(
    hook: T,
    args: HookArguments<T>,
    defaultHandler?: HookDefaultHandler<T>
  ): Promise<HookResult<T>>
  async call(hook: HookName, ...rest: unknown[]): Promise<unknown> {
    const { visit, args, run, plan } = this.prepare(hook, rest)
    for (const r of plan.before) await run(r)
    const result = await plan.main(visit, args)
    for (const r of plan.after) await run(r)
    return result
  }

  /** Same as `call`, but never awaits. Handlers that return promises are not waited for. */
  callSync<T extends HookName>(
    hook: T,
    visit: Visit | undefined,
    args?: HookArguments<T>,
    defaultHandler?: HookDefaultHandler<T>
  ): HookResult<T>
  callSync<T extends HookName>(
    hook: T,
    args: HookArguments<T>,
    defaultHandler?: HookDefaultHandler<T>
  ): HookResult<T>
  callSync(hook: HookName, ...rest: unknown[]): unknown {
    const { visit, args, run, plan } = this.prepare(hook, rest)
    plan.before.forEach((r) => run(r))
    const result = plan.main(visit, args)
    plan.after.forEach((r) => run(r))
    return result
  }

  private remove(hook: string, registration: Registration): void {
    const list = this.registry.get(hook)
    if (list) this.registry.set(hook, list.filter((r) => r !== registration))
  }

  private prepare(hook: HookName, rest: unknown[]) {
    let [visit, args, def] = rest as [unknown, unknown, unknown]
    // Shorthand without a visit: call(hook, args, default)
    if (visit !== undefined && !(visit instanceof Visit)) [visit, args, def] = [undefined, visit, args]
    const v = (visit as Visit | undefined) ?? this.owner.visit

    const regs = [...(this.registry.get(hook) ?? [])].sort(
      (a, b) => (a.priority ?? 0) - (b.priority ?? 0) || a.id - b.id
    )
    const replace = regs.filter((r) => r.replace)
    const run = (r: Registration) => {
      if (r.once) this.remove(hook, r)
      return r.handler(v, args)
    }
    // Each replace handler receives the next one as its `defaultHandler`; the last one gets the real default.
    const main = replace.reduceRight<AnyHandler>(
      (next, r) => (vis, a) => {
        if (r.once) this.remove(hook, r)
        return r.handler(vis, a, next)
      },
      (typeof def === 'function' ? def : () => undefined) as AnyHandler
    )
    const plan = {
      before: regs.filter((r) => r.before && !r.replace),
      after: regs.filter((r) => !r.before && !r.replace),
      main,
    }
    return { visit: v, args, run, plan }
  }
}
