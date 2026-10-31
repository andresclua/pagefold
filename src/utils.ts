export const query = (selector: string, context: ParentNode = document): HTMLElement | null =>
  context.querySelector<HTMLElement>(selector)

export const queryAll = (selector: string, context: ParentNode = document): HTMLElement[] =>
  Array.from(context.querySelectorAll<HTMLElement>(selector))

/** Resolves after the current task, so consumers get a chance to hook in. */
export const nextTick = (): Promise<void> => Promise.resolve()

/** Force the browser to apply pending style changes. Useful between adding and removing a class. */
export const forceReflow = (el?: HTMLElement): number => (el ?? document.body).offsetHeight

/** Read an attribute from the element or its closest ancestor that has it. */
export const getContextualAttr = (el: Element | undefined, attr: string): string | undefined =>
  el?.closest(`[${attr}]`)?.getAttribute(attr) ?? undefined

/** `'My Animation'` -> `'my-animation'` */
export const classify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
