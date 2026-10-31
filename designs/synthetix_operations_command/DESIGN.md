---
name: Synthetix Operations Command
colors:
  surface: '#0f131c'
  surface-dim: '#0f131c'
  surface-bright: '#353942'
  surface-container-lowest: '#0a0e16'
  surface-container-low: '#181c24'
  surface-container: '#1c2028'
  surface-container-high: '#262a33'
  surface-container-highest: '#31353e'
  on-surface: '#dfe2ee'
  on-surface-variant: '#bcc9cd'
  inverse-surface: '#dfe2ee'
  inverse-on-surface: '#2c3039'
  outline: '#869397'
  outline-variant: '#3d494c'
  surface-tint: '#4cd7f6'
  primary: '#4cd7f6'
  on-primary: '#003640'
  primary-container: '#06b6d4'
  on-primary-container: '#00424f'
  inverse-primary: '#00687a'
  secondary: '#d0bcff'
  on-secondary: '#3c0091'
  secondary-container: '#571bc1'
  on-secondary-container: '#c4abff'
  tertiary: '#4edea3'
  on-tertiary: '#003824'
  tertiary-container: '#1bbd85'
  on-tertiary-container: '#00452e'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#acedff'
  primary-fixed-dim: '#4cd7f6'
  on-primary-fixed: '#001f26'
  on-primary-fixed-variant: '#004e5c'
  secondary-fixed: '#e9ddff'
  secondary-fixed-dim: '#d0bcff'
  on-secondary-fixed: '#23005c'
  on-secondary-fixed-variant: '#5516be'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#0f131c'
  on-background: '#dfe2ee'
  surface-variant: '#31353e'
typography:
  headline-xl:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Geist
    fontSize: 15px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-md:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  body-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  code-lg:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.04em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 12px
    letterSpacing: 0.06em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 0.75rem
  gutter-dense: 0.5rem
  margin: 1rem
  margin-compact: 0.5rem
  space-xs: 0.25rem
  space-sm: 0.375rem
  space-md: 0.5rem
  space-lg: 0.75rem
  space-xl: 1rem
  space-2xl: 1.5rem
---

## Brand & Style

This design system targets infrastructure architects, staff software engineers, and autonomous agent orchestration teams. It delivers an operational aesthetic: an industrial, mission-critical cyber-cockpit engineered for real-time telemetry, continuous build autonomy, and multi-agent lifecycle orchestration.

The interface prioritizes extreme visual clarity, low latency perception, and structural hierarchy over ornamental distraction. It draws from:
- **Linear:** Crisp, disciplined alignment, sub-pixel rendering considerations, keyboard-first navigation patterns, and restrained surface transitions.
- **Cursor & JetBrains:** Dense contextual utility, explicit code and execution readouts, and uncompromised monospace readability.
- **Datadog & Kubernetes Console:** Persistent situational awareness, live system pulses, telemetry graphs, and unambiguous state differentiation.

The aesthetic fuses deep carbon substrate surfaces with razor-thin structural borders and laser-focused luminescent accents.

## Colors

The palette establishes an absolute dark foundation to reduce ocular strain during extended operational sessions while making telemetry alerts instantly noticeable.

### Canvas & Surface Architecture
- **Base Canvas (`#0B0F17`):** The absolute structural root for outer viewports, background canvases, and bottom-level chrome.
- **Surface Elevation 1 (`#111827`):** Primary panel containment, dock navigation, and layout grids.
- **Surface Elevation 2 (`#1E293B`):** Nested widgets, inspector panels, card containers, and active terminal panes.
- **Surface Hover/Highlight (`#334155`):** Interactive element mouseover states, table row selections, and dividing lines.

### Functional Accents
- **Primary / Cyber Cyan (`#06B6D4` / `#38BDF8`):** System focus states, active pipelines, selected entity highlights, and primary telemetry vectors.
- **Agent Intelligence / Cyber Violet (`#8B5CF6`):** Agent thought streams, neural inference processing, dynamic model routing, and autonomous actions.
- **Success / Emerald (`#10B981`):** Passing test pipelines, verified agent deployments, healthy clusters, and clean merge states.
- **Warning / Amber (`#F59E0B`):** Token pool limits approaching, throttled API rates, node resource warnings, and unreviewed auto-PRs.
- **Destructive / Signal Crimson (`#EF4444`):** Node partition failure, dead agent threads, failed integration tests, and halted deployment rollouts.

## Typography

The typographic hierarchy prioritizes density, optical alignment, and rapid tabular parsing. 

- **Geist:** Used for user interface chrome, dashboard view headers, conversational prompt threads, and structural panel interactions. Geist offers neutral, high-legibility geometric forms with tight apertures suited for dense UI structures.
- **JetBrains Mono:** Mandatory for agent telemetry outputs, system terminal monitors, Git SHA commits, run IDs, memory utilization counters, and status badges. Tabular numerical figures (`tnum`) must be enforced across all data metrics to avoid layout jitter during live-streaming data updates.

## Layout & Spacing

The layout model is governed by an operational cockpit paradigm: multi-panel docking, collapsible tool windows, resizable panes, and persistent real-time status bars.

### Grid & Pane System
- **Viewport Layout:** Root layout uses a 100vh locked viewport with CSS grid split into primary navigation rail (48px fixed or 200px expanded), multi-column task pane (adaptive fluid), and contextual side-drawers (320px to 480px fixed).
- **Density Tier:** High information density. Component internal paddings default to 6px (`space-sm`) and 8px (`space-md`), minimizing dead space while maintaining legible grouping boundaries.
- **Responsive Adaptability:**
  - **Desktop (>1440px):** 3-to-4 column persistent multi-pane orchestration matrix (Agent Swarm Status, Task Graph, Live Terminal, Inspector).
  - **Compact Desktop / Tablet (1024px - 1439px):** Split-view workspace; inspector and logs move into slide-over sheets or tabbed lower docks.
  - **Field Emergency / Mobile (<1023px):** Single-column stacked stream view focusing on cluster kill switches, high-level pipeline health, and incident alerts.

## Elevation & Depth

This design system avoids traditional dropped blur shadows, which introduce muddy contrast in dense dark themes. Instead, depth is constructed via **tonal stratification and illuminated micro-borders**.

### Stratification Rules
- **Layer 0 (Canvas Base - `#0B0F17`):** Non-interactive canvas background and structural divider tracks.
- **Layer 1 (Card / Grid Surfaces - `#111827`):** Bounded with a 1px solid stroke of `#1E293B` (or `rgba(255, 255, 255, 0.07)`).
- **Layer 2 (Overlays / Modals / Flying Menus - `#1E293B`):** Outlined with 1px stroke of `rgba(255, 255, 255, 0.12)` accompanied by a crisp ambient perimeter: `0 4px 20px rgba(0, 0, 0, 0.6)`.

### Telemetry Glows & Signal Depth
Active state depth is communicated via subtle inner and outer luminescence:
- **Active Focus:** `0 0 0 1px #06B6D4, 0 0 12px rgba(6, 182, 212, 0.25)`
- **Agent Inferencing:** `0 0 0 1px #8B5CF6, 0 0 12px rgba(139, 92, 246, 0.25)`
- **Cluster Breach / Error:** `0 0 0 1px #EF4444, 0 0 12px rgba(239, 68, 68, 0.3)`

## Shapes

The design system employs a disciplined, industrial edge language with roundedness level `1` (Soft/Compact). 

- Standard interactive controls (buttons, inputs, telemetry chips, table rows) feature `0.25rem` (4px) corner radii.
- Outer container frames, code editors, and modal windows scale up slightly to `0.375rem` - `0.5rem` (6px - 8px) max.
- Status dots, operational live pings, and user identity avatars are the only elements with full circular pill geometry (`9999px`).
- Sharp, precise 90-degree internal intersections for nested splitters reinforce the utilitarian instrument aesthetic.

## Components

### Buttons
- **Primary Cyber:** Solid `#06B6D4` background, `#0B0F17` text, font weight 600. Focus outline includes a 2px offset cyan glow.
- **Agent Action (Neural):** Subtle dark violet tint (`rgba(139, 92, 246, 0.15)`), 1px border `rgba(139, 92, 246, 0.4)`, text `#C4B5FD`.
- **Secondary Ghost:** Background transparent, 1px border `#1E293B`, text `#E2E8F0`. Hover triggers background `#1E293B` and border `#334155`.
- **Sizes:** Standard button height is compact at 28px (`space-lg` padding-x) and 32px for primary calls to action.

### Status Chips & Badges
- Constructed with monospace typography (`label-sm`).
- Include a live 6px state indicator circle at the left margin. For operational nodes, the dot includes a CSS pulse animation (`ping` effect with 0.4 alpha).
- Variants: `HEALTHY` (emerald outline + muted fill), `SYNTHESIZING` (violet outline + glow), `THROTTLED` (amber outline), `OFFLINE` (slate-600 outline).

### Data Tables & List Views
- Alternating zero-padding edge lines with 1px border `#1E293B`.
- Row height: Dense 32px or 36px. Hover state highlights the entire row with background `rgba(255, 255, 255, 0.03)`.
- Key values, hash keys, and timestamp columns use `JetBrains Mono` and muted text color `#94A3B8`.

### Input Fields & Terminal Consoles
- Background `#0B0F17`, 1px border `#1E293B`, inset text `#F8FAFC`.
- Focus state instantly replaces border with `#06B6D4` with zero ease duration for instantaneous tactile responsiveness.
- Integrated monospaced prompt prefix (`agent@factory:~$ `) in `#06B6D4` or `#8B5CF6`.

### Cards & Telemetry Widgets
- Surface background `#111827`, border 1px solid `#1E293B`.
- Card headers feature an upper boundary strip with tracking metric, live sparkline or heartbeat canvas, and an actions overflow button.
- Footers provide sub-text status metrics with zero outer padding and an upper dividing rule.

### Specialized Software Factory Components
- **Live Stream Inspector:** Split JSON / tree-view panel rendering incoming token streams with line-by-line syntax illumination.
- **Agent Pipeline Dag Node:** Node canvas cards with connection anchor nodes, execution timer chips, and live error boundaries.