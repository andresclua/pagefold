import type { HookHandler } from '../hooks'
import { Plugin } from '../plugin'

export interface BodyClassOptions {
  /** Only manage classes that start with this. Others on the body are left alone. Default: all */
  prefix: string
}

/** Copies the body's class list from the new page, so page-specific styling keeps working. */
export default class PagefoldBodyClass extends Plugin {
  name = 'PagefoldBodyClass'

  options: BodyClassOptions
  static defaults: BodyClassOptions = { prefix: '' }

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
    const { prefix } = this.options
    const next = Array.from(incoming.classList)
    if (!prefix) {
      document.body.className = incoming.className
      return
    }
    const keep = Array.from(document.body.classList).filter((c) => !c.startsWith(prefix))
    document.body.className = [...keep, ...next.filter((c) => c.startsWith(prefix))].join(' ')
  }
}
