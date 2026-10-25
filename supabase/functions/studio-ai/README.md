# Studio AI color correction

Authenticated Supabase Edge Function. Set server-only `OPENAI_API_KEY` and `STUDIO_AI_MODEL` to a vision-capable Responses API model supporting structured output. No browser key. Existing Supabase runtime keys are supplied by the platform. Deploy with normal JWT authentication; the handler also validates the token with auth.getUser.

Up to3 640px JPEG representative frames, explicit consent, no app storage or body logging. `store:false` is used; this does not by itself promise zero retention at the AI provider. Requires the deployed editor-access.sql migration. Quota reservations happen before the external call, are atomic by actor/day, and failures release the reservation. Successful processing consumes one use even if the visitor closes the tab before applying the suggestion.

This performs model-guided exposure/contrast/saturation correction. It does not perform neural denoising, upscaling, voice restoration or frame interpolation.
