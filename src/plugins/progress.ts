import { Plugin } from '../plugin'

export interface ProgressOptions {
  className: string
  /** Duration of the movement and of the fade out, in milliseconds */
  transition: number
  /** Wait this long before showing the bar, so quick visits show nothing */
  delay: number
  /** Where the bar starts, from 0 to 1 */
  initialValue: number
  /** Run the bar to the end before hiding it. If false it just disappears. */
  finishAnimation: boolean
  /** Apply basic inline styles. Turn off to style `.className` yourself. */
  styles: boolean
  color: string
  height: number
}

/** A thin bar at the top of the page that shows a visit is loading. */
export default class PagefoldProgress extends Plugin {
  name = 'PagefoldProgress'

  options: ProgressOptions
  static defaults: ProgressOptions = {
    className: 'pagefold-progress-bar',
    transition: 300,
    delay: 300,
    initialValue: 0.25,
    finishAnimation: true,
    styles: true,
    color: '#1b1bff',
    height: 3,
  }

  private bar: HTMLElement | undefined
  private shown = false
  private value = 0
  private timers: Record<'show' | 'trickle' | 'hide', ReturnType<typeof setTimeout> | undefined> = {
    show: undefined,
    trickle: undefined,
    hide: undefined,
  }

  constructor(options: Partial<ProgressOptions> = {}) {
    super()
    this.options = { ...PagefoldProgress.defaults, ...options }
  }

  override mount(): void {
    this.on('visit:start', this.start)
    this.on('page:view', this.finish)
    this.on('visit:fail', this.hideNow)
  }

  override unmount(): void {
    this.hideNow()
    super.unmount()
  }

  private start = (): void => {
    this.clear()
    this.timers.show = setTimeout(this.show, this.options.delay)
  }

  private show = (): void => {
    const bar = this.ensureBar()
    this.shown = true
    if (this.options.styles) bar.style.opacity = '1'
    this.set(this.options.initialValue)
    // Slow down as it approaches the end, so it never looks finished before it is
    this.timers.trickle = setInterval(() => this.set(this.value + (0.99 - this.value) * 0.1), 200)
  }

  private finish = (): void => {
    const { finishAnimation, transition } = this.options
    const { shown } = this
    this.clear()
    if (!shown) return // the visit was quick enough that the bar never appeared
    if (!finishAnimation) return this.hideNow()
    this.set(1)
    this.timers.hide = setTimeout(this.hideNow, transition)
  }

  private hideNow = (): void => {
    this.clear()
    this.bar?.remove()
    this.bar = undefined
    this.shown = false
    this.value = 0
  }

  private set(value: number): void {
    this.value = Math.min(1, value)
    if (this.bar) this.bar.style.transform = `scaleX(${this.value})`
  }

  private clear(): void {
    clearTimeout(this.timers.show)
    clearInterval(this.timers.trickle)
    clearTimeout(this.timers.hide)
    this.timers = { show: undefined, trickle: undefined, hide: undefined }
  }

  private ensureBar(): HTMLElement {
    if (this.bar) return this.bar
    const { className, styles, color, height, transition } = this.options
    const bar = document.createElement('div')
    bar.className = className
    bar.setAttribute('aria-hidden', 'true')
    if (styles) {
      bar.style.cssText =
        `position:fixed;top:0;left:0;width:100%;height:${height}px;background:${color};` +
        `transform-origin:0 50%;transform:scaleX(0);opacity:0;z-index:99999;pointer-events:none;` +
        `transition:transform ${transition}ms ease-out,opacity ${transition}ms`
    }
    document.body.append(bar)
    this.bar = bar
    return bar
  }
}
