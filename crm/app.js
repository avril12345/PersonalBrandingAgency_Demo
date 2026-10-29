/* LOUD CRM — single-page app over window.LOUD_DATA (built by scripts/build-crm-data.js).
   Edits to posts, visibility items and notes persist in this browser's localStorage. */
(() => {
  "use strict";

  const SEED = window.LOUD_DATA;
  const STORE_KEY = "loud-crm-state-v1";
  const TODAY = SEED.today;
  const TIER_POSTS = { Volume: 8, Amplify: 10, Headline: 12 };
  const POST_STATUSES = ["Idea", "Drafted", "Client review", "Approved", "Published"];
  const POST_FORMATS = ["Text post", "Carousel", "Short video", "Poll", "Article", "Newsletter"];
  const VIS_TYPES = ["Speaking", "Podcast", "Media", "Award"];
  const VIS_STATUSES = ["Pitched", "In discussion", "Confirmed", "Completed", "Declined"];
  const NOTE_TYPES = ["Note", "Meeting", "Call", "Email", "Task"];

  // ---------------------------------------------------------------- state
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const seedState = () => ({ posts: clone(SEED.posts), visibility: clone(SEED.visibility), activity: clone(SEED.activity) });
  let state;
  try {
    state = JSON.parse(localStorage.getItem(STORE_KEY)) || seedState();
  } catch {
    state = seedState();
  }
  const save = () => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* storage unavailable: session-only */ }
  };
  const nextId = (prefix, items) =>
    `${prefix}-${String(Math.max(0, ...items.map((i) => +i.id.split("-")[1] || 0)) + 1).padStart(3, "0")}`;

  const clients = SEED.clients;
  const clientById = Object.fromEntries(clients.map((c) => [c.id, c]));
  const teamById = Object.fromEntries(SEED.team.map((t) => [t.id, t]));
  const leadOf = (c) => teamById[SEED.assignments[c.id]];
  const hist = (c) => SEED.metrics.history[c.id];
  const MONTHS = SEED.metrics.months;

  // ---------------------------------------------------------------- formatting
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  const n0 = (n) => Math.round(n).toLocaleString("en-US");
  const compact = (n) => (n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}K` : n0(n));
  const usd = (n) => `$${n0(n)}`;
  const usdK = (n) => `$${(n / 1000).toFixed(n % 1000 ? 1 : 0)}K`;
  const signed = (n, d = 1, unit = "%") => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(d)}${unit}`;
  const d = (s) => new Date(s + "T12:00:00");
  const fmtDate = (s, opts = { month: "short", day: "numeric" }) => d(s).toLocaleDateString("en-US", opts);
  const fmtLong = (s) => fmtDate(s, { month: "short", day: "numeric", year: "numeric" });
  const monthName = (s) => fmtDate(s, { month: "short" });
  const daysFrom = (a, b) => Math.round((d(b) - d(a)) / 864e5);
  const addDays = (s, n) => { const x = d(s); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const initials = (c) => c.first_name[0] + c.last_name[0];
  const fullName = (c) => `${c.first_name} ${c.last_name}`;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const slug = (s) => s.toLowerCase().replace(/[^a-z]+/g, "-");

  // ---------------------------------------------------------------- derived metrics
  const growth6 = (c) => { const h = hist(c); return ((h.at(-1).followers - h[0].followers) / h[0].followers) * 100; };

  // LOUD Score: 0–100 composite of reach, engagement, momentum, consistency, visibility.
  function loudScore(c) {
    const h = hist(c);
    const last = h.at(-1);
    const v = c.visibility_12m;
    const parts = [
      { key: "Reach", max: 25, val: clamp((25 * Math.log10(last.followers / 1000)) / Math.log10(50), 0, 25), hint: "Followers, log-scaled (50K = max)" },
      { key: "Engagement", max: 25, val: clamp((last.engagement_rate_pct / 5) * 25, 0, 25), hint: "Avg. engagement rate (5% = max)" },
      { key: "Momentum", max: 25, val: clamp((growth6(c) / 20) * 25, 0, 25), hint: "6-month follower growth (20% = max)" },
      { key: "Consistency", max: 15, val: clamp((last.posts / TIER_POSTS[c.engagement.tier]) * 15, 0, 15), hint: "Posts last month vs. tier plan" },
      { key: "Visibility", max: 10, val: clamp(((v.speaking_engagements + v.podcast_appearances + v.media_mentions * 0.5) / 14) * 10, 0, 10), hint: "Speaking, podcasts, media (12 mo)" },
    ];
    return { total: Math.round(parts.reduce((s, p) => s + p.val, 0)), parts };
  }
  function health(c) {
    if (c.engagement.status === "Onboarding") return { label: "Onboarding", cls: "", icon: "◌" };
    const s = loudScore(c).total;
    if (s >= 60) return { label: "On track", cls: "good", icon: "✓" };
    if (s >= 45) return { label: "Watch", cls: "warn", icon: "!" };
    return { label: "At risk", cls: "crit", icon: "▲" };
  }
  function renewalDate(c) {
    const start = d(c.engagement.start_date);
    const today = d(TODAY);
    const r = new Date(start);
    r.setFullYear(today.getFullYear());
    if (r <= today) r.setFullYear(r.getFullYear() + 1);
    return r.toISOString().slice(0, 10);
  }
  const postsFor = (id) => state.posts.filter((p) => p.client_id === id);
  const engagementOf = (p) => (p.results ? ((p.results.reactions + p.results.comments + p.results.reposts) / p.results.impressions) * 100 : 0);

  function attentionItems() {
    const items = [];
    for (const c of clients) {
      const days = daysFrom(TODAY, renewalDate(c));
      if (days <= 45) items.push({ c, sev: "warn", text: `Renewal in ${days} days (${fmtDate(renewalDate(c))}) — prep a results review` });
      const h = health(c);
      if (h.cls === "crit") items.push({ c, sev: "crit", text: `LOUD Score ${loudScore(c).total}: below 45` });
      const last = hist(c).at(-1);
      if (c.engagement.status === "Active" && last.posts < TIER_POSTS[c.engagement.tier] * 0.5)
        items.push({ c, sev: "warn", text: `Posting below plan: ${last.posts}/mo vs. ${TIER_POSTS[c.engagement.tier]} planned` });
      const stuck = postsFor(c.id).filter((p) => p.status === "Client review" && daysFrom(TODAY, p.date) <= 3);
      if (stuck.length) items.push({ c, sev: "crit", text: `${stuck.length} post${stuck.length > 1 ? "s" : ""} awaiting client approval, due within 3 days` });
    }
    return items.sort((a, b) => (a.sev === b.sev ? 0 : a.sev === "crit" ? -1 : 1));
  }

  // ---------------------------------------------------------------- UI atoms
  const badge = (text, cls = "", icon = "") => `<span class="badge ${cls}">${icon ? `<span aria-hidden="true">${icon}</span>` : ""}${esc(text)}</span>`;
  const healthBadge = (c) => { const h = health(c); return badge(h.label, h.cls, h.icon); };
  const scoreCell = (c) => {
    const s = loudScore(c).total;
    return `<span class="score"><b class="num">${s}</b><span class="score-track" aria-hidden="true"><span class="score-fill" style="width:${s}%"></span></span></span>`;
  };
  const clientCell = (c, sub = `${c.title} · ${c.company}`) =>
    `<span class="client-cell"><a href="#/client/${c.id}">${esc(fullName(c))}</a><span class="sub">${esc(sub)}</span></span>`;
  const kpi = (label, value, delta = "", cls = "") =>
    `<div class="card kpi ${cls}"><div class="label">${esc(label)}</div><div class="value num">${value}</div>${delta ? `<div class="delta">${delta}</div>` : ""}</div>`;
  const statusIcon = { Idea: "○", Drafted: "◔", "Client review": "◑", Approved: "◕", Published: "●" };
  const postStatusBadge = (s) => badge(s, s === "Published" ? "good" : s === "Client review" ? "warn" : s === "Approved" ? "cpg" : "", statusIcon[s]);
  const visStatusBadge = (s) =>
    badge(s, { Completed: "good", Confirmed: "cpg", "In discussion": "warn", Declined: "" }[s] ?? "", { Pitched: "○", "In discussion": "◑", Confirmed: "◕", Completed: "●", Declined: "×" }[s]);
  const options = (list, sel, all) =>
    (all ? `<option value="">${esc(all)}</option>` : "") +
    list.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}"${v === sel ? " selected" : ""}>${esc(l)}</option>`; }).join("");
  const clientOptions = () => clients.map((c) => [c.id, fullName(c)]);
  const teamOptions = () => SEED.team.map((t) => [t.id, t.name]);

  // ---------------------------------------------------------------- charts
  const after = [];
  let chartN = 0;

  function sparkline(values, w = 96, h = 28) {
    const min = Math.min(...values), max = Math.max(...values);
    const span = max - min || 1;
    const pts = values.map((v, i) => [2 + (i * (w - 6)) / (values.length - 1), h - 3 - ((v - min) / span) * (h - 6)]);
    const [lx, ly] = pts.at(-1);
    return `<svg class="sparkline" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts.map((p) => p.join(",")).join(" ")}"/><circle cx="${lx}" cy="${ly}" r="2.5"/></svg>`;
  }

  // Single-series line chart with crosshair + tooltip and a table view.
  function lineChart(points, { format = n0, label = "Value" } = {}) {
    const id = `chart-${++chartN}`;
    const W = 640, H = 240, m = { t: 16, r: 64, b: 28, l: 56 };
    const vals = points.map((p) => p.value);
    let min = Math.min(...vals), max = Math.max(...vals);
    const pad = (max - min) * 0.2 || Math.abs(max) * 0.1 || 1;
    min -= pad; max += pad;
    const x = (i) => m.l + (i * (W - m.l - m.r)) / Math.max(1, points.length - 1);
    const y = (v) => m.t + (1 - (v - min) / (max - min)) * (H - m.t - m.b);
    const ticks = [0, 1, 2, 3].map((i) => min + ((max - min) * i) / 3);
    const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
    const last = points.at(-1);
    after.push(() => {
      const el = document.getElementById(id);
      if (!el) return;
      const svg = el.querySelector("svg"), tip = el.querySelector(".chart-tip"), cross = el.querySelector(".crosshair"), hl = el.querySelector(".hl");
      const show = (evt) => {
        const r = svg.getBoundingClientRect();
        const vx = ((evt.clientX - r.left) / r.width) * W;
        const i = clamp(Math.round(((vx - m.l) / (W - m.l - m.r)) * (points.length - 1)), 0, points.length - 1);
        const px = x(i), py = y(points[i].value);
        cross.setAttribute("x1", px); cross.setAttribute("x2", px); cross.style.display = "";
        hl.setAttribute("cx", px); hl.setAttribute("cy", py); hl.style.display = "";
        tip.hidden = false;
        tip.innerHTML = `<b>${esc(points[i].label)}</b> · ${esc(label)}: ${esc(format(points[i].value))}`;
        tip.style.left = `${(px / W) * 100}%`;
        tip.style.top = `${(py / H) * r.height}px`;
      };
      const hide = () => { tip.hidden = true; cross.style.display = "none"; hl.style.display = "none"; };
      svg.addEventListener("pointermove", show);
      svg.addEventListener("pointerleave", hide);
    });
    return `<div class="chart" id="${id}">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)} by month, from ${esc(format(points[0].value))} to ${esc(format(last.value))}">
        ${ticks.map((t) => `<line class="gridline" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/><text class="axis-label" x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${esc(format(t))}</text>`).join("")}
        ${points.map((p, i) => `<text class="axis-label" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(p.label)}</text>`).join("")}
        <path class="line" d="${path}"/>
        ${points.map((p, i) => `<circle class="dot" cx="${x(i)}" cy="${y(p.value)}" r="4"/>`).join("")}
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
  }

  // Horizontal single-series bars (HTML), with hover tooltips.
  function barList(rows, { format = n0, tip = (r) => `${r.label}: ${format(r.value)}` } = {}) {
    const max = Math.max(...rows.map((r) => r.value), 0) || 1;
    return `<div class="bars">${rows
      .map(
        (r) => `<div class="bar-label">${r.href ? `<a href="${r.href}">${esc(r.label)}</a>` : esc(r.label)}</div>
        <div class="bar-track" data-tip="${esc(tip(r))}"><div class="bar" style="width:${Math.max(0, (r.value / max) * 100)}%"></div></div>
        <div class="bar-value">${esc(format(r.value))}</div>`
      )
      .join("")}</div>`;
  }

  // ---------------------------------------------------------------- dialog
  const dlg = document.getElementById("form-dialog");
  function openForm({ title, fields, onSave, onDelete }) {
    document.getElementById("dialog-title").textContent = title;
    document.getElementById("dialog-fields").innerHTML = fields
      .map((f) => {
        const v = f.value ?? "";
        const input =
          f.type === "select"
            ? `<select name="${f.name}" ${f.required ? "required" : ""}>${options(f.options, v)}</select>`
            : f.type === "textarea"
              ? `<textarea name="${f.name}" rows="3">${esc(v)}</textarea>`
              : `<input name="${f.name}" type="${f.type || "text"}" value="${esc(v)}" ${f.required ? "required" : ""}>`;
        return `<label>${esc(f.label)}${input}</label>`;
      })
      .join("");
    const del = document.getElementById("dialog-delete");
    del.hidden = !onDelete;
    del.onclick = () => { if (confirm("Delete this item?")) { onDelete(); dlg.close("deleted"); render(); } };
    dlg.onclose = () => {
      if (dlg.returnValue !== "save") return;
      const data = Object.fromEntries(new FormData(document.getElementById("dialog-form")));
      onSave(data);
      save();
      render();
    };
    dlg.returnValue = "";
    dlg.showModal();
  }

  function editPost(post) {
    const isNew = !post;
    post = post || { client_id: clients[0].id, date: TODAY, title: "", format: "Text post", status: "Idea", owner: "T1", pillar: "" };
    openForm({
      title: isNew ? "New post" : "Edit post",
      fields: [
        { name: "client_id", label: "Client", type: "select", options: clientOptions(), value: post.client_id },
        { name: "title", label: "Working title", value: post.title, required: true },
        { name: "date", label: "Publish date", type: "date", value: post.date, required: true },
        { name: "format", label: "Format", type: "select", options: POST_FORMATS, value: post.format },
        { name: "status", label: "Status", type: "select", options: POST_STATUSES, value: post.status },
        { name: "owner", label: "Owner", type: "select", options: teamOptions(), value: post.owner },
      ],
      onSave: (f) => {
        const c = clientById[f.client_id];
        Object.assign(post, f, {
          channel: f.format === "Newsletter" ? "Newsletter" : "LinkedIn",
          pillar: post.pillar && post.client_id === f.client_id ? post.pillar : c.content_pillars[0],
        });
        if (isNew) { post.id = nextId("P", state.posts); state.posts.push(post); }
        state.posts.sort((a, b) => a.date.localeCompare(b.date));
      },
      onDelete: isNew ? null : () => { state.posts = state.posts.filter((p) => p !== post); save(); },
    });
  }

  function editVisibility(item) {
    const isNew = !item;
    item = item || { client_id: clients[0].id, type: "Podcast", name: "", date: TODAY, status: "Pitched", owner: "T1", note: "" };
    openForm({
      title: isNew ? "New visibility opportunity" : "Edit opportunity",
      fields: [
        { name: "client_id", label: "Client", type: "select", options: clientOptions(), value: item.client_id },
        { name: "type", label: "Type", type: "select", options: VIS_TYPES, value: item.type },
        { name: "name", label: "Event / outlet", value: item.name, required: true },
        { name: "date", label: "Date", type: "date", value: item.date, required: true },
        { name: "status", label: "Status", type: "select", options: VIS_STATUSES, value: item.status },
        { name: "owner", label: "Owner", type: "select", options: teamOptions(), value: item.owner },
        { name: "note", label: "Notes", type: "textarea", value: item.note },
      ],
      onSave: (f) => {
        Object.assign(item, f);
        if (isNew) { item.id = nextId("V", state.visibility); state.visibility.push(item); }
        state.visibility.sort((a, b) => a.date.localeCompare(b.date));
      },
      onDelete: isNew ? null : () => { state.visibility = state.visibility.filter((v) => v !== item); save(); },
    });
  }

  // ---------------------------------------------------------------- views
  const ui = { sort: { key: "score", dir: -1 }, clientFilter: { q: "", seg: "", tier: "", status: "" }, content: { view: "board", client: "", owner: "", month: TODAY.slice(0, 7) }, perf: { client: clients[0].id, metric: "followers" }, vis: { client: "", type: "", status: "" } };

  function viewDashboard() {
    const active = clients.filter((c) => c.engagement.status !== "Churned");
    const mrr = active.reduce((s, c) => s + c.engagement.monthly_retainer_usd, 0);
    const first = clients.reduce((s, c) => s + hist(c)[0].followers, 0);
    const now = clients.reduce((s, c) => s + hist(c).at(-1).followers, 0);
    const avgEng = (i) => clients.reduce((s, c) => s + hist(c).at(i).engagement_rate_pct, 0) / clients.length;
    const month = TODAY.slice(0, 7);
    const monthPosts = state.posts.filter((p) => p.date.startsWith(month));
    const published = monthPosts.filter((p) => p.status === "Published").length;
    const upcomingVis = state.visibility.filter((v) => v.status === "Confirmed" && v.date >= TODAY);
    const onboarding = clients.filter((c) => c.engagement.status === "Onboarding").length;

    const rows = clients.map((c) => ({ c, score: loudScore(c).total, followers: hist(c).at(-1).followers, eng: hist(c).at(-1).engagement_rate_pct, growth: growth6(c), renewal: renewalDate(c), mrr: c.engagement.monthly_retainer_usd, name: fullName(c) }));
    const { key, dir } = ui.sort;
    rows.sort((a, b) => (typeof a[key] === "string" ? a[key].localeCompare(b[key]) : a[key] - b[key]) * dir);
    const th = (k, label, cls = "") => `<th class="sortable ${cls}" data-sort="${k}" aria-sort="${ui.sort.key === k ? (dir > 0 ? "ascending" : "descending") : "none"}">${label}${ui.sort.key === k ? (dir > 0 ? " ↑" : " ↓") : ""}</th>`;

    const dueSoon = state.posts.filter((p) => p.status !== "Published" && p.date >= TODAY && p.date <= addDays(TODAY, 7));
    const attention = attentionItems();
    const tiers = ["Headline", "Amplify", "Volume"].map((t) => ({ label: t, value: clients.filter((c) => c.engagement.tier === t).reduce((s, c) => s + c.engagement.monthly_retainer_usd, 0), count: clients.filter((c) => c.engagement.tier === t).length }));

    return `
      <div class="page-head"><div><h1>Agency dashboard</h1><p>${clients.length} clients · ${clients.filter((c) => c.is_cpg).length} in CPG · as of ${fmtLong(TODAY)}</p></div></div>
      <div class="grid kpis">
        ${kpi("Monthly recurring revenue", usdK(mrr), `${usd(mrr * 12)} annualized`, "accent")}
        ${kpi("Clients", clients.length, `${clients.length - onboarding} active · ${onboarding} onboarding`)}
        ${kpi("Combined LinkedIn audience", compact(now), `${signed(((now - first) / first) * 100)} since ${monthName(MONTHS[0])} (+${n0(now - first)})`)}
        ${kpi("Avg. engagement rate", `${avgEng(-1).toFixed(1)}%`, `${signed(avgEng(-1) - avgEng(0), 1, " pts")} since ${monthName(MONTHS[0])}`)}
        ${kpi(`Posts published · ${fmtDate(TODAY, { month: "long" })}`, published, `of ${monthPosts.length} planned this month`)}
        ${kpi("Confirmed placements ahead", upcomingVis.length, `next: ${upcomingVis[0] ? esc(fullName(clientById[upcomingVis[0].client_id])) + ", " + fmtDate(upcomingVis[0].date) : "—"}`)}
      </div>
      <div class="grid two-col">
        <section class="card">
          <header><h2>Client health</h2><span class="aside">LOUD Score = reach + engagement + momentum + consistency + visibility</span></header>
          <div class="table-wrap"><table>
            <thead><tr>${th("name", "Client")}${th("score", "LOUD Score")}<th>Health</th>${th("followers", "Followers", "r")}<th>6-mo trend</th>${th("eng", "Eng.", "r")}${th("growth", "Growth", "r")}${th("mrr", "Retainer", "r")}${th("renewal", "Renews")}</tr></thead>
            <tbody>${rows
              .map(
                (r) => `<tr>
                <td>${clientCell(r.c, `${r.c.engagement.tier} · ${leadOf(r.c).name.split(" ")[0]}${r.c.is_cpg ? " · CPG" : ""}`)}</td>
                <td>${scoreCell(r.c)}</td><td>${healthBadge(r.c)}</td>
                <td class="r num">${n0(r.followers)}</td>
                <td data-tip="${esc(`${n0(hist(r.c)[0].followers)} → ${n0(r.followers)} followers since ${monthName(MONTHS[0])}`)}">${sparkline(hist(r.c).map((h) => h.followers))}</td>
                <td class="r num">${r.eng.toFixed(1)}%</td><td class="r num">${signed(r.growth)}</td>
                <td class="r num">${usdK(r.mrr)}</td><td class="num">${fmtDate(r.renewal, { month: "short", day: "numeric", year: "2-digit" })}</td></tr>`
              )
              .join("")}</tbody>
          </table></div>
        </section>
        <div class="stack">
          <section class="card">
            <header><h2>Needs attention</h2><span class="aside">${attention.length} items</span></header>
            ${attention.length ? `<ul class="list">${attention.map((a) => `<li>${badge(a.sev === "crit" ? "Act" : "Watch", a.sev, a.sev === "crit" ? "▲" : "!")}<div class="body"><a class="title" href="#/client/${a.c.id}">${esc(fullName(a.c))}</a><div class="small muted">${esc(a.text)}</div></div></li>`).join("")}</ul>` : `<div class="empty">All clear.</div>`}
          </section>
          <section class="card">
            <header><h2>Due in the next 7 days</h2><a class="aside" href="#/content">Content calendar →</a></header>
            ${dueSoon.length ? `<ul class="list">${dueSoon.slice(0, 8).map((p) => `<li><span class="when">${fmtDate(p.date)}</span><div class="body"><div class="title">${esc(fullName(clientById[p.client_id]))}</div><div class="small muted">${esc(p.format)} · ${esc(p.title)}</div></div>${postStatusBadge(p.status)}</li>`).join("")}</ul>${dueSoon.length > 8 ? `<div class="small muted">+${dueSoon.length - 8} more</div>` : ""}` : `<div class="empty">Nothing due.</div>`}
          </section>
        </div>
      </div>
      <div class="grid half" style="margin-top:16px">
        <section class="card">
          <header><h2>Team workload</h2></header>
          <div class="table-wrap"><table><thead><tr><th>Team member</th><th class="r">Clients</th><th class="r">MRR</th><th class="r">Posts due (14d)</th><th class="r">Open pitches</th></tr></thead><tbody>
          ${SEED.team
            .map((t) => {
              const mine = clients.filter((c) => SEED.assignments[c.id] === t.id);
              const due = state.posts.filter((p) => p.owner === t.id && p.status !== "Published" && p.date >= TODAY && p.date <= addDays(TODAY, 14)).length;
              const pitches = state.visibility.filter((v) => v.owner === t.id && ["Pitched", "In discussion"].includes(v.status)).length;
              return `<tr><td class="client-cell"><b>${esc(t.name)}</b><span class="sub">${esc(t.role)}</span></td><td class="r num">${mine.length}</td><td class="r num">${usdK(mine.reduce((s, c) => s + c.engagement.monthly_retainer_usd, 0))}</td><td class="r num">${due}</td><td class="r num">${pitches}</td></tr>`;
            })
            .join("")}
          </tbody></table></div>
        </section>
        <section class="card">
          <header><h2>Revenue by tier</h2><span class="aside">monthly</span></header>
          ${barList(tiers, { format: usdK, tip: (r) => `${r.label}: ${usd(r.value)}/mo across ${r.count} client${r.count === 1 ? "" : "s"}` })}
        </section>
      </div>`;
  }

  function viewClients() {
    const f = ui.clientFilter;
    const list = clients.filter(
      (c) =>
        (!f.q || `${fullName(c)} ${c.company} ${c.title} ${c.industry}`.toLowerCase().includes(f.q.toLowerCase())) &&
        (!f.seg || (f.seg === "cpg") === c.is_cpg) &&
        (!f.tier || c.engagement.tier === f.tier) &&
        (!f.status || c.engagement.status === f.status)
    );
    return `
      <div class="page-head"><div><h1>Clients</h1><p>${list.length} of ${clients.length} shown</p></div></div>
      <div class="filters">
        <input type="search" placeholder="Search name, company, industry…" data-f="q" value="${esc(f.q)}" aria-label="Search clients">
        <select data-f="seg" aria-label="Segment">${options([["cpg", "CPG only"], ["other", "Non-CPG"]], f.seg, "All industries")}</select>
        <select data-f="tier" aria-label="Tier">${options(["Volume", "Amplify", "Headline"], f.tier, "All tiers")}</select>
        <select data-f="status" aria-label="Status">${options(["Active", "Onboarding"], f.status, "All statuses")}</select>
      </div>
      <div class="client-grid">${list
        .map((c) => {
          const last = hist(c).at(-1);
          return `<a class="card client-card" href="#/client/${c.id}">
            <div class="name">${esc(fullName(c))}</div>
            <div class="role">${esc(c.title)}, ${esc(c.company)}</div>
            <div class="small muted">${esc(c.industry)}</div>
            <div class="badges">${healthBadge(c)}${badge(c.engagement.tier, "tier")}${c.is_cpg ? badge("CPG", "cpg") : ""}${badge(leadOf(c).name)}</div>
            <div class="mini-stats">
              <div><div class="v num">${compact(last.followers)}</div><div class="l">Followers</div></div>
              <div><div class="v num">${last.engagement_rate_pct.toFixed(1)}%</div><div class="l">Engagement</div></div>
              <div><div class="v num">${loudScore(c).total}</div><div class="l">LOUD Score</div></div>
            </div></a>`;
        })
        .join("") || `<div class="empty">No clients match.</div>`}</div>`;
  }

  function viewClient(id) {
    const c = clientById[id];
    if (!c) return `<div class="card">Client not found. <a href="#/clients">Back to clients</a></div>`;
    const h = hist(c);
    const first = h[0], last = h.at(-1);
    const sc = loudScore(c);
    const posts = postsFor(id);
    const upcoming = posts.filter((p) => p.status !== "Published").slice(0, 8);
    const publishedPosts = posts.filter((p) => p.status === "Published");
    const vis = state.visibility.filter((v) => v.client_id === id);
    const notes = state.activity.filter((a) => a.client_id === id).sort((a, b) => b.date.localeCompare(a.date));
    const ch = c.other_channels, v12 = c.visibility_12m;

    return `
      <div class="page-head"><a href="#/clients" class="small muted">← All clients</a></div>
      <section class="card" style="margin-bottom:16px">
        <div class="hero">
          <div class="avatar" aria-hidden="true">${initials(c)}</div>
          <div class="who">
            <h1>${esc(fullName(c))}</h1>
            <p><b>${esc(c.title)}</b>, ${esc(c.company)} · ${esc(c.industry)}</p>
            <div class="chips" style="margin-top:8px">${healthBadge(c)}${badge(c.engagement.status)}${badge(c.engagement.tier + " tier", "tier")}${c.is_cpg ? badge("CPG", "cpg") : ""}${badge(c.seniority)}</div>
          </div>
          <div><div class="small muted">LOUD Score</div><div class="score-big num">${sc.total}</div></div>
        </div>
      </section>
      <div class="grid kpis">
        ${kpi("LinkedIn followers", n0(last.followers), `${signed(growth6(c))} since ${monthName(MONTHS[0])}`)}
        ${kpi("Engagement rate", `${last.engagement_rate_pct.toFixed(1)}%`, `${signed(last.engagement_rate_pct - first.engagement_rate_pct, 1, " pts")} since ${monthName(MONTHS[0])}`)}
        ${kpi("Avg. impressions / post", n0(last.avg_impressions_per_post), `${signed(((last.avg_impressions_per_post - first.avg_impressions_per_post) / first.avg_impressions_per_post) * 100)} since ${monthName(MONTHS[0])}`)}
        ${kpi("Posts last month", last.posts, `plan: ${TIER_POSTS[c.engagement.tier]}/mo`)}
        ${kpi("Social Selling Index", last.ssi_score, `${signed(last.ssi_score - first.ssi_score, 0, "")} since ${monthName(MONTHS[0])}`)}
      </div>
      <div class="grid two-col">
        <div class="stack">
          <section class="card"><header><h2>LinkedIn followers</h2><span class="aside">monthly snapshot</span></header>
            ${lineChart(h.map((s) => ({ label: monthName(s.month), value: s.followers })), { label: "Followers", format: n0 })}</section>
          <section class="card"><header><h2>Engagement rate</h2><span class="aside">avg. per post</span></header>
            ${lineChart(h.map((s) => ({ label: monthName(s.month), value: s.engagement_rate_pct })), { label: "Engagement", format: (v) => `${v.toFixed(1)}%` })}</section>
          <section class="card">
            <header><h2>Content pipeline</h2><span class="aside">${publishedPosts.length} published · ${posts.length - publishedPosts.length} in progress</span><button class="btn small" data-action="new-post" data-client="${c.id}">+ Post</button></header>
            ${upcoming.length ? `<ul class="list">${upcoming.map((p) => `<li><span class="when">${fmtDate(p.date)}</span><div class="body"><a href="#" class="title" data-edit-post="${p.id}">${esc(p.title)}</a><div class="small muted">${esc(p.format)} · ${esc(p.pillar)}</div></div>${postStatusBadge(p.status)}</li>`).join("")}</ul>` : `<div class="empty">No upcoming content.</div>`}
          </section>
          <section class="card">
            <header><h2>Activity log</h2></header>
            <form class="note-form" data-note-form="${c.id}">
              <select name="type" aria-label="Type">${options(NOTE_TYPES, "Note")}</select>
              <input name="summary" placeholder="Add a note, meeting summary or task…" required aria-label="Note">
              <button class="btn primary">Add</button>
            </form>
            <ul class="list">${notes.map((a) => `<li><span class="when">${fmtDate(a.date)}</span><div class="body"><div>${badge(a.type)} <span class="small muted">${esc(teamById[a.author]?.name || "")}</span></div><div>${esc(a.summary)}</div></div></li>`).join("")}</ul>
          </section>
        </div>
        <div class="stack">
          <section class="card"><header><h2>LOUD Score breakdown</h2></header>
            <div class="breakdown">${sc.parts.map((p) => `<div class="row" data-tip="${esc(p.hint)}"><span>${p.key}</span><span class="track"><span class="fill" style="display:block;width:${(p.val / p.max) * 100}%"></span></span><span class="num r">${p.val.toFixed(0)}/${p.max}</span></div>`).join("")}</div>
          </section>
          <section class="card"><header><h2>Engagement</h2></header>
            <dl class="dl">
              <dt>Account lead</dt><dd>${esc(leadOf(c).name)}</dd>
              <dt>Tier</dt><dd>${esc(c.engagement.tier)} · ${usd(c.engagement.monthly_retainer_usd)}/mo</dd>
              <dt>Client since</dt><dd>${fmtLong(c.engagement.start_date)}</dd>
              <dt>Next renewal</dt><dd>${fmtLong(renewalDate(c))} <span class="muted small">(${daysFrom(TODAY, renewalDate(c))} days)</span></dd>
              <dt>Lifetime value</dt><dd>${usd(Math.max(0, Math.round(daysFrom(c.engagement.start_date, TODAY) / 30.44)) * c.engagement.monthly_retainer_usd)}</dd>
            </dl></section>
          <section class="card"><header><h2>Profile</h2></header>
            <dl class="dl">
              <dt>Age</dt><dd>${c.age}</dd><dt>Location</dt><dd>${esc(c.location)}</dd>
              <dt>Time in role</dt><dd>${c.years_in_role} years</dd><dt>Experience</dt><dd>${c.years_experience} years</dd>
              <dt>Education</dt><dd>${esc(c.education)}</dd>
            </dl>
            <h3 style="margin:16px 0 8px">Career</h3>
            <ul class="list">${c.career_history.map((j) => `<li><span class="when">${esc(j.years)}</span><div class="body"><div class="title">${esc(j.role)}</div><div class="small muted">${esc(j.company)}</div></div></li>`).join("")}</ul>
            <h3 style="margin:16px 0 8px">Brand goals</h3><ul class="list">${c.brand_goals.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>
            <h3 style="margin:16px 0 8px">Content pillars</h3><div class="chips">${c.content_pillars.map((p) => `<span class="chip">${esc(p)}</span>`).join("")}</div>
            <h3 style="margin:16px 0 8px">Expertise</h3><div class="chips">${c.expertise.map((p) => `<span class="chip">${esc(p)}</span>`).join("")}</div>
          </section>
          <section class="card"><header><h2>Channels & visibility</h2><span class="aside">last 12 months</span></header>
            <dl class="dl">
              <dt>X / Twitter</dt><dd class="num">${n0(ch.x_followers)}</dd><dt>Instagram</dt><dd class="num">${n0(ch.instagram_followers)}</dd><dt>Newsletter</dt><dd class="num">${n0(ch.newsletter_subscribers)}</dd>
              <dt>Speaking</dt><dd class="num">${v12.speaking_engagements}</dd><dt>Podcasts</dt><dd class="num">${v12.podcast_appearances}</dd><dt>Media mentions</dt><dd class="num">${v12.media_mentions}</dd>
              <dt>Awards</dt><dd>${v12.awards.length ? v12.awards.map(esc).join("<br>") : "—"}</dd>
            </dl>
            <h3 style="margin:16px 0 8px">Opportunities</h3>
            ${vis.length ? `<ul class="list">${vis.map((v) => `<li><span class="when">${fmtDate(v.date)}</span><div class="body"><a href="#" class="title" data-edit-vis="${v.id}">${esc(v.name)}</a><div class="small muted">${esc(v.type)}</div></div>${visStatusBadge(v.status)}</li>`).join("")}</ul>` : `<div class="empty">None yet.</div>`}
            <button class="btn small" data-action="new-vis" style="margin-top:8px">+ Opportunity</button>
          </section>
        </div>
      </div>`;
  }

  function viewContent() {
    const f = ui.content;
    const posts = state.posts.filter((p) => (!f.client || p.client_id === f.client) && (!f.owner || p.owner === f.owner));
    const card = (p) => {
      const c = clientById[p.client_id];
      const overdue = p.status !== "Published" && p.status !== "Approved" && p.date <= addDays(TODAY, 2);
      return `<button class="post-card${overdue ? " overdue" : ""}" data-edit-post="${p.id}">
        <div class="meta"><span>${fmtDate(p.date)}${overdue ? " · due soon" : ""}</span><span>${esc(p.format)}</span></div>
        <div class="t">${esc(p.title)}</div>
        <div class="meta"><span class="who">${esc(fullName(c))}</span><span>${esc(teamById[p.owner]?.name.split(" ")[0] || "")}</span></div>
        ${p.results ? `<div class="meta" style="margin-top:4px"><span>${n0(p.results.impressions)} impr.</span><span>${engagementOf(p).toFixed(1)}% eng.</span></div>` : ""}
      </button>`;
    };

    let body;
    if (f.view === "board") {
      const recentCut = addDays(TODAY, -14);
      body = `<div class="board">${POST_STATUSES.map((s) => {
        let col = posts.filter((p) => p.status === s);
        const total = col.length;
        if (s === "Published") col = col.filter((p) => p.date >= recentCut).reverse();
        else col = col.slice(0, 12);
        return `<div class="column"><header><span>${statusIcon[s]} ${s}</span><span class="muted num">${total}</span></header>${col.map(card).join("") || `<div class="empty small">Empty</div>`}${total > col.length ? `<div class="small muted">${s === "Published" ? "Showing last 14 days" : `+${total - col.length} more — see Calendar view`}</div>` : ""}</div>`;
      }).join("")}</div>`;
    } else {
      const [y, m] = f.month.split("-").map(Number);
      const firstDow = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Monday-first
      const days = new Date(y, m, 0).getDate();
      const cells = [];
      for (let i = 0; i < firstDow; i++) cells.push(`<div class="day other"></div>`);
      for (let dd = 1; dd <= days; dd++) {
        const ds = `${f.month}-${String(dd).padStart(2, "0")}`;
        const dayPosts = posts.filter((p) => p.date === ds);
        cells.push(`<div class="day${ds === TODAY ? " today" : ""}"><span class="d">${dd}</span>${dayPosts
          .map((p) => { const c = clientById[p.client_id]; return `<button class="cal-chip s-${slug(p.status)}" data-edit-post="${p.id}" data-tip="${esc(`${fullName(c)} · ${p.format} · ${p.status}\n${p.title}`)}">${statusIcon[p.status]} ${initials(c)} · ${esc(p.format)}</button>`; })
          .join("")}</div>`);
      }
      while (cells.length % 7) cells.push(`<div class="day other"></div>`);
      const monthsAvail = [...new Set(state.posts.map((p) => p.date.slice(0, 7)))].sort();
      body = `<div class="filters"><select data-cf="month" aria-label="Month">${options(monthsAvail.map((mo) => [mo, fmtDate(mo + "-01", { month: "long", year: "numeric" })]), f.month)}</select></div>
        <div class="calendar">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => `<div class="dow">${w}</div>`).join("")}${cells.join("")}</div>
        <div class="legend">${POST_STATUSES.map((s) => `<span>${statusIcon[s]} ${s}</span>`).join("")}<span>Chips show client initials · format</span></div>`;
    }

    const counts = POST_STATUSES.map((s) => `${s}: ${posts.filter((p) => p.status === s).length}`).join(" · ");
    return `
      <div class="page-head"><div><h1>Content calendar</h1><p>${posts.length} posts · ${counts}</p></div>
        <div class="actions"><div class="seg" role="group" aria-label="View"><button data-view="board" class="${f.view === "board" ? "on" : ""}">Board</button><button data-view="calendar" class="${f.view === "calendar" ? "on" : ""}">Calendar</button></div>
        <button class="btn primary" data-action="new-post">+ New post</button></div></div>
      <div class="filters">
        <select data-cf="client" aria-label="Client">${options(clientOptions(), f.client, "All clients")}</select>
        <select data-cf="owner" aria-label="Owner">${options(teamOptions(), f.owner, "All owners")}</select>
      </div>
      ${body}`;
  }

  const METRICS = {
    followers: { label: "Followers", format: n0, pct: true },
    engagement_rate_pct: { label: "Engagement rate", format: (v) => `${v.toFixed(1)}%`, pct: false, unit: " pts" },
    avg_impressions_per_post: { label: "Impressions / post", format: n0, pct: true },
    profile_views_30d: { label: "Profile views (30d)", format: n0, pct: true },
    ssi_score: { label: "Social Selling Index", format: (v) => v.toFixed(0), pct: false, unit: "" },
    posts: { label: "Posts per month", format: (v) => v.toFixed(0), pct: false, unit: "" },
  };

  function viewPerformance() {
    const f = ui.perf;
    const c = clientById[f.client];
    const M = METRICS[f.metric];
    const change = (cl, k) => {
      const h = hist(cl), a = h[0][k], b = h.at(-1)[k];
      return METRICS[k].pct ? ((b - a) / a) * 100 : b - a;
    };
    const fmtChange = (v, k) => (METRICS[k].pct ? signed(v) : signed(v, k === "engagement_rate_pct" ? 1 : 0, METRICS[k].unit));
    const growthRows = clients.map((cl) => ({ label: fullName(cl), value: growth6(cl), href: `#/client/${cl.id}` })).sort((a, b) => b.value - a.value);
    const published = state.posts.filter((p) => p.status === "Published" && p.results).sort((a, b) => engagementOf(b) - engagementOf(a)).slice(0, 10);

    return `
      <div class="page-head"><div><h1>Performance</h1><p>Monthly snapshots ${monthName(MONTHS[0])}–${monthName(MONTHS.at(-1))} ${MONTHS.at(-1).slice(0, 4)}, measured against each client's ${monthName(MONTHS[0])} baseline</p></div></div>
      <div class="grid two-col">
        <section class="card">
          <header><h2>${esc(M.label)} · ${esc(fullName(c))}</h2></header>
          <div class="filters">
            <select data-pf="client" aria-label="Client">${options(clientOptions(), f.client)}</select>
            <select data-pf="metric" aria-label="Metric">${options(Object.entries(METRICS).map(([k, m]) => [k, m.label]), f.metric)}</select>
          </div>
          ${lineChart(hist(c).map((s) => ({ label: monthName(s.month), value: s[f.metric] })), { label: M.label, format: M.format })}
        </section>
        <section class="card">
          <header><h2>Follower growth</h2><span class="aside">${monthName(MONTHS[0])} → ${monthName(MONTHS.at(-1))}</span></header>
          ${barList(growthRows, { format: (v) => signed(v), tip: (r) => `${r.label}: ${signed(r.value)} followers in 6 months` })}
        </section>
      </div>
      <section class="card" style="margin-top:16px">
        <header><h2>Baseline vs. current</h2><span class="aside">${monthName(MONTHS[0])} baseline → ${monthName(MONTHS.at(-1))}</span></header>
        <div class="table-wrap"><table>
          <thead><tr><th>Client</th><th class="r">Followers</th><th class="r">Δ</th><th class="r">Engagement</th><th class="r">Δ</th><th class="r">Impr./post</th><th class="r">Δ</th><th class="r">SSI</th><th class="r">Δ</th><th>Health</th></tr></thead>
          <tbody>${clients
            .map((cl) => {
              const l = hist(cl).at(-1);
              return `<tr><td>${clientCell(cl)}</td>
                <td class="r num">${n0(l.followers)}</td><td class="r num">${fmtChange(change(cl, "followers"), "followers")}</td>
                <td class="r num">${l.engagement_rate_pct.toFixed(1)}%</td><td class="r num">${fmtChange(change(cl, "engagement_rate_pct"), "engagement_rate_pct")}</td>
                <td class="r num">${n0(l.avg_impressions_per_post)}</td><td class="r num">${fmtChange(change(cl, "avg_impressions_per_post"), "avg_impressions_per_post")}</td>
                <td class="r num">${l.ssi_score}</td><td class="r num">${fmtChange(change(cl, "ssi_score"), "ssi_score")}</td>
                <td>${healthBadge(cl)}</td></tr>`;
            })
            .join("")}</tbody>
        </table></div>
      </section>
      <section class="card" style="margin-top:16px">
        <header><h2>Top posts by engagement</h2><span class="aside">published posts, this period</span></header>
        <div class="table-wrap"><table>
          <thead><tr><th>Date</th><th>Client</th><th>Post</th><th class="r">Impressions</th><th class="r">Reactions</th><th class="r">Comments</th><th class="r">Eng.</th></tr></thead>
          <tbody>${published
            .map((p) => `<tr><td class="num">${fmtDate(p.date)}</td><td>${clientCell(clientById[p.client_id], clientById[p.client_id].company)}</td><td>${esc(p.title)}<div class="small muted">${esc(p.format)}</div></td><td class="r num">${n0(p.results.impressions)}</td><td class="r num">${n0(p.results.reactions)}</td><td class="r num">${n0(p.results.comments)}</td><td class="r num"><b>${engagementOf(p).toFixed(1)}%</b></td></tr>`)
            .join("")}</tbody>
        </table></div>
      </section>`;
  }

  function viewVisibility() {
    const f = ui.vis;
    const items = state.visibility.filter((v) => (!f.client || v.client_id === f.client) && (!f.type || v.type === f.type) && (!f.status || v.status === f.status));
    const all = state.visibility;
    const count = (s) => all.filter((v) => v.status === s).length;
    const upcomingConfirmed = all.filter((v) => v.status === "Confirmed" && v.date >= TODAY).length;
    const completed90 = all.filter((v) => v.status === "Completed" && v.date >= addDays(TODAY, -90)).length;
    const byType = VIS_TYPES.map((t) => ({ label: t, value: all.filter((v) => v.type === t && v.status !== "Declined").length }));
    return `
      <div class="page-head"><div><h1>Visibility tracker</h1><p>Speaking, podcasts, media and awards across all clients</p></div>
        <div class="actions"><button class="btn primary" data-action="new-vis">+ New opportunity</button></div></div>
      <div class="grid kpis">
        ${kpi("Confirmed, upcoming", upcomingConfirmed, "", "accent")}
        ${kpi("In discussion", count("In discussion"))}
        ${kpi("Pitched", count("Pitched"), "awaiting response")}
        ${kpi("Completed · last 90 days", completed90)}
        ${kpi("Win rate", `${Math.round(((count("Confirmed") + count("Completed")) / Math.max(1, count("Confirmed") + count("Completed") + count("Declined"))) * 100)}%`, "confirmed or completed vs. declined")}
      </div>
      <div class="grid two-col">
        <section class="card">
          <div class="filters">
            <select data-vf="client" aria-label="Client">${options(clientOptions(), f.client, "All clients")}</select>
            <select data-vf="type" aria-label="Type">${options(VIS_TYPES, f.type, "All types")}</select>
            <select data-vf="status" aria-label="Status">${options(VIS_STATUSES, f.status, "All statuses")}</select>
          </div>
          <div class="table-wrap"><table>
            <thead><tr><th>Date</th><th>Client</th><th>Type</th><th>Opportunity</th><th>Status</th><th>Owner</th></tr></thead>
            <tbody>${items
              .map((v) => { const c = clientById[v.client_id]; return `<tr><td class="num" style="white-space:nowrap">${fmtDate(v.date, { month: "short", day: "numeric", year: "2-digit" })}</td><td>${clientCell(c, c.company)}</td><td>${esc(v.type)}</td><td><a href="#" data-edit-vis="${v.id}"><b>${esc(v.name)}</b></a>${v.note ? `<div class="small muted">${esc(v.note)}</div>` : ""}</td><td><select data-vis-status="${v.id}" aria-label="Status">${options(VIS_STATUSES, v.status)}</select></td><td class="small">${esc(teamById[v.owner]?.name.split(" ")[0] || "")}</td></tr>`; })
              .join("") || `<tr><td colspan="6" class="empty">No opportunities match.</td></tr>`}</tbody>
          </table></div>
        </section>
        <section class="card">
          <header><h2>Active opportunities by type</h2></header>
          ${barList(byType, { tip: (r) => `${r.label}: ${r.value} (excluding declined)` })}
        </section>
      </div>`;
  }

  // ---------------------------------------------------------------- router & events
  const app = document.getElementById("app");
  function render() {
    const [route, arg] = (location.hash.replace(/^#\/?/, "") || "dashboard").split("/");
    after.length = 0;
    const views = { dashboard: viewDashboard, clients: viewClients, client: () => viewClient(arg), content: viewContent, performance: viewPerformance, visibility: viewVisibility };
    app.innerHTML = (views[route] || viewDashboard)();
    after.forEach((fn) => fn());
    document.querySelectorAll(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === (route === "client" ? "clients" : route)));
  }
  window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });

  app.addEventListener("click", (e) => {
    const t = e.target.closest("[data-sort],[data-view],[data-action],[data-edit-post],[data-edit-vis]");
    if (!t) return;
    if (t.dataset.sort) {
      const k = t.dataset.sort;
      ui.sort = { key: k, dir: ui.sort.key === k ? -ui.sort.dir : k === "name" || k === "renewal" ? 1 : -1 };
      return render();
    }
    if (t.dataset.view) { ui.content.view = t.dataset.view; return render(); }
    if (t.dataset.editPost) { e.preventDefault(); return editPost(state.posts.find((p) => p.id === t.dataset.editPost)); }
    if (t.dataset.editVis) { e.preventDefault(); return editVisibility(state.visibility.find((v) => v.id === t.dataset.editVis)); }
    if (t.dataset.action === "new-post") {
      editPost();
      const preset = t.dataset.client || ui.content.client;
      if (preset) dlg.querySelector('[name="client_id"]').value = preset;
    }
    if (t.dataset.action === "new-vis") {
      editVisibility();
      const m = location.hash.match(/client\/(LOUD-\d+)/);
      const preset = (m && m[1]) || ui.vis.client;
      if (preset) dlg.querySelector('[name="client_id"]').value = preset;
    }
  });

  app.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.f === "q") {
      ui.clientFilter.q = t.value;
      const pos = t.selectionStart;
      render();
      const s = app.querySelector('[data-f="q"]');
      s.focus(); s.setSelectionRange(pos, pos);
    }
  });
  app.addEventListener("change", (e) => {
    const t = e.target, ds = t.dataset;
    if (ds.f && ds.f !== "q") ui.clientFilter[ds.f] = t.value;
    else if (ds.cf) ui.content[ds.cf] = t.value;
    else if (ds.pf) ui.perf[ds.pf] = t.value;
    else if (ds.vf) ui.vis[ds.vf] = t.value;
    else if (ds.visStatus) { state.visibility.find((v) => v.id === ds.visStatus).status = t.value; save(); }
    else return;
    render();
  });
  app.addEventListener("submit", (e) => {
    const form = e.target.closest("[data-note-form]");
    if (!form) return;
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const cid = form.dataset.noteForm;
    state.activity.push({ id: nextId("A", state.activity), client_id: cid, date: TODAY, type: data.type, author: SEED.assignments[cid], summary: data.summary.trim() });
    save();
    render();
  });

  // Global hover tooltip for [data-tip]
  const tipEl = document.getElementById("tooltip");
  document.addEventListener("pointerover", (e) => {
    const t = e.target.closest("[data-tip]");
    if (!t) return (tipEl.hidden = true);
    tipEl.textContent = t.dataset.tip;
    tipEl.style.whiteSpace = "pre-line";
    tipEl.hidden = false;
  });
  document.addEventListener("pointermove", (e) => {
    if (tipEl.hidden) return;
    const x = Math.min(e.clientX + 12, window.innerWidth - tipEl.offsetWidth - 8);
    tipEl.style.left = `${x}px`;
    tipEl.style.top = `${e.clientY + 16}px`;
  });

  // Top bar tools
  document.getElementById("demo-date").textContent = `Demo date: ${fmtLong(TODAY)}`;
  const themeBtn = document.getElementById("theme-toggle");
  try { const th = localStorage.getItem("loud-theme"); if (th) document.documentElement.dataset.theme = th; } catch { /* ignore */ }
  themeBtn.addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("loud-theme", document.documentElement.dataset.theme); } catch { /* ignore */ }
  });
  document.getElementById("reset-btn").addEventListener("click", () => {
    if (!confirm("Reset all posts, opportunities and notes to the original demo data?")) return;
    state = seedState();
    try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
    render();
  });
  document.getElementById("export-btn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), ...state }, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "loud-crm-export.json" });
    a.click();
    URL.revokeObjectURL(a.href);
  });

  render();
})();
