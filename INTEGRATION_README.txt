Georgia Top Floors — Compliance Center incremental update

Upload/replace ONLY these files in the existing GitHub Pages repository:
- index.html
- database.html
- documents.html
- theme.css
- compliance.html (NEW)
- compliance.js (NEW)

Do not replace customer.html, crew.html, project-docs.js or logo assets.

Architecture decision:
- Database = people/company profiles, contact info, skills, relationships.
- Compliance Center = insurance, W-9, I-9, licenses, contracts, certifications, expiration/review monitoring.
- Customer Agreement / Consent = source of truth belongs to the individual Job because it is project-specific. Compliance Center monitors missing/signed status across jobs.
