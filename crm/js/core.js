/* LOUD CRM core: state, persistence, formatting, UI atoms, charts, dialogs. */
(() => {
  "use strict";
  const L = (window.L = { views: {}, actions: {}, after: [], ui: {}, changeHandlers: [], submitHandlers: [] });
  const F = window.LOUDFinance;
  L.F = F;

  // ---------------------------------------------------------------- state & persistence
  L.load = async () => {
    const res = await fetch("/api/state");
    if (!res.ok) throw new Error("Could not load data");
    const s = (L.state = await res.json());
    L.TODAY = s.today;
    L.clientById = Object.fromEntries(s.clients.map((c) => [c.id, c]));
    L.people = [{ id: "F1", ...s.company.founder }, ...s.team];
    L.personById = Object.fromEntries(L.people.map((p) => [p.id, p]));
  };
  L.save = async (...names) => {
    try {
      for (const n of names) {
        const res = await fetch(`/api/data/${n}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(L.state[n]) });
        if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      }
      L.toast("Saved");
    } catch (e) {
      L.toast(`Save failed: ${e.message}`, true);
    }
  };
  L.saveCompany = async (patch) => {
    Object.assign(L.state.company, patch);
    await fetch("/api/company", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    L.toast("Settings saved");
  };
  L.nextId = (prefix, items, width = 3) =>
    `${prefix}-${String(Math.max(0, ...items.map((i) => +String(i.id).split("-")[1] || 0)) + 1).padStart(width, "0")}`;

  // persona (who is using the app)
  L.me = () => L.personById[L.ui.persona] || L.people[0];
  L.isFounder = () => L.me().id === "F1";

  // ---------------------------------------------------------------- formatting
  L.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  L.n0 = (n) => Math.round(n).toLocaleString("en-GB");
  L.compact = (n) => (Math.abs(n) >= 10000 ? `${(n / 1000).toFixed(Math.abs(n) >= 100000 ? 0 : 1)}K` : L.n0(n));
  L.gbp = (n) => `${n < 0 ? "−" : ""}£${Math.abs(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  L.gbp0 = (n) => `${n < 0 ? "−" : ""}£${Math.round(Math.abs(n)).toLocaleString("en-GB")}`;
  L.gbpK = (n) => `£${(n / 1000).toFixed(Math.abs(n) >= 100000 ? 0 : 1)}K`;
  L.signed = (n, d = 1, unit = "%") => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(d)}${unit}`;
  L.d = (s) => new Date(s.slice(0, 10) + "T12:00:00");
  L.fmtDate = (s, opts = { day: "numeric", month: "short" }) => (s ? L.d(s).toLocaleDateString("en-GB", opts) : "—");
  L.fmtLong = (s) => L.fmtDate(s, { day: "numeric", month: "short", year: "numeric" });
  L.fmtDay = (s) => L.fmtDate(s, { weekday: "short", day: "numeric", month: "short" });
  L.monthName = (s) => L.fmtDate(s, { month: "short" });
  L.monthLabel = (ym) => L.fmtDate(ym + "-01", { month: "long", year: "numeric" });
  L.daysFrom = (a, b) => Math.round((L.d(b) - L.d(a)) / 864e5);
  L.addDays = F.addDays;
  L.addMonths = F.addMonths;
  L.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  L.fullName = (c) => `${c.first_name} ${c.last_name}`;
  L.initials = (p) => (p.first_name ? p.first_name[0] + p.last_name[0] : p.name.split(" ").map((x) => x[0]).join("").slice(0, 2));
  L.firstName = (id) => (L.personById[id]?.name || "").split(" ")[0];
  L.slug = (s) => s.toLowerCase().replace(/[^a-z]+/g, "-");

  // ---------------------------------------------------------------- derived client metrics
  L.TIER_POSTS = () => Object.fromEntries(Object.entries(L.state.company.service_tiers).map(([k, v]) => [k, v.posts_per_month]));
  L.hist = (c) => L.state.metrics.history[c.id];
  L.last6 = (c) => L.hist(c).slice(-6);
  L.baseline = (c) => L.hist(c).find((s) => s.month >= c.engagement.start_date.slice(0, 7) + "-01") || L.hist(c).at(-1);
  L.growth6 = (c) => { const h = L.last6(c); return ((h.at(-1).followers - h[0].followers) / h[0].followers) * 100; };
  L.loudScore = (c) => {
    const last = L.hist(c).at(-1), v = c.visibility_12m;
    const parts = [
      { key: "Reach", max: 25, val: L.clamp((25 * Math.log10(last.followers / 1000)) / Math.log10(50), 0, 25), hint: "Followers, log-scaled (50K = max)" },
      { key: "Engagement", max: 25, val: L.clamp((last.engagement_rate_pct / 5) * 25, 0, 25), hint: "Avg. engagement rate (5% = max)" },
      { key: "Momentum", max: 25, val: L.clamp((L.growth6(c) / 20) * 25, 0, 25), hint: "6-month follower growth (20% = max)" },
      { key: "Consistency", max: 15, val: L.clamp((last.posts / L.TIER_POSTS()[c.engagement.tier]) * 15, 0, 15), hint: "Posts last month vs. tier plan" },
      { key: "Visibility", max: 10, val: L.clamp(((v.speaking_engagements + v.podcast_appearances + v.media_mentions * 0.5) / 14) * 10, 0, 10), hint: "Speaking, podcasts, media (12 mo)" },
    ];
    return { total: Math.round(parts.reduce((s, p) => s + p.val, 0)), parts };
  };
  L.health = (c) => {
    if (c.engagement.status === "Onboarding") return { label: "Onboarding", cls: "", icon: "◌" };
    const s = L.loudScore(c).total;
    if (s >= 60) return { label: "On track", cls: "good", icon: "✓" };
    if (s >= 45) return { label: "Watch", cls: "warn", icon: "!" };
    return { label: "At risk", cls: "crit", icon: "▲" };
  };
  L.renewalDate = (c) => {
    const r = L.d(c.engagement.start_date), t = L.d(L.TODAY);
    r.setFullYear(t.getFullYear());
    if (r <= t) r.setFullYear(r.getFullYear() + 1);
    return r.toISOString().slice(0, 10);
  };
  L.leadOf = (c) => L.personById[L.state.assignments[c.id]];
  L.invStatus = (inv) => F.displayStatus(inv, L.TODAY);
  L.invTotals = (inv) => F.invoiceTotals(inv);
  L.invLabel = (inv) => inv.number || `Draft ${inv.id}`;

  // ---------------------------------------------------------------- UI atoms
  const esc = L.esc;
  L.badge = (text, cls = "", icon = "") => `<span class="badge ${cls}">${icon ? `<span aria-hidden="true">${icon}</span>` : ""}${esc(text)}</span>`;
  L.healthBadge = (c) => { const h = L.health(c); return L.badge(h.label, h.cls, h.icon); };
  L.scoreCell = (c) => { const s = L.loudScore(c).total; return `<span class="score"><b class="num">${s}</b><span class="score-track" aria-hidden="true"><span class="score-fill" style="width:${s}%"></span></span></span>`; };
  L.clientCell = (c, sub = `${c.title} · ${c.company}`) => `<span class="client-cell"><a href="#/client/${c.id}">${esc(L.fullName(c))}</a><span class="sub">${esc(sub)}</span></span>`;
  L.kpi = (label, value, delta = "", cls = "") => `<div class="card kpi ${cls}"><div class="label">${esc(label)}</div><div class="value num">${value}</div>${delta ? `<div class="delta">${delta}</div>` : ""}</div>`;
  L.statusIcon = { Idea: "○", Drafted: "◔", "Client review": "◑", Approved: "◕", Published: "●" };
  L.postStatusBadge = (s) => L.badge(s, s === "Published" ? "good" : s === "Client review" ? "warn" : s === "Approved" ? "cpg" : "", L.statusIcon[s]);
  L.visStatusBadge = (s) => L.badge(s, { Completed: "good", Confirmed: "cpg", "In discussion": "warn" }[s] ?? "", { Pitched: "○", "In discussion": "◑", Confirmed: "◕", Completed: "●", Declined: "×" }[s]);
  L.invStatusBadge = (s) => L.badge(s, { Paid: "good", Issued: "good", Sent: "cpg", Approved: "cpg", "Awaiting approval": "warn", "Changes requested": "warn", Overdue: "crit" }[s] ?? "", { Draft: "○", "Awaiting approval": "◑", "Changes requested": "↺", Approved: "◕", Sent: "→", Paid: "✓", Overdue: "▲", Issued: "✓", Credited: "⊘" }[s]);
  L.meetingStatusBadge = (s) => L.badge(s, { Completed: "good", Scheduled: "cpg", Cancelled: "" }[s] ?? "", { Completed: "✓", Scheduled: "◷", Cancelled: "×" }[s]);
  L.options = (list, sel, all) =>
    (all ? `<option value="">${esc(all)}</option>` : "") +
    list.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}"${String(v) === String(sel) ? " selected" : ""}>${esc(l)}</option>`; }).join("");
  L.clientOptions = () => L.state.clients.map((c) => [c.id, L.fullName(c)]);
  L.teamOptions = (withFounder = false) => (withFounder ? L.people : L.state.team).map((t) => [t.id, t.name]);
  L.tabs = (items, active, base) =>
    `<nav class="tabs" aria-label="Sections">${items.map(([k, label]) => `<a href="${base}/${k}" class="${k === active ? "on" : ""}">${label}</a>`).join("")}</nav>`;

  // ---------------------------------------------------------------- markdown (subset)
  L.md = (src) => {
    const inline = (s) => esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<i>$2</i>")
      .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\[(\d+)\]/g, '<sup class="cite">[$1]</sup>');
    const out = [];
    let list = null;
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
    for (const raw of String(src || "").split(/\r?\n/)) {
      const line = raw.trimEnd();
      let m;
      if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { close(); const lvl = Math.min(4, m[1].length + 1); out.push(`<h${lvl}>${inline(m[2])}</h${lvl}>`); }
      else if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) { if (list !== "ul") { close(); out.push("<ul>"); list = "ul"; } out.push(`<li>${inline(m[1])}</li>`); }
      else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { if (list !== "ol") { close(); out.push("<ol>"); list = "ol"; } out.push(`<li>${inline(m[1])}</li>`); }
      else if (!line.trim()) close();
      else { close(); out.push(`<p>${inline(line)}</p>`); }
    }
    close();
    return `<div class="prose">${out.join("")}</div>`;
  };

  // ---------------------------------------------------------------- charts
  let chartN = 0;
  L.sparkline = (values, w = 96, h = 28) => {
    const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    const pts = values.map((v, i) => [2 + (i * (w - 6)) / (values.length - 1), h - 3 - ((v - min) / span) * (h - 6)]);
    const [lx, ly] = pts.at(-1);
    return `<svg class="sparkline" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts.map((p) => p.join(",")).join(" ")}"/><circle cx="${lx}" cy="${ly}" r="2.5"/></svg>`;
  };

  // Single-series line chart with crosshair tooltip, optional event marker, and a table view.
  L.lineChart = (points, { format = L.n0, label = "Value", marker = null, every = 1 } = {}) => {
    const id = `chart-${++chartN}`;
    const W = 640, H = 240, m = { t: 20, r: 64, b: 28, l: 60 };
    const vals = points.map((p) => p.value);
    let min = Math.min(...vals), max = Math.max(...vals);
    const pad = (max - min) * 0.2 || Math.abs(max) * 0.1 || 1;
    min -= pad; max += pad;
    const x = (i) => m.l + (i * (W - m.l - m.r)) / Math.max(1, points.length - 1);
    const y = (v) => m.t + (1 - (v - min) / (max - min)) * (H - m.t - m.b);
    const ticks = [0, 1, 2, 3].map((i) => min + ((max - min) * i) / 3);
    const last = points.at(-1);
    L.after.push(() => {
      const el = document.getElementById(id);
      if (!el) return;
      const svg = el.querySelector("svg"), tip = el.querySelector(".chart-tip"), cross = el.querySelector(".crosshair"), hl = el.querySelector(".hl");
      svg.addEventListener("pointermove", (evt) => {
        const r = svg.getBoundingClientRect();
        const vx = ((evt.clientX - r.left) / r.width) * W;
        const i = L.clamp(Math.round(((vx - m.l) / (W - m.l - m.r)) * (points.length - 1)), 0, points.length - 1);
        const px = x(i), py = y(points[i].value);
        cross.setAttribute("x1", px); cross.setAttribute("x2", px); cross.style.display = "";
        hl.setAttribute("cx", px); hl.setAttribute("cy", py); hl.style.display = "";
        tip.hidden = false;
        tip.innerHTML = `<b>${esc(points[i].label)}</b> · ${esc(label)}: ${esc(format(points[i].value))}`;
        tip.style.left = `${(px / W) * 100}%`;
        tip.style.top = `${(py / H) * r.height}px`;
      });
      svg.addEventListener("pointerleave", () => { tip.hidden = true; cross.style.display = "none"; hl.style.display = "none"; });
    });
    const dots = points.length <= 12;
    return `<div class="chart" id="${id}">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}: ${esc(format(points[0].value))} to ${esc(format(last.value))}">
        ${ticks.map((t) => `<line class="gridline" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/><text class="axis-label" x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${esc(format(t))}</text>`).join("")}
        ${points.map((p, i) => (i % every === 0 || i === points.length - 1 ? `<text class="axis-label" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(p.label)}</text>` : "")).join("")}
        ${marker && marker.index >= 0 ? `<line class="marker-line" x1="${x(marker.index)}" x2="${x(marker.index)}" y1="${m.t - 6}" y2="${H - m.b}"/><text class="marker-label" x="${x(marker.index) + 6}" y="${m.t + 4}">${esc(marker.label)}</text>` : ""}
        <path class="line" d="${points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join("")}"/>
        ${dots ? points.map((p, i) => `<circle class="dot" cx="${x(i)}" cy="${y(p.value)}" r="4"/>`).join("") : `<circle class="dot" cx="${x(points.length - 1)}" cy="${y(last.value)}" r="4"/>`}
        <text class="direct-label" x="${x(points.length - 1) + 10}" y="${y(last.value) + 4}">${esc(format(last.value))}</text>
        <line class="crosshair" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" style="display:none"/>
        <circle class="dot hl" r="6" style="display:none"/>
        <rect class="hit" x="${m.l - 20}" y="0" width="${W - m.l - m.r + 40}" height="${H}"/>
      </svg>
      <div class="chart-tip" hidden></div>
      <details class="table-view"><summary>View as table</summary>
        <table><thead><tr><th>Month</th><th class="r">${esc(label)}</th></tr></thead>
        <tbody>${points.map((p) => `<tr><td>${esc(p.label)}</td><td class="r num">${esc(format(p.value))}</td></tr>`).join("")}</tbody></table>
      </details>
    </div>`;
  };

  L.barList = (rows, { format = L.n0, tip = (r) => `${r.label}: ${format(r.value)}` } = {}) => {
    const max = Math.max(...rows.map((r) => Math.abs(r.value)), 0) || 1;
    return `<div class="bars">${rows.map((r) => `<div class="bar-label">${r.href ? `<a href="${r.href}">${esc(r.label)}</a>` : esc(r.label)}</div>
      <div class="bar-track" data-tip="${esc(tip(r))}"><div class="bar" style="width:${Math.max(0, (Math.abs(r.value) / max) * 100)}%"></div></div>
      <div class="bar-value">${esc(format(r.value))}</div>`).join("")}</div>`;
  };

  // ---------------------------------------------------------------- dialog
  const dlg = () => document.getElementById("form-dialog");
  L.openForm = ({ title, fields, onSave, onDelete, saveLabel = "Save", intro = "" }) => {
    const D = dlg();
    document.getElementById("dialog-title").textContent = title;
    document.getElementById("dialog-fields").innerHTML = (intro ? `<p class="muted small" style="margin:0">${intro}</p>` : "") + fields.map((f) => {
      const v = f.value ?? "";
      if (f.type === "checkboxes") return `<fieldset class="checks"><legend>${esc(f.label)}</legend>${f.options.map(([val, lab]) => `<label class="check"><input type="checkbox" name="${f.name}" value="${esc(val)}"${(v || []).includes(val) ? " checked" : ""}> ${esc(lab)}</label>`).join("")}</fieldset>`;
      if (f.type === "checkbox") return `<label class="check"><input type="checkbox" name="${f.name}"${v ? " checked" : ""}> ${esc(f.label)}</label>`;
      const input = f.type === "select" ? `<select name="${f.name}" ${f.required ? "required" : ""}>${L.options(f.options, v)}</select>`
        : f.type === "textarea" ? `<textarea name="${f.name}" rows="${f.rows || 4}" ${f.required ? "required" : ""}>${esc(v)}</textarea>`
        : `<input name="${f.name}" type="${f.type || "text"}" value="${esc(v)}" ${f.step ? `step="${f.step}"` : ""} ${f.required ? "required" : ""} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ""}>`;
      return `<label>${esc(f.label)}${input}${f.help ? `<span class="help">${esc(f.help)}</span>` : ""}</label>`;
    }).join("");
    document.getElementById("dialog-save").textContent = saveLabel;
    const del = document.getElementById("dialog-delete");
    del.hidden = !onDelete;
    del.onclick = () => { if (confirm("Delete this item?")) { onDelete(); D.close("deleted"); L.render(); } };
    D.onclose = async () => {
      if (D.returnValue !== "save") return;
      const form = document.getElementById("dialog-form");
      const data = {};
      for (const f of fields) {
        if (f.type === "checkboxes") data[f.name] = [...form.querySelectorAll(`[name="${f.name}"]:checked`)].map((i) => i.value);
        else if (f.type === "checkbox") data[f.name] = form.querySelector(`[name="${f.name}"]`).checked;
        else data[f.name] = form.querySelector(`[name="${f.name}"]`).value;
      }
      await onSave(data);
      L.render();
    };
    D.returnValue = "";
    D.showModal();
    return D;
  };

  L.toast = (msg, bad = false) => {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.className = `toast show${bad ? " bad" : ""}`;
    clearTimeout(L._toast);
    L._toast = setTimeout(() => (t.className = "toast"), bad ? 5000 : 1800);
  };

  L.download = (filename, text, type = "text/csv") => {
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([text], { type })), download: filename });
    a.click();
    URL.revokeObjectURL(a.href);
  };
  L.csv = (rows) => rows.map((r) => r.map((v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(",")).join("\r\n") + "\r\n";

  // ---------------------------------------------------------------- shared mutations
  L.sendEmail = ({ mailbox, to, subject, body, related = null, from }) => {
    const p = L.personById[mailbox];
    L.state.emails.unshift({ id: L.nextId("EM", L.state.emails), mailbox, folder: "sent", from: from || { name: p.name, email: p.email }, to: [].concat(to), subject, date: `${L.TODAY}T${new Date().toTimeString().slice(0, 8)}`, body, related, read: true });
  };
  L.addWork = (item) => {
    const w = { id: L.nextId("W", L.state.worklog, 4), billing: "Retainer", amount: 0, invoice_id: null, hours: 1, ...item };
    L.state.worklog.push(w);
    return w;
  };
})();
