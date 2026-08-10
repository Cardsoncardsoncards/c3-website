---
layout: post
title: "A Note on a Bot Problem We Found and Fixed on Our Signup Form"
description: "A short, honest update on an automated signup issue we found, what it actually meant for anyone affected, and what we did about it."
date: 2026-08-07
category: news
emoji: "🛡️"
tags: post
affiliate_disclaimer: false
---
We want to be upfront about something we found and fixed recently, rather than quietly patch it and say nothing.

## What happened

Over a period of a couple of weeks, our account signup form was targeted by automated software submitting real email addresses, not to actually use the feature, but simply to trigger the confirmation email our system sends on every new signup. We noticed because almost none of these new accounts ever went on to actually use the feature they'd supposedly signed up for, a pattern that doesn't happen with real, genuine signups at any meaningful scale.

If you received a signup confirmation email from us that you don't remember requesting, this is almost certainly why, and we're sorry it happened.

## Where the addresses likely came from

To be clear, this wasn't a breach of anything we hold. The pattern points to a pre-existing list of addresses gathered from elsewhere being run through many sites' signup forms automatically, ours being one of them, not to anyone specifically targeting C3 or anyone gaining access to information they shouldn't have had.

## What this wasn't

No accounts were compromised. No passwords, payment details, or personal information beyond an email address were ever involved.

Nobody's data was exposed to anyone else. This was an automated system submitting addresses it had gathered from elsewhere into a form that, at the time, sent an email without adequately checking whether a real person was on the other end of the submission.

## What we did

We added a genuine verification step to the signup form that automated submissions can't pass but real visitors never notice, along with additional checks that catch unusual submission patterns before an email ever goes out. We tested this properly against real, ongoing attempts rather than assuming it worked, and it has correctly blocked every automated attempt since it went live, across multiple different sources.

We also went back and confirmed, using our email provider's own delivery records, that the actual impact was limited. The overwhelming majority of the confirmation emails that did go out were delivered normally with no further issue, and we're continuing to monitor for any sign of impact on our ability to send legitimate emails going forward.

## How we actually noticed

This wasn't reported to us, we found it ourselves through routine review of account activity. The tell was clear once we looked: a large number of new signups, and almost none of them ever completing the one action the feature exists for. Real signups don't behave that way at any real scale, someone signing up and then simply not getting around to it happens, but not to nearly every single new account in a row.

Once we saw the pattern, we checked how the emails themselves had actually performed using our email provider's own delivery data, rather than assuming. That confirmed the picture: a short, real spike in unwanted sends, concentrated in a specific window, not an ongoing, unbounded problem.

## Why we're not just calling this fixed and moving on

A fix that only stops what we've already seen isn't the same as a fix that stops what comes next. So alongside closing this specific gap, we also added ongoing monitoring for the same kind of pattern; a batch of new accounts with essentially no follow-through activity is now something we get told about automatically, rather than something we'd have to notice by chance again.

## If this was you

We won't be sending a follow up email about this specifically, since doing so would mean sending yet another unrequested message to an address that never asked to hear from us in the first place, which doesn't help anyone. If you'd like your account and any associated data removed entirely, reach out and we'll take care of it directly.

## Frequently asked questions

**Do I need to do anything?**
No action is needed on your part. If you never intended to sign up, the account can simply be ignored, or you can contact us to have it removed.

**Is my email address at risk?**
No new exposure occurred here. The addresses used were already being gathered by whatever automated system was doing this, not exposed by anything on our side.

**How do I know this won't happen again?**
We built and tested a real technical barrier, not just a warning, and we've been watching it hold under continued real attempts since it went live.

**Why are you posting about this publicly?**
Because we'd rather be upfront about a real problem and how it was actually handled than say nothing and hope nobody noticed.

**How many accounts were affected?**
A small number relative to our overall user base, concentrated in a short window rather than spread out over a long period. We're deliberately not publishing an exact figure, since it wouldn't be meaningful to a reader without the full context, and the honest headline is that it's fixed and being watched, not the precise count.

The C3 Team
