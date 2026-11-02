import type { HookHandler } from '../hooks.js'
import { Plugin } from '../plugin.js'
import type { Visit } from '../visit.js'
import { matchPath } from './match-path.js'

export interface FragmentRule {
  /** Path patterns of the page being left */
  from: string | string[]
  /** Path patterns of the page being entered */
  to: string | string[]
  /** The only containers replaced by matching visits */
  containers: string[]
  /** Becomes the animation name, as `data-pagefold-animation` would */
  name?: string
  /**
   * Scroll after the visit: `true` to the top, a selector to that element, or a function that
   * decides for each visit. Fragment visits keep the scroll position by default.
   */
  scroll?: boolean | string | ((visit: Visit) => boolean | string)
  /** Skip this rule for the visits where it returns `false`, even if the paths match */
  if?: (visit: Visit) => boolean
}

export interface FragmentOptions {
  rules: FragmentRule[]
}

declare module '../visit.js' {
  interface Visit {
    /** Set on visits that replace only some containers */
    fragment?: { name: string | undefined; containers: string[]; original: string[] }
  }
}

const matches = (patterns: string | string[], url: string): boolean =>
  [patterns].flat().some((pattern) => matchPath(pattern, url) !== null)

/**
 * Replace only some containers for some visits, such as the detail panel of a list, and leave
 * the rest of the page untouched. Rules match on the page you leave and the page you enter,
 * so the way back works with a rule of its own.
 */
export default class PagefoldFragment extends Plugin {
  name = 'PagefoldFragment'

  options: FragmentOptions
  static defaults: FragmentOptions = { rules: [] }

  constructor(options: Partial<FragmentOptions> = {}) {
    super()
    this.options = { ...PagefoldFragment.defaults, ...options }
  }

  override mount(): void {
    this.on('visit:start', this.apply, { priority: 1 }) // after user handlers
    this.before('content:replace', this.verify, { priority: -1 })
  }

  /** The first rule for this visit whose containers are all on the current page. */
  find(visit: Visit): FragmentRule | undefined {
    return this.options.rules.find(
      (rule) =>
        matches(rule.from, visit.from.url) &&
        matches(rule.to, visit.to.url) &&
        rule.containers.every((selector) => document.querySelector(selector)) &&
        (rule.if?.(visit) ?? true)
    )
  }

  private apply: HookHandler<'visit:start'> = (visit) => {
    const rule = this.find(visit)
    if (!rule) return

    visit.fragment = { name: rule.name, containers: rule.containers, original: visit.containers }
    visit.containers = rule.containers
    visit.animation.scope = rule.containers // classes go on the fragment, not the whole page
    if (rule.name && !visit.animation.name) visit.animation.name = rule.name
    const scroll = typeof rule.scroll === 'function' ? rule.scroll(visit) : rule.scroll
    if (typeof scroll === 'string') {
      visit.scroll.target = scroll
    } else if (!scroll) {
      visit.scroll.reset = false
      visit.scroll.target = false
    }
    this.pagefold.log(`Fragment visit: ${rule.containers.join(', ')}`)
  }

  /** If the new page lacks a container, replace everything instead of leaving a broken page. */
  private verify: HookHandler<'content:replace'> = (visit) => {
    const { fragment } = visit
    const incoming = visit.to.document
    if (!fragment || !incoming) return
    if (fragment.containers.every((selector) => incoming.querySelector(selector))) return

    this.pagefold.log('Fragment container missing in the new page, replacing all containers')
    visit.containers = fragment.original
    visit.animation.scope = 'html'
    delete visit.fragment
  }
}
