# DEV Frontend Challenge: Comfort Food Edition — submission checklist

Two entries, one subject: **poutine**.

| Category | Project | Post |
|---|---|---|
| CSS Art: Comfort Food | `css-art/` | [`posts/01-css-art-poutine.md`](posts/01-css-art-poutine.md) |
| Perfect Landing: Comfort Food | `landing/` | [`posts/02-perfect-landing-gravy-boat.md`](posts/02-perfect-landing-gravy-boat.md) |

- **Deadline:** August 16, 11:59 PM PDT · winners announced September 10
- **Required tag:** `frontendchallenge` (already in both posts' front matter)
- Both posts are complete and ready to paste into the DEV editor. Each has one
  `PASTE_…_HERE` placeholder for its embed URL.

---

## 1. Publish the CSS art to CodePen

**One click:** sign in to CodePen, open
<https://xbill9.github.io/devto-poutine/new-pen.html>, press the button, then
press **Save** on the Pen that opens. Every panel arrives pre-filled.

By hand, if you'd rather:

| File | Panel |
|---|---|
| `css-art/codepen/pen.html` | HTML |
| `css-art/codepen/pen.css` | CSS |
| `css-art/codepen/pen.js` | JS |

Then swap the embed in post 1 (currently pointing at the live artwork) for
`{% embed <your-pen-url> %}`.

## 2. Landing page — already live ✅

**https://xbill9.github.io/devto-poutine/**

Deployed from `main` by `.github/workflows/pages.yml`; every push redeploys it.
The URL is already filled into post 2, and the standalone art rides along at
`/css-art/`.

Cloud Run remains an option if you'd prefer it — `landing/` ships a working
`Dockerfile` and `nginx.conf` (**nginx listens on 8080 on purpose**: Cloud Run
routes to `$PORT`, and the stock image's port 80 fails the health check). See
`README.md`. Swap the URL in post 2 if you switch.

## 3. Before you hit publish

- [x] Landing page embed URL filled in and loading
- [ ] CodePen embed URL filled in (post 1)
- [ ] `frontendchallenge` tag present on both posts
- [ ] Category line (`*This is a submission for…*`) correct on each
- [ ] Repo link in each post points at the right URL
- [ ] `cover_image:` set, or the line deleted — a screenshot of the art works well
- [ ] `published: false` → `true`, before the Aug 16 deadline

## Notes on the DEV embed

- There is no special Cloud Run liquid tag. It is the universal
  `{% embed <url> %}`, same as CodePen.
- DEV renders embeds in an **iframe**, so viewers scroll the landing page inside
  a window rather than seeing it full-bleed. Verified it behaves at 1100×820;
  the hero is the only thing above the fold.

## What was verified, not assumed

Both projects were rendered in headless Chromium and checked, rather than
eyeballed in code:

- **Contrast** — all 17 colour pairs computed. Lowest is 7.74:1 (muted text on
  the composited hero gradient); the rest clear AAA.
- **Structure** — heading order, landmarks, control labels, dangling `aria-*`
  references, keyboard order: no issues.
- **Keyboard** — skip link is the first tab stop; Escape closes the mobile nav
  and restores focus to the toggle.
- **No-JS** — nav reachable, all 8 dishes visible, artwork renders at its
  default gravy level, native form validation intact.
- **Container** — built and run locally, served in an iframe, JS exercised
  inside it: no failed requests, no console errors.
