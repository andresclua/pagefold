const pagefold = new Pagefold()

const log = document.querySelector('#log')
const lines = document.querySelector('#lines')
const cleanupOn = document.querySelector('#cleanup')
let alive = 0
let timers = 0
let tabsCount = 0

const write = (text, kind) => {
  const li = document.createElement('li')
  li.className = kind
  li.textContent = text
  lines.prepend(li)
}
const show = () => {
  document.querySelector('#alive').textContent = alive
  document.querySelector('#timers').textContent = timers
  log.classList.toggle('is-leaking', !cleanupOn.checked)
}
cleanupOn.addEventListener('change', show)
document.querySelector('#reset').addEventListener('click', () => location.reload())

// The function a component returns runs when its element leaves the page.
// With the switch off it does nothing, as if you had forgotten to write it.
const whenLeaving = (name, cleanup) => () => {
  if (!cleanupOn.checked) return write(`NOT cleaned  ${name}: it is still alive`, 'leak')
  cleanup()
  alive--
  show()
  write(`cleaned      ${name}`, 'down')
}

pagefold.mount('[data-counter]', (el) => {
  const button = el.querySelector('button')
  const number = el.querySelector('b')
  let n = 0
  const onClick = () => (number.textContent = ++n)
  button.addEventListener('click', onClick)
  alive++
  show()
  write('set up       counter', 'up')
  return whenLeaving('counter', () => button.removeEventListener('click', onClick))
})

pagefold.mount('[data-clock]', (el) => {
  const time = el.querySelector('.time')
  const tick = () => (time.textContent = new Date().toLocaleTimeString([], { hour12: false }))
  tick()
  const timer = setInterval(tick, 1000)
  alive++
  timers++
  show()
  write('set up       clock, timer started', 'up')
  return whenLeaving('clock (its timer keeps running)', () => {
    clearInterval(timer)
    timers--
  })
})

pagefold.mount('[data-tabs]', (el) => {
  const buttons = [...el.querySelectorAll('.tablist button')]
  const panel = el.querySelector('.panel')
  const id = ++tabsCount
  const onClick = (event) => {
    buttons.forEach((b) => b.setAttribute('aria-selected', String(b === event.currentTarget)))
    panel.textContent = `Panel ${event.currentTarget.textContent.toLowerCase()}`
  }
  // A listener on the document outlives the element, unless somebody removes it
  const onKey = (event) => write(`key "${event.key}" handled by tabs #${id}`, 'up')
  buttons.forEach((b) => b.addEventListener('click', onClick))
  document.addEventListener('keydown', onKey)
  alive++
  show()
  write(`set up       tabs #${id}`, 'up')
  return whenLeaving(`tabs #${id} (it still listens to the keyboard)`, () => {
    buttons.forEach((b) => b.removeEventListener('click', onClick))
    document.removeEventListener('keydown', onKey)
  })
})
