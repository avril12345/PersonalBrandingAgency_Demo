// Seeds the fictional demo history: monthly metrics, content calendar, visibility
// pipeline, and activity log. Deterministic (seeded RNG), so re-running gives the
// same output. Usage: node scripts/seed-demo-data.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, "data", f), "utf8"));
const write = (f, obj) => fs.writeFileSync(path.join(root, "data", f), JSON.stringify(obj, null, 2) + "\n");

const { meta, clients } = read("clients.json");
const { assignments } = read("team.json");

// mulberry32
let seed = 20261028;
const rand = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (a, b) => a + rand() * (b - a);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const round = (n, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

const TODAY = "2026-10-28";
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => {
  const d = new Date(s + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const daysBetween = (a, b) => Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 864e5);

// ---------------------------------------------------------------- metrics history
const MONTHS = ["2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"];
const metricsHistory = {};

for (const c of clients) {
  const li = c.linkedin;
  const snaps = [];
  let s = {
    followers: li.followers,
    engagement_rate_pct: li.avg_engagement_rate_pct,
    avg_impressions_per_post: li.avg_impressions_per_post,
    posts: li.posts_per_month,
    profile_views_30d: Math.round(li.profile_views_90d / 3),
    ssi_score: li.ssi_score,
  };
  snaps.unshift({ month: MONTHS[5], ...s });
  const monthlyGrowth = li.follower_growth_90d_pct / 3 / 100;

  for (let i = 4; i >= 0; i--) {
    const withLoud = c.engagement.start_date <= MONTHS[i + 1];
    const g = (withLoud ? monthlyGrowth : monthlyGrowth * 0.35) * between(0.75, 1.25);
    const engDelta = withLoud ? between(0.03, 0.14) : between(-0.05, 0.05);
    const prevFollowers = Math.round(s.followers / (1 + g));
    const prevEng = Math.max(0.4, round(s.engagement_rate_pct - engDelta, 1));
    s = {
      followers: prevFollowers,
      engagement_rate_pct: prevEng,
      avg_impressions_per_post: Math.round(
        s.avg_impressions_per_post * (prevFollowers / s.followers) * Math.sqrt(prevEng / s.engagement_rate_pct) * between(0.92, 1.04)
      ),
      posts: withLoud ? Math.max(1, s.posts + pick([-1, 0, 0, 1])) : Math.max(0, Math.min(2, s.posts - pick([0, 1]))),
      profile_views_30d: Math.round(s.profile_views_30d * between(0.86, 1.02)),
      ssi_score: Math.max(20, s.ssi_score - (withLoud ? pick([0, 1, 1, 2]) : pick([0, 0, 1]))),
    };
    snaps.unshift({ month: MONTHS[i], ...s });
  }
  metricsHistory[c.id] = snaps;
}

// ---------------------------------------------------------------- content calendar
const TIER_POSTS = { Volume: 8, Amplify: 10, Headline: 12 };
const HOOKS = [
  (p) => `${p}: the mistake I made early on`,
  (p) => `${p}: 3 things I'd tell my younger self`,
  (p) => `${p}: what the data actually says`,
  (p) => `${p}: a story from this week`,
  (p) => `${p}: the question I get asked most`,
  (p) => `${p}: an unpopular opinion`,
  (p, c) => `${p}: behind the scenes at ${c.company}`,
  (p) => `${p}: what changes in 2027`,
  (p) => `${p}: the framework I use with my team`,
  (p, c) => `${p}: lessons from ${c.career_history[1].company}`,
  (p) => `${p}: a myth worth retiring`,
  (p) => `${p}: what I got wrong last year`,
];
const statusFor = (date) => {
  const d = daysBetween(TODAY, date);
  if (d < 0) return "Published";
  if (d <= 3) return rand() < 0.8 ? "Approved" : "Client review";
  if (d <= 10) return rand() < 0.7 ? "Client review" : "Drafted";
  if (d <= 20) return rand() < 0.75 ? "Drafted" : "Idea";
  return "Idea";
};

const content = [];
let postN = 1;
for (const c of clients) {
  const perMonth = TIER_POSTS[c.engagement.tier];
  // Content starts two weeks after kickoff (onboarding), or Oct 1 for established clients.
  const firstDay = c.engagement.start_date > "2026-09-17" ? addDays(c.engagement.start_date, 14) : "2026-10-01";
  const hasLongForm = c.engagement.tier !== "Volume";
  const usedHooks = new Set();
  for (const month of ["2026-10", "2026-11"]) {
    const daysInMonth = month === "2026-10" ? 31 : 30;
    const step = daysInMonth / perMonth;
    for (let k = 0; k < perMonth; k++) {
      const day = Math.min(daysInMonth, Math.max(1, Math.round(k * step + between(1, step))));
      const date = `${month}-${String(day).padStart(2, "0")}`;
      if (date < firstDay) continue;
      const pillar = c.content_pillars[k % c.content_pillars.length];
      let h;
      do h = Math.floor(rand() * HOOKS.length);
      while (usedHooks.has(`${pillar}|${h}`) && usedHooks.size < HOOKS.length * c.content_pillars.length);
      usedHooks.add(`${pillar}|${h}`);
      const format =
        hasLongForm && k % 5 === 4
          ? c.other_channels.newsletter_subscribers > 0
            ? "Newsletter"
            : "Article"
          : pick(["Text post", "Text post", "Text post", "Carousel", "Carousel", "Short video", "Poll"]);
      const status = statusFor(date);
      const post = {
        id: `P-${String(postN++).padStart(3, "0")}`,
        client_id: c.id,
        date,
        title: HOOKS[h](pillar, c),
        pillar,
        format,
        channel: format === "Newsletter" ? "Newsletter" : "LinkedIn",
        owner: assignments[c.id],
        status,
      };
      if (status === "Published") {
        const imp = Math.round(c.linkedin.avg_impressions_per_post * between(0.55, 1.8));
        const eng = c.linkedin.avg_engagement_rate_pct * between(0.6, 1.5);
        const interactions = Math.round((imp * eng) / 100);
        post.results = {
          impressions: imp,
          reactions: Math.round(interactions * 0.82),
          comments: Math.round(interactions * 0.13),
          reposts: Math.max(0, Math.round(interactions * 0.05)),
        };
      }
      content.push(post);
    }
  }
}
content.sort((a, b) => a.date.localeCompare(b.date) || a.client_id.localeCompare(b.client_id));
content.forEach((p, i) => (p.id = `P-${String(i + 1).padStart(3, "0")}`));

// ---------------------------------------------------------------- visibility pipeline
// Fictional events, podcasts and outlets.
const V = (client_id, type, name, date, status, note) => ({ client_id, type, name, date, status, note });
const visibilityRaw = [
  V("LOUD-001", "Speaking", "Brand Forward Summit — Keynote", "2027-03-10", "In discussion", "Shortlisted for main-stage keynote; deck due Dec 15."),
  V("LOUD-001", "Podcast", "The Shelf Life Podcast", "2026-11-12", "Confirmed", "Episode on reviving heritage snack brands."),
  V("LOUD-001", "Media", "Grocery Trade Weekly — CMO roundtable", "2026-10-14", "Completed", "Quoted on Gen Z snacking; 3 pickups."),
  V("LOUD-001", "Award", "Marketing Leaders 50", "2026-12-01", "Pitched", "Nomination submitted Oct 20."),
  V("LOUD-002", "Speaking", "Beauty Operators Forum — Fireside chat", "2026-11-18", "Confirmed", "Fireside on DTC-to-retail scaling."),
  V("LOUD-002", "Media", "The Business Ledger — CEO profile", "2026-12-05", "In discussion", "Reporter interviewing in November; IPO talk off-limits."),
  V("LOUD-002", "Podcast", "Founders & Operators", "2026-09-22", "Completed", "Top-10 episode of the month for the show."),
  V("LOUD-002", "Media", "Clean Label Report — Op-ed", "2026-11-04", "Pitched", "Op-ed on clean beauty standards."),
  V("LOUD-002", "Award", "Retail Visionary of the Year", "2027-01-20", "Pitched", "Application in progress."),
  V("LOUD-003", "Podcast", "Sip & Scale", "2026-10-09", "Completed", "Functional beverage trends episode."),
  V("LOUD-003", "Speaking", "Beverage Innovation Expo — Panel", "2027-02-04", "Confirmed", "Panel: data-driven innovation."),
  V("LOUD-003", "Media", "Beverage Industry Insider — Trend quote", "2026-11-08", "In discussion", "Year-end trends feature."),
  V("LOUD-003", "Speaking", "Women in Growth Leadership Breakfast", "2026-12-03", "Pitched", ""),
  V("LOUD-004", "Media", "Packaging Futures Journal — Interview", "2026-11-20", "Pitched", "Refill/reuse pilot results."),
  V("LOUD-004", "Speaking", "Circular Economy Forum — Panel", "2027-04-15", "Pitched", "First pitch since onboarding."),
  V("LOUD-005", "Podcast", "The Strategic CFO Show", "2026-11-14", "Confirmed", "Healthtech unit economics."),
  V("LOUD-005", "Media", "Health Finance Daily — Guest column", "2026-12-10", "Pitched", ""),
  V("LOUD-005", "Speaking", "Latinas in Finance Summit", "2026-08-21", "Completed", "Mentorship panel; 140 new followers that week."),
  V("LOUD-006", "Speaking", "FinTech Builders Conference — Keynote", "2026-11-05", "Confirmed", "Responsible AI in banking."),
  V("LOUD-006", "Podcast", "Code & Capital", "2026-10-01", "Completed", ""),
  V("LOUD-006", "Media", "Banking Technology Review — Op-ed", "2026-10-21", "Completed", "Op-ed on AI governance; strong engagement."),
  V("LOUD-006", "Award", "Tech Leaders Honor Roll", "2026-12-15", "In discussion", "Finalist notification expected early Dec."),
  V("LOUD-006", "Speaking", "University Tech Leadership Series", "2026-09-17", "Declined", "Scheduling conflict."),
  V("LOUD-007", "Speaking", "Interface Design Conference — Talk", "2027-05-12", "Pitched", "Talk: 'AI and the end of the screen'."),
  V("LOUD-007", "Podcast", "Design Leadership Diaries", "2026-11-25", "Confirmed", ""),
  V("LOUD-007", "Media", "Motion & Mobility Magazine — Feature", "2026-12-01", "In discussion", "Feature on in-vehicle UX."),
  V("LOUD-008", "Speaking", "Hospitality People Summit — Keynote", "2026-11-10", "Confirmed", "Frontline culture keynote."),
  V("LOUD-008", "Media", "Workforce Today — Profile", "2026-10-07", "Completed", ""),
  V("LOUD-008", "Podcast", "The Front Desk", "2026-12-08", "Confirmed", ""),
  V("LOUD-008", "Media", "Book proposal — Literary agent meetings", "2026-11-30", "In discussion", "Two agents interested; sample chapter in progress."),
  V("LOUD-008", "Award", "Chief People Officer Awards", "2027-02-28", "Pitched", ""),
  V("LOUD-009", "Podcast", "Supply Chain Uncut", "2026-12-12", "Pitched", "First pitch: military logistics lessons."),
  V("LOUD-009", "Media", "Logistics Leader Weekly — Q&A", "2026-11-28", "Pitched", "Veteran hiring angle."),
  V("LOUD-010", "Speaking", "Clean Energy Communicators Summit — Keynote", "2026-11-19", "Confirmed", ""),
  V("LOUD-010", "Media", "National Energy Desk — Op-ed", "2026-10-16", "Completed", "Op-ed on transition storytelling; syndicated 4x."),
  V("LOUD-010", "Podcast", "Power Lines", "2026-09-30", "Completed", ""),
  V("LOUD-010", "Podcast", "Crisis Ready", "2026-11-06", "Confirmed", ""),
  V("LOUD-010", "Award", "Communicator of the Year — Energy", "2027-01-15", "In discussion", "Shortlisted."),
];
const visibility = visibilityRaw
  .sort((a, b) => a.date.localeCompare(b.date))
  .map((v, i) => ({ id: `V-${String(i + 1).padStart(3, "0")}`, ...v, owner: assignments[v.client_id] }));

// ---------------------------------------------------------------- activity log
const activity = [];
let actN = 1;
const log = (client_id, date, type, summary) =>
  activity.push({ id: `A-${String(actN++).padStart(3, "0")}`, client_id, date, type, author: assignments[client_id], summary });

for (const c of clients) {
  const h = metricsHistory[c.id];
  const first = h[0];
  const last = h[h.length - 1];
  log(c.id, c.engagement.start_date, "Meeting", `Kickoff and brand discovery. Agreed pillars: ${c.content_pillars.join("; ")}. Primary goal: ${c.brand_goals[0].toLowerCase()}.`);
  if (c.engagement.status === "Onboarding") {
    log(c.id, addDays(c.engagement.start_date, 3), "Task", "Profile audit complete; headline, banner and About section rewrite sent for approval.");
    log(c.id, addDays(c.engagement.start_date, 6), "Email", "Shared voice & tone guide and first 4 draft posts for review.");
    continue;
  }
  log(c.id, "2026-09-29", "Meeting", `Monthly review. Followers ${first.followers.toLocaleString("en-US")} → ${last.followers.toLocaleString("en-US")} since May; engagement ${first.engagement_rate_pct}% → ${last.engagement_rate_pct}%.`);
  log(c.id, addDays("2026-10-08", Math.floor(rand() * 10)), "Email", `Sent October analytics report. Top post theme: "${pick(c.content_pillars)}".`);
  log(c.id, addDays("2026-10-19", Math.floor(rand() * 7)), "Call", pick([
    "Weekly content sync; approved next batch of drafts with minor edits.",
    "Discussed upcoming speaking prep; client wants talking points one week ahead.",
    "Reviewed comments strategy; client will reply to top comments within 2 hours of posting.",
    "Aligned on Q1 goals ahead of the quarterly strategy session.",
  ]));
}
// A few hand-written notes that make the demo story more interesting.
log("LOUD-002", "2026-10-22", "Note", "Engagement is flat despite the large audience. Plan: shift from announcement posts to personal CEO stories; test 2 video posts in November.");
log("LOUD-005", "2026-10-24", "Note", "Posting cadence slipped (2/mo vs. 8 planned) because of board season. Client agreed to a batch-approval call every other Friday.");
log("LOUD-007", "2026-10-25", "Note", "Fastest-growing client. Exploring an upgrade to Amplify to add a design newsletter.");
log("LOUD-009", "2026-10-27", "Note", "Very low baseline. First 30 days: profile overhaul, 2 posts/week, comment on 5 industry posts/day.");
activity.sort((a, b) => b.date.localeCompare(a.date));

write("metrics-history.json", { as_of: meta.metrics_as_of, months: MONTHS, history: metricsHistory });
write("content-calendar.json", { generated_for: TODAY, posts: content });
write("visibility.json", { items: visibility });
write("activity.json", { entries: activity });
console.log(`Seeded ${Object.keys(metricsHistory).length} metric histories, ${content.length} posts, ${visibility.length} visibility items, ${activity.length} activity entries`);
