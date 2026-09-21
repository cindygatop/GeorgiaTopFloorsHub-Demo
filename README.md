# Georgia Top Floors Hub — Presentation Demo v3

This static presentation prototype now demonstrates four views:

1. **Office / Admin** — `index.html`
2. **People & Company Database** — `database.html`
3. **Crew / Employee** — `crew.html`
4. **Customer Portal** — `customer.html`

## Database demo includes

- Contacts / Customers
- Contact classification:
  - Past Customer
  - Current Customer
  - Lead
  - Estimate Not Closed
  - Builder
  - Contractor
  - Partner
- Last service / last contact / lead source / status / notes
- DO NOT CONTACT / Opted Out flag
- Suggested segmented follow-up examples
- Employee profiles and system access role examples
- Subcontractor profiles
- Skills, availability, jobs and internal notes
- W-9 / COI / Workers' Comp / Subcontract Agreement examples
- Expiring Soon / Expired document alerts
- Vendors & Partners
- Project Digital Folder categories
- Search and category filters
- Add Demo Contact using browser localStorage

## Publishing on GitHub Pages

Upload all files to the root of the existing public repository:

`cindygatop/GeorgiaTopFloorsHub-Demo`

Expected pages:

- Office: `https://cindygatop.github.io/GeorgiaTopFloorsHub-Demo/`
- Database: `https://cindygatop.github.io/GeorgiaTopFloorsHub-Demo/database.html`
- Crew: `https://cindygatop.github.io/GeorgiaTopFloorsHub-Demo/crew.html`
- Customer: `https://cindygatop.github.io/GeorgiaTopFloorsHub-Demo/customer.html`

## Production architecture

The production system should use one secure backend/database with role-based access:
- Admin / Office
- Manager
- Crew
- Customer

The static GitHub Pages demo has no real authentication and therefore must contain sample/fictional data only.
