# Pagefold

Page transitions for server-rendered websites. Link clicks fetch the next page, animate the old content out and the new content in, and keep the address bar, the back button and the scroll position working.

```bash
npm install pagefold
```

```html
<main id="pagefold" class="transition-fade">...</main>
```

```css
.transition-fade { transition: opacity 0.3s; }
html.is-animating .transition-fade { opacity: 0; }
```

```js
import Pagefold from 'pagefold'

new Pagefold()
```

## Features

- Works with the HTML your server already sends: no API, no special markup beyond one container.
- **Small core** with no dependencies, and **optional modules** so you only ship what you import.
- Animate with CSS, or with JavaScript: GSAP, Motion, the Web Animations API, or the View Transitions API.
- Cancels the request of a visit that is replaced by a newer one.
- A hook at every step, and a plugin base class to write your own.

## Modules

Each one is its own import, such as `import PagefoldHead from 'pagefold/head'`.

| Module | What it does |
|---|---|
| `head` | Keeps the title, meta tags and stylesheets in sync |
| `scripts` | Runs the scripts of the new page |
| `js` | Animations in JavaScript (GSAP, Motion, ...) |
| `overlap` | Animates the old and new page at the same time |
| `preload` | Fetches pages before they are visited |
| `a11y` | Announces the page, manages focus, respects reduced motion |
| `scroll` | Smooth scrolling between pages and to anchors |
| `body-class` | Copies the body class of the new page |
| `progress` | A loading bar |
| `forms` | Submits forms without a page load |
| `fragment` | Replaces only some containers for some visits |
| `route-name` | Names pages and picks animations by route |
| `analytics` | Reports page views (GA4, Tag Manager, Matomo) |
| `debug` | Logs every hook with timings |

And two CSS themes: `pagefold/css/fade.css` and `pagefold/css/slide.css`.

## Documentation

The documentation lives in [`docs/`](docs) (an Astro site) while its public address is being set up.

## Development

```bash
pnpm install
pnpm test        # unit tests
pnpm test:e2e    # browser tests (Chromium, Firefox, WebKit)
pnpm build       # library build into dist/
pnpm size        # size budget for the core
pnpm docs:dev    # documentation site
```

## Showcase

Built something with Pagefold? See [CONTRIBUTING.md](CONTRIBUTING.md#showcase) to add it.

## License

[MIT](LICENSE)
