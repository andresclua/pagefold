import type { HookHandler } from '../hooks.js'
import { Plugin } from '../plugin.js'
import { classify } from '../utils.js'
import { matchPath, type MatchOptions } from './match-path.js'

export interface RouteAnimation {
  /** Route names of the page being left. Default: any */
  from?: string | string[]
  /** Route names of the page being entered. Default: any */
  to?: string | string[]
  /** Name of the animation to use, as `data-pagefold-animation` would */
  animation: string
}

export interface RouteNameOptions {
  /**
   * Named routes: a name and one or more path patterns, such as `{ post: '/blog/:slug' }`, or a
   * list of `{ name, path }` where the first match wins.
   */
  routes: Record<string, string | string[]> | { name: string; path: string | string[] }[]
  /** The name of a page that matches no route, or `false` to leave it without one. Default: `'unknown'` */
  unknownRoute: string | false
  /** Also add `from-<page>` and `to-<page>`, named after the path (`from-about`, `to-homepage`). Default: false */
  paths: boolean
  /** Pick an animation by the routes a visit goes between */
  animations: RouteAnimation[]
  /** How the path patterns are matched: `ignoreCase`, `strict` (trailing slash) and `end` */
  matchOptions: MatchOptions
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
  static defaults: RouteNameOptions = {
    routes: {},
    unknownRoute: 'unknown',
    paths: false,
    animations: [],
    matchOptions: {},
  }

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
    const { routes, unknownRoute } = this.options
    const list = Array.isArray(routes)
      ? routes.map(({ name, path }) => [name, path] as const)
      : Object.entries(routes)
    for (const [name, patterns] of list) {
      if ([patterns].flat().some((pattern) => matchPath(pattern, url, this.options.matchOptions))) return name
    }
    return unknownRoute === false ? undefined : unknownRoute
  }

  /** A path as a class name: `/about/` is `about`, `/` is `homepage`. */
  private slug(url: string): string {
    const slug = url
      .toLowerCase()
      .replace(/\//g, '-')
      .replace(/[^\w-]+/g, '')
      .replace(/^-+|-+$/g, '')
    return slug || 'homepage'
  }

  private nameVisit: HookHandler<'visit:start'> = (visit) => {
    const from = this.routeOf(visit.from.url)
    const to = this.routeOf(visit.to.url)
    visit.from.route = from
    visit.to.route = to
    if (from) this.pagefold.classes.add(`from-route-${classify(from)}`)
    if (to) this.pagefold.classes.add(`to-route-${classify(to)}`)
    if (from && from === to) this.pagefold.classes.add('to-same-route')
    if (this.options.paths) {
      this.pagefold.classes.add(
        `from-${this.slug(visit.from.url)}`,
        `to-${this.slug(visit.to.url)}`
      )
    }

    if (!visit.animation.name) {
      const match = this.options.animations.find(
        (a) => includes(a.from, from) && includes(a.to, to)
      )
      if (match) visit.animation.name = match.animation
    }
  }
}
