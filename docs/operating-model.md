# LOUD operating model

How work moves through the LOUD CRM, from first meeting to paid invoice and filed VAT return.
All people, companies and figures in this repo are fictional demo data.

## Roles

| Person | Role | In the CRM |
|---|---|---|
| Avril Walters | Founder & MD | Approves every invoice before it is sent; files VAT returns; owns Finance |
| Heloise Archer | Account Director & Brand Strategist | Leads 5 clients; books meetings; runs research; prepares invoices |
| Lottie Gallagher | Content & PR Lead | Leads 5 clients; content calendar; media pitching; results reports |

Switch who you are acting as with the **persona selector** in the top bar. Only the founder persona can approve invoices, issue credit notes and mark VAT returns as filed.

## 1. Meetings → notes → research

1. **Book** (Meetings, Calendar, or a client page → *Book meeting*). Choose client, type, time, attendees and location. The CRM checks for calendar clashes, adds the meeting to Heloise's and/or Lottie's calendar and emails the invite from the organiser's mailbox. Use *Download invite (.ics)* to add it to a real calendar.
2. **Record** on the meeting page: notes, key takeaways (one per line) and actions (owner and due date). *Save & mark completed* logs the meeting time to the client's work log, so it appears on the next invoice.
3. **Follow up**: *Email follow-up to client* sends the takeaways and actions from the organiser's mailbox.
4. **Research**: *Run research* sends the client profile and the meeting notes to:
   - **Claude** (`claude-opus-5-5` by default, with Anthropic's web search tool), which searches the live web and writes the brief: Summary, Market fit, Engagement strategy, Competitive landscape, Recommendations, with cited sources.
   - **Firecrawl**, which first scrapes the client's company website (plus any extra URLs you add, such as a personal site or speaker page). Claude then compares that public messaging with the client's content pillars in the *Brand alignment* section.

   Briefs are saved to the client (*Meetings & research* tab) and can be printed. The 10 seeded briefs are marked **Demo**. Live ones are marked **Live** and list their sources.

**Setup:** copy `.env.example` to `.env`, add `ANTHROPIC_API_KEY` (and `FIRECRAWL_API_KEY` for website scraping), and restart `npm start`. Keys are read only by the local server and never reach the browser. `.env` is git-ignored.

## 2. Work log and results

Everything delivered for a client is a **work item**: date, category, description, who did it, hours, and whether it is covered by the retainer or billed as **Additional** (with an amount from the rate card).

Work items are created automatically when:
- a post is moved to *Published*
- a visibility opportunity is marked *Completed*
- a meeting is completed
- a research brief is run

You can also add them by hand with *Log work* on the client's Work log tab.

The **Results** page compares every client with the month they joined LOUD. It covers followers, engagement rate, monthly reach (impressions), profile views, impressions per post and SSI. Each client has a printable **results report** with a "Joined LOUD" marker on the chart, the work delivered by category, and the placements secured. Use it for monthly reviews and renewals.

## 3. Invoicing (with founder approval)

```
Draft ──submit──▶ Awaiting approval ──approve (founder)──▶ Approved ──send──▶ Sent ──payment──▶ Paid
   ▲                    │                                                    │
   └── Changes requested ◀┘ (founder adds a note)                            └── credit note (founder) ─▶ Credited
```

- **Create drafts** (Invoices → choose month → *Create draft invoices*). For each client without an invoice for that month, the CRM adds:
  - the retainer (pro rata in the start month) and the one-off onboarding fee for new clients
  - every *Additional* work item, as a priced line
  - all unbilled work items, as the **"Work completed this period"** schedule printed on the invoice
- **Edit** lines, add rate-card items, add a client PO number, then **Submit for approval**. This emails Avril from the preparer's mailbox.
- **Approve / Request changes**: Avril reviews the queue (Invoices → *Awaiting approval*, or the banner on the dashboard). Requested changes go back to the preparer's inbox with the note.
- **Send**: only approved invoices can be sent. Sending assigns the next sequential invoice number (INV-10xx), sets the date / tax point to the send date and due date to +30 days, locks the invoice, and emails the client's accounts address.
- **Get paid**: *Record payment* (date, method, bank reference) or *Send reminder*. Overdue invoices are flagged on the dashboard and in Aged debtors.
- **Corrections**: issued invoices are never edited or deleted. The founder issues a **credit note** (CN-000x), which reverses the VAT and sales in the quarter it is issued.

Invoices print as compliant UK VAT invoices (see below) via *Print / save PDF*.

## 4. UK tax treatment (LOUD Personal Branding Ltd, VAT-registered)

> Bookkeeping aid, not tax advice. Confirm treatments and figures with your accountant before filing.

| Area | How the CRM handles it |
|---|---|
| **VAT invoices** | Each invoice shows: unique sequential number, date / tax point, LOUD's name, address and VAT number, the customer's name and address, a description of services, quantity, unit price excl. VAT, VAT rate, net, VAT and gross totals in GBP. The footer shows the company number and registered office (Companies Act). |
| **VAT on sales** | All clients are UK businesses, so services are standard-rated at 20%. |
| **Tax point** | The date the invoice is issued (sent). Monthly invoices go out within 14 days of the work, so the invoice date is the tax point. |
| **VAT accounting** | Standard (invoice) basis by default: VAT is due in the quarter the invoice is issued. Finance → Settings switches to the **Cash Accounting Scheme** (turnover under £1.35m), where VAT is due when the client pays. |
| **VAT quarters** | Stagger ending Mar / Jun / Sep / Dec. Returns and payment are due 1 month + 7 days after the quarter ends. |
| **VAT return (9 boxes)** | Calculated from issued invoices, credit notes and expenses. Reverse-charge services from overseas suppliers go in Boxes 1, 4, 6 and 7. Wages, PAYE/NI and other outside-scope costs are excluded from Box 7. Client entertainment VAT is blocked (not reclaimed). Boxes 6–9 are in whole pounds. |
| **Filing** | Submit through MTD-compatible software or your accountant, then *Mark as filed* with the HMRC reference. The CRM stores a snapshot of the filed figures. Pre-filing checks flag unsent invoices and missing receipts. *Export CSV* gives the boxes plus every transaction behind them. |
| **Expenses** | Each expense records net, VAT, VAT treatment (standard, zero, exempt, supplier not registered, reverse charge, outside scope), whether VAT is reclaimable, whether it is allowable for corporation tax, and whether a receipt is held. |
| **Corporation tax** | An estimate on the financial year (1 April – 31 March): 19% up to £50K profit, 25% from £250K, with marginal relief (3/200) in between. Disallowable costs (client entertainment) are added back. Capital allowances, accruals and associated companies are not modelled. |
| **Exports** | Sales ledger CSV, Xero-style sales invoice import (`20% (VAT on Income)`, account 200; check against your Xero template), expenses CSV, and a VAT return CSV. |
| **Deadlines** | Finance → Deadlines lists VAT returns, PAYE payments (22nd), annual accounts (9 months after year end), corporation tax payment (9 months + 1 day), CT600 (12 months) and the confirmation statement. |
| **Record keeping** | Keep business records for at least 6 years. All CRM data lives in `data/*.json` and is versioned in git. |

## 5. Mail and calendar (demo)

Heloise (`heloise@loud.example`) and Lottie (`lottie@loud.example`) have demo mailboxes and calendars. Invites, follow-ups, approval requests, invoices and reminders appear in the sender's **Sent** folder. Client replies, remittance advice and Avril's approvals appear in **Inbox**. Nothing is actually emailed. The `.example` domain is reserved and can't receive mail.

## Where the data lives

All records are plain JSON in `data/`, written by the local server whenever something changes. Commit them to keep an audit trail. `npm run seed` regenerates the fictional demo history and **overwrites** these files.
