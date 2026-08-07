---
layout: post
title: "How to Spot Bot Traffic on Your Own Small Site, a Real Checklist"
description: "Real signs your traffic isn't real people, using actual numbers from a live incident, and a checklist you can run against your own analytics in five minutes."
date: 2026-08-07
category: news
emoji: "🔎"
tags: post
affiliate_disclaimer: false
---
This isn't theoretical. Over the past few weeks, this site was hit by two separate, unrelated bot problems, a signup form being farmed by automated accounts, and a much larger crawler systematically working through every product page on the site. Both were sitting in our own analytics the whole time, in ways that were checkable in minutes, once we knew what to look for.

Here's the actual checklist, with the real numbers from finding both.

## 1. Check your views-per-session ratio

This is the single most useful number nobody checks. Divide your page views by your distinct visitor sessions. A real person browsing a site like this one views multiple pages per visit, our own genuine traffic averages 6.5 pages per session. Bot traffic that hits one page and never returns sits at exactly 1.0, every time, no exceptions.

On one bad day, a full 1.00 ratio across the entire day's traffic turned out to mean every single visitor was automated. That's not a subtle signal, it's about as clear as this kind of thing gets.

## 2. Compare a single hour against your normal full day

Look at your busiest hour on a normal day. Now look at whether any single hour recently beat that number on its own. During this incident, one hour of crawler traffic outpaced what had previously been an entire normal day's total. If an hour ever quietly becomes bigger than a day used to be, something changed, and it's worth finding out what.

## 3. Don't trust a country or location field you never actually verified

We found a field in our own database that had been hardcoded to a single country for every visitor on earth, silently, since early May. Nobody had written anything malicious, a default value just never got replaced with a real one, and nobody checked. If you've never specifically tested that your location tracking returns different values for different real visitors, assume it might be lying to you the same way.

## 4. Check whether your signup conversions make sense

If you run any kind of account or signup feature, compare accounts created against the thing those accounts are actually meant to do next. In our case, out of well over a hundred new signups, exactly one ever completed the feature's core action. Zero conversion at scale isn't a marketing problem, it's usually a sign the signups aren't real people at all.

## 5. Look for a user agent that never changes, tied to a location with no reason to be there

Real visitors show natural variety, different devices, different browsers, different places your actual audience lives. One identical browser signature generating thousands of sessions from a location that has no business reason to be interested in your site is a strong tell on its own.

## 6. Check whether it's following your sitemap or your internal links

If you have server-side logs or fingerprinting, check whether unusual traffic is hitting pages you actually submitted to search engines, or wandering pages you never advertised at all. In our case, the vast majority of crawled pages had never been submitted anywhere, the traffic was discovering pages purely by following links from page to page, not from anything we'd published.

## 7. Separate "self-declaring" bots from ones that hide

Not all bot traffic is hostile. Some crawlers announce exactly what they are in their own request headers, honestly, and belong to real, identifiable companies. Others deliberately present as an ordinary browser and say nothing. The self-declaring kind can usually be managed with a polite, standard request. The kind that hides needs an actual technical block.

## 8. If you catch something, measure the real cost before panicking

It's easy to assume unwanted traffic is expensive. Measure it. In our case, the actual dollar cost of weeks of unwanted crawler traffic came to a little over a dollar, genuinely trivial next to normal operating costs. Knowing the real number changes the decision from "emergency" to "worth fixing properly, not urgently."

## A prompt you can actually use

If you've got an AI coding assistant connected to your own site's data, this is the exact technique that found the problem here, copy this in as a starting point:

```
Check my site's analytics for a bot signature: pull recent page views
grouped by visitor session, and calculate views divided by distinct
sessions. A ratio near 1.0 across most of your traffic usually means
visitors are landing once and never returning, which is a strong bot
signal, not real browsing. Compare it against your busiest, most
trusted traffic source as a baseline to see what normal actually
looks like for your own site.
```

## Frequently asked questions

**Does a 1.0 views-per-session ratio always mean bots?**
Not always, a site where every page genuinely is a single, self-contained destination could show something similar. But for most content or ecommerce sites, a sustained ratio near 1.0 across a large share of traffic is a strong, checkable signal worth investigating.

**Is all crawler traffic bad?**
No. Some crawlers, including major ones from real, identifiable companies, announce themselves honestly and can be managed with standard, polite requests rather than a hard block.

**How much traffic do I need before this is worth checking?**
Any amount. The checks here work the same on a hundred visits a day as they do on ten thousand, it's a ratio, not a raw count.

**What's the fastest single check to run right now?**
The views-per-session ratio. It needs no new tools if you're already running basic analytics, and it's the single clearest signal in this whole list.

**Do I need to be technical to run these checks?**
Most of them just need access to whatever analytics dashboard you already have. The last one, following internal links versus sitemap URLs, needs a bit more access to your own logs or data, but everything else is a spreadsheet-level comparison.

The C3 Team
