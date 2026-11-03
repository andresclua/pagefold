---
name: pagefold
description: Add and debug page transitions with Pagefold, a library that turns the links of a server-rendered site into animated page changes. Use when a project has or wants Pagefold, page transitions, "pagefold" imports, `#pagefold` containers, `transition-*` classes or `pagefold/<plugin>` imports.
---

# Pagefold

Pagefold fetches the next page on a link click, animates the old content out, swaps the content of one or more containers, animates the new content in, and keeps the URL, the back button and the scroll position working. It is for server-rendered HTML (plain HTML, PHP, Astro, Eleventy, Rails, Django, Laravel...), not for SPA routers (React Router, Next, Nuxt, Vue Router).

Full docs: https://pagefold.js.org/docs/getting-started

## Setup

```bash
npm install pagefold
```

```html
<main id="pagefold" class="transition-fade"><!-- replaced on each visit --></main>
```

```css
.transition-fade { transition: opacity .3s; opacity: 1; }
html.is-animating .transition-fade { opacity: 0; }
```

```js
import Pagefold from 'pagefold'
const pagefold = new Pagefold()
```

Rules that explain most problems:

- **Every page must contain every container.** If the new page lacks one, the visit fails and the browser loads the page normally.
- **Pagefold only waits for elements matching `animationSelector`** (default `[class*="transition-"]`). Without a `transition-*` class on the container, the old content is removed at once and nothing animates or overlaps.
- State classes go on `<html>`: `is-changing` for the whole visit, `is-animating` while content is out, `is-leaving`, `is-rendering`, `to-<name>` for a named animation. Remove none by hand.
- **Scripts in the new page do not run** unless the Scripts plugin is used. Code that must run on every page belongs in `pagefold.mount()` or hooks, not in `DOMContentLoaded`.
- Links to another origin, `mailto:`, `tel:`, `target="_blank"`, `download`, modified clicks and `[data-no-pagefold]` are left to the browser. `ignoreVisit(url, { el, event })` ignores more.

## Options (all optional)

`containers` (`['#pagefold']`), `linkSelector` (`'a[href]'`), `linkToSelf` (`'scroll' | 'navigate'`), `ignoreVisit`, `plugins`, `hooks`, `animationSelector` (`string | false`), `animationScope` (`'html' | 'containers'`), `animateHistoryBrowsing`, `native` (View Transitions API), `cache`, `cacheMax`, `cacheTtl`, `failOnStatus` (default only 500), `requestHeaders`, `timeout`, `resolveUrl`, `skipPopStateHandling`, `queue` (`'latest' | 'all' | 'ignore'`).

## Instance

`pagefold.navigate(url, { animate, animation, history: 'push' | 'replace', cache, meta, signal })` returns a promise that resolves after the visit. Also `pagefold.cache` (`get`, `has`, `delete`, `prune`, `clear`, `all`), `pagefold.use(plugin)`, `pagefold.unuse(plugin)`, `pagefold.mount(selector, setup)` (run code for elements that come with a page; return a cleanup function), `pagefold.destroy()`.

## Hooks

Register with `pagefold.hooks.on(name, handler, options?)`; variants `before`, `once`, `replace`. `on` runs after the default behavior; `before` runs first; `replace` swaps the default. Options: `{ once, before, priority, replace }`. Handlers receive `(visit, args)`; return a promise to make Pagefold wait.

Names: `visit:start`, `visit:transition`, `visit:abort`, `visit:end`, `visit:fail`, `animation:out:start|await|end`, `animation:in:start|await|end`, `animation:skip`, `content:replace`, `content:scroll`, `page:load`, `page:view`, `fetch:request|error|timeout`, `link:click|self|anchor|newtab`, `history:popstate`, `scroll:top|anchor`, `cache:set|clear`.

`visit` has `from`, `to` (`url`, `hash`), `containers`, `animation` (`animate`, `name`, `types`), `scroll`, `history`, `cache`, `trigger`, `transition`, `state`, and `abort()`.

## Animating with JavaScript (GSAP, Motion, WAAPI)

Set `animationSelector: false` and use the JS plugin:

```js
import PagefoldJs from 'pagefold/js'
new Pagefold({
  animationSelector: false,
  plugins: [new PagefoldJs([{
    out: (done) => gsap.to('#pagefold', { opacity: 0, onComplete: done }),
    in: (done) => gsap.from('#pagefold', { opacity: 0, onComplete: done }),
  }])],
})
```

Entries can have `name`, `from` and `to` path patterns (`:param`, `*`). Give `out`/`in` either a callback style `(done, data)` or a function that returns a promise. Always clear inline styles that GSAP leaves behind (`clearProps`) without removing the page's own background.

## Plugins

Each is its own import and works alone. All are options-objects with sensible defaults.

| Import | Does |
|---|---|
| `pagefold/head` | merges `<head>` (title, meta, `lang`); `awaitAssets` waits for new CSS |
| `pagefold/scripts` | runs the scripts of the new page (`data-pagefold-ignore-script` to skip one; with `optin: true`, only those with `data-pagefold-reload-script`) |
| `pagefold/js` | animations in JavaScript |
| `pagefold/overlap` | old and new page in the DOM together (needs a `transition-*` class and z-index) |
| `pagefold/preload` | preloads pages on hover (`preloadHoveredLinks`) or when visible (`preloadVisibleLinks`); `data-no-preload` skips a link |
| `pagefold/progress` | loading bar for slow visits |
| `pagefold/scroll` | smooth scroll, offsets, `scrollContainers`, `scrollFunction` |
| `pagefold/a11y` | announces the page (`assertive`), moves focus (`body`), respects reduced motion; `contentSelector`, `politeness`, `announcements` |
| `pagefold/forms` | submits forms as visits (`data-pagefold-form`) |
| `pagefold/fragment` | replaces only some containers for some visits (`rules`) |
| `pagefold/body-class` | copies the new `<body>` class and attributes |
| `pagefold/route-name` | names pages from path patterns; `from-route-*`/`to-route-*` classes |
| `pagefold/debug` | logs visits, exposes `window.pagefold` |
| `pagefold/analytics` | page views for gtag, GTM, Matomo or a custom function (`provider`) |

```js
import PagefoldHead from 'pagefold/head'
import PagefoldA11y from 'pagefold/a11y'
new Pagefold({ plugins: [new PagefoldHead(), new PagefoldA11y()] })
```

Themes: `import 'pagefold/css/fade.css'` or `slide.css`. Without a bundler, use `dist/umd/<name>.js` files (globals `Pagefold`, `PagefoldHead`, ...) from a CDN with a pinned version.

## Writing a plugin

```js
import { Plugin } from 'pagefold'
export default class MyPlugin extends Plugin {
  name = 'MyPlugin'
  mount() { this.on('page:view', (visit, { url, title }) => {}) }
  unmount() { super.unmount() } // remove your own listeners first
}
```

A starter project: `npx degit andresclua/pagefold/templates/plugin my-plugin`.

## Debugging checklist

1. Page reloads fully: look for a missing container in the new page, a status that `failOnStatus` rejects, a link that is ignored, or an error in the console (`visit:fail`).
2. No animation: missing `transition-*` class, `animationSelector` false without a JS animation, or reduced motion (A11y plugin skips animation).
3. New content appears at once: the container has no transition on the property that changes.
4. Code runs once instead of every page: use `pagefold.mount()` or a hook; add the Scripts plugin if the scripts are inline in the pages.
5. Add the Debug plugin (`pagefold/debug`) and read the log of hooks.
