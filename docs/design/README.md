# XGuard Design Artifacts

This directory holds the current mobile-first design work for XGuard.

## Current Direction

- Primary persona: night-work users who rely on X for discovery, trust, and continuity.
- Primary device: phone.
- Desktop role: companion surface for proof review, compliance queues, billing, and API guardrails.
- Visual tone: dark lounge, champagne gold, magenta neon, glossy black, discreet premium.
- Product stance: read-only backup, private proof by default, revocable proof pages, no automation that could look like ban evasion.

## Files

| File | Purpose |
|---|---|
| `night-work-mobile-wireframes.md` | Product/design brief, screen list, safety constraints, Figma status |
| `night-work-mobile-wireframes.html` | Editable browser wireframe board for review without Figma |
| `figma-night-work-wireframe-import.js` | Paste-ready Figma MCP `use_figma` script for editable Figma frames |

## Rendered Evidence

The current rendered verification files are outside `docs/`:

| File | Viewport |
|---|---|
| `output/playwright/night-work-wireframes-full.png` | `1440x1900` desktop board check |
| `output/playwright/night-work-wireframes-mobile-page.png` | `390x1800` phone-width review check |

`output/playwright/night-work-wireframes.png` is an older intermediate render and should not be used as the canonical design evidence.

## Figma Status

Draft file:

https://www.figma.com/design/UK9jDUA7VnwLW2zU3g72CU

The draft file exists, but the Figma MCP Starter plan call limit is currently blocking canvas writes. Once the quota resets, run `figma-night-work-wireframe-import.js` with `use_figma` and then verify the six generated frames:

1. Landing / Risk Snapshot
2. Connect X / Permission Reassurance
3. Backup Dashboard
4. Proof Page Builder
5. Settings / Discreet Controls
6. Desktop Companion / Operations Review
