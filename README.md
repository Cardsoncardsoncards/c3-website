# C3 Eleventy Blog

Blog infrastructure for cardsoncardsoncards.com.au.

## Directory Structure

```
c3-eleventy/
├── .eleventy.js          Config file — filters, collections, paths
├── netlify.toml          Netlify build settings
├── package.json          npm deps
├── src/
│   ├── blog.njk          Auto-generated blog index (replaces blog.html)
│   ├── blog/             One .md file per post
│   │   ├── pokemon-booster-box-guide.md
│   │   ├── one-piece-starter-guide.md
│   │   └── ... (one file per post)
│   ├── _includes/
│   │   └── layouts/
│   │       └── post.njk  Post page template (nav, header, footer)
│   └── css/
│       └── post.css      All styles for post pages
└── _site/                BUILD OUTPUT — do not edit, do not commit
```

## Local Development

```bash
npm install
npm start       # localhost:8080 with live reload
npm run build   # production build into _site/
```

## Writing a New Post

1. Create a new file in `src/blog/` named with the URL slug.
   Example: `src/blog/mtg-bloomburrow-australia.md`

2. Add the front matter at the top:

```yaml
---
title: "MTG Bloomburrow: Australia Buyer's Guide"
description: "Every product in the Bloomburrow set confirmed on Amazon AU."
date: 2026-04-15
category: guide          # guide | review | game | accessory
emoji: "🐰"
tags: ["post"]           # REQUIRED — this is how Eleventy finds the post
affiliate_disclaimer: true
cta_product_url: "https://www.amazon.com.au/dp/ASIN?tag=blasdigital-22"
layout: post
---
```

3. Write the post body in Markdown below the front matter.

4. Run `npm start` to preview locally.

5. Run `npm run build` to generate the `_site/` folder.

6. Upload `_site/` contents to Netlify (drag and drop) OR push to Git repo connected to Netlify.

## Available Front Matter Fields

| Field | Required | Notes |
|---|---|---|
| title | Yes | Used in page title and blog card |
| description | Yes | Used in meta description and blog card |
| date | Yes | Format: YYYY-MM-DD |
| category | Yes | guide, review, game, or accessory |
| emoji | Yes | Displayed on blog card thumbnail |
| tags | Yes | Must include "post" |
| affiliate_disclaimer | No | Set true to show disclaimer notice |
| cta_product_url | No | Adds a buy CTA button at end of post |
| layout | Yes | Always "post" |

## Categories and Their Tag Colours

| category value | Display label | Colour |
|---|---|---|
| guide | Buying Guide | Gold |
| review | Set Review | Blue |
| game | Game Guide | Green |
| accessory | Accessories | Silver |

## Post Body Components

These HTML blocks work inside your Markdown:

### Product box with buy button
```html
<div class="product-box">
<strong>Product Name Here</strong>
<p>Short description of the product.</p>
<a href="https://www.amazon.com.au/dp/ASIN?tag=blasdigital-22" target="_blank" rel="noopener sponsored" class="buy-btn">Check Price on Amazon AU →</a>
</div>
```

### Info / note box
```html
<div class="info-box">
<p><strong>Note:</strong> Your note text here.</p>
</div>
```

## Netlify Deployment (Git)

1. Push this repo to GitHub.
2. In Netlify: New site from Git, point to the repo.
3. Build command: `npm run build`
4. Publish directory: `_site`
5. Every `git push` to main auto-deploys.

## Important: Your Non-Blog Pages

The static pages (index.html, shop.html, tracker.html, etc.) are NOT managed
by Eleventy. They stay as separate HTML files and are deployed alongside the
_site/ output. On Netlify Git deployment, place them in the repo root or in a
/public/ folder and configure Netlify redirects if needed.

Simplest approach: keep non-blog pages in the repo root. Netlify will serve
_site/ as the build output, which only contains blog.html and blog/ posts.
For the other pages, add them to netlify.toml as static files or just deploy
them manually via drag-and-drop alongside the build.
