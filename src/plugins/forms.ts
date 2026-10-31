import { Location } from '../location'
import type { NavigationOptions } from '../navigate'
import { Plugin } from '../plugin'

declare module '../hooks' {
  interface HookDefinitions {
    'form:submit': { el: HTMLFormElement; event: SubmitEvent }
  }
}

export interface FormsOptions {
  /** Which forms are submitted without a page load. Default: forms with `data-pagefold-form` */
  formSelector: string
}

/**
 * Submit forms without leaving the page. GET forms become a visit to the URL with the fields as
 * query; POST forms send the fields in the request body, and the response is shown like any page.
 */
export default class PagefoldForms extends Plugin {
  name = 'PagefoldForms'

  options: FormsOptions
  static defaults: FormsOptions = { formSelector: 'form[data-pagefold-form]' }

  constructor(options: Partial<FormsOptions> = {}) {
    super()
    this.options = { ...PagefoldForms.defaults, ...options }
  }

  override mount(): void {
    this.pagefold.hooks.create('form:submit')
    document.addEventListener('submit', this.onSubmit)
  }

  override unmount(): void {
    document.removeEventListener('submit', this.onSubmit)
    super.unmount()
  }

  private onSubmit = (event: SubmitEvent): void => {
    const form = event.target
    if (!(form instanceof HTMLFormElement) || event.defaultPrevented) return
    if (!form.matches(this.options.formSelector)) return

    // Buttons can override the form's own settings
    const submitter = event.submitter
    const attr = (name: string, own: string) => submitter?.getAttribute(`form${name}`) ?? own
    const method = attr('method', form.getAttribute('method') ?? 'get').toUpperCase()
    if (method !== 'GET' && method !== 'POST') return // dialog, or something we cannot do
    if (attr('target', form.target) === '_blank') return

    const location = Location.fromUrl(attr('action', form.getAttribute('action') ?? '') || window.location.href)
    if (this.pagefold.shouldIgnoreVisit(location.href, { el: form, event })) return

    const data = new FormData(form, submitter)
    let url = location.url
    const options: NavigationOptions = {}

    if (method === 'GET') {
      const params = new URLSearchParams()
      data.forEach((value, key) => params.append(key, typeof value === 'string' ? value : value.name))
      url += (url.includes('?') ? '&' : '?') + params.toString()
    } else {
      options.method = 'POST'
      options.cache = false
      options.body =
        attr('enctype', form.enctype) === 'multipart/form-data'
          ? data
          : new URLSearchParams(Array.from(data, ([k, v]) => [k, typeof v === 'string' ? v : v.name]))
    }

    const visit = this.pagefold.createVisit({ to: location.url, el: form, event })
    this.pagefold.hooks.callSync('form:submit', visit, { el: form, event }, () => {
      event.preventDefault()
      void this.pagefold.navigate(url, options, { el: form, event })
    })
  }
}
