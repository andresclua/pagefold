// The home page is a story told while you scroll. GSAP and ScrollTrigger tie the chapters to the
// scroll, PerlinDOM makes the blobs of the closing drift, and SliderKit runs the two sliders.
// Everything is created here and undone by the function it returns, which is what runs when a
// visit leaves the page.
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import PerlinDOM from '@andresclua/perlindom'
import { Slider } from '@andresclua/sliderkit'
import { marquee, smooth } from '@andresclua/sliderkit-plugins'

gsap.registerPlugin(ScrollTrigger, SplitText)

export function home(root: HTMLElement): () => void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const undo: Array<() => void> = []

  // The blobs of the closing wander on their own. `data-drift` is how far, in px.
  root.querySelectorAll<HTMLElement>('[data-drift]').forEach((el, i) => {
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
  })

  // The sliders do not depend on scroll, so they also run with reduced motion (the marquee stays still by itself)
  const features = root.querySelector<HTMLElement>('#features-slider')
  if (features) {
    // Three cards at once on a wide screen. The drag moves them with inertia and, while they move,
    // the content is displaced by an SVG filter (no WebGL) and split in two colors, in proportion to the speed.
    const perView = () => (window.innerWidth >= 1100 ? 3 : window.innerWidth >= 720 ? 2 : 1)
    const total = features.querySelectorAll('.panel').length
    const warp = root.querySelector('#warp feDisplacementMap')
    const bar = root.querySelector<HTMLElement>('.prog i')
    const s = new Slider(features, {
      items: 1,
      gutter: 16,
      responsive: { 720: { items: 2 }, 1100: { items: 3 } },
      touch: false,
      mouseDrag: false,
      plugins: [
        smooth({
          preset: 'smooth',
          onUpdate: (sm) => {
            features.classList.toggle('is-dragging', sm.dragging)
            const span = total - perView()
            if (bar) bar.style.transform = `scaleX(${span > 0 ? Math.min(Math.max((((1 - sm.positions[0]!) % total + total) % total - 1) / span, 0), 1) : 1})`
            const k = reduced ? 0 : Math.min(Math.abs(sm.velocity) / 2.5, 1) ** 0.8
            // Barely there: enough to feel the speed, not enough to read as an effect
            warp?.setAttribute('scale', String(k * 12))
            // The cards lean the way they are going: left when you drag to the next one
            const lean = reduced ? 0 : Math.max(-6, Math.min(6, sm.velocity * 2.2))
            const n = perView()
            // The slider clones cards to loop, so read each card's place from the DOM (clones included)
            const edge = features.parentElement!.getBoundingClientRect().left
            const cards = [...features.querySelectorAll<HTMLElement>('.panel')]
            const places = cards.map((c) => {
              const r = c.getBoundingClientRect()
              return (r.left - edge) / (r.width + 16)
            })
            cards.forEach((card, i) => {
              const p = places[i]!
              const inner = card.querySelector<HTMLElement>('.in')!
              const bg = card.querySelector<HTMLElement>('.bg')!
              // A card fades only as it leaves or enters at the edges of the row
              const out = Math.min(Math.max(-p, 0) + Math.max(p - (n - 1), 0), 1)
              if (reduced || out >= 1) {
                card.style.transform = inner.style.filter = inner.style.opacity = bg.style.transform = ''
                return
              }
              card.style.transform = lean ? `skewX(${lean.toFixed(2)}deg)` : ''
              bg.style.transform = `translate3d(${(p - (n - 1) / 2) * -9}%,0,0)`
              inner.style.opacity = String(1 - out * 0.85)
              inner.style.filter = k > 0.02 ? 'url(#warp)' : ''
            })
          },
        }),
      ],
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
    // Chapter 1: one pinned stage. Three pages swap as you scroll, one line of the story at a time.
    const lines = gsap.utils.toArray<HTMLElement>('.story .line')
    const [s1, s2, s3] = gsap.utils.toArray<HTMLElement>('.story .sheet')
    if (lines.length === 3 && s1 && s2 && s3) {
      gsap.set(lines.slice(1), { opacity: 0, y: 40 })
      // The pages are turned like a book: the front one swings away on its left edge
      gsap.set([s1, s2, s3], { transformPerspective: 1400, transformOrigin: '0% 60%' })
      gsap.set(s2, { x: 22, y: -14, scale: 0.96, '--dim': 0.32 })
      gsap.set(s3, { x: 44, y: -28, scale: 0.92, '--dim': 0.6 })
      const swap = (out: HTMLElement, next: HTMLElement, after?: HTMLElement) => {
        const t = gsap
          .timeline()
          .to(out, { x: -110, y: 14, rotationY: -38, rotation: -3, scale: 0.97, duration: 1, ease: 'power2.inOut' }, 0)
          .to(out, { opacity: 0, duration: 0.4, ease: 'none' }, 0.6)
          .to(next, { x: 0, y: 0, scale: 1, '--dim': 0, duration: 1, ease: 'power2.inOut' }, 0.1)
        if (after) t.to(after, { x: 22, y: -14, scale: 0.96, '--dim': 0.32, duration: 1, ease: 'power2.inOut' }, 0.1)
        return t
      }
      gsap
        .timeline({
          defaults: { ease: 'none' },
          scrollTrigger: { trigger: '.story', start: 'top top', end: 'bottom bottom', scrub: 1 },
        })
        .add(swap(s1, s2, s3), 0.6)
        .add(swap(s2, s3), 1.6)
        .to(lines[0], { opacity: 0, y: -40, duration: 0.4 }, 0.6)
        .to(lines[1], { opacity: 1, y: 0, duration: 0.4 }, 1.1)
        .to(lines[1], { opacity: 0, y: -40, duration: 0.4 }, 1.6)
        .to(lines[2], { opacity: 1, y: 0, duration: 0.4 }, 2.1)
        .fromTo('.story .rail i', { scaleY: 0 }, { scaleY: 1, duration: 3 }, 0)
        .fromTo('.story .flap', { scale: 0.7 }, { scale: 1.3, duration: 3 }, 0)
    }

    // The big titles rise word by word out of a mask, line by line. autoSplit splits again when
    // the fonts load or the window changes size, so the lines always match what is on screen.
    root.querySelectorAll<HTMLElement>('.title').forEach((el) => {
      SplitText.create(el, {
        type: 'lines,words',
        mask: 'lines',
        autoSplit: true,
        onSplit: (self) =>
          gsap.from(self.words, {
            yPercent: 115,
            rotate: 5,
            duration: 1.1,
            ease: 'power4.out',
            stagger: 0.07,
            scrollTrigger: { trigger: el, start: 'top 85%', once: true },
          }),
      })
    })

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
