// LOUD Chief of Staff: builds the daily brief that feeds the LOUD Daily Brief dashboard.
// Reads data/*.json plus this folder's targets, calendars and requests, then writes one
// JSON file per dashboard dataset into chief-of-staff/out/. No dependencies.
// Usage: node chief-of-staff/build-brief.js [--date 2026-10-29]
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const DATA = path.join(HERE, "..", "data");
const OUT = path.join(HERE, "out");
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const readData = (f) => read(path.join(DATA, f));
const write = (f, rows) => fs.writeFileSync(path.join(OUT, f), JSON.stringify(rows, null, 1) + "\n");

// ---------------------------------------------------------------- dates (all as YYYY-MM-DD, UTC)
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const toISO = (d) => d.toISOString().slice(0, 10);
const D = (s) => new Date(s + "T00:00:00Z");
const addDays = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return toISO(d); };
const weekday = (s) => ((D(s).getUTCDay() + 6) % 7) + 1; // 1 = Monday ... 7 = Sunday
const isWorkday = (s) => weekday(s) <= 5;
const nextWorkday = (s) => { let d = addDays(s, 1); while (!isWorkday(d)) d = addDays(d, 1); return d; };
const daysBetween = (a, b) => Math.round((D(b) - D(a)) / 86400000);
const fmtDay = (s) => D(s).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const fmtShort = (s) => D(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const today = arg("--date") || toISO(new Date());

const mins = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// ---------------------------------------------------------------- inputs
const clients = readData("clients.json").clients;
const team = readData("team.json");
const posts = readData("posts.json");
const visibility = readData("visibility.json");
const meetings = readData("meetings.json");
const events = readData("events.json");
const invoices = readData("invoices.json");
const activity = readData("activity.json");
const emails = readData("emails.json");
const monthly = readData("metrics-history.json").history;
const targets = read(path.join(HERE, "targets.json"));
const calFile = fs.existsSync(path.join(HERE, "calendars.json")) ? "calendars.json" : "calendars.sample.json";
const calendars = read(path.join(HERE, calFile));
const requests = read(path.join(HERE, "requests.json"));

const people = Object.fromEntries(team.team.map((p) => [p.id, p.name.split(" ")[0]]));
const leadOf = (id) => team.assignments[id];
const byId = Object.fromEntries(clients.map((c) => [c.id, c]));
const nameOf = (id) => (byId[id] ? `${byId[id].first_name} ${byId[id].last_name}` : "LOUD");
const scored = (c) => c.engagement.status !== "Onboarding";
const gbp = (n) => "£" + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------------------------------------------------------------- LinkedIn snapshots
// Each client gets one snapshot per day: followers and that day's engagement rate.
// SAMPLE MODE (now): numbers are generated, seeded by client and date so a re-run gives the
// same figures. LIVE MODE (later): replace fetchSnapshot with a call to the LinkedIn data
// provider; everything downstream stays the same.
const HISTORY_FILE = path.join(OUT, "linkedin-daily.json");
const HISTORY_START = "2026-09-01";
const seed = (str) => { let h = 2166136261; for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const rng = (s) => () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

function baseline(id) {
  const h = monthly[id] || [];
  const last = h.at(-1), prev = h.at(-2);
  const g = last && prev ? last.followers / prev.followers - 1 : 0.01;
  return { followersOct1: last ? last.followers : 1000, monthlyGrowth: g, er: last ? last.engagement_rate_pct : 2 };
}

function fetchSnapshot(id, date, prev) {
  if (process.env.LOUD_LINKEDIN === "live") throw new Error("LinkedIn feed not connected yet: set up the data provider in fetchSnapshot()");
  const b = baseline(id);
  const r = rng(seed(id + date));
  const daily = b.monthlyGrowth / 30;
  const spike = r() < 0.06 ? 3 + r() * 4 : 1; // an occasional post that takes off
  const followers = prev
    ? Math.round(prev.followers * (1 + daily * (0.2 + r() * 1.6) * spike))
    : Math.round(b.followersOct1 / Math.pow(1 + b.monthlyGrowth, 30 / 30));
  const er = Math.max(0.3, b.er * (0.7 + r() * 0.6) * (spike > 1 ? 1.3 : 1));
  return { date, followers, engagement_rate_pct: Math.round(er * 100) / 100, source: "sample" };
}

function loadHistory() {
  const hist = fs.existsSync(HISTORY_FILE) ? read(HISTORY_FILE) : {};
  for (const c of clients) {
    const rows = (hist[c.id] = (hist[c.id] || []).filter((r) => r.date <= today));
    let d = rows.length ? addDays(rows.at(-1).date, 1) : HISTORY_START;
    while (d <= today) { rows.push(fetchSnapshot(c.id, d, rows.at(-1))); d = addDays(d, 1); }
  }
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(hist) + "\n");
  return hist;
}

// ---------------------------------------------------------------- the three metrics
const hist = loadHistory();
const orangeWithin = targets.thresholds.orange_within_pct / 100;
const ratioStatus = (value, target) => (value >= target ? "green" : value >= target * (1 - orangeWithin) ? "orange" : "red");

function growthOn(id, date) {
  const rows = hist[id], i = rows.findIndex((r) => r.date === date);
  const then = rows[Math.max(0, i - 30)];
  return Math.round((rows[i].followers / then.followers - 1) * 1000) / 10;
}
function engagementOn(id, date) {
  const rows = hist[id], i = rows.findIndex((r) => r.date === date);
  const win = rows.slice(Math.max(0, i - 6), i + 1);
  return Math.round((win.reduce((s, r) => s + r.engagement_rate_pct, 0) / win.length) * 10) / 10;
}
function quarterOf(date) {
  const d = D(date), q = Math.floor(d.getUTCMonth() / 3);
  const start = toISO(new Date(Date.UTC(d.getUTCFullYear(), q * 3, 1)));
  const end = toISO(new Date(Date.UTC(d.getUTCFullYear(), q * 3 + 3, 0)));
  return { start, end, label: `Q${q + 1}` };
}
// Visibility: wins secured this quarter (completed or confirmed) against where we should be by now.
function visibilityOn(id, date) {
  const q = quarterOf(date);
  const inQ = visibility.filter((v) => v.client_id === id && v.date >= q.start && v.date <= q.end);
  const secured = inQ.filter((v) => v.status === "Completed" || v.status === "Confirmed").length;
  const pipeline = inQ.filter((v) => v.status === "Pitched" || v.status === "In discussion").length;
  const target = targets.clients[id].visibility;
  const elapsed = (daysBetween(q.start, date) + 1) / (daysBetween(q.start, q.end) + 1);
  const expected = Math.max(1, Math.ceil(target * elapsed));
  const status = secured >= expected ? "green" : secured >= expected - 1 && pipeline > 0 ? "orange" : "red";
  return { secured, pipeline, target, expected, status };
}

function scoreOn(c, date) {
  const t = targets.clients[c.id];
  const growth = growthOn(c.id, date), engagement = engagementOn(c.id, date), vis = visibilityOn(c.id, date);
  const on = scored(c);
  return {
    growth, growth_target: t.growth, growth_status: on ? ratioStatus(growth, t.growth) : "onboarding",
    engagement, engagement_target: t.engagement, engagement_status: on ? ratioStatus(engagement, t.engagement) : "onboarding",
    visibility: vis.secured, visibility_target: vis.target, visibility_expected: vis.expected, visibility_pipeline: vis.pipeline,
    visibility_status: on ? vis.status : "onboarding",
  };
}
const RANK = { red: 3, orange: 2, green: 1, onboarding: 0 };
const worst = (s) => [s.growth_status, s.engagement_status, s.visibility_status].sort((a, b) => RANK[b] - RANK[a])[0];

const yesterday = addDays(today, -1);
const scorecard = clients.map((c) => {
  const s = scoreOn(c, today), y = scoreOn(c, yesterday);
  const rows = hist[c.id];
  return {
    client_id: c.id, client: nameOf(c.id), company: c.company, lead: people[leadOf(c.id)], tier: c.engagement.tier,
    stage: c.engagement.status, ...s, overall: worst(s),
    followers: rows.at(-1).followers, followers_change_1d: rows.at(-1).followers - rows.at(-2).followers,
    growth_change_1d: Math.round((s.growth - y.growth) * 10) / 10,
    engagement_change_1d: Math.round((s.engagement - y.engagement) * 10) / 10,
  };
}).sort((a, b) => RANK[b.overall] - RANK[a.overall] || a.client.localeCompare(b.client));

// 30-day trend per client and the team-wide count of metrics on target.
const trend = [], health = [];
for (let d = addDays(today, -29); d <= today; d = addDays(d, 1)) {
  const tally = { date: d, green: 0, orange: 0, red: 0 };
  for (const c of clients) {
    const s = scoreOn(c, d);
    trend.push({ date: d, client_id: c.id, followers: hist[c.id].find((r) => r.date === d).followers, growth_30d: s.growth, engagement_7d: s.engagement });
    if (!scored(c)) continue;
    for (const k of ["growth_status", "engagement_status", "visibility_status"]) tally[s[k]]++;
  }
  health.push(tally);
}

// ---------------------------------------------------------------- calendars and the day plan
function busyFor(person, date) {
  const blocks = [];
  for (const r of calendars.recurring) if (r.person === person && r.days.includes(weekday(date))) blocks.push({ ...r, date });
  for (const o of calendars.one_off) if (o.person === person && o.date === date) blocks.push(o);
  for (const e of events) if (e.date === date && e.attendees.includes(person)) blocks.push({ ...e, kind: e.title.startsWith("Focus") ? "focus" : "team" });
  for (const m of meetings) if (m.date === date && m.status === "Scheduled" && m.attendees.includes(person))
    blocks.push({ date, start: m.start, end: m.end, title: `${m.type}: ${nameOf(m.client_id)}`, kind: "client", ref: m.id, location: m.location });
  return blocks.map((b) => ({ ...b, s: mins(b.start), e: mins(b.end) }));
}
const overlaps = (blocks, s, e) => blocks.some((b) => s < b.e && e > b.s);
const freeGaps = (blocks, from, to) => {
  const gaps = []; let cur = from;
  for (const b of [...blocks].sort((a, b) => a.s - b.s)) { if (b.s > cur) gaps.push([cur, Math.min(b.s, to)]); cur = Math.max(cur, b.e); }
  if (cur < to) gaps.push([cur, to]);
  return gaps.filter(([a, b]) => b > a);
};

// Propose a slot for each meeting request: earliest workday in its date range, afternoons first
// so morning focus time stays whole, and never over protected personal time.
const proposed = []; // placed blocks, so two proposals don't collide
function propose(req) {
  const hours = (p) => calendars.working_hours[p];
  let day = req.from > today ? req.from : today;
  const tried = [];
  for (; day <= req.by; day = addDays(day, 1)) {
    if (!isWorkday(day)) continue;
    const win = req.window || { start: hours(req.owner).start, end: hours(req.owner).end };
    const ws = mins(win.start), we = mins(win.end);
    const ownHours = req.attendees.every((p) => ws >= mins(hours(p).start) && we <= mins(hours(p).end));
    const order = [];
    for (let s = ws; s + req.minutes <= we; s += 15) order.push(s);
    if (!req.window) order.sort((a, b) => (a >= 13 * 60 + 30 ? 0 : 1) - (b >= 13 * 60 + 30 ? 0 : 1) || a - b);
    for (const s of order) {
      const e = s + req.minutes;
      const clash = req.attendees.some((p) => overlaps([...busyFor(p, day), ...proposed.filter((x) => x.person === p && x.date === day)], s, e));
      if (clash) continue;
      for (const p of req.attendees) proposed.push({ person: p, date: day, s, e, title: req.title, kind: "proposed", ref: req.id });
      const reason = req.window
        ? `${nameOf(req.client_id).split(" ")[0]} asked for ${win.start}–${win.end}. ${tried.length ? `On earlier days, ${tried[0]} fills that hour.` : ""}`.trim()
        : day === today ? "Afternoon slot, so your morning focus block stays whole." : `First free afternoon slot before ${fmtShort(req.by)}.`;
      return { date: day, start: hhmm(s), end: hhmm(e), status: ownHours ? "Proposed" : "Needs your OK", reason: ownHours ? reason : `${reason} This is outside working hours.` };
    }
    const block = req.attendees.flatMap((p) => busyFor(p, day)).find((b) => b.s < we && b.e > ws);
    if (block) tried.push(block.title.toLowerCase());
  }
  return { date: null, start: null, end: null, status: "No slot", reason: `Nothing free before ${fmtShort(req.by)}. Offer the client new dates.` };
}
const proposals = requests.requests.map((r) => {
  const p = propose(r);
  return {
    id: r.id, client_id: r.client_id, client: nameOf(r.client_id), owner: people[r.owner], title: r.title, minutes: r.minutes,
    slot_date: p.date, slot_day: p.date ? fmtDay(p.date) : "—", slot_start: p.start, slot_end: p.end, status: p.status, reason: p.reason, source: r.source,
  };
});

// The suggested day: fixed items, today's proposals, lunch, focus time and an admin block.
const schedule = [];
for (const person of Object.keys(calendars.working_hours)) {
  const wh = calendars.working_hours[person];
  const ws = mins(wh.start), we = mins(wh.end);
  const blocks = [...busyFor(person, today), ...proposed.filter((x) => x.person === person && x.date === today)];
  const add = (s, e, title, kind) => blocks.push({ s, e, title, kind, start: hhmm(s), end: hhmm(e), added: true });
  const lunch = freeGaps(blocks, 12 * 60, 14 * 60).find(([a, b]) => b - a >= 30);
  if (lunch) add(lunch[0], lunch[0] + 30, "Lunch", "break");
  let need = wh.focus_minutes;
  for (const [a, b] of freeGaps(blocks, ws, we)) {
    if (need <= 0) break;
    const len = Math.min(b - a, need);
    if (len < 60) continue;
    add(a, a + len, wh.focus_label, "focus"); need -= len;
  }
  const admin = freeGaps(blocks, ws, we).reverse().find(([a, b]) => b - a >= 30);
  if (admin) add(admin[1] - 30, admin[1], "Inbox, approvals & chasers", "admin");
  for (const b of blocks.sort((x, y) => x.s - y.s)) {
    const prop = b.kind === "proposed" ? proposals.find((p) => p.id === b.ref) : null;
    schedule.push({
      id: `${person}-${hhmm(b.s)}`, person: people[person], date: today, start: hhmm(b.s), end: hhmm(b.e), title: b.title,
      kind: b.kind, suggested: !!(b.added || prop), protected: !!b.protected, note: prop ? "Proposed — needs a yes" : b.added ? "Suggested" : b.location || "",
    });
  }
  if (need > 0) schedule.push({ id: `${person}-focus-short`, person: people[person], date: today, start: "", end: "", title: `Only ${wh.focus_minutes - need} of ${wh.focus_minutes} focus minutes fit today`, kind: "warning", suggested: true, protected: false, note: "" });
}

// ---------------------------------------------------------------- alerts, content and tasks
const actions = [];
const act = (owner, kind, severity, text, detail, client_id = null, due = null) =>
  actions.push({ id: `A${String(actions.length + 1).padStart(2, "0")}`, owner: people[owner] || owner, kind, severity, text, detail, client: client_id ? nameOf(client_id) : "", due });

for (const s of scorecard) if (s.stage !== "Onboarding") {
  const reds = ["growth", "engagement", "visibility"].filter((k) => s[k + "_status"] === "red");
  if (reds.length >= 2) act(leadOf(s.client_id), "alert", "red", `${s.client} is at risk`, `Behind on ${reds.join(" and ")}. Agree a recovery plan this week.`, s.client_id);
}
for (const c of clients) {
  const start = D(c.engagement.start_date), t = D(today);
  start.setUTCFullYear(t.getUTCFullYear()); if (start <= t) start.setUTCFullYear(start.getUTCFullYear() + 1);
  const days = daysBetween(today, toISO(start));
  if (days <= 45) act(leadOf(c.id), "alert", "orange", `${nameOf(c.id)} renews in ${days} days`, `Renewal ${fmtShort(toISO(start))}. Prepare a results report.`, c.id, toISO(start));
}
for (const inv of invoices.filter((i) => i.type === "invoice")) {
  const total = inv.lines.reduce((s, l) => s + l.qty * l.unit_price * (1 + l.vat_rate), 0);
  const label = `${inv.number || "Draft " + inv.id} · ${nameOf(inv.client_id)} · ${gbp(total)}`;
  if (inv.status === "Sent" && inv.due_date < today) act(inv.prepared_by, "alert", "red", `Invoice ${daysBetween(inv.due_date, today)} days overdue`, label, inv.client_id, inv.due_date);
  else if (inv.status === "Sent" && inv.due_date <= nextWorkday(today)) act(inv.prepared_by, "alert", "orange", `Invoice due ${fmtShort(inv.due_date)}`, label, inv.client_id, inv.due_date);
  else if (inv.status === "Changes requested") act(inv.prepared_by, "alert", "orange", "Invoice sent back with changes", label, inv.client_id);
}
const drafts = invoices.filter((i) => i.type === "invoice" && i.status === "Draft");
for (const owner of Object.keys(people)) {
  const mine = drafts.filter((i) => i.prepared_by === owner);
  if (mine.length) act(owner, "task", "info", `Finish ${mine.length} draft invoice${mine.length > 1 ? "s" : ""} for approval`, mine.map((i) => nameOf(i.client_id)).join(" · "));
}

const contentRules = [
  { status: "Client review", until: addDays(today, 2), text: "Chase client approval", sev: (p) => (p.date < today ? "red" : "orange") },
  { status: "Approved", until: nextWorkday(today), text: "Schedule approved posts", sev: () => "info" },
  { status: "Drafted", until: addDays(today, 5), text: "Send drafts for approval", sev: () => "orange" },
  { status: "Idea", until: addDays(today, 7), text: "Write first drafts", sev: () => "info" },
];
for (const owner of Object.keys(people)) for (const r of contentRules) {
  const list = posts.filter((p) => p.owner === owner && p.status === r.status && p.date <= r.until).sort((a, b) => a.date.localeCompare(b.date));
  if (!list.length) continue;
  const sev = list.some((p) => r.sev(p) === "red") ? "red" : r.sev(list[0]);
  act(owner, "content", sev, `${r.text}: ${list.length} post${list.length > 1 ? "s" : ""}`,
    list.map((p) => `${nameOf(p.client_id)} (${p.date < today ? "was due " : ""}${fmtShort(p.date)})`).join(" · "));
}
for (const t of requests.tasks) act(t.owner, "task", daysBetween(today, t.due) <= 2 ? "orange" : "info", t.text, `Due ${fmtDay(t.due)} · ${t.source}`, t.client_id, t.due);
const sevRank = { red: 0, orange: 1, info: 2 };
actions.sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || a.kind.localeCompare(b.kind));
actions.forEach((a, i) => (a.id = `A${String(i + 1).padStart(2, "0")}`));

// ---------------------------------------------------------------- meeting prep briefs
const prepDays = [today, nextWorkday(today)];
const metricLine = (s) => [
  { k: "Growth", st: s.growth_status, v: `${s.growth > 0 ? "+" : ""}${s.growth}% in 30 days (target ${s.growth_target}%)` },
  { k: "Engagement", st: s.engagement_status, v: `${s.engagement}% avg, last 7 days (target ${s.engagement_target}%)` },
  { k: "Visibility", st: s.visibility_status, v: `${s.visibility} of ${s.visibility_target} wins secured this quarter (${s.visibility >= s.visibility_expected ? "on pace" : "behind pace"})` },
];
const talkingPoint = (s) => {
  if (s.stage === "Onboarding") return "Onboarding: confirm voice, pillars and the approval rhythm before we start scoring.";
  if (s.engagement_status === "red") return "Engagement is well below target: propose more conversational formats (polls, questions, personal stories).";
  if (s.growth_status === "red") return "Follower growth has stalled: suggest a collaboration post or a newsletter push to reach new audiences.";
  if (s.visibility_status !== "green") return `Visibility is behind pace: ${s.visibility_pipeline} opportunit${s.visibility_pipeline === 1 ? "y is" : "ies are"} in the pipeline. Ask for warm intros.`;
  if (s.engagement_status === "orange") return "Engagement is just under target: test one more personal-story post this month.";
  if (s.growth_status === "orange") return "Growth is just under target: line up a repost or collaboration with a peer.";
  return "All three metrics on target: share the wins and agree the next stretch goal.";
};
const briefs = meetings.filter((m) => prepDays.includes(m.date) && m.status === "Scheduled").sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).map((m) => {
  const s = scorecard.find((x) => x.client_id === m.client_id);
  const lastMeeting = meetings.filter((x) => x.client_id === m.client_id && x.status === "Completed").sort((a, b) => b.date.localeCompare(a.date))[0];
  const open = lastMeeting ? (lastMeeting.actions || []).filter((a) => !a.done).map((a) => `${a.text} (${people[a.owner] || a.owner})`) : [];
  const touch = [...activity.filter((a) => a.client_id === m.client_id).map((a) => ({ date: a.date, text: `${a.type}: ${a.summary}` })),
    ...emails.filter((e) => e.related && e.related.id === m.client_id && e.folder !== "sent").map((e) => ({ date: e.date.slice(0, 10), text: `Email: “${e.body.split("\n").filter(Boolean)[1] || e.subject}”` }))]
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const review = posts.filter((p) => p.client_id === m.client_id && p.status === "Client review").length;
  const next = visibility.filter((v) => v.client_id === m.client_id && v.date >= today && ["Confirmed", "Pitched", "In discussion"].includes(v.status)).sort((a, b) => a.date.localeCompare(b.date))[0];
  const money = invoices.find((i) => i.client_id === m.client_id && i.type === "invoice" && i.status === "Sent" && i.due_date < today);
  return {
    meeting_id: m.id, when: `${m.date === today ? "Today" : fmtDay(m.date)} ${m.start}–${m.end}`, date: m.date, start: m.start,
    owner: m.attendees.map((p) => people[p]).filter((v, i, a) => a.indexOf(v) === i).join(" & "), client: nameOf(m.client_id), company: byId[m.client_id].company,
    type: m.type, location: m.location, overall: s.overall, metrics: metricLine(s),
    last_contact: touch ? `${fmtShort(touch.date)} · ${touch.text}` : "No recent contact logged",
    open_items: open.length ? open : ["Nothing outstanding from the last meeting"],
    in_flight: `${review} post${review === 1 ? "" : "s"} waiting for their approval` + (next ? ` · Next: ${next.name} (${next.status.toLowerCase()}, ${fmtShort(next.date)})` : ""),
    money: money ? `${money.number} is ${daysBetween(money.due_date, today)} days overdue` : "",
    talking_point: talkingPoint(s),
  };
});

// ---------------------------------------------------------------- the week so far (full wrap on Fridays)
const monday = addDays(today, 1 - weekday(today));
const week = [];
const w = (kind, owner, text) => week.push({ id: `W${String(week.length + 1).padStart(2, "0")}`, kind, owner, text });
const pubWeek = posts.filter((p) => p.status === "Published" && p.date >= monday && p.date <= today);
for (const p of Object.keys(people)) {
  const mine = pubWeek.filter((x) => x.owner === p);
  if (mine.length) {
    const best = mine.reduce((a, b) => ((a.results?.impressions || 0) >= (b.results?.impressions || 0) ? a : b));
    w("win", people[p], `${mine.length} post${mine.length > 1 ? "s" : ""} published. Best: ${nameOf(best.client_id)}, ${(best.results?.impressions || 0).toLocaleString("en-GB")} impressions.`);
  }
}
for (const c of clients.filter(scored)) {
  const now = scoreOn(c, today), then = scoreOn(c, monday);
  for (const [k, label] of [["growth", "follower growth"], ["engagement", "engagement"], ["visibility", "visibility"]]) {
    if (now[k + "_status"] === "green" && then[k + "_status"] !== "green") w("win", people[leadOf(c.id)], `${nameOf(c.id)}: ${label} back on target.`);
    if (now[k + "_status"] === "red" && then[k + "_status"] !== "red") w("miss", people[leadOf(c.id)], `${nameOf(c.id)}: ${label} slipped well behind target.`);
  }
}
for (const v of visibility.filter((v) => v.date >= monday && v.date <= today && v.status === "Completed")) w("win", people[v.owner], `${nameOf(v.client_id)}: ${v.name} done.`);
const slipped = posts.filter((p) => p.date >= monday && p.date < today && p.status !== "Published");
if (slipped.length) w("miss", "Team", `${slipped.length} post${slipped.length > 1 ? "s" : ""} missed ${slipped.length > 1 ? "their" : "its"} publish date: ${slipped.map((p) => nameOf(p.client_id)).join(", ")}.`);
const overdue = invoices.filter((i) => i.type === "invoice" && i.status === "Sent" && i.due_date < today);
if (overdue.length) w("miss", "Team", `${overdue.length} invoice${overdue.length > 1 ? "s" : ""} overdue: ${overdue.map((i) => `${i.number} (${nameOf(i.client_id)})`).join(", ")}.`);
const nextMon = addDays(monday, 7), nextFri = addDays(monday, 11);
const nextMeetings = meetings.filter((m) => m.date >= nextMon && m.date <= nextFri && m.status === "Scheduled");
if (nextMeetings.length) w("next", "Team", `${nextMeetings.length} client meeting${nextMeetings.length > 1 ? "s" : ""} next week: ${nextMeetings.map((m) => `${m.type.toLowerCase()} with ${nameOf(m.client_id).split(" ")[0]} (${fmtDay(m.date)})`).join(", ")}.`);
for (const v of visibility.filter((v) => v.date >= nextMon && v.date <= nextFri && v.status === "Confirmed")) w("next", people[v.owner], `${nameOf(v.client_id)}: ${v.name} on ${fmtDay(v.date)}.`);
for (const t of requests.tasks.filter((t) => t.due <= nextFri)) w("next", people[t.owner], `${t.text} (due ${fmtDay(t.due)}).`);

// ---------------------------------------------------------------- the day's headline and write-out
const active = scorecard.filter((s) => s.stage !== "Onboarding");
const meta = [{
  date: today, day_label: D(today).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
  is_friday: weekday(today) === 5, active_clients: active.length, onboarding_clients: scorecard.length - active.length,
  clients_all_green: active.filter((s) => s.overall === "green").length,
  needs_attention: active.filter((s) => s.overall === "red").map((s) => s.client).join(", "),
  watch: active.filter((s) => s.overall === "orange").map((s) => s.client).join(", "),
  open_requests: proposals.length, red_actions: actions.filter((a) => a.severity === "red").length,
  data_mode: process.env.LOUD_LINKEDIN === "live" ? "live" : "sample", calendars: calFile === "calendars.json" ? "google" : "sample",
  built_at: new Date().toISOString(),
}];

fs.mkdirSync(OUT, { recursive: true });
write("meta.json", meta);
write("scorecard.json", scorecard);
write("trend.json", trend);
write("health.json", health);
write("schedule.json", schedule);
write("proposals.json", proposals);
write("actions.json", actions);
write("briefs.json", briefs.map(({ metrics, open_items, ...b }) => ({
  ...b, growth_status: metrics[0].st, growth_text: metrics[0].v, engagement_status: metrics[1].st, engagement_text: metrics[1].v,
  visibility_status: metrics[2].st, visibility_text: metrics[2].v, open_items: open_items.join(" · "),
})));
write("week.json", week);
console.log(`Brief for ${today}: ${active.length} active clients, ${meta[0].clients_all_green} fully green; ${proposals.length} meeting requests; ${actions.length} actions; ${briefs.length} prep briefs; ${week.length} weekly items.`);
