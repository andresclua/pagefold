import { awaitAnimations } from './animation.js'
import type { FetchError} from './fetch.js';
import { fetchPage } from './fetch.js'
import { createHistoryRecord, getCurrentUrl, updateHistoryRecord } from './history.js'
import { Location } from './location.js'
import type { Pagefold } from './pagefold.js'
import { renderPage } from './render.js'
import type { FetchOptions, PageData } from './types.js'
import { classify, forceReflow, getContextualAttr } from './utils.js'
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

/** Run `update` inside a browser view transition, naming it so CSS can tell visits apart. */
function startNative(visit: Visit, update: () => Promise<void>): Promise<void> {
  const { history, animation } = visit
  const types = [...animation.types]
  if (history.direction) types.push(history.direction)
  // Browsers before transition types only take the callback
  const typed = 'ViewTransition' in window && 'types' in ViewTransition.prototype
  visit.transition = typed
    ? document.startViewTransition({ update, types } as never)
    : document.startViewTransition(update)
  return visit.transition.finished
}

async function animateIn(p: Pagefold, visit: Visit): Promise<void> {
  await p.hooks.call('animation:in:start', visit, undefined, () => {
    // The new containers must be styled in their "before" state first, or the browser has nothing
    // to transition from and the content appears at once. Reading a layout property flushes the styles.
    forceReflow()
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

type Admission = 'go' | 'replace' | 'stop'

/**
 * Decide whether a visit may start now. This is synchronous on purpose: two visits started in the
 * same tick must not both find the pipeline free.
 * - `go`: nothing is running.
 * - `replace`: the running visit is still loading and gives way to this one.
 * - `stop`: this visit was ignored or queued, depending on the `queue` option.
 */
function admit(p: Pagefold, visit: Visit, options: NavigationOptions): Admission {
  if (!p.navigating) return 'go'
  const { queue } = p.options

  if (queue === 'ignore' && !visit.history.popstate) {
    visit.state = VisitState.IGNORED
    return 'stop'
  }
  // A visit already on screen is allowed to finish
  if (queue === 'all' || p.visit.state >= VisitState.ENTERING) {
    visit.state = VisitState.QUEUED
    const later = () => performNavigation(p, visit, options)
    p.pending = queue === 'all' ? [...p.pending, later] : [later]
    return 'stop'
  }
  return 'replace'
}

/** Copy what the caller asked for (options and `data-pagefold-*` attributes) onto the visit. */
function configure(p: Pagefold, visit: Visit, options: NavigationOptions): void {
  const { el } = visit.trigger
  options.referrer ??= p.location.url
  if (options.animate === false) visit.animation.animate = false
  if (!visit.animation.animate) p.classes.clear()

  const action = options.history ?? getContextualAttr(el, 'data-pagefold-history')
  if (action === 'push' || action === 'replace') visit.history.action = action

  const name = options.animation ?? getContextualAttr(el, 'data-pagefold-animation')
  if (typeof name === 'string') visit.animation.name = name

  visit.meta = options.meta ?? {}

  const { cache } = options
  if (typeof cache === 'object') {
    visit.cache.read = cache.read ?? visit.cache.read
    visit.cache.write = cache.write ?? visit.cache.write
  } else if (cache !== undefined) {
    visit.cache = { read: cache, write: cache }
  }
  // Not a fetch option: fetch() would misread it
  delete options.cache
}

/** Start loading the page: from the cache when allowed, otherwise from the network. */
function requestPage(p: Pagefold, visit: Visit, options: NavigationOptions) {
  // Without animation nothing waits for the page, so say it before the request goes out
  const skipping = visit.animation.animate ? undefined : p.hooks.call('animation:skip', undefined)

  const loaded: Promise<PageData> = p.hooks
    .call('page:load', visit, { options }, async (v, args) => {
      const cached = v.cache.read ? p.cache.get(v.to.url) : undefined
      args.page = cached ?? (await fetchPage(p, v.to.url, args.options, v))
      args.cache = !!cached
      return args.page
    })
    .then((page) => {
      visit.advance(VisitState.LOADED)
      visit.to.html = page.html
      visit.to.document = new DOMParser().parseFromString(page.html, 'text/html')
      return page
    })
  // The visit may end before anyone awaits this: the real error surfaces where it is awaited
  loaded.catch(() => {})
  return { skipping, loaded }
}

/** Put the visit's URL in the address bar (back and forward already did) and mark the page. */
function commitLocation(p: Pagefold, visit: Visit): void {
  const target = visit.to.url + (visit.to.hash ?? '')
  if (!visit.history.popstate) {
    const samePage = visit.to.url === p.location.url
    if (visit.history.action === 'replace' || samePage) {
      updateHistoryRecord(target)
    } else {
      createHistoryRecord(target, { index: ++p.historyIndex })
    }
  }
  p.location = Location.fromUrl(target)

  if (visit.history.popstate) p.classes.add('is-popstate')
  if (visit.animation.name) p.classes.add(`to-${classify(visit.animation.name)}`)
}

/** Leave the old page, show the new one, enter. Without animation it is only the swap. */
async function runTransition(
  p: Pagefold,
  visit: Visit,
  loaded: Promise<PageData>,
  skipping: Promise<unknown> | undefined
): Promise<void> {
  const show = async () => renderPage(p, visit, await loaded)

  if (!visit.animation.animate) {
    await (skipping ?? p.hooks.call('animation:skip', undefined))
    return show()
  }
  visit.advance(VisitState.LEAVING)
  await animateOut(p, visit)
  await (visit.animation.native && 'startViewTransition' in document ? startNative(visit, show) : show())
  await animateIn(p, visit)
}

/** The visit no longer owns the pipeline: let the next waiting visit go. */
function handOver(p: Pagefold, visit: Visit): void {
  if (p.visit !== visit) return
  p.navigating = false
  void p.pending.shift()?.()
}

/**
 * What happens to a visit that threw.
 * - An abort is silent, and the next waiting visit goes.
 * - A failure after the new content is on screen is only logged: reloading would fix nothing.
 * - Anything else ends in the browser, unless a handler of `visit:fail` took over.
 */
async function settleFailure(p: Pagefold, visit: Visit, error: unknown): Promise<void> {
  const aborted =
    !error || (error as FetchError).aborted || visit.state === VisitState.ABORTED
  if (aborted) {
    visit.advance(VisitState.ABORTED)
    handOver(p, visit)
    return
  }
  if (visit.ignored) return performNativeNavigation(p, visit)

  if (visit.swapped) {
    console.error(error)
    p.classes.clear()
    visit.advance(VisitState.FAILED)
    handOver(p, visit)
    return
  }

  let reloaded = false
  const reload = (v: Visit) => {
    reloaded = true
    performNativeNavigation(p, v)
  }
  try {
    await p.hooks.call('visit:fail', visit, { error }, (v, args) => {
      console.error(args.error)
      reload(v)
    })
  } catch (handlerError) {
    // A broken handler must not leave the visitor on a page that is not loading
    console.error(handlerError)
    if (!reloaded) reload(visit)
  }
  visit.advance(VisitState.FAILED)
  if (!reloaded) handOver(p, visit)
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
  const admission = admit(p, visit, options)
  if (admission === 'stop') return
  if (admission === 'replace') {
    await p.hooks.call('visit:abort', p.visit, undefined)
    delete p.visit.to.document
    p.visit.abort()
  }

  p.navigating = true
  p.visit = visit
  configure(p, visit, options)

  try {
    await p.hooks.call('visit:start', visit, undefined)
    visit.advance(VisitState.STARTED) // never undo an ignore() made before this point

    const { skipping, loaded } = requestPage(p, visit, options)
    commitLocation(p, visit)

    if (visit.animation.wait) await loaded
    if (visit.ignored) throw new Error(`A handler ignored the visit to ${visit.to.url}`)
    if (visit.done) return handOver(p, visit)

    await p.hooks.call('visit:transition', visit, undefined, () =>
      runTransition(p, visit, loaded, skipping)
    )
    if (visit.done) return handOver(p, visit)

    await p.hooks.call('visit:end', visit, undefined, () => p.classes.clear())
    visit.state = VisitState.COMPLETED
    handOver(p, visit)
  } catch (error) {
    await settleFailure(p, visit, error)
  } finally {
    delete visit.to.document
    // A newer visit may already own the pipeline
    if (p.visit === visit) p.navigating = false
  }
}
