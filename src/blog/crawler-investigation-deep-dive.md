---
layout: post
title: "We Investigated Our Own Crawler Traffic, Here's Everything We Found"
description: "A real incident writeup: attribution, a wrong hypothesis we caught and corrected, the actual fix, and the detector we built to catch the next one automatically."
date: 2026-08-07
category: news
emoji: "🕵️"
tags: post
affiliate_disclaimer: false
---
A few weeks ago, traffic on our card price pages started climbing in a way that didn't match anything we'd done. This is the full writeup, including the parts where our first theory turned out to be wrong.

## What we actually found

Two distinct sources, not one. The largest, by far, was Meta's own crawler, self-declaring honestly in its own request headers, and confirmed against Facebook's actual published network. It accounted for roughly two thirds of all identified traffic in the first day we were able to measure it properly, and every request was for a Magic: The Gathering card page specifically.

The second was a pair of servers running on Alibaba Cloud, splitting a systematic walk through essentially the entire site, every card, across dozens of different games, each page visited exactly once. We could tell it was one coordinated operation rather than two separate ones because the two servers barely ever touched the same page twice, less than a fifth of one percent overlap, which only makes sense if they were sharing a list of what had already been covered.

Neither used a disguised or spoofed identity in the way you might expect. Meta identified itself plainly. The Alibaba pair simply presented as an ordinary, current browser and said nothing about what it actually was.

## Our first theory was wrong, and here's how we know

Our first instinct was that a recent change making our pricing data more machine readable had made the site newly attractive to scrape. It was a reasonable theory. It was also wrong, and checking it properly is what actually mattered.

The real trigger was smaller and more mundane: a fix, made about ten days before the crawling started, that stopped our own robots.txt file from accidentally blocking most of our own sitemaps. Before that fix, most of the site's catalogue was effectively unreachable through normal discovery. After it, the catalogue became visible for the first time in months. Ten days from "newly discoverable" to "a systematic crawl begins" is genuinely ordinary crawler scheduling, not a mystery.

We only know this because we went back and checked the actual timeline against real deploy history rather than trusting the first plausible-sounding explanation. It's worth saying plainly: the theory that felt right initially was not the theory that held up.

## The finding that actually mattered for the fix

The most important thing we found wasn't who was crawling, it was how they were finding pages at all. The overwhelming majority of what both crawlers fetched had never been submitted to any search engine in any form. They weren't following anything we'd published, they were discovering pages purely by following links from one page to the next.

That single fact ruled out an entire category of fix. Nothing about tuning our sitemaps was ever going to change this, because sitemaps aren't how either crawler was finding pages in the first place.

## What we actually did

For the crawler that identified itself honestly, the fix was a targeted, standard request asking it to stay off the deepest, least valuable pages specifically, while leaving everything with genuine editorial value untouched. Reversible in one line if it ever needs to be undone.

For the pair that didn't identify itself, a request alone wasn't a reliable option, so we used a direct network-level block on the two specific ranges we'd confirmed, and only those two, not the much wider block of addresses they technically sit inside, which would have affected plenty of unrelated traffic that never touched our site.

## A mistake we caught before it shipped

Partway through building a broader defence meant to generalise beyond these two specific actors, we found a real error in our own reasoning. An earlier proposed threshold had been built by comparing a daily figure against an hourly one, two different time bases mixed together without noticing. Measured properly against real per-minute traffic, that threshold would have triggered on the wrong target entirely, and never once caught the crawler responsible for the majority of the load.

We're including this because it's the honest version of how this kind of work actually goes, not because it makes a tidy story. Checking a plan against real measurements caught it before it reached a live system. That's the part worth taking away, not that a mistake happened, but that verifying it against real data was what caught it.

That broader, identity-aware defence is real, genuinely useful, and still on our list. It needs its own proper build, not a rushed version bolted onto an existing fix, so for now it's correctly parked rather than shipped half finished.

## What we built instead: a detector, not a blanket block

Rather than trying to block every conceivable future actor in advance, we built something simpler and more honest, a check that watches for the specific pattern this incident showed us, a sudden concentration of activity from one small slice of the internet in a short window, and alerts automatically the moment it happens.

It's already been tested against real production data, not synthetic examples, correctly flagging real activity and correctly staying quiet on legitimate traffic, including deliberately re-checking itself so a missed run can't quietly hide a problem.

We're not publishing the exact numbers this watches for. Sharing that precisely would mostly help someone calibrate around it, and the qualitative shape is more useful to another site owner anyway: it sits well above what any genuine visitor pattern ever produces, and well below what even a single legitimate large crawler generates in its normal course.

## What this actually cost

Worth saying plainly, since it's easy to assume unwanted traffic is expensive by default. The measured real cost of the entire incident, every extra page load, every extra function call, across the whole window it ran, came to a little over a dollar. This was never a financial emergency. It was a data integrity and control question, not a cost one, and being honest about that shaped how urgently we treated it.

## Where this leaves us

The crawler that identified itself is now managed by a targeted, standard request rather than a hard block, since it earned that by being honest about who it was. The crawler that didn't is blocked directly. And the actual gap this whole incident exposed, that nothing was watching for the next unknown actor, however it shows up, now has something watching it, tested against real data, not just built and assumed to work.

## Frequently asked questions

**Was this a security breach?**
No customer data, accounts, or payment information were ever involved. This was unwanted automated traffic reading publicly visible pages, not any kind of intrusion.

**Why not block all crawler traffic outright?**
Some crawlers, including large, legitimate ones, provide real value in return for the access they use, sending real visitors, or citing content accurately. Blocking everything indiscriminately would cut off that value along with the unwanted traffic, so the response was matched to the specific actor rather than applied as one blanket rule.

**How did you confirm who was actually behind the traffic?**
Through independent network registry lookups against the actual infrastructure serving the requests, not by trusting anything the traffic claimed about itself. One source's identity was independently confirmed as genuine; the other's infrastructure ownership was confirmed, though the specific operator behind it wasn't.

**What would you do differently next time?**
Build the detection layer earlier, before an incident, rather than after one. That's the single biggest lesson from this, the pattern was checkable the whole time, it just wasn't being checked automatically until now.

**Is this fully solved forever?**
No, and we wouldn't claim that. What's true is that these two specific sources are addressed, and the next unknown one gets caught automatically rather than discovered by chance weeks later.

The C3 Team
