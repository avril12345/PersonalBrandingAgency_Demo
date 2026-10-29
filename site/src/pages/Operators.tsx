import * as React from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  Clock,
  Info,
  XCircle,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ── data from /api/ops (vite.config.ts) ───────────────────────── */

type Status = "green" | "orange" | "red" | "onboarding" | "info";

type Score = {
  client_id: string;
  client: string;
  company: string;
  lead: string;
  tier: string;
  stage: string;
  growth: number;
  growth_target: number;
  growth_status: Status;
  engagement: number;
  engagement_target: number;
  engagement_status: Status;
  visibility: number;
  visibility_target: number;
  visibility_status: Status;
  overall: Status;
  followers: number;
  followers_change_1d: number;
};

type Action = { id: string; owner: string; kind: string; severity: Status; text: string; detail: string; due: string | null };
type WeekItem = { id: string; kind: "win" | "miss" | string; owner: string; text: string };
type Post = {
  id: string;
  client_id: string;
  date: string;
  title: string;
  format: string;
  owner: string;
  status: string;
  results?: { impressions: number; reactions: number; comments: number };
};
type Invoice = {
  id: string;
  number: string | null;
  client_id: string;
  type: string;
  status: string;
  due_date: string;
  prepared_by: string;
  lines: { qty: number; unit_price: number; vat_rate: number }[];
};

type Ops = {
  meta: { date: string; day_label: string; active_clients: number; onboarding_clients: number; data_mode: string };
  scorecard: Score[];
  actions: Action[];
  week: WeekItem[];
  health: { date: string; green: number; orange: number; red: number }[];
  team: { id: string; name: string; role: string }[];
  clients: { id: string; first_name: string; last_name: string; company: string }[];
  posts: Post[];
  invoices: Invoice[];
};

/* ── helpers ───────────────────────────────────────────────────── */

const gbp = (n: number) =>
  n.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const num = (n: number) => n.toLocaleString("en-GB");
const short = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const total = (inv: Invoice) =>
  inv.lines.reduce((s, l) => s + l.qty * l.unit_price * (1 + l.vat_rate), 0);

// Fixed status steps (dataviz reference palette). Always paired with an
// icon and a label, never colour alone.
const STATUS = {
  green: { label: "On track", color: "#0ca30c", Icon: CheckCircle2 },
  orange: { label: "Watch", color: "#fab219", Icon: AlertTriangle },
  red: { label: "At risk", color: "#d03b3b", Icon: XCircle },
  onboarding: { label: "Onboarding", color: "#6E6E6E", Icon: Clock },
  info: { label: "Info", color: "#6E6E6E", Icon: Info },
} as const;

function Badge({ status, label }: { status: Status; label?: string }) {
  const s = STATUS[status] ?? STATUS.info;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap">
      <s.Icon className="size-4 shrink-0" style={{ color: s.color }} aria-hidden />
      {label ?? s.label}
    </span>
  );
}

function Card({ title, note, children, className }: { title: string; note?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-5", className)}>
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="font-medium">{title}</h2>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/* ── portfolio health: stacked daily bars with a hover readout ── */

function HealthChart({ data }: { data: Ops["health"] }) {
  const [hover, setHover] = React.useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.green + d.orange + d.red));
  const shown = data[hover ?? data.length - 1];
  const keys = ["red", "orange", "green"] as const;

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" aria-live="polite">
        <span className="font-medium tabular-nums">{short(shown.date)}</span>
        {(["green", "orange", "red"] as const).map((k) => (
          <span key={k} className="tabular-nums">
            <Badge status={k} label={`${shown[k]} ${STATUS[k].label.toLowerCase()}`} />
          </span>
        ))}
      </div>
      <div className="flex min-h-40 flex-1 items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => (
          <div
            key={d.date}
            className="flex h-full flex-1 cursor-default flex-col justify-end"
            onMouseEnter={() => setHover(i)}
          >
            <div
              className={cn("flex flex-col gap-[2px] transition-opacity", hover !== null && hover !== i && "opacity-50")}
              style={{ height: `${((d.green + d.orange + d.red) / max) * 100}%` }}
            >
              {keys.map((k, j) =>
                d[k] ? (
                  <div
                    key={k}
                    className={cn(j === 0 && "rounded-t-[4px]")}
                    style={{ flexGrow: d[k], background: STATUS[k].color }}
                  />
                ) : null,
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>{short(data[0].date)}</span>
        <span>{short(data[data.length - 1].date)}</span>
      </div>
      <table className="sr-only">
        <caption>Scorecard checks by status per day</caption>
        <thead><tr><th>Date</th><th>On track</th><th>Watch</th><th>At risk</th></tr></thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}><td>{d.date}</td><td>{d.green}</td><td>{d.orange}</td><td>{d.red}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── page ──────────────────────────────────────────────────────── */

const PEOPLE = ["Everyone", "Heloise", "Lottie"] as const;
type Person = (typeof PEOPLE)[number];

export default function Operators() {
  const [ops, setOps] = React.useState<Ops | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [person, setPerson] = React.useState<Person>("Everyone");

  React.useEffect(() => {
    fetch("/api/ops")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setOps)
      .catch((e) => setError(e.message));
  }, []);

  const view = React.useMemo(() => {
    if (!ops) return null;
    const mine = (owner: string) => person === "Everyone" || owner === person || owner === "Team";
    // data/ uses team ids (T1, T2); chief-of-staff uses first names.
    const first = Object.fromEntries(ops.team.map((t) => [t.id, t.name.split(" ")[0]]));
    const client = Object.fromEntries(ops.clients.map((c) => [c.id, `${c.first_name} ${c.last_name}`]));

    const scorecard = ops.scorecard.filter((s) => mine(s.lead));
    const active = scorecard.filter((s) => s.stage === "Active");
    const ids = new Set(scorecard.map((s) => s.client_id));

    const since = new Date(ops.meta.date);
    since.setDate(since.getDate() - 30);
    const from = since.toISOString().slice(0, 10);
    const recent = ops.posts.filter(
      (p) => p.status === "Published" && p.date >= from && p.date <= ops.meta.date && ids.has(p.client_id),
    );
    const impressions = recent.reduce((s, p) => s + (p.results?.impressions ?? 0), 0);
    const pipeline = ops.posts.filter((p) => ["Client review", "Approved", "Drafted"].includes(p.status) && ids.has(p.client_id));

    const awaiting = ops.invoices.filter((i) => i.status === "Awaiting approval" && mine(first[i.prepared_by]));
    const overdue = ops.invoices.filter(
      (i) => i.type === "invoice" && i.status === "Sent" && i.due_date < ops.meta.date && ids.has(i.client_id),
    );

    return {
      client,
      first,
      scorecard,
      active,
      followers: scorecard.reduce((s, c) => s + c.followers, 0),
      followersDelta: scorecard.reduce((s, c) => s + c.followers_change_1d, 0),
      onTrack: active.filter((s) => s.overall === "green").length,
      actions: ops.actions.filter((a) => mine(a.owner)),
      week: ops.week.filter((w) => mine(w.owner)),
      recent,
      impressions,
      pipeline,
      topPosts: [...recent].sort((a, b) => (b.results?.impressions ?? 0) - (a.results?.impressions ?? 0)).slice(0, 6),
      awaiting,
      awaitingTotal: awaiting.reduce((s, i) => s + total(i), 0),
      overdue,
    };
  }, [ops, person]);

  return (
    <div className="min-h-svh bg-muted/40 text-foreground">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <a href="#/" className="text-xl font-black tracking-[0.2em] text-primary">LOUD</a>
            <span className="text-sm text-muted-foreground">Operators</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="Viewing as">
              {PEOPLE.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPerson(p)}
                  aria-pressed={person === p}
                  className={cn(
                    "rounded-md px-3 py-1 text-sm transition-colors",
                    person === p ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
            <a href="#/" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              <ArrowLeft />
              Site
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {error && (
          <p className="rounded-xl border border-border bg-card p-5 text-sm">
            Couldn't load operator data ({error}). The dashboard reads it through the
            site's dev server, so start it with <code>npm run dev</code> in <code>site/</code>.
          </p>
        )}
        {!ops && !error && <p className="text-sm text-muted-foreground">Loading…</p>}

        {ops && view && (
          <>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h1 className="text-2xl font-medium tracking-tight">
                  {person === "Everyone" ? "Team dashboard" : `${person}'s dashboard`}
                </h1>
                <p className="text-sm text-muted-foreground">{ops.meta.day_label}</p>
              </div>
              <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <CircleDot className="size-3.5" />
                Internal · {ops.meta.data_mode} data · no login yet, run locally only
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Stat
                label="Clients on track"
                value={`${view.onTrack} / ${view.active.length}`}
                sub={`${view.scorecard.length - view.active.length} onboarding`}
              />
              <Stat
                label="Combined LinkedIn followers"
                value={num(view.followers)}
                sub={`${view.followersDelta >= 0 ? "+" : ""}${num(view.followersDelta)} since yesterday`}
              />
              <Stat
                label="Impressions, last 30 days"
                value={num(view.impressions)}
                sub={`${view.recent.length} posts published · ${view.pipeline.length} in the pipeline`}
              />
              <Stat
                label="Invoices awaiting approval"
                value={gbp(view.awaitingTotal)}
                sub={`${view.awaiting.length} for Avril · ${view.overdue.length} sent and overdue`}
              />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <Card title="Portfolio health" note="Scorecard checks per day, whole team" className="flex flex-col lg:col-span-2">
                <HealthChart data={ops.health} />
              </Card>

              <Card title="This week">
                <ul className="space-y-3 text-sm">
                  {view.week.map((w) => (
                    <li key={w.id} className="flex gap-2">
                      <Badge status={w.kind === "win" ? "green" : w.kind === "miss" ? "red" : "info"} label="" />
                      <span>
                        {w.text}
                        <span className="text-muted-foreground"> · {w.owner}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>

            <Card title="Client scorecard" note="Growth and engagement are 30-day %; visibility is placements this quarter" className="mt-4">
              <div className="-mx-5 overflow-x-auto px-5">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="py-2 pr-4 font-normal">Client</th>
                      <th className="py-2 pr-4 font-normal">Lead</th>
                      <th className="py-2 pr-4 font-normal">Tier</th>
                      <th className="py-2 pr-4 text-right font-normal">Followers</th>
                      <th className="py-2 pr-4 font-normal">Growth</th>
                      <th className="py-2 pr-4 font-normal">Engagement</th>
                      <th className="py-2 pr-4 font-normal">Visibility</th>
                      <th className="py-2 font-normal">Overall</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.scorecard.map((s) => {
                      const onboarding = s.stage !== "Active";
                      return (
                        <tr key={s.client_id} className="border-b border-border/60 last:border-0">
                          <td className="py-2.5 pr-4">
                            <p className="font-medium">{s.client}</p>
                            <p className="text-xs text-muted-foreground">{s.company}</p>
                          </td>
                          <td className="py-2.5 pr-4">{s.lead}</td>
                          <td className="py-2.5 pr-4">{s.tier}</td>
                          <td className="py-2.5 pr-4 text-right tabular-nums">{num(s.followers)}</td>
                          <td className="py-2.5 pr-4 tabular-nums">
                            {onboarding ? "–" : <Badge status={s.growth_status} label={`${s.growth}% / ${s.growth_target}%`} />}
                          </td>
                          <td className="py-2.5 pr-4 tabular-nums">
                            {onboarding ? "–" : <Badge status={s.engagement_status} label={`${s.engagement}% / ${s.engagement_target}%`} />}
                          </td>
                          <td className="py-2.5 pr-4 tabular-nums">
                            {onboarding ? "–" : <Badge status={s.visibility_status} label={`${s.visibility} / ${s.visibility_target}`} />}
                          </td>
                          <td className="py-2.5"><Badge status={s.overall} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card title="Actions" note={`${view.actions.filter((a) => a.severity === "red").length} urgent`}>
                <ul className="divide-y divide-border/60">
                  {view.actions.map((a) => (
                    <li key={a.id} className="flex gap-3 py-2.5 text-sm">
                      <Badge status={a.severity} label="" />
                      <div className="min-w-0">
                        <p className="font-medium">{a.text}</p>
                        <p className="text-muted-foreground">
                          {a.detail}
                          {person === "Everyone" && ` · ${a.owner}`}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>

              <div className="space-y-4">
                <Card title="Top posts" note="Last 30 days, by impressions">
                  <ol className="divide-y divide-border/60">
                    {view.topPosts.map((p) => (
                      <li key={p.id} className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{p.title}</p>
                          <p className="text-muted-foreground">
                            {view.client[p.client_id]} · {p.format} · {short(p.date)}
                          </p>
                        </div>
                        <p className="shrink-0 tabular-nums">{num(p.results?.impressions ?? 0)}</p>
                      </li>
                    ))}
                  </ol>
                </Card>

                <Card title="Invoices for approval" note="Founder approves before anything is sent">
                  {view.awaiting.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing waiting.</p>
                  ) : (
                    <ul className="divide-y divide-border/60">
                      {view.awaiting.map((i) => (
                        <li key={i.id} className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
                          <span>
                            {view.client[i.client_id]}
                            <span className="text-muted-foreground"> · prepared by {view.first[i.prepared_by]}</span>
                          </span>
                          <span className="tabular-nums">{gbp(total(i))}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
