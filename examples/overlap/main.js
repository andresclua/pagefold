const pagefold = new Pagefold({
  animateHistoryBrowsing: true,
  plugins: [new PagefoldOverlap()],
})

// How many pages are in the document? Normally one. While two pages cross, it is two.
const count = document.querySelector('#count')
const update = () => (count.textContent = document.querySelectorAll('#pagefold').length)
new MutationObserver(update).observe(document.querySelector('.stack'), { childList: true })
