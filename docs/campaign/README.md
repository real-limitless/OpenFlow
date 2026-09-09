# Campaign storyboard

Static HTML frames used to produce README marketing screenshots.

## Frames

| File | Output PNG |
| --- | --- |
| `frames/hero.html` | `docs/images/campaign-hero.png` |
| `frames/why.html` | `docs/images/campaign-why.png` |
| `frames/canvas.html` | `docs/images/campaign-canvas.png` |
| `frames/gallery.html` | `docs/images/campaign-gallery.png` |
| `frames/run.html` | `docs/images/campaign-run.png` |

Canvas and gallery frames embed live editor screenshots (`assets/live-*.png`). Recapture those from a running OpenFlow app (`npm run screenshots`) when the UI changes, then run `./capture.sh`.

## Capture

```bash
cd docs/campaign
./capture.sh
```

Requires network once for Google Fonts (or frames fall back to system fonts). Uses Playwright via a temp install when available.

Manual: open a frame in a browser at 100% zoom and screenshot the 1440x900 `#frame` canvas.

## Story

1. **Hero**: draw the work; run it on a canvas
2. **Why**: self-hosted visual editor vs rented iPaaS
3. **Canvas**: the real OpenFlow editor (nodes, palette, assistant)
4. **Gallery**: node palette on the canvas
5. **Run**: execute from the same chrome
