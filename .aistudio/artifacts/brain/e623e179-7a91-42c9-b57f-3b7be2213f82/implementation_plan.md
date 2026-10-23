# Implementation Plan — Animation Suite & Floating Canvas Tools Integration

Integrate the full pose export and pose-to-pose animation suite (transparent PNG/SVG, live animation preview, client-side GIF, APNG, and ZIP frame exports with manifest), along with a canvas-anchored floating vertical toolbar featuring a single looping hand-build button, while preserving the high-contrast light gray canvas backdrop and dark silhouette aesthetic with pure purple outlines and greenyellow joint accents.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and UX choices have been confirmed through Phase 1 clarification:

- **Confirmed Feature Suite**: Full export and animation engine will be integrated, including transparent PNG, vector SVG, live pose-to-pose animation preview on canvas, client-side GIF encoding (with LZW & custom palette), APNG encoding (with full 32-bit RGBA transparency and CompressionStream deflate), and multi-frame ZIP bundling with `animation.json` manifest.
- **Confirmed Floating Toolbar Design**: A compact, floating vertical toolbar anchored on the right side of the canvas with a translucent backdrop blur. The hand build selector will be represented as a **single dedicated button that loops** through the 4 canonical builds (`Full hand` → `Claw` → `Trident` → `Mickey's Glove`), accompanied by Reset, Save (+), and Delete (−) quick action triggers.
- **Confirmed Aesthetic & Contrast**: The canvas backdrop will strictly remain our light gray backdrop (`#e2e2e8`), contrasted by the dark opaque silhouette hand (`#120e1a`) with electric purple outlines (`#9d4edd`), bright greenyellow joints (`#adff2f`), and halved red wrist pin. The clean 1-pyxl unit square grid remains subtle with no sub-grid visual noise.

---

## 1. Overview & Core Concept

The application will upgrade from a static posing rig into a complete, standalone 2D animation workstation for digital artists, animators, and game designers. Users can pose the hand via direct forward kinematics and 14-iteration CCD inverse kinematics, save named key poses in browser storage, and seamlessly interpolate between any two poses to preview natural motion or export ready-to-use animation assets (GIF, APNG, or PNG sequence in a ZIP archive) directly in the browser with zero external servers or network dependencies.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Floating Toolbar Quick Action Flow**:
   - The user looks at the right edge of the stage and sees a sleek, vertically floating glassmorphism pill toolbar.
   - Clicking the **Build Cycle Button** steps sequentially through the hand builds (`Standard` $\to$ `Claw` $\to$ `Trident` $\to$ `Mickey's Glove` $\to$ `Standard`), updating the active bone chains instantly with active build tooltips.
   - Clicking **Save (+)** automatically generates a new incremental pose (e.g. `Pose 1`, `Pose 2`) in localStorage without overwriting.
   - Clicking **Reset** returns the hand to neutral flat posture while retaining chosen options.
   - Clicking **Delete (−)** removes the currently active saved pose.

2. **Pose Image Export Flow**:
   - In the "Save Pose Image" card, the user types an optional custom filename stem and clicks **Save PNG** or **Save SVG**.
   - An offscreen SVG measurer calculates the exact tight bounding box around the visible hand, scales to a square canvas ($1024 \times 1024$), renders with transparency, and triggers a clean browser download.

3. **Pose-to-Pose Animation Flow**:
   - In the "Pose-to-Pose Animation" card, the user selects a `From` pose (Current pose, Neutral flat, or any saved pose) and a `To` pose (Neutral flat or any saved pose).
   - The user configures `Duration (seconds)` (0.25s–6s) and `FPS` (4–20 fps).
   - Clicking **Preview Transition** plays the smooth interpolated motion live on the main canvas with a locked square framing box so the wrist and joints stay perfectly anchored. Clicking again stops the preview.
   - Clicking **Save GIF**, **Save APNG**, or **Save ZIP Frames** renders every interpolated frame in memory and downloads the resulting animation asset.

### Visual Identity & Layout

- **Stage Backdrop**: Clean, low-glare light gray (`#e2e2e8`) providing high legibility.
- **Grid Layer**: Minimal 1-pyxl unit lines (`#c2c2cc`) with origin axes (`#9898a6`), free of distracting quarter/third sub-grid clutter.
- **Hand Rig Silhouette**: Dark solid fill (`#120e1a`), pure purple bone outlines (`#9d4edd`), bright greenyellow joint sockets and pins (`#adff2f`), and compact red wrist hub.
- **Controls & Menus**: Dark violet-tinted panels (`#181322` and `#120e18`) with crisp typography, responsive multi-column layout, and 44px minimum touch targets on mobile/tablet viewports.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Client-Side Encoders vs External Libraries**:
  - *Chosen Approach*: Pure, zero-dependency client-side encoders (vanilla JS LZW GIF encoder, RFC 2083 APNG chunk encoder using Web Streams `CompressionStream`, and PKZIP store encoder).
  - *Why*: Keeps the entire rig 100% self-contained, capable of running offline in any modern browser without npm CDN fetches or external API latencies.
- **Decision 2: Single Looping Build Button on Canvas**:
  - *Chosen Approach*: A single icon button on the floating canvas toolbar displaying the active hand build icon and cycling through the 4 builds on each tap, while the full segmented/detailed controls remain accessible in the lower controls panel.
  - *Why*: Maximizes canvas viewing area, eliminates toolbar visual clutter, and satisfies the user's specific request for a looping toggle.
- **Decision 3: Unified Square ViewBox for All Animation Frames**:
  - *Chosen Approach*: The animation engine measures the union bounding box across all interpolated poses from $t = 0$ to $t = 1$ before rendering.
  - *Why*: Prevents jitter, clipping, or camera shifts during animations; every frame shares the exact same spatial origin and canvas size.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        MAIN CANVAS STAGE (#stage)                      │
│  Backdrop: Light Gray (#e2e2e8)                                       │
│                                                                        │
│  ┌───────────────────────┐              ┌───────────────────────────┐  │
│  │   Clean 1-pyxl Grid   │              │  Floating Mode Toolbar    │  │
│  │   (Unit lines & axis) │              │  - Looping Build Button   │  │
│  └───────────────────────┘              │  - Reset Pose Button      │  │
│                                         │  - Save Pose (+) Button   │  │
│  ┌───────────────────────────────────┐  │  - Delete Pose (−) Button │  │
│  │ Dark Silhouette Hand (#120e1a)    │  └───────────────────────────┘  │
│  │ Pure Purple Outlines (#9d4edd)    │                                 │
│  │ Greenyellow Joints (#adff2f)      │                                 │
│  └───────────────────────────────────┘                                 │
└────────────────────────────────────────────────────────────────────────┘
                                 │
                   Resizable Split Bar (#split)
                                 │
┌────────────────────────────────────────────────────────────────────────┐
│                        CONTROLS PANEL (#c)                             │
│  Dark Violet Panels (#181322 / #120e18)                                │
│                                                                        │
│  ┌─────────────────────────┐  ┌──────────────────────────────────────┐ │
│  │ Hand & Saved Poses Card │  │ Per-Digit Kinematic Cards (5 Digits) │ │
│  │ - Poses select & CRUD   │  │ - Splay add, rotation, joint curls   │ │
│  │ - Global wrist & splay  │  └──────────────────────────────────────┘ │
│  └─────────────────────────┘                                           │
│  ┌─────────────────────────┐  ┌──────────────────────────────────────┐ │
│  │ Save Pose Image Card    │  │ Pose-to-Pose Animation Card          │ │
│  │ - Filename stem         │  │ - From / To pose selectors           │ │
│  │ - Save PNG (Transparent)│  │ - Duration & FPS config              │ │
│  │ - Save SVG (Vector)     │  │ - Live Canvas Preview Button         │ │
│  └─────────────────────────┘  │ - Save GIF / APNG / ZIP frames       │ │
│                               └──────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

### Key Technical Sequences

1. **Pose Interpolation Formula**:
   - Spherical linear angle blending: `wrist = norm(a.wrist + norm(b.wrist - a.wrist) * t)`
   - Linear joint angle interpolation: `cj[d][j] = a.cj[d][j] + (b.cj[d][j] - a.cj[d][j]) * t`
   - Clamped within active limits (`expert` vs normal) at each step.
2. **APNG Stream Processing**:
   - RGBA pixels converted into row-filtered byte array.
   - Compressed via browser-native `CompressionStream('deflate')`.
   - Assembled into standard PNG chunks: `IHDR`, `acTL`, `fcTL`, `IDAT`/`fdAT`, `IEND`.
3. **Standalone Single-File Synchronizer**:
   - `src/pyxlHandStandalone.ts` and `pyxl-hand-v2.html` will be updated simultaneously so the downloaded single HTML file remains 100% feature-identical with the React application.
