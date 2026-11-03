import type { HookDefaultHandler, HookHandler } from '../hooks.js'
import { Plugin } from '../plugin.js'
import type { Visit } from '../visit.js'

export interface ScrollKinds {
  /** Visits to another page */
  betweenPages: boolean
  /** Links to an anchor on the same page */
  samePageWithHash: boolean
  /** Links to the page you are on */
  samePage: boolean
}

declare module '../hooks.js' {
  interface HookDefinitions {
    'scroll:start': undefined
    'scroll:end': undefined
  }
}

declare module '../pagefold.js' {
  interface Pagefold {
    /** Added by the Scroll plugin: scroll to a position or an element */
    scrollTo?: (target: number | Element, animate?: boolean) => Promise<void>
  }
}

type Offset = number | { top?: number; left?: number }

export interface Position {
  top: number
  left: number
}

/** What a custom scroll function is told about the scroll it has to make */
export interface ScrollContext {
  /** Where the page is now */
  from: Position
  duration: number
  easing: (t: number) => number
  /** Call it when the scroll is over, so the visit goes on and `scroll:end` fires */
  done: () => void
}

export interface ScrollOptions {
  /** Animate scrolling. `true` animates every kind, an object picks which. */
  animateScroll: boolean | Partial<ScrollKinds>
  /** Duration of the animation in milliseconds */
  duration: number
  /** Maps progress from 0 to 1 onto distance from 0 to 1 */
  easing: (t: number) => number
  /** Space to leave above the target, for example for a fixed header. `{ left }` does the same on the left. */
  offset: Offset | ((target: Element) => Offset)
  /**
   * Do the scrolling yourself, with GSAP for example. It gets the position to reach and a context,
   * and must call `ctx.done()` when finished. It may return a function that stops the scroll.
   * Instant jumps and reduced motion do not use it. Default: Pagefold's own animation
   */
  scrollFunction: ((to: Position, ctx: ScrollContext) => void | (() => void)) | undefined
  /** Scroll to the top right when the visit starts instead of after the content is replaced. Default: false */
  doScrollingRightAway: boolean
  /** Find the element a hash points to. Default: the element with that id, or `a[name]` */
  getAnchorElement: ((hash: string) => Element | null) | undefined
  /** Mark the element a hash points to with `data-pagefold-scroll-target`, to style it. Default: false */
  markScrollTarget: boolean
  /** Elements, other than the window, whose scroll position is reset and restored. Default: `[data-pagefold-scroll-container]` */
  scrollContainers: string
  /** Return false to restore the scroll position of the page a link goes to instead of scrolling to the top. Default: true */
  shouldResetScrollPosition: (link: Element | undefined) => boolean
  /** Jump instead of animating when the user prefers reduced motion. Default: true */
  respectReducedMotion: boolean
}

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

/** Events that mean the user took over: the animation stops. */
const INTERRUPTS = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const

/** Smooth scrolling between pages and to anchors. */
export default class PagefoldScroll extends Plugin {
  name = 'PagefoldScroll'

  options: ScrollOptions
  static defaults: ScrollOptions = {
    animateScroll: true,
    duration: 600,
    easing: easeInOutCubic,
    offset: 0,
    scrollFunction: undefined,
    doScrollingRightAway: false,
    getAnchorElement: undefined,
    markScrollTarget: false,
    scrollContainers: '[data-pagefold-scroll-container]',
    shouldResetScrollPosition: () => true,
    respectReducedMotion: true,
  }

  /** Where each page was last scrolled to, by URL: the window and each scroll container */
  private positions = new Map<string, { window: Position; containers: Map<number, Position> }>()

  private frame: number | undefined
  private stop: (() => void) | undefined

  constructor(options: Partial<ScrollOptions> = {}) {
    super()
    this.options = { ...PagefoldScroll.defaults, ...options }
  }

  override mount(): void {
    this.pagefold.hooks.create('scroll:start')
    this.pagefold.hooks.create('scroll:end')
    this.pagefold.scrollTo = (target, animate) => this.scrollTo(target, animate)
    window.addEventListener('scroll', this.remember, { capture: true, passive: true })
    this.replace('scroll:top', this.scrollTop)
    this.replace('scroll:anchor', this.scrollAnchor)
    this.on('visit:start', this.cancel)
    this.on('animation:out:start', this.scrollEarly)
    this.on('content:scroll', this.scrollContainers)
  }

  override unmount(): void {
    this.cancel()
    window.removeEventListener('scroll', this.remember, { capture: true })
    delete this.pagefold.scrollTo
    this.positions.clear()
    super.unmount()
  }

  /** Scroll to a position or an element. Resolves when the animation is over or was interrupted. */
  scrollTo(target: number | Element, animate = true): Promise<void> {
    this.cancel()
    const to = typeof target === 'number' ? { top: target, left: 0 } : this.positionOf(target)
    to.top = Math.max(0, to.top)
    to.left = Math.max(0, to.left)
    const from = { top: window.scrollY, left: window.scrollX }
    const { duration, easing, scrollFunction } = this.options
    if (!animate || duration <= 0 || (from.top === to.top && from.left === to.left)) {
      window.scrollTo({ ...to, behavior: 'instant' })
      return Promise.resolve()
    }

    this.pagefold.hooks.callSync('scroll:start', undefined, undefined)
    return new Promise((resolve) => {
      const start = performance.now()
      let over = false
      let cancelCustom: void | (() => void) = undefined
      const end = () => {
        if (over) return
        over = true
        this.pagefold.hooks.callSync('scroll:end', undefined, undefined)
        if (this.frame !== undefined) cancelAnimationFrame(this.frame)
        this.frame = undefined
        INTERRUPTS.forEach((e) => window.removeEventListener(e, end))
        this.stop = undefined
        if (typeof cancelCustom === 'function') cancelCustom()
        resolve()
      }
      const tick = (now: number) => {
        const progress = Math.min(1, Math.max(0, (now - start) / duration))
        const eased = easing(progress)
        window.scrollTo({
          top: from.top + (to.top - from.top) * eased,
          left: from.left + (to.left - from.left) * eased,
          behavior: 'instant',
        })
        if (progress < 1) this.frame = requestAnimationFrame(tick)
        else end()
      }
      INTERRUPTS.forEach((e) => window.addEventListener(e, end, { passive: true }))
      this.stop = end
      if (scrollFunction) cancelCustom = scrollFunction(to, { from, duration, easing, done: end })
      else this.frame = requestAnimationFrame(tick)
      if (over && typeof cancelCustom === 'function') cancelCustom() // done() came before it returned
    })
  }

  private cancel = (): void => this.stop?.()

  private positionOf(el: Element): Position {
    const { offset } = this.options
    const raw = typeof offset === 'function' ? offset(el) : offset
    const space = typeof raw === 'number' ? { top: raw } : raw
    const rect = el.getBoundingClientRect()
    return {
      top: rect.top + window.scrollY - (space.top ?? 0),
      // Sideways only moves when asked to, so a page that scrolls only up and down stays put
      left: 'left' in space ? rect.left + window.scrollX - (space.left ?? 0) : window.scrollX,
    }
  }

  /** Does this kind of visit animate? */
  private animates(visit: Visit, anchor: boolean): boolean {
    const { animateScroll, respectReducedMotion } = this.options
    if (respectReducedMotion && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
      return false
    if (typeof animateScroll === 'boolean') return animateScroll
    const samePage = visit.from.url === visit.to.url
    if (!samePage) return animateScroll.betweenPages ?? true
    return (anchor ? animateScroll.samePageWithHash : animateScroll.samePage) ?? true
  }

  /** Does this visit go back to a saved position instead of the top? */
  private restoring(visit: Visit): boolean {
    return visit.history.popstate || !this.options.shouldResetScrollPosition(visit.trigger.el)
  }

  /** Keep track of where each page was scrolled to, the window and the scroll containers. */
  private remember = (event: Event): void => {
    const key = this.pagefold.location.url
    let entry = this.positions.get(key)
    if (!entry) {
      entry = { window: { top: 0, left: 0 }, containers: new Map() }
      this.positions.set(key, entry)
    }
    const target = event.target
    if (target instanceof Element && target !== document.documentElement) {
      const selector = this.options.scrollContainers
      if (!target.matches(selector)) return
      const index = Array.from(document.querySelectorAll(selector)).indexOf(target)
      if (index >= 0)
        entry.containers.set(index, { top: target.scrollTop, left: target.scrollLeft })
    } else {
      entry.window = { top: window.scrollY, left: window.scrollX }
    }
  }

  private mark(anchor: Element | null): void {
    if (!this.options.markScrollTarget) return
    document.querySelectorAll('[data-pagefold-scroll-target]').forEach((el) => {
      el.removeAttribute('data-pagefold-scroll-target')
    })
    anchor?.setAttribute('data-pagefold-scroll-target', '')
  }

  /** `doScrollingRightAway`: go to the top as soon as the visit starts animating. */
  private scrollEarly: HookHandler<'animation:out:start'> = (visit) => {
    if (!this.options.doScrollingRightAway || !visit.scroll.reset || this.restoring(visit)) return
    visit.scroll.reset = false
    void this.scrollTo(0, this.animates(visit, false))
  }

  /** Scroll containers other than the window: back to the top, or to where they were. */
  private scrollContainers: HookHandler<'content:scroll'> = (visit) => {
    const containers = document.querySelectorAll<HTMLElement>(this.options.scrollContainers)
    if (!containers.length) return
    const saved = this.restoring(visit) ? this.positions.get(visit.to.url)?.containers : undefined
    containers.forEach((el, index) => {
      const position = saved?.get(index)
      if (position) {
        el.scrollTop = position.top
        el.scrollLeft = position.left
      } else if (!visit.history.popstate && visit.scroll.reset) {
        el.scrollTop = 0
        el.scrollLeft = 0
      }
    })
  }

  private scrollTop: HookDefaultHandler<'scroll:top'> = (visit, args, next) => {
    this.mark(null)
    const saved = this.restoring(visit) ? this.positions.get(visit.to.url)?.window : undefined
    if (!this.animates(visit, false)) {
      if (!saved) return next ? next(visit, args) : false
      window.scrollTo({ top: saved.top, left: saved.left, behavior: 'instant' })
      return true
    }
    void this.scrollTo(saved?.top ?? 0)
    return true
  }

  private scrollAnchor: HookDefaultHandler<'scroll:anchor'> = (visit, args, next) => {
    const { getAnchorElement } = this.options
    const anchor = getAnchorElement
      ? getAnchorElement(args.hash)
      : this.pagefold.getAnchorElement(args.hash)
    this.mark(anchor)
    if (!this.animates(visit, true)) {
      if (!getAnchorElement) return next ? next(visit, args) : false
      anchor?.scrollIntoView(args.options)
      return !!anchor
    }
    if (!anchor) return false
    void this.scrollTo(anchor)
    return true
  }
}
