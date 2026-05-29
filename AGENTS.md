# AGENTS.md

## Goal

Ship XGuard coding work quickly, safely, and with GitHub sync completed.

## Repository

- Local path: `/Users/uryuatsuya/XGuard/xguard`
- GitHub repository: `UryuAtsuya/Xguard`
- Expected `origin`: `https://github.com/UryuAtsuya/Xguard.git`

## Working Rules

- Prefer `rg` for file and text search.
- Prefer `apply_patch` for small manual edits.
- Do not revert unrelated user changes.
- Do not run destructive commands such as `rm`, `git reset --hard`, or checkout-based rollback unless explicitly requested.
- Keep implementation code outside the MyLife Vault. MyLife remains the planning and operations source of truth.

## XGuard Scope Rules

- v0 is read-only backup and proof-page generation.
- Do not implement automatic DM, automatic follow/unfollow, automated posting, ban evasion, or policy-avoidance behavior.
- Keep raw X API payloads internal. Public proof pages must use a redacted DTO.
- Token material must stay behind backend/service-repository boundaries and must not be exposed to frontend code.

## Documentation Rules

- Write documents under `docs/` in Japanese by default.
- Keep code identifiers, file paths, command names, repository names, API names, and required product terms in their original spelling.
- Use another language only when the user explicitly requests it or an external specification requires exact wording.

## Verification Rules

- Run the smallest meaningful verification after code changes.
- Prefer `npm run check` for backend/shared changes when dependencies are installed.
- Run `git diff --check` before committing.
- If a verification step cannot run, record it in the final report.

## Push Rule

- When meaningful coding work is completed and verification passes, commit and push to `origin/main`.
- If `origin` is missing, set it to `https://github.com/UryuAtsuya/Xguard.git`.
- Do not leave completed coding work only local unless the user explicitly says not to push or the push is blocked.
- Report the XGuard commit hash and whether it was pushed.
- Keep MyLife documentation commits separate from XGuard implementation commits.
