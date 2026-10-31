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
  test('adds a polite live region and removes it on unmount', async () => {
    make()
    const region = announcer()
    expect(region?.getAttribute('role')).toBe('status')
    expect(region?.getAttribute('aria-live')).toBe('polite')
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
    make({ announcement: 'Now on {title} ({url})' })
    await pf.navigate('/a')
    await vi.waitFor(() => expect(announcer()?.textContent).toBe('Now on Page A (/a)'))
  })

  test('announce: false creates no region', () => {
    make({ announce: false })
    expect(announcer()).toBeNull()
  })

  test('moves focus to the new content, then cleans up its tabindex', async () => {
    make()
    await pf.navigate('/a')
    const content = document.querySelector<HTMLElement>('#pagefold')
    expect(document.activeElement).toBe(content)
    expect(content?.getAttribute('tabindex')).toBe('-1')
    content?.blur()
    expect(content?.hasAttribute('tabindex')).toBe(false)
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
    expect(document.activeElement?.id).toBe('pagefold')
  })

  test('does not steal focus from an element marked as persistent', async () => {
    document.body.insertAdjacentHTML('beforeend', '<div data-pagefold-persist="player"><button id="play">play</button></div>')
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
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
    make()
    let animate: boolean | undefined
    pf.hooks.on('visit:transition', (visit) => {
      animate = visit.animation.animate
    })
    await pf.navigate('/a')
    expect(animate).toBe(false)
  })

  test('keeps animations when reduced motion is not requested, or the option is off', async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
    make()
    let animate: boolean | undefined
    pf.hooks.on('visit:transition', (visit) => {
      animate = visit.animation.animate
    })
    await pf.navigate('/a')
    expect(animate).toBe(true)
  })
})
