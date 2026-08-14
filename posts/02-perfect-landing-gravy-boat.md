---
title: Gravy Boat — a landing page with a CSS poutine you can drown
published: false
description: A poutinerie landing page in three files, no build step, no dependencies — where accessibility was the design constraint and testing with JavaScript off found two real bugs.
tags: frontendchallenge, devchallenge, a11y, css
cover_image:
---

*This is a submission for [Frontend Challenge: Comfort Food Edition](https://dev.to/devteam/join-our-latest-frontend-challenge-comfort-food-edition-28a0), Perfect Landing: Comfort Food*

## What I Built

**Gravy Boat** — a landing page for a fictional poutinerie. One truck, four corners, sells exactly one thing and has opinions about it.

The hero isn't a photograph. It's the CSS poutine I built for the other half of this challenge — 50 fries, 13 curds, no images — wired to a slider. Drag **Gravy level** from *Dry* to *Drowned* and the sauce on the plate responds.

I wanted the interactive bit to be something that actually belonged on a restaurant page rather than a widget bolted on to prove I could. Arguing about how much gravy is correct *is* the culture of this dish, so putting that argument in the user's hands is the one control that earns its place.

**Three files. No build step, no dependencies, no framework.**

## Demo

{% embed https://xbill9.github.io/devto-poutine/ %}

## Journey

### The slider drives CSS, not JavaScript

The temptation with an interactive hero is to animate it in JS. There was no need. The scene exposes two custom properties, and the slider just sets a data attribute:

```css
.scene[data-gravy="0"]{ --sauce-op:0;   --sauce-k:.6  }
.scene[data-gravy="1"]{ --sauce-op:.62; --sauce-k:.82 }
.scene[data-gravy="2"]{ --sauce-op:1;   --sauce-k:1   }
.scene[data-gravy="3"]{ --sauce-op:1;   --sauce-k:1.22}

.scene[data-gravy="0"] .pour,
.scene[data-gravy="0"] .droplet{ opacity:0 }
```

All eleven gravy patches read `--sauce-op` and `--sauce-k`, so one attribute change restyles the whole plate — and at level 0 the pouring ribbon stops too, because a dry poutine shouldn't have gravy mid-air above it. The JavaScript is one line of state plus a label update.

### Accessibility was the constraint, not the audit

This is the category judged on accessibility, so I want to be specific rather than just claim it.

**Contrast was checked before shipping, not after.** I wrote a script to compute all seventeen colour pairs. The lowest anywhere on the page is **7.74:1** — muted body text over the warm hero gradient. Everything else clears AAA. The detail that mattered: the hero has a translucent overlay, so I composited it against the base background and tested the colour that *actually renders*, not the token I typed. Checking `--ink-dim` against `--bg` would have flattered me by a full point.

**The menu filter announces itself.** Filtering cards visually is trivial. The part people skip is that a screen reader user gets no signal at all when eight cards silently become two. Each filter is a real `<button>` with `aria-pressed`, and a `role="status"` region announces *"Showing 2 spicy poutines."*

**The slider speaks in words.** A range input announcing "0, 1, 2, 3" is useless. It carries an `aria-valuetext` that changes with the value:

```js
// Screen readers announce the value, so give them words not a number.
slider.setAttribute('aria-valuetext', level.text);   // "Classic gravy"
```

**The mobile nav gives focus back.** Escape closes the panel *and* returns focus to the toggle that opened it. This is the step that gets forgotten, and it's the one that strands keyboard users at the top of the document.

**The form doesn't lie.** Errors wire through `aria-describedby` and `aria-invalid`, focus moves to the offending field, and success lands in a live region.

Plus the unglamorous foundations: a skip link as the first tab stop, exactly one `<h1>`, no heading-level jumps, real landmarks, a `<table>` with a proper `<caption>` and `scope` attributes, and a single `:focus-visible` treatment applied once and used everywhere.

### Turning JavaScript off found two real bugs

I had already written "progressive enhancement" in my notes. Then I actually loaded the page with JS disabled, and two of my claims turned out to be false.

**The mobile nav was unreachable.** The nav was `display:none` below 52rem, revealed by a toggle that only JavaScript could operate. With JS off, mobile users got a hamburger button that did nothing and no navigation at all. I had built a menu that hid itself and threw away the key.

The fix is the old `.js` class trick, set before first paint so there's no flash:

```html
<!-- Marks the document as scripted before first paint, so the collapsible
     mobile nav is only ever hidden when there is JS available to reopen it. -->
<script>document.documentElement.classList.add('js');</script>
```

```css
@media (max-width:52rem){
  .js .nav-toggle{ display:inline-flex }   /* only offer the control if it works */
  .js .site-nav  { display:none }          /* only collapse if we can expand */
}
```

Without JS the nav is simply a visible stacked list. **Collapse is the enhancement.**

**`novalidate` was killing the fallback.** I'd put `novalidate` on the form in the HTML, as you do when you're handling validation yourself. But with JS off that disables the *browser's* validation too — so the no-JS path had no validation whatsoever, which is strictly worse than doing nothing. It now gets applied by the script, at the moment the script takes over:

```js
// Take over validation only now that we can actually do it. Without this
// script the browser's native validation stays in charge.
form.setAttribute('novalidate', '');
```

Both bugs were in features I had already described as working. The lesson isn't "test without JS" so much as **your description of your own code is not evidence**.

### The deployment trap

Cloud Run routes traffic to `$PORT`, which defaults to **8080**. The stock `nginx` image listens on **80**. A naive `FROM nginx:alpine` container builds perfectly, runs perfectly on your laptop, and then fails its health check on deploy for reasons the build log won't mention.

The repo ships an `nginx.conf` that listens on 8080 for exactly this reason.

One more, found by testing rather than thinking: I'd used the standard SPA fallback, `try_files $uri $uri/ /index.html`. There's no client-side routing here, so all that does is return **HTTP 200 with a page of HTML** when someone requests a stylesheet that doesn't exist — turning a loud 404 into a silent, baffling mystery. Changed to `=404`.

### Reduced motion

Every animation and transition collapses to ~0ms, while the artwork keeps a legible resting state — steam visible, droplet caught mid-fall — rather than leaving holes where the motion was.

```css
@media (prefers-reduced-motion:reduce){
  html{ scroll-behavior:auto }
  *,*::before,*::after{
    animation-duration:.001ms !important;
    animation-iteration-count:1 !important;
    transition-duration:.001ms !important;
  }
  /* leave the artwork legible in its resting state */
  .steam i{ opacity:.45; transform:translate(-50%,-40%) scale(1.1) }
  .droplet{ opacity:1;  transform:translate(-50%,300%) }
}
```

### What it adds up to

Three files — 51KB uncompressed, **14KB gzipped** — zero dependencies, and no external requests at all: no fonts, no images, no CDN. It works with JavaScript off, with motion disabled, at 390px, and through a keyboard. None of that required a framework — mostly it required loading the page in the states I'd claimed to support and discovering I was wrong twice.

Code: [github.com/xbill9/devto-poutine](https://github.com/xbill9/devto-poutine) · MIT licensed.

Companion piece: the hero artwork has its own writeup in the *CSS Art* category, including the three ways I got the pile wrong before it looked like food.
