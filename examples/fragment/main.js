const time = () => new Date().toLocaleTimeString([], { hour12: false })
const list = document.querySelector('#list')

// The list is drawn once. Its time never changes, however many people you open.
list.querySelector('.stamp').textContent = time()

const pagefold = new Pagefold({
  containers: ['#list', '#detail'],
  plugins: [
    // Every visit replaces only #detail, so the list keeps its scroll and what you typed
    new PagefoldFragment({ rules: [{ from: '*', to: '*', containers: ['#detail'] }] }),
  ],
})

// The detail is new on every visit, so its time changes
const stampDetail = () => (document.querySelector('#detail .stamp').textContent = time())
stampDetail()
pagefold.hooks.on('content:replace', stampDetail)

// The list stays, so it has to learn by itself who is open now
const markActive = () =>
  list.querySelectorAll('li a').forEach((a) => {
    a.classList.toggle('is-active', new URL(a.href).pathname === location.pathname)
  })
markActive()
pagefold.hooks.on('page:view', markActive)

// A filter: its text survives the visits, because the list is not replaced
list.querySelector('input').addEventListener('input', (event) => {
  const text = event.target.value.toLowerCase()
  list.querySelectorAll('li').forEach((li) => (li.hidden = !li.textContent.toLowerCase().includes(text)))
})
