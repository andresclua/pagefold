import type { HookDefaultHandler } from '../hooks.js'
import { Plugin } from '../plugin.js'
import type { Visit } from '../visit.js'
import { matchPath, type MatchOptions } from './match-path.js'

export interface AnimationSide {
  url: string
  pattern: string
  params: Record<string, string>
}

export interface AnimationData {
  visit: Visit
  direction: 'in' | 'out'
  from: AnimationSide
  to: AnimationSide
}

/**
 * Runs the animation. Call `done()` when it finishes, or return a promise.
 * A function that takes no arguments and returns nothing counts as instant.
 */
export type AnimationFn = (done: () => void, data: AnimationData) => void | Promise<void>

export interface JsAnimation {
  /** Pick this animation with `data-pagefold-animation="name"` or `navigate(url, { animation })` */
  name?: string
  /** Path patterns of the page being left. Default: any */
  from?: string | string[]
  /** Path patterns of the page being entered. Default: any */
  to?: string | string[]
  out?: AnimationFn
  in?: AnimationFn
}

export interface JsOptions {
  animations: JsAnimation[]
  /** How the path patterns are matched: `ignoreCase`, `strict` (trailing slash) and `end` */
  matchOptions: MatchOptions
}

const matchSide = (
  patterns: string | string[] | undefined,
  url: string,
  matchOptions: MatchOptions
): AnimationSide | null => {
  for (const pattern of [patterns ?? '(.*)'].flat()) {
    const params = matchPath(pattern, url, matchOptions)
    if (params) return { url, pattern, params }
  }
  return null
}

/** Run a callback-style or promise-style animation function to completion. */
function run(fn: AnimationFn, data: AnimationData): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      const result = fn(resolve, data)
      if (result && typeof result.then === 'function') result.then(() => resolve(), reject)
      else if (fn.length < 1) resolve()
    } catch (error) {
      reject(error)
    }
  })
}

/**
 * Animate in JavaScript instead of CSS: with GSAP, the Web Animations API or anything else.
 * The first animation whose `from` and `to` patterns match the visit runs.
 */
export default class PagefoldJs extends Plugin {
  name = 'PagefoldJs'

  options: JsOptions

  constructor(options: Partial<JsOptions> | JsAnimation[] = {}) {
    super()
    this.options = Array.isArray(options)
      ? { animations: options, matchOptions: {} }
      : { animations: options.animations ?? [], matchOptions: options.matchOptions ?? {} }
  }

  override mount(): void {
    this.replace('animation:out:await', this.awaitOut, { priority: -1 })
    this.replace('animation:in:await', this.awaitIn, { priority: -1 })
  }

  awaitOut: HookDefaultHandler<'animation:out:await'> = async (visit, { skip }) => {
    if (!skip) await this.runFor(visit, 'out')
  }

  awaitIn: HookDefaultHandler<'animation:in:await'> = async (visit, { skip }) => {
    if (!skip) await this.runFor(visit, 'in')
  }

  /** The animation that applies to a visit: the one with its name, else an unnamed match. */
  find(visit: Visit): { animation: JsAnimation; from: AnimationSide; to: AnimationSide } | undefined {
    const matches = this.options.animations.flatMap((animation) => {
      const from = matchSide(animation.from, visit.from.url, this.options.matchOptions)
      const to = matchSide(animation.to, visit.to.url, this.options.matchOptions)
      return from && to ? [{ animation, from, to }] : []
    })
    const name = visit.animation.name
    return (
      (name ? matches.find((m) => m.animation.name === name) : undefined) ??
      matches.find((m) => !m.animation.name)
    )
  }

  async runFor(visit: Visit, direction: 'in' | 'out'): Promise<void> {
    const found = this.find(visit)
    const fn = found?.animation[direction]
    if (!found || !fn) return
    await run(fn, { visit, direction, from: found.from, to: found.to })
  }
}
