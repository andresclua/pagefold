const pagefold = new Pagefold({
  plugins: [
    new PagefoldHead(), // title, meta tags, html lang
    new PagefoldBodyClass(), // the class of the body
    new PagefoldA11y(), // announces the page and moves focus
  ],
})

// Show the result, so you can see what each plugin did
const show = (id, text) => (document.querySelector(`#v-${id}`).textContent = text || '(none)')
const refresh = () => {
  show('title', document.title)
  show('desc', document.querySelector('meta[name=description]')?.content)
  show('lang', document.documentElement.lang)
  show('body', document.body.className)
  const focus = document.activeElement
  show('focus', focus && focus !== document.body ? `<${focus.tagName.toLowerCase()}${focus.id ? ' id="' + focus.id + '"' : ''}>` : '')
}
refresh()
pagefold.hooks.on('page:view', () => setTimeout(refresh, 150))

// The announcement is a live region that A11y fills a moment after the visit
const said = document.querySelector('.pagefold-announcer')
if (said) new MutationObserver(() => show('said', said.textContent)).observe(said, { childList: true, characterData: true, subtree: true })
