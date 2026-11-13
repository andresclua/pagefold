import type { HookName } from '../hooks.js'
import { Plugin } from '../plugin.js'

export interface DebugOptions {
  /** Where messages go. Default: the console */
  log: (message: string, ...details: unknown[]) => void
  /** Return false to hide a hook */
  filter: (hook: string) => boolean
  /** Warn at startup about containers that are missing from the page. Default: true */
  checkContainers: boolean
  /** Put the instance on `window.pagefold`, to poke at it from the console. Default: false */
  globalInstance: boolean
  /** Also log how long each request and each visit took, with a color for slow ones. Default: false */
  timings: boolean
  /** Color and icon of a request by how long it took: the first level whose `upTo` is above the time. */
  levels: TimingLevel[]
  /** Where timing lines go, with the color of their level. Default: the console, in that color (or `log` if you set one) */
  timing?: (message: string, color: string) => void
}

export interface TimingLevel {
  /** Milliseconds: a request faster than this gets this level */
  upTo: number
  icon: string
  /** Any CSS color */
  color: string
}

const consoleLog: DebugOptions['log'] = (message, ...details) =>
  console.log(`%c[pagefold]%c ${message}`, 'color:#e5701f;font-weight:bold', '', ...details)

/**
 * Logs every hook with the visit it belongs to and the time since the visit started, and
 * warns about common setup mistakes. Install it last so it sees hooks created by other plugins.
 */
export default class PagefoldDebug extends Plugin {
  name = 'PagefoldDebug'

  options: DebugOptions
  static defaults: DebugOptions = {
    log: consoleLog,
    filter: () => true,
    checkContainers: true,
    globalInstance: false,
    timings: false,
    levels: [
      { upTo: 500, icon: '🟢', color: 'green' },
      { upTo: 1000, icon: '🟡', color: 'gold' },
      { upTo: 2000, icon: '🟠', color: 'orange' },
      { upTo: Infinity, icon: '🔴', color: 'red' },
    ],
  }

  private originalLog: ((message: string, context?: unknown) => void) | undefined
  private started = new Map<number, number>()
  /** Per visit: when it started, when its request was sent and whether that request finished */
  private timed = new Map<number, { start: number; sent?: number; done: boolean }>()
  /** True when this plugin put the instance on `window` */
  private exposed = false

  constructor(options: Partial<DebugOptions> = {}) {
    super()
    this.options = { ...PagefoldDebug.defaults, ...options }
  }

  override mount(): void {
    const { log, filter, checkContainers, globalInstance, timings } = this.options
    this.exposed = globalInstance
    if (globalInstance) (window as unknown as { pagefold?: unknown }).pagefold = this.pagefold
    this.originalLog = this.pagefold.log
    this.pagefold.log = (message, context) =>
      log(message, ...(context === undefined ? [] : [context]))

    if (checkContainers) {
      for (const selector of this.pagefold.options.containers) {
        if (!document.querySelector(selector))
          log(`warning: container \`${selector}\` is not on this page`)
      }
    }

    if (timings) this.logTimings()

    for (const hook of this.pagefold.hooks.names().filter(filter)) {
      // First, so the time is when the hook began
      this.before(
        hook as HookName,
        (visit, args) => {
          if (hook === 'visit:start') this.started.set(visit.id, performance.now())
          const elapsed = this.started.get(visit.id)
          const when = elapsed === undefined ? '' : ` +${Math.round(performance.now() - elapsed)}ms`
          log(`${hook} · visit #${visit.id} ${visit.from.url} → ${visit.to.url}${when}`, args)
          if (hook === 'visit:end' || hook === 'visit:fail' || hook === 'visit:abort') {
            this.started.delete(visit.id)
          }
        },
        { priority: -1000 }
      )
    }
  }

  /** Server request time and total time per visit */
  private logTimings(): void {
    const { log, levels, timing } = this.options
    const out =
      timing ??
      (log === consoleLog
        ? (message: string, color: string) =>
            console.log(`%c[pagefold]%c %c${message}`, 'color:#e5701f;font-weight:bold', '', `color:${color}`)
        : (message: string) => log(message))
    const stop = (visit: { id: number }) => void this.timed.delete(visit.id)
    this.before('visit:start', (visit) => {
      this.timed.set(visit.id, { start: performance.now(), done: false })
    })
    this.before('fetch:request', (visit) => {
      const t = this.timed.get(visit.id)
      if (t) t.sent = performance.now()
    })
    this.on('fetch:request', (visit) => {
      const t = this.timed.get(visit.id)
      if (t?.sent === undefined) return
      t.done = true
      const ms = performance.now() - t.sent
      const level = levels.find((l) => ms < l.upTo) ?? levels[levels.length - 1]
      out(`${level?.icon ?? ''} Server request: ${ms.toFixed(2)}ms`.trim(), level?.color ?? 'inherit')
    })
    this.on('visit:end', (visit) => {
      const t = this.timed.get(visit.id)
      if (!t) return
      if (!t.done) out('No request: the page came from the cache or was preloaded', levels[0]?.color ?? 'inherit')
      out(`🔄 Total: ${visit.from.url} → ${visit.to.url}: ${(performance.now() - t.start).toFixed(2)}ms`, 'inherit')
      stop(visit)
    })
    this.on('visit:fail', stop)
    this.on('visit:abort', stop)
  }

  override unmount(): void {
    if (this.originalLog) this.pagefold.log = this.originalLog
    const w = window as unknown as { pagefold?: unknown }
    if (this.exposed && w.pagefold === this.pagefold) delete w.pagefold
    this.started.clear()
    this.timed.clear()
    super.unmount()
  }
}
