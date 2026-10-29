// LOUD CRM local server — serves the app, saves data to data/*.json and runs
// research through Perplexity (background research) and Firecrawl (brand alignment).
// No dependencies. Usage: npm start  →  http://localhost:4321
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DATA = path.join(ROOT, "data");
const APP = path.join(ROOT, "crm");
const PORT = Number(process.env.PORT) || 4321;

// ---------------------------------------------------------------- .env (keys never leave the server)
const env = {};
try {
  for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#")) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* no .env: research runs report missing keys */ }
const PERPLEXITY_KEY = env.PERPLEXITY_API_KEY || process.env.PERPLEXITY_API_KEY || "";
const FIRECRAWL_KEY = env.FIRECRAWL_API_KEY || process.env.FIRECRAWL_API_KEY || "";
const PERPLEXITY_MODEL = env.PERPLEXITY_MODEL || "sonar-pro";

// ---------------------------------------------------------------- data store
const COLLECTIONS = {
  posts: "posts.json", visibility: "visibility.json", activity: "activity.json", meetings: "meetings.json",
  research: "research.json", worklog: "worklog.json", invoices: "invoices.json", expenses: "expenses.json",
  vat_returns: "vat-returns.json", events: "events.json", emails: "emails.json",
};
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));
const writeJson = (f, data) => {
  const target = path.join(DATA, f);
  const tmp = target + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmp, target);
};
function state() {
  const company = readJson("company.json");
  const out = { company, ...readJson("clients.json"), ...readJson("team.json"), metrics: readJson("metrics-history.json") };
  for (const [k, f] of Object.entries(COLLECTIONS)) out[k] = readJson(f);
  out.today = company.demo_today || new Date().toISOString().slice(0, 10);
  out.integrations = { perplexity: !!PERPLEXITY_KEY, firecrawl: !!FIRECRAWL_KEY, model: PERPLEXITY_MODEL };
  return out;
}

// ---------------------------------------------------------------- research
async function firecrawlScrape(url) {
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${FIRECRAWL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) throw new Error(`Firecrawl ${res.status}: ${json.error || res.statusText}`);
  const d = json.data || {};
  return { url, title: d.metadata?.title || url, description: d.metadata?.description || "", markdown: (d.markdown || "").slice(0, 9000) };
}

async function perplexity(messages) {
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${PERPLEXITY_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: PERPLEXITY_MODEL, messages, temperature: 0.2 }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Perplexity ${res.status}: ${json.error?.message || res.statusText}`);
  const sources = json.search_results?.map((s) => ({ title: s.title || s.url, url: s.url })) || (json.citations || []).map((u) => ({ title: u, url: u }));
  return { text: json.choices?.[0]?.message?.content || "", sources };
}

async function runResearch({ meeting_id, client_id, urls = [], requested_by }) {
  const s = state();
  const meeting = s.meetings.find((m) => m.id === meeting_id);
  const client = s.clients.find((c) => c.id === (client_id || meeting?.client_id));
  if (!client) throw Object.assign(new Error("Client not found"), { status: 404 });
  if (!PERPLEXITY_KEY) throw Object.assign(new Error("PERPLEXITY_API_KEY is not set in .env"), { status: 412 });

  const steps = [];
  let crawled = [];
  if (FIRECRAWL_KEY) {
    for (const url of [client.website, ...urls].filter(Boolean).slice(0, 3)) {
      try { crawled.push(await firecrawlScrape(url)); steps.push(`Firecrawl: scraped ${url}`); }
      catch (e) { steps.push(`Firecrawl: could not scrape ${url} (${e.message})`); }
    }
  } else steps.push("Firecrawl: skipped (FIRECRAWL_API_KEY not set)");

  const h = s.metrics.history[client.id].at(-1);
  const profile = `${client.first_name} ${client.last_name}, ${client.title} at ${client.company} (${client.industry}), based in ${client.location}. ${client.years_in_role} years in role, ${client.years_experience} years' experience. Expertise: ${client.expertise.join(", ")}. Goals: ${client.brand_goals.join("; ")}. Content pillars: ${client.content_pillars.join("; ")}. LinkedIn: ${h.followers} followers, ${h.engagement_rate_pct}% engagement, ${h.posts} posts last month.`;
  const notes = meeting ? `Meeting (${meeting.type}, ${meeting.date}) notes: ${meeting.notes}\nKey takeaways: ${meeting.takeaways.join("; ")}` : "No meeting notes supplied.";
  const site = crawled.length
    ? crawled.map((c) => `### ${c.title} (${c.url})\n${c.description}\n${c.markdown}`).join("\n\n")
    : "No website content available.";

  const { text, sources } = await perplexity([
    { role: "system", content: "You are a senior personal-branding strategist at LOUD, a UK agency for C-suite and director-level executives. Research the live web and write a concise, evidence-based brief in UK English. Use exactly these markdown headings: ## Summary, ## Market fit, ## Engagement strategy, ## Competitive landscape, ## Brand alignment (website review), ## Recommendations. Name real comparable executive voices only where sources support it. Cite specifics. No preamble." },
    { role: "user", content: `CLIENT PROFILE\n${profile}\n\nMEETING CONTEXT\n${notes}\n\nCOMPANY WEBSITE CONTENT (scraped with Firecrawl)\n${site}\n\nWrite the brief. In Market fit assess demand for this executive's themes in the UK market. In Engagement strategy recommend formats, cadence and channels based on what is working for comparable executives now. In Competitive landscape identify executives and creators already owning these themes and the white space. In Brand alignment compare the company's public messaging with the executive's content pillars and flag gaps or risks. Finish with 4–6 numbered recommendations.` },
  ]);
  steps.push(`Perplexity (${PERPLEXITY_MODEL}): ${sources.length} sources`);

  const research = readJson(COLLECTIONS.research);
  const id = `R-${String(Math.max(0, ...research.map((r) => +r.id.split("-")[1] || 0)) + 1).padStart(3, "0")}`;
  const brief = {
    id, client_id: client.id, meeting_id: meeting?.id || null, created: new Date().toISOString().slice(0, 19), created_by: requested_by || null,
    mode: "live", model: PERPLEXITY_MODEL, steps, crawled: crawled.map((c) => ({ url: c.url, title: c.title })), sources, markdown: text,
  };
  research.push(brief);
  writeJson(COLLECTIONS.research, research);
  return brief;
}

// ---------------------------------------------------------------- http
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
const send = (res, status, body, type = "application/json") => {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
};
const readBody = (req) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on("data", (c) => { size += c.length; if (size > 20e6) { reject(new Error("Body too large")); req.destroy(); } else chunks.push(c); });
  req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "null")); } catch (e) { reject(e); } });
  req.on("error", reject);
});

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname === "/api/state" && req.method === "GET") return send(res, 200, state());
    const m = url.pathname.match(/^\/api\/data\/([a-z_]+)$/);
    if (m && req.method === "PUT") {
      const file = COLLECTIONS[m[1]];
      if (!file) return send(res, 404, { error: "Unknown collection" });
      const body = await readBody(req);
      if (!Array.isArray(body)) return send(res, 400, { error: "Expected an array" });
      writeJson(file, body);
      return send(res, 200, { ok: true, count: body.length });
    }
    if (url.pathname === "/api/company" && req.method === "PUT") {
      const body = await readBody(req);
      writeJson("company.json", { ...readJson("company.json"), ...body });
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/api/research" && req.method === "POST") {
      const body = await readBody(req);
      try { return send(res, 200, await runResearch(body || {})); }
      catch (e) { return send(res, e.status || 502, { error: e.message }); }
    }
    if (url.pathname.startsWith("/api/")) return send(res, 404, { error: "Not found" });

    // static files from crm/
    const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const file = path.normalize(path.join(APP, rel));
    if (!file.startsWith(APP + path.sep)) return send(res, 403, "Forbidden", "text/plain");
    fs.readFile(file, (err, buf) => {
      if (err) return send(res, 404, "Not found", "text/plain");
      send(res, 200, buf, MIME[path.extname(file)] || "application/octet-stream");
    });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`LOUD CRM running at http://localhost:${PORT}`);
  console.log(`Research: Perplexity ${PERPLEXITY_KEY ? "connected" : "not configured"} · Firecrawl ${FIRECRAWL_KEY ? "connected" : "not configured"}`);
});
