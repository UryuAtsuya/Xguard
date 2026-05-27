# XGuard Night-Work Persona Mobile Wireframes

Created: 2026-05-27
Figma draft: https://www.figma.com/design/UK9jDUA7VnwLW2zU3g72CU

## Goal

Design a mobile-first XGuard experience for night-work users who rely on X for customer discovery, reputation, proof of identity, and continuity after account trouble.

## Persona Assumption

- Uses X mainly from a phone between shifts, after work, or while moving.
- Higher perceived risk of sudden account restriction, impersonation, deletion pressure, and reputation loss.
- Needs the product to feel premium and discreet, not corporate or developer-heavy.
- Wants a quick answer to: "If my account is gone tomorrow, what proof and restart path do I still have?"

## Visual Direction

- Primary mood: dark lounge, champagne gold, magenta neon, glossy black.
- Product posture: protective, private, prepared.
- Avoid: ban-evasion language, automated outreach promises, raw X-data exposure, overly technical onboarding.
- CTA language should emphasize backup, proof, revoke, and restart preparation.

## Mobile Screen Set

1. **Landing / Risk Snapshot**
   - Lead with "消える前に、証明を残す。"
   - Show account backup readiness, last sync, and proof-page privacy state.
   - Primary CTA: "Xを安全に接続"

2. **Connect X / Permission Reassurance**
   - Explain read-only OAuth before the action.
   - Surface allowed scopes: profile, recent posts, offline refresh.
   - Explicitly state no posting, no DM, no follow/unfollow.

3. **Backup Dashboard**
   - Show account health, saved profile, saved posts, proof readiness.
   - Make "今すぐバックアップ" reachable with one thumb.
   - Display API/cost guardrails as a quiet trust marker.

4. **Proof Page Builder**
   - Default proof visibility: private.
   - Let the user choose public/unlisted only after reviewing redactions.
   - Include revoke and deletion controls as first-class actions.

5. **Desktop Companion**
   - Treat desktop as an operations/review surface, not the primary experience.
   - Use wider layout for proof preview, compliance queue, and billing status.

## Product Safety Notes

- v0 remains read-only: `tweet.read`, `users.read`, `offline.access`.
- Do not frame the service as ban evasion.
- Public proof pages must use redacted DTOs, not raw X API payloads.
- Keep proof pages private by default and revocable.

## Figma Status

The Figma file was created, but canvas editing hit the Figma MCP Starter plan limit before nodes could be written. A second direct-canvas write attempt on 2026-05-27 hit the same limit.

Current editable artifact:

- `docs/design/night-work-mobile-wireframes.html`
- `docs/design/figma-night-work-wireframe-import.js`

Rendered verification:

- `output/playwright/night-work-wireframes-full.png`
- `output/playwright/night-work-wireframes-mobile-page.png`
- Rendered with Google Chrome headless at `1440x1900` and `390x1800`.
- Verified screens: five mobile-first phone frames plus one desktop companion frame.
- Mobile viewport was checked to keep the review page usable on a phone-width canvas, not just on a desktop board.

Next Figma step after quota is available:

1. Open the draft Figma file.
2. Run `docs/design/figma-night-work-wireframe-import.js` through `use_figma`.
3. Confirm it creates six frames: Landing, Connect X, Backup, Proof, Settings, Desktop companion.
4. Keep mobile frames primary and position the desktop frame as a lower-priority companion surface.
5. Preserve the safety copy: read-only, no DM/post/follow automation, private proof by default, revocable proof pages.

## Figma Import Notes

The import script deliberately uses editable Figma primitives instead of screenshot placement:

- Text remains editable for copy iteration.
- Phone frames use separate layer groups for hero, cards, CTAs, and nav.
- The visual system is encoded as reusable color constants: lounge black, champagne gold, magenta neon, muted lavender, and translucent line fills.
- The desktop companion is one lower-priority frame below the phone set, matching the mobile-first product direction.
