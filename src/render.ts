import type { Pagefold } from './pagefold.js'
import { getCurrentUrl, updateHistoryRecord } from './history.js'
import { Location } from './location.js'
import type { PageData } from './types.js'
import { classify, query, queryAll } from './utils.js'
import { VisitState, type Visit } from './visit.js'

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

/** The server may have answered from another URL: make the address bar and the visit follow. */
function followRedirect(p: Pagefold, visit: Visit, answeredUrl: string): void {
  if (p.isSameResolvedUrl(getCurrentUrl(), answeredUrl)) return
  updateHistoryRecord(answeredUrl)
  p.location = Location.fromUrl(answeredUrl)
  visit.to.url = p.location.url
  visit.to.hash = p.location.hash
}

/** The default of `content:replace`: swap the containers and give the new ones the visit's classes. */
function swapContainers(p: Pagefold): (visit: Visit) => void {
  return (visit) => {
    const animated = visit.animation.animate
    p.classes.remove('is-leaving')
    if (animated) p.classes.add('is-rendering')
    if (!replaceContent(visit)) throw new Error('[pagefold] The containers of the two pages do not match')
    if (!animated) return
    // The containers are new elements: they need the classes again
    p.classes.add('is-changing', 'is-animating', 'is-rendering')
    if (visit.animation.name) p.classes.add(`to-${classify(visit.animation.name)}`)
  }
}

/**
 * Tell the handlers that the page is in place. The page is already on screen, so a handler
 * that throws (a broken analytics call, say) is reported and the visit goes on, instead of
 * reloading a page that is fine.
 */
async function announceView(p: Pagefold, visit: Visit): Promise<void> {
  try {
    await p.hooks.call('page:view', visit, { url: p.location.url, title: document.title })
  } catch (error) {
    console.error(error)
  }
}

/** Put the loaded page on screen: replace the content, scroll, announce the view. */
export async function renderPage(p: Pagefold, visit: Visit, page: PageData): Promise<void> {
  if (visit.done) return
  visit.advance(VisitState.ENTERING)

  followRedirect(p, visit, page.url)
  await p.hooks.call('content:replace', visit, { page }, swapContainers(p))
  visit.swapped = true
  await p.hooks.call('content:scroll', visit, undefined, () => scrollToContent(p, visit))
  await announceView(p, visit)
}
