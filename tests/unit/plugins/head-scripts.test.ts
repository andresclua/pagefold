import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { Pagefold } from '../../../src/pagefold'
import PagefoldHead, { mergeHead, syncAttributes } from '../../../src/plugins/head'
import PagefoldScripts from '../../../src/plugins/scripts'
import { page, resetDom, stubFetch } from './helpers'

let pf: Pagefold
beforeEach(() => resetDom())
afterEach(async () => {
  await pf?.destroy()
  vi.unstubAllGlobals()
})

const parseHead = (html: string) => new DOMParser().parseFromString(`<head>${html}</head>`, 'text/html').head

describe('mergeHead', () => {
  test('keeps identical tags, adds new ones in order and removes the rest', () => {
    document.head.innerHTML = '<title>Old</title><meta name="a" content="1"><meta name="b" content="2">'
    const kept = document.head.querySelector('[name=a]')
    const next = parseHead('<title>New</title><meta name="a" content="1"><meta name="c" content="3">')

    const { added, removed } = mergeHead(document.head, next, () => false)

    expect(document.head.querySelector('[name=a]')).toBe(kept) // untouched node
    expect(document.head.querySelector('[name=b]')).toBeNull()
    expect(document.head.querySelector('title')?.textContent).toBe('New')
    expect(Array.from(document.head.children).map((e) => e.getAttribute('name') ?? e.tagName)).toEqual([
      'TITLE',
      'a',
      'c',
    ])
    expect(added).toHaveLength(2)
    expect(removed).toHaveLength(2)
  })

  test('persisted tags survive', () => {
    document.head.innerHTML = '<link rel="stylesheet" href="/old.css"><meta name="x" content="1">'
    mergeHead(document.head, parseHead(''), (el) => el.matches('link'))
    expect(document.head.querySelector('link')).not.toBeNull()
    expect(document.head.querySelector('meta')).toBeNull()
  })
})

describe('syncAttributes', () => {
  test('copies the chosen attributes and removes the ones that are gone', () => {
    const target = document.createElement('html')
    target.setAttribute('lang', 'en')
    target.setAttribute('dir', 'ltr')
    target.setAttribute('class', 'keep')
    const source = document.createElement('html')
    source.setAttribute('lang', 'es')
    source.setAttribute('class', 'ignored')
    syncAttributes(target, source, ['lang', 'dir'])
    expect(target.getAttribute('lang')).toBe('es')
    expect(target.hasAttribute('dir')).toBe(false)
    expect(target.getAttribute('class')).toBe('keep')
  })

  test('accepts patterns', () => {
    const target = document.createElement('html')
    const source = document.createElement('html')
    source.setAttribute('data-theme', 'dark')
    syncAttributes(target, source, [/^data-/])
    expect(target.getAttribute('data-theme')).toBe('dark')
  })
})

describe('PagefoldHead', () => {
  test('updates the head and the html lang on navigation', async () => {
    stubFetch({
      '/a': page('<title>A</title><meta name="description" content="about a">', 'a', 'lang="es"'),
    })
    pf = new Pagefold({ animationSelector: false, plugins: [new PagefoldHead()] })
    await pf.navigate('/a')
    expect(document.head.querySelector('meta[name=description]')?.getAttribute('content')).toBe('about a')
    expect(document.documentElement.getAttribute('lang')).toBe('es')
  })

  test('persistAssets keeps stylesheets that the new page does not list', async () => {
    document.head.innerHTML = '<link rel="stylesheet" href="/site.css">'
    stubFetch({ '/a': page('', 'a') })
    pf = new Pagefold({
      animationSelector: false,
      plugins: [new PagefoldHead({ persistAssets: true })],
    })
    await pf.navigate('/a')
    expect(document.head.querySelector('link[href="/site.css"]')).not.toBeNull()
  })

  test('awaitAssets waits for new stylesheets, up to the timeout', async () => {
    stubFetch({ '/a': page('<link rel="stylesheet" href="/a.css">', 'a') })
    pf = new Pagefold({
      animationSelector: false,
      plugins: [new PagefoldHead({ awaitAssets: true, timeout: 50 })],
    })
    let rendered = false
    pf.hooks.on('content:replace', () => {
      rendered = true
    })
    const visit = pf.navigate('/a')
    await vi.waitFor(() => expect(document.head.querySelector('link[href="/a.css"]')).not.toBeNull())
    expect(rendered).toBe(false) // still waiting for the stylesheet
    await visit // times out in jsdom, which never loads stylesheets
    expect(rendered).toBe(true)
  })

  test('awaitAssets continues as soon as the stylesheet loads', async () => {
    stubFetch({ '/a': page('<link rel="stylesheet" href="/a.css">', 'a') })
    pf = new Pagefold({
      animationSelector: false,
      plugins: [new PagefoldHead({ awaitAssets: true, timeout: 10_000 })],
    })
    const visit = pf.navigate('/a')
    await vi.waitFor(() => expect(document.head.querySelector('link[href="/a.css"]')).not.toBeNull())
    document.head.querySelector('link[href="/a.css"]')!.dispatchEvent(new Event('load'))
    await visit
    expect(document.querySelector('#pagefold')?.textContent).toBe('a')
  })
})

describe('PagefoldScripts', () => {
  const ran = (name: string) => document.documentElement.hasAttribute(`data-ran-${name}`)

  test('runs new scripts in the new content and skips ignored ones', async () => {
    stubFetch({
      '/a': page(
        '',
        `<script>document.documentElement.setAttribute('data-ran-new', '')</script>
         <script data-pagefold-ignore-script>document.documentElement.setAttribute('data-ran-ignored', '')</script>`
      ),
    })
    const plugin = new PagefoldScripts()
    pf = new Pagefold({ animationSelector: false, plugins: [plugin] })
    const spy = vi.spyOn(plugin, 'runScript')
    await pf.navigate('/a')
    expect(ran('new')).toBe(true)
    expect(ran('ignored')).toBe(false)
    expect(spy.mock.results[0]?.value).toHaveProperty('async', false) // keeps execution order
  })

  test('does not run scripts that were already on the page', async () => {
    document.head.innerHTML = '<script data-x>/* present at load */</script>'
    stubFetch({ '/a': page('<script data-x>/* present at load */</script>', 'a') })
    const plugin = new PagefoldScripts()
    pf = new Pagefold({ animationSelector: false, plugins: [plugin, new PagefoldHead()] })
    const spy = vi.spyOn(plugin, 'runScript')
    await pf.navigate('/a')
    expect(spy).not.toHaveBeenCalled() // identical head script is kept, not re-run
  })

  test('optin only runs scripts marked for reload', async () => {
    stubFetch({
      '/a': page(
        '',
        `<script>document.documentElement.setAttribute('data-ran-plain', '')</script>
         <script data-pagefold-reload-script>document.documentElement.setAttribute('data-ran-marked', '')</script>`
      ),
    })
    pf = new Pagefold({ animationSelector: false, plugins: [new PagefoldScripts({ optin: true })] })
    await pf.navigate('/a')
    expect(ran('marked')).toBe(true)
    expect(ran('plain')).toBe(false)
  })
})
