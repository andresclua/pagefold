// GSAP does the animation. Pagefold waits for it, through the JS plugin.
const page = () => document.querySelector('#pagefold')

new Pagefold({
  plugins: [
    new PagefoldJs({
      animations: [
        {
          // From any page to any page
          from: '(.*)',
          to: '(.*)',
          // Leaving: the old content lifts and fades. Returning the tween makes Pagefold wait.
          out: () => gsap.to(page(), { opacity: 0, y: -24, duration: 0.3, ease: 'power2.in' }),
          // Arriving: the content comes up, then its parts follow one by one
          in: () =>
            gsap
              .timeline()
              .fromTo(page(), { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out' })
              .from(page().querySelectorAll('h1, .lead, .card'), { opacity: 0, y: 18, stagger: 0.07, duration: 0.4, ease: 'power3.out' }, '-=0.25')
              .set(page(), { clearProps: 'all' }),
        },
        {
          // Chosen by a link with data-pagefold-animation="zoom"
          name: 'zoom',
          out: () => gsap.to(page(), { opacity: 0, scale: 0.94, duration: 0.3, ease: 'power2.in' }),
          in: () =>
            gsap.fromTo(page(), { opacity: 0, scale: 1.06 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'power3.out', clearProps: 'all' }),
        },
      ],
    }),
  ],
})
