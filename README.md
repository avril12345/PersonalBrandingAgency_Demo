# LOUD

Demo workspace for **LOUD**, a personal branding agency for C-suite and director-level executives.

> All clients, companies and metrics in this repo are **fictional**, created for demo purposes.

## Contents

| Path | What it is |
|---|---|
| `data/clients.json` | Client database (source of truth): profiles, career history, branding metrics, engagement details |
| `data/clients.csv` | Flat export of the database, for spreadsheets/CRM import |
| `profiles/` | One readable profile per client, plus a roster (`profiles/README.md`) |
| `brand/brand-guidelines.md` | LOUD red color palette and usage rules |
| `scripts/build-profiles.js` | Regenerates the CSV and profiles from the JSON |

## Updating client data

Edit `data/clients.json`, then run:

```sh
node scripts/build-profiles.js
```
