import { getCollection } from 'astro:content'
import type { APIRoute } from 'astro'

const SECTIONS = ['start', 'concepts', 'guides', 'plugins', 'hooks', 'reference', 'demos'] as const

// https://llmstxt.org: a short index for language models, with a link to every docs page
export const GET: APIRoute = async ({ site }) => {
  const docs = await getCollection('docs')
  const url = (id: string) => new URL(`/docs/${id}/`, site).href
  const out = [
    '# Pagefold',
    '',
    '> Page transitions for server-rendered websites. It fetches the next page when a link is clicked, animates the old content out, swaps it and animates the new content in, and keeps the address bar, the back button and the scroll position working.',
    '',
    `The full documentation in one file: ${new URL('/llms-full.txt', site).href}`,
    '',
  ]
  for (const section of SECTIONS) {
    const pages = docs.filter((d) => d.data.section === section).sort((a, b) => a.data.order - b.data.order)
    if (!pages.length) continue
    out.push(`## ${section[0]!.toUpperCase()}${section.slice(1)}`, '')
    for (const d of pages) out.push(`- [${d.data.title}](${url(d.id)}): ${d.data.description}`)
    out.push('')
  }
  return new Response(out.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
