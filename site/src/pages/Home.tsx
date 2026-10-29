import {
  ArrowRight,
  LayoutDashboard,
  Megaphone,
  Mic,
  PenLine,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { TiltedGridHero } from "@/components/ui/tilted-grid-hero";
import {
  BRANDS,
  BRAND_IMAGES,
  FRAMES,
  POSTS,
  POST_IMAGES,
} from "@/content/showcase";
import { cn } from "@/lib/utils";

const CONTACT = "mailto:hello@loud.example";

const STATS = [
  { value: "160k+", label: "LinkedIn followers across our client roster" },
  { value: "25.5k", label: "impressions on a single CEO article" },
  { value: "712", label: "reactions to one crisis-comms post" },
  { value: "10", label: "C-suite and director clients across the UK" },
];

const SERVICES = [
  {
    icon: PenLine,
    name: "Volume",
    blurb:
      "A steady, recognisable voice. Strategy, ghostwritten posts every week and a monthly results review.",
  },
  {
    icon: Megaphone,
    name: "Amplify",
    blurb:
      "Everything in Volume, plus carousels, video and newsletters, and pitching you to the podcasts your buyers listen to.",
  },
  {
    icon: Mic,
    name: "Headline",
    blurb:
      "For leaders ready for the main stage. Keynotes, media, awards and a full content engine run alongside your diary.",
  },
];

const STEPS = [
  { n: "01", title: "Discover", text: "A working session on your goals, story and the rooms you want to be in." },
  { n: "02", title: "Define", text: "Your positioning, voice, visual identity and three content pillars." },
  { n: "03", title: "Publish", text: "We draft, you approve. Posts go out on a calendar built around your week." },
  { n: "04", title: "Amplify", text: "Speaking, podcasts and press, with monthly reporting on what moved." },
];

function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <a href="#/" className="text-xl font-black tracking-[0.2em] text-primary">
          LOUD
        </a>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <a href="#identity" className="hover:text-foreground">Identity</a>
          <a href="#posts" className="hover:text-foreground">Posts</a>
          <a href="#services" className="hover:text-foreground">Services</a>
          <a href="#approach" className="hover:text-foreground">Approach</a>
        </nav>
        <div className="flex items-center gap-2">
          <a
            href="#/operators"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden sm:inline-flex")}
          >
            <LayoutDashboard />
            Team
          </a>
          <a href={CONTACT} className={buttonVariants({ size: "sm" })}>
            Get in touch
          </a>
        </div>
      </div>
    </header>
  );
}

function SectionHead({ kicker, title, text }: { kicker: string; title: string; text?: string }) {
  return (
    <div className="mb-10 max-w-2xl">
      <p className="mb-3 text-xs font-bold tracking-[0.25em] text-primary uppercase">{kicker}</p>
      <h2 className="text-balance text-3xl font-medium tracking-tight sm:text-4xl">{title}</h2>
      {text && <p className="mt-4 text-muted-foreground">{text}</p>}
    </div>
  );
}

export default function Home() {
  // In-page anchors share the hash with the router, so scroll by hand.
  const jump = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    const id = a?.getAttribute("href");
    if (!id || !/^#[a-z]/.test(id)) return;
    e.preventDefault();
    document.getElementById(id.slice(1))?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-svh bg-background text-foreground" onClick={jump}>
      <Nav />

      <section className="px-4 pt-4 sm:px-6">
        <TiltedGridHero
          images={FRAMES}
          speed={4.5}
          className="mx-auto h-[min(720px,calc(100svh-6rem))] min-h-[520px] w-full max-w-[1400px] rounded-2xl border border-border bg-background"
        >
          <div className="relative z-10 flex h-full flex-col items-center justify-between py-10 text-center sm:py-14">
            <div className="flex flex-col items-center gap-4 px-6">
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold tracking-[0.2em] text-primary uppercase">
                Personal branding for executives
              </span>
              <h1 className="text-balance text-4xl font-medium tracking-tight sm:text-6xl">
                Leaders worth hearing,
                <br />
                brought into focus.
              </h1>
            </div>
            <div className="flex flex-col items-center gap-4 px-6">
              <p className="max-w-md text-balance text-sm text-muted-foreground sm:text-base">
                Identity, voice and the posts that carry them. Every frame here
                is real work for a LOUD client.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <a href={CONTACT} className={buttonVariants({ size: "lg" })}>
                  Book a discovery call
                  <ArrowRight />
                </a>
                <a href="#posts" className={buttonVariants({ size: "lg", variant: "outline" })}>
                  See the work
                </a>
              </div>
            </div>
          </div>
        </TiltedGridHero>
      </section>

      <section className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-16 sm:px-6 md:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.label} className="border-l-2 border-primary pl-4">
            <p className="text-3xl font-semibold tracking-tight sm:text-4xl">{s.value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </section>

      <section id="identity" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
        <SectionHead
          kicker="Brand identity"
          title="A look and a point of view that are unmistakably yours."
          text="Each client gets a positioning line, a palette that carries across slides, banners and carousels, and three content pillars to own."
        />
        <div className="grid gap-6 md:grid-cols-3">
          {BRANDS.map((b, i) => (
            <figure key={b.name} className="overflow-hidden rounded-xl border border-border bg-card">
              <img src={BRAND_IMAGES[i].src} alt={BRAND_IMAGES[i].alt} className="aspect-video w-full object-cover" />
              <figcaption className="p-5">
                <p className="font-medium">{b.name}</p>
                <p className="text-sm text-muted-foreground">{b.role}</p>
                <p className="mt-3 text-sm italic">“{b.line}”</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section id="posts" className="scroll-mt-20 bg-muted/50 py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHead
            kicker="Posts that land"
            title="Written in their voice. Read by the people they need to reach."
            text="Text posts, carousels, articles and newsletters, drafted by our team and approved by the client before anything goes live."
          />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {POSTS.map((p, i) => (
              <figure key={p.title} className={cn("overflow-hidden rounded-xl border border-border bg-card", i === 0 && "lg:col-span-2 lg:row-span-2")}>
                <img src={POST_IMAGES[i].src} alt={POST_IMAGES[i].alt} className="aspect-video h-full w-full object-cover" />
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section id="services" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
        <SectionHead kicker="Services" title="Three ways to work with us." />
        <div className="grid gap-6 md:grid-cols-3">
          {SERVICES.map(({ icon: Icon, name, blurb }) => (
            <div key={name} className="rounded-xl border border-border p-6">
              <Icon className="size-6 text-primary" />
              <h3 className="mt-4 text-xl font-medium">{name}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{blurb}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="approach" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
        <SectionHead kicker="Approach" title="From first conversation to first keynote." />
        <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <li key={s.n}>
              <p className="font-mono text-sm text-primary">{s.n}</p>
              <h3 className="mt-2 text-lg font-medium">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="px-4 pb-16 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 rounded-2xl bg-[#141414] p-8 text-white sm:p-12 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-balance text-3xl font-medium tracking-tight">Ready to be heard?</h2>
            <p className="mt-2 text-white/70">A 30-minute call, no deck required.</p>
          </div>
          <a href={CONTACT} className={buttonVariants({ size: "lg" })}>
            Book a discovery call
            <ArrowRight />
          </a>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>LOUD Personal Branding Ltd · London · Demo site, all clients fictional</p>
          <a href="#/operators" className="inline-flex items-center gap-1.5 hover:text-foreground">
            <LayoutDashboard className="size-4" />
            Operator dashboard
          </a>
        </div>
      </footer>
    </div>
  );
}
