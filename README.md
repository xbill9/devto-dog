# Poutine — DEV Frontend Challenge: Comfort Food Edition

Two submissions, one subject.

| | |
|---|---|
| **CSS Art: Comfort Food** | `css-art/` — a tray of poutine drawn with no images, no SVG, no canvas |
| **Perfect Landing: Comfort Food** | `landing/` — *Gravy Boat*, a poutinerie landing page that reuses the artwork as its hero |

**Live**, deployed from `main` by `.github/workflows/pages.yml`:

| | |
|---|---|
| Landing page | <https://xbill9.github.io/devto-poutine/> |
| Standalone artwork | <https://xbill9.github.io/devto-poutine/css-art/> |
| One-click "open in CodePen" | <https://xbill9.github.io/devto-poutine/new-pen.html> |

CodePen has no write API and no API key — the only programmatic route is its
documented [prefill](https://blog.codepen.io/documentation/prefill/) form, which
POSTs the code to `codepen.io/pen/define` and lands you on a new Pen with every
panel filled in. `tools/make-prefill.py` builds that button from
`css-art/codepen/pen.*` at deploy time, so it can't drift. Sign in to CodePen,
click the button, hit **Save**.

Finished posts for both categories are in [`posts/`](posts/); the pre-flight
checklist is [`SUBMISSION.md`](SUBMISSION.md). Licensed MIT.

---

## `css-art/` — the artwork

```
css-art/
  index.html          standalone, self-contained — open it in a browser
  codepen/
    pen.html          → CodePen HTML panel
    pen.css           → CodePen CSS panel
    pen.js            → CodePen JS panel
```

50 fries, 13 curds, 11 gravy patches, a pouring ribbon and four steam wisps.
Every edible object is an `<i>` or `<b>` positioned with custom properties:

```html
<i class="fry" style="--x:44%; --y:49%; --r:-32deg; --l:26; --w:3.2; --s:.35"></i>
```

`--x/--y` place it · `--r` rotates it (`0deg` = on end) · `--l/--w` size it ·
`--s` is how well done it is.

**Sizing.** The scene defines its own unit so the dish scales as a single object
rather than drifting with the viewport:

```css
.scene{
  --u:  min(86vw, 78vh, 620px);  /* the artwork's edge length */
  --px: calc(var(--u) / 100);    /* one hundredth of it */
}
```

Everything inside is expressed in `--px`. Changing `--u` rescales the whole dish.

The only JavaScript is the *Add more gravy* button — roughly twenty lines that
replay one animation and append a curd.

## `landing/` — Gravy Boat

```
landing/
  index.html
  styles.css
  app.js
```

No build step, no dependencies. Open `index.html` over HTTP (`app.js` is an ES
module, so `file://` will block it — see *Running locally*).

Sections: hero with the gravy slider · how it's built · filterable menu ·
hours + location + signup · FAQ.

### Accessibility

Verified, not assumed:

- **Contrast** — lowest pair on the page is **7.74:1** (muted text over the warm
  hero gradient, composited); everything else clears AAA.
- **Menu filter** — real `<button>`s with `aria-pressed`, results announced
  through a `role="status"` region.
- **Gravy slider** — carries `aria-valuetext` ("Classic gravy") so it announces
  words rather than `0–3`.
- **Mobile nav** — `aria-expanded`, Escape closes it *and* restores focus to the
  toggle.
- **Form** — `aria-describedby` / `aria-invalid`, focus moves to the error,
  success lands in a live region.
- Skip link · single `<h1>` · no heading-level jumps · real landmarks ·
  `<table>` with `<caption>` and `scope` · one `:focus-visible` treatment.
- **`prefers-reduced-motion`** collapses all animation while leaving the artwork
  in a legible resting state.

### Progressive enhancement

With JavaScript disabled the nav is a plain list, all eight dishes show, the
poutine renders at its default gravy level, and the form falls back to native
validation.

---

## Running locally

```bash
cd landing
python3 -m http.server 8000
# → http://localhost:8000
```

The CSS art needs no server: `open css-art/index.html`.

## Deploying the landing page to Cloud Run

`landing/` ships a working `Dockerfile` and `nginx.conf`. The one thing that
catches people out: **Cloud Run routes traffic to `$PORT` (8080), but the stock
`nginx` image listens on 80**, so a naive `FROM nginx:alpine` deploy fails its
health check. `nginx.conf` here listens on 8080 for that reason.

```bash
cd landing
gcloud auth login                     # if your tokens have expired
gcloud config set project YOUR_PROJECT

gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
                       artifactregistry.googleapis.com

gcloud run deploy gravy-boat \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 128Mi \
  --max-instances 3
```

Cloud Run scales to zero, so an idle demo costs nothing beyond a little
Artifact Registry storage for the image. `--max-instances` caps the blast
radius if the post does well.

Verify the deploy before embedding it:

```bash
URL=$(gcloud run services describe gravy-boat --region us-central1 \
        --format='value(status.url)')
curl -sI "$URL" | head -1          # expect HTTP/2 200
```

Then put that URL in the post:

```
{% embed https://gravy-boat-xxxxxxxx-uc.a.run.app %}
```

DEV renders it in an iframe, so viewers scroll the landing page inside a
window rather than seeing it full-bleed.

### Testing the container locally first

```bash
cd landing
docker build -t gravy-boat .
docker run --rm -p 8085:8080 gravy-boat
# → http://localhost:8085
```

### Or skip Cloud Run entirely

It is three static files with no build step, so Netlify, Vercel, GitHub Pages
or Cloudflare Pages all work, and DEV's `{% embed %}` accepts any URL.
