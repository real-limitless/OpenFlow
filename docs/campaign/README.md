# Campaign storyboard

Static HTML frames used to produce README marketing screenshots.

## Frames

| File | Output PNG |
| --- | --- |
| `frames/hero.html` | `docs/images/campaign-hero.png` |
| `frames/why.html` | `docs/images/campaign-why.png` |
| `frames/wiki.html` | `docs/images/campaign-wiki.png` |
| `frames/roster.html` | `docs/images/campaign-roster.png` |
| `frames/flow.html` | `docs/images/campaign-flow.png` |

## Capture

```bash
cd docs/campaign
./capture.sh
```

Requires network once for Google Fonts (or frames fall back to system fonts). Uses Playwright via a temp install when available.

Manual: open a frame in a browser at 100% zoom and screenshot the 1440×900 `#frame` canvas.

## Story

1. **Hero** — hire a wiki workforce; paste `owner/repo`; OpenCode is the intended runtime
2. **Why** — code is a liability; understanding is the asset
3. **Wiki** — tree, Mermaid, source chips, Ask; sample `acme/ledger`
4. **Roster** — named agents, timeline, deliverable (not chat bubbles)
5. **Flow** — MCP Flow canvas + Generate driving node and roster state
