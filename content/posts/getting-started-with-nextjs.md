---
title: "Getting Started with Next.js"
date: "2025-02-24"
description: "A quick guide to building server-rendered sites with Next.js."
---

Next.js makes it easy to build fast, SEO-friendly websites. Here's a quick overview.

## Server-side rendering

Pages are rendered on the server by default. That means:

1. **Search engines** see full HTML – better for SEO
2. **Users** get content immediately – no blank screen
3. **Social shares** get correct titles and descriptions

## File-based routing

Put a `page.tsx` in a folder and you get a route. No config needed.

- `app/page.tsx` → `/`
- `app/blog/page.tsx` → `/blog`
- `app/blog/[slug]/page.tsx` → `/blog/hello-world`

## Adding content

This blog uses markdown files in `content/posts/`. Each file has YAML frontmatter for title, date, and description. Simple and portable.

Happy writing!
