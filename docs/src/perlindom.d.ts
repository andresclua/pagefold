// @andresclua/perlindom ships no types
declare module '@andresclua/perlindom' {
  export default class PerlinDOM {
    constructor(options: Record<string, unknown>)
    amplitude: number
    destroy(): void
  }
}
