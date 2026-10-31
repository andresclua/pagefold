// Builds a Pagefold instance from `window.__pf`, which each test sets before the page loads.
const cfg = window.__pf ?? {}
const { default: Pagefold } = await import('/dist/index.js')

const loadScript = (src) =>
  new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = resolve
    s.onerror = reject
    document.head.append(s)
  })

const DURATION = 0.4
/** The same fade in and out, written for three different animation engines. */
async function engineAnimations(engine) {
  const el = () => document.querySelector('#pagefold')
  if (engine === 'gsap') {
    await loadScript('/vendor/gsap.js')
    return [
      { out: (done) => window.gsap.to(el(), { opacity: 0, duration: DURATION, onComplete: done }),
        in: (done) => window.gsap.fromTo(el(), { opacity: 0 }, { opacity: 1, duration: DURATION, onComplete: done }) },
    ]
  }
  if (engine === 'motion') {
    await loadScript('/vendor/motion.js')
    const { animate } = window.Motion
    return [
      { out: () => animate(el(), { opacity: 0 }, { duration: DURATION }),
        in: () => animate(el(), { opacity: [0, 1] }, { duration: DURATION }) },
    ]
  }
  // The Web Animations API needs no library at all
  return [
    { out: () => el().animate([{ opacity: 1 }, { opacity: 0 }], { duration: DURATION * 1000, fill: 'forwards' }).finished,
      in: () => el().animate([{ opacity: 0 }, { opacity: 1 }], { duration: DURATION * 1000 }).finished },
  ]
}

const plugins = []
for (const [name, options = {}] of cfg.plugins ?? []) {
  const { default: Plugin } = await import(`/dist/${name}.js`)
  plugins.push(new Plugin(name === 'js' ? { animations: await engineAnimations(options.engine) } : options))
}

const options = { ...(cfg.options ?? {}), plugins }
if (cfg.failOnClientErrors) options.failOnStatus = (status) => status >= 400
window.pagefold = new Pagefold(options)

// Optionally keep a list of the hooks that ran, in order
window.__events = []
if (cfg.record) {
  for (const hook of window.pagefold.hooks.names()) {
    window.pagefold.hooks.before(hook, () => window.__events.push(hook), { priority: -1000 })
  }
}
window.__ready = true
