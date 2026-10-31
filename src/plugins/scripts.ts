import { Plugin } from '../plugin'

export interface ScriptsOptions {
  /** Run new scripts found in the head. Default: true */
  head: boolean
  /** Run new scripts found in the body. Default: true */
  body: boolean
  /** Only run scripts marked `data-pagefold-reload-script`, every visit. Default: false */
  optin: boolean
}

/**
 * Scripts that arrive with a new page do not run by themselves. This plugin runs the ones
 * that are new, in order. Scripts that were already on the page are not run again.
 * Opt a script out with `data-pagefold-ignore-script`.
 */
export default class PagefoldScripts extends Plugin {
  name = 'PagefoldScripts'

  options: ScriptsOptions
  static defaults: ScriptsOptions = { head: true, body: true, optin: false }

  /** Scripts that already ran, so they are not run twice */
  private seen = new WeakSet<Element>()

  constructor(options: Partial<ScriptsOptions> = {}) {
    super()
    this.options = { ...PagefoldScripts.defaults, ...options }
  }

  override mount(): void {
    document.querySelectorAll('script').forEach((s) => this.seen.add(s))
    this.on('content:replace', this.runScripts)
  }

  runScripts = (): void => {
    const { head, body, optin } = this.options
    const scopes = [head && document.head, body && document.body].filter(
      (s): s is HTMLElement => !!s
    )
    const selector = optin
      ? 'script[data-pagefold-reload-script]'
      : 'script:not([data-pagefold-ignore-script])'

    const scripts = scopes
      .flatMap((scope) => Array.from(scope.querySelectorAll<HTMLScriptElement>(selector)))
      .filter((script) => optin || !this.seen.has(script))
    scripts.forEach((script) => this.runScript(script))
    this.pagefold.log(`Ran ${scripts.length} scripts`)
  }

  /** Replace the script with a fresh copy, which the browser does execute. */
  runScript(script: HTMLScriptElement): HTMLScriptElement {
    const copy = document.createElement('script')
    for (const { name, value } of Array.from(script.attributes)) copy.setAttribute(name, value)
    copy.textContent = script.textContent
    // Dynamically added scripts are async by default, which would break their order
    copy.async = false
    script.replaceWith(copy)
    this.seen.add(copy)
    return copy
  }
}
