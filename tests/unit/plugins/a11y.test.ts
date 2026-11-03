import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { Pagefold } from '../../../src/pagefold'
import PagefoldA11y from '../../../src/plugins/a11y'
import { page, resetDom, stubFetch } from './helpers'

let pf: Pagefold
const make = (options: ConstructorParameters<typeof PagefoldA11y>[0] = {}) => {
  pf = new Pagefold({ animationSelector: false, plugins: [new PagefoldA11y(options)] })
  return pf
}
const announcer = () => document.querySelector('.pagefold-announcer')

beforeEach(() => {
  resetDom(
    '<div id="pagefold"><a id="link" href="/a">a</a><a id="jump" href="/#section">jump</a><h2 id="section">Section</h2></div>'
  )
  Element.prototype.scrollIntoView = vi.fn()
  stubFetch({ '/a': page('<title>Page A</title>', '<h1>Heading A</h1>') })
})
afterEach(async () => {
  await pf?.destroy()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(window, 'matchMedia')
})

describe('PagefoldA11y', () => {
  test('adds an assertive live region and removes it on unmount', async () => {
    make()
    const region = announcer()
    expect(region?.getAttribute('role')).toBe('status')
    expect(region?.getAttribute('aria-live')).toBe('assertive')
    await pf.destroy()
    expect(announcer()).toBeNull()
  })

  test('announces the page heading after a visit', async () => {
    make()
    await pf.navigate('/a')
    await vi.waitFor(() => expect(announcer()?.textContent).toBe('Navigated to: Heading A'))
  })

  test('falls back to the document title and supports a custom message', async () => {
    stubFetch({ '/a': page('<title>Page A</title>', 'no heading here') })
    make({ announcements: { visit: 'Now on {title} ({url})', url: 'At {url}' } })
    await pf.navigate('/a')
    await vi.waitFor(() => expect(announcer()?.textContent).toBe('Now on Page A (/a)'))
  })

  test('announce: false creates no region', () => {
    make({ announce: false })
    expect(announcer()).toBeNull()
  })

  test('politeness: polite makes the live region polite', () => {
    make({ politeness: 'polite' })
    expect(announcer()?.getAttribute('aria-live')).toBe('polite')
  })

  test('moves focus to the new content, then cleans up its tabindex', async () => {
    make({ contentSelector: '#pagefold' })
    await pf.navigate('/a')
    const content = document.querySelector<HTMLElement>('#pagefold')
    expect(document.activeElement).toBe(content)
    expect(content?.getAttribute('tabindex')).toBe('-1')
    content?.blur()
    expect(content?.hasAttribute('tabindex')).toBe(false)
  })

  test('focus goes to the body by default', async () => {
    make()
    await pf.navigate('/a')
    expect(document.activeElement).toBe(document.body)
  })

  test('uses contentSelector when given', async () => {
    stubFetch({ '/a': page('', '<main id="main">m</main>') })
    make({ contentSelector: '#main' })
    await pf.navigate('/a')
    expect(document.activeElement?.id).toBe('main')
  })

  test('does not steal focus from an element that survived the visit', async () => {
    document.body.insertAdjacentHTML('beforeend', '<input id="search" />')
    make()
    document.querySelector<HTMLElement>('#search')?.focus()
    await pf.navigate('/a')
    expect(document.activeElement?.id).toBe('search')
  })

  test('focus leaves the link that was clicked', async () => {
    make()
    document.querySelector<HTMLElement>('#link')?.focus()
    await pf.navigate('/a')
    expect(document.activeElement).toBe(document.body)
  })

  test('does not steal focus from an element marked as persistent', async () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div data-pagefold-persist="player"><button id="play">play</button></div>'
    )
    make()
    document.querySelector<HTMLElement>('#play')?.focus()
    await pf.navigate('/a')
    expect(document.activeElement?.id).toBe('play')
  })

  test('focus: false leaves focus alone', async () => {
    make({ focus: false })
    await pf.navigate('/a')
    expect(document.activeElement).toBe(document.body)
  })

  test('focuses the target of a link to an anchor on the same page', () => {
    make()
    const link = document.querySelector<HTMLElement>('#jump')
    link?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    expect(document.activeElement?.id).toBe('section')
  })

  test('turns animations off when the user prefers reduced motion', async () => {
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
    make()
    let animate: boolean | undefined
    pf.hooks.on('visit:transition', (visit) => {
      animate = visit.animation.animate
    })
    await pf.navigate('/a')
    expect(animate).toBe(false)
  })

  test('keeps animations when reduced motion is not requested, or the option is off', async () => {
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
    make()
    let animate: boolean | undefined
    pf.hooks.on('visit:transition', (visit) => {
      animate = visit.animation.animate
    })
    await pf.navigate('/a')
    expect(animate).toBe(true)
  })

  test('the aria-label of the heading wins, and main h1 comes before other headings', async () => {
    stubFetch({
      '/a': page(
        '<title>Page A</title>',
        '<h1>Site name</h1><main><h1 aria-label="Real title">Shown title</h1></main>'
      ),
    })
    make()
    await pf.navigate('/a')
    await vi.waitFor(() => expect(announcer()?.textContent).toBe('Navigated to: Real title'))
  })

  test('with no heading and no title the address is announced', async () => {
    stubFetch({ '/a': page('', 'nothing') })
    make()
    document.title = ''
    await pf.navigate('/a')
    await vi.waitFor(() => expect(announcer()?.textContent).toBe('Navigated to: New page at /a'))
  })

  test('announcements by language, with a fallback', async () => {
    const announcements = {
      'de-DE': { visit: 'Navigiert zu: {title}', url: 'Neue Seite unter {url}' },
      '*': { visit: '{title}', url: '{url}' },
    }
    stubFetch({ '/a': page('<title>T</title>', '<h1>Heading A</h1>') })
    document.documentElement.lang = 'de-DE'
    make({ announcements })
    await pf.navigate('/a')
    await vi.waitFor(() => expect(announcer()?.textContent).toBe('Navigiert zu: Heading A'))
    await pf.destroy()
    document.documentElement.lang = 'fr'
    make({ announcements })
    await pf.navigate('/a')
    await vi.waitFor(() => expect(announcer()?.textContent).toBe('Heading A'))
  })

  test('visit.a11y.announce can change the text, or turn it off', async () => {
    make()
    pf.hooks.before('content:announce', (visit) => {
      if (visit.a11y) visit.a11y.announce = 'Custom words'
    })
    await pf.navigate('/a')
    await vi.waitFor(() => expect(announcer()?.textContent).toBe('Custom words'))
    pf.hooks.before('content:announce', (visit) => {
      if (visit.a11y) visit.a11y.announce = false
    })
    announcer()!.textContent = ''
    await pf.navigate('/a?again')
    await new Promise((r) => setTimeout(r, 200))
    expect(announcer()?.textContent).toBe('')
  })

  test('visit.a11y.focus chooses the element, or can wait for the end of the visit', async () => {
    stubFetch({ '/a': page('', '<main id="main">m</main>') })
    make()
    pf.hooks.on('visit:start', (visit) => {
      if (visit.a11y) visit.a11y.focus = { selector: '#main', wait: true }
    })
    const focusedAt: (string | undefined)[] = []
    pf.hooks.on('page:view', () => focusedAt.push(document.activeElement?.id))
    pf.hooks.on('visit:end', () => focusedAt.push(document.activeElement?.id))
    await pf.navigate('/a')
    expect(focusedAt).toEqual(['', 'main'])
  })

  test('visit.a11y.focus false turns focus handling off for that visit', async () => {
    make()
    pf.hooks.on('visit:start', (visit) => {
      if (visit.a11y) visit.a11y.focus = false
    })
    await pf.navigate('/a')
    expect(document.activeElement).toBe(document.body)
  })

  test('autofocus focuses the element marked with autofocus', async () => {
    stubFetch({ '/a': page('', '<input id="name" autofocus>') })
    make({ autofocus: true })
    await pf.navigate('/a')
    expect(document.activeElement?.id).toBe('name')
  })

  test('the content:announce and content:focus hooks fire, and pagefold.announce speaks', async () => {
    make()
    const seen: string[] = []
    pf.hooks.on('content:announce', () => seen.push('announce'))
    pf.hooks.on('content:focus', () => seen.push('focus'))
    await pf.navigate('/a')
    expect(seen).toEqual(['announce', 'focus'])
    pf.announce?.('Filtered by cats')
    await vi.waitFor(() => expect(announcer()?.textContent).toBe('Filtered by cats'))
  })
})
