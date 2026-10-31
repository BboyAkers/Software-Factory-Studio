---
name: Fluent Enterprise
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1b1c1c'
  surface-container: '#202020'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353535'
  on-surface: '#e5e2e1'
  on-surface-variant: '#c0c7d6'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#303030'
  outline: '#8a919f'
  outline-variant: '#404753'
  surface-tint: '#a6c8ff'
  primary: '#a6c8ff'
  on-primary: '#00315f'
  primary-container: '#2b91ff'
  on-primary-container: '#002a54'
  inverse-primary: '#005fb0'
  secondary: '#a3c9ff'
  on-secondary: '#00315c'
  secondary-container: '#3b93f1'
  on-secondary-container: '#002a51'
  tertiary: '#81cfff'
  on-tertiary: '#00344b'
  tertiary-container: '#009bd5'
  on-tertiary-container: '#002d41'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d5e3ff'
  primary-fixed-dim: '#a6c8ff'
  on-primary-fixed: '#001c3b'
  on-primary-fixed-variant: '#004786'
  secondary-fixed: '#d3e3ff'
  secondary-fixed-dim: '#a3c9ff'
  on-secondary-fixed: '#001c39'
  on-secondary-fixed-variant: '#004883'
  tertiary-fixed: '#c6e7ff'
  tertiary-fixed-dim: '#81cfff'
  on-tertiary-fixed: '#001e2d'
  on-tertiary-fixed-variant: '#004c6b'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353535'
typography:
  display:
    fontFamily: Segoe UI Variable
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 52px
    letterSpacing: -0.02em
  title-large:
    fontFamily: Segoe UI Variable
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.015em
  title-large-mobile:
    fontFamily: Segoe UI Variable
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  title-medium:
    fontFamily: Segoe UI Variable
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  subtitle:
    fontFamily: Segoe UI Variable
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
    letterSpacing: -0.005em
  body-large:
    fontFamily: Segoe UI Variable
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 20px
  body-default:
    fontFamily: Segoe UI Variable
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-strong:
    fontFamily: Segoe UI Variable
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  caption:
    fontFamily: Segoe UI Variable
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  caption-strong:
    fontFamily: Segoe UI Variable
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-compact: 0.5rem
  gutter-expanded: 1.5rem
  margin: 1.5rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system delivers the refined, native aesthetic of modern Windows 11 enterprise web applications. Grounded in Fluent 2 principles, it blends purposeful clarity, layered depth, and natural tactile feedback into a high-productivity workspace. The emotional response is one of calm focus, organizational precision, and ergonomic reliability. 

The aesthetic is Modern Corporate layered with sensory materials:
- **Mica & Acrylic Materiality:** Background canvas layers absorb and blur context subtly, while transient floating surfaces exhibit crystalline frosted backdrops to preserve context without visual clutter.
- **Layered Hierarchy:** Spatial structure relies on tonal steps, directional lighting (1px top-edge highlights), and delicate boundary strokes rather than aggressive dropshadows.
- **Micro-Delight & Restraint:** Animations mimic natural deceleration curves (Fluent standard cubic bezier), providing immediate visual confirmation through soft scale changes and directional light glints on hover and press states.

## Colors

The palette is engineered around dark mode enterprise environments to minimize eye fatigue during extended workflows, while strictly matching the native Windows 11 shell specification.

### Surface Architecture (Dark Mode)
- **Application Canvas (Mica Neutral):** `#202020` — The structural root foundation for primary windows and static sidebars.
- **Layer Surface:** `#272727` — Structural groupings, navigation bars, and data grids.
- **Card / Island Surface:** `#2c2c2c` (with active elevations transitioning to `#2d2d2d`).
- **Floating Flyout / Popover (Acrylic):** `rgba(44, 44, 44, 0.85)` with `backdrop-filter: blur(20px) saturate(125%)`.

### Accent & Telemetry
- **Primary Accent:** `#118dff` — Actionable interactions, focused rings, and primary button fills.
- **Accent Hover:** `#0078d4` — Pressed/active accent states.
- **Accent Light / Subtle:** `rgba(17, 141, 255, 0.12)` — Selected state backgrounds for list items, tabs, and checkboxes.
- **Tertiary Cyan Highlight:** `#4cc2ff` — Telemetry badges, live system updates, and keyboard focus focus-visible outer borders.

### Outlines & Borders
- **Standard Control Stroke:** `rgba(255, 255, 255, 0.08)` (`#ffffff14`) — 1px consistent perimeter on card surfaces.
- **Elevation Highlight (Top Inset):** `rgba(255, 255, 255, 0.12)` — Applied via `box-shadow: inset 0 1px 0` to simulate overhead directional illumination.
- **Subtle Divider:** `rgba(255, 255, 255, 0.05)` — Gridlines and command bar separators.

## Typography

The typographic hierarchy implements Microsoft's variable font architecture (`Segoe UI Variable`), with automatic optical sub-family selection based on point size (`Text`, `Display`, and `Small`).

- **Display & Title Large:** Used exclusively for high-level dashboard metrics, welcome headers, and major workspace section titles. Characterized by tighter negative tracking (`-0.015em` to `-0.02em`) and semi-bold weights (`600`).
- **Body & Subtitle:** The default operational canvas baseline is `14px` (`body-default`) with a `20px` line-height, optimized for dense information displays and complex multi-column data sheets.
- **Caption:** Strictly applied to metadata timestamps, helper text, and micro-metrics. Must never drop below `12px` to preserve enterprise accessibility standards.

## Layout & Spacing

This design system uses an adaptive 12-column grid system designed around standard desktop enterprise displays, dynamically reflowing across 3 viewport classes:
- **Compact Viewport (320px – 640px):** Single column stack, outer margins `1rem`, navigation collapses into an Acrylic off-canvas drawer.
- **Medium Viewport (641px – 1024px):** 6-column grid, persistent icon-only rail (48px wide), outer margins `1.25rem`.
- **Expanded Desktop Viewport (1025px+):** Full 12-column system, standard left tree navigation (240px–280px wide), outer margins `1.5rem`, column gutters `1rem`.

Component padding strictly aligns to a 4px/8px incremental cadence:
- `space-xs` (4px): Button internal icon-to-label gaps, badge paddings, dense list-item vertical offsets.
- `space-sm` (8px): Input field vertical padding, toolbar gaps, compact card inner margins.
- `space-md` (12px): Standard form vertical field spacing, table row height padding.
- `space-lg` (16px): Card internal content padding, segmented control outer frames.
- `space-xl` (24px): Layout panel separation and modal container body margins.

## Elevation & Depth

Visual hierarchy uses Fluent 2 layered depth, combining ambient dark drop shadows with directional edge highlights. Surfaces rise toward the user along a clear z-index and shadow continuum:

- **Surface 0 (Canvas Base):** Flat `#202020`. No shadows.
- **Surface 1 / Elevation 2 (Cards, Panels):** `#2c2c2c`, bordered with `1px solid rgba(255, 255, 255, 0.08)`. Shadow: `0px 1px 2px rgba(0, 0, 0, 0.28), 0px 0px 2px rgba(0, 0, 0, 0.12)`.
- **Surface 2 / Elevation 4 (Clickable Hover States, Split Buttons):** `#2d2d2d`. Shadow: `0px 2px 4px rgba(0, 0, 0, 0.32), 0px 0px 2px rgba(0, 0, 0, 0.14)`.
- **Surface 3 / Elevation 8 (Flyouts, Menus, Dropdowns):** Acrylic translucent surface (`rgba(44, 44, 44, 0.85)` + `backdrop-filter: blur(20px)`). Shadow: `0px 4px 8px rgba(0, 0, 0, 0.38), 0px 0px 2px rgba(0, 0, 0, 0.16)`.
- **Surface 4 / Elevation 16 (Dialogs, Side Sheets):** Shadow: `0px 8px 16px rgba(0, 0, 0, 0.42), 0px 0px 4px rgba(0, 0, 0, 0.18)`.
- **Surface 5 / Elevation 28 (Critical System Overlays, Light Dismiss Prompts):** Shadow: `0px 14px 28px rgba(0, 0, 0, 0.48), 0px 0px 8px rgba(0, 0, 0, 0.22)`.

All elevated resting layers feature an ambient top highlight: `box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.08)`.

## Shapes

The geometric framework is built strictly on Fluent 2 corner radiuses, striking a balance between modern software ergonomics and architectural density:
- **Base Geometry (`4px` / `0.25rem`):** Form controls, text inputs, split buttons, list items, and table selection highlights.
- **Medium Structural Surface (`8px` / `0.5rem`):** Content cards, context menus, command bars, flyout containers, and modal dialogs.
- **Pill / Fully Rounded (`9999px`):** Status badges, count tags, presence indicators, search bar trigger tokens, and filter chips.

## Components

### Buttons
- **Primary:** Filled with `#118dff`, foreground `#ffffff`, 4px border radius. Inset highlight: `inset 0 1px 0 rgba(255, 255, 255, 0.2)`. On hover: `#0078d4`. On active: scaled to `0.985` with background `#0067b8`.
- **Standard (Secondary):** Filled with `rgba(255, 255, 255, 0.06)`, border `1px solid rgba(255, 255, 255, 0.08)`. On hover: `rgba(255, 255, 255, 0.09)`.
- **Subtle (Ghost):** Background transparent, padding `6px 12px`. On hover: `rgba(255, 255, 255, 0.05)`.
- **Command Bar Button:** Height 32px, text 14px Segoe UI Variable, with standard 16px Fluent system iconography placed 8px ahead of the label.

### Cards & Surfaces
- Standard cards sit on `#2c2c2c` with an outer border `1px solid rgba(255, 255, 255, 0.08)` and corner radius `8px`.
- Interactive cards elevate from Elevation 2 to Elevation 4 on pointer hover, transitioning surface tint to `#2d2d2d` with a `150ms cubic-bezier(0.1, 0.9, 0.2, 1.0)` timing curve.

### Input Fields & Search
- Container height 32px (standard) or 40px (large). Surface fill `rgba(255, 255, 255, 0.05)`, bottom border highlight `1px solid rgba(255, 255, 255, 0.54)`, top/left/right border `1px solid rgba(255, 255, 255, 0.08)`.
- **Focus State:** Bottom stroke expands to 2px solid `#118dff`, creating the authentic Fluent focused line highlight without content shifting.

### Checkboxes & Radios
- 16x16px boxes with `4px` corner radius. Unchecked state: 1px border `rgba(255, 255, 255, 0.54)` over transparent fill. Checked state: solid fill `#118dff` with white Fluent check glyph.
- Radio buttons: 16px circular diameter with a central 6px white dot when selected.

### Segmented Controls & Pivot Bars
- Track surface: `#202020` or `rgba(255, 255, 255, 0.04)`, 4px radius, 2px internal padding.
- Selected Tab Segment: Elevated `#2d2d2d` island, Elevation 2 shadow, with a rounded bottom accent bar (3px height, `#118dff`) on tab underline variants.

### Command Bar & Navigation Rail
- **Command Bar:** Anchored to page tops, height 44px, surface `#272727`, with `1px solid rgba(255, 255, 255, 0.08)` bottom boundary. Groups tools with vertical dividers `rgba(255, 255, 255, 0.08)`.
- **Nav Rail / Tree:** Vertical list item height 36px, `4px` radius, showing a 3x16px vertical accent bar indicator (`#118dff`) along the left edge when active.