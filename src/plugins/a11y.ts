import type { HookHandler } from '../hooks.js'
import { Plugin } from '../plugin.js'

export interface A11yOptions {
  /** Tell screen readers about the new page. Default: true */
  announce: boolean
  /** Text announced after a visit. `{title}` is the page heading, `{url}` the new path. */
  announcement: string
  /** Where to look for the page heading. The document title is the fallback. */
  headingSelector: string
  /** Move focus to the new content after a visit. Default: true */
  focus: boolean
  /** The content that receives focus. Default: the first container of the visit. */
  contentSelector: string | undefined
  /** Skip animations when the user prefers reduced motion. Default: true */
  respectReducedMotion: boolean
}

/** Focus here stays where it is */
const KEEP_FOCUS = 'input, textarea, select, [contenteditable], [data-pagefold-persist]'

const HIDDEN =
  'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0'

/** Make focusable even if it normally is not, and undo that when focus leaves. */
function focusElement(el: HTMLElement): void {
  if (!el.hasAttribute('tabindex')) {
    el.setAttribute('tabindex', '-1')
    el.addEventListener('blur', () => el.removeAttribute('tabindex'), { once: true })
  }
  el.focus({ preventScroll: true })
}

/**
 * Accessibility for page transitions: announces the new page to screen readers, moves focus
 * to the new content and skips animations for people who asked for less motion.
 */
export default class PagefoldA11y extends Plugin {
  name = 'PagefoldA11y'

  options: A11yOptions
  static defaults: A11yOptions = {
    announce: true,
    announcement: 'Navigated to: {title}',
    headingSelector: 'h1',
    focus: true,
    contentSelector: undefined,
    respectReducedMotion: true,
  }

  private announcer: HTMLElement | undefined
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(options: Partial<A11yOptions> = {}) {
    super()
    this.options = { ...PagefoldA11y.defaults, ...options }
  }

  override mount(): void {
    if (this.options.announce) {
      const el = document.createElement('div')
      el.className = 'pagefold-announcer'
      el.setAttribute('role', 'status')
      el.setAttribute('aria-live', 'polite')
      el.setAttribute('aria-atomic', 'true')
      el.style.cssText = HIDDEN
      document.body.append(el)
      this.announcer = el
    }

    if (this.options.respectReducedMotion) this.on('visit:start', this.reduceMotion)
    this.on('page:view', this.afterView)
    this.on('link:anchor', this.focusAnchor)
  }

  override unmount(): void {
    clearTimeout(this.timer)
    this.announcer?.remove()
    this.announcer = undefined
    super.unmount()
  }

  private reduceMotion: HookHandler<'visit:start'> = (visit) => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      visit.animation.animate = false
    }
  }

  private afterView: HookHandler<'page:view'> = (visit, { url }) => {
    if (this.options.announce) this.announce(url)
    if (this.options.focus) this.focusContent(visit.containers[0])
  }

  private focusAnchor: HookHandler<'link:anchor'> = (_visit, { hash }) => {
    if (this.options.focus) {
      const target = this.pagefold.getAnchorElement(hash)
      if (target instanceof HTMLElement) focusElement(target)
    }
  }

  private announce(url: string): void {
    const heading = document.querySelector(this.options.headingSelector)?.textContent?.trim()
    const title = heading || document.title
    const text = this.options.announcement.replace('{title}', title).replace('{url}', url)
    const el = this.announcer
    if (!el) return
    // Clearing first makes screen readers repeat a message that did not change
    el.textContent = ''
    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      el.textContent = text
    }, 100)
  }

  /**
   * Move focus to the content, except while the user is typing or is inside an element that
   * persists across pages. The link that was clicked does not count: its focus should move on.
   */
  private focusContent(fallbackSelector: string | undefined): void {
    if (document.activeElement?.closest(KEEP_FOCUS)) return
    const selector = this.options.contentSelector ?? fallbackSelector
    const content = selector ? document.querySelector<HTMLElement>(selector) : null
    if (content) focusElement(content)
  }
}
