# Georgia Top Floors Hub — Google Calendar integration blueprint (v5)

## Current state: local demo, not connected

The Office Assistant can parse Portuguese/English appointment requests, tolerate minor client-name typos, request disambiguation for matches, show the full customer/property, ask for confirmation, then save the job to this browser. It updates related local Work Order records through `projectId` and creates **setup-required** notifications for Calendar and Crew SMS. Afterward, it offers to draft an English customer message. A separate `calendar.html` opens a **NEW EVENT DRAFT** in Google Calendar as a manual fallback. This does **not** edit an existing Google event and does **not** establish two-way synchronization.

This version contains *no real Google sign-in*, token exchange, event update or Google webhook: these cannot be safely activated from GitHub Pages/localStorage without a secured server and credentials. The Node `google-calendar-service.example.mjs` module supplies isolated server-side REST operations for future integration; it is not executed in this static demo.

## Production Google setup (for the team to approve)

1. Choose a managed Google Workspace account or a business-owned calendar for Georgia Top Floors. Identify which calendar(s) can be edited and which staff calendars should be read-only/opt-in. Do not synchronize private calendars indiscriminately.
2. Create a Google Cloud project for the Hub, enable Google Calendar API, configure OAuth consent/authorized domains, and register the backend callback. During testing, add verified test users. Production launch may require OAuth verification depending on scopes and audience.
3. In Vercel backend endpoints, implement authorization code + PKCE / OAuth with offline access, securely store encrypted refresh credentials **per organization + Google connection**, refresh access tokens server-side. Use minimum necessary scopes.
4. Record `organization_id`, `project_id`, `appointment_id`, `calendar_id`, `google_event_id`, `etag`, `last_synced_at`, `sync_status` for every mapped event. **Never match existing events by customer name alone.** Maintain `appointment_revisions`, `sync_outbox`, and an audit log.
5. Hub → Google: user asks assistant to move an appointment; search tenant-scoped client/project records; disambiguate if needed; show original/new times; validate crew availability and timezone; get user confirmation; write internal DB transaction; enqueue outbox; worker PATCHes correct `google_event_id` using last known `etag`; retry on rate limits/5xx with jitter, flag 412 conflicts for a human. Only announce “Google updated” after confirmed API success.
6. Google → Hub: initially list events and store `nextSyncToken`; register `events.watch` to receive change notifications on an HTTPS webhook; validate channel ID/token/resource; webhook queues incremental `events.list(syncToken)`; renew watch channels before expiration; treat HTTP 410 as token invalidation requiring a new full sync. Fetch event changes, match using stored Google event ID or verified private `extendedProperties`; apply conflict rules, never overwrite a field staff changed more recently without review. Do not loop infinitely: write fingerprints/revision IDs.
7. Use `America/New_York` for Georgia appointments, respecting daylight-saving transitions, and ISO datetimes that include timezone offsets. Model a multi-day job as one Project with per-day appointments and assignments; do not store only human-readable labels “Today” or “Fri.”
8. Include separate outbound communication permissions: Crew SMS through Quo with opt-in/role checks, customer messages as previews needing staff approval; store send ID and delivery state to avoid duplicates.
9. Security: organization-scoped RLS, server-side role enforcement for every API action, signed webhook verification, audit trails, encryption and token rotation, least-privilege scopes, legal/privacy review and backups. Crew should never be able to query invoice prices.
10. Test: duplicate customer names, repeated jobs at different addresses, conflicting Google edits, 401 token refresh, 403 permissions, 404 deleted events, 409/412 version mismatches, 410 sync token expiration, 429 quotas, cancelled jobs, daylight saving, webhook redelivery, retry safety and access revocation.

## Suggested internal API contract (not yet implemented)

- `POST /api/calendar/connect` starts Google OAuth flow (office admin only).
- `GET /api/calendar/callback` exchanges code securely and stores credentials.
- `POST /api/assistant/plan` returns `{intent, candidates, proposed_change, requires_confirmation}` (no state changes).
- `POST /api/appointments/:id/reschedule` accepts `{revision, newStartAt, newEndAt, confirmationToken}` (backend checks organization and membership, creates audit/outbox transaction).
- `GET /api/integrations/google/status` returns connection status but NEVER secrets.
- `POST /api/integrations/google/webhook` validates notification headers and queues a sync.
- `GET /api/integrations/outbox` shows pending/sent/failed states with retry reason.
- `POST /api/messages/drafts` saves reviewed templates. Sending uses a separate explicit action.

## AI later, without risking wrong customer edits

The current version deliberately uses deterministic text matching and a finite command handler, not a live model. For richer language, add an LLM behind an authenticated backend that returns typed actions (e.g. `{type:'RESCHEDULE', customerHint, dateHint, timeHint}`) validated against organization-scoped database records. The LLM must **never call Calendar writes directly**. Enforce candidate selection, confidence thresholds, precise confirmation, permission checks, and idempotent server-side action execution. Log who approved every action. When ambiguous, always ask the human; do not guess.

## References
- Google Calendar push: https://developers.google.com/workspace/calendar/api/guides/push
- Incremental sync: https://developers.google.com/workspace/calendar/api/guides/sync
- Quotas: https://developers.google.com/workspace/calendar/api/guides/quota
- OAuth: https://developers.google.com/identity/protocols/oauth2/web-server
