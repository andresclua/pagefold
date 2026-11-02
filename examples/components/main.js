const pagefold = new Pagefold()

const lines = document.querySelector('#lines')
const timersOut = document.querySelector('#timers')
let timers = 0
const log = (text, kind) => {
  const li = document.createElement('li')
  li.className = kind
  li.textContent = text
  lines.prepend(li)
}

// Each element that matches is set up when it arrives. The function it returns runs when it leaves.
pagefold.mount('[data-counter]', (el) => {
  const button = el.querySelector('button')
  const number = el.querySelector('b')
  let n = 0
  const onClick = () => (number.textContent = ++n)
  button.addEventListener('click', onClick)
  log('set up   counter', 'up')
  return () => {
    button.removeEventListener('click', onClick)
    log(`cleaned  counter (it had counted ${n})`, 'down')
  }
})

pagefold.mount('[data-clock]', (el) => {
  const time = el.querySelector('.time')
  const tick = () => (time.textContent = new Date().toLocaleTimeString([], { hour12: false }))
  tick()
  const timer = setInterval(tick, 1000)
  timersOut.textContent = ++timers
  log('set up   clock, timer started', 'up')
  return () => {
    clearInterval(timer)
    timersOut.textContent = --timers
    log('cleaned  clock, timer stopped', 'down')
  }
})

pagefold.mount('[data-tabs]', (el) => {
  const buttons = [...el.querySelectorAll('.tablist button')]
  const panel = el.querySelector('.panel')
  const onClick = (event) => {
    buttons.forEach((b) => b.setAttribute('aria-selected', String(b === event.currentTarget)))
    panel.textContent = `Panel ${event.currentTarget.textContent.toLowerCase()}`
  }
  buttons.forEach((b) => b.addEventListener('click', onClick))
  log('set up   tabs', 'up')
  return () => {
    buttons.forEach((b) => b.removeEventListener('click', onClick))
    log('cleaned  tabs', 'down')
  }
})
