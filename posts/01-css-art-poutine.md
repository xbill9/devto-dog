---
title: I drew a poutine in CSS, and got it wrong three times first
published: false
description: 50 fries, 13 curds and 11 patches of gravy, with no images, no SVG and no canvas — plus the three mistakes that taught me the most.
tags: frontendchallenge, devchallenge, css, webdev
cover_image:
---

*This is a submission for [Frontend Challenge: Comfort Food Edition](https://dev.to/devteam/join-our-latest-frontend-challenge-comfort-food-edition-28a0), CSS Art: Comfort Food*

## What I Built

A paper tray of poutine: **50 fries, 13 cheese curds, 11 patches of gravy**, a ribbon of it still pouring in, and steam coming off the top. No images, no SVG, no canvas. Every edible object on screen is an `<i>` or a `<b>` shaped with CSS.

I picked poutine because it is the *worst-behaved* food I could think of, and that turns out to be the interesting part. A croissant is a silhouette problem — get the outline right and you're most of the way there. A pile of fries under gravy is a **depth** problem. Things overlap. Sauce runs into the gaps. The entire appeal of the dish is that you can't tell where one component stops and the next begins.

That means you can't cheat it with one clever shape. You have to build an actual pile.

## Demo

{% codepen https://codepen.io/xbill9/pen/WbRLbKq %}

Also running standalone at **[xbill9.github.io/devto-poutine/css-art/](https://xbill9.github.io/devto-poutine/css-art/)**, if you'd rather see it fill a whole window.

There's one button — **Add more gravy**. It is the only JavaScript in the piece: about twenty lines that replay an animation and drop another curd on the heap. Everything else is CSS.

## Journey

### One element per fry

Each fry is a single element carrying its own coordinates:

```html
<i class="fry" style="--x:44%; --y:49%; --r:-32deg; --l:26; --w:3.2; --s:.35"></i>
```

- `--x` / `--y` — position in the pile
- `--r` — rotation, where `0deg` is a fry standing on its end
- `--l` / `--w` — length and width
- `--s` — how well done it is

That last one is my favourite. It feeds a `color-mix()` so every fry browns independently, which is what stops fifty identical rectangles from looking like fifty identical rectangles:

```css
background: linear-gradient(to bottom,
  color-mix(in oklab, var(--fry-crisp), var(--fry-deep) calc((1 - var(--s)) * 100%)) 0%,
  var(--fry-mid)   11%,
  var(--fry-light) 38%,
  var(--fry-mid)   76%,
  color-mix(in oklab, var(--fry-deep), var(--fry-crisp) calc(var(--s) * 100%)) 100%);
```

Interpolating in `oklab` matters here — mixing browns in sRGB takes a detour through something muddy and grey, and fried potato is the one thing you cannot afford to render grey.

Curds and gravy patches follow the same pattern, with `--br` carrying a full lopsided `border-radius` so no two lumps of cheese share a shape.

---

Now the three things I got wrong. This is the part I'd actually want to read, so it's the part I'll spend the words on.

### Mistake 1: I sized everything in `vmin`

`vmin` felt like the obvious unit for responsive art. It isn't, and the reason is subtle enough that I didn't spot it until I rendered the thing and stared at it.

The scene is capped at 620px. But `vmin` is relative to the **viewport**, not to the artwork. So on a wide screen every part kept growing after the canvas had stopped. Each gravy blob was specified at `26vmin` — on a 900px viewport that's 234px, or **37% of a 620px canvas**. Six of those and the dish became a single brown dome with a few fries poking out the sides. It looked like a chocolate mound.

The fix is to let the artwork define its own unit:

```css
.scene{
  --u:  min(86vw, 78vh, 620px);  /* the artwork's own edge length */
  --px: calc(var(--u) / 100);    /* one hundredth of it */
}
```

Everything inside is now expressed in `--px` — hundredths of the piece itself. A fry at `--l:26` is 26% of the scene's height, on every screen, forever. Change `--u` and the entire dish rescales as one object.

If you take one thing from this post, take this: **art built out of many parts needs a unit relative to the art, not to the window.** `vmin` couples every element to the browser chrome instead of to its neighbours.

### Mistake 2: I made the gravy one blob

My first gravy was a single large shape laid over the pile. It read as a **lid**. Sauce doesn't sit on food, it collects *between* it — dark in the crevices, thin over the high points, with fries breaking back out through the surface.

What actually worked was three separate layers:

1. A soft, blurred dark pool at the bottom of the pile, painted *behind* the fries, filling the gaps.
2. Six irregular patches draped *over* the middle fries.
3. Five more ladled on *after* the front row of fries, so gravy visibly coats the things nearest the viewer.

And then feathering the edge of every patch so it stops looking like a sticker:

```css
mask-image: radial-gradient(closest-side, #000 58%, rgba(0,0,0,.55) 84%, transparent 100%);
```

That mask is what sells it. It also caused the one genuine head-scratcher of the build — I'd built each patch's drip as a `::after` hanging off its bottom edge, and they all silently vanished. **A mask clips pseudo-elements too**, and the drips hung outside the `closest-side` radius, so they were being masked into nothing. They had to move out into their own elements. There is now a comment in the stylesheet explaining this, because I will absolutely forget.

### Mistake 3: I let rotation track position

This one produced a genuinely beautiful sea urchin.

My first pile put the near-horizontal fries at the outer edges and the upright ones in the middle — which is, if you think about it, exactly how you draw a starburst. Every fry pointed away from the centre. It was radially symmetrical and completely wrong.

Real fries jumble. The fix was counter-intuitive: **steep rotations at the outer edge, near-horizontal ones saved for the interior.** A fry standing up at the edge of the tray reads as leaning against the wall; a fry lying flat at the edge reads as a spoke. Inverting it killed the symmetry immediately.

I also had to stop `--r` correlating with `--x` at all. If rotation increases smoothly as you move right, the eye finds the pattern even through fifty elements.

### A trick I'm quietly pleased with

The pile needed to be wider than the fries' `--x` values allowed, but scaling the container would have squashed the fries. Because fry *size* is in `--px` (scene-relative) and fry *position* is a percentage of the pile box, I could stretch one without touching the other:

```css
/* The pile box is deliberately wider than the scene: it spreads the
   --x values outward so the heap fills the tray, without distorting
   the fries themselves (they are sized in --px, not in pile %). */
.pile{ left:-4%; width:108%; }
```

The other one: the tray's near rim is a full ellipse drawn *on top of* the food, with the top half clipped away, so the pile genuinely sits **inside** the boat rather than in front of it:

```css
/* keep only the lower arc: the rim closest to the viewer */
clip-path: polygon(-2% 50%, 102% 50%, 102% 104%, -2% 104%);
```

### Accessibility

CSS art is decorative, but it shouldn't be *hostile*.

The whole scene is a single `role="img"` with a description of the dish, and all **90** decorative elements inside are `aria-hidden`. A screen reader gets one sentence about a tray of poutine, not ninety anonymous list items.

Every animation — steam, drips, the pour — is switched off under `prefers-reduced-motion`, and crucially the elements are left in a sensible **resting state** rather than simply frozen at opacity zero:

```css
@media (prefers-reduced-motion:reduce){
  .steam i,.sauce,.runnel,.pour,.pour::after,.droplet{ animation:none !important; }
  .steam i{ opacity:.45; transform:translate(-50%,-40%) scale(1.1); }
  .droplet{ opacity:1;  transform:translate(-50%,300%); }
}
```

Turning motion off should give you a still photograph, not a blank space where the steam used to be.

### What I'd tell myself at the start

Render it and *look* at it, early and often. Every one of these three mistakes was invisible in the code and obvious the second it hit a screen — the vmin bug in particular looked completely reasonable as CSS and completely absurd as a picture.

Code: [github.com/xbill9/devto-poutine](https://github.com/xbill9/devto-poutine) · MIT licensed.

Companion piece: I reused this artwork as the hero of a full landing page for the *Perfect Landing* category, wired to a slider that lets you drown it in gravy.
