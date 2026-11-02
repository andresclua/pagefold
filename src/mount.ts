/** What `setup` may return: a function that tears the component down. */
export type Cleanup = (() => void) | void

export type Setup<T extends Element = Element> = (el: T) => Cleanup

interface Registration {
  selector: string
  setup: Setup
  /** Elements set up so far, with the cleanup each returned */
  live: Map<Element, Cleanup>
}

const run = (cleanup: Cleanup): void => {
  try {
    cleanup?.()
  } catch (error) {
    console.error('[pagefold] A component cleanup failed', error)
  }
}

/**
 * Keeps components in step with the page: each element that matches a selector is set up once,
 * and cleaned up when it leaves the document.
 */
export class Components {
  private registrations = new Set<Registration>()

  add<T extends Element>(selector: string, setup: Setup<T>): () => void {
    const reg: Registration = { selector, setup: setup as Setup, live: new Map() }
    this.registrations.add(reg)
    this.syncOne(reg)
    return () => {
      this.registrations.delete(reg)
      this.dispose(reg)
    }
  }

  /** Clean up the elements that are gone and set up the new ones. */
  sync(): void {
    this.registrations.forEach((reg) => this.syncOne(reg))
  }

  /** Clean up everything and forget every registration. */
  clear(): void {
    this.registrations.forEach((reg) => this.dispose(reg))
    this.registrations.clear()
  }

  private syncOne(reg: Registration): void {
    for (const [el, cleanup] of reg.live) {
      if (!el.isConnected) {
        reg.live.delete(el)
        run(cleanup)
      }
    }
    document.querySelectorAll(reg.selector).forEach((el) => {
      if (reg.live.has(el)) return
      // Remember the element even if setup throws, so one broken component is not retried forever
      reg.live.set(el, undefined)
      try {
        reg.live.set(el, reg.setup(el))
      } catch (error) {
        console.error('[pagefold] A component failed to set up', error)
      }
    })
  }

  private dispose(reg: Registration): void {
    reg.live.forEach(run)
    reg.live.clear()
  }
}
