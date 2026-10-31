import type { HookDefaultHandler } from '../hooks'
import { Plugin } from '../plugin'
import type { Visit } from '../visit'

export interface ScrollKinds {
  /** Visits to another page */
  betweenPages: boolean
  /** Links to an anchor on the same page */
  samePageWithHash: boolean
  /** Links to the page you are on */
  samePage: boolean
}

export interface ScrollOptions {
  /** Animate scrolling. `true` animates every kind, an object picks which. */
  animateScroll: boolean | Partial<ScrollKinds>
  /** Duration of the animation in milliseconds */
  duration: number
  /** Maps progress from 0 to 1 onto distance from 0 to 1 */
  easing: (t: number) => number
  /** Space to leave above the target, for example for a fixed header */
  offset: number | ((target: Element) => number)
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
    respectReducedMotion: true,
  }

  private frame: number | undefined
  private stop: (() => void) | undefined

  constructor(options: Partial<ScrollOptions> = {}) {
    super()
    this.options = { ...PagefoldScroll.defaults, ...options }
  }

  override mount(): void {
    this.replace('scroll:top', this.scrollTop)
    this.replace('scroll:anchor', this.scrollAnchor)
    this.on('visit:start', this.cancel)
  }

  override unmount(): void {
    this.cancel()
    super.unmount()
  }

  /** Scroll to a position or an element. Resolves when the animation is over or was interrupted. */
  scrollTo(target: number | Element, animate = true): Promise<void> {
    this.cancel()
    const to = Math.max(0, typeof target === 'number' ? target : this.positionOf(target))
    const from = window.scrollY
    const { duration, easing } = this.options
    if (!animate || duration <= 0 || from === to) {
      window.scrollTo({ top: to, left: 0, behavior: 'instant' })
      return Promise.resolve()
    }

    return new Promise((resolve) => {
      const start = performance.now()
      const end = () => {
        if (this.frame !== undefined) cancelAnimationFrame(this.frame)
        this.frame = undefined
        INTERRUPTS.forEach((e) => window.removeEventListener(e, end))
        this.stop = undefined
        resolve()
      }
      const tick = (now: number) => {
        const progress = Math.min(1, Math.max(0, (now - start) / duration))
        window.scrollTo({ top: from + (to - from) * easing(progress), left: 0, behavior: 'instant' })
        if (progress < 1) this.frame = requestAnimationFrame(tick)
        else end()
      }
      INTERRUPTS.forEach((e) => window.addEventListener(e, end, { passive: true }))
      this.stop = end
      this.frame = requestAnimationFrame(tick)
    })
  }

  private cancel = (): void => this.stop?.()

  private positionOf(el: Element): number {
    const { offset } = this.options
    const space = typeof offset === 'function' ? offset(el) : offset
    return el.getBoundingClientRect().top + window.scrollY - space
  }

  /** Does this kind of visit animate? */
  private animates(visit: Visit, anchor: boolean): boolean {
    const { animateScroll, respectReducedMotion } = this.options
    if (respectReducedMotion && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false
    if (typeof animateScroll === 'boolean') return animateScroll
    const samePage = visit.from.url === visit.to.url
    if (!samePage) return animateScroll.betweenPages ?? true
    return (anchor ? animateScroll.samePageWithHash : animateScroll.samePage) ?? true
  }

  private scrollTop: HookDefaultHandler<'scroll:top'> = (visit, args, next) => {
    if (!this.animates(visit, false)) return next ? next(visit, args) : false
    void this.scrollTo(0)
    return true
  }

  private scrollAnchor: HookDefaultHandler<'scroll:anchor'> = (visit, args, next) => {
    if (!this.animates(visit, true)) return next ? next(visit, args) : false
    const anchor = this.pagefold.getAnchorElement(args.hash)
    if (!anchor) return false
    void this.scrollTo(anchor)
    return true
  }
}
