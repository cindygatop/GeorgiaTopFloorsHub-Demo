# Georgia Top Floors Hub — Demo v4 / SaaS-ready prototype

This repository is still a **static presentation prototype**, but it now demonstrates the intended product architecture for a future multi-tenant web app.

## Start here

Open `login.html`.

### Demo credentials

- Office: `office@georgiatopfloors.com` / `gtf2026`
- Office: `ops@georgiatopfloors.com` / `gtf2026`
- Crew: `carlos@georgiatopfloors.com` / `gtf2026`
- Client: `emily@example.com` / `gtf2026`

## Views

- Office / Admin: `index.html`
- Database: `database.html`
- Compliance: `compliance.html`
- Estimates & Billing: `documents.html`
- Crew: `crew.html`
- Client Portal: `customer.html`

## New in this update

- role-based demo login and redirects;
- Office Smart Shortcuts by user behavior;
- subtle urgency indicators;
- project linkage across Estimate → Work Order → Invoice;
- crew assignment and appointment notification queue;
- Google Calendar sync queue / integration state;
- Quo integration state and notification hooks;
- Client Agreement → signature → Warranty unlock flow;
- Before Your Job section;
- Google Review feedback button;
- Compliance document-type filter;
- grouped COI view with General Liability / Workers Compensation inside;
- W-9 annual internal review workflow;
- more real working demo buttons: Maps, copy follow-up message, Work Order acknowledgment, Report Problem.

## Important security limitation

Authentication and data in this version are simulated with browser `localStorage`. This is **not production security**. Keep this repository free of real customer data and secrets.

For the production plan, costs, integrations and multi-tenant design, read:

- `DEPLOYMENT_AND_ARCHITECTURE.md`
- `supabase-schema.sql`
- `UPLOAD_THESE_FILES.txt`
