import type { HookHandler } from '../hooks.js'
import { Plugin } from '../plugin.js'
import type { Visit } from '../visit.js'

declare module '../hooks.js' {
  interface HookDefinitions {
    'content:announce': undefined
    'content:focus': undefined
  }
}

declare module '../visit.js' {
  interface Visit {
    /** Set by the A11y plugin: what is announced and where focus goes, for this visit */
    a11y?: {
      /** The text announced, or `false` for none. Filled in once the new page is there, so change it in `before('content:announce')`. */
      announce: string | false | undefined
      /** The element to focus (a selector, or an object to also choose when), or `false` for none */
      focus: string | false | { selector?: string | undefined; wait?: boolean }
    }
  }
}

declare module '../pagefold.js' {
  interface Pagefold {
    /** Added by the A11y plugin: announce something to screen readers */
    announce?: (text: string) => void
  }
}

export interface Announcements {
  /** Said when the page has a title. `{title}` is replaced. */
  visit: string
  /** Said instead of the title when the page has none. `{url}` is replaced. */
  url: string
}

export interface A11yOptions {
  /** Tell screen readers about the new page. Default: true */
  announce: boolean
  /**
   * What is announced. For several languages, key it by the `lang` of the page and use `*` as the
   * fallback.
   */
  announcements: Announcements | Record<string, Announcements>
  /** Where to look for the page heading, in order. The document title is the fallback. */
  headingSelector: string | string[]
  /** Focus the element with an `autofocus` attribute in the new content. Default: false */
  autofocus: boolean
  /** Move focus to the new content after a visit. Default: true */
  focus: boolean
  /** The content that receives focus. Default: the first container of the visit. */
  contentSelector: string | undefined
  /** Skip animations when the user prefers reduced motion. Default: true */
  respectReducedMotion: boolean
}

const A11yDefaults: Announcements = { visit: 'Navigated to: {title}', url: 'New page at {url}' }

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
    announcements: { visit: 'Navigated to: {title}', url: 'New page at {url}' },
    headingSelector: ['main h1', 'h1'],
    autofocus: false,
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
    this.pagefold.hooks.create('content:announce')
    this.pagefold.hooks.create('content:focus')
    this.pagefold.announce = (text) => this.say(text)
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

    this.on('visit:start', this.prepare, { priority: -1 })
    if (this.options.respectReducedMotion) this.on('visit:start', this.reduceMotion)
    this.on('page:view', this.afterView)
    this.on('visit:end', this.focusLate)
    this.on('link:anchor', this.focusAnchor)
  }

  override unmount(): void {
    clearTimeout(this.timer)
    delete this.pagefold.announce
    this.announcer?.remove()
    this.announcer = undefined
    super.unmount()
  }

  private reduceMotion: HookHandler<'visit:start'> = (visit) => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      visit.animation.animate = false
    }
  }

  /** Give the visit its `a11y` object, so handlers can change what is announced and focused. */
  private prepare: HookHandler<'visit:start'> = (visit) => {
    const { focus, contentSelector } = this.options
    visit.a11y = {
      announce: undefined,
      focus: focus ? { selector: contentSelector ?? visit.containers[0], wait: false } : false,
    }
  }

  private afterView: HookHandler<'page:view'> = (visit, { url }) => {
    const { a11y } = visit
    if (!a11y) return
    void this.pagefold.hooks.call('content:announce', visit, undefined, () => {
      if (a11y.announce === undefined)
        a11y.announce = this.options.announce ? this.message(url) : false
      if (a11y.announce) this.say(a11y.announce)
    })
    if (!this.focusAt(visit).wait) void this.focus(visit)
  }

  /** Focus that waits for the visit to be over. */
  private focusLate: HookHandler<'visit:end'> = (visit) => {
    if (this.focusAt(visit).wait) void this.focus(visit)
  }

  private focusAt(visit: Visit): { selector?: string | undefined; wait?: boolean } {
    const focus = visit.a11y?.focus
    if (!focus) return {}
    return typeof focus === 'string' ? { selector: focus, wait: false } : focus
  }

  private async focus(visit: Visit): Promise<void> {
    await this.pagefold.hooks.call('content:focus', visit, undefined, () => {
      if (!visit.a11y?.focus) return
      this.focusContent(this.focusAt(visit).selector)
      if (this.options.autofocus) {
        const el = document.querySelector<HTMLElement>('[autofocus]')
        if (el) el.focus({ preventScroll: true })
      }
    })
  }

  private focusAnchor: HookHandler<'link:anchor'> = (_visit, { hash }) => {
    if (this.options.focus) {
      const target = this.pagefold.getAnchorElement(hash)
      if (target instanceof HTMLElement) focusElement(target)
    }
  }

  /** The page's own name: the label of its heading, the heading, or the document title. */
  private pageTitle(): string {
    const { headingSelector } = this.options
    for (const selector of [headingSelector].flat()) {
      const heading = document.querySelector(selector)
      const text = heading?.getAttribute('aria-label') || heading?.textContent?.trim()
      if (text) return text
    }
    return document.title
  }

  /** The announcements for the language of the page, with `*` as the fallback. */
  private texts(): Announcements {
    const { announcements } = this.options
    if (typeof announcements.visit === 'string') return announcements as Announcements
    const byLanguage = announcements as Record<string, Announcements>
    const lang = document.documentElement.lang
    return byLanguage[lang] ?? byLanguage['*'] ?? Object.values(byLanguage)[0] ?? A11yDefaults
  }

  private message(url: string): string {
    const { visit, url: untitled } = this.texts()
    const title = this.pageTitle()
    // Without any title the address is read instead
    return visit.replace('{title}', title || untitled).replace('{url}', url)
  }

  private say(text: string): void {
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
