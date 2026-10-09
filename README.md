# Georgia Top Floors Hub — v5 (interactive prototype)

**Open `login.html`.** This is a static demo. No real authentication, shared database, Google Calendar write, Quo SMS, payment processing or enforceable e-signature service is connected.

## Demo profiles (all use password `gtf2026`)

| Role | Name | Demo e-mail |
|---|---|---|
| Office | Caritas | `caritas@gtf.demo` |
| Office | Cristiano | `cristiano@gtf.demo` |
| Office | Alicia | `alicia@gtf.demo` |
| Office | Cindy | `cindy@gtf.demo` |
| Crew | Carlos | `carlos@gtf.demo` |
| Client | Emily Carter | `emily@gtf.demo` |

Click any profile on the login page to skip typing credentials. Role-based routing is a **demo** feature, not secure backend authorization. All Office profiles see the same sample business data on the same browser, but have separate adaptive shortcuts.

## Updated flows

- Office has a clean ChatGPT-style Assistant home, date-aware greeting, 3 small priority indicators and per-user shortcuts.
- Assistant matches names with minor typos, asks which property if ambiguous, proposes a reschedule, confirms, saves the local job and related Work Order, queues (but does NOT send) SMS/Calendar sync, and offers a customer message draft.
- `calendar.html` offers manually prefilled **NEW event** drafts in Google Calendar. These do not update an existing event.
- COI displayed once **per company/subcontractor**, with General Liability and Workers' Compensation as nested coverage records. W-9 tracked for internal review, not treated as automatic federal expiration.
- Crew now has wide desktop layouts as well as narrow mobile layouts; Client is responsive too.
- Client portal retains Google Review feedback, Before Your Job, placeholder Agreement → demo signature → warranty unlock.
- Estimate, Work Order, Invoice are linked by `projectId` when creating new projects.

## Paths

`index.html` Office · `compliance.html` Compliance · `documents.html` billing · `database.html` contacts · `crew.html` crew · `customer.html` client · `calendar.html` integration information.

## Production preparation

Read `DEPLOYMENT_AND_ARCHITECTURE.md`, `GOOGLE_CALENDAR_IMPLEMENTATION.md`, `supabase-schema.sql` and `google-calendar-service.example.mjs`. A future production site must use secure server authentication, role checks and isolated database records for each company. **Never put real client or company data, passwords, payment details or API tokens in this demo repository.**

## Validação e histórico

Leia `docs/HISTORY_REVIEW.md`, `docs/VALIDATION_V5.md` e `docs/QA_ACCEPTANCE.md`. O schema Supabase é uma proposta não aplicada; possui pendências de isolamento e permissões para resolver antes de produção.

Checks reproduzíveis, na raiz do repositório:

```sh
node --test tests/*.test.js
python3 tests/validate_static.py
```

Os smoke tests de navegador usam Python + Playwright e Chromium. Inicie `python3 -m http.server 8000` e execute:

```sh
python3 tests/assistant_workflow_smoke.py
python3 tests/office_compliance_smoke.py
python3 tests/portals_smoke.py
```

Não acessam APIs de produção nem enviam mensagens. Resultados e limites em `docs/VALIDATION_V5.md`.
