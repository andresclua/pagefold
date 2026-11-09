// The home page is a story told while you scroll. GSAP and ScrollTrigger tie the chapters to the
// scroll, PerlinDOM makes the pieces of the logo drift, and SliderKit runs the two sliders.
// Everything is created here and undone by the function it returns, which is what runs when a
// visit leaves the page.
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import PerlinDOM from '@andresclua/perlindom'
import { Slider } from '@andresclua/sliderkit'
import { arrows, pagination, marquee } from '@andresclua/sliderkit-plugins'

gsap.registerPlugin(ScrollTrigger)

export function home(root: HTMLElement): () => void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const undo: Array<() => void> = []

  // Pieces that wander on their own. `data-drift` is how far, in px.
  const drifters = [...root.querySelectorAll<HTMLElement>('[data-drift]')].map((el, i) => {
    const d = Number(el.dataset.drift) || 20
    const p = new PerlinDOM({
      element: el,
      x: { min: -d, max: d },
      y: { min: -d, max: d },
      speed: el.dataset.speed ? Number(el.dataset.speed) : 0.006,
      seed: i * 97 + 3,
      lerpSpeed: 0.05,
    })
    if (reduced) p.amplitude = 0
    undo.push(() => p.destroy())
    return { el, p }
  })

  // The sliders do not depend on scroll, so they also run with reduced motion (the marquee stays still by itself)
  const features = root.querySelector<HTMLElement>('#features-slider')
  if (features) {
    const s = new Slider(features, {
      items: 1,
      gutter: 16,
      speed: 500,
      mouseDrag: true,
      responsive: { 720: { items: 2 }, 1100: { items: 3 } },
      plugins: [arrows(), pagination({ type: 'dots', clickable: true })],
    })
    undo.push(() => s.destroy())
  }
  const strip = root.querySelector<HTMLElement>('#modules-marquee')
  if (strip) {
    const s = new Slider(strip, {
      autoWidth: true,
      loop: true,
      touch: false,
      mouseDrag: false,
      plugins: [marquee({ speed: 60, hoverSpeed: 14, scrollBoost: 0.25 })],
    })
    undo.push(() => s.destroy())
  }

  if (reduced) {
    root.classList.add('is-static')
    return () => {
      root.classList.remove('is-static')
      undo.forEach((fn) => fn())
    }
  }

  const ctx = gsap.context(() => {
    // The mark of the hero is whole when you start; as you leave it, the pieces settle into place
    ScrollTrigger.create({
      trigger: '.hero',
      start: 'top top',
      end: 'bottom 30%',
      scrub: true,
      onUpdate: (self) => {
        for (const { el, p } of drifters) if (el.closest('.mark')) p.amplitude = 1 - self.progress
      },
    })

    // Chapter 1: one pinned stage. Three pages swap as you scroll, one line of the story at a time.
    const lines = gsap.utils.toArray<HTMLElement>('.story .line')
    const [s1, s2, s3] = gsap.utils.toArray<HTMLElement>('.story .sheet')
    if (lines.length === 3 && s1 && s2 && s3) {
      gsap.set(lines.slice(1), { opacity: 0, y: 40 })
      gsap.set(s2, { x: 20, y: -11, scale: 0.97, opacity: 0.75 })
      gsap.set(s3, { x: 40, y: -22, scale: 0.94, opacity: 0.45 })
      const swap = (out: HTMLElement, next: HTMLElement, after?: HTMLElement) => {
        const t = gsap
          .timeline()
          .to(out, { x: -90, rotation: -4, opacity: 0, duration: 1 }, 0)
          .to(next, { x: 0, y: 0, scale: 1, opacity: 1, duration: 1 }, 0)
        if (after) t.to(after, { x: 20, y: -11, scale: 0.97, opacity: 0.75, duration: 1 }, 0)
        return t
      }
      gsap
        .timeline({
          defaults: { ease: 'none' },
          scrollTrigger: { trigger: '.story', start: 'top top', end: 'bottom bottom', scrub: 0.5 },
        })
        .add(swap(s1, s2, s3), 1)
        .add(swap(s2, s3), 2)
        .to(lines[0], { opacity: 0, y: -40, duration: 0.6 }, 0.7)
        .to(lines[1], { opacity: 1, y: 0, duration: 0.6 }, 1.1)
        .to(lines[1], { opacity: 0, y: -40, duration: 0.6 }, 1.7)
        .to(lines[2], { opacity: 1, y: 0, duration: 0.6 }, 2.1)
        .fromTo('.story .rail i', { scaleY: 0 }, { scaleY: 1, duration: 3 }, 0)
        .fromTo('.story .flap', { scale: 0.4 }, { scale: 1.6, duration: 3 }, 0)
    }

    // The rest of the chapters arrive as they come into view
    gsap.set('[data-reveal]', { opacity: 0, y: 40 })
    ScrollTrigger.batch('[data-reveal]', {
      start: 'top 90%',
      once: true,
      onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.08 }),
    })

    // The closing line travels sideways, slower than the page
    gsap.fromTo(
      '.outro .big',
      { xPercent: 10 },
      { xPercent: -10, ease: 'none', scrollTrigger: { trigger: '.outro', start: 'top bottom', end: 'bottom top', scrub: 0.6 } }
    )
  }, root)

  return () => {
    ctx.revert()
    undo.forEach((fn) => fn())
  }
}
