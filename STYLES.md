# Style Registry

Every visual style we've shipped, with its name, recipe and how to recall it.
To reuse a style later, just name it in chat - I load the spec file, you tweak
captions/images, and I re-render in one step.

| # | Name | Type | Files | Recreate |
|---|---|---|---|---|
| 1 | **Founder Frames** | LinkedIn carousel (5 slides) | `scratch/carousel-story.json` + `scratch/carousel-imgs/` + `scratch/render-carousel.mjs` | See below |
| 2 | **Flow** | spec-diagram infographic (set up -> publish) | `scratch/open-person-flow.json` + `scratch/render-story.mjs` | `node scratch/render-story.mjs scratch/open-person-flow.json …` |
| 3 | **Trailer - Phones** | 3 real-video phone teaser | `scratch/open-person-trailer.json` + render-story.mjs (screencast) | same renderer, layout: phones |
| 4 | **Trailer - Laptop** | single laptop teaser, wide white space | `scratch/open-person-trailer-laptop.json` | same, layout: laptop |

---

## 1) Founder Frames (carousel)

**What it is:** a 5-slide, full-bleed dark-photo founder story. White
sentence-case type in a three-tier hierarchy (kicker -> bold headline ->
quiet aside), text sits in the upper empty space, a scrim keeps it readable,
one underline nudge on any slide, optional black-and-white on specific slides.

**Key files**
- Captions + layout: `scratch/carousel-story.json`
- Images: `scratch/carousel-imgs/<name>.png` (portrait, 1500x2000; HEIC sources
  live in ~/Downloads and are decoded to RGB via pillow-heif)
- Renderer: `scratch/render-carousel.mjs`

**How to recall it in future:** say **"Founder Frames"** and tell me:
1. New captions (or "keep current"),
2. Any image changes (filenames -> slide number, or drop new photos and I
   map them),
3. Toggles: align (right/center), underline, black&white per slide.

**Invoke manually:**
```bash
node scratch/render-carousel.mjs scratch/carousel-story.json scratch/carousel-out \
  --chrome /home/zain/.cache/pptr/chrome-headless-shell/linux-156.0.8078.80/chrome-headless-shell-linux64/chrome-headless-shell
```

**Per-slide switches in carousel-story.json**
- `align`: `"center"` (default) or `"right"`
- `posTop`: text-block vertical position in % (default 15 = near the top)
- `underline: true` on any slide for the CTA nudge
- `bw: true` to render that slide black and white
- `mood`: `["#15161d", "#2a2436"]` - backdrop gradient used only when
  `img` is empty (placeholder mode)
- `img`: path to the photo backdrop ("" = gradient placeholder)

**Image pipeline (HEIC phone photos)**
- `pillow-heif` decodes HEIC -> RGB with correct orientation (ffmpeg's hevc
  decode silently drops chroma - do not use it for photos).
- Standard export: portrait 1500x2000; text always re-fits to one line per
  tier.

**Current content (as approved 2026):** 5 slides - wanted to build websites /
didn't know how to code / then agentic AI caught up / five websites built in
2026 / reach out for your personal-branding website (happy face, B&W).