/* Dashboard, Clients, Client 360, Content, Visibility, Results. */
(() => {
  "use strict";
  const L = window.L, F = L.F, esc = L.esc;
  const POST_STATUSES = ["Idea", "Drafted", "Client review", "Approved", "Published"];
  const POST_FORMATS = ["Text post", "Carousel", "Short video", "Poll", "Article", "Newsletter"];
  const VIS_TYPES = ["Speaking", "Podcast", "Media", "Award"];
  const VIS_STATUSES = ["Pitched", "In discussion", "Confirmed", "Completed", "Declined"];
  const NOTE_TYPES = ["Note", "Call", "Email", "Task"];
  Object.assign(L.ui, {
    sort: { key: "score", dir: -1 },
    clientFilter: { q: "", seg: "", tier: "", status: "" },
    content: { view: "board", client: "", owner: "", month: null },
    vis: { client: "", type: "", status: "" },
    results: { metric: "followers" },
  });
  const postsFor = (id) => L.state.posts.filter((p) => p.client_id === id);
  const engagementOf = (p) => (p.results ? ((p.results.reactions + p.results.comments + p.results.reposts) / p.results.impressions) * 100 : 0);

  function attentionItems() {
    const items = [];
    const T = L.TODAY;
    for (const c of L.state.clients) {
      const days = L.daysFrom(T, L.renewalDate(c));
      if (days <= 45) items.push({ c, sev: "warn", text: `Renewal in ${days} days (${L.fmtDate(L.renewalDate(c))}) — prep a results report`, href: `#/results/${c.id}` });
      if (L.health(c).cls === "crit") items.push({ c, sev: "crit", text: `LOUD Score ${L.loudScore(c).total}: below 45` });
      const last = L.hist(c).at(-1), plan = L.TIER_POSTS()[c.engagement.tier];
      if (c.engagement.status === "Active" && last.posts < plan * 0.5) items.push({ c, sev: "warn", text: `Posting below plan: ${last.posts}/mo vs ${plan}` });
      const stuck = postsFor(c.id).filter((p) => p.status === "Client review" && L.daysFrom(T, p.date) <= 3);
      if (stuck.length) items.push({ c, sev: "crit", text: `${stuck.length} post${stuck.length > 1 ? "s" : ""} awaiting client approval, due within 3 days`, href: "#/content" });
      for (const inv of L.state.invoices.filter((i) => i.client_id === c.id && L.invStatus(i) === "Overdue"))
        items.push({ c, sev: "crit", text: `${inv.number} overdue by ${L.daysFrom(inv.due_date, T)} days (${L.gbp(L.invTotals(inv).gross)})`, href: `#/invoice/${inv.id}` });
      const openActions = L.state.meetings.filter((m) => m.client_id === c.id).flatMap((m) => m.actions.filter((a) => !a.done && a.due < T));
      if (openActions.length) items.push({ c, sev: "warn", text: `${openActions.length} meeting action${openActions.length > 1 ? "s" : ""} past due`, href: `#/client/${c.id}/meetings` });
    }
    return items.sort((a, b) => (a.sev === b.sev ? 0 : a.sev === "crit" ? -1 : 1));
  }

  // ================================================================ DASHBOARD
  L.views.dashboard = () => {
    const S = L.state, T = L.TODAY, clients = S.clients;
    const mrr = clients.reduce((s, c) => s + c.engagement.monthly_retainer_gbp, 0);
    const first = clients.reduce((s, c) => s + L.last6(c)[0].followers, 0);
    const now = clients.reduce((s, c) => s + L.hist(c).at(-1).followers, 0);
    const avgEng = (i) => clients.reduce((s, c) => s + L.last6(c).at(i).engagement_rate_pct, 0) / clients.length;
    const awaiting = S.invoices.filter((i) => i.status === "Awaiting approval");
    const outstanding = S.invoices.filter((i) => i.type === "invoice" && i.status === "Sent");
    const overdue = outstanding.filter((i) => L.invStatus(i) === "Overdue");
    const upcomingMeet = S.meetings.filter((m) => m.status === "Scheduled" && m.date >= T).slice(0, 6);
    const onboarding = clients.filter((c) => c.engagement.status === "Onboarding").length;
    const rows = clients.map((c) => ({ c, score: L.loudScore(c).total, followers: L.hist(c).at(-1).followers, eng: L.hist(c).at(-1).engagement_rate_pct, growth: L.growth6(c), renewal: L.renewalDate(c), mrr: c.engagement.monthly_retainer_gbp, name: L.fullName(c) }));
    const { key, dir } = L.ui.sort;
    rows.sort((a, b) => (typeof a[key] === "string" ? a[key].localeCompare(b[key]) : a[key] - b[key]) * dir);
    const th = (k, label, cls = "") => `<th class="sortable ${cls}" data-sort="${k}" aria-sort="${key === k ? (dir > 0 ? "ascending" : "descending") : "none"}">${label}${key === k ? (dir > 0 ? " ↑" : " ↓") : ""}</th>`;
    const attention = attentionItems();

    return `
      <div class="page-head"><div><h1>Good ${new Date().getHours() < 12 ? "morning" : "afternoon"}, ${esc(L.me().name.split(" ")[0])}</h1><p>${clients.length} clients · ${clients.filter((c) => c.is_cpg).length} in CPG · ${L.fmtLong(T)}</p></div>
        <div class="actions"><button class="btn" data-act="book-meeting">+ Book meeting</button></div></div>
      ${L.isFounder() && awaiting.length ? `<a class="banner" href="#/invoices/approval"><b>${awaiting.length} invoice${awaiting.length > 1 ? "s" : ""} awaiting your approval</b> · ${L.gbp(awaiting.reduce((s, i) => s + L.invTotals(i).gross, 0))} incl. VAT <span class="aside">Review →</span></a>` : ""}
      <div class="grid kpis">
        ${L.kpi("Monthly recurring revenue", L.gbpK(mrr), `${L.gbp0(mrr * 12)} a year, excl. VAT`, "accent")}
        ${L.kpi("Clients", clients.length, `${clients.length - onboarding} active · ${onboarding} onboarding`)}
        ${L.kpi("Outstanding invoices", L.gbpK(outstanding.reduce((s, i) => s + L.invTotals(i).gross, 0)), overdue.length ? `<span class="crit-text">▲ ${overdue.length} overdue</span>` : "none overdue")}
        ${L.kpi("Combined LinkedIn audience", L.compact(now), `${L.signed(((now - first) / first) * 100)} in 6 months`)}
        ${L.kpi("Avg. engagement rate", `${avgEng(-1).toFixed(1)}%`, `${L.signed(avgEng(-1) - avgEng(0), 1, " pts")} in 6 months`)}
        ${L.kpi("Meetings this week", S.meetings.filter((m) => m.date >= T && m.date <= L.addDays(T, 7) && m.status !== "Cancelled").length, upcomingMeet[0] ? `next: ${esc(L.fullName(L.clientById[upcomingMeet[0].client_id]))}, ${L.fmtDay(upcomingMeet[0].date)}` : "")}
      </div>
      <div class="grid two-col">
        <section class="card">
          <header><h2>Client health</h2><span class="aside">LOUD Score = reach + engagement + momentum + consistency + visibility</span></header>
          <div class="table-wrap"><table>
            <thead><tr>${th("name", "Client")}${th("score", "Score")}<th>Health</th>${th("followers", "Followers", "r")}<th>6-mo trend</th>${th("eng", "Eng.", "r")}${th("mrr", "Retainer", "r")}${th("renewal", "Renews")}</tr></thead>
            <tbody>${rows.map((r) => `<tr>
              <td>${L.clientCell(r.c, `${r.c.engagement.tier} · ${L.leadOf(r.c).name.split(" ")[0]}${r.c.is_cpg ? " · CPG" : ""}`)}</td>
              <td>${L.scoreCell(r.c)}</td><td>${L.healthBadge(r.c)}</td>
              <td class="r num">${L.n0(r.followers)}</td>
              <td data-tip="${esc(`${L.n0(L.last6(r.c)[0].followers)} → ${L.n0(r.followers)} followers in 6 months (${L.signed(r.growth)})`)}">${L.sparkline(L.last6(r.c).map((h) => h.followers))}</td>
              <td class="r num">${r.eng.toFixed(1)}%</td><td class="r num">${L.gbpK(r.mrr)}</td>
              <td class="num nowrap">${L.fmtDate(r.renewal, { day: "numeric", month: "short", year: "2-digit" })}</td></tr>`).join("")}</tbody>
          </table></div>
        </section>
        <div class="stack">
          <section class="card">
            <header><h2>Needs attention</h2><span class="aside">${attention.length} items</span></header>
            ${attention.length ? `<ul class="list">${attention.slice(0, 9).map((a) => `<li>${L.badge(a.sev === "crit" ? "Act" : "Watch", a.sev, a.sev === "crit" ? "▲" : "!")}<div class="body"><a class="title" href="${a.href || `#/client/${a.c.id}`}">${esc(L.fullName(a.c))}</a><div class="small muted">${esc(a.text)}</div></div></li>`).join("")}</ul>` : `<div class="empty">All clear.</div>`}
          </section>
          <section class="card">
            <header><h2>Upcoming meetings</h2><a class="aside" href="#/calendar">Calendar →</a></header>
            ${upcomingMeet.length ? `<ul class="list">${upcomingMeet.map((m) => `<li><span class="when">${L.fmtDay(m.date)}<br>${m.start}</span><div class="body"><a class="title" href="#/meeting/${m.id}">${esc(L.fullName(L.clientById[m.client_id]))}</a><div class="small muted">${esc(m.type)} · ${m.attendees.map(L.firstName).join(", ")}</div></div></li>`).join("")}</ul>` : `<div class="empty">Nothing booked.</div>`}
          </section>
        </div>
      </div>`;
  };

  // ================================================================ CLIENTS
  L.views.clients = () => {
    const f = L.ui.clientFilter;
    const list = L.state.clients.filter((c) =>
      (!f.q || `${L.fullName(c)} ${c.company} ${c.title} ${c.industry} ${c.location}`.toLowerCase().includes(f.q.toLowerCase())) &&
      (!f.seg || (f.seg === "cpg") === c.is_cpg) && (!f.tier || c.engagement.tier === f.tier) && (!f.status || c.engagement.status === f.status));
    return `
      <div class="page-head"><div><h1>Clients</h1><p>${list.length} of ${L.state.clients.length} shown</p></div></div>
      <div class="filters">
        <input type="search" placeholder="Search name, company, industry, city…" data-f="q" value="${esc(f.q)}" aria-label="Search clients">
        <select data-f="seg" aria-label="Segment">${L.options([["cpg", "CPG only"], ["other", "Non-CPG"]], f.seg, "All industries")}</select>
        <select data-f="tier" aria-label="Tier">${L.options(["Volume", "Amplify", "Headline"], f.tier, "All tiers")}</select>
        <select data-f="status" aria-label="Status">${L.options(["Active", "Onboarding"], f.status, "All statuses")}</select>
      </div>
      <div class="client-grid">${list.map((c) => {
        const last = L.hist(c).at(-1);
        return `<a class="card client-card" href="#/client/${c.id}">
          <div class="name">${esc(L.fullName(c))}</div>
          <div class="role">${esc(c.title)}, ${esc(c.company)}</div>
          <div class="small muted">${esc(c.industry)} · ${esc(c.location)}</div>
          <div class="badges">${L.healthBadge(c)}${L.badge(c.engagement.tier, "tier")}${c.is_cpg ? L.badge("CPG", "cpg") : ""}${L.badge(L.leadOf(c).name.split(" ")[0])}</div>
          <div class="mini-stats">
            <div><div class="v num">${L.compact(last.followers)}</div><div class="l">Followers</div></div>
            <div><div class="v num">${last.engagement_rate_pct.toFixed(1)}%</div><div class="l">Engagement</div></div>
            <div><div class="v num">${L.loudScore(c).total}</div><div class="l">LOUD Score</div></div>
          </div></a>`;
      }).join("") || `<div class="empty">No clients match.</div>`}</div>`;
  };

  // ================================================================ CLIENT 360
  L.views.client = (id, tab = "overview") => {
    const c = L.clientById[id];
    if (!c) return `<div class="card">Client not found. <a href="#/clients">Back to clients</a></div>`;
    const sc = L.loudScore(c);
    const head = `
      <div class="page-head"><a href="#/clients" class="small muted">← All clients</a></div>
      <section class="card" style="margin-bottom:16px">
        <div class="hero">
          <div class="avatar" aria-hidden="true">${L.initials(c)}</div>
          <div class="who">
            <h1>${esc(L.fullName(c))}</h1>
            <p><b>${esc(c.title)}</b>, ${esc(c.company)} · ${esc(c.industry)} · ${esc(c.location)}</p>
            <div class="chips" style="margin-top:8px">${L.healthBadge(c)}${L.badge(c.engagement.status)}${L.badge(c.engagement.tier + " tier", "tier")}${c.is_cpg ? L.badge("CPG", "cpg") : ""}${L.badge(c.seniority)}</div>
          </div>
          <div class="hero-actions"><button class="btn" data-act="book-meeting" data-client="${c.id}">+ Book meeting</button><a class="btn" href="#/results/${c.id}">Results report</a></div>
          <div><div class="small muted">LOUD Score</div><div class="score-big num">${sc.total}</div></div>
        </div>
      </section>
      ${L.tabs([["overview", "Overview"], ["meetings", "Meetings & research"], ["work", "Work log"], ["billing", "Billing"]], tab, `#/client/${c.id}`)}`;
    const body = { overview: clientOverview, meetings: clientMeetings, work: clientWork, billing: clientBilling }[tab] || clientOverview;
    return head + body(c, sc);
  };

  function clientOverview(c, sc) {
    const h = L.last6(c), first = h[0], last = h.at(-1);
    const posts = postsFor(c.id), upcoming = posts.filter((p) => p.status !== "Published").slice(0, 6);
    const vis = L.state.visibility.filter((v) => v.client_id === c.id);
    const notes = L.state.activity.filter((a) => a.client_id === c.id).sort((a, b) => b.date.localeCompare(a.date));
    const ch = c.other_channels, v12 = c.visibility_12m, ltv = L.state.invoices.filter((i) => i.client_id === c.id && F.isIssued(i)).reduce((s, i) => s + L.invTotals(i).net, 0);
    return `
      <div class="grid kpis">
        ${L.kpi("LinkedIn followers", L.n0(last.followers), `${L.signed(L.growth6(c))} in 6 months`)}
        ${L.kpi("Engagement rate", `${last.engagement_rate_pct.toFixed(1)}%`, `${L.signed(last.engagement_rate_pct - first.engagement_rate_pct, 1, " pts")} in 6 months`)}
        ${L.kpi("Monthly reach", L.compact(last.reach_30d), `${L.signed(((last.reach_30d - first.reach_30d) / Math.max(1, first.reach_30d)) * 100)} in 6 months`)}
        ${L.kpi("Posts last month", last.posts, `plan: ${L.TIER_POSTS()[c.engagement.tier]}/mo`)}
        ${L.kpi("Social Selling Index", last.ssi_score, `${L.signed(last.ssi_score - first.ssi_score, 0, "")} in 6 months`)}
      </div>
      <div class="grid two-col">
        <div class="stack">
          <section class="card"><header><h2>LinkedIn followers</h2><span class="aside">last 6 months</span></header>
            ${L.lineChart(h.map((s) => ({ label: L.monthName(s.month), value: s.followers })), { label: "Followers" })}</section>
          <section class="card">
            <header><h2>Content pipeline</h2><span class="aside">${posts.filter((p) => p.status === "Published").length} published · ${posts.filter((p) => p.status !== "Published").length} in progress</span><button class="btn small" data-act="new-post" data-client="${c.id}">+ Post</button></header>
            ${upcoming.length ? `<ul class="list">${upcoming.map((p) => `<li><span class="when">${L.fmtDate(p.date)}</span><div class="body"><a href="#" class="title" data-act="edit-post" data-id="${p.id}">${esc(p.title)}</a><div class="small muted">${esc(p.format)} · ${esc(p.pillar)}</div></div>${L.postStatusBadge(p.status)}</li>`).join("")}</ul>` : `<div class="empty">No upcoming content.</div>`}
          </section>
          <section class="card">
            <header><h2>Activity log</h2></header>
            <form class="note-form" data-note-form="${c.id}">
              <select name="type" aria-label="Type">${L.options(NOTE_TYPES, "Note")}</select>
              <input name="summary" placeholder="Add a note, call summary or task…" required aria-label="Note">
              <button class="btn primary">Add</button>
            </form>
            <ul class="list">${notes.map((a) => `<li><span class="when">${L.fmtDate(a.date)}</span><div class="body"><div>${L.badge(a.type)} <span class="small muted">${esc(L.personById[a.author]?.name || "")}</span></div><div>${esc(a.summary)}</div></div></li>`).join("")}</ul>
          </section>
        </div>
        <div class="stack">
          <section class="card"><header><h2>LOUD Score breakdown</h2></header>
            <div class="breakdown">${sc.parts.map((p) => `<div class="row" data-tip="${esc(p.hint)}"><span>${p.key}</span><span class="track"><span class="fill" style="width:${(p.val / p.max) * 100}%"></span></span><span class="num r">${p.val.toFixed(0)}/${p.max}</span></div>`).join("")}</div>
          </section>
          <section class="card"><header><h2>Engagement</h2></header>
            <dl class="dl">
              <dt>Account lead</dt><dd>${esc(L.leadOf(c).name)}</dd>
              <dt>Tier</dt><dd>${esc(c.engagement.tier)} · ${L.gbp0(c.engagement.monthly_retainer_gbp)}/mo + VAT</dd>
              <dt>Client since</dt><dd>${L.fmtLong(c.engagement.start_date)}</dd>
              <dt>Next renewal</dt><dd>${L.fmtLong(L.renewalDate(c))} <span class="muted small">(${L.daysFrom(L.TODAY, L.renewalDate(c))} days)</span></dd>
              <dt>Billed this FY</dt><dd>${L.gbp(ltv)} excl. VAT</dd>
              <dt>Email</dt><dd class="small">${esc(c.email)}</dd>
              <dt>Billing</dt><dd class="small">${esc(c.billing.company)}<br>${c.billing.address.map(esc).join(", ")}<br>${esc(c.billing.email)}</dd>
            </dl></section>
          <section class="card"><header><h2>Profile</h2></header>
            <dl class="dl">
              <dt>Age</dt><dd>${c.age}</dd><dt>Time in role</dt><dd>${c.years_in_role} years</dd><dt>Experience</dt><dd>${c.years_experience} years</dd>
              <dt>Education</dt><dd>${esc(c.education)}</dd><dt>Website</dt><dd class="small">${esc(c.website)}</dd>
            </dl>
            <h3 class="sub-h">Career</h3>
            <ul class="list">${c.career_history.map((j) => `<li><span class="when">${esc(j.years)}</span><div class="body"><div class="title">${esc(j.role)}</div><div class="small muted">${esc(j.company)}</div></div></li>`).join("")}</ul>
            <h3 class="sub-h">Brand goals</h3><ul class="list">${c.brand_goals.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>
            <h3 class="sub-h">Content pillars</h3><div class="chips">${c.content_pillars.map((p) => `<span class="chip">${esc(p)}</span>`).join("")}</div>
            <h3 class="sub-h">Expertise</h3><div class="chips">${c.expertise.map((p) => `<span class="chip">${esc(p)}</span>`).join("")}</div>
          </section>
          <section class="card"><header><h2>Channels & visibility</h2><span class="aside">last 12 months</span></header>
            <dl class="dl">
              <dt>X / Twitter</dt><dd class="num">${L.n0(ch.x_followers)}</dd><dt>Instagram</dt><dd class="num">${L.n0(ch.instagram_followers)}</dd><dt>Newsletter</dt><dd class="num">${L.n0(ch.newsletter_subscribers)}</dd>
              <dt>Speaking</dt><dd class="num">${v12.speaking_engagements}</dd><dt>Podcasts</dt><dd class="num">${v12.podcast_appearances}</dd><dt>Media mentions</dt><dd class="num">${v12.media_mentions}</dd>
              <dt>Awards</dt><dd>${v12.awards.length ? v12.awards.map(esc).join("<br>") : "—"}</dd>
            </dl>
            <h3 class="sub-h">Opportunities</h3>
            ${vis.length ? `<ul class="list">${vis.map((v) => `<li><span class="when">${L.fmtDate(v.date)}</span><div class="body"><a href="#" class="title" data-act="edit-vis" data-id="${v.id}">${esc(v.name)}</a><div class="small muted">${esc(v.type)}</div></div>${L.visStatusBadge(v.status)}</li>`).join("")}</ul>` : `<div class="empty">None yet.</div>`}
            <button class="btn small" data-act="new-vis" data-client="${c.id}" style="margin-top:8px">+ Opportunity</button>
          </section>
        </div>
      </div>`;
  }

  function clientMeetings(c) {
    const ms = L.state.meetings.filter((m) => m.client_id === c.id).sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
    const rs = L.state.research.filter((r) => r.client_id === c.id).sort((a, b) => b.created.localeCompare(a.created));
    const actions = ms.flatMap((m) => m.actions.map((a, i) => ({ ...a, m, i }))).filter((a) => !a.done);
    return `<div class="grid two-col">
      <section class="card"><header><h2>Meetings</h2><button class="btn small" data-act="book-meeting" data-client="${c.id}">+ Book meeting</button></header>
        ${L.meetingTable(ms, { client: false })}</section>
      <div class="stack">
        <section class="card"><header><h2>Research briefs</h2></header>
          ${rs.length ? `<ul class="list">${rs.map((r) => `<li><span class="when">${L.fmtDate(r.created)}</span><div class="body"><a class="title" href="#/research/${r.id}">Branding brief${r.meeting_id ? ` · ${esc(L.state.meetings.find((m) => m.id === r.meeting_id)?.type || "")}` : ""}</a><div class="small muted">${r.mode === "live" ? `Claude web research${r.crawled?.length ? " + Firecrawl" : ""}` : "Demo brief"}</div></div>${L.badge(r.mode === "live" ? "Live" : "Demo", r.mode === "live" ? "good" : "")}</li>`).join("")}</ul>` : `<div class="empty">No research yet. Open a completed meeting and run research.</div>`}
        </section>
        <section class="card"><header><h2>Open actions</h2><span class="aside">${actions.length}</span></header>
          ${actions.length ? `<ul class="list">${actions.map((a) => `<li><span class="when">${L.fmtDate(a.due)}</span><div class="body"><div class="${a.due < L.TODAY ? "crit-text" : ""}">${esc(a.text)}</div><div class="small muted">${esc(L.firstName(a.owner))} · from <a href="#/meeting/${a.m.id}">${esc(a.m.type)}</a></div></div></li>`).join("")}</ul>` : `<div class="empty">No open actions.</div>`}
        </section>
      </div></div>`;
  }

  function clientWork(c) {
    const items = L.state.worklog.filter((w) => w.client_id === c.id).sort((a, b) => b.date.localeCompare(a.date));
    const cats = {};
    for (const w of items) cats[w.category] = (cats[w.category] || 0) + 1;
    return `<div class="grid two-col">
      <section class="card"><header><h2>Work completed</h2><span class="aside">${items.length} items · ${L.n0(items.reduce((s, w) => s + (+w.hours || 0), 0))} hours</span><button class="btn small" data-act="log-work" data-client="${c.id}">+ Log work</button></header>
        ${L.workTable(items)}</section>
      <div class="stack"><section class="card"><header><h2>By category</h2></header>${L.barList(Object.entries(cats).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value), { tip: (r) => `${r.label}: ${r.value} items` })}</section>
      <section class="card"><header><h2>Results</h2></header><p class="muted small">Growth since ${esc(c.first_name)} joined LOUD, with all the work above, is in the results report.</p><a class="btn" href="#/results/${c.id}">Open results report →</a></section></div></div>`;
  }

  L.workTable = (items, { showClient = false, selectable = false, selected = [] } = {}) => items.length ? `<div class="table-wrap"><table>
    <thead><tr>${selectable ? "<th></th>" : ""}<th>Date</th>${showClient ? "<th>Client</th>" : ""}<th>Category</th><th>Work</th><th>By</th><th class="r">Hours</th><th>Billing</th></tr></thead>
    <tbody>${items.map((w) => `<tr>${selectable ? `<td><input type="checkbox" data-work-select="${w.id}"${selected.includes(w.id) ? " checked" : ""} aria-label="Include"></td>` : ""}<td class="num nowrap">${L.fmtDate(w.date)}</td>${showClient ? `<td>${esc(L.fullName(L.clientById[w.client_id]))}</td>` : ""}<td class="small">${esc(w.category)}</td><td>${esc(w.description)}</td><td class="small">${esc(L.firstName(w.by))}</td><td class="r num">${w.hours ?? ""}</td><td class="small nowrap">${w.billing === "Additional" ? `<b>${L.gbp0(w.amount)}</b>` : "Retainer"}${w.invoice_id ? ` · <a href="#/invoice/${w.invoice_id}">${esc(L.invLabel(L.state.invoices.find((i) => i.id === w.invoice_id) || {}))}</a>` : ` · <span class="warn-text">unbilled</span>`}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">No work logged.</div>`;

  function clientBilling(c) {
    const invs = L.state.invoices.filter((i) => i.client_id === c.id).sort((a, b) => b.issue_date.localeCompare(a.issue_date));
    const issued = invs.filter(F.isIssued);
    const owed = invs.filter((i) => i.type === "invoice" && i.status === "Sent").reduce((s, i) => s + L.invTotals(i).gross, 0);
    return `<div class="grid kpis">
        ${L.kpi("Billed this FY (net)", L.gbp0(issued.reduce((s, i) => s + L.invTotals(i).net, 0)))}
        ${L.kpi("Outstanding", L.gbp0(owed))}
        ${L.kpi("Retainer", `${L.gbp0(c.engagement.monthly_retainer_gbp)}`, `${c.engagement.tier} · per month + VAT`)}
      </div>
      <section class="card"><header><h2>Invoices & credit notes</h2></header>${L.invoiceTable(invs, { client: false })}</section>`;
  }

  // ================================================================ CONTENT
  L.views.content = () => {
    const f = L.ui.content;
    f.month = f.month || L.TODAY.slice(0, 7);
    const posts = L.state.posts.filter((p) => (!f.client || p.client_id === f.client) && (!f.owner || p.owner === f.owner));
    const card = (p) => {
      const c = L.clientById[p.client_id];
      const overdue = p.status !== "Published" && p.status !== "Approved" && p.date <= L.addDays(L.TODAY, 2);
      return `<button class="post-card${overdue ? " overdue" : ""}" data-act="edit-post" data-id="${p.id}">
        <div class="meta"><span>${L.fmtDate(p.date)}${overdue ? " · due soon" : ""}</span><span>${esc(p.format)}</span></div>
        <div class="t">${esc(p.title)}</div>
        <div class="meta"><span class="who">${esc(L.fullName(c))}</span><span>${esc(L.firstName(p.owner))}</span></div>
        ${p.results ? `<div class="meta" style="margin-top:4px"><span>${L.n0(p.results.impressions)} impr.</span><span>${engagementOf(p).toFixed(1)}% eng.</span></div>` : ""}
      </button>`;
    };
    let body;
    if (f.view === "board") {
      const recentCut = L.addDays(L.TODAY, -14);
      body = `<div class="board">${POST_STATUSES.map((s) => {
        let col = posts.filter((p) => p.status === s);
        const total = col.length;
        col = s === "Published" ? col.filter((p) => p.date >= recentCut).reverse() : col.slice(0, 12);
        return `<div class="column"><header><span>${L.statusIcon[s]} ${s}</span><span class="muted num">${total}</span></header>${col.map(card).join("") || `<div class="empty small">Empty</div>`}${total > col.length ? `<div class="small muted">${s === "Published" ? "Showing last 14 days" : `+${total - col.length} more in Calendar view`}</div>` : ""}</div>`;
      }).join("")}</div>`;
    } else {
      const [y, m] = f.month.split("-").map(Number);
      const firstDow = (new Date(y, m - 1, 1).getDay() + 6) % 7;
      const days = new Date(y, m, 0).getDate();
      const cells = [];
      for (let i = 0; i < firstDow; i++) cells.push(`<div class="day other"></div>`);
      for (let dd = 1; dd <= days; dd++) {
        const ds = `${f.month}-${String(dd).padStart(2, "0")}`;
        cells.push(`<div class="day${ds === L.TODAY ? " today" : ""}"><span class="d">${dd}</span>${posts.filter((p) => p.date === ds).map((p) => { const c = L.clientById[p.client_id]; return `<button class="cal-chip s-${L.slug(p.status)}" data-act="edit-post" data-id="${p.id}" data-tip="${esc(`${L.fullName(c)} · ${p.format} · ${p.status}\n${p.title}`)}">${L.statusIcon[p.status]} ${L.initials(c)} · ${esc(p.format)}</button>`; }).join("")}</div>`);
      }
      while (cells.length % 7) cells.push(`<div class="day other"></div>`);
      const months = [...new Set(L.state.posts.map((p) => p.date.slice(0, 7)))].sort();
      body = `<div class="filters"><select data-cf="month" aria-label="Month">${L.options(months.map((mo) => [mo, L.monthLabel(mo)]), f.month)}</select></div>
        <div class="calendar">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => `<div class="dow">${w}</div>`).join("")}${cells.join("")}</div>
        <div class="legend">${POST_STATUSES.map((s) => `<span>${L.statusIcon[s]} ${s}</span>`).join("")}<span>Chips show client initials · format</span></div>`;
    }
    return `
      <div class="page-head"><div><h1>Content calendar</h1><p>${posts.length} posts · ${POST_STATUSES.map((s) => `${s}: ${posts.filter((p) => p.status === s).length}`).join(" · ")}</p></div>
        <div class="actions"><div class="seg" role="group" aria-label="View"><button data-act="content-view" data-v="board" class="${f.view === "board" ? "on" : ""}">Board</button><button data-act="content-view" data-v="calendar" class="${f.view === "calendar" ? "on" : ""}">Calendar</button></div>
        <button class="btn primary" data-act="new-post">+ New post</button></div></div>
      <div class="filters">
        <select data-cf="client" aria-label="Client">${L.options(L.clientOptions(), f.client, "All clients")}</select>
        <select data-cf="owner" aria-label="Owner">${L.options(L.teamOptions(), f.owner, "All owners")}</select>
      </div>${body}`;
  };

  // ================================================================ VISIBILITY
  L.views.visibility = () => {
    const f = L.ui.vis, all = L.state.visibility;
    const items = all.filter((v) => (!f.client || v.client_id === f.client) && (!f.type || v.type === f.type) && (!f.status || v.status === f.status));
    const count = (s) => all.filter((v) => v.status === s).length;
    return `
      <div class="page-head"><div><h1>Visibility tracker</h1><p>Speaking, podcasts, media and awards across all clients</p></div>
        <div class="actions"><button class="btn primary" data-act="new-vis">+ New opportunity</button></div></div>
      <div class="grid kpis">
        ${L.kpi("Confirmed, upcoming", all.filter((v) => v.status === "Confirmed" && v.date >= L.TODAY).length, "", "accent")}
        ${L.kpi("In discussion", count("In discussion"))}
        ${L.kpi("Pitched", count("Pitched"), "awaiting response")}
        ${L.kpi("Completed · last 90 days", all.filter((v) => v.status === "Completed" && v.date >= L.addDays(L.TODAY, -90)).length)}
        ${L.kpi("Win rate", `${Math.round(((count("Confirmed") + count("Completed")) / Math.max(1, count("Confirmed") + count("Completed") + count("Declined"))) * 100)}%`, "confirmed or completed vs declined")}
      </div>
      <div class="grid two-col">
        <section class="card">
          <div class="filters">
            <select data-vf="client" aria-label="Client">${L.options(L.clientOptions(), f.client, "All clients")}</select>
            <select data-vf="type" aria-label="Type">${L.options(VIS_TYPES, f.type, "All types")}</select>
            <select data-vf="status" aria-label="Status">${L.options(VIS_STATUSES, f.status, "All statuses")}</select>
          </div>
          <div class="table-wrap"><table>
            <thead><tr><th>Date</th><th>Client</th><th>Type</th><th>Opportunity</th><th>Status</th><th>Owner</th></tr></thead>
            <tbody>${items.map((v) => { const c = L.clientById[v.client_id]; return `<tr><td class="num nowrap">${L.fmtDate(v.date, { day: "numeric", month: "short", year: "2-digit" })}</td><td>${L.clientCell(c, c.company)}</td><td>${esc(v.type)}</td><td><a href="#" data-act="edit-vis" data-id="${v.id}"><b>${esc(v.name)}</b></a>${v.note ? `<div class="small muted">${esc(v.note)}</div>` : ""}</td><td><select data-vis-status="${v.id}" aria-label="Status">${L.options(VIS_STATUSES, v.status)}</select></td><td class="small">${esc(L.firstName(v.owner))}</td></tr>`; }).join("") || `<tr><td colspan="6" class="empty">No opportunities match.</td></tr>`}</tbody>
          </table></div>
        </section>
        <section class="card"><header><h2>Active opportunities by type</h2></header>
          ${L.barList(VIS_TYPES.map((t) => ({ label: t, value: all.filter((v) => v.type === t && v.status !== "Declined").length })), { tip: (r) => `${r.label}: ${r.value} (excluding declined)` })}</section>
      </div>`;
  };

  // ================================================================ RESULTS
  const METRICS = {
    followers: { label: "Followers", format: L.n0, pct: true },
    engagement_rate_pct: { label: "Engagement rate", format: (v) => `${v.toFixed(1)}%`, pct: false, unit: " pts", d: 1 },
    reach_30d: { label: "Monthly reach (impressions)", format: L.n0, pct: true },
    avg_impressions_per_post: { label: "Impressions per post", format: L.n0, pct: true },
    profile_views_30d: { label: "Profile views (30 days)", format: L.n0, pct: true },
    ssi_score: { label: "Social Selling Index", format: (v) => v.toFixed(0), pct: false, unit: "", d: 0 },
  };
  const change = (c, k) => { const a = L.baseline(c)[k], b = L.hist(c).at(-1)[k]; return METRICS[k].pct ? ((b - a) / Math.max(1, a)) * 100 : b - a; };
  const fmtChange = (v, k) => (METRICS[k].pct ? L.signed(v) : L.signed(v, METRICS[k].d, METRICS[k].unit));

  L.views.results = (id) => (id ? resultsReport(id) : resultsPortfolio());

  function resultsPortfolio() {
    const S = L.state;
    const rows = S.clients.map((c) => ({ c, b: L.baseline(c), l: L.hist(c).at(-1), months: Math.max(0, Math.round(L.daysFrom(c.engagement.start_date, L.TODAY) / 30.44)) }));
    const top = S.posts.filter((p) => p.status === "Published" && p.results).sort((a, b) => engagementOf(b) - engagementOf(a)).slice(0, 8);
    return `
      <div class="page-head"><div><h1>Client results</h1><p>Growth since each client joined LOUD. Open a client for a printable results report.</p></div></div>
      <section class="card"><header><h2>Since joining LOUD</h2><span class="aside">baseline = month the engagement started</span></header>
        <div class="table-wrap"><table>
          <thead><tr><th>Client</th><th class="r">Months</th><th class="r">Followers</th><th class="r">Growth</th><th class="r">Engagement</th><th class="r">Δ</th><th class="r">Monthly reach</th><th class="r">Δ</th><th class="r">Work items</th><th></th></tr></thead>
          <tbody>${rows.map(({ c, l, months }) => `<tr><td>${L.clientCell(c)}</td><td class="r num">${months}</td>
            <td class="r num">${L.n0(l.followers)}</td><td class="r num"><b>${fmtChange(change(c, "followers"), "followers")}</b></td>
            <td class="r num">${l.engagement_rate_pct.toFixed(1)}%</td><td class="r num">${fmtChange(change(c, "engagement_rate_pct"), "engagement_rate_pct")}</td>
            <td class="r num">${L.compact(l.reach_30d)}</td><td class="r num">${fmtChange(change(c, "reach_30d"), "reach_30d")}</td>
            <td class="r num">${S.worklog.filter((w) => w.client_id === c.id).length}</td><td><a class="btn small" href="#/results/${c.id}">Report</a></td></tr>`).join("")}</tbody>
        </table></div></section>
      <div class="grid half" style="margin-top:16px">
        <section class="card"><header><h2>Follower growth since joining</h2></header>
          ${L.barList(rows.map(({ c }) => ({ label: L.fullName(c), value: change(c, "followers"), href: `#/results/${c.id}` })).sort((a, b) => b.value - a.value), { format: (v) => L.signed(v), tip: (r) => `${r.label}: ${L.signed(r.value)} followers since joining` })}</section>
        <section class="card"><header><h2>Top posts by engagement</h2></header>
          <ul class="list">${top.map((p) => `<li><span class="when">${L.fmtDate(p.date)}</span><div class="body"><div class="title">${esc(p.title)}</div><div class="small muted">${esc(L.fullName(L.clientById[p.client_id]))} · ${L.n0(p.results.impressions)} impressions</div></div><b class="num">${engagementOf(p).toFixed(1)}%</b></li>`).join("")}</ul></section>
      </div>`;
  }

  function resultsReport(id) {
    const c = L.clientById[id];
    if (!c) return `<div class="card">Client not found.</div>`;
    const H = L.hist(c), b = L.baseline(c), l = H.at(-1);
    const startIdx = H.findIndex((s) => s === b);
    const from = Math.max(0, startIdx - 3);
    const series = H.slice(from);
    const marker = { index: startIdx - from, label: "Joined LOUD" };
    const k = L.ui.results.metric;
    const work = L.state.worklog.filter((w) => w.client_id === c.id);
    const cats = {};
    for (const w of work) cats[w.category] = (cats[w.category] || 0) + 1;
    const published = work.filter((w) => w.category === "Content").reduce((s, w) => s + (+(w.description.match(/published (\d+)/) || [])[1] || 1), 0);
    const placements = L.state.visibility.filter((v) => v.client_id === c.id && ["Confirmed", "Completed"].includes(v.status));
    const months = Math.max(0, Math.round(L.daysFrom(c.engagement.start_date, L.TODAY) / 30.44));
    const stat = (label, key) => `<div class="result-stat"><div class="label">${label}</div><div class="value num">${METRICS[key].format(l[key])}</div><div class="delta"><b>${fmtChange(change(c, key), key)}</b> from ${METRICS[key].format(b[key])}</div></div>`;
    return `
      <div class="page-head no-print"><a href="#/results" class="small muted">← All results</a><div class="actions"><select data-rf="metric" aria-label="Chart metric">${L.options(Object.entries(METRICS).map(([key, m]) => [key, m.label]), k)}</select><button class="btn" data-act="print">Print / save PDF</button></div></div>
      <article class="card report">
        <header class="report-head"><div><div class="wordmark-sm">LOUD</div><h1>Results report: ${esc(L.fullName(c))}</h1><p class="muted">${esc(c.title)}, ${esc(c.company)} · Client since ${L.fmtLong(c.engagement.start_date)} (${months} months) · Prepared ${L.fmtLong(L.TODAY)}</p></div></header>
        ${c.engagement.status === "Onboarding" ? `<p class="banner">${esc(c.first_name)} joined recently. These are baseline figures for future reports to measure against.</p>` : ""}
        <div class="result-grid">${stat("LinkedIn followers", "followers")}${stat("Engagement rate", "engagement_rate_pct")}${stat("Monthly reach", "reach_30d")}${stat("Profile views (30d)", "profile_views_30d")}${stat("Impressions per post", "avg_impressions_per_post")}${stat("Social Selling Index", "ssi_score")}</div>
        <section><h2 class="sec">${esc(METRICS[k].label)} over time</h2>${L.lineChart(series.map((s) => ({ label: L.fmtDate(s.month, { month: "short", year: "2-digit" }), value: s[k] })), { label: METRICS[k].label, format: METRICS[k].format, marker, every: Math.ceil(series.length / 8) })}</section>
        <div class="grid half">
          <section><h2 class="sec">Work delivered</h2>
            <dl class="dl"><dt>Content published</dt><dd>${published} posts & articles (logged)</dd><dt>Work items</dt><dd>${work.length} across ${Object.keys(cats).length} categories</dd><dt>Hours</dt><dd>${L.n0(work.reduce((s, w) => s + (+w.hours || 0), 0))}</dd><dt>Placements</dt><dd>${placements.length} confirmed or completed</dd></dl>
            ${L.barList(Object.entries(cats).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value), { tip: (r) => `${r.label}: ${r.value} items` })}
          </section>
          <section><h2 class="sec">Visibility</h2>
            ${placements.length ? `<ul class="list">${placements.map((v) => `<li><span class="when">${L.fmtDate(v.date, { day: "numeric", month: "short", year: "2-digit" })}</span><div class="body"><div class="title">${esc(v.name)}</div><div class="small muted">${esc(v.type)}</div></div>${L.visStatusBadge(v.status)}</li>`).join("")}</ul>` : `<div class="empty">Placements in progress.</div>`}
          </section>
        </div>
        <section class="no-print"><h2 class="sec">Work log</h2>${L.workTable(work.slice().reverse())}</section>
      </article>`;
  }

  // ================================================================ actions
  L.editPost = (post, presetClient) => {
    const isNew = !post;
    post = post || { client_id: presetClient || L.ui.content.client || L.state.clients[0].id, date: L.TODAY, title: "", format: "Text post", status: "Idea", owner: "T2", pillar: "" };
    L.openForm({
      title: isNew ? "New post" : "Edit post",
      fields: [
        { name: "client_id", label: "Client", type: "select", options: L.clientOptions(), value: post.client_id },
        { name: "title", label: "Working title", value: post.title, required: true },
        { name: "date", label: "Publish date", type: "date", value: post.date, required: true },
        { name: "format", label: "Format", type: "select", options: POST_FORMATS, value: post.format },
        { name: "status", label: "Status", type: "select", options: POST_STATUSES, value: post.status },
        { name: "owner", label: "Owner", type: "select", options: L.teamOptions(), value: post.owner },
      ],
      onSave: (f) => {
        const wasPublished = post.status === "Published";
        Object.assign(post, f, { channel: f.format === "Newsletter" ? "Newsletter" : "LinkedIn", pillar: post.pillar && post.client_id === f.client_id ? post.pillar : L.clientById[f.client_id].content_pillars[0] });
        if (isNew) { post.id = L.nextId("P", L.state.posts); L.state.posts.push(post); }
        L.state.posts.sort((a, b) => a.date.localeCompare(b.date));
        const names = ["posts"];
        if (!wasPublished && post.status === "Published") {
          L.addWork({ client_id: post.client_id, date: post.date, category: "Content", description: `Ghostwrote & published ${post.format.toLowerCase()}: "${post.title}"`, by: post.owner, hours: 2 });
          names.push("worklog");
        }
        return L.save(...names);
      },
      onDelete: isNew ? null : () => { L.state.posts = L.state.posts.filter((p) => p !== post); L.save("posts"); },
    });
  };
  L.editVisibility = (item, presetClient) => {
    const isNew = !item;
    item = item || { client_id: presetClient || L.ui.vis.client || L.state.clients[0].id, type: "Podcast", name: "", date: L.TODAY, status: "Pitched", owner: "T1", note: "" };
    L.openForm({
      title: isNew ? "New visibility opportunity" : "Edit opportunity",
      fields: [
        { name: "client_id", label: "Client", type: "select", options: L.clientOptions(), value: item.client_id },
        { name: "type", label: "Type", type: "select", options: VIS_TYPES, value: item.type },
        { name: "name", label: "Event / outlet", value: item.name, required: true },
        { name: "date", label: "Date", type: "date", value: item.date, required: true },
        { name: "status", label: "Status", type: "select", options: VIS_STATUSES, value: item.status },
        { name: "owner", label: "Owner", type: "select", options: L.teamOptions(), value: item.owner },
        { name: "note", label: "Notes", type: "textarea", value: item.note },
      ],
      onSave: (f) => {
        const wasDone = item.status === "Completed";
        Object.assign(item, f);
        if (isNew) { item.id = L.nextId("V", L.state.visibility); L.state.visibility.push(item); }
        L.state.visibility.sort((a, b) => a.date.localeCompare(b.date));
        const names = ["visibility"];
        if (!wasDone && item.status === "Completed") { L.addWork({ client_id: item.client_id, date: item.date, category: item.type === "Speaking" ? "Speaking" : "PR & media", description: `Secured & prepped: ${item.name}`, by: item.owner, hours: 5 }); names.push("worklog"); }
        return L.save(...names);
      },
      onDelete: isNew ? null : () => { L.state.visibility = L.state.visibility.filter((v) => v !== item); L.save("visibility"); },
    });
  };
  L.logWork = (presetClient) => L.openForm({
    title: "Log completed work",
    intro: "Logged work appears on the client's work log, results report and next invoice.",
    fields: [
      { name: "client_id", label: "Client", type: "select", options: L.clientOptions(), value: presetClient || L.state.clients[0].id },
      { name: "date", label: "Date completed", type: "date", value: L.TODAY, required: true },
      { name: "category", label: "Category", type: "select", options: ["Content", "Strategy", "PR & media", "Speaking", "Reporting", "Profile optimisation", "Additional"], value: "Content" },
      { name: "description", label: "Description", required: true },
      { name: "by", label: "Done by", type: "select", options: L.teamOptions(), value: L.me().id === "F1" ? "T1" : L.me().id },
      { name: "hours", label: "Hours", type: "number", step: "0.5", value: 1 },
      { name: "billing", label: "Billing", type: "select", options: [["Retainer", "Covered by retainer"], ["Additional", "Additional (billable)"]], value: "Retainer" },
      { name: "amount", label: "Amount if additional (£, excl. VAT)", type: "number", step: "0.01", value: 0, help: "Rate card: " + L.state.company.rate_card.map((r) => `${r.item} £${r.price_gbp}`).join(" · ") },
    ],
    onSave: (f) => { L.addWork({ ...f, hours: +f.hours, amount: f.billing === "Additional" ? +f.amount : 0 }); return L.save("worklog"); },
  });

  Object.assign(L.actions, {
    "new-post": (el) => L.editPost(null, el.dataset.client),
    "edit-post": (el) => L.editPost(L.state.posts.find((p) => p.id === el.dataset.id)),
    "new-vis": (el) => L.editVisibility(null, el.dataset.client),
    "edit-vis": (el) => L.editVisibility(L.state.visibility.find((v) => v.id === el.dataset.id)),
    "content-view": (el) => { L.ui.content.view = el.dataset.v; L.render(); },
    "log-work": (el) => L.logWork(el.dataset.client),
    print: () => window.print(),
  });
  L.changeHandlers.push((t) => {
    const ds = t.dataset;
    if (ds.f && ds.f !== "q") L.ui.clientFilter[ds.f] = t.value;
    else if (ds.cf) L.ui.content[ds.cf] = t.value;
    else if (ds.vf) L.ui.vis[ds.vf] = t.value;
    else if (ds.rf) L.ui.results[ds.rf] = t.value;
    else if (ds.visStatus) {
      const v = L.state.visibility.find((x) => x.id === ds.visStatus);
      const names = ["visibility"];
      if (v.status !== "Completed" && t.value === "Completed") { L.addWork({ client_id: v.client_id, date: v.date, category: v.type === "Speaking" ? "Speaking" : "PR & media", description: `Secured & prepped: ${v.name}`, by: v.owner, hours: 5 }); names.push("worklog"); }
      v.status = t.value;
      L.save(...names);
    } else return false;
    L.render();
    return true;
  });
})();
