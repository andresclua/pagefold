import type { Pagefold } from './pagefold'
import { getCurrentUrl, updateHistoryRecord } from './history'
import { Location } from './location'
import type { PageData } from './types'
import { classify, query, queryAll } from './utils'
import { VisitState, type Visit } from './visit'

const esc = (value: string): string => value.replace(/["\\]/g, '\\$&')

/** Find the element a hash points to: `#id`, `[name]`, or the top of the page. */
export function getAnchorElement(hash?: string): Element | null {
  if (hash && hash.startsWith('#')) hash = hash.slice(1)
  if (!hash) return null
  const decoded = decodeURIComponent(hash)
  return (
    document.getElementById(decoded) ??
    document.getElementById(hash) ??
    document.querySelector(`a[name="${esc(decoded)}"]`) ??
    (decoded.toLowerCase() === 'top' ? document.body : null)
  )
}

/** Scroll to the visit's anchor, or reset to the top. Returns whether it scrolled. */
export function scrollToContent(p: Pagefold, visit: Visit): boolean {
  const options: ScrollIntoViewOptions = { behavior: 'auto' }
  const { target, reset } = visit.scroll
  const hash = target || visit.to.hash

  let scrolled = false
  if (hash) {
    scrolled = p.hooks.callSync('scroll:anchor', visit, { hash, options }, (_v, args) => {
      const anchor = getAnchorElement(args.hash)
      anchor?.scrollIntoView(args.options)
      return !!anchor
    })
  }
  if (reset && !scrolled) {
    scrolled = p.hooks.callSync('scroll:top', visit, { options }, (_v, args) => {
      window.scrollTo({ top: 0, left: 0, ...args.options })
      return true
    })
  }
  return scrolled
}

/**
 * Swap the visit's containers for the ones in the incoming document and update the title.
 * Elements marked `data-pagefold-persist="key"` are moved over instead of replaced.
 * Returns whether every container was replaced.
 */
export function replaceContent(visit: Visit): boolean {
  const incoming = visit.to.document
  if (!incoming) return false

  document.title = incoming.querySelector('title')?.textContent ?? ''

  const persisted = queryAll('[data-pagefold-persist]:not([data-pagefold-persist=""])')

  const replaced = visit.containers.filter((selector) => {
    const current = query(selector)
    const next = incoming.querySelector(selector)
    if (current && next) {
      current.replaceWith(next)
      return true
    }
    if (!current) console.warn(`[pagefold] Container missing in current document: ${selector}`)
    if (!next) console.warn(`[pagefold] Container missing in incoming document: ${selector}`)
    return false
  })

  persisted.forEach((existing) => {
    const key = existing.getAttribute('data-pagefold-persist') ?? ''
    const placeholder = query(`[data-pagefold-persist="${esc(key)}"]`)
    if (placeholder && placeholder !== existing) placeholder.replaceWith(existing)
  })

  return replaced.length === visit.containers.length
}

/** Put the loaded page on screen: replace content, scroll, announce the view. */
export async function renderPage(p: Pagefold, visit: Visit, page: PageData): Promise<void> {
  if (visit.done) return
  visit.advance(VisitState.ENTERING)

  // Redirected: the URL in the address bar must follow
  if (!p.isSameResolvedUrl(getCurrentUrl(), page.url)) {
    updateHistoryRecord(page.url)
    p.location = Location.fromUrl(page.url)
    visit.to.url = p.location.url
    visit.to.hash = p.location.hash
  }

  await p.hooks.call('content:replace', visit, { page }, (v) => {
    p.classes.remove('is-leaving')
    if (v.animation.animate) p.classes.add('is-rendering')
    if (!replaceContent(v)) throw new Error('[pagefold] Container mismatch, aborting')
    if (v.animation.animate) {
      // The containers are new elements: give them the classes again
      p.classes.add('is-changing', 'is-animating', 'is-rendering')
      if (v.animation.name) p.classes.add(`to-${classify(v.animation.name)}`)
    }
  })

  await p.hooks.call('content:scroll', visit, undefined, () => scrollToContent(p, visit))
  await p.hooks.call('page:view', visit, { url: p.location.url, title: document.title })
}
