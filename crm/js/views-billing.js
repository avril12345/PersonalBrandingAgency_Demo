/* Invoices (draft → approval → send → paid, credit notes) and Finance (VAT, ledgers, CT, deadlines). */
(() => {
  "use strict";
  const L = window.L, F = L.F, esc = L.esc;
  const EDITABLE = ["Draft", "Changes requested"];
  const OPEN = ["Draft", "Awaiting approval", "Changes requested", "Approved"];
  const VAT_TREATMENTS = [["standard", "Standard rated (20%)"], ["zero", "Zero rated (0%)"], ["exempt", "Exempt"], ["no_vat", "No VAT: supplier not VAT registered"], ["reverse_charge", "Reverse charge: overseas supplier"], ["outside_scope", "Outside scope: wages, PAYE/NI, rates"]];
  const EXP_CATEGORIES = ["Rent & premises", "Salaries & employer NI", "Freelancers", "Software & subscriptions", "Accountancy & legal", "Travel", "Client entertainment", "Equipment", "Insurance", "Bank charges", "Marketing", "Training", "Other"];
  L.ui.inv = { filter: "all", client: "" };
  L.ui.fin = { quarter: null, expMonth: "" };

  const invById = (id) => L.state.invoices.find((i) => i.id === id);
  const company = () => L.state.company;
  const log = (inv, action, note) => inv.history.push({ date: L.TODAY, by: L.me().id, action, ...(note ? { note } : {}) });
  const lastDay = (ym) => L.addDays(L.addMonths(ym + "-01", 1), -1);

  // ================================================================ tables
  L.invoiceTable = (invs, { client = true } = {}) => invs.length ? `<div class="table-wrap"><table>
    <thead><tr><th>Invoice</th>${client ? "<th>Client</th>" : ""}<th>Period</th><th class="r">Net</th><th class="r">VAT</th><th class="r">Total</th><th>Status</th><th>Due</th></tr></thead>
    <tbody>${invs.map((i) => { const t = L.invTotals(i), c = L.clientById[i.client_id], s = L.invStatus(i); return `<tr>
      <td><a href="#/invoice/${i.id}"><b>${esc(L.invLabel(i))}</b></a>${i.type === "credit_note" ? '<div class="small muted">Credit note</div>' : ""}</td>
      ${client ? `<td>${L.clientCell(c, c.company)}</td>` : ""}
      <td class="nowrap">${L.monthLabel(i.period)}</td><td class="r num">${L.gbp(t.net)}</td><td class="r num">${L.gbp(t.vat)}</td><td class="r num"><b>${L.gbp(t.gross)}</b></td>
      <td>${L.invStatusBadge(s)}</td><td class="num nowrap ${s === "Overdue" ? "crit-text" : ""}">${i.type === "credit_note" || i.status === "Paid" ? (i.paid_date ? `Paid ${L.fmtDate(i.paid_date)}` : "—") : L.fmtDate(i.due_date)}</td></tr>`; }).join("")}</tbody></table></div>` : `<div class="empty">No invoices.</div>`;

  // ================================================================ invoices list
  L.views.invoices = (filter = "all") => {
    const S = L.state, T = L.TODAY;
    L.ui.inv.filter = filter;
    const all = S.invoices.slice().sort((a, b) => b.issue_date.localeCompare(a.issue_date) || a.client_id.localeCompare(b.client_id));
    const sum = (arr, k = "gross") => arr.reduce((s, i) => s + L.invTotals(i)[k], 0);
    const awaiting = all.filter((i) => i.status === "Awaiting approval");
    const drafts = all.filter((i) => EDITABLE.includes(i.status) || i.status === "Approved");
    const outstanding = all.filter((i) => i.type === "invoice" && i.status === "Sent");
    const overdue = outstanding.filter((i) => L.invStatus(i) === "Overdue");
    const fy = F.financialYear(company(), T);
    const paidFy = all.filter((i) => i.status === "Paid" && i.paid_date >= fy.start);
    const lists = { all, approval: awaiting, draft: drafts, outstanding, paid: all.filter((i) => i.status === "Paid" || i.type === "credit_note") };
    const shown = (lists[filter] || all).filter((i) => !L.ui.inv.client || i.client_id === L.ui.inv.client);
    const nextPeriod = L.addMonths(T.slice(0, 7) + "-01", S.invoices.some((i) => i.period === T.slice(0, 7)) ? 1 : 0).slice(0, 7);
    return `
      <div class="page-head"><div><h1>Invoices</h1><p>Monthly invoices are built from logged work, approved by ${esc(company().founder.name.split(" ")[0])}, then sent to the client. All amounts in GBP; VAT at 20%.</p></div>
        <div class="actions"><select id="gen-period" aria-label="Billing period">${L.options([-1, 0, 1].map((o) => { const ym = L.addMonths(nextPeriod + "-01", o).slice(0, 7); return [ym, L.monthLabel(ym)]; }), nextPeriod)}</select><button class="btn primary" data-act="create-invoices">Create draft invoices</button></div></div>
      <div class="grid kpis">
        ${L.kpi("Awaiting approval", awaiting.length, L.gbp(sum(awaiting)), awaiting.length ? "accent" : "")}
        ${L.kpi("Drafts in progress", drafts.length, L.gbp(sum(drafts)))}
        ${L.kpi("Outstanding", L.gbp0(sum(outstanding)), `${outstanding.length} invoice${outstanding.length === 1 ? "" : "s"} sent`)}
        ${L.kpi("Overdue", L.gbp0(sum(overdue)), overdue.length ? `<span class="crit-text">▲ ${overdue.length} overdue</span>` : "none")}
        ${L.kpi(`Received · ${fy.label}`, L.gbpK(sum(paidFy)), "incl. VAT")}
      </div>
      ${filter === "approval" ? approvalQueue(awaiting) : ""}
      <section class="card">
        <div class="filters">
          <div class="seg" role="group" aria-label="Filter">${[["all", "All"], ["approval", `Awaiting approval (${awaiting.length})`], ["draft", "Drafts"], ["outstanding", "Outstanding"], ["paid", "Paid & credits"]].map(([k, l]) => `<a href="#/invoices/${k}" class="${filter === k ? "on" : ""}">${l}</a>`).join("")}</div>
          <select data-if="client" aria-label="Client">${L.options(L.clientOptions(), L.ui.inv.client, "All clients")}</select>
        </div>
        ${L.invoiceTable(shown)}
      </section>`;
  };

  function approvalQueue(list) {
    if (!list.length) return `<div class="banner">Nothing waiting for approval.</div>`;
    return `<section class="card" style="margin-bottom:16px"><header><h2>Approval queue</h2><span class="aside">${L.isFounder() ? "Check each breakdown, then approve or send back." : `Only ${esc(company().founder.name)} can approve. Switch persona in the top bar.`}</span></header>
      <div class="approval-grid">${list.map((i) => { const c = L.clientById[i.client_id], t = L.invTotals(i); const add = i.lines.filter((l) => !/retainer/i.test(l.description)); return `<div class="approval-card">
        <div class="name">${esc(L.fullName(c))}</div><div class="small muted">${esc(c.company)} · ${L.monthLabel(i.period)} · prepared by ${esc(L.firstName(i.prepared_by))}</div>
        <div class="amt num">${L.gbp(t.gross)} <span class="small muted">incl. ${L.gbp(t.vat)} VAT</span></div>
        <div class="small">${i.work_item_ids.length} work items${add.length ? ` · ${add.length} extra line${add.length > 1 ? "s" : ""}: ${add.map((l) => esc(l.description)).join("; ")}` : ""}</div>
        <div class="row-actions"><a class="btn small" href="#/invoice/${i.id}">Review</a>${L.isFounder() ? `<button class="btn small primary" data-act="inv-approve" data-id="${i.id}">Approve</button><button class="btn small" data-act="inv-changes" data-id="${i.id}">Request changes</button>` : ""}</div></div>`; }).join("")}</div></section>`;
  }

  // ================================================================ invoice detail
  L.views.invoice = (id) => {
    const inv = invById(id);
    if (!inv) return `<div class="card">Invoice not found. <a href="#/invoices">Back</a></div>`;
    const c = L.clientById[inv.client_id], s = L.invStatus(inv), t = L.invTotals(inv);
    const editable = EDITABLE.includes(inv.status);
    const work = inv.work_item_ids.map((wid) => L.state.worklog.find((w) => w.id === wid)).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
    const unbilled = L.state.worklog.filter((w) => w.client_id === c.id && !w.invoice_id && w.date <= lastDay(inv.period));
    return `
      <div class="page-head no-print"><a href="#/invoices" class="small muted">← Invoices</a></div>
      <div class="grid two-col">
        <div>${invoiceDoc(inv, c, t, work, editable)}</div>
        <div class="stack no-print">
          <section class="card"><header><h2>${esc(L.invLabel(inv))}</h2>${L.invStatusBadge(s)}</header>
            ${workflowPanel(inv, s)}
          </section>
          ${editable ? `<section class="card"><header><h2>Edit draft</h2></header>
            <label class="field"><span>Client PO number</span><input data-inv-field="po_number" value="${esc(inv.po_number || "")}" placeholder="If the client requires one"></label>
            <label class="field"><span>Notes on invoice</span><textarea data-inv-field="notes" rows="2">${esc(inv.notes || "")}</textarea></label>
            <div class="field-label">Add a line from the rate card</div>
            <div class="row-actions"><select id="rate-pick">${L.options(company().rate_card.map((r, i) => [i, `${r.item} (£${r.price_gbp})`]))}</select><button class="btn small" data-act="inv-add-rate" data-id="${inv.id}">Add</button><button class="btn small" data-act="inv-add-line" data-id="${inv.id}">+ Blank line</button></div>
            ${unbilled.length ? `<div class="field-label" style="margin-top:12px">Unbilled work up to ${L.fmtDate(lastDay(inv.period))} (${unbilled.length})</div><button class="btn small" data-act="inv-pull-work" data-id="${inv.id}">Add to this invoice's work schedule</button>` : ""}
            <div class="row-actions" style="margin-top:12px"><button class="btn primary" data-act="inv-save" data-id="${inv.id}">Save draft</button><button class="btn ghost danger" data-act="inv-delete" data-id="${inv.id}">Delete draft</button></div>
          </section>` : ""}
          ${inv.type === "invoice" && inv.status === "Sent" ? `<section class="card"><header><h2>PO / reference</h2></header><label class="field"><span>Client PO number</span><input data-inv-field="po_number" value="${esc(inv.po_number || "")}"></label><button class="btn small" data-act="inv-save-po" data-id="${inv.id}">Save & log</button></section>` : ""}
          <section class="card"><header><h2>History</h2></header>
            <ul class="list">${inv.history.slice().reverse().map((h) => `<li><span class="when">${L.fmtDate(h.date)}</span><div class="body"><div><b>${esc(h.action)}</b> · ${esc(L.personById[h.by]?.name || h.by)}</div>${h.note ? `<div class="small muted">${esc(h.note)}</div>` : ""}</div></li>`).join("")}</ul>
          </section>
        </div>
      </div>`;
  };

  function workflowPanel(inv, s) {
    const me = L.me(), founder = L.isFounder();
    const credit = inv.type === "credit_note" ? "" : L.state.invoices.find((x) => x.credit_for === inv.id);
    const step = (on, label) => `<li class="${on ? "on" : ""}">${label}</li>`;
    const order = ["Draft", "Awaiting approval", "Approved", "Sent", "Paid"];
    const idx = Math.max(order.indexOf(inv.status === "Changes requested" ? "Draft" : inv.status === "Credited" ? "Sent" : inv.status), 0);
    let actions = "";
    if (inv.type === "credit_note") actions = `<p class="small muted">Credit note issued ${L.fmtLong(inv.tax_point)}${inv.credit_for ? ` against <a href="#/invoice/${inv.credit_for}">${esc(L.invLabel(invById(inv.credit_for)))}</a>` : ""}. It reduces the VAT and sales for that quarter.</p>`;
    else if (EDITABLE.includes(inv.status)) {
      const req = inv.history.filter((h) => h.action === "Changes requested").at(-1);
      actions = `${req && inv.status === "Changes requested" ? `<div class="banner warn small"><b>${esc(L.firstName(req.by))} asked for changes:</b> ${esc(req.note || "")}</div>` : ""}
        <p class="small muted">Check the lines and work schedule, then submit. ${esc(company().founder.name.split(" ")[0])} approves before anything reaches the client.</p>
        <button class="btn primary" data-act="inv-submit" data-id="${inv.id}">Submit for approval</button>`;
    } else if (inv.status === "Awaiting approval") {
      actions = founder
        ? `<p class="small muted">Review the breakdown on the left. Approving lets the team send it; nothing is sent automatically.</p><div class="row-actions"><button class="btn primary" data-act="inv-approve" data-id="${inv.id}">Approve</button><button class="btn" data-act="inv-changes" data-id="${inv.id}">Request changes</button></div>`
        : `<p class="small muted">Waiting for ${esc(company().founder.name)} to approve. (Switch persona to "${esc(company().founder.name)}" in the top bar to approve.)</p>`;
    } else if (inv.status === "Approved") {
      actions = `<p class="small muted">Approved by ${esc(L.firstName(inv.approved_by))} on ${L.fmtDate(inv.approved_date)}. Sending assigns the next invoice number, sets the tax point to today (${L.fmtDate(L.TODAY)}) and emails ${esc(L.clientById[inv.client_id].billing.email)} from ${esc(L.firstName(inv.prepared_by))}'s mailbox.</p>
        <button class="btn primary" data-act="inv-send" data-id="${inv.id}">Send to client</button>`;
    } else if (inv.status === "Sent") {
      actions = `<p class="small ${s === "Overdue" ? "crit-text" : "muted"}">${s === "Overdue" ? `▲ Overdue by ${L.daysFrom(inv.due_date, L.TODAY)} days.` : `Due ${L.fmtLong(inv.due_date)} (${L.daysFrom(L.TODAY, inv.due_date)} days).`}</p>
        <div class="row-actions"><button class="btn primary" data-act="inv-pay" data-id="${inv.id}">Record payment</button><button class="btn" data-act="inv-remind" data-id="${inv.id}">Send reminder</button>${founder ? `<button class="btn ghost danger" data-act="inv-credit" data-id="${inv.id}">Issue credit note</button>` : ""}</div>`;
    } else if (inv.status === "Paid") actions = `<p class="small muted">Paid ${L.fmtLong(inv.paid_date)} by ${esc(inv.payment_method || "")} ${inv.payment_ref ? `(ref ${esc(inv.payment_ref)})` : ""}.</p>`;
    else if (inv.status === "Credited") actions = `<p class="small muted">Cancelled by credit note ${credit ? `<a href="#/invoice/${credit.id}">${esc(credit.number)}</a>` : ""}.</p>`;
    return `${inv.type === "invoice" ? `<ol class="steps">${order.map((o, i) => step(i <= idx, o)).join("")}</ol>` : ""}${actions}
      <div class="row-actions" style="margin-top:10px"><button class="btn small" data-act="print">Print / save PDF</button></div>`;
  }

  function invoiceDoc(inv, c, t, work, editable) {
    const co = company(), cn = inv.type === "credit_note";
    const grouped = {};
    for (const w of work) (grouped[w.category] ||= []).push(w);
    return `<article class="card invoice-doc">
      <header class="inv-head">
        <div><div class="wordmark-lg">LOUD</div><div class="small">${esc(co.legal_name)}<br>${co.registered_office.map(esc).join("<br>")}<br>${esc(co.email)}</div></div>
        <div class="inv-meta"><h1>${cn ? "CREDIT NOTE" : "TAX INVOICE"}</h1>
          <dl class="dl"><dt>${cn ? "Credit note" : "Invoice"} no.</dt><dd><b>${inv.number ? esc(inv.number) : "Assigned when sent"}</b></dd>
          <dt>Date / tax point</dt><dd>${inv.tax_point ? L.fmtLong(inv.tax_point) : `${L.fmtLong(inv.issue_date)} (planned)`}</dd>
          ${cn ? "" : `<dt>Payment due</dt><dd>${inv.tax_point ? L.fmtLong(inv.due_date) : `${co.payment_terms_days} days from issue`}</dd>`}
          <dt>Period</dt><dd>${L.monthLabel(inv.period)}</dd>
          ${inv.po_number ? `<dt>PO number</dt><dd>${esc(inv.po_number)}</dd>` : ""}
          <dt>VAT reg. no.</dt><dd>${esc(co.vat_number)}</dd></dl></div>
      </header>
      <div class="inv-to"><div class="small muted">Bill to</div><b>${esc(c.billing.company)}</b><br>${c.billing.address.map(esc).join("<br>")}<br><span class="small">FAO ${esc(L.fullName(c))}, ${esc(c.title)} · ${esc(c.billing.email)}</span></div>
      <table class="inv-lines">
        <thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">VAT</th><th class="r">Net</th>${editable ? "<th></th>" : ""}</tr></thead>
        <tbody>${inv.lines.map((l, i) => editable ? `<tr data-line="${i}"><td><input data-line-field="description" value="${esc(l.description)}" aria-label="Description"></td><td class="r"><input class="num-in" type="number" step="0.25" data-line-field="qty" value="${l.qty}" aria-label="Quantity"></td><td class="r"><input class="num-in" type="number" step="0.01" data-line-field="unit_price" value="${l.unit_price}" aria-label="Unit price"></td><td class="r">${Math.round(l.vat_rate * 100)}%</td><td class="r num">${L.gbp(l.qty * l.unit_price)}</td><td><button class="btn ghost small" data-act="inv-remove-line" data-id="${inv.id}" data-i="${i}" aria-label="Remove line">×</button></td></tr>`
          : `<tr><td>${esc(l.description)}</td><td class="r num">${l.qty}</td><td class="r num">${L.gbp(l.unit_price)}</td><td class="r">${Math.round(l.vat_rate * 100)}%</td><td class="r num">${L.gbp(l.qty * l.unit_price)}</td></tr>`).join("")}</tbody>
        <tfoot><tr><td colspan="4" class="r">Subtotal (excl. VAT)</td><td class="r num">${L.gbp(t.net)}</td>${editable ? "<td></td>" : ""}</tr>
          <tr><td colspan="4" class="r">VAT @ 20%</td><td class="r num">${L.gbp(t.vat)}</td>${editable ? "<td></td>" : ""}</tr>
          <tr class="total"><td colspan="4" class="r">${cn ? "Total credit" : "Total due"} (GBP)</td><td class="r num">${L.gbp(t.gross)}</td>${editable ? "<td></td>" : ""}</tr></tfoot>
      </table>
      ${inv.notes ? `<p class="small">${esc(inv.notes)}</p>` : ""}
      ${work.length ? `<section class="inv-work"><h2>Work completed this period</h2>${Object.entries(grouped).map(([cat, ws]) => `<h3>${esc(cat)} <span class="muted">(${ws.length})</span></h3><table><tbody>${ws.map((w) => `<tr><td class="nowrap num">${L.fmtDate(w.date)}</td><td>${esc(w.description)}</td><td class="small muted nowrap">${esc(L.firstName(w.by))}</td><td class="small r nowrap">${w.billing === "Additional" ? "billed above" : "in retainer"}</td></tr>`).join("")}</tbody></table>`).join("")}</section>` : ""}
      ${cn ? "" : `<footer class="inv-pay"><b>Payment</b> by bank transfer to ${esc(co.bank.account_name)} · Sort code ${esc(co.bank.sort_code)} · Account ${esc(co.bank.account_number)} · Reference: ${esc(inv.number || "invoice number")}<br>
        Payment terms: ${co.payment_terms_days} days. We may charge statutory interest and compensation on late payments under the Late Payment of Commercial Debts (Interest) Act 1998.</footer>`}
      <div class="inv-legal small muted">${esc(co.legal_name)} · Registered in England & Wales, company no. ${esc(co.company_number)} · Registered office: ${co.registered_office.map(esc).join(", ")} · VAT reg. ${esc(co.vat_number)}</div>
    </article>`;
  }

  // ================================================================ invoice mutations
  const syncLines = (inv) => {
    document.querySelectorAll("[data-line]").forEach((row) => {
      const l = inv.lines[+row.dataset.line];
      l.description = row.querySelector('[data-line-field="description"]').value;
      l.qty = +row.querySelector('[data-line-field="qty"]').value || 0;
      l.unit_price = +row.querySelector('[data-line-field="unit_price"]').value || 0;
    });
    document.querySelectorAll("[data-inv-field]").forEach((el) => (inv[el.dataset.invField] = el.value.trim()));
  };
  const nextNumber = (prefix, type) => {
    const nums = L.state.invoices.filter((i) => i.type === type && i.number).map((i) => +i.number.split("-")[1]);
    const n = Math.max(type === "invoice" ? 1000 : 0, ...nums) + 1;
    return `${prefix}-${type === "invoice" ? n : String(n).padStart(4, "0")}`;
  };

  function createDrafts(ym) {
    const S = L.state, VAT = company().vat.standard_rate;
    let made = 0;
    for (const c of S.clients) {
      if (c.engagement.start_date > lastDay(ym)) continue;
      if (S.invoices.some((i) => i.type === "invoice" && i.client_id === c.id && i.period === ym)) continue;
      const lines = [];
      const startMonth = c.engagement.start_date.slice(0, 7) === ym;
      if (startMonth) lines.push({ description: "Brand discovery & onboarding (one-off)", qty: 1, unit_price: company().rate_card[0].price_gbp, vat_rate: VAT });
      let price = c.engagement.monthly_retainer_gbp, desc = `${c.engagement.tier} retainer — ${L.monthLabel(ym)}`;
      if (startMonth) {
        const dim = +lastDay(ym).slice(8), from = +c.engagement.start_date.slice(8);
        price = F.r2((price * (dim - from + 1)) / dim);
        desc += ` (pro rata from ${L.fmtDate(c.engagement.start_date)})`;
      }
      lines.push({ description: desc, qty: 1, unit_price: price, vat_rate: VAT });
      const items = S.worklog.filter((w) => w.client_id === c.id && !w.invoice_id && w.date <= lastDay(ym));
      for (const w of items.filter((w) => w.billing === "Additional")) lines.push({ description: w.description, qty: 1, unit_price: w.amount, vat_rate: VAT });
      const inv = { id: L.nextId("I", S.invoices), type: "invoice", number: null, client_id: c.id, period: ym, issue_date: lastDay(ym), tax_point: null, due_date: L.addDays(lastDay(ym), company().payment_terms_days),
        lines, work_item_ids: items.map((w) => w.id), status: "Draft", prepared_by: L.state.assignments[c.id], approved_by: null, approved_date: null, sent_date: null, paid_date: null, payment_method: null, payment_ref: null, notes: "", history: [] };
      log(inv, "Draft created from work log");
      items.forEach((w) => (w.invoice_id = inv.id));
      S.invoices.push(inv);
      made++;
    }
    return made;
  }

  Object.assign(L.actions, {
    "create-invoices": async () => {
      const ym = document.getElementById("gen-period").value;
      const n = createDrafts(ym);
      if (!n) return L.toast(`Every client already has an invoice for ${L.monthLabel(ym)}`);
      await L.save("invoices", "worklog");
      L.toast(`${n} draft invoice${n > 1 ? "s" : ""} created for ${L.monthLabel(ym)}`);
      location.hash = "#/invoices/draft";
    },
    "inv-save": async (el) => { const inv = invById(el.dataset.id); syncLines(inv); await L.save("invoices"); L.render(); },
    "inv-save-po": async (el) => { const inv = invById(el.dataset.id); const v = document.querySelector('[data-inv-field="po_number"]').value.trim(); inv.po_number = v; log(inv, "PO number recorded", v); await L.save("invoices"); L.render(); },
    "inv-add-line": (el) => { const inv = invById(el.dataset.id); syncLines(inv); inv.lines.push({ description: "", qty: 1, unit_price: 0, vat_rate: company().vat.standard_rate }); L.render(); },
    "inv-add-rate": (el) => { const inv = invById(el.dataset.id); syncLines(inv); const r = company().rate_card[+document.getElementById("rate-pick").value]; inv.lines.push({ description: r.item, qty: 1, unit_price: r.price_gbp, vat_rate: company().vat.standard_rate }); L.render(); },
    "inv-remove-line": (el) => { const inv = invById(el.dataset.id); syncLines(inv); inv.lines.splice(+el.dataset.i, 1); L.render(); },
    "inv-pull-work": async (el) => {
      const inv = invById(el.dataset.id); syncLines(inv);
      const items = L.state.worklog.filter((w) => w.client_id === inv.client_id && !w.invoice_id && w.date <= lastDay(inv.period));
      for (const w of items) {
        w.invoice_id = inv.id; inv.work_item_ids.push(w.id);
        if (w.billing === "Additional") inv.lines.push({ description: w.description, qty: 1, unit_price: w.amount, vat_rate: company().vat.standard_rate });
      }
      await L.save("invoices", "worklog"); L.render();
    },
    "inv-delete": async (el) => {
      if (!confirm("Delete this draft? Its work items return to unbilled.")) return;
      const inv = invById(el.dataset.id);
      L.state.worklog.forEach((w) => { if (w.invoice_id === inv.id) w.invoice_id = null; });
      L.state.invoices = L.state.invoices.filter((i) => i !== inv);
      await L.save("invoices", "worklog");
      location.hash = "#/invoices";
    },
    "inv-submit": async (el) => {
      const inv = invById(el.dataset.id); syncLines(inv);
      if (!inv.lines.length || inv.lines.some((l) => !l.description)) return L.toast("Every line needs a description", true);
      inv.status = "Awaiting approval"; log(inv, "Submitted for approval");
      const c = L.clientById[inv.client_id], t = L.invTotals(inv), from = L.me().id === "F1" ? inv.prepared_by : L.me().id;
      L.sendEmail({ mailbox: from, to: { name: company().founder.name, email: company().founder.email }, subject: `For approval: ${L.fullName(c)} — ${L.monthLabel(inv.period)} invoice (${L.gbp(t.gross)})`, related: { type: "invoice", id: inv.id },
        body: `Hi ${company().founder.name.split(" ")[0]},\n\nThe ${L.monthLabel(inv.period)} invoice for ${L.fullName(c)} (${c.company}) is ready for approval: ${L.gbp(t.net)} + VAT = ${L.gbp(t.gross)}, covering ${inv.work_item_ids.length} completed work items.\n\nThanks,\n${L.firstName(from)}` });
      await L.save("invoices", "emails"); L.render();
    },
    "inv-approve": async (el) => {
      if (!L.isFounder()) return L.toast("Only the founder can approve invoices", true);
      const inv = invById(el.dataset.id);
      Object.assign(inv, { status: "Approved", approved_by: "F1", approved_date: L.TODAY }); log(inv, "Approved");
      const c = L.clientById[inv.client_id];
      L.state.emails.unshift({ id: L.nextId("EM", L.state.emails), mailbox: inv.prepared_by, folder: "inbox", from: { name: company().founder.name, email: company().founder.email }, to: [{ name: L.personById[inv.prepared_by].name, email: L.personById[inv.prepared_by].email }], subject: `Approved: ${L.fullName(c)} — ${L.monthLabel(inv.period)} invoice`, date: `${L.TODAY}T${new Date().toTimeString().slice(0, 8)}`, body: `Approved. Please send it to ${c.billing.email}.\n\n${company().founder.name.split(" ")[0]}`, related: { type: "invoice", id: inv.id }, read: false });
      await L.save("invoices", "emails"); L.toast(`Approved: ${L.fullName(c)}`); L.render();
    },
    "inv-changes": (el) => {
      const inv = invById(el.dataset.id);
      L.openForm({ title: "Request changes", saveLabel: "Send back", fields: [{ name: "note", label: "What needs changing?", type: "textarea", required: true }],
        onSave: async (f) => {
          inv.status = "Changes requested"; log(inv, "Changes requested", f.note);
          const c = L.clientById[inv.client_id];
          L.state.emails.unshift({ id: L.nextId("EM", L.state.emails), mailbox: inv.prepared_by, folder: "inbox", from: { name: company().founder.name, email: company().founder.email }, to: [{ name: L.personById[inv.prepared_by].name, email: L.personById[inv.prepared_by].email }], subject: `Changes needed: ${L.fullName(c)} — ${L.monthLabel(inv.period)} invoice`, date: `${L.TODAY}T${new Date().toTimeString().slice(0, 8)}`, body: f.note, related: { type: "invoice", id: inv.id }, read: false });
          await L.save("invoices", "emails");
        } });
    },
    "inv-send": async (el) => {
      const inv = invById(el.dataset.id), c = L.clientById[inv.client_id];
      if (!confirm(`Send to ${c.billing.email}? This assigns the invoice number and tax point and cannot be undone. Corrections after this need a credit note.`)) return;
      Object.assign(inv, { number: nextNumber(company().invoice_prefix, "invoice"), status: "Sent", issue_date: L.TODAY, tax_point: L.TODAY, sent_date: L.TODAY, due_date: L.addDays(L.TODAY, company().payment_terms_days) });
      log(inv, "Sent to client", c.billing.email);
      const t = L.invTotals(inv);
      L.sendEmail({ mailbox: inv.prepared_by, to: { name: `${c.billing.company} Accounts`, email: c.billing.email }, subject: `Invoice ${inv.number} from LOUD — ${L.monthLabel(inv.period)}`, related: { type: "invoice", id: inv.id },
        body: `Dear Accounts team,\n\nPlease find attached invoice ${inv.number} for ${L.monthLabel(inv.period)}: ${L.gbp(t.gross)} including VAT, due by ${L.fmtLong(inv.due_date)}.${inv.po_number ? ` PO: ${inv.po_number}.` : ""}\n\nThe invoice includes a breakdown of the work completed for ${L.fullName(c)} this month.\n\nKind regards,\n${L.personById[inv.prepared_by].name}\nLOUD Personal Branding Ltd` });
      await L.save("invoices", "emails"); L.toast(`${inv.number} sent`); L.render();
    },
    "inv-pay": (el) => {
      const inv = invById(el.dataset.id), t = L.invTotals(inv);
      L.openForm({ title: `Record payment: ${inv.number}`, intro: `Amount due: ${L.gbp(t.gross)}`, fields: [
        { name: "date", label: "Date received", type: "date", value: L.TODAY, required: true },
        { name: "amount", label: "Amount received (£)", type: "number", step: "0.01", value: t.gross.toFixed(2), required: true },
        { name: "method", label: "Method", type: "select", options: ["BACS", "Faster Payments", "Card", "Cheque"], value: "BACS" },
        { name: "ref", label: "Bank reference", value: "" }],
        onSave: async (f) => {
          if (Math.abs(+f.amount - t.gross) > 0.009) return L.toast("Part payments aren't supported. Record the full amount, or issue a credit note for the difference.", true);
          Object.assign(inv, { status: "Paid", paid_date: f.date, payment_method: f.method, payment_ref: f.ref }); log(inv, "Payment recorded", `${f.method} ${f.ref}`.trim());
          await L.save("invoices");
        } });
    },
    "inv-remind": async (el) => {
      const inv = invById(el.dataset.id), c = L.clientById[inv.client_id], t = L.invTotals(inv);
      const late = L.daysFrom(inv.due_date, L.TODAY);
      L.sendEmail({ mailbox: inv.prepared_by, to: { name: `${c.billing.company} Accounts`, email: c.billing.email }, subject: `Payment reminder: invoice ${inv.number}`, related: { type: "invoice", id: inv.id },
        body: `Dear Accounts team,\n\nA friendly reminder that invoice ${inv.number} for ${L.gbp(t.gross)} ${late > 0 ? `was due on ${L.fmtLong(inv.due_date)} and is now ${late} days overdue` : `is due on ${L.fmtLong(inv.due_date)}`}.${inv.po_number ? ` PO: ${inv.po_number}.` : ""}\n\nBank details are on the invoice. Please let me know if anything is holding up payment.\n\nKind regards,\n${L.personById[inv.prepared_by].name}` });
      log(inv, "Payment reminder sent");
      await L.save("invoices", "emails"); L.toast("Reminder sent"); L.render();
    },
    "inv-credit": async (el) => {
      const inv = invById(el.dataset.id);
      if (!confirm(`Issue a full credit note against ${inv.number}? This cancels the invoice for VAT purposes.`)) return;
      const cn = { ...JSON.parse(JSON.stringify(inv)), id: L.nextId("I", L.state.invoices), type: "credit_note", number: nextNumber("CN", "credit_note"), issue_date: L.TODAY, tax_point: L.TODAY, due_date: L.TODAY, status: "Issued", credit_for: inv.id, work_item_ids: [], sent_date: L.TODAY, paid_date: null, history: [] };
      cn.lines = cn.lines.map((l) => ({ ...l, description: `Credit: ${l.description}` }));
      log(cn, "Credit note issued", `Against ${inv.number}`);
      inv.status = "Credited"; log(inv, "Cancelled by credit note", cn.number);
      L.state.worklog.forEach((w) => { if (w.invoice_id === inv.id) w.invoice_id = null; });
      L.state.invoices.push(cn);
      await L.save("invoices", "worklog");
      location.hash = `#/invoice/${cn.id}`;
    },
  });
  L.changeHandlers.push((t) => { if (!t.dataset.if) return false; L.ui.inv[t.dataset.if] = t.value; L.render(); return true; });

  // ================================================================ FINANCE
  L.views.finance = (tab = "overview", arg) => {
    const fy = F.financialYear(company(), L.TODAY);
    const tabs = L.tabs([["overview", "Overview"], ["vat", "VAT returns"], ["sales", "Sales ledger"], ["purchases", "Expenses"], ["debtors", "Aged debtors"], ["deadlines", "Deadlines"], ["settings", "Settings"]], tab, "#/finance");
    const body = { overview: finOverview, vat: finVat, sales: finSales, purchases: finPurchases, debtors: finDebtors, deadlines: finDeadlines, settings: finSettings }[tab] || finOverview;
    return `<div class="page-head"><div><h1>Finance & tax</h1><p>${esc(company().legal_name)} · ${fy.label} (${L.fmtLong(fy.start)} – ${L.fmtLong(fy.end)}) · VAT on the ${company().vat.accounting_basis === "cash" ? "cash accounting scheme" : "invoice (standard) basis"}</p></div></div>
      <div class="banner subtle small no-print">These are bookkeeping records and estimates to help you and your accountant. File VAT returns through MTD-compatible software or your accountant, and have them review corporation tax.</div>
      ${tabs}${body(fy, arg)}`;
  };

  function finOverview(fy) {
    const S = L.state, T = L.TODAY;
    const ytd = { start: fy.start, end: T };
    const pl = F.profitAndLoss(ytd, S.invoices, S.expenses);
    const monthsElapsed = Math.max(1, L.daysFrom(fy.start, T) / 30.44);
    const projProfit = (pl.taxable / monthsElapsed) * 12;
    const projCt = F.corporationTax(projProfit);
    const q = F.vatQuarters(company(), T, T)[0];
    const vq = F.vatReturn(q, S.invoices, S.expenses, company());
    const lastQ = F.vatQuarters(company(), L.addMonths(T, -3), T).find((x) => x.end < T && !S.vat_returns.some((r) => r.quarter === x.key));
    const owed = S.invoices.filter((i) => i.type === "invoice" && i.status === "Sent");
    const months = [];
    for (let m = fy.start; m <= T; m = L.addMonths(m, 1)) months.push(m.slice(0, 7));
    const rev = months.map((ym) => ({ label: L.monthLabel(ym), value: S.invoices.filter((i) => F.isIssued(i) && i.tax_point?.startsWith(ym)).reduce((s, i) => s + L.invTotals(i).net, 0) }));
    const next = F.deadlines(company(), T, S.vat_returns).filter((d) => d.date >= T && !d.done).slice(0, 5);
    return `
      <div class="grid kpis">
        ${L.kpi("Sales (net) · year to date", L.gbpK(pl.revenue), `${fy.label} so far`, "accent")}
        ${L.kpi("Costs · year to date", L.gbpK(pl.costs), `incl. ${L.gbp0(pl.disallowable)} disallowable`)}
        ${L.kpi("Profit before tax", L.gbpK(pl.profit), `margin ${Math.round((pl.profit / Math.max(1, pl.revenue)) * 100)}%`)}
        ${L.kpi("Corporation tax (est.)", L.gbpK(projCt.tax), `on a projected ${L.gbpK(projProfit)} full-year taxable profit · ${projCt.band}`)}
        ${L.kpi(`VAT to date · ${q.label}`, L.gbp0(vq.boxes[5]), `${vq.payable ? "payable" : "reclaimable"}; quarter still open`)}
        ${L.kpi("Owed by clients", L.gbp0(owed.reduce((s, i) => s + L.invTotals(i).gross, 0)), `${owed.length} invoices`)}
      </div>
      ${lastQ ? `<a class="banner warn" href="#/finance/vat/${lastQ.key}"><b>VAT return for ${lastQ.label} is due ${L.fmtLong(lastQ.due)}</b> (${L.daysFrom(T, lastQ.due)} days). Review and mark it filed <span class="aside">Open →</span></a>` : ""}
      <div class="grid half">
        <section class="card"><header><h2>Sales by month (net)</h2><span class="aside">by tax point</span></header>${L.barList(rev, { format: L.gbpK, tip: (r) => `${r.label}: ${L.gbp(r.value)} excl. VAT` })}</section>
        <section class="card"><header><h2>Costs by category</h2><span class="aside">year to date</span></header>${L.barList(Object.entries(pl.byCategory).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value), { format: L.gbpK, tip: (r) => `${r.label}: ${L.gbp(r.value)}` })}</section>
      </div>
      <div class="grid half" style="margin-top:16px">
        <section class="card"><header><h2>Profit & loss (year to date)</h2></header>
          <table><tbody><tr><td>Sales (excl. VAT)</td><td class="r num">${L.gbp(pl.revenue)}</td></tr><tr><td>Less: costs (excl. reclaimable VAT)</td><td class="r num">−${L.gbp(pl.costs)}</td></tr>
          <tr class="total"><td>Profit before tax</td><td class="r num">${L.gbp(pl.profit)}</td></tr><tr><td>Add back: disallowable (client entertainment)</td><td class="r num">${L.gbp(pl.disallowable)}</td></tr>
          <tr class="total"><td>Taxable profit (YTD, simplified)</td><td class="r num">${L.gbp(pl.taxable)}</td></tr><tr><td>Corporation tax on YTD profit</td><td class="r num">${L.gbp(pl.ct.tax)} <span class="small muted">${esc(pl.ct.band)}</span></td></tr></tbody></table>
          <p class="small muted">Simplified: ignores capital allowances, accruals and prepayments, and associated companies. Rates: 19% up to £50K, 25% from £250K, marginal relief in between.</p></section>
        <section class="card"><header><h2>Next deadlines</h2><a class="aside" href="#/finance/deadlines">All →</a></header>
          <ul class="list">${next.map((d) => `<li><span class="when">${L.fmtDate(d.date, { day: "numeric", month: "short", year: "2-digit" })}</span><div class="body"><div class="title">${esc(d.title)}</div><div class="small muted">${esc(d.detail)}</div></div>${L.badge(`${L.daysFrom(T, d.date)}d`, L.daysFrom(T, d.date) <= 14 ? "warn" : "")}</li>`).join("")}</ul></section>
      </div>`;
  }

  function finVat(fy, key) {
    const S = L.state, T = L.TODAY;
    const qs = F.vatQuarters(company(), fy.start, fy.end);
    const sel = qs.find((q) => q.key === key) || qs.filter((q) => q.end < T).at(-1) || qs[0];
    const filed = (q) => S.vat_returns.find((r) => r.quarter === q.key);
    const r = F.vatReturn(sel, S.invoices, S.expenses, company());
    const f = filed(sel);
    const boxes = f ? f.boxes : r.boxes;
    const unissued = S.invoices.filter((i) => OPEN.includes(i.status) && i.issue_date >= sel.start && i.issue_date <= sel.end);
    const noReceipt = r.purchRows.filter((e) => !e.receipt && e.vat > 0);
    const statusOf = (q) => { const fr = filed(q); if (fr) return L.badge(`Filed ${L.fmtDate(fr.filed_date)}`, "good", "✓"); if (q.end >= T) return L.badge("Open", "", "◷"); const d = L.daysFrom(T, q.due); return L.badge(d < 0 ? `Late by ${-d}d` : `Due in ${d}d`, d < 0 ? "crit" : "warn", d < 0 ? "▲" : "!"); };
    return `
      <section class="card"><header><h2>VAT quarters</h2><span class="aside">stagger: quarters ending ${company().vat.quarter_end_months.map((m) => new Date(2026, m - 1).toLocaleString("en-GB", { month: "short" })).join(", ")} · due 1 month + 7 days after</span></header>
        <div class="table-wrap"><table><thead><tr><th>Quarter</th><th>Period</th><th>Due</th><th class="r">Box 5</th><th>Status</th><th></th></tr></thead>
        <tbody>${qs.map((q) => { const b = filed(q)?.boxes || F.vatReturn(q, S.invoices, S.expenses, company()).boxes; return `<tr class="${q.key === sel.key ? "selected" : ""}"><td><b>${esc(q.label)}</b></td><td class="small">${L.fmtDate(q.start)} – ${L.fmtLong(q.end)}</td><td class="num">${L.fmtLong(q.due)}</td><td class="r num">${L.gbp(b[5])}</td><td>${statusOf(q)}</td><td><a class="btn small" href="#/finance/vat/${q.key}">View</a></td></tr>`; }).join("")}</tbody></table></div></section>
      <div class="grid two-col" style="margin-top:16px">
        <section class="card"><header><h2>VAT return: ${esc(sel.label)}</h2>${statusOf(sel)}</header>
          ${f ? `<div class="banner subtle small">Filed ${L.fmtLong(f.filed_date)} · reference ${esc(f.reference)}${f.paid_date ? ` · paid ${L.fmtLong(f.paid_date)}` : ""}. Figures below are the snapshot filed.</div>` : sel.end >= T ? `<div class="banner subtle small">Quarter still open. Figures so far.</div>` : ""}
          <table class="vat-boxes"><tbody>${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<tr class="${n === 5 ? "total" : ""}"><td class="num"><b>Box ${n}</b></td><td>${esc(F.VAT_BOX_LABELS[n])}</td><td class="r num">${n >= 6 ? L.gbp0(boxes[n]) : L.gbp(boxes[n])}</td></tr>`).join("")}</tbody></table>
          <p class="small muted">Box 5 ${r.payable ? "payable to" : "reclaimable from"} HMRC. Reverse-charge services from overseas suppliers are added to Boxes 1, 4, 6 and 7. Wages, PAYE/NI and other outside-scope costs are excluded from Box 7. Boxes 6–9 are in whole pounds.</p>
          <div class="row-actions">
            <button class="btn" data-act="vat-export" data-q="${sel.key}">Export CSV (boxes + transactions)</button>
            ${!f && sel.end < T ? `<button class="btn primary" data-act="vat-file" data-q="${sel.key}" ${L.isFounder() ? "" : "disabled title='Founder only'"}>Mark as filed with HMRC</button>` : ""}
          </div></section>
        <div class="stack">
          <section class="card"><header><h2>Pre-filing checks</h2></header>
            <ul class="list">
              <li>${unissued.length ? L.badge("Check", "warn", "!") : L.badge("OK", "good", "✓")}<div class="body">${unissued.length ? `${unissued.length} invoice${unissued.length > 1 ? "s" : ""} dated in this quarter not yet sent: ${unissued.map((i) => `<a href="#/invoice/${i.id}">${esc(L.fullName(L.clientById[i.client_id]))}</a>`).join(", ")}` : "All invoices in the period are issued"}</div></li>
              <li>${noReceipt.length ? L.badge("Check", "warn", "!") : L.badge("OK", "good", "✓")}<div class="body">${noReceipt.length ? `${noReceipt.length} expense${noReceipt.length > 1 ? "s" : ""} with VAT but no receipt. Keep a valid VAT invoice to reclaim.` : "Receipts held for all VAT reclaimed"}</div></li>
              <li>${L.badge("Info", "", "i")}<div class="body small">Sales: ${r.salesRows.length} invoices/credits. Purchases: ${r.purchRows.length} expenses. Keep records for at least 6 years.</div></li>
            </ul></section>
          <section class="card"><header><h2>Transactions</h2></header>
            <details class="table-view" open><summary>Sales (${r.salesRows.length})</summary><table><tbody>${r.salesRows.map((x) => `<tr><td class="nowrap">${esc(x.inv.number)}</td><td class="small">${esc(L.clientById[x.inv.client_id].company)}</td><td class="r num">${L.gbp(x.net)}</td><td class="r num">${L.gbp(x.vat)}</td></tr>`).join("")}</tbody></table></details>
            <details class="table-view"><summary>Purchases (${r.purchRows.length})</summary><table><tbody>${r.purchRows.map((e) => `<tr><td class="nowrap small">${L.fmtDate(e.date)}</td><td class="small">${esc(e.supplier)}</td><td class="small muted">${esc(e.vat_treatment)}</td><td class="r num">${L.gbp(e.net)}</td><td class="r num">${L.gbp(e.vat)}</td></tr>`).join("")}</tbody></table></details>
          </section>
        </div>
      </div>`;
  }

  function finSales() {
    const rows = L.state.invoices.filter(F.isIssued).sort((a, b) => b.tax_point.localeCompare(a.tax_point));
    const tot = rows.reduce((s, i) => { const t = L.invTotals(i); s.net += t.net; s.vat += t.vat; s.gross += t.gross; return s; }, { net: 0, vat: 0, gross: 0 });
    return `<section class="card"><header><h2>Sales ledger</h2><span class="aside">issued invoices and credit notes</span>
        <button class="btn small" data-act="export-sales">Export CSV</button><button class="btn small" data-act="export-xero">Export for Xero</button></header>
      <div class="table-wrap"><table><thead><tr><th>Number</th><th>Tax point</th><th>Customer</th><th class="r">Net</th><th class="r">VAT</th><th class="r">Gross</th><th>Status</th><th>Paid</th></tr></thead>
      <tbody>${rows.map((i) => { const t = L.invTotals(i), c = L.clientById[i.client_id]; return `<tr><td><a href="#/invoice/${i.id}">${esc(i.number)}</a></td><td class="num nowrap">${L.fmtLong(i.tax_point)}</td><td class="small">${esc(c.billing.company)}</td><td class="r num">${L.gbp(t.net)}</td><td class="r num">${L.gbp(t.vat)}</td><td class="r num">${L.gbp(t.gross)}</td><td>${L.invStatusBadge(L.invStatus(i))}</td><td class="num small">${i.paid_date ? L.fmtDate(i.paid_date) : ""}</td></tr>`; }).join("")}</tbody>
      <tfoot><tr class="total"><td colspan="3">Total</td><td class="r num">${L.gbp(tot.net)}</td><td class="r num">${L.gbp(tot.vat)}</td><td class="r num">${L.gbp(tot.gross)}</td><td colspan="2"></td></tr></tfoot></table></div></section>`;
  }

  function finPurchases() {
    const m = L.ui.fin.expMonth;
    const rows = L.state.expenses.filter((e) => !m || e.date.startsWith(m)).slice().sort((a, b) => b.date.localeCompare(a.date));
    const months = [...new Set(L.state.expenses.map((e) => e.date.slice(0, 7)))].sort().reverse();
    const sum = (k) => rows.reduce((s, e) => s + e[k], 0);
    return `<section class="card"><header><h2>Expenses & purchases</h2>
        <select data-xf="expMonth" aria-label="Month">${L.options(months.map((x) => [x, L.monthLabel(x)]), m, "All months")}</select>
        <button class="btn small" data-act="export-purchases">Export CSV</button><button class="btn small primary" data-act="add-expense">+ Add expense</button></header>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Supplier</th><th>Category</th><th>VAT treatment</th><th class="r">Net</th><th class="r">VAT</th><th>Reclaim</th><th>Receipt</th></tr></thead>
      <tbody>${rows.map((e) => `<tr><td class="num nowrap">${L.fmtDate(e.date)}</td><td><a href="#" data-act="edit-expense" data-id="${e.id}">${esc(e.supplier)}</a><div class="small muted">${esc(e.description)}</div></td><td class="small">${esc(e.category)}</td><td class="small">${esc((VAT_TREATMENTS.find((v) => v[0] === e.vat_treatment) || [, e.vat_treatment])[1])}</td><td class="r num">${L.gbp(e.net)}</td><td class="r num">${L.gbp(e.vat)}</td><td class="small">${e.vat_treatment === "reverse_charge" ? "RC" : e.reclaimable ? "Yes" : e.vat ? '<span class="warn-text">Blocked</span>' : "—"}${e.ct_deductible ? "" : ' · <span class="warn-text">not CT deductible</span>'}</td><td>${e.receipt ? "✓" : '<span class="crit-text">Missing</span>'}</td></tr>`).join("")}</tbody>
      <tfoot><tr class="total"><td colspan="4">Total</td><td class="r num">${L.gbp(sum("net"))}</td><td class="r num">${L.gbp(sum("vat"))}</td><td colspan="2"></td></tr></tfoot></table></div></section>`;
  }

  function finDebtors() {
    const b = F.aging(L.state.invoices, L.TODAY);
    const rows = L.state.invoices.filter((i) => i.type === "invoice" && i.status === "Sent").sort((a, b) => a.due_date.localeCompare(b.due_date));
    return `<div class="grid kpis">${Object.entries(b).map(([k, v]) => L.kpi(k === "Current" ? "Not yet due" : `${k} days overdue`, L.gbp0(v), "", k !== "Current" && v > 0 ? "warn-kpi" : "")).join("")}</div>
      <section class="card"><header><h2>Outstanding invoices</h2></header>
      <div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Due</th><th class="r">Days overdue</th><th class="r">Amount</th><th></th></tr></thead>
      <tbody>${rows.map((i) => { const late = L.daysFrom(i.due_date, L.TODAY); return `<tr><td><a href="#/invoice/${i.id}">${esc(i.number)}</a></td><td>${L.clientCell(L.clientById[i.client_id], L.clientById[i.client_id].billing.email)}</td><td class="num">${L.fmtLong(i.due_date)}</td><td class="r num ${late > 0 ? "crit-text" : ""}">${late > 0 ? late : "—"}</td><td class="r num">${L.gbp(L.invTotals(i).gross)}</td><td><button class="btn small" data-act="inv-remind" data-id="${i.id}">Remind</button> <button class="btn small" data-act="inv-pay" data-id="${i.id}">Paid</button></td></tr>`; }).join("") || `<tr><td colspan="6" class="empty">Nothing outstanding.</td></tr>`}</tbody></table></div></section>`;
  }

  function finDeadlines() {
    const T = L.TODAY;
    const list = F.deadlines(company(), T, L.state.vat_returns);
    return `<section class="card"><header><h2>Compliance calendar</h2><span class="aside">UK limited company · year end ${L.fmtDate("2026-" + company().financial_year_end, { day: "numeric", month: "long" })}</span></header>
      <ul class="list">${list.map((d) => { const days = L.daysFrom(T, d.date); return `<li><span class="when">${L.fmtDate(d.date, { day: "numeric", month: "short", year: "numeric" })}</span><div class="body"><div class="title">${esc(d.title)}</div><div class="small muted">${esc(d.kind)} · ${esc(d.detail)}</div></div>${d.done ? L.badge("Done", "good", "✓") : days < 0 ? L.badge("Past", "") : L.badge(`${days} days`, days <= 14 ? "warn" : "")}</li>`; }).join("")}</ul>
      <p class="small muted">Also keep in mind: payroll RTI submissions on or before each payday; P60s by 31 May; P11D by 6 July if benefits are provided; directors' Self Assessment by 31 January. Keep business records for at least 6 years.</p></section>`;
  }

  function finSettings() {
    const co = company();
    return `<div class="grid half"><section class="card"><header><h2>VAT accounting</h2></header>
        <label class="field"><span>Accounting basis</span><select data-act-change="vat-basis"><option value="invoice"${co.vat.accounting_basis === "invoice" ? " selected" : ""}>Standard (invoice basis): VAT due when invoiced</option><option value="cash"${co.vat.accounting_basis === "cash" ? " selected" : ""}>Cash accounting scheme: VAT due when paid</option></select></label>
        <p class="small muted">${esc(co.vat.notes)} Changing basis recalculates open quarters. Filed returns keep their snapshot.</p></section>
      <section class="card"><header><h2>Company details</h2></header>
        <dl class="dl"><dt>Legal name</dt><dd>${esc(co.legal_name)}</dd><dt>Company no.</dt><dd>${esc(co.company_number)}</dd><dt>VAT no.</dt><dd>${esc(co.vat_number)}</dd><dt>Registered office</dt><dd>${co.registered_office.map(esc).join(", ")}</dd><dt>Year end</dt><dd>${esc(co.financial_year_end)} (dd = ${co.financial_year_end.split("-")[1]})</dd><dt>Payment terms</dt><dd>${co.payment_terms_days} days</dd><dt>Founder / approver</dt><dd>${esc(co.founder.name)}</dd></dl>
        <p class="small muted">Edit <code>data/company.json</code> to change these.</p></section></div>`;
  }

  // ================================================================ finance actions & exports
  const ddmmyyyy = (s) => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "";
  const editExpense = (e) => {
    const isNew = !e;
    e = e || { date: L.TODAY, supplier: "", category: "Other", description: "", net: 0, vat: "", vat_treatment: "standard", reclaimable: true, ct_deductible: true, receipt: true, paid_by: "Business account" };
    L.openForm({
      title: isNew ? "Add expense" : "Edit expense",
      fields: [
        { name: "date", label: "Date", type: "date", value: e.date, required: true },
        { name: "supplier", label: "Supplier", value: e.supplier, required: true },
        { name: "description", label: "Description", value: e.description },
        { name: "category", label: "Category", type: "select", options: EXP_CATEGORIES, value: e.category },
        { name: "net", label: "Net amount (£, excl. VAT)", type: "number", step: "0.01", value: e.net, required: true },
        { name: "vat_treatment", label: "VAT treatment", type: "select", options: VAT_TREATMENTS, value: e.vat_treatment },
        { name: "vat", label: "VAT charged (£)", type: "number", step: "0.01", value: e.vat, help: "Leave blank to calculate 20% for standard-rated purchases" },
        { name: "reclaimable", label: "VAT reclaimable (untick for client entertainment)", type: "checkbox", value: e.reclaimable },
        { name: "ct_deductible", label: "Allowable for corporation tax", type: "checkbox", value: e.ct_deductible },
        { name: "receipt", label: "Receipt / VAT invoice held", type: "checkbox", value: e.receipt },
      ],
      onSave: (f) => {
        const net = +f.net;
        const vat = f.vat_treatment === "standard" ? (f.vat === "" ? F.r2(net * company().vat.standard_rate) : +f.vat) : 0;
        Object.assign(e, f, { net, vat, reclaimable: f.vat_treatment === "standard" && f.reclaimable });
        if (isNew) { e.id = L.nextId("E", L.state.expenses); L.state.expenses.push(e); }
        L.state.expenses.sort((a, b) => a.date.localeCompare(b.date));
        return L.save("expenses");
      },
      onDelete: isNew ? null : () => { L.state.expenses = L.state.expenses.filter((x) => x !== e); L.save("expenses"); },
    });
  };
  Object.assign(L.actions, {
    "add-expense": () => editExpense(),
    "edit-expense": (el) => editExpense(L.state.expenses.find((e) => e.id === el.dataset.id)),
    "vat-file": (el) => {
      const q = F.vatQuarters(company(), L.addMonths(L.TODAY, -15), L.TODAY).find((x) => x.key === el.dataset.q);
      const r = F.vatReturn(q, L.state.invoices, L.state.expenses, company());
      L.openForm({ title: `Mark VAT return filed: ${q.label}`, intro: `Box 5: ${L.gbp(r.boxes[5])} ${r.payable ? "payable" : "reclaimable"}. Record this after submitting through your MTD software or accountant.`, saveLabel: "Mark filed",
        fields: [{ name: "filed_date", label: "Date submitted", type: "date", value: L.TODAY, required: true }, { name: "reference", label: "HMRC submission reference", required: true }, { name: "paid_date", label: "Payment date (if paid)", type: "date", value: "" }],
        onSave: (f) => { L.state.vat_returns.push({ quarter: q.key, label: q.label, filed_by: L.me().id, ...f, boxes: r.boxes }); return L.save("vat_returns"); } });
    },
    "vat-export": (el) => {
      const q = F.vatQuarters(company(), L.addMonths(L.TODAY, -15), L.addMonths(L.TODAY, 6)).find((x) => x.key === el.dataset.q);
      const r = F.vatReturn(q, L.state.invoices, L.state.expenses, company());
      const rows = [["LOUD Personal Branding Ltd: VAT return", q.label, `${q.start} to ${q.end}`, `basis: ${company().vat.accounting_basis}`], [], ["Box", "Description", "Amount (GBP)"],
        ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [n, F.VAT_BOX_LABELS[n], r.boxes[n]]), [], ["SALES"], ["Number", "Tax point", "Customer", "Net", "VAT", "Gross", "Paid date"],
        ...r.salesRows.map((x) => [x.inv.number, x.inv.tax_point, L.clientById[x.inv.client_id].billing.company, x.net, x.vat, x.gross, x.inv.paid_date || ""]), [], ["PURCHASES"], ["Date", "Supplier", "Category", "VAT treatment", "Net", "VAT", "Reclaimable", "Receipt"],
        ...r.purchRows.map((e) => [e.date, e.supplier, e.category, e.vat_treatment, e.net, e.vat, e.reclaimable ? "Y" : "N", e.receipt ? "Y" : "N"])];
      L.download(`LOUD-VAT-${q.key}.csv`, L.csv(rows));
    },
    "export-sales": () => {
      const rows = [["Number", "Type", "Issue date", "Tax point", "Due date", "Client", "Customer", "Customer email", "PO", "Net", "VAT", "Gross", "Status", "Paid date", "Payment method", "Payment ref"],
        ...L.state.invoices.filter(F.isIssued).sort((a, b) => a.tax_point.localeCompare(b.tax_point)).map((i) => { const t = L.invTotals(i), c = L.clientById[i.client_id]; return [i.number, i.type, i.issue_date, i.tax_point, i.due_date, L.fullName(c), c.billing.company, c.billing.email, i.po_number || "", t.net, t.vat, t.gross, L.invStatus(i), i.paid_date || "", i.payment_method || "", i.payment_ref || ""]; })];
      L.download(`LOUD-sales-ledger-${L.TODAY}.csv`, L.csv(rows));
    },
    "export-xero": () => {
      const rows = [["*ContactName", "EmailAddress", "POAddressLine1", "POCity", "POPostalCode", "*InvoiceNumber", "Reference", "*InvoiceDate", "*DueDate", "*Description", "*Quantity", "*UnitAmount", "*AccountCode", "*TaxType", "Currency"]];
      for (const i of L.state.invoices.filter((x) => x.type === "invoice" && F.isIssued(x))) {
        const c = L.clientById[i.client_id];
        for (const l of i.lines) rows.push([c.billing.company, c.billing.email, c.billing.address[0], c.billing.address[1], c.billing.address[2], i.number, i.po_number || L.monthLabel(i.period), ddmmyyyy(i.tax_point), ddmmyyyy(i.due_date), l.description, l.qty, l.unit_price, "200", "20% (VAT on Income)", "GBP"]);
      }
      L.download(`LOUD-xero-sales-import-${L.TODAY}.csv`, L.csv(rows));
      L.toast("Exported. Check column names against your Xero import template.");
    },
    "export-purchases": () => {
      const rows = [["Date", "Supplier", "Description", "Category", "Net", "VAT", "VAT treatment", "VAT reclaimable", "CT deductible", "Receipt held", "Paid by"],
        ...L.state.expenses.map((e) => [e.date, e.supplier, e.description, e.category, e.net, e.vat, e.vat_treatment, e.reclaimable ? "Y" : "N", e.ct_deductible ? "Y" : "N", e.receipt ? "Y" : "N", e.paid_by])];
      L.download(`LOUD-expenses-${L.TODAY}.csv`, L.csv(rows));
    },
  });
  L.changeHandlers.push((t) => {
    if (t.dataset.xf) { L.ui.fin[t.dataset.xf] = t.value; L.render(); return true; }
    if (t.dataset.actChange === "vat-basis") { L.saveCompany({ vat: { ...company().vat, accounting_basis: t.value } }).then(L.render); return true; }
    return false;
  });
})();
