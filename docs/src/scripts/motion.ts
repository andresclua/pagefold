// The diagrams of the documentation move as you read them. GSAP does the motion and ScrollTrigger
// decides when. Everything is created inside a context, so `revert()` puts the page back exactly
// as it was: that is what runs when a visit leaves the page.
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** The hooks of a visit, in order: the line fills as you read, each phase and step comes in. */
function timeline(el: HTMLElement): void {
  const line = document.createElement('span')
  line.className = 'motion-line'
  line.style.cssText =
    'position:absolute;left:-2px;top:0;bottom:0;width:2px;background:var(--accent);transform-origin:top;pointer-events:none'
  el.style.position = 'relative'
  el.append(line)
  gsap.fromTo(
    line,
    { scaleY: 0 },
    {
      scaleY: 1,
      ease: 'none',
      scrollTrigger: { trigger: el, start: 'top 65%', end: 'bottom 65%', scrub: 0.4 },
    }
  )

  el.querySelectorAll<HTMLElement>('.phase').forEach((phase) => {
    const once = { trigger: phase, start: 'top 88%', once: true }
    gsap.from(phase.querySelector('.num'), { scale: 0, duration: 0.45, ease: 'back.out(2.2)', scrollTrigger: once })
    gsap.from(phase.querySelector('header div'), { opacity: 0, x: -12, duration: 0.45, scrollTrigger: once })
    gsap.from(phase.querySelectorAll('.step'), {
      opacity: 0,
      y: 16,
      duration: 0.45,
      stagger: 0.08,
      ease: 'power2.out',
      scrollTrigger: { ...once, start: 'top 80%' },
    })
  })
}

/** Time lanes: every bar grows from the left, in the order of the time it starts. */
function lanes(el: HTMLElement): void {
  const once = { trigger: el, start: 'top 85%', once: true }
  const segments = Array.from(el.querySelectorAll<HTMLElement>('.seg'))
  // Earlier in time, earlier on screen
  const order = segments.map((s) => parseFloat(s.style.left)).map((left, i) => ({ i, left }))
  order.sort((a, b) => a.left - b.left)
  const delays = new Map(order.map(({ i }, rank) => [segments[i], rank * 0.09]))

  gsap.from(el.querySelectorAll('.label'), { opacity: 0, x: -10, duration: 0.4, stagger: 0.06, scrollTrigger: once })
  gsap.from(segments, {
    scaleX: 0,
    transformOrigin: 'left center',
    opacity: 0,
    duration: 0.55,
    ease: 'power3.out',
    delay: (i) => 0.15 + (delays.get(segments[i]!) ?? 0),
    scrollTrigger: once,
  })
  gsap.from(el.querySelectorAll('.mark'), { opacity: 0, duration: 0.5, delay: 0.5, scrollTrigger: once })
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
