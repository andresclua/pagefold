gsap.registerPlugin(ScrollTrigger)

const pagefold = new Pagefold()
const counter = document.querySelector('#triggers')
const count = () => (counter.textContent = ScrollTrigger.getAll().length)

// Every [data-reveal] element is animated when it arrives and cleaned up when it leaves.
// Without the cleanup, each visit would leave its triggers behind and the counter would only grow.
pagefold.mount('[data-reveal]', (el) => {
  const tween = gsap.from(el, {
    opacity: 0,
    y: 48,
    duration: 0.7,
    ease: 'power3.out',
    scrollTrigger: { trigger: el, start: 'top 88%' },
  })
  count()
  return () => {
    tween.scrollTrigger?.kill()
    tween.kill()
    count()
  }
})

// The new page has another height: measure where each trigger starts once the visit is over
pagefold.hooks.on('visit:end', () => ScrollTrigger.refresh())
