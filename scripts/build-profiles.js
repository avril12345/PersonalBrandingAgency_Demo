// Generates data/clients.csv and profiles/*.md from data/clients.json.
// Usage: node scripts/build-profiles.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const { meta, clients } = JSON.parse(fs.readFileSync(path.join(root, "data", "clients.json"), "utf8"));

const fmt = (n) => n.toLocaleString("en-US");
const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// --- CSV (flat, one row per client) ---
const columns = [
  ["id", (c) => c.id],
  ["name", (c) => `${c.first_name} ${c.last_name}`],
  ["age", (c) => c.age],
  ["location", (c) => c.location],
  ["title", (c) => c.title],
  ["seniority", (c) => c.seniority],
  ["company", (c) => c.company],
  ["industry", (c) => c.industry],
  ["is_cpg", (c) => c.is_cpg],
  ["years_in_role", (c) => c.years_in_role],
  ["years_experience", (c) => c.years_experience],
  ["li_followers", (c) => c.linkedin.followers],
  ["li_follower_growth_90d_pct", (c) => c.linkedin.follower_growth_90d_pct],
  ["li_engagement_rate_pct", (c) => c.linkedin.avg_engagement_rate_pct],
  ["li_avg_impressions_per_post", (c) => c.linkedin.avg_impressions_per_post],
  ["li_posts_per_month", (c) => c.linkedin.posts_per_month],
  ["li_profile_views_90d", (c) => c.linkedin.profile_views_90d],
  ["li_ssi_score", (c) => c.linkedin.ssi_score],
  ["x_followers", (c) => c.other_channels.x_followers],
  ["instagram_followers", (c) => c.other_channels.instagram_followers],
  ["newsletter_subscribers", (c) => c.other_channels.newsletter_subscribers],
  ["speaking_12m", (c) => c.visibility_12m.speaking_engagements],
  ["media_mentions_12m", (c) => c.visibility_12m.media_mentions],
  ["podcasts_12m", (c) => c.visibility_12m.podcast_appearances],
  ["status", (c) => c.engagement.status],
  ["tier", (c) => c.engagement.tier],
  ["start_date", (c) => c.engagement.start_date],
  ["monthly_retainer_usd", (c) => c.engagement.monthly_retainer_usd],
];
const csv = [columns.map(([h]) => h).join(",")]
  .concat(clients.map((c) => columns.map(([, get]) => csvCell(get(c))).join(",")))
  .join("\n");
fs.writeFileSync(path.join(root, "data", "clients.csv"), csv + "\n");

// --- Markdown profiles ---
const profilesDir = path.join(root, "profiles");
fs.mkdirSync(profilesDir, { recursive: true });

const slug = (c) => `${c.id}-${c.first_name}-${c.last_name}`.toLowerCase().replace(/[^a-z0-9-]/g, "");
const list = (items) => (items.length ? items.map((i) => `- ${i}`).join("\n") : "- None");

for (const c of clients) {
  const li = c.linkedin;
  const md = `# ${c.first_name} ${c.last_name}
**${c.title}, ${c.company}**${c.is_cpg ? " · CPG" : ""}

> Fictional client profile for the LOUD demo. Metrics as of ${meta.metrics_as_of}.

| | |
|---|---|
| Client ID | ${c.id} |
| Age | ${c.age} |
| Location | ${c.location} |
| Seniority | ${c.seniority} |
| Industry | ${c.industry} |
| Time in role | ${c.years_in_role} years |
| Total experience | ${c.years_experience} years |
| Education | ${c.education} |

## Career history
| Company | Role | Years |
|---|---|---|
${c.career_history.map((h) => `| ${h.company} | ${h.role} | ${h.years} |`).join("\n")}

## Expertise
${list(c.expertise)}

## Personal branding metrics
### LinkedIn
| Metric | Value |
|---|---|
| Followers | ${fmt(li.followers)} |
| Follower growth (90 days) | ${li.follower_growth_90d_pct}% |
| Avg. engagement rate | ${li.avg_engagement_rate_pct}% |
| Avg. impressions per post | ${fmt(li.avg_impressions_per_post)} |
| Posts per month | ${li.posts_per_month} |
| Profile views (90 days) | ${fmt(li.profile_views_90d)} |
| Social Selling Index | ${li.ssi_score}/100 |

### Other channels
| Channel | Audience |
|---|---|
| X / Twitter | ${fmt(c.other_channels.x_followers)} |
| Instagram | ${fmt(c.other_channels.instagram_followers)} |
| Newsletter | ${fmt(c.other_channels.newsletter_subscribers)} |

### Visibility (last 12 months)
| Speaking | Media mentions | Podcasts |
|---|---|---|
| ${c.visibility_12m.speaking_engagements} | ${c.visibility_12m.media_mentions} | ${c.visibility_12m.podcast_appearances} |

**Awards:** ${c.visibility_12m.awards.length ? c.visibility_12m.awards.join("; ") : "None yet"}

## Brand goals
${list(c.brand_goals)}

## Content pillars
${list(c.content_pillars)}

## LOUD engagement
| Status | Tier | Start date | Monthly retainer |
|---|---|---|---|
| ${c.engagement.status} | ${c.engagement.tier} | ${c.engagement.start_date} | $${fmt(c.engagement.monthly_retainer_usd)} |
`;
  fs.writeFileSync(path.join(profilesDir, `${slug(c)}.md`), md);
}

// --- Roster index ---
const roster = `# LOUD Client Roster

Fictional demo data. Metrics as of ${meta.metrics_as_of}. Source of truth: \`data/clients.json\`.

| ID | Client | Role | Company | Industry | LI followers | Engagement | Tier | Status |
|---|---|---|---|---|---|---|---|---|
${clients
  .map(
    (c) =>
      `| ${c.id} | [${c.first_name} ${c.last_name}](${slug(c)}.md) | ${c.title} | ${c.company} | ${c.industry}${c.is_cpg ? " **(CPG)**" : ""} | ${fmt(c.linkedin.followers)} | ${c.linkedin.avg_engagement_rate_pct}% | ${c.engagement.tier} | ${c.engagement.status} |`
  )
  .join("\n")}

**Totals:** ${clients.length} clients · ${clients.filter((c) => c.is_cpg).length} CPG · ${fmt(
  clients.reduce((s, c) => s + c.linkedin.followers, 0)
)} combined LinkedIn followers · $${fmt(clients.reduce((s, c) => s + c.engagement.monthly_retainer_usd, 0))} monthly recurring revenue
`;
fs.writeFileSync(path.join(profilesDir, "README.md"), roster);

console.log(`Built ${clients.length} profiles, roster, and clients.csv`);
