import type { Visit } from './visit'
import { queryAll } from './utils'

const END = { transition: 'transitionend', animation: 'animationend' } as const
type Kind = keyof typeof END

/** State classes Pagefold always manages. Anything else it adds is tracked. */
const STATE_CLASSES = ['is-animating', 'is-changing', 'is-leaving', 'is-rendering', 'is-popstate']

/** Adds and removes the state classes (`is-animating`, `to-blog`...) that CSS hooks into. */
export class Classes {
  /** Classes added through `add`, so `clear` never touches the page's own classes */
  private added = new Set<string>()

  constructor(private owner: { visit: Visit }) {}

  private targets(): Element[] {
    const { scope } = this.owner.visit.animation
    if (scope === 'html') return [document.documentElement]
    const selectors = scope === 'containers' ? this.owner.visit.containers : scope
    return selectors.flatMap((s) => queryAll(s))
  }

  add(...classes: string[]): void {
    classes.forEach((c) => this.added.add(c))
    this.targets().forEach((el) => el.classList.add(...classes))
  }

  remove(...classes: string[]): void {
    this.targets().forEach((el) => el.classList.remove(...classes))
  }

  /** Remove every class Pagefold added. */
  clear(): void {
    const all = [...STATE_CLASSES, ...this.added]
    this.targets().forEach((el) => el.classList.remove(...all))
    this.added.clear()
  }
}

const ms = (s: string): number => (parseFloat(s) || 0) * 1000

function timing(styles: CSSStyleDeclaration, kind: Kind): { timeout: number; count: number } {
  const split = (v: string) => (v || '0s').split(', ')
  const delays = split(styles[`${kind}Delay`])
  const durations = split(styles[`${kind}Duration`])
  const totals = durations.map((d, i) => ms(d) + ms(delays[i % delays.length] ?? '0s'))
  return { timeout: Math.max(0, ...totals), count: durations.length }
}

/** Resolves when the element's CSS transition or animation ends. Undefined if it has none. */
function waitFor(el: HTMLElement, signal?: AbortSignal): Promise<void> | undefined {
  const styles = window.getComputedStyle(el)
  const t = timing(styles, 'transition')
  const a = timing(styles, 'animation')
  const kind: Kind = t.timeout >= a.timeout ? 'transition' : 'animation'
  const { timeout, count } = kind === 'transition' ? t : a
  if (!timeout) return undefined

  return new Promise((resolve) => {
    const start = performance.now()
    let ended = 0
    const done = () => {
      clearTimeout(timer)
      el.removeEventListener(END[kind], onEnd)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    const onEnd = (event: Event) => {
      if (event.target !== el) return // from a child
      if ((performance.now() - start) / 1000 < (event as TransitionEvent).elapsedTime) return // from before we listened
      if (++ended >= count) done()
    }
    // Safety net in case the end event never fires
    const timer = setTimeout(done, timeout + 1)
    el.addEventListener(END[kind], onEnd)
    signal?.addEventListener('abort', done)
  })
}

export interface AwaitAnimationsOptions {
  /** Elements matching this selector are awaited. `false` disables waiting. */
  selector?: string | false | undefined
  /** Await these elements instead of using the selector */
  elements?: Iterable<HTMLElement> | undefined
  /** Stop waiting when this signal aborts */
  signal?: AbortSignal | undefined
}

/** Resolve when all CSS transitions and animations on the matching elements are done. */
export async function awaitAnimations({
  selector,
  elements,
  signal,
}: AwaitAnimationsOptions): Promise<void> {
  const els = elements ? Array.from(elements) : selector ? queryAll(selector, document.body) : []
  if (!els.length) {
    if (selector && !elements) console.warn(`[pagefold] No elements match animationSelector \`${selector}\``)
    return
  }
  const waits = els.map((el) => waitFor(el, signal)).filter((p): p is Promise<void> => !!p)
  if (!waits.length && selector) {
    console.warn(`[pagefold] No CSS animation duration defined on elements matching \`${selector}\``)
  }
  await Promise.all(waits)
}
