new Pagefold({
  containers: ['#list', '#detail'],
  plugins: [
    // Every visit replaces only #detail, so the list keeps its scroll and what you typed
    new PagefoldFragment({ rules: [{ from: '*', to: '*', containers: ['#detail'] }] }),
  ],
})
