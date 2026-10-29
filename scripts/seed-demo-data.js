// Seeds the fictional demo history for the LOUD CRM. Deterministic (seeded RNG).
// Writes: metrics-history, posts, visibility, activity, meetings, research, worklog,
// invoices, expenses, vat-returns, events, emails.   Usage: npm run seed
const fs = require("fs");
const path = require("path");
const F = require("../crm/js/finance.js");

const root = path.join(__dirname, "..");
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, "data", f), "utf8"));
const write = (f, obj) => fs.writeFileSync(path.join(root, "data", f), JSON.stringify(obj, null, 2) + "\n");

const company = read("company.json");
const { clients } = read("clients.json");
const { team, assignments } = read("team.json");
const TODAY = company.demo_today;
const byId = Object.fromEntries(clients.map((c) => [c.id, c]));
const teamById = Object.fromEntries(team.map((t) => [t.id, t]));
const other = (tid) => (tid === "T1" ? "T2" : "T1");
const TIERS = company.service_tiers;

// ---------------------------------------------------------------- helpers
let seed = 20261028;
const rand = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (a, b) => a + rand() * (b - a);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const round = (n, d = 0) => Math.round(n * 10 ** d) / 10 ** d;
const pad = (n, w = 3) => String(n).padStart(w, "0");
const { addDays, addMonths, daysBetween } = F;
const dow = (s) => new Date(s + "T12:00:00Z").getUTCDay();
const weekday = (s) => (dow(s) === 6 ? addDays(s, 2) : dow(s) === 0 ? addDays(s, 1) : s);
const lastDay = (ym) => addDays(addMonths(ym + "-01", 1), -1);
const monthLabel = (ym) => new Date(ym + "-01T12:00:00Z").toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const short = (s) => new Date(s + "T12:00:00Z").toLocaleString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const n0 = (n) => Math.round(n).toLocaleString("en-GB");

// ---------------------------------------------------------------- metrics history (24 months)
const MONTHS = [];
for (let m = "2024-11-01"; m <= "2026-10-01"; m = addMonths(m, 1)) MONTHS.push(m);
const metrics = {};
for (const c of clients) {
  const li = c.linkedin;
  let s = {
    followers: li.followers, engagement_rate_pct: li.avg_engagement_rate_pct, avg_impressions_per_post: li.avg_impressions_per_post,
    posts: li.posts_per_month, profile_views_30d: Math.round(li.profile_views_90d / 3), ssi_score: li.ssi_score,
  };
  const snaps = [{ month: MONTHS.at(-1), ...s }];
  const g0 = li.follower_growth_90d_pct / 3 / 100;
  for (let i = MONTHS.length - 2; i >= 0; i--) {
    const withLoud = c.engagement.start_date < MONTHS[i + 1];
    const g = (withLoud ? g0 : g0 * 0.3) * between(0.75, 1.25);
    const prevF = Math.round(s.followers / (1 + g));
    const prevE = Math.max(0.5, round(s.engagement_rate_pct - (withLoud ? between(0.01, 0.07) : between(-0.04, 0.04)), 1));
    s = {
      followers: prevF,
      engagement_rate_pct: prevE,
      avg_impressions_per_post: Math.round(s.avg_impressions_per_post * (prevF / s.followers) * Math.sqrt(prevE / s.engagement_rate_pct) * between(0.95, 1.02)),
      posts: withLoud ? Math.max(1, s.posts + pick([-1, 0, 0, 1])) : Math.max(0, Math.min(2, s.posts - pick([0, 1]))),
      profile_views_30d: Math.round(s.profile_views_30d * (withLoud ? between(0.9, 1.0) : between(0.97, 1.02))),
      ssi_score: Math.max(20, s.ssi_score - (withLoud ? pick([0, 0, 1]) : pick([0, 0, 0, 1]))),
    };
    snaps.unshift({ month: MONTHS[i], ...s });
  }
  for (const sn of snaps) sn.reach_30d = Math.round(sn.posts * sn.avg_impressions_per_post * 0.72);
  metrics[c.id] = snaps;
}

// ---------------------------------------------------------------- content calendar
const HOOKS = [
  (p) => `${p}: the mistake I made early on`, (p) => `${p}: 3 things I'd tell my younger self`,
  (p) => `${p}: what the data actually says`, (p) => `${p}: a story from this week`,
  (p) => `${p}: the question I get asked most`, (p) => `${p}: an unpopular opinion`,
  (p, c) => `${p}: inside ${c.company}`, (p) => `${p}: what changes in 2027`,
  (p) => `${p}: the framework I use with my team`, (p, c) => `${p}: lessons from ${c.career_history[1].company}`,
  (p) => `${p}: a myth worth retiring`, (p) => `${p}: what I got wrong last year`,
];
const statusFor = (date) => {
  const d = daysBetween(TODAY, date);
  if (d < 0) return "Published";
  if (d <= 3) return rand() < 0.8 ? "Approved" : "Client review";
  if (d <= 10) return rand() < 0.7 ? "Client review" : "Drafted";
  if (d <= 20) return rand() < 0.75 ? "Drafted" : "Idea";
  return "Idea";
};
const posts = [];
for (const c of clients) {
  const perMonth = TIERS[c.engagement.tier].posts_per_month;
  const firstDay = c.engagement.start_date > "2026-09-17" ? addDays(c.engagement.start_date, 14) : "2026-10-01";
  const longForm = c.engagement.tier !== "Volume";
  const used = new Set();
  for (const month of ["2026-10", "2026-11"]) {
    const dim = month === "2026-10" ? 31 : 30;
    const step = dim / perMonth;
    for (let k = 0; k < perMonth; k++) {
      const day = Math.min(dim, Math.max(1, Math.round(k * step + between(1, step))));
      const date = `${month}-${String(day).padStart(2, "0")}`;
      if (date < firstDay) continue;
      const pillar = c.content_pillars[k % c.content_pillars.length];
      let h;
      do h = Math.floor(rand() * HOOKS.length); while (used.has(`${pillar}|${h}`));
      used.add(`${pillar}|${h}`);
      const format = longForm && k % 5 === 4 ? (c.other_channels.newsletter_subscribers > 0 ? "Newsletter" : "Article")
        : pick(["Text post", "Text post", "Text post", "Carousel", "Carousel", "Short video", "Poll"]);
      const status = statusFor(date);
      const p = { id: "", client_id: c.id, date, title: HOOKS[h](pillar, c), pillar, format, channel: format === "Newsletter" ? "Newsletter" : "LinkedIn", owner: assignments[c.id], status };
      if (status === "Published") {
        const imp = Math.round(c.linkedin.avg_impressions_per_post * between(0.55, 1.8));
        const inter = Math.round((imp * c.linkedin.avg_engagement_rate_pct * between(0.6, 1.5)) / 100);
        p.results = { impressions: imp, reactions: Math.round(inter * 0.82), comments: Math.round(inter * 0.13), reposts: Math.round(inter * 0.05) };
      }
      posts.push(p);
    }
  }
}
posts.sort((a, b) => a.date.localeCompare(b.date) || a.client_id.localeCompare(b.client_id));
posts.forEach((p, i) => (p.id = `P-${pad(i + 1)}`));

// ---------------------------------------------------------------- visibility pipeline (fictional outlets)
const V = (client_id, type, name, date, status, note = "") => ({ client_id, type, name, date, status, note });
const visibility = [
  V("LOUD-001", "Speaking", "Brand Forward Summit, London — Keynote", "2027-03-10", "In discussion", "Shortlisted for main-stage keynote; deck due 15 Dec."),
  V("LOUD-001", "Podcast", "The Shelf Life Podcast", "2026-11-12", "Confirmed", "Episode on reviving heritage snack brands."),
  V("LOUD-001", "Media", "Grocery Trade Weekly — CMO roundtable", "2026-10-14", "Completed", "Quoted on Gen Z snacking; 3 pickups."),
  V("LOUD-001", "Award", "Marketing Leaders 50", "2026-12-01", "Pitched", "Nomination submitted 20 Oct."),
  V("LOUD-002", "Speaking", "Beauty Operators Forum — Fireside chat", "2026-11-18", "Confirmed", "Fireside on DTC-to-retail scaling."),
  V("LOUD-002", "Media", "The Business Ledger — CEO profile", "2026-12-05", "In discussion", "Interview in November; IPO talk off-limits."),
  V("LOUD-002", "Podcast", "Founders & Operators", "2026-09-22", "Completed", "Top-10 episode of the month for the show."),
  V("LOUD-002", "Media", "Clean Label Report — Op-ed", "2026-11-04", "Pitched", "Op-ed on clean beauty standards."),
  V("LOUD-002", "Award", "Retail Visionary of the Year", "2027-01-20", "Pitched", "Application in progress."),
  V("LOUD-003", "Podcast", "Sip & Scale", "2026-10-09", "Completed", "Functional beverage trends episode."),
  V("LOUD-003", "Speaking", "Beverage Innovation Expo, Birmingham — Panel", "2027-02-04", "Confirmed", "Panel: data-driven innovation."),
  V("LOUD-003", "Media", "Drinks Industry Insider — Trend quote", "2026-11-08", "In discussion", "Year-end trends feature."),
  V("LOUD-003", "Speaking", "Women in Growth Leadership Breakfast", "2026-12-03", "Pitched"),
  V("LOUD-004", "Media", "Packaging Futures Journal — Interview", "2026-11-20", "Pitched", "Refill/reuse pilot results."),
  V("LOUD-004", "Speaking", "Circular Economy Forum — Panel", "2027-04-15", "Pitched", "First pitch since onboarding."),
  V("LOUD-005", "Podcast", "The Strategic CFO Show", "2026-11-13", "Confirmed", "Healthtech unit economics."),
  V("LOUD-005", "Media", "Health Finance Daily — Guest column", "2026-12-10", "Pitched"),
  V("LOUD-005", "Speaking", "Latinas in Finance UK Summit", "2026-08-21", "Completed", "Mentorship panel; 140 new followers that week."),
  V("LOUD-006", "Speaking", "FinTech Builders Conference, London — Keynote", "2026-11-05", "Confirmed", "Responsible AI in banking."),
  V("LOUD-006", "Podcast", "Code & Capital", "2026-10-01", "Completed"),
  V("LOUD-006", "Media", "Banking Technology Review — Op-ed", "2026-10-21", "Completed", "Op-ed on AI governance; strong engagement."),
  V("LOUD-006", "Award", "Tech Leaders Honour Roll", "2026-12-15", "In discussion", "Finalist notification expected early Dec."),
  V("LOUD-006", "Speaking", "University Tech Leadership Series", "2026-09-17", "Declined", "Scheduling conflict."),
  V("LOUD-007", "Speaking", "Interface Design Conference — Talk", "2027-05-12", "Pitched", "Talk: 'AI and the end of the screen'."),
  V("LOUD-007", "Podcast", "Design Leadership Diaries", "2026-11-25", "Confirmed"),
  V("LOUD-007", "Media", "Motion & Mobility Magazine — Feature", "2026-12-01", "In discussion", "Feature on in-vehicle UX."),
  V("LOUD-008", "Speaking", "Hospitality People Summit — Keynote", "2026-11-10", "Confirmed", "Frontline culture keynote."),
  V("LOUD-008", "Media", "Workforce Today — Profile", "2026-10-07", "Completed"),
  V("LOUD-008", "Podcast", "The Front Desk", "2026-12-08", "Confirmed"),
  V("LOUD-008", "Media", "Book proposal — literary agent meetings", "2026-11-30", "In discussion", "Two agents interested; sample chapter in progress."),
  V("LOUD-008", "Award", "Chief People Officer Awards", "2027-02-26", "Pitched"),
  V("LOUD-009", "Podcast", "Supply Chain Uncut", "2026-12-11", "Pitched", "First pitch: military logistics lessons."),
  V("LOUD-009", "Media", "Logistics Leader Weekly — Q&A", "2026-11-27", "Pitched", "Veteran hiring angle."),
  V("LOUD-010", "Speaking", "Clean Energy Communicators Summit — Keynote", "2026-11-19", "Confirmed"),
  V("LOUD-010", "Media", "National Energy Desk — Op-ed", "2026-10-16", "Completed", "Op-ed on transition storytelling; syndicated 4x."),
  V("LOUD-010", "Podcast", "Power Lines", "2026-09-30", "Completed"),
  V("LOUD-010", "Podcast", "Crisis Ready", "2026-11-06", "Confirmed"),
  V("LOUD-010", "Award", "Communicator of the Year — Energy", "2027-01-15", "In discussion", "Shortlisted."),
].sort((a, b) => a.date.localeCompare(b.date)).map((v, i) => ({ id: `V-${pad(i + 1)}`, ...v, owner: assignments[v.client_id] }));

// ---------------------------------------------------------------- per-client story (drives notes + research)
const STORY = {
  "LOUD-001": { tone: "warm, confident, a little irreverent", sensitive: "No commentary on competitor brands by name; retail partner news only after it is public", highlight: "Gen Z snacking carousel was her best post of the year", concern: "Wants more inbound from senior marketing talent, not just reach", next: "Lean into the 'heritage brand reinvention' story ahead of the Brand Forward keynote decision",
    market: "UK CPG marketing leadership; heritage-brand turnaround and retail media", peers: ["CMOs at challenger snack brands who post daily on trend data", "Retail-media specialists building audiences among brand managers", "Agency founders writing about heritage-brand revivals"], gap: "Few CPG CMOs share the inside story of reinventing a heritage brand with numbers attached", formats: "data carousels, behind-the-scenes shelf photos, short opinion posts" },
  "LOUD-002": { tone: "measured, founder-adjacent, plain-spoken", sensitive: "Nothing that could read as IPO signalling; investor topics need legal sign-off", highlight: "Founders & Operators podcast drove the biggest profile-view spike since joining", concern: "Engagement flat despite large audience — announcement posts underperform", next: "Shift to personal CEO stories; test two short videos in November",
    market: "Clean beauty and DTC-to-retail scaling; investor and retail-partner audiences", peers: ["Founder-CEOs of DTC beauty brands with strong personal followings", "Retail-buyer voices commenting on beauty category trends", "Operator-CEOs writing about scaling culture"], gap: "Operator-CEO perspective (not founder) on scaling a clean beauty brand is under-represented", formats: "short talking-head video, reflective long posts, Q&A carousels" },
  "LOUD-003": { tone: "curious, analytical, energetic", sensitive: "Pipeline and launch dates are confidential until announced", highlight: "Newsletter passed 1,400 subscribers; posts averaging 4.6% engagement", concern: "Wants trade-press quotes to match her LinkedIn growth", next: "Package insight-to-innovation framework as a downloadable one-pager for press",
    market: "Functional beverages and insight-led innovation in UK drinks", peers: ["Insight directors at large drinks groups sharing consumer data", "Functional-drinks founders posting launch diaries", "Trend forecasters covering the drinks category"], gap: "A C-suite growth leader translating insight into launches, step by step", formats: "frameworks, trend charts, newsletter deep-dives" },
  "LOUD-004": { tone: "practical, evidence-led, modest", sensitive: "ESG claims must be verifiable — comms team reviews any numbers", highlight: "Discovery: strong untold story in the refill pilot results", concern: "Nervous about greenwashing accusations; prefers to under-claim", next: "Build a 'what actually works' series anchored in pilot data",
    market: "Sustainable packaging and circularity in household care", peers: ["Sustainability directors at FMCG groups posting ESG reports", "Packaging engineers with niche but loyal followings", "Circular-economy NGOs and commentators"], gap: "An engineer-turned-director who can explain trade-offs honestly", formats: "explainers, before/after packaging visuals, myth-busting posts" },
  "LOUD-005": { tone: "crisp, strategic, encouraging", sensitive: "No numbers on fundraising until announced; board season limits availability", highlight: "Latinas in Finance UK panel brought 140 new followers in a week", concern: "Posting cadence slipped to 2/month during board season", next: "Batch-approve drafts every other Friday; pre-write 6 evergreen posts",
    market: "Healthtech finance; the strategic CFO; diversity in finance leadership", peers: ["Startup CFOs writing about fundraising and unit economics", "Finance-leadership community builders", "Healthtech investors posting market commentary"], gap: "A healthtech CFO explaining reimbursement-driven economics in plain English", formats: "explainer threads, mentorship stories, simple finance charts" },
  "LOUD-006": { tone: "authoritative, technical but accessible", sensitive: "Regulator topics need compliance review; no product roadmap details", highlight: "Banking Technology Review op-ed was widely shared by peers", concern: "Wants an advisory board seat — needs governance credibility", next: "Keynote follow-up content and a responsible-AI governance series",
    market: "Responsible AI and core modernisation in UK financial services", peers: ["Bank CTOs with established AI commentary", "RegTech founders writing on AI governance", "Engineering-culture writers in fintech"], gap: "A CTO who pairs AI ambition with concrete governance practice", formats: "keynote clips, governance checklists, team-culture stories" },
  "LOUD-007": { tone: "visual, optimistic, playful", sensitive: "Unreleased vehicle UI cannot be shown", highlight: "Fastest-growing client: +27% followers in six months", concern: "Wants to reach a broader tech audience beyond designers", next: "Scope a design newsletter (possible upgrade to Amplify)",
    market: "In-vehicle UX, design leadership and AI interfaces", peers: ["Design leaders at EV makers with large design audiences", "UX writers covering AI interfaces", "Design-ops community voices"], gap: "Bridging automotive UX and the wider 'post-screen' AI interface debate", formats: "sketches and prototypes, short videos, design-leadership advice" },
  "LOUD-008": { tone: "warm, grounded, story-first", sensitive: "No individual employee stories without consent", highlight: "Two literary agents interested in the frontline culture book", concern: "Posting volume dipped while she travels between properties", next: "Capture voice notes on site visits; turn them into posts within 48 hours",
    market: "Frontline workforce culture in hospitality; people leadership", peers: ["CPOs in retail and hospitality with large HR audiences", "Workplace-culture authors", "Hospitality operators sharing team stories"], gap: "Frontline-first culture told from the C-suite with real stories", formats: "story posts, on-site photos, book-in-progress updates" },
  "LOUD-009": { tone: "direct, disciplined, understated", sensitive: "Customer names are confidential; no automation headcount figures", highlight: "Kickoff: compelling military-to-logistics leadership story", concern: "Very low baseline and limited time — needs a light-touch process", next: "Profile overhaul, two posts a week, five thoughtful comments a day",
    market: "Warehouse automation, last-mile and operational resilience in UK logistics", peers: ["Logistics COOs posting about automation", "Supply-chain analysts with newsletter audiences", "Veteran-employment advocates"], gap: "Automation without layoffs, told by an ex-Army logistics officer", formats: "short lessons-learned posts, warehouse floor photos, veteran hiring stories" },
  "LOUD-010": { tone: "sharp, newsy, confident", sensitive: "Planning-application topics need legal review", highlight: "National Energy Desk op-ed syndicated four times", concern: "Wants the newsletter to reach 10K subscribers", next: "Weekly newsletter cadence plus cross-promotion from podcast appearances",
    market: "Energy-transition communications and crisis comms", peers: ["Comms directors at utilities and renewables developers", "Climate journalists with large followings", "Crisis-comms consultants"], gap: "An ex-reporter CCO explaining how energy stories actually land", formats: "newsletter, op-eds, newsroom-style breakdowns" },
};

// ---------------------------------------------------------------- meetings
const SLOTS = ["09:30", "11:00", "13:30", "15:00", "16:30"];
const busy = new Set(); // `${tid}|${date}|${slot}`
const takeSlot = (date, attendees, prefer) => {
  for (let tries = 0; tries < 10; tries++) {
    const d = weekday(addDays(date, tries));
    const order = prefer ? [prefer, ...SLOTS.filter((s) => s !== prefer)] : SLOTS;
    for (const s of order) if (attendees.every((a) => !busy.has(`${a}|${d}|${s}`))) { attendees.forEach((a) => busy.add(`${a}|${d}|${s}`)); return [d, s]; }
  }
  return [date, "17:30"];
};
const plusMins = (t, m) => { const [h, mm] = t.split(":").map(Number); const x = h * 60 + mm + m; return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };
const meetings = [];
const meet = (c, type, date, attendees, opts = {}) => {
  const [d, start] = takeSlot(date, attendees, opts.slot);
  const m = {
    id: "", client_id: c.id, type, date: d, start, end: plusMins(start, opts.mins || 60), attendees, organiser: attendees[0],
    location: opts.location || pick(["Video call (Google Meet)", "Video call (Google Meet)", "Client office", "LOUD studio, Shoreditch"]),
    agenda: opts.agenda || [], status: d < TODAY ? "Completed" : "Scheduled", notes: "", takeaways: [], actions: [],
  };
  if (m.status === "Completed") Object.assign(m, opts.record || {});
  meetings.push(m);
  return m;
};

for (const c of clients) {
  const lead = assignments[c.id], st = STORY[c.id], h = metrics[c.id], li = c.linkedin;
  const startSnap = h.find((s) => s.month >= c.engagement.start_date.slice(0, 7) + "-01") || h.at(-1);
  meet(c, "Kickoff & brand discovery", c.engagement.start_date, [lead, other(lead)], {
    slot: "11:00", mins: 90, location: "LOUD studio, Shoreditch",
    agenda: ["Goals and what success looks like in 12 months", "Current LinkedIn and media presence", "Voice, tone and no-go topics", "Content pillars and approval process"],
    record: {
      notes: `Discovery session with ${c.first_name}. Starting position: ${n0(startSnap.followers)} LinkedIn followers, ${startSnap.engagement_rate_pct}% engagement, posting about ${startSnap.posts}x a month. ${c.first_name} wants to be known for ${c.expertise[0].toLowerCase()} and ${c.expertise[1].toLowerCase()}. Agreed tone: ${st.tone}. Sensitivities: ${st.sensitive}. ${st.highlight.startsWith("Discovery") || st.highlight.startsWith("Kickoff") ? st.highlight.replace(/^(Discovery|Kickoff): /, "") + "." : ""}`,
      takeaways: [`Primary goal: ${c.brand_goals[0]}`, `Content pillars: ${c.content_pillars.join("; ")}`, `Approval: ${c.first_name} reviews drafts weekly; ${st.sensitive.split(";")[0].toLowerCase()}`],
      actions: [
        { text: "LinkedIn profile audit and rewrite (headline, About, banner)", owner: lead, due: addDays(c.engagement.start_date, 5), done: true },
        { text: "Voice & tone guide", owner: "T2", due: addDays(c.engagement.start_date, 7), done: true },
        { text: "First four draft posts for approval", owner: "T2", due: addDays(c.engagement.start_date, 10), done: c.engagement.start_date < "2026-10-15" },
      ],
    },
  });
  if (c.engagement.status === "Onboarding") {
    if (c.id === "LOUD-004") meet(c, "Voice & tone workshop", "2026-10-13", ["T2"], { location: "Video call (Google Meet)", agenda: ["Review voice guide", "Approve first drafts"], record: { notes: "Walked Tom through the voice guide. He prefers fewer adjectives and always wants a data point. Approved 3 of 4 drafts; asked for the refill pilot post to wait until Q4 results are public.", takeaways: ["Every post needs one verifiable number", "Refill pilot story embargoed until results are public", "Comfortable with a fortnightly video"], actions: [{ text: "Revise draft 4 without pilot numbers", owner: "T2", due: "2026-10-16", done: true }] } });
    meet(c, c.id === "LOUD-004" ? "First content review" : "Profile audit review", c.id === "LOUD-004" ? "2026-11-03" : "2026-10-30", [lead], { mins: 45, location: "Video call (Google Meet)", agenda: ["Profile changes", "First month content plan", "Media angles"] });
    continue;
  }
  const augH = h.find((s) => s.month === "2026-09-01"), sepH = h.at(-1), prev = h.find((s) => s.month === "2026-08-01");
  meet(c, "Monthly review", "2026-08-27", [lead], { mins: 45, location: "Video call (Google Meet)", agenda: ["August results", "September content plan"],
    record: { notes: `August review. Followers ${n0(prev.followers)} → ${n0(augH.followers)}; engagement ${augH.engagement_rate_pct}%. Planned September themes around ${c.content_pillars[1].toLowerCase()}.`, takeaways: [`Followers up ${n0(augH.followers - prev.followers)} in the month`, `September focus: ${c.content_pillars[1]}`], actions: [{ text: "Send August analytics report", owner: "T2", due: "2026-09-03", done: true }] } });
  meet(c, "Monthly review", "2026-09-29", [lead, "T2"], { mins: 60, agenda: ["September results", "What worked and what didn't", "October plan", "Visibility pipeline"],
    record: {
      notes: `September review with ${c.first_name}. Followers ${n0(augH.followers)} → ${n0(sepH.followers)} (+${n0(sepH.followers - augH.followers)}); engagement ${sepH.engagement_rate_pct}%; ${sepH.posts} posts published. Highlight: ${st.highlight}. Concern raised: ${st.concern}. Agreed next step: ${st.next}.`,
      takeaways: [st.highlight, `Concern: ${st.concern}`, `Next: ${st.next}`],
      actions: [
        { text: "October content calendar to client for approval", owner: "T2", due: "2026-10-02", done: true },
        { text: st.next, owner: lead, due: "2026-10-31", done: false },
        { text: "Send September analytics report", owner: "T2", due: "2026-10-05", done: true },
      ],
    } });
  meet(c, "Content sync", "2026-10-15", ["T2"], { mins: 30, location: "Video call (Google Meet)", agenda: ["Approve next batch of drafts", "Comment strategy"],
    record: { notes: `Reviewed ${pick(["five", "six", "four"])} drafts; ${c.first_name} approved most with light edits. Agreed to reply to top comments within two hours of posting.`, takeaways: ["Drafts approved with light edits", "Faster comment replies to lift engagement"], actions: [{ text: "Schedule approved posts", owner: "T2", due: "2026-10-16", done: true }] } });
  meet(c, "Monthly review", "2026-10-30", [lead], { mins: 45, agenda: ["October results", "November plan", "Visibility pipeline", c.engagement.tier !== "Volume" ? "Prep for quarterly strategy session" : "Any additional support"] });
  if (c.engagement.tier !== "Volume") meet(c, "Quarterly strategy session", "2026-11-17", [lead, "T2"], { mins: 90, location: pick(["Client office", "LOUD studio, Shoreditch"]), agenda: ["Q4 results vs goals", "Positioning refresh", "2027 visibility targets", "Research brief review"] });
}
for (const v of visibility.filter((x) => x.type === "Speaking" && x.status === "Confirmed" && x.date > TODAY && x.date < "2026-12-31")) {
  meet(byId[v.client_id], "Speaking prep", addDays(v.date, -6), [assignments[v.client_id]], { mins: 60, location: "Video call (Google Meet)", agenda: [`Run-through: ${v.name}`, "Key messages and stories", "Audience Q&A prep"] });
}
meetings.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
meetings.forEach((m, i) => (m.id = `M-${pad(i + 1)}`));

// ---------------------------------------------------------------- research briefs (seeded demo)
const research = [];
for (const c of clients) {
  const st = STORY[c.id];
  const mtg = meetings.filter((m) => m.client_id === c.id && m.status === "Completed").at(-1);
  const h = metrics[c.id], last = h.at(-1);
  const md = `## Summary
${c.first_name} ${c.last_name} (${c.title}, ${c.company}) has a credible platform in **${st.market}**. With ${n0(last.followers)} followers and ${last.engagement_rate_pct}% average engagement, the opportunity is to own a clear point of view: *${st.gap.toLowerCase()}*.

## Market fit
- **Audience demand:** senior peers, talent and trade press in ${c.industry.replace(/^.*— /, "").toLowerCase()} actively follow ${c.content_pillars[0].toLowerCase()} topics.
- **Credibility assets:** ${c.years_experience} years' experience, including ${c.career_history.slice(1, 3).map((j) => j.company).join(" and ")}; expertise in ${c.expertise.slice(0, 2).join(" and ").toLowerCase()}.
- **Fit score:** ${last.engagement_rate_pct >= 3 ? "Strong" : last.engagement_rate_pct >= 1.8 ? "Good" : "Emerging"}. Engagement ${last.engagement_rate_pct >= 2.5 ? "is above" : "is below"} the ~2.5% benchmark for executive LinkedIn content.

## Engagement strategy
- Lead with **${st.formats}**.
- Cadence: ${TIERS[c.engagement.tier].posts_per_month} posts a month, plus 15 minutes of commenting on peers' posts after each publish.
- Turn every speaking or podcast appearance into 3–4 follow-up posts (clip, key lesson, audience question).
- Next step from the meeting: ${st.next}.

## Competitive landscape
Voices already occupying this space:
${st.peers.map((p) => `- ${p}`).join("\n")}

**White space:** ${st.gap}.

## Brand alignment (website review)
Demo mode, so ${c.website} was not crawled. With Firecrawl connected, this section compares the company's public messaging with ${c.first_name}'s content pillars (${c.content_pillars.join("; ")}) and flags any gaps or conflicts.

## Recommendations
1. Anchor the next 30 days on "${c.content_pillars[0]}" with one flagship post a week.
2. Address the concern raised in the meeting: ${st.concern.toLowerCase()}.
3. Pitch two trade titles on the white-space angle above.
4. Re-measure in 60 days: followers, engagement rate, profile views and inbound requests.`;
  research.push({ id: `R-${pad(research.length + 1)}`, client_id: c.id, meeting_id: mtg.id, created: `${addDays(mtg.date, 1)}T10:00:00`, created_by: assignments[c.id], mode: "demo", sources: [], markdown: md });
}

// ---------------------------------------------------------------- activity log
const activity = [];
const act = (client_id, date, type, summary) => activity.push({ id: "", client_id, date, type, author: assignments[client_id], summary });
for (const c of clients) {
  if (c.engagement.status === "Onboarding") { act(c.id, addDays(c.engagement.start_date, 6), "Email", "Shared voice & tone guide and first four draft posts for review."); continue; }
  act(c.id, addDays("2026-10-06", Math.floor(rand() * 4)), "Email", `Sent September analytics report. Top theme: "${pick(c.content_pillars)}".`);
  act(c.id, addDays("2026-10-19", Math.floor(rand() * 6)), "Call", pick(["Quick check-in on upcoming drafts.", "Discussed speaking prep timings.", "Aligned on Q1 goals ahead of the strategy session."]));
}
act("LOUD-002", "2026-10-22", "Note", "Engagement is flat despite the large audience. Plan: shift from announcement posts to personal CEO stories; test two video posts in November.");
act("LOUD-005", "2026-10-24", "Note", "Cadence slipped (2/mo vs 8 planned) due to board season. Agreed batch-approval call every other Friday. August invoice still unpaid — PO number query.");
act("LOUD-007", "2026-10-25", "Note", "Fastest-growing client. Exploring an upgrade to Amplify to add a design newsletter.");
activity.sort((a, b) => b.date.localeCompare(a.date));
activity.forEach((a, i) => (a.id = `A-${pad(i + 1)}`));

// ---------------------------------------------------------------- work log
const worklog = [];
const work = (client_id, date, category, description, by, hours, extra = null) =>
  worklog.push({ id: "", client_id, date, category, description, by, hours, billing: extra ? "Additional" : "Retainer", amount: extra || 0, invoice_id: null });
const EXTRAS = {
  "LOUD-002|2026-10": ["Executive photoshoot & retouching", 1450, "T1", 6],
  "LOUD-006|2026-10": ["Keynote speechwriting — FinTech Builders Conference", 2500, "T1", 12],
  "LOUD-008|2026-09": ["Media training (half day)", 1800, "T1", 4],
  "LOUD-008|2026-10": ["Book proposal development (6 hours)", 1200, "T1", 6],
  "LOUD-010|2026-08": ["Additional op-ed / long-form article", 950, "T2", 5],
  "LOUD-001|2026-06": ["Additional strategy hours (4 hours)", 800, "T1", 4],
};
const FY_MONTHS = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
for (const c of clients) {
  const lead = assignments[c.id];
  for (const ym of FY_MONTHS) {
    if (c.engagement.start_date > lastDay(ym)) continue;
    const startMonth = c.engagement.start_date.slice(0, 7) === ym;
    if (startMonth) {
      work(c.id, c.engagement.start_date, "Strategy", "Kickoff & brand discovery workshop", lead, 3);
      work(c.id, addDays(c.engagement.start_date, 5), "Profile optimisation", "LinkedIn profile audit & rewrite (headline, About, banner, featured)", lead, 5);
      work(c.id, addDays(c.engagement.start_date, 7), "Strategy", "Voice & tone guide and content pillars", "T2", 4);
    }
    if (ym === "2026-10") {
      for (const p of posts.filter((x) => x.client_id === c.id && x.date.startsWith(ym) && x.status === "Published"))
        work(c.id, p.date, "Content", `Ghostwrote & published ${p.format.toLowerCase()}: "${p.title}"`, p.owner, p.format === "Text post" || p.format === "Poll" ? 1.5 : 3);
    } else if (!startMonth || c.engagement.start_date < `${ym}-15`) {
      const snap = metrics[c.id].find((s) => s.month === addMonths(`${ym}-01`, 1));
      const nPosts = Math.max(1, snap ? snap.posts : 4);
      work(c.id, `${ym}-${pick(["24", "25", "26"])}`, "Content", `Ghostwrote & published ${nPosts} LinkedIn posts`, "T2", nPosts * 1.5);
      if (c.engagement.tier !== "Volume") work(c.id, `${ym}-${pick(["12", "14", "18"])}`, "Content", c.other_channels.newsletter_subscribers ? "Wrote & sent newsletter editions (2)" : "Wrote thought-leadership articles (2)", "T2", 6);
    }
    if (!startMonth) {
      work(c.id, `${ym}-0${pick([3, 4, 5])}`, "Reporting", `Analytics report — ${monthLabel(addMonths(`${ym}-01`, -1).slice(0, 7))}`, "T2", 2);
      const review = meetings.find((m) => m.client_id === c.id && m.type === "Monthly review" && m.date.startsWith(ym) && m.status === "Completed");
      work(c.id, review ? review.date : `${ym}-28`, "Strategy", `Monthly review meeting${review ? ` (${review.id})` : ""}`, lead, 1.5);
    }
    if (c.engagement.tier !== "Volume" && !startMonth) work(c.id, `${ym}-1${pick([0, 1, 6])}`, "PR & media", `Media pitching — ${2 + Math.floor(rand() * 4)} outlets pitched`, "T2", 3);
    for (const v of visibility.filter((x) => x.client_id === c.id && x.status === "Completed" && x.date.startsWith(ym)))
      work(c.id, v.date, v.type === "Speaking" ? "Speaking" : "PR & media", `Secured & prepped: ${v.name}`, v.owner, 5);
    const ex = EXTRAS[`${c.id}|${ym}`];
    if (ex) work(c.id, `${ym}-20`, "Additional", ex[0], ex[2], ex[3], ex[1]);
  }
}
worklog.sort((a, b) => a.date.localeCompare(b.date) || a.client_id.localeCompare(b.client_id));
worklog.forEach((w, i) => (w.id = `W-${pad(i + 1, 4)}`));

// ---------------------------------------------------------------- invoices
const invoices = [];
const VAT = company.vat.standard_rate;
const sepUnpaid = new Set(["LOUD-002", "LOUD-005", "LOUD-008"]);
const awaiting = new Set(["LOUD-001", "LOUD-002", "LOUD-003", "LOUD-006", "LOUD-008", "LOUD-010"]);
for (const c of clients) {
  for (const ym of FY_MONTHS) {
    if (c.engagement.start_date > lastDay(ym)) continue;
    const issue = lastDay(ym);
    const lines = [];
    const startMonth = c.engagement.start_date.slice(0, 7) === ym;
    if (startMonth && c.engagement.start_date >= "2026-04-01") lines.push({ description: "Brand discovery & onboarding (one-off)", qty: 1, unit_price: 2500, vat_rate: VAT });
    let price = c.engagement.monthly_retainer_gbp, desc = `${c.engagement.tier} retainer — ${monthLabel(ym)}`;
    if (startMonth) {
      const dim = +lastDay(ym).slice(8), from = +c.engagement.start_date.slice(8);
      price = F.r2((price * (dim - from + 1)) / dim);
      desc += ` (pro rata from ${short(c.engagement.start_date)})`;
    }
    lines.push({ description: desc, qty: 1, unit_price: price, vat_rate: VAT });
    const items = worklog.filter((w) => w.client_id === c.id && w.date.startsWith(ym));
    for (const w of items.filter((w) => w.billing === "Additional")) lines.push({ description: w.description, qty: 1, unit_price: w.amount, vat_rate: VAT });
    const inv = {
      id: "", type: "invoice", number: null, client_id: c.id, period: ym, issue_date: issue, tax_point: null, due_date: addDays(issue, company.payment_terms_days),
      lines, work_item_ids: items.map((w) => w.id), status: "Draft", prepared_by: assignments[c.id], approved_by: null, approved_date: null,
      sent_date: null, paid_date: null, payment_method: null, payment_ref: null, notes: "", history: [],
    };
    const lead = assignments[c.id];
    inv.history.push({ date: addDays(issue, -3), by: lead, action: "Draft created from work log" });
    if (ym < "2026-10") {
      inv.history.push({ date: addDays(issue, -2), by: lead, action: "Submitted for approval" });
      inv.history.push({ date: addDays(issue, -1), by: "F1", action: "Approved" });
      inv.history.push({ date: issue, by: lead, action: "Sent to client", note: c.billing.email });
      Object.assign(inv, { status: "Sent", tax_point: issue, approved_by: "F1", approved_date: addDays(issue, -1), sent_date: issue });
      const unpaid = (ym === "2026-09" && sepUnpaid.has(c.id)) || (ym === "2026-08" && c.id === "LOUD-005");
      if (!unpaid) {
        const paid = addDays(issue, Math.round(between(9, ym === "2026-09" ? 26 : 32)));
        Object.assign(inv, { status: "Paid", paid_date: paid, payment_method: "BACS", payment_ref: `${c.company.split(" ")[0].toUpperCase()}-${ym.replace("-", "")}` });
        inv.history.push({ date: paid, by: "F1", action: "Payment recorded", note: `BACS ${inv.payment_ref}` });
      } else if (ym === "2026-08") inv.history.push({ date: "2026-10-03", by: "T2", action: "Payment reminder sent" });
    } else if (awaiting.has(c.id)) {
      inv.status = "Awaiting approval";
      inv.history.push({ date: addDays(TODAY, -1 + Math.floor(rand() * 2)), by: lead, action: "Submitted for approval" });
    } else if (c.id === "LOUD-005") {
      inv.status = "Changes requested";
      inv.history.push({ date: "2026-10-27", by: lead, action: "Submitted for approval" });
      inv.history.push({ date: "2026-10-27", by: "F1", action: "Changes requested", note: "Hold until the August invoice is settled, and confirm October posting volume before billing the full retainer." });
    }
    invoices.push(inv);
  }
}
// One credit note: June speaking-prep hours double-billed for Elena.
invoices.sort((a, b) => a.issue_date.localeCompare(b.issue_date) || a.client_id.localeCompare(b.client_id));
let invNo = 1001;
for (const inv of invoices) if (inv.tax_point) inv.number = `${company.invoice_prefix}-${invNo++}`;
const elenaJune = invoices.find((i) => i.client_id === "LOUD-008" && i.period === "2026-06");
elenaJune.lines.push({ description: "Speaking prep — Hospitality People Summit (6 hours)", qty: 6, unit_price: 200, vat_rate: VAT });
invoices.push({
  id: "", type: "credit_note", number: "CN-0001", client_id: "LOUD-008", period: "2026-06", issue_date: "2026-07-08", tax_point: "2026-07-08", due_date: "2026-07-08",
  lines: [{ description: `Credit: speaking prep hours billed in error on ${elenaJune.number}`, qty: 6, unit_price: 200, vat_rate: VAT }],
  work_item_ids: [], status: "Issued", credit_for: null, prepared_by: "T1", approved_by: "F1", approved_date: "2026-07-07", sent_date: "2026-07-08",
  paid_date: null, payment_method: null, payment_ref: null, notes: "Prep hours were already covered by the Headline retainer.",
  history: [{ date: "2026-07-07", by: "T1", action: "Credit note drafted" }, { date: "2026-07-07", by: "F1", action: "Approved" }, { date: "2026-07-08", by: "T1", action: "Issued to client" }],
});
invoices.forEach((inv, i) => (inv.id = `I-${pad(i + 1)}`));
invoices.at(-1).credit_for = elenaJune.id;
for (const inv of invoices) for (const wid of inv.work_item_ids) worklog.find((w) => w.id === wid).invoice_id = inv.id;

// ---------------------------------------------------------------- expenses
const expenses = [];
const exp = (date, supplier, category, description, net, vat_treatment, opts = {}) => {
  const vat = vat_treatment === "standard" ? F.r2(net * VAT) : 0;
  expenses.push({ id: "", date, supplier, category, description, net: F.r2(net), vat, vat_treatment, reclaimable: vat_treatment === "standard" && opts.reclaimable !== false, ct_deductible: opts.ct !== false, receipt: opts.receipt ?? true, paid_by: "Business account" });
};
for (const ym of FY_MONTHS) {
  exp(`${ym}-01`, "Example Yard Workspaces Ltd", "Rent & premises", "Studio rent — Shoreditch", 2800, "standard");
  exp(`${ym}-25`, "LOUD payroll", "Salaries & employer NI", "Salaries (Heloise, Lottie, director) incl. employer NI & pension", 13650, "outside_scope");
  exp(`${ym}-28`, "Freelance ghostwriter (not VAT registered)", "Freelancers", "Overflow ghostwriting", round(between(3200, 4200)), "no_vat");
  exp(`${ym}-15`, "Studio North Design", "Freelancers", "Carousel and banner design", round(between(1100, 1600)), "standard");
  exp(`${ym}-03`, "Design software (US supplier)", "Software & subscriptions", "Design suite seats", 96, "reverse_charge");
  exp(`${ym}-03`, "Perplexity AI (US supplier)", "Software & subscriptions", "Research API usage", round(between(40, 90)), "reverse_charge");
  exp(`${ym}-03`, "Firecrawl (US supplier)", "Software & subscriptions", "Web crawling API", 83, "reverse_charge");
  exp(`${ym}-05`, "Professional networking platform (EU supplier)", "Software & subscriptions", "Sales and analytics seats", 240, "reverse_charge");
  exp(`${ym}-10`, "Hartley & Co Accountants", "Accountancy & legal", "Monthly bookkeeping & payroll", 450, "standard");
  exp(`${ym}-${pick(["08", "12", "19"])}`, "National rail operators", "Travel", "Rail travel to client meetings", round(between(140, 380)), "zero");
  exp(`${ym}-30`, "Demo Bank plc", "Bank charges", "Account fees", 25, "exempt");
}
exp("2026-04-02", "Shield Insurance Brokers", "Insurance", "Professional indemnity & public liability (annual)", 1640, "exempt");
exp("2026-06-18", "The Copper Room", "Client entertainment", "Client dinner — Pure Ritual", 280, "standard", { reclaimable: false, ct: false });
exp("2026-09-24", "The Copper Room", "Client entertainment", "Client lunch — Meridian Hotels", 190, "standard", { reclaimable: false, ct: false });
exp("2026-07-14", "Camera Centre Ltd", "Equipment", "Lighting kit for executive video", 620, "standard");
exp("2026-10-21", "Taxi account", "Travel", "Taxi to FinTech Builders venue recce", 38, "standard", { receipt: false });
expenses.sort((a, b) => a.date.localeCompare(b.date));
expenses.forEach((e, i) => (e.id = `E-${pad(i + 1)}`));

// ---------------------------------------------------------------- VAT filings
const q2 = F.vatQuarters(company, "2026-04-01", "2026-06-30").find((q) => q.key === "2026-06");
const vatReturns = [{ quarter: q2.key, label: q2.label, filed_date: "2026-08-04", filed_by: "F1", reference: "DEMO-VAT-0626", boxes: F.vatReturn(q2, invoices, expenses, company).boxes, paid_date: "2026-08-06" }];

// ---------------------------------------------------------------- internal calendar events
const events = [];
for (let d = "2026-10-05"; d <= "2026-12-04"; d = addDays(d, 1)) {
  const w = dow(d);
  if (w === 1) events.push({ date: d, start: "09:00", end: "09:30", title: "Team stand-up", attendees: ["T1", "T2"] });
  if (w === 3) events.push({ date: d, start: "14:00", end: "15:00", title: "Content planning block", attendees: ["T2"] });
  if (w === 5) events.push({ date: d, start: "16:00", end: "16:45", title: "Week wrap with Avril (invoices & admin)", attendees: ["T1", "T2"] });
  if (w === 2) events.push({ date: d, start: "08:30", end: "09:30", title: "Focus: research briefs", attendees: ["T1"] });
}
events.push({ date: "2026-11-02", start: "10:00", end: "11:00", title: "Q3 VAT return figures to Avril", attendees: ["T1"] });
events.push({ date: "2026-10-30", start: "12:00", end: "13:00", title: "Send October invoices (after approval)", attendees: ["T1", "T2"] });
events.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
events.forEach((e, i) => (e.id = `EV-${pad(i + 1)}`));

// ---------------------------------------------------------------- mailboxes
const emails = [];
const person = (tid) => (tid === "F1" ? { name: company.founder.name, email: company.founder.email } : { name: teamById[tid].name, email: teamById[tid].email });
const clientP = (c) => ({ name: `${c.first_name} ${c.last_name}`, email: c.email });
const mail = (mailbox, folder, from, to, subject, datetime, body, related = null, read = true) =>
  emails.push({ id: "", mailbox, folder, from, to: [].concat(to), subject, date: datetime, body, related, read });
const gbp = (n) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtLongDate = (s) => new Date(s + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

for (const m of meetings.filter((m) => m.status === "Scheduled")) {
  const c = byId[m.client_id];
  const sentOn = addDays(m.date, -Math.min(10, Math.max(2, daysBetween(TODAY, m.date) + 3)));
  mail(m.organiser, "sent", person(m.organiser), clientP(c), `Invitation: ${m.type} — ${fmtLongDate(m.date)}, ${m.start}`, `${sentOn <= TODAY ? sentOn : addDays(TODAY, -1)}T09:${pad(Math.floor(rand() * 50), 2)}:00`,
    `Hi ${c.first_name},\n\nI've booked our ${m.type.toLowerCase()} for ${fmtLongDate(m.date)}, ${m.start}–${m.end} (${m.location}).\n\nAgenda:\n${m.agenda.map((a) => `• ${a}`).join("\n")}\n\nA calendar invite is attached. Let me know if the time doesn't work.\n\nBest,\n${person(m.organiser).name.split(" ")[0]}\nLOUD`, { type: "meeting", id: m.id });
}
for (const m of meetings.filter((m) => m.type === "Monthly review" && m.date.startsWith("2026-09"))) {
  const c = byId[m.client_id];
  mail(m.organiser, "sent", person(m.organiser), clientP(c), "Follow-up: September review — notes & actions", `${addDays(m.date, 1)}T10:15:00`,
    `Hi ${c.first_name},\n\nThanks for your time yesterday. Key takeaways:\n${m.takeaways.map((t) => `• ${t}`).join("\n")}\n\nActions:\n${m.actions.map((a) => `• ${a.text} (${person(a.owner).name.split(" ")[0]}, by ${short(a.due)})`).join("\n")}\n\nBest,\n${person(m.organiser).name.split(" ")[0]}`, { type: "meeting", id: m.id });
}
for (const inv of invoices.filter((i) => i.type === "invoice" && i.period === "2026-09")) {
  const c = byId[inv.client_id], t = F.invoiceTotals(inv);
  mail(inv.prepared_by, "sent", person(inv.prepared_by), { name: `${c.billing.company} Accounts`, email: c.billing.email }, `Invoice ${inv.number} from LOUD — ${monthLabel(inv.period)}`, `${inv.sent_date}T15:30:00`,
    `Dear Accounts team,\n\nPlease find attached invoice ${inv.number} for ${monthLabel(inv.period)}: ${gbp(t.gross)} including VAT, due by ${short(inv.due_date)}.\n\nA breakdown of the work completed this month is included on the invoice.\n\nKind regards,\n${person(inv.prepared_by).name}\nLOUD Personal Branding Ltd`, { type: "invoice", id: inv.id });
  if (inv.paid_date) mail(inv.prepared_by, "inbox", { name: `${c.billing.company} Accounts`, email: c.billing.email }, person(inv.prepared_by), `Remittance advice — ${inv.number}`, `${inv.paid_date}T11:02:00`,
    `Hello,\n\nPayment of ${gbp(t.gross)} for invoice ${inv.number} has been made by BACS today (ref ${inv.payment_ref}).\n\nRegards,\nAccounts Payable`, { type: "invoice", id: inv.id }, inv.paid_date < "2026-10-20");
}
for (const inv of invoices.filter((i) => i.status === "Awaiting approval" || i.status === "Changes requested")) {
  const c = byId[inv.client_id], t = F.invoiceTotals(inv);
  const subDate = inv.history.find((h) => h.action === "Submitted for approval").date;
  mail(inv.prepared_by, "sent", person(inv.prepared_by), person("F1"), `For approval: ${c.first_name} ${c.last_name} — ${monthLabel(inv.period)} invoice (${gbp(t.gross)})`, `${subDate}T17:05:00`,
    `Hi Avril,\n\nThe ${monthLabel(inv.period)} invoice for ${c.first_name} ${c.last_name} (${c.company}) is ready for your approval: ${gbp(t.net)} + VAT = ${gbp(t.gross)}. It covers ${inv.work_item_ids.length} completed work items.\n\nIt's in the Invoices tab under "Awaiting approval".\n\nThanks,\n${person(inv.prepared_by).name.split(" ")[0]}`, { type: "invoice", id: inv.id });
}
const sofiaAug = invoices.find((i) => i.client_id === "LOUD-005" && i.period === "2026-08");
const sofiaInv = invoices.find((i) => i.client_id === "LOUD-005" && i.period === "2026-10");
mail("T2", "inbox", person("F1"), person("T2"), "Re: For approval: Sofia Marquez — October 2026 invoice", "2026-10-27T18:20:00",
  `Hi Lottie,\n\nI've sent this back. Let's hold the October invoice until ${sofiaAug.number} (August) is paid, and check how many posts actually went out in October before we bill the full retainer.\n\nAvril`, { type: "invoice", id: sofiaInv.id }, false);
mail("T2", "inbox", { name: "Lumen Health Accounts", email: byId["LOUD-005"].billing.email }, person("T2"), `Re: Payment reminder — ${sofiaAug.number}`, "2026-10-06T09:40:00",
  `Hi Lottie,\n\nApologies for the delay. Our system needs a PO number before we can pay ${sofiaAug.number}. Could you reissue it with PO-LH-4471?\n\nThanks,\nAccounts Payable, Lumen Health`, { type: "invoice", id: sofiaAug.id }, true);
mail("T1", "inbox", clientP(byId["LOUD-002"]), person("T1"), "Re: November drafts", "2026-10-27T08:12:00",
  "Morning Heloise,\n\nI like the direction on the personal stories. Happy to try the two video posts. Can we shoot them the same day as the photoshoot?\n\nMarcus", { type: "client", id: "LOUD-002" }, false);
mail("T1", "inbox", { name: "Office of Elena Vasquez-Hart", email: "ea.office@meridianhotels.example" }, person("T1"), "Speaking prep — Hospitality People Summit", "2026-10-26T14:30:00",
  "Hi Heloise,\n\nElena can do the run-through on the 4th as planned. She'd like the slide notes a day before.\n\nBest,\nEA to the Chief People Officer", { type: "client", id: "LOUD-008" }, false);
mail("T1", "inbox", clientP(byId["LOUD-009"]), person("T1"), "Re: Welcome to LOUD — next steps", "2026-10-23T07:55:00",
  "Heloise — thanks for the welcome pack. I've filled in the questionnaire. Mornings before 8 are best for calls.\n\nDavid", { type: "client", id: "LOUD-009" }, true);
mail("T1", "inbox", person("F1"), person("T1"), "Q3 VAT return — Jul–Sep", "2026-10-26T09:00:00",
  "Hi Heloise,\n\nThe Jul–Sep VAT return is due 7 November. Could you check every September invoice is marked sent and all receipts are uploaded by Monday? I'll file from the Finance tab.\n\nThanks,\nAvril", null, false);
mail("T2", "inbox", clientP(byId["LOUD-007"]), person("T2"), "Newsletter idea", "2026-10-25T19:41:00",
  "Hi Lottie,\n\nBeen thinking about the design newsletter. What would the upgrade look like cost-wise?\n\nRachel", { type: "client", id: "LOUD-007" }, false);
mail("T2", "inbox", clientP(byId["LOUD-010"]), person("T2"), "Op-ed syndication 🎉", "2026-10-20T12:05:00",
  "Lottie, the op-ed has now been picked up four times. Thank you! Let's talk newsletter growth next week.\n\nAisha", { type: "client", id: "LOUD-010" }, true);
mail("T2", "inbox", clientP(byId["LOUD-004"]), person("T2"), "Re: Draft 4", "2026-10-16T16:20:00",
  "Thanks Lottie, the revised version works. Let's hold the refill numbers until Q4.\n\nTom", { type: "client", id: "LOUD-004" }, true);
emails.sort((a, b) => b.date.localeCompare(a.date));
emails.forEach((e, i) => (e.id = `EM-${pad(i + 1)}`));

// ---------------------------------------------------------------- write
write("metrics-history.json", { as_of: "2026-10-01", months: MONTHS, history: metrics });
write("posts.json", posts);
write("visibility.json", visibility);
write("activity.json", activity);
write("meetings.json", meetings);
write("research.json", research);
write("worklog.json", worklog);
write("invoices.json", invoices);
write("expenses.json", expenses);
write("vat-returns.json", vatReturns);
write("events.json", events);
write("emails.json", emails);
console.log(`Seeded: ${posts.length} posts, ${visibility.length} visibility, ${meetings.length} meetings, ${research.length} research briefs, ${worklog.length} work items, ${invoices.length} invoices/credit notes, ${expenses.length} expenses, ${events.length} events, ${emails.length} emails`);
