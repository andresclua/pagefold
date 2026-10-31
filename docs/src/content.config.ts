import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'

const option = z.object({
  name: z.string(),
  type: z.string(),
  default: z.string(),
  description: z.string(),
})

const docs = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/docs' }),
  schema: z
    .object({
      title: z.string(),
      description: z.string(),
      section: z.enum(['start', 'concepts', 'hooks', 'plugins', 'guides', 'reference']),
      order: z.number().default(0),
      // Required on plugin pages so none is published incomplete.
      whenToUse: z.string().optional(),
      options: z.array(option).optional(),
    })
    .refine((d) => d.section !== 'plugins' || (d.whenToUse && d.options), {
      message: 'Plugin pages need `whenToUse` and `options`',
    }),
})

// Entries live in /showcase at the repo root so contributors find them easily.
const showcase = defineCollection({
  loader: glob({ pattern: ['*/index.md', '!_*/**'], base: '../showcase' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      url: z.url(),
      author: z.string(),
      repo: z.url().optional(),
      cover: image(),
      plugins: z.array(z.string()).default([]),
      date: z.coerce.date(),
    }),
})

export const collections = { docs, showcase }
