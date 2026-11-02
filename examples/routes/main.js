const pagefold = new Pagefold({
  plugins: [
    new PagefoldRouteName({
      // The name of each page, found by its path. The first match wins.
      routes: [
        { name: 'home', path: '(.*)/index.html' },
        { name: 'work', path: '(.*)/work.html' },
        { name: 'project', path: ['(.*)/project.html', '(.*)/project-2.html'] },
        { name: 'contact', path: '(.*)/contact.html' },
      ],
    }),
  ],
})

// Show what the plugin gave the visit, and the classes your CSS can use
const names = document.querySelector('#route-names')
const classes = document.querySelector('#route-classes')

pagefold.hooks.on('animation:out:start', (visit) => {
  names.textContent = `${visit.from.route} → ${visit.to.route}`
  classes.textContent = [...document.documentElement.classList].filter((c) => /route/.test(c)).join(' ')
})
