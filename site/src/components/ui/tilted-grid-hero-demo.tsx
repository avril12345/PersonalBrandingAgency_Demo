import { TiltedGridHero } from "@/components/ui/tilted-grid-hero";

// Unsplash stock photography: portraits, boardrooms and stages, the world
// LOUD's executive clients work in. Cropped to the tiles by object-cover.
const unsplash = (id: string) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=960&q=80`;

export const IMAGES = [
  { src: unsplash("1507003211169-0a1dd7228f2d"), alt: "Portrait of a smiling man in a blazer" },
  { src: unsplash("1497366216548-37526070297c"), alt: "Bright open-plan office" },
  { src: unsplash("1494790108377-be9c29b29330"), alt: "Portrait of a smiling woman" },
  { src: unsplash("1475721027785-f74eccf877e2"), alt: "Speaker on a conference stage" },
  { src: unsplash("1500648767791-00dcc994a43e"), alt: "Close-up portrait of a man" },
  { src: unsplash("1556761175-5973dc0f32e7"), alt: "Team meeting around a table" },
  { src: unsplash("1438761681033-6461ffad8d80"), alt: "Portrait of a woman outdoors" },
  { src: unsplash("1540575467063-178a50c2df87"), alt: "Audience at a conference" },
  { src: unsplash("1522071820081-009f0129c71c"), alt: "Colleagues collaborating on laptops" },
];

export default function TiltedGridHeroDemo() {
  return (
    <TiltedGridHero
      images={IMAGES}
      className="h-[560px] w-full rounded-lg border border-border bg-background"
    >
      <div className="relative z-10 flex h-full flex-col items-center justify-between py-12 text-center">
        <div className="px-6">
          <h1 className="text-balance text-4xl font-medium tracking-tight text-foreground sm:text-5xl">
            Every frame,
            <br />
            brought into focus.
          </h1>
        </div>
        <p className="max-w-md text-balance px-6 text-sm text-muted-foreground">
          Images curve in from one edge, flatten out at the centre, then fade
          away round the other.
        </p>
      </div>
    </TiltedGridHero>
  );
}
