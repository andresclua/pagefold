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

const MODULES = [
  'head', 'scripts', 'js', 'overlap', 'preload', 'a11y', 'scroll', 'body-class',
  'debug', 'route-name', 'progress', 'forms', 'fragment', 'analytics',
] as const

// Entries live in /showcase at the repo root so contributors find them easily.
const showcase = defineCollection({
  loader: glob({ pattern: ['*/index.md', '!_*/**'], base: '../showcase' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      url: z.url(),
      // Who designed and built it. Give credit to everyone, the agency and the freelancers.
      credits: z
        .array(z.object({ name: z.string(), role: z.string().optional(), url: z.url().optional() }))
        .min(1),
      repo: z.url().optional(),
      // The size, shape and weight of the image are checked by scripts/check-showcase.mjs,
      // because Astro only knows the image's dimensions after the fields are validated.
      cover: image(),
      plugins: z.array(z.enum(MODULES)).default([]),
      date: z.coerce.date(),
    }),
})

export const collections = { docs, showcase }
