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

No bundler? Load it with script tags: see the [script tag guide](docs/src/content/docs/script-tag.mdx).

```html
<script src="https://cdn.jsdelivr.net/npm/pagefold@0.1.0/dist/umd/pagefold.js"></script>
<script>new Pagefold()</script>
```

## Features

- Works with the HTML your server already sends: no API, no special markup beyond one container.
- **Small core** with no dependencies, and **optional modules** so you only ship what you import.
- Animate with CSS, or with JavaScript: GSAP, Motion, the Web Animations API, or the View Transitions API.
- Cancels the request of a visit that is replaced by a newer one.
- A hook at every step, and a plugin base class to write your own.

## Modules

Each one is its own import, so you only ship what you use. The core is [`src/`](src), and every module links to its documentation (what it does, when to use it, every option) and to its source.

| Module | What it does | Import path | Links |
|---|---|---|---|
| [`head`](docs/src/content/docs/head.mdx) | Keeps the title, meta tags and stylesheets in sync | `pagefold/head` | [options and guide](docs/src/content/docs/head.mdx) · [source](src/plugins/head.ts) |
| [`scripts`](docs/src/content/docs/scripts.mdx) | Runs the scripts of the new page | `pagefold/scripts` | [options and guide](docs/src/content/docs/scripts.mdx) · [source](src/plugins/scripts.ts) |
| [`js`](docs/src/content/docs/js.mdx) | Animations in JavaScript (GSAP, Motion, ...) | `pagefold/js` | [options and guide](docs/src/content/docs/js.mdx) · [source](src/plugins/js.ts) |
| [`overlap`](docs/src/content/docs/overlap.mdx) | Animates the old and new page at the same time | `pagefold/overlap` | [options and guide](docs/src/content/docs/overlap.mdx) · [source](src/plugins/overlap.ts) |
| [`preload`](docs/src/content/docs/preload.mdx) | Fetches pages before they are visited | `pagefold/preload` | [options and guide](docs/src/content/docs/preload.mdx) · [source](src/plugins/preload.ts) |
| [`a11y`](docs/src/content/docs/a11y.mdx) | Announces the page, manages focus, respects reduced motion | `pagefold/a11y` | [options and guide](docs/src/content/docs/a11y.mdx) · [source](src/plugins/a11y.ts) |
| [`scroll`](docs/src/content/docs/scroll.mdx) | Smooth scrolling between pages and to anchors | `pagefold/scroll` | [options and guide](docs/src/content/docs/scroll.mdx) · [source](src/plugins/scroll.ts) |
| [`body-class`](docs/src/content/docs/body-class.mdx) | Copies the body class of the new page | `pagefold/body-class` | [options and guide](docs/src/content/docs/body-class.mdx) · [source](src/plugins/body-class.ts) |
| [`progress`](docs/src/content/docs/progress.mdx) | A loading bar | `pagefold/progress` | [options and guide](docs/src/content/docs/progress.mdx) · [source](src/plugins/progress.ts) |
| [`forms`](docs/src/content/docs/forms.mdx) | Submits forms without a page load | `pagefold/forms` | [options and guide](docs/src/content/docs/forms.mdx) · [source](src/plugins/forms.ts) |
| [`fragment`](docs/src/content/docs/fragment.mdx) | Replaces only some containers for some visits | `pagefold/fragment` | [options and guide](docs/src/content/docs/fragment.mdx) · [source](src/plugins/fragment.ts) |
| [`route-name`](docs/src/content/docs/route-name.mdx) | Names pages and picks animations by route | `pagefold/route-name` | [options and guide](docs/src/content/docs/route-name.mdx) · [source](src/plugins/route-name.ts) |
| [`analytics`](docs/src/content/docs/analytics.mdx) | Reports page views (GA4, Tag Manager, Matomo) | `pagefold/analytics` | [options and guide](docs/src/content/docs/analytics.mdx) · [source](src/plugins/analytics.ts) |
| [`debug`](docs/src/content/docs/debug.mdx) | Logs every hook with timings | `pagefold/debug` | [options and guide](docs/src/content/docs/debug.mdx) · [source](src/plugins/debug.ts) |

Two CSS themes, [`fade`](src/css/fade.css) and [`slide`](src/css/slide.css), come with it: `import 'pagefold/css/fade.css'`. See [the themes guide](docs/src/content/docs/themes.mdx).

## Guides

- [Getting started](docs/src/content/docs/getting-started.mdx) and [how it works](docs/src/content/docs/how-it-works.mdx)
- Animating: [with CSS](docs/src/content/docs/css-animations.mdx), [GSAP](docs/src/content/docs/gsap.mdx), [Motion](docs/src/content/docs/motion.mdx), [the Web Animations API](docs/src/content/docs/web-animations.mdx), [View Transitions](docs/src/content/docs/view-transitions.mdx)
- Using it with [Astro](docs/src/content/docs/astro.mdx), [Alpine.js](docs/src/content/docs/alpine.mdx) or [a script tag](docs/src/content/docs/script-tag.mdx)
- [Hooks](docs/src/content/docs/using-hooks.mdx), [options](docs/src/content/docs/options.mdx) and [writing your own plugin](docs/src/content/docs/plugin-api.mdx)
- [Troubleshooting](docs/src/content/docs/troubleshooting.mdx)

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
