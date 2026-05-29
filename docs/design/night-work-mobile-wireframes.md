# XGuard Night-Work Persona Mobile Wireframes

作成日: 2026-05-27
Figma draft: https://www.figma.com/design/UK9jDUA7VnwLW2zU3g72CU

## Goal

customer discovery、reputation、proof of identity、account trouble 後の continuity を X に依存する night-work users 向けに、mobile-first の XGuard experience を設計する。

## Persona Assumption

- shifts の合間、after work、移動中に phone から X を使うことが多い。
- sudden account restriction、impersonation、deletion pressure、reputation loss の perceived risk が高い。
- product には corporate や developer-heavy ではなく、premium で discreet な印象が必要。
- 「明日アカウントが消えたら、どんな証明と再起動ルートが残るのか？」にすぐ答えたい。

## Visual Direction

- Primary mood: dark lounge、champagne gold、magenta neon、glossy black。
- Product posture: protective、private、prepared。
- Avoid: ban-evasion language、automated outreach promises、raw X-data exposure、過度に technical な onboarding。
- CTA language は backup、proof、revoke、restart preparation を強調する。

## Mobile Screen Set

1. **Landing / Risk Snapshot**
   - "消える前に、証明を残す。" を先頭に置く。
   - account backup readiness、last sync、proof-page privacy state を表示する。
   - Primary CTA: "Xを安全に接続"。

2. **Connect X / Permission Reassurance**
   - action 前に read-only OAuth を説明する。
   - allowed scopes として profile、recent posts、offline refresh を見せる。
   - posting なし、DM なし、follow/unfollow なしを明記する。

3. **Backup Dashboard**
   - account health、saved profile、saved posts、proof readiness を表示する。
   - "今すぐバックアップ" に親指 1 本で届くようにする。
   - API/cost guardrails を控えめな trust marker として表示する。

4. **証明ページ作成**
   - Default proof visibility は private。
   - redactions を review した後だけ、user が public/unlisted を選べるようにする。
   - revoke と deletion controls を first-class actions として含める。

5. **Desktop Companion**
   - desktop は primary experience ではなく operations/review surface として扱う。
   - proof preview、compliance queue、billing status には wider layout を使う。

## Product Safety Notes

- v0 は read-only のままにする: `tweet.read`、`users.read`、`offline.access`。
- service を ban evasion として frame しない。
- Public proof pages は raw X API payloads ではなく redacted DTOs を使う。
- proof pages は default private かつ revocable に保つ。

## Figma Status

Figma file は作成済みだが、nodes を書き込む前に canvas editing が Figma MCP Starter plan limit に達した。2026-05-27 の 2 回目の direct-canvas write attempt も同じ limit に当たった。

現在の editable artifact:

- `docs/design/night-work-mobile-wireframes.html`
- `docs/design/figma-night-work-wireframe-import.js`

Rendered verification:

- `output/playwright/night-work-wireframes-full.png`
- `output/playwright/night-work-wireframes-mobile-page.png`
- Google Chrome headless で `1440x1900` と `390x1800` を render した。
- verified screens: 5 つの mobile-first phone frames と 1 つの desktop companion frame。
- desktop board だけでなく phone-width canvas でも review page が使えることを mobile viewport で確認した。

quota が利用可能になった後の次の Figma step:

1. draft Figma file を開く。
2. `docs/design/figma-night-work-wireframe-import.js` を `use_figma` 経由で実行する。
3. Landing、Connect X、Backup、Proof、Settings、Desktop companion の 6 frames が作成されることを確認する。
4. mobile frames を primary に保ち、desktop frame は lower-priority companion surface として配置する。
5. safety copy を維持する: read-only、no DM/post/follow automation、private proof by default、revocable proof pages。

## Figma Import Notes

import script は screenshot placement ではなく、意図的に editable Figma primitives を使う。

- Text は copy iteration 用に editable のままにする。
- Phone frames は hero、cards、CTAs、nav 用に separate layer groups を使う。
- visual system は reusable color constants として encoded する: lounge black、champagne gold、magenta neon、muted lavender、translucent line fills。
- desktop companion は phone set の下に置く lower-priority frame であり、mobile-first product direction に合わせる。
