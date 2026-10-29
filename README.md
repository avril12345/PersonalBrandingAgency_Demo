# LOUD

Demo workspace for **LOUD Personal Branding Ltd**, a London personal branding agency for C-suite and director-level executives.

> All clients, companies, staff and figures are **fictional** demo data.

## Run the CRM

```sh
npm start          # then open http://localhost:4321
```

Node 18+ is required. There are no dependencies to install. Changes you make in the app are saved to `data/*.json`.

**Optional, for live research:** copy `.env.example` to `.env` and add your `PERPLEXITY_API_KEY` and `FIRECRAWL_API_KEY`, then restart. Without keys, the seeded demo research briefs are still available.

## What's in it

| Area | What it does |
|---|---|
| **Dashboard** | MRR, outstanding invoices, audience and engagement KPIs, client health (LOUD Score), needs-attention list, upcoming meetings, founder approval banner |
| **Clients** | Roster and a client page with Overview, Meetings & research, Work log and Billing tabs |
| **Meetings** | Book meetings (clash checks, email invite, .ics download), record notes, takeaways and actions, email follow-ups, and run **Perplexity + Firecrawl** branding research from the notes |
| **Calendar / Mail** | Week calendars and demo mailboxes for Heloise and Lottie |
| **Content / Visibility** | Content board and calendar; speaking, podcast, media and award pipeline |
| **Results** | Growth since each client joined (followers, engagement, reach and more), plus a printable results report with the work delivered |
| **Invoices** | Drafts built from logged work → founder approval → send (sequential numbering, tax point) → payment, reminders, credit notes. Printable UK VAT invoices with a work-completed schedule |
| **Finance** | VAT returns (9 boxes, invoice or cash basis, pre-filing checks, mark filed), sales ledger, expenses, aged debtors, P&L and corporation tax estimate, compliance deadlines, CSV and Xero exports |

The workflows and the UK tax treatment are documented in **[docs/operating-model.md](docs/operating-model.md)**.

## Data

| Path | Contents |
|---|---|
| `data/company.json` | Company details, VAT settings, year end, service tiers (GBP), rate card, demo date |
| `data/clients.json` | 10 clients (4 in CPG): profiles, career, metrics, billing details |
| `data/team.json` | Heloise and Lottie, plus account-lead assignments |
| `data/metrics-history.json` | 24 months of monthly LinkedIn snapshots |
| `data/meetings.json`, `research.json` | Meetings with notes, takeaways and actions; research briefs |
| `data/worklog.json` | Every piece of work delivered, linked to invoices |
| `data/invoices.json`, `expenses.json`, `vat-returns.json` | Sales, purchases and filed VAT returns |
| `data/posts.json`, `visibility.json`, `activity.json` | Content calendar, visibility pipeline, client notes |
| `data/emails.json`, `events.json` | Demo mailboxes and internal calendar events |
| `profiles/`, `data/clients.csv` | Readable client profiles and a flat export |
| `brand/brand-guidelines.md` | LOUD red palette |

## Scripts

```sh
npm start          # run the CRM at http://localhost:4321
npm run seed       # regenerate ALL demo history (overwrites data files)
npm run profiles   # regenerate profiles/ and data/clients.csv
```

The demo is pinned to **28 Oct 2026** (`demo_today` in `data/company.json`). Set it to `null` to use the real date.
