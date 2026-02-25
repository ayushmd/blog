# Blog

A simple, SEO-friendly blog built with Next.js. Server-side rendered with light and dark mode.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Adding posts

Create a `.md` file in `content/posts/` with frontmatter:

```yaml
---
title: "Your Post Title"
date: "2025-02-25"
description: "Short description for SEO and previews."
---

Your content in **Markdown**...
```

The filename (without `.md`) becomes the URL slug, e.g. `hello-world.md` → `/blog/hello-world`.

## Build

```bash
npm run build
npm start
```

Posts are read at build time and pages are statically generated for fast loads and good SEO.
# blog
