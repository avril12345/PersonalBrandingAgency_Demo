/* Meetings: booking, notes & takeaways, actions, research (Perplexity + Firecrawl). */
(() => {
  "use strict";
  const L = window.L, esc = L.esc;
  const TYPES = ["Kickoff & brand discovery", "Monthly review", "Content sync", "Quarterly strategy session", "Speaking prep", "Profile audit review", "Voice & tone workshop", "Results review", "Other"];
  const LOCATIONS = ["Video call (Google Meet)", "Client office", "LOUD studio, Shoreditch", "Phone"];
  L.ui.meetings = { when: "upcoming", owner: "", client: "" };

  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const fromMin = (x) => `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;

  L.meetingTable = (ms, { client = true } = {}) => ms.length ? `<div class="table-wrap"><table>
    <thead><tr><th>Date</th>${client ? "<th>Client</th>" : ""}<th>Meeting</th><th>With</th><th>Status</th><th>Notes</th></tr></thead>
    <tbody>${ms.map((m) => { const c = L.clientById[m.client_id]; const r = L.state.research.some((x) => x.meeting_id === m.id); return `<tr>
      <td class="num nowrap">${L.fmtDay(m.date)}<div class="small muted">${m.start}–${m.end}</div></td>
      ${client ? `<td>${L.clientCell(c, c.company)}</td>` : ""}
      <td><a href="#/meeting/${m.id}"><b>${esc(m.type)}</b></a><div class="small muted">${esc(m.location)}</div></td>
      <td class="small">${m.attendees.map(L.firstName).join(", ")}</td>
      <td>${L.meetingStatusBadge(m.status)}</td>
      <td class="small">${m.notes ? "✓ Notes" : m.status === "Completed" ? '<span class="warn-text">No notes</span>' : "—"}${m.takeaways.length ? ` · ${m.takeaways.length} takeaways` : ""}${r ? " · Research" : ""}</td></tr>`; }).join("")}</tbody></table></div>` : `<div class="empty">No meetings.</div>`;

  // ================================================================ list
  L.views.meetings = () => {
    const f = L.ui.meetings, T = L.TODAY;
    let ms = L.state.meetings.filter((m) => (!f.owner || m.attendees.includes(f.owner)) && (!f.client || m.client_id === f.client));
    const needNotes = ms.filter((m) => m.status === "Scheduled" && m.date < T);
    ms = f.when === "upcoming" ? ms.filter((m) => m.date >= T && m.status !== "Cancelled") : f.when === "past" ? ms.filter((m) => m.date < T).reverse() : ms;
    return `
      <div class="page-head"><div><h1>Meetings</h1><p>Book client meetings, record notes and takeaways, then run research from them</p></div>
        <div class="actions"><a class="btn" href="#/calendar">Calendar view</a><button class="btn primary" data-act="book-meeting">+ Book meeting</button></div></div>
      ${needNotes.length ? `<div class="banner warn">${needNotes.length} past meeting${needNotes.length > 1 ? "s" : ""} still marked scheduled. Add notes and mark them complete.</div>` : ""}
      <div class="filters">
        <div class="seg" role="group" aria-label="When">${[["upcoming", "Upcoming"], ["past", "Past"], ["all", "All"]].map(([k, l]) => `<button data-act="meet-when" data-v="${k}" class="${f.when === k ? "on" : ""}">${l}</button>`).join("")}</div>
        <select data-mf="owner" aria-label="Team member">${L.options(L.teamOptions(), f.owner, "Everyone")}</select>
        <select data-mf="client" aria-label="Client">${L.options(L.clientOptions(), f.client, "All clients")}</select>
      </div>
      <section class="card">${L.meetingTable(ms)}</section>`;
  };

  // ================================================================ detail
  L.views.meeting = (id) => {
    const m = L.state.meetings.find((x) => x.id === id);
    if (!m) return `<div class="card">Meeting not found. <a href="#/meetings">Back</a></div>`;
    const c = L.clientById[m.client_id];
    const briefs = L.state.research.filter((r) => r.meeting_id === m.id);
    const integ = L.state.integrations;
    return `
      <div class="page-head"><a href="#/meetings" class="small muted">← Meetings</a></div>
      <div class="page-head"><div><h1>${esc(m.type)}: ${esc(L.fullName(c))}</h1>
        <p>${L.fmtDate(m.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${m.start}–${m.end} · ${esc(m.location)} · with ${m.attendees.map((a) => esc(L.personById[a].name)).join(", ")}</p></div>
        <div class="actions">${L.meetingStatusBadge(m.status)}
          <button class="btn small" data-act="ics" data-id="${m.id}">Download invite (.ics)</button>
          <button class="btn small" data-act="edit-meeting" data-id="${m.id}">Reschedule / edit</button></div></div>
      <div class="grid two-col">
        <form class="card stack" data-meeting-form="${m.id}">
          <div><h2>Agenda</h2>${m.agenda.length ? `<ul class="list">${m.agenda.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : `<div class="empty">No agenda.</div>`}</div>
          <label class="field"><span>Meeting notes</span><textarea name="notes" rows="8" placeholder="What was discussed, decisions, client mood, quotes worth using…">${esc(m.notes)}</textarea></label>
          <label class="field"><span>Key takeaways <span class="muted">(one per line)</span></span><textarea name="takeaways" rows="4">${esc(m.takeaways.join("\n"))}</textarea></label>
          <div><div class="field-label">Actions</div>
            <div class="action-rows">${m.actions.map((a, i) => actionRow(a, i)).join("")}</div>
            <button type="button" class="btn small" data-act="add-action" data-id="${m.id}">+ Action</button></div>
          <div class="row-actions">
            <button class="btn primary" type="submit">Save notes</button>
            ${m.status !== "Completed" ? `<button type="button" class="btn" data-act="complete-meeting" data-id="${m.id}">Save & mark completed</button>` : ""}
            <button type="button" class="btn" data-act="followup" data-id="${m.id}">Email follow-up to client</button>
            ${m.status === "Scheduled" ? `<button type="button" class="btn ghost danger" data-act="cancel-meeting" data-id="${m.id}">Cancel meeting</button>` : ""}
          </div>
        </form>
        <div class="stack">
          <section class="card">
            <header><h2>Branding research</h2></header>
            <p class="small muted">Sends the client profile and this meeting's notes to <b>Perplexity</b> for market fit, engagement strategy and competition research. <b>Firecrawl</b> scrapes ${esc(c.website)} to check brand alignment.</p>
            <div class="integrations">${L.badge(`Perplexity ${integ.perplexity ? "connected" : "not connected"}`, integ.perplexity ? "good" : "")}${L.badge(`Firecrawl ${integ.firecrawl ? "connected" : "not connected"}`, integ.firecrawl ? "good" : "")}</div>
            <label class="field"><span>Extra pages for Firecrawl <span class="muted">(optional, comma-separated URLs)</span></span><input id="extra-urls" placeholder="https://… personal site, recent article, speaker page"></label>
            <button class="btn primary" data-act="run-research" data-id="${m.id}" ${m.notes ? "" : "disabled"}>${m.notes ? "Run research" : "Add notes first"}</button>
            <div id="research-status" class="small" aria-live="polite"></div>
            ${!integ.perplexity ? `<details class="setup"><summary>How to connect</summary><ol class="small"><li>Copy <code>.env.example</code> to <code>.env</code> in the project folder.</li><li>Add <code>PERPLEXITY_API_KEY</code> (from perplexity.ai → API) and <code>FIRECRAWL_API_KEY</code> (from firecrawl.dev).</li><li>Restart with <code>npm start</code>. Keys stay on your machine and are never sent to the browser.</li></ol></details>` : ""}
            ${briefs.length ? `<h3 class="sub-h">Briefs from this meeting</h3><ul class="list">${briefs.map((r) => `<li><span class="when">${L.fmtDate(r.created)}</span><div class="body"><a class="title" href="#/research/${r.id}">Branding brief</a></div>${L.badge(r.mode === "live" ? "Live" : "Demo", r.mode === "live" ? "good" : "")}</li>`).join("")}</ul>` : ""}
          </section>
          <section class="card"><header><h2>Client snapshot</h2><a class="aside" href="#/client/${c.id}">Open client →</a></header>
            <dl class="dl"><dt>Role</dt><dd>${esc(c.title)}, ${esc(c.company)}</dd><dt>Followers</dt><dd>${L.n0(L.hist(c).at(-1).followers)}</dd><dt>Engagement</dt><dd>${L.hist(c).at(-1).engagement_rate_pct}%</dd><dt>Goals</dt><dd>${c.brand_goals.map(esc).join("<br>")}</dd><dt>Pillars</dt><dd>${c.content_pillars.map(esc).join("<br>")}</dd></dl>
          </section>
        </div>
      </div>`;
  };
  const actionRow = (a, i) => `<div class="action-row" data-i="${i}">
    <input type="checkbox" name="done" ${a.done ? "checked" : ""} aria-label="Done">
    <input name="text" value="${esc(a.text)}" placeholder="Action" aria-label="Action">
    <select name="owner" aria-label="Owner">${L.options(L.teamOptions(true), a.owner)}</select>
    <input type="date" name="due" value="${esc(a.due)}" aria-label="Due">
    <button type="button" class="btn ghost small" data-act="remove-action" aria-label="Remove">×</button></div>`;

  function collectMeetingForm(m) {
    const form = document.querySelector(`[data-meeting-form="${m.id}"]`);
    m.notes = form.querySelector('[name="notes"]').value.trim();
    m.takeaways = form.querySelector('[name="takeaways"]').value.split("\n").map((s) => s.trim()).filter(Boolean);
    m.actions = [...form.querySelectorAll(".action-row")].map((r) => ({
      text: r.querySelector('[name="text"]').value.trim(), owner: r.querySelector('[name="owner"]').value,
      due: r.querySelector('[name="due"]').value || L.addDays(L.TODAY, 7), done: r.querySelector('[name="done"]').checked,
    })).filter((a) => a.text);
  }

  // ================================================================ research brief
  L.views.research = (id) => {
    const r = L.state.research.find((x) => x.id === id);
    if (!r) return `<div class="card">Brief not found.</div>`;
    const c = L.clientById[r.client_id], m = L.state.meetings.find((x) => x.id === r.meeting_id);
    return `
      <div class="page-head no-print"><a href="#/client/${c.id}/meetings" class="small muted">← ${esc(L.fullName(c))}</a><div class="actions"><button class="btn" data-act="print">Print / save PDF</button></div></div>
      <article class="card report">
        <header class="report-head"><div><div class="wordmark-sm">LOUD</div><h1>Branding brief: ${esc(L.fullName(c))}</h1>
          <p class="muted">${esc(c.title)}, ${esc(c.company)} · ${L.fmtLong(r.created)}${m ? ` · from <a href="#/meeting/${m.id}">${esc(m.type)} (${L.fmtDate(m.date)})</a>` : ""}</p>
          <div class="chips">${L.badge(r.mode === "live" ? `Live research · ${r.model || "Perplexity"}` : "Demo brief (seeded)", r.mode === "live" ? "good" : "")}${r.crawled?.length ? L.badge(`Firecrawl: ${r.crawled.length} page${r.crawled.length > 1 ? "s" : ""}`, "cpg") : ""}</div></div></header>
        ${L.md(r.markdown)}
        ${r.sources?.length ? `<h2 class="sec">Sources</h2><ol class="sources">${r.sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.url)}</a></li>`).join("")}</ol>` : ""}
        ${r.steps?.length ? `<details class="table-view"><summary>Research log</summary><ul class="small">${r.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></details>` : ""}
      </article>`;
  };

  // ================================================================ booking
  L.conflicts = (date, start, end, attendees, ignoreId) => {
    const a = toMin(start), b = toMin(end), out = [];
    for (const m of L.state.meetings) if (m.id !== ignoreId && m.status !== "Cancelled" && m.date === date && m.attendees.some((x) => attendees.includes(x)) && toMin(m.start) < b && toMin(m.end) > a) out.push(`${m.start} ${m.type} (${L.fullName(L.clientById[m.client_id])})`);
    for (const e of L.state.events) if (e.date === date && e.attendees.some((x) => attendees.includes(x)) && toMin(e.start) < b && toMin(e.end) > a) out.push(`${e.start} ${e.title}`);
    return out;
  };
  L.bookMeeting = (presetClient, preset = {}) => {
    const me = L.me().id === "F1" ? "T1" : L.me().id;
    const client = presetClient || L.state.clients[0].id;
    L.openForm({
      title: "Book a client meeting",
      saveLabel: "Book & send invite",
      fields: [
        { name: "client_id", label: "Client", type: "select", options: L.clientOptions(), value: client },
        { name: "type", label: "Meeting type", type: "select", options: TYPES, value: preset.type || "Monthly review" },
        { name: "date", label: "Date", type: "date", value: preset.date || L.addDays(L.TODAY, 2), required: true },
        { name: "start", label: "Start time", type: "time", value: preset.start || "10:00", required: true },
        { name: "duration", label: "Duration", type: "select", options: [["30", "30 minutes"], ["45", "45 minutes"], ["60", "1 hour"], ["90", "1.5 hours"], ["120", "2 hours"]], value: "60" },
        { name: "attendees", label: "LOUD attendees", type: "checkboxes", options: L.teamOptions(true), value: preset.attendees || [me] },
        { name: "location", label: "Location", type: "select", options: LOCATIONS, value: LOCATIONS[0] },
        { name: "agenda", label: "Agenda (one item per line)", type: "textarea", rows: 4, value: "" },
        { name: "invite", label: "Email the invite to the client from the organiser's mailbox", type: "checkbox", value: true },
      ],
      onSave: async (f) => {
        const attendees = f.attendees.length ? f.attendees : [me];
        const end = fromMin(toMin(f.start) + +f.duration);
        const clash = L.conflicts(f.date, f.start, end, attendees);
        if (clash.length && !confirm(`Calendar clash:\n${clash.join("\n")}\n\nBook anyway?`)) return;
        const c = L.clientById[f.client_id];
        const m = { id: L.nextId("M", L.state.meetings), client_id: c.id, type: f.type, date: f.date, start: f.start, end, attendees, organiser: attendees.find((a) => a !== "F1") || attendees[0], location: f.location, agenda: f.agenda.split("\n").map((s) => s.trim()).filter(Boolean), status: "Scheduled", notes: "", takeaways: [], actions: [] };
        L.state.meetings.push(m);
        L.state.meetings.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
        const names = ["meetings"];
        if (f.invite && m.organiser !== "F1") {
          L.sendEmail({ mailbox: m.organiser, to: { name: L.fullName(c), email: c.email }, subject: `Invitation: ${m.type} — ${L.fmtDay(m.date)}, ${m.start}`, related: { type: "meeting", id: m.id },
            body: `Hi ${c.first_name},\n\nI've booked our ${m.type.toLowerCase()} for ${L.fmtDay(m.date)}, ${m.start}–${m.end} (${m.location}).\n\n${m.agenda.length ? `Agenda:\n${m.agenda.map((a) => `• ${a}`).join("\n")}\n\n` : ""}A calendar invite is attached.\n\nBest,\n${L.firstName(m.organiser)}\nLOUD` });
          names.push("emails");
        }
        await L.save(...names);
        location.hash = `#/meeting/${m.id}`;
      },
    });
  };

  function editMeeting(m) {
    L.openForm({
      title: "Edit meeting",
      fields: [
        { name: "type", label: "Meeting type", type: "select", options: TYPES, value: m.type },
        { name: "date", label: "Date", type: "date", value: m.date, required: true },
        { name: "start", label: "Start", type: "time", value: m.start, required: true },
        { name: "end", label: "End", type: "time", value: m.end, required: true },
        { name: "attendees", label: "LOUD attendees", type: "checkboxes", options: L.teamOptions(true), value: m.attendees },
        { name: "location", label: "Location", type: "select", options: LOCATIONS.includes(m.location) ? LOCATIONS : [m.location, ...LOCATIONS], value: m.location },
        { name: "agenda", label: "Agenda (one per line)", type: "textarea", value: m.agenda.join("\n") },
      ],
      onSave: (f) => {
        const clash = L.conflicts(f.date, f.start, f.end, f.attendees, m.id);
        if (clash.length && !confirm(`Calendar clash:\n${clash.join("\n")}\n\nSave anyway?`)) return;
        Object.assign(m, f, { agenda: f.agenda.split("\n").map((s) => s.trim()).filter(Boolean), attendees: f.attendees.length ? f.attendees : m.attendees });
        return L.save("meetings");
      },
      onDelete: () => { L.state.meetings = L.state.meetings.filter((x) => x !== m); L.save("meetings"); location.hash = "#/meetings"; },
    });
  }

  L.icsFor = (m) => {
    const c = L.clientById[m.client_id];
    const dt = (d, t) => `${d.replace(/-/g, "")}T${t.replace(":", "")}00`;
    const escI = (s) => String(s).replace(/[\\;,]/g, (x) => "\\" + x).replace(/\n/g, "\\n");
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//LOUD//CRM//EN", "BEGIN:VEVENT", `UID:${m.id}@loud.example`, `DTSTAMP:${L.TODAY.replace(/-/g, "")}T090000Z`,
      `DTSTART;TZID=Europe/London:${dt(m.date, m.start)}`, `DTEND;TZID=Europe/London:${dt(m.date, m.end)}`, `SUMMARY:${escI(`LOUD × ${L.fullName(c)}: ${m.type}`)}`,
      `LOCATION:${escI(m.location)}`, `DESCRIPTION:${escI(m.agenda.join("\n"))}`, `ORGANIZER;CN=${escI(L.personById[m.organiser].name)}:mailto:${L.personById[m.organiser].email}`,
      `ATTENDEE;CN=${escI(L.fullName(c))}:mailto:${c.email}`, ...m.attendees.map((a) => `ATTENDEE;CN=${escI(L.personById[a].name)}:mailto:${L.personById[a].email}`), "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  };

  // ================================================================ actions
  const byId = (el) => L.state.meetings.find((m) => m.id === el.dataset.id);
  Object.assign(L.actions, {
    "book-meeting": (el) => L.bookMeeting(el.dataset.client, el.dataset.date ? { date: el.dataset.date, start: el.dataset.start, attendees: el.dataset.who ? [el.dataset.who] : undefined } : {}),
    "meet-when": (el) => { L.ui.meetings.when = el.dataset.v; L.render(); },
    "edit-meeting": (el) => editMeeting(byId(el)),
    ics: (el) => { const m = byId(el); L.download(`${m.id}-${L.slug(m.type)}.ics`, L.icsFor(m), "text/calendar"); },
    "add-action": (el) => { const m = byId(el); collectMeetingForm(m); m.actions.push({ text: "", owner: m.organiser, due: L.addDays(L.TODAY, 7), done: false }); L.render(); setTimeout(() => [...document.querySelectorAll('.action-row [name="text"]')].at(-1)?.focus()); },
    "remove-action": (el) => el.closest(".action-row").remove(),
    "complete-meeting": async (el) => {
      const m = byId(el);
      collectMeetingForm(m);
      if (!m.notes) return L.toast("Add meeting notes before completing", true);
      m.status = "Completed";
      const hrs = (toMin(m.end) - toMin(m.start)) / 60;
      L.addWork({ client_id: m.client_id, date: m.date, category: "Strategy", description: `${m.type} meeting (${m.id})`, by: m.organiser, hours: hrs });
      await L.save("meetings", "worklog");
      L.render();
    },
    "cancel-meeting": async (el) => { if (!confirm("Cancel this meeting?")) return; byId(el).status = "Cancelled"; await L.save("meetings"); L.render(); },
    followup: async (el) => {
      const m = byId(el); collectMeetingForm(m);
      const c = L.clientById[m.client_id];
      if (m.organiser === "F1") return L.toast("Follow-ups are sent from Heloise's or Lottie's mailbox", true);
      L.sendEmail({ mailbox: m.organiser, to: { name: L.fullName(c), email: c.email }, subject: `Follow-up: ${m.type} — notes & actions`, related: { type: "meeting", id: m.id },
        body: `Hi ${c.first_name},\n\nThanks for your time. Key takeaways:\n${m.takeaways.map((t) => `• ${t}`).join("\n") || "• —"}\n\nActions:\n${m.actions.map((a) => `• ${a.text} (${L.firstName(a.owner)}, by ${L.fmtDate(a.due)})`).join("\n") || "• —"}\n\nBest,\n${L.firstName(m.organiser)}` });
      await L.save("meetings", "emails");
      L.toast(`Follow-up sent from ${L.firstName(m.organiser)}'s mailbox`);
    },
    "run-research": async (el) => {
      const m = byId(el); collectMeetingForm(m);
      await L.save("meetings");
      const status = document.getElementById("research-status");
      el.disabled = true;
      status.innerHTML = `<span class="spinner"></span> Researching with Perplexity${L.state.integrations.firecrawl ? " and crawling with Firecrawl" : ""}… this can take up to a minute.`;
      const urls = (document.getElementById("extra-urls").value || "").split(",").map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s));
      try {
        const res = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meeting_id: m.id, urls, requested_by: L.me().id }) });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        L.state.research.push(body);
        L.addWork({ client_id: m.client_id, date: L.TODAY, category: "Strategy", description: "Branding research brief (market fit, engagement, competition, brand alignment)", by: L.me().id === "F1" ? m.organiser : L.me().id, hours: 1 });
        await L.save("worklog");
        location.hash = `#/research/${body.id}`;
      } catch (e) {
        el.disabled = false;
        status.innerHTML = `<span class="crit-text">▲ ${esc(e.message)}</span>`;
      }
    },
  });
  L.submitHandlers.push((form, e) => {
    if (!form.dataset.meetingForm) return false;
    e.preventDefault();
    const m = L.state.meetings.find((x) => x.id === form.dataset.meetingForm);
    collectMeetingForm(m);
    L.save("meetings").then(L.render);
    return true;
  });
  L.changeHandlers.push((t) => {
    if (!t.dataset.mf) return false;
    L.ui.meetings[t.dataset.mf] = t.value;
    L.render();
    return true;
  });
})();
