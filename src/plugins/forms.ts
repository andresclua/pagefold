import { Location } from '../location.js'
import type { NavigationOptions } from '../navigate.js'
import { Plugin } from '../plugin.js'

declare module '../hooks.js' {
  interface HookDefinitions {
    'form:submit': { el: HTMLFormElement; event: SubmitEvent }
    'form:submit:newtab': { el: HTMLFormElement; event: SubmitEvent }
  }
}

export interface FormsOptions {
  /** Which forms are submitted without a page load. Default: forms with `data-pagefold-form` */
  formSelector: string
  /**
   * Forms that replace only themselves, not the page's containers. They need an `id`, scroll back
   * to their start and animate on their own. Default: forms with `data-pagefold-inline-form`
   */
  inlineFormSelector: string
  /** Leave empty fields out of the address of a GET form. Default: false */
  stripEmptyParams: boolean
}

/**
 * Submit forms without leaving the page. GET forms become a visit to the URL with the fields as
 * query; POST forms send the fields in the request body, and the response is shown like any page.
 */
export default class PagefoldForms extends Plugin {
  name = 'PagefoldForms'

  options: FormsOptions
  static defaults: FormsOptions = {
    formSelector: 'form[data-pagefold-form]',
    inlineFormSelector: 'form[data-pagefold-inline-form]',
    stripEmptyParams: false,
  }

  constructor(options: Partial<FormsOptions> = {}) {
    super()
    this.options = { ...PagefoldForms.defaults, ...options }
  }

  override mount(): void {
    this.pagefold.hooks.create('form:submit')
    this.pagefold.hooks.create('form:submit:newtab')
    document.addEventListener('submit', this.onSubmit)
  }

  override unmount(): void {
    document.removeEventListener('submit', this.onSubmit)
    super.unmount()
  }

  private onSubmit = (event: SubmitEvent): void => {
    const form = event.target
    if (!(form instanceof HTMLFormElement) || event.defaultPrevented) return
    const { formSelector, inlineFormSelector } = this.options
    const inline = form.matches(inlineFormSelector)
    if (!inline && !form.matches(formSelector)) return

    // Buttons can override the form's own settings
    const submitter = event.submitter
    const attr = (name: string, own: string) => submitter?.getAttribute(`form${name}`) ?? own
    const method = attr('method', form.getAttribute('method') ?? 'get').toUpperCase()
    if (method !== 'GET' && method !== 'POST') return // dialog, or something we cannot do
    if (attr('target', form.target) === '_blank') {
      const visit = this.pagefold.createVisit({ to: window.location.pathname, el: form, event })
      this.pagefold.hooks.callSync('form:submit:newtab', visit, { el: form, event })
      return
    }

    const location = Location.fromUrl(
      attr('action', form.getAttribute('action') ?? '') || window.location.href
    )
    if (this.pagefold.shouldIgnoreVisit(location.href, { el: form, event })) return

    const data = new FormData(form, submitter)
    let url = location.url
    const options: NavigationOptions = {}

    if (method === 'GET') {
      const params = new URLSearchParams()
      data.forEach((value, key) => {
        const text = typeof value === 'string' ? value : value.name
        if (!(this.options.stripEmptyParams && text === '')) params.append(key, text)
      })
      const query = params.toString()
      if (query) url += (url.includes('?') ? '&' : '?') + query
    } else {
      options.method = 'POST'
      options.cache = false
      options.body =
        attr('enctype', form.enctype) === 'multipart/form-data'
          ? data
          : new URLSearchParams(
              Array.from(data, ([k, v]) => [k, typeof v === 'string' ? v : v.name])
            )
    }

    const visit = this.pagefold.createVisit({ to: location.url, el: form, event })
    this.pagefold.hooks.callSync('form:submit', visit, { el: form, event }, () => {
      event.preventDefault()
      // An inline form replaces only itself, so it needs an id to be found again in the answer
      if (inline && form.id) {
        const selector = `#${CSS.escape(form.id)}`
        this.pagefold.hooks.once('visit:start', (v) => {
          v.containers = [selector]
          v.animation.scope = [selector]
          v.scroll.target = selector
        })
      } else if (inline) {
        console.warn('[pagefold] An inline form needs an id', form)
      }
      void this.pagefold.navigate(url, options, { el: form, event })
    })
  }
}
