# XGuard Design Artifacts

この directory は XGuard の現在の mobile-first design work を保持する。

## Current Direction（現在の方向性）

- Primary persona: discovery、trust、continuity を X に依存する night-work users。
- Primary device: phone。
- Desktop role: proof review、compliance queues、billing、API guardrails の companion surface。
- Visual tone: dark lounge、champagne gold、magenta neon、glossy black、discreet premium。
- Product stance: read-only backup、private proof by default、revocable proof pages、ban evasion に見える automation はしない。

## Files

| File | 目的 |
|---|---|
| `night-work-mobile-wireframes.md` | Product/design brief、screen list、safety constraints、Figma status |
| `night-work-mobile-wireframes.html` | Figma なしで review できる editable browser wireframe board |
| `figma-night-work-wireframe-import.js` | editable Figma frames 用の paste-ready Figma MCP `use_figma` script |

## Rendered Evidence

現在の rendered verification files は `docs/` の外にある。

| File | Viewport |
|---|---|
| `output/playwright/night-work-wireframes-full.png` | `1440x1900` desktop board check |
| `output/playwright/night-work-wireframes-mobile-page.png` | `390x1800` phone-width review check |

`output/playwright/night-work-wireframes.png` は older intermediate render であり、canonical design evidence として使わない。

## Figma Status

Draft file:

https://www.figma.com/design/UK9jDUA7VnwLW2zU3g72CU

draft file は存在するが、現在は Figma MCP Starter plan call limit により canvas writes が block されている。quota reset 後に `figma-night-work-wireframe-import.js` を `use_figma` で実行し、生成される 6 frames を確認する。

1. Landing / Risk Snapshot
2. Connect X / Permission Reassurance
3. Backup Dashboard
4. 証明ページ作成
5. Settings / Discreet Controls
6. Desktop Companion / Operations Review
