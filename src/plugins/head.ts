import type { HookHandler } from '../hooks.js'
import { Plugin } from '../plugin.js'

export interface HeadOptions {
  /** Keep tags of the old page that the new page does not have. Boolean, selector or predicate. */
  persistTags: boolean | string | ((el: Element) => boolean)
  /** Shortcut for `persistTags` with a selector for stylesheets and scripts. */
  persistAssets: boolean
  /** Wait for new stylesheets to load before showing the page. */
  awaitAssets: boolean
  /** Attributes of the html element to keep in sync. Names or patterns. */
  attributes: (string | RegExp)[]
  /** Give up waiting for assets after this many milliseconds. */
  timeout: number
}

const ASSETS = 'link[rel=stylesheet], script[src], style'

/**
 * Make `current` match `next`: tags that are identical stay untouched, new ones are inserted
 * in the right place, the rest are removed unless `persist` says to keep them.
 */
export function mergeHead(
  current: HTMLHeadElement,
  next: HTMLHeadElement,
  persist: (el: Element) => boolean
): { added: Element[]; removed: Element[] } {
  const old = Array.from(current.children)
  const matched = new Set<Element>()
  const added: Element[] = []
  let previous: Element | null = null

  for (const incoming of Array.from(next.children)) {
    const same = old.find((el) => !matched.has(el) && el.isEqualNode(incoming))
    if (same) {
      matched.add(same)
      previous = same
      continue
    }
    const node = document.importNode(incoming, true)
    if (previous) previous.after(node)
    else current.prepend(node)
    added.push(node)
    previous = node
  }

  const removed = old.filter((el) => !matched.has(el) && !persist(el))
  removed.forEach((el) => el.remove())
  return { added, removed }
}

/** Copy the chosen attributes from one element to another, removing the ones that disappeared. */
export function syncAttributes(
  target: Element,
  source: Element,
  names: (string | RegExp)[]
): void {
  const wanted = (name: string) => names.some((n) => (typeof n === 'string' ? n === name : n.test(name)))
  for (const { name, value } of Array.from(source.attributes)) {
    if (wanted(name) && target.getAttribute(name) !== value) target.setAttribute(name, value)
  }
  for (const { name } of Array.from(target.attributes)) {
    if (wanted(name) && !source.hasAttribute(name)) target.removeAttribute(name)
  }
}

/** Resolve when every stylesheet has loaded or failed, or after `timeout`. */
function waitForStylesheets(added: Element[], timeout: number): Promise<void> {
  const sheets = added.filter((el) => el.matches('link[rel=stylesheet][href]'))
  return Promise.all(
    sheets.map(
      (el) =>
        new Promise<void>((resolve) => {
          const done = () => resolve()
          el.addEventListener('load', done, { once: true })
          el.addEventListener('error', done, { once: true })
          setTimeout(done, timeout)
        })
    )
  ).then(() => undefined)
}

/** Keeps the document head (title, meta, canonical, stylesheets) in sync with the new page. */
export default class PagefoldHead extends Plugin {
  name = 'PagefoldHead'

  options: HeadOptions
  static defaults: HeadOptions = {
    persistTags: false,
    persistAssets: false,
    awaitAssets: false,
    attributes: ['lang', 'dir'],
    timeout: 3000,
  }

  constructor(options: Partial<HeadOptions> = {}) {
    super()
    this.options = { ...PagefoldHead.defaults, ...options }
    if (this.options.persistAssets && !this.options.persistTags) {
      this.options.persistTags = ASSETS
    }
  }

  override mount(): void {
    this.before('content:replace', this.updateHead)
  }

  updateHead: HookHandler<'content:replace'> = async (visit) => {
    const incoming = visit.to.document
    if (!incoming) return
    const { awaitAssets, attributes, timeout } = this.options

    const { added, removed } = mergeHead(document.head, incoming.head, (el) => this.shouldPersist(el))
    this.pagefold.log(`Head: removed ${removed.length}, added ${added.length}`)

    if (attributes.length) syncAttributes(document.documentElement, incoming.documentElement, attributes)
    if (awaitAssets) await waitForStylesheets(added, timeout)
  }

  shouldPersist(el: Element): boolean {
    const { persistTags } = this.options
    if (typeof persistTags === 'function') return persistTags(el)
    if (typeof persistTags === 'string') return !!persistTags && el.matches(persistTags)
    return persistTags
  }
}
