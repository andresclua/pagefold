const pagefold = new Pagefold({
  animateHistoryBrowsing: true, // the back button gets the same show
  plugins: [new PagefoldOverlap(), new PagefoldHead()],
})

const bar = document.querySelector('.bar')
const nav = document.querySelector('#nav')
const pill = nav.querySelector('.pill')
const roll = document.querySelector('.roll')
const progress = document.querySelector('.progress')
const links = [...nav.querySelectorAll('a')]
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

// Overlap keeps the old page while the new one comes in. This is the timeline of the visit.
let timeline

// Split a title into words, each one inside a mask, so they can rise one by one
const split = (el) => {
  if (!el || el.querySelector('.w')) return []
  el.innerHTML = el.textContent
    .trim()
    .split(/\s+/)
    .map((word) => `<span class="w"><span>${word}</span></span>`)
    .join(' ')
  return [...el.querySelectorAll('.w > span')]
}

// The bar is never replaced, so it is animated by hand: the pill slides to the current link
// and the counter rolls to the number of the new page
const placeNav = (url, animate) => {
  const index = links.findIndex((a) => new URL(a.href).pathname === url)
  const mark = () => links.forEach((a, i) => (i === index ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')))
  if (index < 0) return gsap.timeline()
  const to = { x: links[index].offsetLeft, width: links[index].offsetWidth }
  const number = String(index + 1).padStart(2, '0')
  if (!animate) {
    mark()
    gsap.set(pill, to)
    roll.innerHTML = `<span>${number}</span>`
    return gsap.timeline()
  }
  const old = roll.firstElementChild
  const incoming = document.createElement('span')
  incoming.textContent = number
  roll.append(incoming)
  return gsap
    .timeline()
    .to(pill, { ...to, duration: 0.7, ease: 'power3.inOut' }, 0)
    // The text of the link turns dark when the pill is under it, not before
    .add(mark, 0.35)
    .fromTo(old, { yPercent: 0 }, { yPercent: -100, duration: 0.5, ease: 'power3.inOut' }, 0.1)
    .fromTo(incoming, { yPercent: 100 }, { yPercent: -0, duration: 0.5, ease: 'power3.inOut' }, 0.1)
    .add(() => {
      old.remove()
      gsap.set(incoming, { clearProps: 'all' })
    })
}

placeNav(location.pathname, false)
addEventListener('resize', () => placeNav(location.pathname, false))

// People who ask for less motion get the page without any of it
pagefold.hooks.on('visit:start', (visit) => {
  timeline = undefined
  if (reduced) visit.animation.animate = false
})
pagefold.hooks.on('visit:end', (visit) => {
  if (!timeline) placeNav(visit.to.url, false)
})

// Both containers are in the page now: the new one is on top, hidden by a clip
pagefold.hooks.on('content:insert', (visit, { containers }) => {
  if (!visit.animation.animate) return
  const { next, previous } = containers[0]
  const back = visit.history.direction === 'backwards'
  const event = visit.trigger.event
  // The circle grows from the click. Without a click (back button) the page is wiped down.
  const x = event?.clientX ?? innerWidth / 2
  const y = (event?.clientY ?? innerHeight) - bar.offsetHeight
  const radius = Math.hypot(innerWidth, innerHeight)
  const hidden = back ? 'inset(0% 0% 100% 0%)' : `circle(0px at ${x}px ${y}px)`
  const shown = back ? 'inset(0% 0% 0% 0%)' : `circle(${radius}px at ${x}px ${y}px)`

  const words = split(next.querySelector('.split'))
  const rest = next.querySelectorAll('.kicker, .lead, .meta li, .projects li, .next')
  const panels = next.querySelectorAll('.panels i')
  const big = next.querySelector('.big')

  gsap.set(next, { zIndex: 2, clipPath: hidden })
  gsap.set(words, { yPercent: 115 })
  gsap.set(rest, { opacity: 0, y: 18 })
  gsap.set(panels, { scaleY: 0, transformOrigin: 'bottom' })
  if (big) gsap.set(big, { opacity: 0, x: 80 })

  timeline = gsap
    .timeline()
    // 1. The curtain opens, and the old page steps back
    .fromTo(next, { clipPath: hidden }, { clipPath: shown, duration: 0.95, ease: 'power3.inOut' }, 0)
    .to(previous, { scale: 0.93, opacity: 0.35, duration: 0.95, ease: 'power3.inOut' }, 0)
    // 2. A line in the bar fills while it happens
    .fromTo(progress, { scaleX: 0, opacity: 1 }, { scaleX: 1, duration: 0.95, ease: 'power2.inOut' }, 0)
    .to(progress, { opacity: 0, duration: 0.3 })
    // 3. The bar itself: pill and counter
    .add(placeNav(visit.to.url, true), 0)
    // 4. The content of the new page arrives piece by piece
    .to(words, { yPercent: 0, duration: 0.75, stagger: 0.07, ease: 'power4.out' }, 0.5)
    .to(rest, { opacity: 1, y: 0, duration: 0.55, stagger: 0.06, ease: 'power3.out' }, 0.6)
    .to(panels, { scaleY: 1, duration: 0.65, stagger: 0.09, ease: 'power3.out' }, 0.75)
    .to(big, { opacity: 0.5, x: 0, duration: 0.8, ease: 'power3.out' }, 0.5)
    // Give the page back as it was: only what GSAP set is cleared
    .set(next, { clearProps: 'clipPath,zIndex' })
    .set([words, rest, panels, big], { clearProps: 'transform,opacity,visibility' })
})

// Pagefold waits for the whole timeline before it removes the old page
pagefold.hooks.replace('animation:in:await', () => timeline)
