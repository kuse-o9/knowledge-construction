# Removed AI correction endpoint

2026-10-26: The user explicitly removed AI correction to avoid API charges.

The deployed `studio-ai` endpoint is a fail-closed compatibility stub: every non-OPTIONS request returns410 with `disabled:true` and `configured:false`; OPTIONS returns204 for old clients. It imports no provider or Supabase SDK, reads no environment secrets or request images, and makes no outgoing requests. This stops even old cached editor pages from initiating new inference through this endpoint. The UI, consent form, usage requests and admin approval entry have been removed.

Do not restore provider calls without a new explicit user request. Existing project files, manual brightness/contrast/saturation controls and normal video editing are retained. Existing private database records and secret credentials are not deleted by this change. No claims are made about historical billing or unrelated uses of a credential outside this application.

Tests: the actual TypeScript handler is exercised for old correction/status requests, authenticated-looking and anonymous callers, GET/DELETE and preflight. All inference paths are disabled, with zero secret reads and zero outbound calls in the test harness. Production status/correct requests both return410.
