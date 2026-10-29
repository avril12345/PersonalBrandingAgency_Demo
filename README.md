# LOUD

Demo workspace for **LOUD**, a personal branding agency for C-suite and director-level executives.

> All clients, companies, staff and metrics in this repo are **fictional**, created for demo purposes.

## LOUD CRM

Open `crm/index.html` in a browser (double-click it — no server or install needed).

| Module | What it does |
|---|---|
| **Dashboard** | MRR, audience and engagement KPIs; sortable client-health table with LOUD Score; needs-attention alerts (renewals, at-risk clients, posting below plan, posts stuck in client review); content due this week; team workload; revenue by tier |
| **Clients / Client 360** | Filterable client roster; per-client page with follower and engagement trends, LOUD Score breakdown, contract and renewal details, full profile, content pipeline, visibility opportunities, and an activity log you can add notes to |
| **Content** | Board (Idea → Drafted → Client review → Approved → Published) and month-calendar views; create and edit posts, filter by client or owner |
| **Performance** | Any metric over time for any client; May baseline vs. current for every client; follower-growth ranking; top posts by engagement |
| **Visibility** | Speaking, podcast, media and award pipeline with status tracking, win rate, and filters |

Changes made in the app (posts, opportunities, notes) are saved in your browser's local storage. Use **⋯ → Export data** to download them as JSON, or **⋯ → Reset demo data** to start fresh. The demo is pinned to **Oct 28, 2026** so the calendar statuses stay consistent.

**LOUD Score (0–100)** = Reach (25, log-scaled followers) + Engagement (25) + Momentum (25, 6-month follower growth) + Consistency (15, posts vs. tier plan) + Visibility (10, speaking/podcasts/media). Health: On track ≥ 60, Watch 45–59, At risk < 45; onboarding clients are not scored for health.

## Data

| Path | What it is |
|---|---|
| `data/clients.json` | Client database (source of truth): profiles, career history, branding metrics, engagement tier |
| `data/team.json` | LOUD staff (2) and account-lead assignments |
| `data/metrics-history.json` | Monthly LinkedIn snapshots, May–Oct 2026 |
| `data/content-calendar.json` | Posts for Oct–Nov 2026 with status and results |
| `data/visibility.json` | Speaking / podcast / media / award opportunities |
| `data/activity.json` | Meetings, calls, emails and notes per client |
| `data/clients.csv` | Flat export of the client database |
| `profiles/` | One readable profile per client, plus a roster (`profiles/README.md`) |
| `brand/brand-guidelines.md` | LOUD red color palette and usage rules |

## Scripts

```sh
npm run seed       # regenerate demo history (metrics, content, visibility, activity)
npm run profiles   # regenerate data/clients.csv and profiles/
npm run build      # bundle data/*.json into crm/data.js for the app
npm run all        # all of the above
```

Edit `data/clients.json` (or any data file) and run `npm run build` to see it in the CRM. Note that `npm run seed` overwrites the history files.
