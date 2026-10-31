import type { HookHandler } from '../hooks'
import { Plugin } from '../plugin'
import { forceReflow } from '../utils'
import type { Visit } from '../visit'

export interface ContainerSet {
  selector: string
  /** Incoming container */
  next: HTMLElement
  /** Outgoing container */
  previous: HTMLElement
  /** Old containers that stay after the animation */
  keep: HTMLElement[]
  /** Old containers removed after the animation */
  remove: HTMLElement[]
  all: HTMLElement[]
}

declare module '../hooks' {
  interface HookDefinitions {
    'content:insert': { containers: ContainerSet[] }
    'content:remove': { containers: ContainerSet[] }
  }
}

export interface ParallelOptions {
  /** Containers animated in parallel. Default: all containers of the visit */
  containers: string[]
  /** How many previous containers to keep after the animation, in total or per selector */
  keep: number | Record<string, number>
}

/**
 * Animate the old and the new page at the same time. The new container is inserted next to
 * the old one, both stay in the DOM while the animation runs, and the old one is removed after.
 * Disable it for a visit with `visit.animation.parallel = false` in a `visit:start` handler.
 */
export default class PagefoldParallel extends Plugin {
  name = 'PagefoldParallel'

  options: ParallelOptions
  static defaults: ParallelOptions = { containers: [], keep: 0 }

  private sets: ContainerSet[] = []
  private originalContainers: string[] | undefined

  constructor(options: Partial<ParallelOptions> = {}) {
    super()
    this.options = { ...PagefoldParallel.defaults, ...options }
  }

  override mount(): void {
    this.pagefold.hooks.create('content:insert')
    this.pagefold.hooks.create('content:remove')

    // After user handlers, so they can opt a visit out first
    this.on('visit:start', this.markVisit, { priority: 1 })
    this.before('animation:out:await', this.skipOutAnimation, { priority: 1 })
    this.before('content:replace', this.insertContainers, { priority: 1 })
    this.on('content:replace', this.restoreContainers)
    this.on('visit:end', this.removeContainers)
  }

  private selectorsFor(visit: Visit): string[] {
    const { containers } = this.options
    return (containers.length ? containers : visit.containers).filter((s) => visit.containers.includes(s))
  }

  private markVisit: HookHandler<'visit:start'> = (visit) => {
    this.originalContainers = undefined
    if (visit.animation.parallel === false) return
    if (this.selectorsFor(visit).some((s) => document.querySelector(s))) {
      visit.animation.wait = true // the new page must be loaded before it can be inserted
      visit.animation.parallel = true
    }
  }

  private skipOutAnimation: HookHandler<'animation:out:await'> = (visit, args) => {
    if (visit.animation.parallel) args.skip = true
  }

  private insertContainers: HookHandler<'content:replace'> = async (visit) => {
    if (!visit.animation.parallel) return
    const sets = this.buildSets(visit)
    this.sets = sets

    await this.pagefold.hooks.call('content:insert', { containers: sets }, () => {
      for (const { all, next, previous, keep, remove } of sets) {
        all.forEach((el, i) => el.style.setProperty('--pagefold-parallel-container', String(i)))
        previous.setAttribute('aria-hidden', 'true')
        previous.before(next)

        if (visit.animation.animate) {
          // Let the browser see the container without the class first, so it can transition
          next.classList.add('is-next-container')
          forceReflow(next)
          next.classList.remove('is-next-container')
        }
        previous.classList.add('is-previous-container')
        keep.forEach((el) => el.classList.add('is-kept-container'))
        remove.forEach((el) => el.classList.add('is-removing-container'))
      }
    })

    // The default handler must not touch the containers handled here
    this.originalContainers = visit.containers
    const handled = sets.map((s) => s.selector)
    visit.containers = visit.containers.filter((s) => !handled.includes(s))
  }

  private restoreContainers: HookHandler<'content:replace'> = (visit) => {
    if (this.originalContainers) visit.containers = this.originalContainers
  }

  private removeContainers: HookHandler<'visit:end'> = async () => {
    const sets = this.sets
    this.sets = []
    await this.pagefold.hooks.call('content:remove', { containers: sets }, () => {
      for (const { remove, next } of sets) {
        remove.forEach((el) => el.remove())
        next.classList.remove('is-next-container')
      }
    })
  }

  private buildSets(visit: Visit): ContainerSet[] {
    const incoming = visit.to.document
    const { keep: keepOption } = this.options
    const sets: ContainerSet[] = []

    for (const selector of this.selectorsFor(visit)) {
      const next = incoming?.querySelector<HTMLElement>(selector)
      const existing = Array.from(document.querySelectorAll<HTMLElement>(selector))
      const previous = existing[0]
      if (!next || !previous) {
        console.warn(`[pagefold] Parallel container ${selector} not found`)
        continue
      }
      const count = Math.max(0, Number(typeof keepOption === 'object' ? keepOption[selector] ?? 0 : keepOption))
      const keep = existing.slice(0, count)
      const remove = existing.slice(count)
      sets.push({ selector, next, previous, keep, remove, all: [...new Set([next, previous, ...keep, ...remove])] })
    }
    return sets
  }
}
