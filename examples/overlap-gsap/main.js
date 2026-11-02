const pagefold = new Pagefold({
  animateHistoryBrowsing: true,
  plugins: [new PagefoldOverlap()],
})

let timeline

// Overlap puts the new container next to the old one. Both are in the page: push them with GSAP.
pagefold.hooks.on('content:insert', (visit, { containers }) => {
  const { next, previous } = containers[0]
  const dir = visit.history.direction === 'backwards' ? -1 : 1
  // The new container goes above the old one while they cross
  gsap.set(next, { zIndex: 2 })
  timeline = gsap
    .timeline()
    .fromTo(next, { xPercent: 100 * dir }, { xPercent: 0, duration: 0.7, ease: 'power3.inOut' }, 0)
    .to(previous, { xPercent: -30 * dir, opacity: 0.5, duration: 0.7, ease: 'power3.inOut' }, 0)
    // Give the page back as it was: only what GSAP set is cleared, not the page's own style
    .set(next, { clearProps: 'transform,zIndex' })
})

// Instead of waiting for CSS transitions, wait for the timeline
pagefold.hooks.replace('animation:in:await', () => timeline)
