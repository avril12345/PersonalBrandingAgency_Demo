// Draws the picture-frame artwork for the hero and the work section: post
// mock-ups and brand-kit boards as SVG data URIs, so every frame is crisp
// at any size and needs no image hosting. Text in an <img> SVG can't use
// web fonts, so it falls back to the system sans.

const W = 1600;
const H = 900;
const FONT = "Helvetica Neue, Helvetica, Arial, sans-serif";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const uri = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Greedy word wrap to `max` characters, capped at `lines` lines. */
function wrap(text: string, max: number, lines: number) {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if ((line + " " + word).trim().length > max && line) {
      out.push(line);
      line = word;
    } else line = (line + " " + word).trim();
  }
  if (line) out.push(line);
  if (out.length > lines) {
    out.length = lines;
    out[lines - 1] = out[lines - 1].replace(/\s*\S*$/, "") + "…";
  }
  return out;
}

const initials = (name: string) =>
  name
    .split(/[\s-]+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("");

const fmt = (n: number) => n.toLocaleString("en-GB");

export type ShowcasePost = {
  name: string;
  role: string;
  format: string;
  title: string;
  impressions: number;
  reactions: number;
  comments: number;
  /** Background for the frame; the card itself is always white. */
  tone: string;
};

/** A LinkedIn-style post card on a coloured ground. */
export function postFrame(p: ShowcasePost) {
  const lines = wrap(p.title, 30, 4);
  const top = 300;
  const text = lines
    .map(
      (l, i) =>
        `<text x="200" y="${top + i * 82}" font-size="64" font-weight="700" fill="#141414">${esc(l)}</text>`,
    )
    .join("");
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
<rect width="${W}" height="${H}" fill="${p.tone}"/>
<rect x="120" y="70" width="${W - 240}" height="${H - 140}" rx="36" fill="#FFFFFF"/>
<circle cx="236" cy="168" r="52" fill="#E10600"/>
<text x="236" y="186" font-size="44" font-weight="700" fill="#FFFFFF" text-anchor="middle">${esc(initials(p.name))}</text>
<text x="318" y="158" font-size="40" font-weight="700" fill="#141414">${esc(p.name)}</text>
<text x="318" y="206" font-size="30" fill="#6E6E6E">${esc(p.role)}</text>
<rect x="${W - 440}" y="128" width="240" height="64" rx="32" fill="#FDECEC"/>
<text x="${W - 320}" y="171" font-size="28" font-weight="700" fill="#A30400" text-anchor="middle">${esc(p.format)}</text>
${text}
<line x1="200" y1="${H - 190}" x2="${W - 200}" y2="${H - 190}" stroke="#EAEAEA" stroke-width="3"/>
<text x="200" y="${H - 125}" font-size="34" fill="#6E6E6E"><tspan font-weight="700" fill="#141414">${fmt(p.reactions)}</tspan> reactions   <tspan font-weight="700" fill="#141414">${fmt(p.comments)}</tspan> comments</text>
<text x="${W - 200}" y="${H - 125}" font-size="34" fill="#6E6E6E" text-anchor="end"><tspan font-weight="700" fill="#E10600">${fmt(p.impressions)}</tspan> impressions</text>
</svg>`);
}

export type BrandKit = {
  name: string;
  role: string;
  line: string;
  palette: string[];
  pillars: string[];
};

/** A brand-identity board: monogram, positioning line, palette, pillars. */
export function brandFrame(b: BrandKit) {
  const [ground, accent] = b.palette;
  const sw = b.palette
    .map(
      (c, i) =>
        `<rect x="${120 + i * 132}" y="${H - 220}" width="112" height="112" rx="20" fill="${c}" stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="3"/>`,
    )
    .join("");
  const pillars = b.pillars
    .map(
      (p, i) =>
        `<text x="${W - 120}" y="${H - 300 + i * 66}" font-size="36" fill="#FFFFFF" fill-opacity="0.9" text-anchor="end">${esc(p)}</text>`,
    )
    .join("");
  const line = wrap(b.line, 28, 2)
    .map(
      (l, i) =>
        `<text x="120" y="${430 + i * 92}" font-size="76" font-weight="700" fill="#FFFFFF">${esc(l)}</text>`,
    )
    .join("");
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
<rect width="${W}" height="${H}" fill="${ground}"/>
<circle cx="${W - 200}" cy="200" r="120" fill="${accent}"/>
<text x="${W - 200}" y="236" font-size="104" font-weight="700" fill="#FFFFFF" text-anchor="middle">${esc(initials(b.name))}</text>
<text x="120" y="170" font-size="30" font-weight="700" letter-spacing="8" fill="#FFFFFF" fill-opacity="0.7">BRAND IDENTITY</text>
<text x="120" y="240" font-size="44" font-weight="700" fill="#FFFFFF">${esc(b.name)}</text>
<text x="120" y="292" font-size="32" fill="#FFFFFF" fill-opacity="0.75">${esc(b.role)}</text>
${line}
${sw}
<text x="${W - 120}" y="${H - 370}" font-size="26" font-weight="700" letter-spacing="6" fill="#FFFFFF" fill-opacity="0.6" text-anchor="end">CONTENT PILLARS</text>
${pillars}
</svg>`);
}
