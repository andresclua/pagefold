import type { HookHandler } from '../hooks'
import { Location } from '../location'
import { Plugin } from '../plugin'
import type { PageData } from '../types'

declare module '../hooks' {
  interface HookDefinitions {
    'page:preload': { page: PageData }
  }
}

export interface VisibleLinksOptions {
  enabled: boolean
  /** How much of a link must be on screen, from 0 to 1 */
  threshold: number
  /** How long a link must stay visible before it is preloaded, in milliseconds */
  delay: number
  /** Where to look for links */
  containers: string[]
  /** Return true to skip a link */
  ignore: (el: HTMLAnchorElement) => boolean
}

export interface PreloadOptions {
  /** Maximum number of simultaneous requests */
  throttle: number
  /** Fetch the page you are on, so going back to it is instant */
  preloadInitialPage: boolean
  /** Preload when a link is hovered, touched or focused */
  preloadHoveredLinks: boolean
  /** How long the pointer must rest on a link before it is preloaded, in milliseconds */
  hoverDelay: number
  /** Preload links that scroll into view */
  preloadVisibleLinks: boolean | Partial<VisibleLinksOptions>
  /** Return true to never preload a link */
  ignore: (el: HTMLAnchorElement) => boolean
  /** Do nothing on slow connections or when the user asked to save data */
  respectConnection: boolean
}

type Target = string | HTMLAnchorElement

interface Connection {
  saveData?: boolean
  effectiveType?: string
}

const constrained = (): boolean => {
  const c = (navigator as Navigator & { connection?: Connection }).connection
  return !!c && (!!c.saveData || c.effectiveType === 'slow-2g' || c.effectiveType === '2g')
}

/**
 * Fetch pages before they are visited so navigation feels instant. A navigation that starts
 * while its page is still being preloaded waits for that request instead of repeating it.
 */
export default class PagefoldPreload extends Plugin {
  name = 'PagefoldPreload'

  options: Omit<PreloadOptions, 'preloadVisibleLinks'> & { preloadVisibleLinks: VisibleLinksOptions }
  static defaults: PreloadOptions = {
    throttle: 5,
    preloadInitialPage: true,
    preloadHoveredLinks: true,
    hoverDelay: 65,
    preloadVisibleLinks: false,
    ignore: () => false,
    respectConnection: true,
  }
  static visibleDefaults: VisibleLinksOptions = {
    enabled: false,
    threshold: 0.2,
    delay: 500,
    containers: ['body'],
    ignore: () => false,
  }

  private inflight = new Map<string, Promise<PageData | undefined>>()
  private active = 0
  private queue: { run: () => void; skip: () => void }[] = []
  private hoverTimers = new Map<Element, ReturnType<typeof setTimeout>>()
  private visibleTimers = new Map<Element, ReturnType<typeof setTimeout>>()
  private observer: IntersectionObserver | undefined

  constructor(options: Partial<PreloadOptions> = {}) {
    super()
    const { preloadVisibleLinks, ...rest } = { ...PagefoldPreload.defaults, ...options }
    const visible =
      typeof preloadVisibleLinks === 'boolean' ? { enabled: preloadVisibleLinks } : { enabled: true, ...preloadVisibleLinks }
    this.options = { ...rest, preloadVisibleLinks: { ...PagefoldPreload.visibleDefaults, ...visible } }
  }

  override mount(): void {
    this.pagefold.hooks.create('page:preload')
    this.before('page:load', this.waitForPreload)

    if (this.options.preloadHoveredLinks) {
      document.addEventListener('mouseover', this.onHover)
      document.addEventListener('mouseout', this.onLeave)
      document.addEventListener('touchstart', this.onTouch, { passive: true })
      document.addEventListener('focusin', this.onTouch)
    }

    if (this.options.preloadVisibleLinks.enabled) {
      this.observeVisibleLinks()
      this.on('page:view', this.observeVisibleLinks)
    }

    if (this.options.preloadInitialPage) {
      const start = () => void this.preload(this.pagefold.location.url, { current: true })
      if (document.readyState === 'complete') start()
      else window.addEventListener('load', start, { once: true })
    }
  }

  override unmount(): void {
    document.removeEventListener('mouseover', this.onHover)
    document.removeEventListener('mouseout', this.onLeave)
    document.removeEventListener('touchstart', this.onTouch)
    document.removeEventListener('focusin', this.onTouch)
    this.observer?.disconnect()
    this.observer = undefined
    ;[...this.hoverTimers.values(), ...this.visibleTimers.values()].forEach(clearTimeout)
    this.hoverTimers.clear()
    this.visibleTimers.clear()
    this.queue.splice(0).forEach((item) => item.skip())
    super.unmount()
  }

  /**
   * Preload a URL or a link. Resolves with the page, or undefined when it was skipped
   * (ignored link, already cached, slow connection) or failed.
   */
  preload(target: Target, options?: { priority?: boolean; current?: boolean }): Promise<PageData | undefined>
  preload(target: Target[], options?: { priority?: boolean }): Promise<(PageData | undefined)[]>
  preload(target: Target | Target[], options: { priority?: boolean; current?: boolean } = {}) {
    if (Array.isArray(target)) return Promise.all(target.map((t) => this.preload(t, options)))

    const el = typeof target === 'string' ? undefined : target
    const location = typeof target === 'string' ? Location.fromUrl(target) : Location.fromElement(target)
    if (!this.allowed(location, el, options.current ?? false)) return Promise.resolve(undefined)

    const key = this.key(location.url)
    const pending = this.inflight.get(key)
    if (pending) return pending

    const promise = this.schedule(() => this.load(location.url), options.priority).finally(() =>
      this.inflight.delete(key)
    )
    this.inflight.set(key, promise)
    return promise
  }

  /** Preload every link under `root`. */
  preloadLinks(root: ParentNode = document): Promise<(PageData | undefined)[]> {
    const links = Array.from(root.querySelectorAll<HTMLAnchorElement>(this.pagefold.options.linkSelector))
    return this.preload(links)
  }

  private key(url: string): string {
    return this.pagefold.resolveUrl(url)
  }

  private allowed(location: Location, el: HTMLAnchorElement | undefined, current: boolean): boolean {
    const { pagefold, options } = this
    if (!pagefold.options.cache) return false
    if (options.respectConnection && constrained()) return false
    if (pagefold.shouldIgnoreVisit(location.href, { el })) return false
    if (!current && location.url === pagefold.location.url) return false
    if (el && (el.hasAttribute('data-no-preload') || options.ignore(el))) return false
    return !pagefold.cache.has(location.url)
  }

  /** Run at most `throttle` requests at once. Priority requests go to the front of the line. */
  private schedule<T>(task: () => Promise<T>, priority = false): Promise<T | undefined> {
    return new Promise((resolve) => {
      const run = () => {
        this.active++
        void task()
          .then(resolve)
          .finally(() => {
            this.active--
            this.queue.shift()?.run()
          })
      }
      if (this.active < this.options.throttle) return run()
      const item = { run, skip: () => resolve(undefined) }
      if (priority) this.queue.unshift(item)
      else this.queue.push(item)
    })
  }

  private async load(url: string): Promise<PageData | undefined> {
    // Its own visit: a navigation must not cancel, or be cancelled by, a preload
    const visit = this.pagefold.createVisit({ to: url })
    try {
      const page = await this.pagefold.fetchPage(url, {}, visit)
      await this.pagefold.hooks.call('page:preload', visit, { page })
      return page
    } catch (error) {
      this.pagefold.log(`Preload failed: ${url}`, error)
      return undefined
    }
  }

  /** A visit to a page that is being preloaded waits for it, then finds it in the cache. */
  private waitForPreload: HookHandler<'page:load'> = async (visit) => {
    if (visit.cache.read) await this.inflight.get(this.key(visit.to.url))
  }

  private linkFrom(event: Event): HTMLAnchorElement | undefined {
    const el = (event.target as Element | null)?.closest?.(this.pagefold.options.linkSelector)
    return el instanceof HTMLAnchorElement ? el : undefined
  }

  private onHover = (event: Event): void => {
    const el = this.linkFrom(event)
    if (!el || this.hoverTimers.has(el)) return
    const { hoverDelay } = this.options
    if (hoverDelay <= 0) return void this.preload(el)
    this.hoverTimers.set(
      el,
      setTimeout(() => {
        this.hoverTimers.delete(el)
        void this.preload(el)
      }, hoverDelay)
    )
  }

  private onLeave = (event: Event): void => {
    const el = this.linkFrom(event)
    const timer = el && this.hoverTimers.get(el)
    if (timer) {
      clearTimeout(timer)
      this.hoverTimers.delete(el)
    }
  }

  private onTouch = (event: Event): void => {
    const el = this.linkFrom(event)
    if (el) void this.preload(el)
  }

  private observeVisibleLinks = (): void => {
    if (typeof IntersectionObserver === 'undefined') return
    const { threshold, delay, containers, ignore } = this.options.preloadVisibleLinks
    this.observer ??= new IntersectionObserver(
      (entries) => {
        for (const { target, isIntersecting } of entries) {
          const el = target as HTMLAnchorElement
          const timer = this.visibleTimers.get(el)
          if (!isIntersecting) {
            if (timer) clearTimeout(timer)
            this.visibleTimers.delete(el)
          } else if (!timer) {
            this.visibleTimers.set(
              el,
              setTimeout(() => {
                this.visibleTimers.delete(el)
                this.observer?.unobserve(el)
                void this.preload(el)
              }, delay)
            )
          }
        }
      },
      { threshold }
    )
    const selector = this.pagefold.options.linkSelector
    for (const container of containers) {
      document.querySelectorAll<HTMLAnchorElement>(`${container} ${selector}`).forEach((el) => {
        if (!ignore(el)) this.observer?.observe(el)
      })
    }
  }
}
