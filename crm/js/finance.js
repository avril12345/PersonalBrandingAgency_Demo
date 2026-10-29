/* LOUD finance rules — shared by the browser app and Node scripts.
   UK Ltd company, VAT-registered. These are bookkeeping aids, not tax advice:
   confirm figures with an accountant before filing. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LOUDFinance = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const r2 = (n) => Math.round(n * 100) / 100;
  const iso = (dt) => dt.toISOString().slice(0, 10);
  const dt = (s) => new Date(s + "T12:00:00Z");
  const addDays = (s, n) => { const x = dt(s); x.setUTCDate(x.getUTCDate() + n); return iso(x); };
  const addMonths = (s, n) => { const x = dt(s); x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + n); return iso(x); };
  const endOfMonth = (y, m) => iso(new Date(Date.UTC(y, m, 0, 12))); // m is 1-based
  const daysBetween = (a, b) => Math.round((dt(b) - dt(a)) / 864e5);

  // ------------------------------------------------------------- invoices
  const ISSUED = ["Sent", "Paid", "Credited"]; // statuses that mean the invoice has a tax point
  const isIssued = (inv) => (inv.type === "credit_note" ? inv.status === "Issued" : ISSUED.includes(inv.status));

  function invoiceTotals(inv) {
    let net = 0, vat = 0;
    for (const l of inv.lines) {
      const ln = r2(l.qty * l.unit_price);
      net += ln;
      vat += r2(ln * l.vat_rate);
    }
    const sign = inv.type === "credit_note" ? -1 : 1;
    return { net: sign * r2(net), vat: sign * r2(vat), gross: sign * r2(net + vat) };
  }

  // Display status: a sent invoice past its due date is Overdue.
  function displayStatus(inv, today) {
    if (inv.type !== "credit_note" && inv.status === "Sent" && inv.due_date < today) return "Overdue";
    return inv.status;
  }

  function aging(invoices, today) {
    const buckets = { Current: 0, "1–30": 0, "31–60": 0, "61–90": 0, "90+": 0 };
    for (const inv of invoices) {
      if (inv.type === "credit_note" || inv.status !== "Sent") continue;
      const late = daysBetween(inv.due_date, today);
      const g = invoiceTotals(inv).gross;
      if (late <= 0) buckets.Current += g;
      else if (late <= 30) buckets["1–30"] += g;
      else if (late <= 60) buckets["31–60"] += g;
      else if (late <= 90) buckets["61–90"] += g;
      else buckets["90+"] += g;
    }
    return buckets;
  }

  // ------------------------------------------------------------- VAT
  function vatQuarters(company, from, to) {
    const ends = company.vat.quarter_end_months;
    const out = [];
    const start = dt(from);
    for (let y = start.getUTCFullYear() - 1; y <= dt(to).getUTCFullYear() + 1; y++) {
      for (const m of ends) {
        const end = endOfMonth(y, m);
        const qStart = addMonths(end, -2);
        if (end < from || qStart > to) continue;
        const nm = dt(addMonths(end, 1));
        const due = addDays(endOfMonth(nm.getUTCFullYear(), nm.getUTCMonth() + 1), 7); // 1 month + 7 days
        out.push({
          key: `${end.slice(0, 7)}`,
          label: `${new Date(qStart + "T12:00:00Z").toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}–${new Date(end + "T12:00:00Z").toLocaleString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })}`,
          start: qStart,
          end,
          due,
        });
      }
    }
    return out.sort((a, b) => a.start.localeCompare(b.start));
  }

  // Which expenses count towards Box 7 (excludes wages, PAYE/NI, rates and other outside-scope items).
  const IN_BOX7 = ["standard", "zero", "exempt", "no_vat", "reverse_charge"];

  function vatReturn(q, invoices, expenses, company) {
    const basis = company.vat.accounting_basis;
    const rate = company.vat.standard_rate;
    const inQ = (d) => d && d >= q.start && d <= q.end;
    let salesNet = 0, salesVat = 0;
    const salesRows = [];
    for (const inv of invoices) {
      if (!isIssued(inv)) continue;
      const when = basis === "cash" ? (inv.type === "credit_note" ? inv.tax_point : inv.paid_date) : inv.tax_point;
      if (!inQ(when)) continue;
      const t = invoiceTotals(inv);
      salesNet += t.net;
      salesVat += t.vat;
      salesRows.push({ inv, ...t });
    }
    let purchNet = 0, inputVat = 0, rcNet = 0, rcVat = 0;
    const purchRows = [];
    for (const e of expenses) {
      if (!inQ(e.date)) continue;
      if (e.vat_treatment === "reverse_charge") {
        rcNet += e.net;
        rcVat += r2(e.net * rate);
      } else if (e.reclaimable) inputVat += e.vat;
      if (IN_BOX7.includes(e.vat_treatment)) purchNet += e.net;
      purchRows.push(e);
    }
    const box1 = r2(salesVat + rcVat);
    const box2 = 0;
    const box3 = r2(box1 + box2);
    const box4 = r2(inputVat + rcVat);
    return {
      boxes: {
        1: box1, 2: box2, 3: box3, 4: box4, 5: r2(Math.abs(box3 - box4)),
        6: Math.floor(salesNet + rcNet), 7: Math.floor(purchNet), 8: 0, 9: 0,
      },
      payable: box3 - box4 >= 0,
      salesRows,
      purchRows,
    };
  }

  const VAT_BOX_LABELS = {
    1: "VAT due on sales and other outputs",
    2: "VAT due on acquisitions from EU (Northern Ireland only)",
    3: "Total VAT due (Box 1 + Box 2)",
    4: "VAT reclaimed on purchases and other inputs",
    5: "Net VAT to pay to HMRC or reclaim",
    6: "Total value of sales excluding VAT",
    7: "Total value of purchases excluding VAT",
    8: "Supplies of goods to EU (Northern Ireland only)",
    9: "Acquisitions of goods from EU (Northern Ireland only)",
  };

  // ------------------------------------------------------------- corporation tax
  function financialYear(company, date) {
    const [mm, dd] = company.financial_year_end.split("-").map(Number);
    const y = dt(date).getUTCFullYear();
    let end = `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    if (end < date) end = `${y + 1}${end.slice(4)}`;
    const start = addDays(`${+end.slice(0, 4) - 1}${end.slice(4)}`, 1);
    return { start, end, label: `FY ${start.slice(0, 4)}/${end.slice(2, 4)}` };
  }

  // Rates from 1 April 2023: 19% small profits rate (≤ £50k), 25% main rate (≥ £250k),
  // marginal relief between (fraction 3/200). Ignores associated companies and short periods.
  function corporationTax(taxableProfit) {
    const p = Math.max(0, taxableProfit);
    if (p <= 50000) return { tax: r2(p * 0.19), band: "Small profits rate (19%)" };
    if (p >= 250000) return { tax: r2(p * 0.25), band: "Main rate (25%)" };
    const relief = (3 / 200) * (250000 - p);
    return { tax: r2(p * 0.25 - relief), band: "Main rate with marginal relief" };
  }

  function profitAndLoss(range, invoices, expenses) {
    let revenue = 0;
    for (const inv of invoices) if (isIssued(inv) && inv.tax_point >= range.start && inv.tax_point <= range.end) revenue += invoiceTotals(inv).net;
    let costs = 0, disallowable = 0;
    const byCategory = {};
    for (const e of expenses) {
      if (e.date < range.start || e.date > range.end) continue;
      const cost = e.net + (e.reclaimable ? 0 : e.vat);
      costs += cost;
      if (!e.ct_deductible) disallowable += cost;
      byCategory[e.category] = (byCategory[e.category] || 0) + cost;
    }
    const profit = r2(revenue - costs);
    const taxable = r2(profit + disallowable);
    return { revenue: r2(revenue), costs: r2(costs), disallowable: r2(disallowable), profit, taxable, byCategory, ct: corporationTax(taxable) };
  }

  // ------------------------------------------------------------- compliance calendar
  function deadlines(company, today, vatFilings) {
    const out = [];
    const filed = Object.fromEntries((vatFilings || []).map((f) => [f.quarter, f]));
    for (const q of vatQuarters(company, addMonths(today, -6), addMonths(today, 9))) {
      if (q.end > addMonths(today, 3)) continue;
      out.push({ date: q.due, title: `VAT return & payment — ${q.label}`, kind: "VAT", done: !!filed[q.key], detail: "File via MTD-compatible software; payment clears same deadline" });
    }
    const fy = financialYear(company, today);
    const prevEnd = addDays(fy.start, -1);
    const prevLabel = `FY ${+prevEnd.slice(0, 4) - 1}/${prevEnd.slice(2, 4)}`;
    const nineMonths = (end) => endOfMonth(dt(addMonths(end, 9)).getUTCFullYear(), dt(addMonths(end, 9)).getUTCMonth() + 1);
    for (const [end, label] of [[prevEnd, prevLabel], [fy.end, fy.label]]) {
      out.push({ date: nineMonths(end), title: `Annual accounts to Companies House — ${label}`, kind: "Companies House", detail: "Private company: 9 months after year end" });
      out.push({ date: addDays(nineMonths(end), 1), title: `Corporation tax payment — ${label}`, kind: "HMRC", detail: "9 months and 1 day after year end" });
      out.push({ date: `${+end.slice(0, 4) + 1}${end.slice(4)}`, title: `CT600 company tax return — ${label}`, kind: "HMRC", detail: "12 months after year end" });
    }
    // Confirmation statement: within 14 days of each incorporation anniversary.
    let cs = `${dt(today).getUTCFullYear()}${company.incorporation_date.slice(4)}`;
    if (addDays(cs, 14) < today) cs = `${+cs.slice(0, 4) + 1}${cs.slice(4)}`;
    out.push({ date: addDays(cs, 14), title: "Confirmation statement to Companies House", kind: "Companies House", detail: "Annual, within 14 days of review date" });
    // PAYE: pay HMRC by the 22nd of the following tax month (electronic).
    for (let i = 0; i < 3; i++) {
      const m = addMonths(today, i);
      out.push({ date: `${m.slice(0, 7)}-22`, title: "PAYE & NI payment to HMRC", kind: "Payroll", detail: "Electronic payment for the previous tax month; FPS on or before each payday" });
    }
    return out.filter((d) => d.date >= addMonths(today, -2)).sort((a, b) => a.date.localeCompare(b.date));
  }

  return { r2, addDays, addMonths, daysBetween, isIssued, invoiceTotals, displayStatus, aging, vatQuarters, vatReturn, VAT_BOX_LABELS, financialYear, corporationTax, profitAndLoss, deadlines };
});
