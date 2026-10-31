import type { HookHandler } from '../hooks'
import { Plugin } from '../plugin'
import { classify } from '../utils'
import { matchPath } from './match-path'

export interface RouteAnimation {
  /** Route names of the page being left. Default: any */
  from?: string | string[]
  /** Route names of the page being entered. Default: any */
  to?: string | string[]
  /** Name of the animation to use, as `data-pagefold-animation` would */
  animation: string
}

export interface RouteNameOptions {
  /** Named routes: a name and one or more path patterns, such as `{ post: '/blog/:slug' }` */
  routes: Record<string, string | string[]>
  /** Pick an animation by the routes a visit goes between */
  animations: RouteAnimation[]
}

const includes = (names: string | string[] | undefined, route: string | undefined): boolean =>
  names === undefined || (route !== undefined && [names].flat().includes(route))

/**
 * Gives pages names. A visit gets `visit.from.route` and `visit.to.route`, the classes
 * `from-route-<name>` and `to-route-<name>` while it runs, and can pick its animation by route.
 */
export default class PagefoldRouteName extends Plugin {
  name = 'PagefoldRouteName'

  options: RouteNameOptions
  static defaults: RouteNameOptions = { routes: {}, animations: [] }

  constructor(options: Partial<RouteNameOptions> = {}) {
    super()
    this.options = { ...PagefoldRouteName.defaults, ...options }
  }

  override mount(): void {
    // Early, so handlers added by the user can still change what was decided here
    this.on('visit:start', this.nameVisit, { priority: -1 })
  }

  /** The name of the first route whose pattern matches the URL. */
  routeOf(url: string): string | undefined {
    for (const [name, patterns] of Object.entries(this.options.routes)) {
      if ([patterns].flat().some((pattern) => matchPath(pattern, url))) return name
    }
    return undefined
  }

  private nameVisit: HookHandler<'visit:start'> = (visit) => {
    const from = this.routeOf(visit.from.url)
    const to = this.routeOf(visit.to.url)
    visit.from.route = from
    visit.to.route = to
    if (from) this.pagefold.classes.add(`from-route-${classify(from)}`)
    if (to) this.pagefold.classes.add(`to-route-${classify(to)}`)

    if (!visit.animation.name) {
      const match = this.options.animations.find((a) => includes(a.from, from) && includes(a.to, to))
      if (match) visit.animation.name = match.animation
    }
  }
}
