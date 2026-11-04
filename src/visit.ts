export type HistoryAction = 'push' | 'replace'
export type HistoryDirection = 'forwards' | 'backwards'

export const VisitState = {
  CREATED: 1,
  QUEUED: 2,
  STARTED: 3,
  LEAVING: 4,
  LOADED: 5,
  ENTERING: 6,
  COMPLETED: 7,
  ABORTED: 8,
  FAILED: 9,
  IGNORED: 10,
} as const

export type VisitState = (typeof VisitState)[keyof typeof VisitState]

/** What a visit needs to know about its host instance. */
export interface VisitContext {
  location: { url: string; hash: string }
  options: {
    containers: string[]
    native: boolean
    animationScope: 'html' | 'containers'
    animationSelector: string | false
    cache: boolean
  }
}

export interface VisitInit {
  to: string
  from?: string
  hash?: string
  el?: Element
  event?: Event
}

let nextId = 0

/** Everything about one navigation. Every hook handler receives it. */
export class Visit {
  readonly id = ++nextId
  state: VisitState = VisitState.CREATED
  from: { url: string; hash?: string | undefined; route?: string | undefined }
  to: {
    url: string
    hash?: string | undefined
    route?: string | undefined
    html?: string
    document?: Document
  }
  containers: string[]
  animation: {
    animate: boolean
    wait: boolean
    name?: string | undefined
    native: boolean
    /** Names for the browser transition, matched in CSS with `:active-view-transition-type(name)` */
    types: string[]
    scope: 'html' | 'containers' | string[]
    selector: string | false
    /** Plugins may add their own flags */
    overlap?: boolean
  }
  trigger: { el?: Element | undefined; event?: Event | undefined }
  cache: { read: boolean; write: boolean }
  history: { action: HistoryAction; popstate: boolean; direction: HistoryDirection | undefined }
  scroll: { reset: boolean; target?: string | false | undefined }
  meta: Record<string, unknown> = {}
  /** True once the new content is on screen: from then on a failure must not reload the page */
  swapped = false
  /** The browser's `ViewTransition`, set when the swap runs inside one (see the `native` option) */
  transition: ViewTransition | undefined
  /** Aborts the request and animations of this visit */
  readonly controller = new AbortController()

  constructor(ctx: VisitContext, init: VisitInit) {
    const { options, location } = ctx
    this.from = { url: init.from ?? location.url, hash: location.hash }
    this.to = { url: init.to, hash: init.hash }
    this.containers = options.containers
    this.animation = {
      animate: true,
      wait: false,
      native: options.native,
      types: [],
      scope: options.animationScope,
      selector: options.animationSelector,
    }
    this.trigger = { el: init.el, event: init.event }
    this.cache = { read: options.cache, write: options.cache }
    this.history = { action: 'push', popstate: false, direction: undefined }
    this.scroll = { reset: true, target: undefined }
  }

  /** Move forward in the lifecycle. Never goes back. */
  advance(state: VisitState): void {
    if (this.state < state) this.state = state
  }

  /** Stop this visit and cancel whatever it has in flight. */
  abort(): void {
    this.state = VisitState.ABORTED
    this.controller.abort()
  }

  ignore(): void {
    this.state = VisitState.IGNORED
  }

  /** Completed, aborted, failed or ignored. */
  get done(): boolean {
    return this.state >= VisitState.COMPLETED
  }

  /** Left to the browser. */
  get ignored(): boolean {
    return this.state === VisitState.IGNORED
  }
}
