import { Classes } from './animation.js'
import { Cache } from './cache.js'
import { fetchPage } from './fetch.js'
import { getCurrentUrl, updateHistoryRecord, type HistoryState } from './history.js'
import { Hooks, type HookInitOptions } from './hooks.js'
import { Location } from './location.js'
import { Components, type Setup } from './mount.js'
import { navigate, performNavigation, type NavigationOptions } from './navigate.js'
import type { Plugin } from './plugin.js'
import { getAnchorElement, replaceContent, scrollToContent } from './render.js'
import type { FetchOptions } from './types.js'
import { nextTick } from './utils.js'
import { Visit, type VisitInit } from './visit.js'

export type NavigationToSelfAction = 'scroll' | 'navigate'

export interface Options {
  /** Animate visits made with the browser's back and forward buttons. Default: false */
  animateHistoryBrowsing: boolean
  /** Elements whose CSS animations are awaited. `false` disables waiting. */
  animationSelector: string | false
  /** Where the state classes go. Default: the html element */
  animationScope: 'html' | 'containers'
  /** Keep visited pages in memory. Default: true */
  cache: boolean
  /** Keep at most this many pages, dropping the least recently used. Default: unlimited */
  cacheMax?: number | undefined
  /** Drop cached pages older than this many milliseconds. Default: never */
  cacheTtl?: number | undefined
  /** Selectors of the content areas replaced on each visit */
  containers: string[]
  /** Which response statuses count as a failed visit. Default: only 500 */
  failOnStatus: (status: number) => boolean
  /** Hook handlers to register on startup */
  hooks: Partial<HookInitOptions>
  /** Return true to leave a visit to the browser */
  ignoreVisit: (url: string, ctx: { el?: Element | undefined; event?: Event | undefined }) => boolean
  linkSelector: string
  /** What happens when a link points at the current page. Default: scroll */
  linkToSelf: NavigationToSelfAction
  /** Use the View Transitions API when the browser has it */
  native: boolean
  plugins: Plugin[]
  /**
   * What to do with a visit that starts while another one is on screen. `latest`: only the last one
   * waiting runs. `all`: every one runs, in order. `ignore`: they are dropped (the back and forward
   * buttons still work). Default: latest
   */
  queue: 'latest' | 'all' | 'ignore'
  requestHeaders: Record<string, string>
  /** Rewrite URLs before they are loaded or cached */
  resolveUrl: (url: string) => string
  skipPopStateHandling: (event: PopStateEvent) => boolean
  /** Request timeout in milliseconds. 0 disables it. */
  timeout: number
}

const defaults: Options = {
  animateHistoryBrowsing: false,
  animationSelector: '[class*="transition-"]',
  animationScope: 'html',
  cache: true,
  containers: ['#pagefold'],
  failOnStatus: (status) => status === 500,
  hooks: {},
  ignoreVisit: (_url, { el } = {}) => !!el?.closest('[data-no-pagefold]'),
  linkSelector: 'a[href]',
  linkToSelf: 'scroll',
  native: false,
  plugins: [],
  queue: 'latest',
  requestHeaders: {
    'X-Requested-With': 'pagefold',
    Accept: 'text/html, application/xhtml+xml',
  },
  resolveUrl: (url) => url,
  skipPopStateHandling: (event) => (event.state as HistoryState | null)?.source !== 'pagefold',
  timeout: 0,
}

export class Pagefold {
  readonly version: string = __VERSION__
  options: Options
  readonly defaults: Options = defaults
  plugins: Plugin[] = []
  visit: Visit
  readonly cache: Cache
  readonly hooks: Hooks
  readonly classes: Classes
  private readonly components = new Components()
  location: Location = Location.fromUrl(window.location.href)

  /** True between enable() and destroy() */
  private active = false

  /** @internal True while a visit owns the pipeline */
  navigating = false
  /** @internal Visits waiting for the running one to finish */
  pending: (() => Promise<void>)[] = []
  /** @internal Position in the history stack, to tell back from forward */
  historyIndex: number

  /** Debug output. Does nothing until a debug plugin replaces it. */
  log: (message: string, context?: unknown) => void = () => {}

  constructor(options: Partial<Options> = {}) {
    this.options = { ...defaults, ...options }
    this.hooks = new Hooks(this)
    this.classes = new Classes(this)
    this.cache = new Cache(
      { max: this.options.cacheMax, ttl: this.options.cacheTtl },
      (url) => this.resolveUrl(Location.fromUrl(url).url),
      (event, page) => {
        if (event === 'set' && page) this.hooks.callSync('cache:set', undefined, { page })
        else this.hooks.callSync('cache:clear', undefined, undefined)
      }
    )
    this.visit = this.createVisit({ to: '' })
    this.historyIndex = (window.history.state as HistoryState | null)?.index ?? 1
    void this.enable()
  }

  /** Start handling clicks and history. Runs on construction. */
  async enable(): Promise<void> {
    this.active = true
    document.addEventListener('click', this.onClick)
    window.addEventListener('popstate', this.onPopState)

    if (this.options.animateHistoryBrowsing) window.history.scrollRestoration = 'manual'
    this.options.native = this.options.native && !!document.startViewTransition

    this.options.plugins.forEach((plugin) => this.use(plugin))
    for (const [key, handler] of Object.entries(this.options.hooks)) {
      const [hook, modifiers] = this.hooks.parseName(key)
      this.hooks.on(hook, handler as never, modifiers)
    }

    if ((window.history.state as HistoryState | null)?.source !== 'pagefold') {
      updateHistoryRecord(null, { index: this.historyIndex })
    }

    // Components follow the page: set up what arrives, clean up what leaves
    this.hooks.on('content:replace', () => this.components.sync())
    this.hooks.on('visit:end', () => this.components.sync())

    // Wait for the document to be parsed, so an instance made in the head sees the whole page
    if (document.readyState === 'loading') {
      await new Promise<void>((resolve) => {
        document.addEventListener('DOMContentLoaded', () => resolve(), { once: true })
      })
    }
    await nextTick()
    await this.hooks.call('enable', undefined, undefined, () => {
      if (!this.active) return // destroyed while enabling
      const html = document.documentElement
      html.classList.add('pagefold-enabled')
      html.classList.toggle('pagefold-native', this.options.native)
    })
  }

  /** Stop handling clicks and history, unmount plugins and drop all hook handlers. */
  async destroy(): Promise<void> {
    this.active = false
    document.removeEventListener('click', this.onClick)
    window.removeEventListener('popstate', this.onPopState)
    this.cache.clear()
    this.components.clear()
    this.plugins.slice().forEach((plugin) => this.unuse(plugin))
    await this.hooks.call('disable', undefined, undefined, () => {
      document.documentElement.classList.remove('pagefold-enabled', 'pagefold-native')
    })
    this.hooks.clear()
  }

  /**
   * Run `setup(el)` for every element that matches `selector`, now and after each visit.
   * `setup` may return a function that tears the component down: it runs when the element leaves
   * the page. Returns a function that stops it all and cleans up what is running.
   */
  mount<T extends Element = Element>(selector: string, setup: Setup<T>): () => void {
    return this.components.add(selector, setup)
  }

  use(plugin: unknown): Plugin[] | undefined {
    if (!(plugin as Plugin | undefined)?.isPagefoldPlugin) {
      console.error('[pagefold] Not a plugin instance', plugin)
      return undefined
    }
    const p = plugin as Plugin
    p.pagefold = this
    p._beforeMount()
    p._checkRequirements()
    p.mount()
    this.plugins.push(p)
    return this.plugins
  }

  unuse(pluginOrName: Plugin | string): Plugin[] | undefined {
    const plugin = this.findPlugin(pluginOrName)
    if (!plugin) {
      console.error('[pagefold] No such plugin', pluginOrName)
      return undefined
    }
    plugin.unmount()
    this.plugins = this.plugins.filter((p) => p !== plugin)
    return this.plugins
  }

  findPlugin(pluginOrName: Plugin | string): Plugin | undefined {
    return this.plugins.find((p) =>
      typeof pluginOrName === 'string' ? p.name === pluginOrName : p === pluginOrName
    )
  }

  navigate(url: string, options: NavigationOptions = {}, init: Omit<VisitInit, 'to'> = {}) {
    return navigate(this, url, options, init)
  }

  /** Fetch a page. Pass your own visit to keep the request apart from the current navigation. */
  fetchPage(url: string, options: FetchOptions = {}, visit?: Visit) {
    return fetchPage(this, url, options, visit)
  }

  replaceContent(visit: Visit = this.visit): boolean {
    return replaceContent(visit)
  }

  getAnchorElement(hash?: string): Element | null {
    return getAnchorElement(hash)
  }

  getCurrentUrl(): string {
    return getCurrentUrl()
  }

  createVisit(init: VisitInit): Visit {
    return new Visit(this, init)
  }

  resolveUrl(url: string): string {
    const resolved = this.options.resolveUrl(url)
    return resolved === url ? url : this.resolveUrl(resolved)
  }

  isSameResolvedUrl(a: string, b: string): boolean {
    return this.resolveUrl(a) === this.resolveUrl(b)
  }

  /** Should this visit be left to the browser? */
  shouldIgnoreVisit(
    href: string,
    { el, event }: { el?: Element | undefined; event?: Event | undefined } = {}
  ): boolean {
    const loc = Location.fromUrl(href)
    const { origin, url, hash } = loc
    if (!loc.isWeb || origin !== window.location.origin) return true
    if (el?.matches('[download], [target="_blank"]')) return true
    return this.options.ignoreVisit(url + hash, { el, event })
  }

  /** @internal */
  onClick = (event: MouseEvent): void => {
    const el = (event.target as Element | null)?.closest?.(this.options.linkSelector)
    if (!(el instanceof HTMLAnchorElement)) return

    const { href, url, hash } = Location.fromElement(el)
    if (this.shouldIgnoreVisit(href, { el, event })) return

    // Already going there
    if (this.navigating && url === this.visit.to.url) {
      event.preventDefault()
      return
    }

    const visit = this.createVisit({ to: url, hash, el, event })

    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      this.hooks.callSync('link:newtab', visit, { href })
      return
    }
    if (event.button !== 0) return

    this.hooks.callSync('link:click', visit, { el, event }, () => {
      event.preventDefault()
      const from = visit.from.url

      if (!url || url === from) {
        if (hash) {
          this.hooks.callSync('link:anchor', visit, { hash }, () => {
            updateHistoryRecord(url + hash)
            scrollToContent(this, visit)
          })
        } else {
          this.hooks.callSync('link:self', visit, undefined, () => {
            if (this.options.linkToSelf === 'navigate') {
              void performNavigation(this, visit)
            } else {
              updateHistoryRecord(url)
              scrollToContent(this, visit)
            }
          })
        }
        return
      }

      if (this.isSameResolvedUrl(url, from)) return
      void performNavigation(this, visit)
    })
  }

  /** @internal */
  onPopState = (event: PopStateEvent): void => {
    const state = event.state as HistoryState | null
    if (this.options.skipPopStateHandling(event)) return
    if (this.isSameResolvedUrl(getCurrentUrl(), this.location.url)) return

    const { url, hash } = Location.fromUrl(state?.url ?? window.location.href)
    const visit = this.createVisit({ to: url, hash, event })
    visit.history.popstate = true

    const index = state?.index ?? 0
    if (index && index !== this.historyIndex) {
      visit.history.direction = index > this.historyIndex ? 'forwards' : 'backwards'
      this.historyIndex = index
    }

    // The browser restores scroll itself unless history visits are animated
    visit.animation.animate = false
    visit.scroll.reset = false
    visit.scroll.target = false
    if (this.options.animateHistoryBrowsing && !event.hasUAVisualTransition) {
      visit.animation.animate = true
      visit.scroll.reset = true
    }

    this.hooks.callSync('history:popstate', visit, { event }, () => {
      void performNavigation(this, visit)
    })
  }
}

