/* Demo mailboxes and calendars for Heloise and Lottie. */
(() => {
  "use strict";
  const L = window.L, esc = L.esc;
  L.ui.mail = { folder: "inbox" };
  L.ui.cal = { week: null, who: ["T1", "T2"] };

  const defaultBox = () => (L.me().id === "F1" ? "T1" : L.me().id);
  const relatedLink = (r) => !r ? "" : r.type === "invoice" ? `#/invoice/${r.id}` : r.type === "meeting" ? `#/meeting/${r.id}` : r.type === "client" ? `#/client/${r.id}` : "";
  L.unread = (box) => L.state.emails.filter((e) => e.mailbox === box && e.folder === "inbox" && !e.read).length;

  // ================================================================ MAIL
  L.views.mail = (box = defaultBox(), emailId) => {
    const p = L.personById[box];
    if (!p || box === "F1") return L.views.mail("T1");
    const open = emailId ? L.state.emails.find((e) => e.id === emailId && e.mailbox === box) : null;
    if (open) L.ui.mail.folder = open.folder;
    const f = L.ui.mail.folder;
    const list = L.state.emails.filter((e) => e.mailbox === box && e.folder === f).sort((a, b) => b.date.localeCompare(a.date));
    if (open && !open.read) { open.read = true; L.save("emails"); }
    return `
      <div class="page-head"><div><h1>Mail</h1><p>Demo mailboxes. Nothing is really sent; messages stay inside the CRM.</p></div>
        <div class="actions"><div class="seg" role="group" aria-label="Mailbox">${L.state.team.map((t) => `<a href="#/mail/${t.id}" class="${t.id === box ? "on" : ""}">${esc(t.name.split(" ")[0])}${L.unread(t.id) ? ` (${L.unread(t.id)})` : ""}</a>`).join("")}</div>
        <button class="btn primary" data-act="compose" data-box="${box}">Compose</button></div></div>
      <div class="mail">
        <aside class="mail-folders card">
          <div class="mail-account"><div class="avatar sm">${L.initials(p)}</div><div><b>${esc(p.name)}</b><div class="small muted">${esc(p.email)}</div></div></div>
          ${[["inbox", "Inbox"], ["sent", "Sent"]].map(([k, l]) => `<button class="folder ${f === k ? "on" : ""}" data-act="mail-folder" data-v="${k}" data-box="${box}">${l}<span class="num">${k === "inbox" && L.unread(box) ? L.unread(box) : ""}</span></button>`).join("")}
        </aside>
        <section class="mail-list card">${list.map((e) => { const who = f === "inbox" ? e.from.name : e.to.map((t) => t.name).join(", "); return `<a class="mail-item ${e.read ? "" : "unread"} ${open && open.id === e.id ? "on" : ""}" href="#/mail/${box}/${e.id}">
          <div class="mail-top"><span class="who">${esc(who)}</span><span class="small muted nowrap">${L.fmtDate(e.date)}</span></div>
          <div class="subj">${esc(e.subject)}</div><div class="small muted snippet">${esc(e.body.replace(/\s+/g, " ").slice(0, 90))}</div></a>`; }).join("") || `<div class="empty">No messages.</div>`}</section>
        <section class="mail-read card">${open ? `
          <h2>${esc(open.subject)}</h2>
          <div class="small muted">From <b>${esc(open.from.name)}</b> &lt;${esc(open.from.email)}&gt;<br>To ${open.to.map((t) => `${esc(t.name)} &lt;${esc(t.email)}&gt;`).join(", ")}<br>${L.fmtDate(open.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} ${open.date.slice(11, 16)}</div>
          ${open.related ? `<a class="btn small" href="${relatedLink(open.related)}" style="margin:10px 0">Open related ${esc(open.related.type)} →</a>` : ""}
          <pre class="mail-body">${esc(open.body)}</pre>
          <div class="row-actions"><button class="btn" data-act="reply" data-id="${open.id}" data-box="${box}">Reply</button></div>` : `<div class="empty">Select a message.</div>`}</section>
      </div>`;
  };

  const compose = (box, preset = {}) => L.openForm({
    title: `New message from ${L.personById[box].name}`, saveLabel: "Send",
    fields: [
      { name: "to", label: "To (email)", value: preset.to || "", required: true, placeholder: "name@company.example" },
      { name: "subject", label: "Subject", value: preset.subject || "", required: true },
      { name: "body", label: "Message", type: "textarea", rows: 8, value: preset.body || "" },
    ],
    onSave: async (f) => {
      const c = L.state.clients.find((x) => x.email === f.to || x.billing.email === f.to);
      L.sendEmail({ mailbox: box, to: { name: c ? L.fullName(c) : f.to, email: f.to }, subject: f.subject, body: f.body, related: preset.related || (c ? { type: "client", id: c.id } : null) });
      L.ui.mail.folder = "sent";
      await L.save("emails");
    },
  });
  Object.assign(L.actions, {
    compose: (el) => compose(el.dataset.box),
    "mail-folder": (el) => { L.ui.mail.folder = el.dataset.v; location.hash = `#/mail/${el.dataset.box}`; L.render(); },
    reply: (el) => {
      const e = L.state.emails.find((x) => x.id === el.dataset.id);
      const to = e.folder === "inbox" ? e.from.email : e.to[0].email;
      compose(el.dataset.box, { to, subject: e.subject.startsWith("Re:") ? e.subject : `Re: ${e.subject}`, body: `\n\n— On ${L.fmtDate(e.date)} ${e.from.name} wrote:\n${e.body.split("\n").map((l) => `> ${l}`).join("\n")}`, related: e.related });
    },
  });

  // ================================================================ CALENDAR (week view)
  const HOURS = [8, 19];
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const monday = (s) => { const d = L.d(s), w = (d.getDay() + 6) % 7; return L.addDays(s, -w); };
  L.views.calendar = () => {
    const c = L.ui.cal;
    c.week = c.week || monday(L.TODAY);
    const days = [0, 1, 2, 3, 4, 5, 6].map((i) => L.addDays(c.week, i));
    const who = c.who;
    const span = (HOURS[1] - HOURS[0]) * 60;
    const items = [];
    for (const m of L.state.meetings) if (days.includes(m.date) && m.status !== "Cancelled" && m.attendees.some((a) => who.includes(a))) items.push({ date: m.date, start: m.start, end: m.end, kind: "client", title: `${L.fullName(L.clientById[m.client_id])}`, sub: m.type, people: m.attendees, href: `#/meeting/${m.id}`, done: m.status === "Completed" });
    for (const e of L.state.events) if (days.includes(e.date) && e.attendees.some((a) => who.includes(a))) items.push({ date: e.date, start: e.start, end: e.end, kind: "internal", title: e.title, sub: "Internal", people: e.attendees });
    const allDay = L.state.visibility.filter((v) => days.includes(v.date) && ["Confirmed", "Completed"].includes(v.status) && who.includes(v.owner));
    // simple overlap layout per day
    const lanes = (list) => { const sorted = list.sort((a, b) => toMin(a.start) - toMin(b.start)); const ends = []; for (const it of sorted) { let l = ends.findIndex((e) => e <= toMin(it.start)); if (l < 0) { l = ends.length; ends.push(0); } ends[l] = toMin(it.end); it.lane = l; } sorted.forEach((it) => (it.lanes = ends.length)); return sorted; };
    return `
      <div class="page-head"><div><h1>Calendar</h1><p>Week of ${L.fmtLong(c.week)}</p></div>
        <div class="actions">
          <div class="seg" role="group" aria-label="People">${L.state.team.map((t) => `<button data-act="cal-who" data-v="${t.id}" class="${who.includes(t.id) ? "on" : ""}" aria-pressed="${who.includes(t.id)}">${esc(t.name.split(" ")[0])}</button>`).join("")}</div>
          <div class="seg" role="group" aria-label="Week"><button data-act="cal-nav" data-v="-7" aria-label="Previous week">←</button><button data-act="cal-nav" data-v="0">This week</button><button data-act="cal-nav" data-v="7" aria-label="Next week">→</button></div>
          <button class="btn primary" data-act="book-meeting">+ Book meeting</button></div></div>
      <div class="legend" style="margin:0 0 10px"><span><span class="key client"></span> Client meeting</span><span><span class="key internal"></span> Internal</span><span><span class="key allday"></span> Speaking / media (all day)</span><span>Initials show who attends. Click an empty slot to book.</span></div>
      <div class="week card">
        <div class="week-head"><div></div>${days.map((d) => `<div class="${d === L.TODAY ? "today" : ""}"><b>${L.fmtDate(d, { weekday: "short" })}</b> ${L.fmtDate(d, { day: "numeric" })}
          ${allDay.filter((v) => v.date === d).map((v) => `<a class="allday" href="#/client/${v.client_id}" data-tip="${esc(`${L.fullName(L.clientById[v.client_id])}: ${v.name}`)}">${esc(v.type)}: ${esc(L.clientById[v.client_id].last_name)}</a>`).join("")}</div>`).join("")}</div>
        <div class="week-body" style="--rows:${HOURS[1] - HOURS[0]}">
          <div class="hours">${Array.from({ length: HOURS[1] - HOURS[0] }, (_, i) => `<div>${String(HOURS[0] + i).padStart(2, "0")}:00</div>`).join("")}</div>
          ${days.map((d) => `<div class="day-col${d === L.TODAY ? " today" : ""}" data-date="${d}">
            ${Array.from({ length: HOURS[1] - HOURS[0] }, (_, i) => `<button class="slot" data-act="book-meeting" data-date="${d}" data-start="${String(HOURS[0] + i).padStart(2, "0")}:00" data-who="${who.length === 1 ? who[0] : ""}" aria-label="Book ${L.fmtDay(d)} ${HOURS[0] + i}:00"></button>`).join("")}
            ${lanes(items.filter((it) => it.date === d)).map((it) => { const top = ((toMin(it.start) - HOURS[0] * 60) / span) * 100, h = ((toMin(it.end) - toMin(it.start)) / span) * 100; const w = 100 / it.lanes;
              const tag = it.href ? "a" : "div";
              return `<${tag} class="ev ${it.kind}${it.done ? " done" : ""}" ${it.href ? `href="${it.href}"` : ""} style="top:${top}%;height:${h}%;left:${it.lane * w}%;width:calc(${w}% - 3px)" data-tip="${esc(`${it.start}–${it.end} ${it.title} · ${it.sub}\n${it.people.map(L.firstName).join(", ")}`)}">
                <b>${esc(it.start)} ${esc(it.title)}</b><span>${esc(it.sub)}</span><span class="who-tags">${it.people.map((p) => `<i>${L.initials(L.personById[p])}</i>`).join("")}</span></${tag}>`; }).join("")}
          </div>`).join("")}
        </div>
      </div>`;
  };
  Object.assign(L.actions, {
    "cal-nav": (el) => { const v = +el.dataset.v; L.ui.cal.week = v === 0 ? monday(L.TODAY) : L.addDays(L.ui.cal.week, v); L.render(); },
    "cal-who": (el) => { const w = L.ui.cal.who, v = el.dataset.v; L.ui.cal.who = w.includes(v) ? (w.length > 1 ? w.filter((x) => x !== v) : w) : [...w, v]; L.render(); },
  });
})();
