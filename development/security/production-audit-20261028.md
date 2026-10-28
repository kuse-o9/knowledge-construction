# Study Note production security follow-up — 2026-10-28 JST

Scope: only Supabase project zlefzpbrbvniijmohpao (verified project name: study note) and its Study Note source repository. No third-party projects accessed.

## Fixed and deployed

1. Legacy game administration RPCs relied on membership alone. A controlled transaction reproduced game_admin_is_admin() returning true for an administrator without a dedicated-password receipt. It now requires the existing adminVerified and allowed checks plus a live matching Auth session. The callers game_admin_list_players and game_admin_add_resource inherit this gate.
2. Dedicated-password receipts could remain accepted after the corresponding Auth session disappeared. Reproduced using a temporary receipt with a nonexistent session, then rolled back. security_status now requires a live matching auth.sessions row and checks not_after. Existing password revision and 20-minute receipt checks remain.
3. Removed all anonymous privileges on game_saves and removed authenticated TRUNCATE, REFERENCES and TRIGGER privileges. Existing per-user SELECT/INSERT/UPDATE RLS remains; no saves were deleted or rewritten.

Production migrations:
- 20261028035527_harden_legacy_game_admin_and_save_privileges
- 20261028035652_require_live_session_for_admin_password_receipts

## Production recheck

Executed production-recheck.sql against the actual PostgreSQL database, using transaction-local JWT claims and roles. The positive and negative assertions passed. Temporary Auth session and password-receipt fixtures were fully rolled back. This is a database authorization test, not an end-to-end browser login or a forged signed JWT.

Verified: missing receipt rejected; valid verified owner accepted; wrong session rejected; legacy player-list and resource-write RPCs reject an unverified session; expired receipt, stale password revision, expired Auth session and missing Auth session rejected; anonymous save access revoked; authenticated cross-account save reads and updates affect no rows; service-only RPCs remain inaccessible to client roles; both media buckets remain private; RLS remains enabled. No paid AI was invoked.

## Findings requiring correct interpretation

The advisor still reports intentionally exposed SECURITY DEFINER public status/catalog functions and authenticated RPCs. Presence of a warning alone is not proof of unauthorized access. Private tables with RLS and no client policies deliberately default-deny; do not add permissive policies to silence them.

Leaked-password protection remains disabled. Supabase documentation says this feature requires Pro or above. No plan upgrade, purchase, or new external credential was made.

All games are currently published (non-public game count: 0). This corrects the earlier assumption that an unpublished game was currently exposed. GitHub Pages and the public source repository are public distribution, not source confidentiality. UI publication controls cannot retract files already published, cached or copied. If future requirements demand that unpublished assets themselves be inaccessible, private asset hosting and server-side delivery are a separate architectural change; it is not implemented or claimed complete here.

Current production manual maintenance flag was false when checked; this audit did not change it. Existing customer data and publication settings were preserved.

## Limits

No blanket claim that the app has no vulnerabilities. Browser-authenticated end-to-end testing with separate real customer accounts, exhaustive review of all legacy functions, and private asset migration were not completed. Physical GPU, audio listening and device testing are unrelated to this security check and were not performed.
