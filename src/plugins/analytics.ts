import type { HookHandler } from '../hooks.js'
import { Plugin } from '../plugin.js'

export interface PageView {
  /** Path and query of the new page */
  url: string
  title: string
  /** Full address of the new page */
  location: string
  /** Full address of the page that was left */
  referrer: string
}

export type AnalyticsProvider = 'gtag' | 'gtm' | 'matomo' | ((view: PageView) => void)

export interface AnalyticsOptions {
  /** Where page views go: Google Analytics 4 (gtag), Google Tag Manager, Matomo, or your own function */
  provider: AnalyticsProvider
  /** Name of the event pushed to the Tag Manager data layer */
  eventName: string
}

interface Globals {
  gtag?: (...args: unknown[]) => void
  dataLayer?: unknown[]
  _paq?: unknown[]
}

/**
 * Report a page view after every visit. The first page is reported by your analytics snippet
 * as usual: Pagefold only reports the pages it navigates to.
 */
export default class PagefoldAnalytics extends Plugin {
  name = 'PagefoldAnalytics'

  options: AnalyticsOptions
  static defaults: AnalyticsOptions = { provider: 'gtag', eventName: 'pageview' }

  private warned = false

  constructor(options: Partial<AnalyticsOptions> = {}) {
    super()
    this.options = { ...PagefoldAnalytics.defaults, ...options }
  }

  override mount(): void {
    this.on('page:view', this.report)
  }

  private report: HookHandler<'page:view'> = (visit, { url, title }) => {
    this.send({
      url,
      title,
      location: window.location.href,
      referrer: window.location.origin + visit.from.url,
    })
  }

  /** Send a page view to the provider. Also usable by hand. */
  send(view: PageView): void {
    const { provider, eventName } = this.options
    if (typeof provider === 'function') return provider(view)

    const w = window as unknown as Globals
    switch (provider) {
      case 'gtag':
        if (!w.gtag) return this.missing('window.gtag')
        w.gtag('event', 'page_view', {
          page_title: view.title,
          page_location: view.location,
          page_path: view.url,
          page_referrer: view.referrer,
        })
        break
      case 'gtm':
        w.dataLayer ??= []
        w.dataLayer.push({
          event: eventName,
          page_title: view.title,
          page_location: view.location,
          page_path: view.url,
          page_referrer: view.referrer,
        })
        break
      case 'matomo': {
        const paq = (w._paq ??= [])
        paq.push(['setReferrerUrl', view.referrer])
        paq.push(['setCustomUrl', view.location])
        paq.push(['setDocumentTitle', view.title])
        paq.push(['trackPageView'])
        break
      }
    }
  }

  /** Warn once, so a missing snippet is noticed but does not flood the console. */
  private missing(what: string): void {
    if (this.warned) return
    this.warned = true
    console.warn(`[pagefold] ${what} is not defined: page views are not being sent`)
  }
}
