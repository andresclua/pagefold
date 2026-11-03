import { Plugin } from 'pagefold'

export interface ExampleOptions {
  /** The class added to the html element while a page is loading */
  className: string
}

/** Adds a class to <html> while a visit is running. Replace this with your own idea. */
export default class ExamplePlugin extends Plugin {
  name = 'ExamplePlugin'
  requires = { pagefold: '>=0.1.0' }

  options: ExampleOptions
  static defaults: ExampleOptions = { className: 'is-busy' }

  constructor(options: Partial<ExampleOptions> = {}) {
    super()
    this.options = { ...ExamplePlugin.defaults, ...options }
  }

  // Hooks registered with this.on() are removed for you in unmount()
  override mount(): void {
    this.on('visit:start', () => document.documentElement.classList.add(this.options.className))
    this.on('visit:end', () => document.documentElement.classList.remove(this.options.className))
  }

  // Remove whatever else you added (listeners, elements), then call super
  override unmount(): void {
    document.documentElement.classList.remove(this.options.className)
    super.unmount()
  }
}
