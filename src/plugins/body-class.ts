import type { HookHandler } from '../hooks.js'
import { Plugin } from '../plugin.js'

export interface BodyClassOptions {
  /** Only manage classes that start with this. Others on the body are left alone. Default: all */
  prefix: string
  /** More attributes of the body to copy from the new page, such as `lang`, `dir` or `/^data-/`. Default: none */
  attributes: (string | RegExp)[]
}

/** Copies the body's class list from the new page, so page-specific styling keeps working. */
export default class PagefoldBodyClass extends Plugin {
  name = 'PagefoldBodyClass'

  options: BodyClassOptions
  static defaults: BodyClassOptions = { prefix: '', attributes: [] }

  constructor(options: Partial<BodyClassOptions> = {}) {
    super()
    this.options = { ...PagefoldBodyClass.defaults, ...options }
  }

  override mount(): void {
    this.on('content:replace', this.update)
  }

  update: HookHandler<'content:replace'> = (visit) => {
    const incoming = visit.to.document?.body
    if (!incoming) return
    this.copyAttributes(incoming)
    const { prefix } = this.options
    const next = Array.from(incoming.classList)
    if (!prefix) {
      document.body.className = incoming.className
      return
    }
    const keep = Array.from(document.body.classList).filter((c) => !c.startsWith(prefix))
    document.body.className = [...keep, ...next.filter((c) => c.startsWith(prefix))].join(' ')
  }

  /** Make the body's attributes that match `attributes` the same as the new page's. */
  private copyAttributes(incoming: HTMLElement): void {
    const { attributes } = this.options
    if (!attributes.length) return
    const matches = (name: string) =>
      attributes.some((a) => (typeof a === 'string' ? a === name : a.test(name)))
    const body = document.body
    for (const { name } of Array.from(body.attributes)) {
      if (name !== 'class' && matches(name) && !incoming.hasAttribute(name))
        body.removeAttribute(name)
    }
    for (const { name, value } of Array.from(incoming.attributes)) {
      if (name !== 'class' && matches(name)) body.setAttribute(name, value)
    }
  }
}
