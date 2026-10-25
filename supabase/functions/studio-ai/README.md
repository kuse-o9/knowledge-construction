# Studio AI color correction

Authenticated Supabase Edge Function. Set server-only `OPENAI_API_KEY` and `STUDIO_AI_MODEL` to a vision-capable Responses API model supporting structured output. No browser key. Existing Supabase runtime keys are supplied by the platform. Every request is authenticated with auth.getUser. The legacy-secret-only gateway is incompatible with ES256 user tokens; migrating that gateway configuration requires an explicit action-time confirmation in the browser. Never remove the handler token check.

Up to3 640px JPEG representative frames, explicit consent, no app storage or body logging. `store:false` is used; this does not by itself promise zero retention at the AI provider. Requires the deployed editor-access.sql migration. Quota reservations happen before the external call, are atomic by actor/day, and failures release the reservation. Successful processing consumes one use even if the visitor closes the tab before applying the suggestion.

This performs model-guided exposure/contrast/saturation correction. It does not perform neural denoising, upscaling, voice restoration or frame interpolation.

Selected model: `gpt-6-luna`. For this short structured correction request, set reasoning effort to `none` explicitly, retain the600-token output cap and45-second timeout. Other model identifiers do not receive this model-specific parameter. Official documentation: https://developers.openai.com/api/docs/models/gpt-6-luna

The authenticated `action:status` route checks only whether required configuration values are present. It returns the non-secret model name and `providerTested:false`; it never invokes OpenAI or consumes correction quota. This is not a validation of API credit, model permissions, or key validity.

2026-10-26: With explicit user action-time consent, the studio-ai legacy-secret JWT gateway was switched OFF and its persisted state rechecked. Keep auth.getUser inside the function. Redeploy studio-ai with `supabase functions deploy studio-ai --no-verify-jwt` to retain this approved gateway configuration; do not apply that flag to unrelated functions. Anonymous and invalid-bearer status calls both return401 from the handler. No OpenAI inference was called.

The editor has a manual configuration-check button sending only `{action:"status"}`. It neither transmits image frames nor consumes correction quota, and explicitly does not claim key validity, credit availability, or a successful AI-provider call.
