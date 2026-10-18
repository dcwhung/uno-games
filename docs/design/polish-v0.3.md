# Visual & flow polish — v0.3 design proposal

**Design Origin:** `proposal:` this document + `baseline:` screenshots in `docs/design/baseline/`
(taken from v0.2.2 at 390×844 @2x and 844×390).

Status: proposal. Every UI change in the v0.3 series cites this document as its design
source. Reviewer sign-off is recorded in the review report of the first v0.3 batch.

---

## 1. Where v0.2.2 stands (baseline audit)

| Area        | Observed in baseline                                                                                                                                               | Why it reads as "rough"                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Lobby       | Title + two chip rows + Play on a flat dark overlay; the table edge bleeds through as a green arc                                                                  | No brand moment, no sense of a game, no preview of who you play against                                                                     |
| Environment | 10-sided flat-shaded green disc on a `#1b1b1f` void; one directional light                                                                                         | Reads as a dev placeholder, not a table; hard shadow smears across the felt                                                                 |
| Opponents   | Box body + 8-segment sphere head; nameplate `Kiki · 6` is a DOM pill that collides with the score bar at the top                                                   | Placeholder geometry; the nameplate fights the HUD for the same pixels                                                                      |
| Cards       | Canvas-drawn faces: white frame, colour fill, tilted white oval, system-font glyphs; corners are square black where the rounded rect leaves the canvas transparent | Glyphs (`⊘`, `⇄`, `W`) look like text, not iconography; square black corners read as a bug                                                  |
| Hand        | 18-card fan overflows the portrait viewport on both sides; the turn banner and Draw button sit on top of the fan                                                   | Cards you own are cut off and covered by the controls meant to act on them                                                                  |
| HUD         | Score pills show cumulative score (always 0 in round 1); active colour is an unlabeled dot; no direction indicator, no draw-pile count, no way to leave the game   | The information a player needs (how many cards does each opponent hold, which way is play going) is missing; the information shown is inert |
| Feedback    | 1.8 s text toasts at 22 % height; no sound, no haptics, no callout for Skip / Reverse / +2 / +4                                                                    | Big moments feel identical to small ones                                                                                                    |
| Round end   | Plain modal with a two-column table                                                                                                                                | No celebration, no breakdown of why the points are what they are                                                                            |

## 2. Direction: "Lounge"

A warm, premium casual card room. Deep felt, a wooden rim, soft overhead light, and bold
flat card art. Every element has a shadow or a glow that says it is a real object on a real
table. Nothing is photoreal; everything is deliberate.

### 2.1 Tokens

Defined once in `packages/app/src/styles.css` (`:root`) and mirrored in
`packages/app/src/scene/environment.ts` for the 3D side. The CSS file is the source of truth
for the DOM; `environment.ts` for the scene. Both carry the same hex values.

| Token            | Value                         | Use                                                     |
| ---------------- | ----------------------------- | ------------------------------------------------------- |
| `--bg-0`         | `#0b1020`                     | Page background top                                     |
| `--bg-1`         | `#04060c`                     | Page background bottom / vignette                       |
| `--felt`         | `#1a6a4a`                     | Felt centre                                             |
| `--felt-edge`    | `#114733`                     | Felt outer ring                                         |
| `--wood`         | `#4a2b17`                     | Table rim                                               |
| `--wood-hi`      | `#7a4a2a`                     | Rim highlight                                           |
| `--gold`         | `#e8c35a`                     | Accent: active turn, primary CTA, inlay line on the rim |
| `--ink`          | `#101218`                     | Text on light surfaces, card back base                  |
| `--paper`        | `#f7f5ef`                     | Card frame white, light surfaces                        |
| `--panel`        | `rgba(12, 14, 22, 0.78)`      | HUD glass panels                                        |
| `--card-red`     | `#e5322d`                     |                                                         |
| `--card-yellow`  | `#f7c500`                     |                                                         |
| `--card-green`   | `#2fa84f`                     |                                                         |
| `--card-blue`    | `#1f78d1`                     |                                                         |
| `--radius-pill`  | `999px`                       | Chips, banners                                          |
| `--radius-panel` | `20px`                        | Modals, sheets                                          |
| `--shadow-lift`  | `0 10px 30px rgba(0,0,0,.45)` | Floating panels                                         |

Type: `system-ui` stack, weights 600 / 800 only. Display sizes 28 / 40 / 64. Body 14 / 16.

### 2.2 Scene

- **Background**: the canvas is transparent (`gl.alpha = true`, no `<color attach>`); the page
  behind it is a radial gradient `--bg-0 → --bg-1` with a vignette. One source of truth for the
  backdrop, shared by the lobby overlay.
- **Table**: a 64-segment cylinder of felt (`--felt`, roughness 0.95) with a procedural noise
  texture (canvas, tiled) so it is not a flat fill; a torus rim in `--wood` with a thin `--gold`
  inlay ring just inside it; a darker felt ring at the edge for depth.
- **Lighting**: warm spot from above-front (`#fff2dc`, soft shadow, radius 2048), cool hemisphere
  fill (`#cfe3ff` / `#1a1420`), a low-intensity rim light from behind the far seat so opponents
  separate from the backdrop. ACES filmic tone mapping, exposure 1.05.
- **Opponents**: stylised figures, still procedural (no glTF yet): capsule torso in the seat
  colour, smooth sphere head in a warm skin tone, two dark eye dots, a small rounded "cap" in
  the seat colour. The active player gets a soft gold floor ring that breathes (scale 1 → 1.06,
  1.2 s). The catchable player gets a blue pulsing ring and the figure leans forward slightly.
  **No DOM nameplate on the figure.** Card counts move to the player strip (2.4).
- **Seat palette**: `#f28ba8` (rose), `#5fd1b2` (mint), `#f3c76b` (honey) — one per bot, also
  used for that bot's avatar dot in the HUD.

### 2.3 Cards

- Geometry: front and back are planes with an alpha-tested texture (transparent rounded
  corners), plus the thin edge box. No more black square corners.
- Face art (canvas, 512×796): `--paper` frame 20 px, colour fill with a subtle radial lighten
  at the top-left, white oval tilted −25°, a 2 px inner shadow under the oval. Centre glyphs
  are **drawn shapes, not font glyphs**:
    - numbers: heavy sans numeral with a 6 px dark drop shadow;
    - skip: circle with a diagonal bar;
    - reverse: two curved arrows chasing each other;
    - draw2: two overlapping card rectangles;
    - wild: oval split into four colour quadrants;
    - wild_draw4: four small colour cards fanned, `+4` beneath.
      Corner indices (top-left, bottom-right rotated) use the same mini shapes.
- Back: `--ink` base, red oval, white wordmark; a faint diagonal line pattern so a stack reads
  as many cards.
- Hand states: legal cards full brightness and lifted 0.03 above the fan plane; illegal cards
  dimmed to 0.55 and sunk; the selected card lifts 0.22 and scales 1.08 with a gold rim glow
  (emissive). Dragging is unchanged (swipe up plays).
- Motion: a card moving to the discard pile follows an arc (lift by up to 0.35 at the midpoint)
  and lands with a 0.9 → 1.0 scale settle. Dealing staggers each card by 45 ms.
- Fan: the spread adapts to the viewport aspect so an 18-card hand still fits a 390 px portrait
  view. The fan centre moves up so the action bar never overlaps it.

### 2.4 HUD

```
┌──────────────────────────────────────────┐
│ ☰   ● You 7   ● Momo 4   ● Kiki 1!  ● Taro 6   ◉ Blue  │  player strip
│                   ⟲  Your turn                           │  turn banner
│                                                          │
│                    [ 3D table ]                          │
│                                                          │
│                                        (UNO!)            │  action column, right
│         [ hand fan ]                   (Draw · 41)       │
└──────────────────────────────────────────┘
```

- **Player strip** (top): one chip per seat — avatar dot in the seat colour (gold ring when it
  is their turn), name, card count. A seat at 1 card shows a red `UNO` badge if they called it,
  or a pulsing blue `!` if they are catchable (tap the chip to catch). Scores are not shown
  here; they live in the round-over sheet and the pause menu.
- **Active colour**: a chip at the right end of the strip with the swatch and the colour name.
- **Turn banner**: directly below the strip, centred, with a direction glyph (⟳ / ⟲) that
  flips on reverse. Gold when it is the human's turn.
- **Action column** (bottom-right): `Draw` as a large round button showing the draw-pile count;
  `Pass` replaces it after a draw; `UNO!` as a red round button above it, pulsing while the
  human is vulnerable. The `Catch` action is on the player chip, not here.
- **Menu** (top-left `☰`): pause sheet with Resume, How to play, Settings (sound on/off, UNO
  window 0 / 2 s / 4 s), Quit to lobby (confirm).
- **Drawn card**: when the drawn card is playable, it lifts and glows like a selected card and
  a hint pill reads "Play it or pass".
- **Callouts**: Skip, Reverse, +2, +4, UNO!, Caught!, Challenge won / lost pop as a large
  centred word in the acting colour (scale 0.6 → 1, 350 ms, hold 700 ms, fade). Minor events
  (drew N, reshuffled) stay as small toasts, now at the bottom-centre above the fan.
- **Round over / Game over**: a sheet with the winner's name in display size, each row showing
  seat colour dot, name, cards left, points this round, total; the winner row glows gold; a
  CSS confetti burst for the human winning. Buttons: Next round / New game, and Quit.

### 2.5 Lobby

- Full-bleed gradient backdrop (same tokens), a floating fan of three CSS cards (red 7, wild,
  blue skip) above the wordmark, wordmark in display 64 with a gold underline, subtitle
  "Classic rules · up to 4 players".
- Opponents: three avatar cards (seat colour, name) that enable as the count rises.
- Difficulty: segmented control with one-line descriptions ("Plays the first legal card" /
  "Keeps colours, saves wilds" / "Counts the discard pile").
- Stats line from `loadStats`: "12 games · 5 wins".
- Primary CTA `Play` in gold, full width on phones; secondary `How to play` link opens the same
  rules sheet as the pause menu.

### 2.6 Sound & haptics

- `packages/app/src/audio/sfx.ts`: Web Audio synthesised cues, no asset files. `play(cue)`
  where cue ∈ `card` (short filtered noise swish), `draw` (lower swish), `uno` (two-note
  sting), `skip` / `reverse` (blip up / down), `draw2` / `draw4` (descending thud), `win`
  (three-note fanfare), `lose` (minor dyad), `tap` (click). Context is created on the first
  user gesture; `enabled` comes from settings.
- `navigator.vibrate` on card play (10 ms), on UNO (30 ms), on being caught (20-20-20).

## 3. Delivery plan

| Lane                        | Scope                                      | Files                                                                                                             |
| --------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| A — Environment             | 2.2 (background, table, lights, opponents) | `scene/Scene.tsx`, `scene/Opponent.tsx`, `scene/environment.ts` (new), `scene/Table.tsx` (new)                    |
| B — Cards & hand            | 2.3                                        | `scene/cardTextures.ts`, `scene/CardMesh.tsx`, `scene/layout.ts`, `scene/constants.ts`, `scene/TableContents.tsx` |
| C — HUD, lobby, flow, sound | 2.4, 2.5, 2.6                              | `ui/**`, `audio/**` (new), `styles.css`, `i18n/en.json`, `persistence/settings.ts`, `App.tsx`                     |

Out of scope for v0.3: glTF avatars, atlas textures via the manifest (the loader contract in
`theme/` stays as is), multiplayer, additional variants.
