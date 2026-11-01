/** The steps of an animated visit, in order, with the state classes on the html element at each. */
export type Kind = 'animation' | 'content' | 'visit' | 'network'

export interface Step {
  hook: string
  kind: Kind
  phase: 'start' | 'out' | 'swap' | 'in' | 'end'
  text: string
  /** Classes on the html element right after this step */
  classes: string[]
  /** Pagefold waits here until the animation is done */
  waits?: boolean
}

export const phases = [
  { id: 'start', title: 'Start', note: 'The old page is on screen.' },
  { id: 'out', title: 'Animate out', note: 'The old page is still on screen, animating out.' },
  { id: 'swap', title: 'Swap', note: 'The new content takes the place of the old one, hidden by the animation.' },
  { id: 'in', title: 'Animate in', note: 'The new page animates in.' },
  { id: 'end', title: 'End', note: 'Back to normal.' },
] as const

const OUT = ['is-changing', 'is-animating', 'is-leaving']
const SWAP = ['is-changing', 'is-animating', 'is-rendering']
const IN = ['is-changing', 'is-rendering']

export const visitSteps: Step[] = [
  { hook: 'visit:start', kind: 'visit', phase: 'start', classes: [], text: 'The visit exists. This is the moment to change it: its animation name, or whether it animates at all.' },
  { hook: 'page:load', kind: 'network', phase: 'start', classes: [], text: 'The page starts loading, from the cache or from the network. It runs alongside the animation.' },

  { hook: 'animation:out:start', kind: 'animation', phase: 'out', classes: OUT, text: 'Pagefold adds the state classes. Your CSS starts animating the old content out.' },
  { hook: 'animation:out:await', kind: 'animation', phase: 'out', classes: OUT, waits: true, text: 'Pagefold waits for the CSS transitions to end. The JS plugin replaces this step with your own animation.' },
  { hook: 'animation:out:end', kind: 'animation', phase: 'out', classes: OUT, text: 'The old content is out. Nothing happens here by default.' },

  { hook: 'content:replace', kind: 'content', phase: 'swap', classes: SWAP, text: 'The containers are swapped and the title updates. The new content starts hidden, because is-animating is still on.' },
  { hook: 'content:scroll', kind: 'content', phase: 'swap', classes: SWAP, text: 'The scroll position is set: to the top, or to an anchor.' },
  { hook: 'page:view', kind: 'content', phase: 'swap', classes: SWAP, text: 'The new page is in place. This is where analytics page views are sent.' },

  { hook: 'animation:in:start', kind: 'animation', phase: 'in', classes: IN, text: 'Pagefold removes is-animating. Your CSS transitions the new content in.' },
  { hook: 'animation:in:await', kind: 'animation', phase: 'in', classes: IN, waits: true, text: 'Pagefold waits for the CSS transitions to end.' },
  { hook: 'animation:in:end', kind: 'animation', phase: 'in', classes: IN, text: 'The new content is in. Nothing happens here by default.' },

  { hook: 'visit:end', kind: 'visit', phase: 'end', classes: [], text: 'The state classes are removed. The visit is over.' },
]
