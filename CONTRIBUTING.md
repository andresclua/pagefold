# Contributing

## Setup

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm size
```

## Commits

Format: `type: <emoji> short description`. A hook checks it.

| Type | Emoji | Use |
|---|---|---|
| `feat` | 🚀 | New feature (minor release) |
| `fix` | 🐛 | Bug fix (patch release) |
| `refactor` | 🔄 | Restructuring without behavior change |
| `docs` | 📚 | Documentation only |
| `style` | 🎨 | Formatting and visual changes |
| `test`, `ci`, `build`, `chore` | 🧪 | Tooling and maintenance |
| `revert` | ↩️ | Reverting a previous commit |

Breaking changes: add `!` after the type (`feat!: 🚀 ...`). Only `feat`, `fix` and breaking changes trigger a release.

## Showcase

The showcase is the page on the Pagefold website that lists sites built with it. Each entry is a screenshot, the name of the site, who made it and a link.

### Why add your site

- **It is shown on the project's website**, with a screenshot, a link to your site and the modules you used.
- **Real sites are the best documentation.** People deciding whether to use Pagefold want to see it working, and what they can build with it.
- **It helps us improve it.** Seeing which modules people combine shows which guides to write and what to fix.
- **It costs ten minutes and no code**: one folder with a text file and an image.

Nothing is promised about traffic. It is a link and a screenshot on a page, and it is free.

### What your entry needs

| | |
|---|---|
| **A live public site** | It is online, anyone can open it, and it uses Pagefold |
| **Credits** | Who designed and built it: the agency, the freelancers, you. At least one name |
| **A cover image** | A screenshot, **1600 x 1000 px**, JPG, PNG or WebP, **under 400 KB**. Details below |
| **A folder** | `showcase/your-site-name/` with an `index.md` and the cover next to it |
| **A pull request** | With a short description of the site and its address |

### Guidelines

- **Quality matters.** We list sites that are well made: professional, careful in their design and **accessible** (usable with the keyboard, readable contrast, sensible headings). Check your own site before sending it.
- **Give credit.** Name everyone who designed and built it. Client work is welcome, if you have permission to show it.
- **Nothing illegal or hateful.** We may decline an entry, and we will say why.

### How to add it

You do not need to be a developer, and you can do it all from the GitHub website.

1. **Fork** this repository (button at the top right of the repository page).
2. In your fork, open the `showcase` folder and **copy the `_template` folder** as `showcase/your-site-name`. The name uses lowercase words joined by hyphens: `my-portfolio`, `acme-studio`.
3. **Edit `index.md`** in your folder and fill in the fields (next section).
4. **Add the cover image** to the same folder (see the image rules below).
5. **Open a pull request** to this repository, with a short description and the address of the site. On the page where you write it, add `?template=showcase.md` to the end of the address in your browser and the checklist fills in for you. The pull request checks your entry by itself and tells you what to fix.

With the project on your computer you can check it first:

```bash
pnpm install
pnpm check:showcase   # the files are there and light enough
pnpm docs:dev         # open /showcase and see your card
```

### The fields

```yaml
---
title: Acme Studio
url: https://acme.example
credits:
  - name: Jane Doe
    role: Design and development
    url: https://janedoe.example
  - name: Acme Studio
repo: https://github.com/jane/acme-site
cover: ./cover.jpg
plugins: [head, preload, a11y]
date: 2026-11-01
---

A couple of sentences about the site and how it uses Pagefold.
```

| Field | Required | What to write |
|---|---|---|
| `title` | yes | The name of the site |
| `url` | yes | Its public address, starting with `https://` |
| `credits` | yes | A list of everyone who designed or built the site. Each has a `name` (required), and optionally a `role` and a `url` |
| `repo` | no | The address of the source code, if it is public |
| `cover` | yes | The file name of the image, in the same folder: `./cover.jpg` |
| `plugins` | no | The modules you use, from: `head`, `scripts`, `js`, `overlap`, `preload`, `a11y`, `scroll`, `body-class`, `debug`, `route-name`, `progress`, `forms`, `fragment`, `analytics` |
| `date` | yes | The day you add it, as `YYYY-MM-DD` |

The text below the fields is optional and not shown on the card yet. Use it to tell us what you did.

### The cover image

The cover is the first thing people see, so it is worth a minute.

| | |
|---|---|
| **Size** | **1600 x 1000 pixels** (a 16:10 shape). At least 1200 pixels wide. Other shapes are rejected, because the cards are cropped to 16:10 |
| **Format** | JPG, PNG or WebP. JPG is the smallest for photos and busy pages |
| **Weight** | **At most 400 KB.** Under 300 KB is better, because the page shows many covers at once |
| **Name** | `cover.jpg` (or `.png`, `.webp`). It must match the `cover` field |
| **What to show** | The **home page of your site as a visitor first sees it**, without scrolling |
| **What to avoid** | Browser windows, device mockups, text or logos you added on top, and anything that is not your site |

How to take it in Chrome: open your site, open the developer tools, turn on the device toolbar, choose *Responsive*, set it to 1600 x 1000, open the menu at the top right of that toolbar and choose *Capture screenshot*. Then drop the file on [squoosh.app](https://squoosh.app) to bring it under 400 KB.

Cards are cropped to fit, so keep what matters (your logo, your headline) near the centre.

### What happens next

The pull request checks the fields, the plugin names, the shape of the image and its weight. If something fails, the message says which and what to change. After that a maintainer looks at it and, when it is fine, merges it, and it appears on the site with the next update.
