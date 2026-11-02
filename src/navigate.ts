import { awaitAnimations } from './animation.js'
import type { FetchError} from './fetch.js';
import { fetchPage } from './fetch.js'
import { createHistoryRecord, getCurrentUrl, updateHistoryRecord } from './history.js'
import { Location } from './location.js'
import type { Pagefold } from './pagefold.js'
import { renderPage } from './render.js'
import type { FetchOptions, PageData } from './types.js'
import { classify, getContextualAttr } from './utils.js'
import type { Visit} from './visit.js';
import { VisitState, type HistoryAction, type VisitInit } from './visit.js'

export interface NavigationOptions extends FetchOptions {
  /** Animate this visit. Default: true */
  animate?: boolean
  /** Name of a custom animation, available as `to-<name>` class */
  animation?: string
  history?: HistoryAction
  cache?: boolean | Partial<{ read: boolean; write: boolean }>
  meta?: Record<string, unknown>
  referrer?: string
}

/** Navigate to a URL. Links Pagefold should not handle are left to the browser. */
export function navigate(
  p: Pagefold,
  url: string,
  options: NavigationOptions = {},
  init: Omit<VisitInit, 'to'> = {}
): Promise<void> {
  if (typeof url !== 'string') throw new Error('pagefold.navigate() requires a URL')
  if (p.shouldIgnoreVisit(url, { el: init.el, event: init.event })) {
    window.location.assign(url)
    return Promise.resolve()
  }
  const { url: to, hash } = Location.fromUrl(url)
  return performNavigation(p, p.createVisit({ ...init, to, hash }), options)
}

async function animateOut(p: Pagefold, visit: Visit): Promise<void> {
  await p.hooks.call('animation:out:start', visit, undefined, (v) => {
    p.classes.add('is-changing', 'is-animating', 'is-leaving')
    if (v.history.popstate) p.classes.add('is-popstate')
    if (v.animation.name) p.classes.add(`to-${classify(v.animation.name)}`)
  })
  await p.hooks.call('animation:out:await', visit, { skip: false }, async (v, { skip }) => {
    if (skip) return
    await awaitAnimations({ selector: v.animation.selector, signal: v.controller.signal })
  })
  await p.hooks.call('animation:out:end', visit, undefined)
}

async function animateIn(p: Pagefold, visit: Visit): Promise<void> {
  await p.hooks.call('animation:in:start', visit, undefined, () => {
    // The new containers must be styled in their "before" state first, or the browser has nothing
    // to transition from and the content appears at once. Reading a layout property flushes the styles.
    void document.body.offsetHeight
    p.classes.remove('is-animating')
  })
  await p.hooks.call('animation:in:await', visit, { skip: false }, async (v, { skip }) => {
    if (skip) return
    await awaitAnimations({ selector: v.animation.selector, signal: v.controller.signal })
  })
  await p.hooks.call('animation:in:end', visit, undefined)
}

/** Leave without a dead history entry behind. */
function performNativeNavigation(p: Pagefold, visit: Visit): void {
  const url = visit.to.url + (visit.to.hash ?? '')
  if (getCurrentUrl() === visit.to.url) {
    // History already moved to the target: step back, then load it for real
    window.removeEventListener('popstate', p.onPopState)
    window.addEventListener('popstate', () => window.location.assign(url), { once: true })
    window.history.back()
  } else {
    window.location.assign(url)
  }
}

/**
 * Run a visit end to end. A visit that is still loading is aborted (request included)
 * when a new one starts. One that is already on screen finishes first; of several
 * waiting, only the latest runs.
 */
export async function performNavigation(
  p: Pagefold,
  visit: Visit,
  options: NavigationOptions = {}
): Promise<void> {
  if (p.navigating) {
    if (p.visit.state >= VisitState.ENTERING) {
      visit.state = VisitState.QUEUED
      p.pending = () => performNavigation(p, visit, options)
      return
    }
    await p.hooks.call('visit:abort', p.visit, undefined)
    delete p.visit.to.document
    p.visit.abort()
  }

  p.navigating = true
  p.visit = visit

  const { el } = visit.trigger
  options.referrer = options.referrer ?? p.location.url
  if (options.animate === false) visit.animation.animate = false
  if (!visit.animation.animate) p.classes.clear()

  const history = options.history ?? getContextualAttr(el, 'data-pagefold-history')
  if (history === 'push' || history === 'replace') visit.history.action = history

  const animation = options.animation ?? getContextualAttr(el, 'data-pagefold-animation')
  if (typeof animation === 'string') visit.animation.name = animation

  visit.meta = options.meta ?? {}

  if (typeof options.cache === 'object') {
    visit.cache.read = options.cache.read ?? visit.cache.read
    visit.cache.write = options.cache.write ?? visit.cache.write
  } else if (options.cache !== undefined) {
    visit.cache = { read: options.cache, write: options.cache }
  }
  // Not a fetch option: fetch() would misread it
  delete options.cache

  try {
    await p.hooks.call('visit:start', visit, undefined)
    visit.advance(VisitState.STARTED) // never undo an ignore() made before this point

    const loading = p.hooks.call('page:load', visit, { options }, async (v, args) => {
      const cached = v.cache.read ? p.cache.get(v.to.url) : undefined
      args.page = cached ?? (await fetchPage(p, v.to.url, args.options, v))
      args.cache = !!cached
      return args.page
    })
    const loaded: Promise<PageData> = loading.then((page) => {
      visit.advance(VisitState.LOADED)
      visit.to.html = page.html
      visit.to.document = new DOMParser().parseFromString(page.html, 'text/html')
      return page
    })
    // The visit may end before anyone awaits this; the real error surfaces where it is awaited
    loaded.catch(() => {})

    const newUrl = visit.to.url + (visit.to.hash ?? '')
    if (!visit.history.popstate) {
      if (visit.history.action === 'replace' || visit.to.url === p.location.url) {
        updateHistoryRecord(newUrl)
      } else {
        p.historyIndex++
        createHistoryRecord(newUrl, { index: p.historyIndex })
      }
    }
    p.location = Location.fromUrl(newUrl)

    if (visit.history.popstate) p.classes.add('is-popstate')
    if (visit.animation.name) p.classes.add(`to-${classify(visit.animation.name)}`)

    if (visit.animation.wait) await loaded
    if (visit.ignored) throw new Error(`Visit to ${visit.to.url} manually ignored`)
    if (visit.done) return

    await p.hooks.call('visit:transition', visit, undefined, async () => {
      if (!visit.animation.animate) {
        await p.hooks.call('animation:skip', undefined)
        await renderPage(p, visit, await loaded)
        return
      }
      visit.advance(VisitState.LEAVING)
      await animateOut(p, visit)
      if (visit.animation.native && document.startViewTransition) {
        await document.startViewTransition(async () => renderPage(p, visit, await loaded)).finished
      } else {
        await renderPage(p, visit, await loaded)
      }
      await animateIn(p, visit)
    })

    if (visit.done) return

    await p.hooks.call('visit:end', visit, undefined, () => p.classes.clear())
    visit.state = VisitState.COMPLETED
    p.navigating = false

    const next = p.pending
    p.pending = undefined
    void next?.()
  } catch (error) {
    if (!error || (error as FetchError).aborted || visit.state === VisitState.ABORTED) {
      visit.advance(VisitState.ABORTED)
      return
    }
    if (visit.ignored) {
      performNativeNavigation(p, visit)
      return
    }
    await p.hooks.call('visit:fail', visit, { error }, (v, args) => {
      console.error(args.error)
      performNativeNavigation(p, v)
    })
    visit.advance(VisitState.FAILED)
  } finally {
    delete visit.to.document
    // A newer visit may already own the pipeline
    if (p.visit === visit) p.navigating = false
  }
}
