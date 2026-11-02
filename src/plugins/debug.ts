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
}

const consoleLog: DebugOptions['log'] = (message, ...details) =>
  console.log(`%c[pagefold]%c ${message}`, 'color:#00a870;font-weight:bold', '', ...details)

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
  }

  private originalLog: ((message: string, context?: unknown) => void) | undefined
  private started = new Map<number, number>()
  /** True when this plugin put the instance on `window` */
  private exposed = false

  constructor(options: Partial<DebugOptions> = {}) {
    super()
    this.options = { ...PagefoldDebug.defaults, ...options }
  }

  override mount(): void {
    const { log, filter, checkContainers, globalInstance } = this.options
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

  override unmount(): void {
    if (this.originalLog) this.pagefold.log = this.originalLog
    const w = window as unknown as { pagefold?: unknown }
    if (this.exposed && w.pagefold === this.pagefold) delete w.pagefold
    this.started.clear()
    super.unmount()
  }
}
