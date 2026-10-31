import type { Pagefold } from '../../src/pagefold'

declare global {
  interface Window {
    pagefold: Pagefold
    __ready?: boolean
    __events: string[]
    __ran?: number
    __vt?: number
    __marker?: string
    __pf?: unknown
  }
}
