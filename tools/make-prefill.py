#!/usr/bin/env python3
"""
Generate a one-click page that opens the poutine in a new CodePen.

CodePen has no write API and no API key. The only programmatic path is the
documented "prefill" form: POST a `data` field of JSON to
https://codepen.io/pen/define and the browser lands on a new, unsaved Pen with
every panel filled in. Saving it needs you to be logged in — nothing else does.

Reads css-art/codepen/pen.{html,css,js} so the button can never drift from the
files that are the actual source of truth.

    python3 tools/make-prefill.py <output.html>
"""

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PEN = ROOT / "css-art" / "codepen"

payload = {
    "title": "Poutine — CSS Art",
    "description": (
        "A tray of poutine drawn entirely in CSS: 50 fries, 13 cheese curds and "
        "11 patches of gravy. No images, no SVG, no canvas."
    ),
    "tags": ["css", "css-art", "frontendchallenge", "food"],
    "editors": "111",          # html, css and js panels all open
    "layout": "left",
    "html": (PEN / "pen.html").read_text(),
    "css": (PEN / "pen.css").read_text(),
    "js": (PEN / "pen.js").read_text(),
}

# Embedded in a <script type="application/json"> block, so the only sequence
# that could break out of it is a literal </script>.
blob = json.dumps(payload, ensure_ascii=False).replace("</script", "<\\/script")

page = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Open the poutine in CodePen</title>
<style>
  :root{color-scheme:dark}
  body{
    margin:0; min-height:100vh;
    display:grid; place-content:center; justify-items:center;
    gap:1.25rem; padding:2rem; text-align:center;
    font-family:ui-rounded,"Segoe UI",system-ui,sans-serif;
    background:radial-gradient(80%% 60%% at 50%% 35%%,#3a2718,#150f0b 70%%);
    color:#faf1e6;
  }
  h1{margin:0; font-size:clamp(1.4rem,1rem+2vw,2rem); letter-spacing:-.01em}
  p{margin:0; max-width:38rem; color:#d3bda6; line-height:1.6}
  button{
    font:inherit; font-weight:700; font-size:1rem; letter-spacing:.02em;
    color:#2a1608; background:linear-gradient(to bottom,#f5b93f,#c98a1c);
    border:0; border-radius:999px; padding:.9rem 1.9rem; cursor:pointer;
    box-shadow:0 .3em .9em rgba(0,0,0,.5), inset 0 .1em 0 rgba(255,255,255,.6);
  }
  button:hover{filter:brightness(1.07)}
  button:active{transform:translateY(1px)}
  button:focus-visible{outline:3px solid #ffd97a; outline-offset:3px}
  small{color:#a98f76; max-width:34rem; line-height:1.6}
  code{background:#2a1e16; padding:.1em .4em; border-radius:4px}
</style>
</head>
<body>

<h1>Open the poutine in CodePen</h1>
<p>
  This sends the HTML, CSS and JS straight into a new Pen with every panel
  filled in. Make sure you're signed in to CodePen first, then just hit
  <strong>Save</strong> on the Pen that opens.
</p>

<form action="https://codepen.io/pen/define" method="POST" target="_blank">
  <input type="hidden" name="data" id="data">
  <button type="submit">Create the Pen</button>
</form>

<small>
  Nothing is sent anywhere except CodePen, and only when you press the button.
  Prefer to do it by hand? Paste <code>pen.html</code>, <code>pen.css</code> and
  <code>pen.js</code> into the three panels yourself.
</small>

<script type="application/json" id="payload">%s</script>
<script>
  // Assigning the value as a property avoids every HTML-attribute escaping
  // trap that comes with putting a large JSON blob in value="...".
  document.getElementById('data').value =
    document.getElementById('payload').textContent;
</script>

</body>
</html>
""" % blob

out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "new-pen.html")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(page)

kb = len(page) / 1024
print(f"wrote {out} ({kb:.1f} KB)")
print(f"  html {len(payload['html']):>6,}  css {len(payload['css']):>6,}  js {len(payload['js']):>5,} bytes")
