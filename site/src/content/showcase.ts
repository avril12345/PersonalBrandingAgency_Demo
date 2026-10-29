import type { TiltedGridImage } from "@/components/ui/tilted-grid-hero";
import {
  brandFrame,
  postFrame,
  type BrandKit,
  type ShowcasePost,
} from "@/lib/frames";

// Public portfolio content. Curated by hand from data/posts.json and
// data/clients.json (all fictional) rather than imported, so only what is
// chosen here ever ships on the client-facing site.

const unsplash = (id: string) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=960&q=80`;

export const POSTS: ShowcasePost[] = [
  {
    name: "Aisha Bello",
    role: "Chief Communications Officer, Veridian Energy",
    format: "Text post",
    title: "Crisis comms playbooks: the mistake I made early on",
    impressions: 17623,
    reactions: 712,
    comments: 113,
    tone: "#141414",
  },
  {
    name: "Marcus Lindqvist",
    role: "CEO, Pure Ritual",
    format: "Article",
    title: "CEO lessons from scaling DTC: 3 things I'd tell my younger self",
    impressions: 25537,
    reactions: 277,
    comments: 44,
    tone: "#E10600",
  },
  {
    name: "Danielle Okafor",
    role: "CMO, Hearthstone Foods",
    format: "Carousel",
    title: "Leading diverse marketing teams: lessons from Goldenfield Cereals",
    impressions: 16409,
    reactions: 534,
    comments: 85,
    tone: "#6B0F1A",
  },
  {
    name: "James Adeyemi",
    role: "CTO, Brightline Financial",
    format: "Newsletter",
    title: "Modernising legacy tech without breaking the bank",
    impressions: 19962,
    reactions: 200,
    comments: 32,
    tone: "#FDECEC",
  },
  {
    name: "Danielle Okafor",
    role: "CMO, Hearthstone Foods",
    format: "Text post",
    title: "The future of the grocery aisle: what I got wrong last year",
    impressions: 17050,
    reactions: 568,
    comments: 90,
    tone: "#A30400",
  },
];

export const BRANDS: BrandKit[] = [
  {
    name: "Danielle Okafor",
    role: "CMO, Hearthstone Foods",
    line: "Heritage brands, rebuilt for the next aisle.",
    palette: ["#3B2A1E", "#D9822B", "#F3E3C7", "#7A8B5A"],
    pillars: [
      "Reinventing heritage brands",
      "Leading diverse marketing teams",
      "The future of the grocery aisle",
    ],
  },
  {
    name: "Marcus Lindqvist",
    role: "CEO, Pure Ritual",
    line: "Clean beauty, built in public.",
    palette: ["#1F3B36", "#C9A27E", "#EDE6DC", "#8FB3A6"],
    pillars: [
      "Building a clean beauty category leader",
      "CEO lessons from scaling DTC",
      "Founder-led culture",
    ],
  },
  {
    name: "Aisha Bello",
    role: "CCO, Veridian Energy",
    line: "Calm voice in the energy transition.",
    palette: ["#0F2A47", "#2FA37A", "#E8F1EC", "#F2B84B"],
    pillars: [
      "Crisis comms playbooks",
      "Energy transition storytelling",
      "Building trust with regulators",
    ],
  },
];

const PHOTOS: TiltedGridImage[] = [
  { src: unsplash("1475721027785-f74eccf877e2"), alt: "Speaker on a conference stage" },
  { src: unsplash("1507003211169-0a1dd7228f2d"), alt: "Portrait of an executive in a blazer" },
  { src: unsplash("1540575467063-178a50c2df87"), alt: "Audience at a conference" },
  { src: unsplash("1494790108377-be9c29b29330"), alt: "Portrait of a smiling executive" },
];

const postImages = POSTS.map((p) => ({ src: postFrame(p), alt: `${p.name}: ${p.title}` }));
const brandImages = BRANDS.map((b) => ({ src: brandFrame(b), alt: `Brand identity for ${b.name}` }));

/** Hero frames: posts, brand boards and stage photography, interleaved. */
export const FRAMES: TiltedGridImage[] = [
  postImages[0],
  brandImages[0],
  PHOTOS[0],
  postImages[1],
  brandImages[1],
  PHOTOS[1],
  postImages[2],
  brandImages[2],
  PHOTOS[2],
  postImages[3],
  postImages[4],
  PHOTOS[3],
];

export const POST_IMAGES = postImages;
export const BRAND_IMAGES = brandImages;
