# OppDesk

Opportunity Desk snapshots for scholarships, fellowships, grants, and more.

## Export rules (permanent)

- **Only** include official **`application_url`** (apply / register / admissions page).
- **Never** include Opportunity Desk article URLs (`opportunitydesk.org/...` post pages) as the link column.
- Do not add `opportunitydesk_url` (or similar) unless the user explicitly asks.

## CSV columns

`id, title, application_url, date, excerpt, img, categories, tags, section, slug`

## Refresh

```bash
python3 build_snapshot.py
```
