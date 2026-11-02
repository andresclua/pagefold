// The diagrams of the documentation move as you read them. GSAP does the motion and ScrollTrigger
// ties it to the scroll: with `scrub` the animation goes forward as you scroll down and back as you
// scroll up. Everything is created inside a context, so `revert()` puts the page back exactly as it
// was: that is what runs when a visit leaves the page.
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** A scrubbed range: it starts when the target is low in the window and ends higher up. */
const scrub = (trigger: Element, start = 'top 92%', end = 'top 58%'): ScrollTrigger.Vars => ({
  trigger,
  start,
  end,
  scrub: 0.6,
})

/** The hooks of a visit, in order: the line fills as you read, and each step arrives with the scroll. */
function timeline(el: HTMLElement): void {
  const line = document.createElement('span')
  line.className = 'motion-line'
  // Under the numbered circles, over the grey line
  line.style.cssText =
    'position:absolute;left:-2px;top:0;bottom:0;width:2px;z-index:0;background:var(--accent);transform-origin:top;pointer-events:none'
  el.style.position = 'relative'
  el.append(line)
  gsap.fromTo(
    line,
    { scaleY: 0 },
    { scaleY: 1, ease: 'none', scrollTrigger: { trigger: el, start: 'top 65%', end: 'bottom 65%', scrub: 0.4 } }
  )

  el.querySelectorAll<HTMLElement>('.phase').forEach((phase) => {
    gsap
      .timeline({ scrollTrigger: scrub(phase, 'top 90%', 'top 62%') })
      .from(phase.querySelector('.num'), { scale: 0.3, opacity: 0, ease: 'back.out(2)' }, 0)
      .from(phase.querySelector('header div'), { opacity: 0, x: -14 }, 0.1)

    phase.querySelectorAll<HTMLElement>('.step').forEach((step) => {
      // Every part of a step comes in on its own, one after the other, as the card rises
      gsap
        .timeline({ defaults: { ease: 'none' }, scrollTrigger: scrub(step) })
        .from(step, { opacity: 0.08, y: 34, scale: 0.97 }, 0)
        .from(step.querySelector('.dot'), { scale: 0, rotate: -120 }, 0.15)
        .from(step.querySelector('.hook'), { opacity: 0, x: -18 }, 0.2)
        .from(step.querySelector('.waits'), { opacity: 0, scale: 0.4 }, 0.4)
        .from(step.querySelectorAll('.body > p'), { opacity: 0, y: 10 }, 0.35)
        .from(step.querySelectorAll('.classes .label, .classes .none'), { opacity: 0, x: -8 }, 0.5)
        .from(step.querySelectorAll('.classes .pill'), { opacity: 0, scale: 0.5, y: 8, stagger: 0.12 }, 0.55)
    })
  })
}

/** Time lanes: the bars grow from the left as you scroll, in the order of the time they start. */
function lanes(el: HTMLElement): void {
  const segments = Array.from(el.querySelectorAll<HTMLElement>('.seg'))
  // Earlier in time, earlier on screen
  const rank = new Map(
    segments
      .map((s) => ({ s, left: parseFloat(s.style.left) }))
      .sort((a, b) => a.left - b.left)
      .map(({ s }, i) => [s, i])
  )
  const tl = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: scrub(el, 'top 90%', 'top 45%') })
  tl.from(el.querySelectorAll('.label'), { opacity: 0, x: -12, stagger: 0.1, duration: 0.4 }, 0)
  segments.forEach((seg) => {
    tl.from(seg, { scaleX: 0, opacity: 0, transformOrigin: 'left center', duration: 0.6 }, 0.25 + (rank.get(seg) ?? 0) * 0.18)
  })
  tl.from(el.querySelectorAll('.mark'), { opacity: 0, duration: 0.4 }, 1.2)
  tl.from(el.querySelector('.axis'), { opacity: 0, duration: 0.4 }, 1.2)
}

const kinds: Record<string, (el: HTMLElement) => void> = { timeline, lanes }

/** Animate one diagram. Returns the function that puts it back as it was. */
export function animate(el: HTMLElement): () => void {
  const kind = kinds[el.dataset.motion ?? '']
  if (!kind || reduced()) return () => {}
  const context = gsap.context(() => kind(el), el)
  return () => {
    context.revert()
    el.querySelector('.motion-line')?.remove()
    el.style.position = ''
  }
}

/** Measure again where each trigger starts, after the page has settled. */
export function refresh(): void {
  ScrollTrigger.refresh()
}
