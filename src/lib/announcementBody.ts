/**
 * SoDEX announcement bodies arrive as HTML. Rather than inject remote markup
 * into the page, parse it server-side into a small allow-listed block model
 * that the modal renders with ordinary React elements — so nothing the feed
 * sends can become live markup, script, or an off-site asset.
 *
 * The vocabulary upstream actually uses is tiny: p, strong, em, br, a, h3,
 * ul/li and img. Anything outside that is dropped, keeping its text.
 */

export interface Span {
  text: string;
  bold?: boolean;
  italic?: boolean;
  /** Present only for https links that survived the host check. */
  href?: string;
}

export type Block =
  | { type: "p"; spans: Span[] }
  | { type: "h"; spans: Span[] }
  | { type: "ul"; items: Span[][] }
  | { type: "img"; src: string };

/** Images are only surfaced when SoDEX itself serves them. */
const ALLOWED_IMAGE_HOST = "static.sodex.com";

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  middot: "·",
  bull: "•",
  times: "×",
  deg: "°",
};

function decodeEntities(raw: string): string {
  return raw.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X"
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** Keep only https links; everything else renders as plain text. */
function safeHref(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const u = new URL(decodeEntities(raw));
    return u.protocol === "https:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}

function safeImage(raw: string | undefined): string | undefined {
  const href = safeHref(raw);
  if (!href) return undefined;
  return new URL(href).hostname === ALLOWED_IMAGE_HOST ? href : undefined;
}

const attr = (tag: string, name: string): string | undefined =>
  new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i").exec(tag)?.[1];

/** Trailing/leading whitespace tidy-up, without collapsing intentional breaks. */
function normalise(spans: Span[]): Span[] {
  const out = spans
    .map((s) => ({ ...s, text: s.text.replace(/[ \t]+/g, " ") }))
    .filter((s) => s.text.length > 0);
  if (out.length) {
    out[0].text = out[0].text.replace(/^[  ]+/, "");
    out[out.length - 1].text = out[out.length - 1].text.replace(/[  ]+$/, "");
  }
  return out.filter((s) => s.text.length > 0);
}

export function parseAnnouncementBody(html: string): Block[] {
  const blocks: Block[] = [];

  let spans: Span[] = [];
  let listItems: Span[][] = [];
  let inList = false;
  let bold = 0;
  let italic = 0;
  let href: string | undefined;

  const push = (text: string) => {
    if (!text) return;
    spans.push({
      text,
      ...(bold > 0 ? { bold: true } : {}),
      ...(italic > 0 ? { italic: true } : {}),
      ...(href ? { href } : {}),
    });
  };

  const flush = (type: "p" | "h" | "li") => {
    const content = normalise(spans);
    spans = [];
    // A block of nothing but <br>/whitespace is layout noise, not content.
    if (!content.some((s) => s.text.trim().length > 0)) return;
    if (type === "li") listItems.push(content);
    else blocks.push({ type, spans: content });
  };

  const closeList = () => {
    if (inList && listItems.length) blocks.push({ type: "ul", items: listItems });
    listItems = [];
    inList = false;
  };

  for (const token of html.match(/<[^>]*>|[^<]+/g) ?? []) {
    if (token[0] !== "<") {
      push(decodeEntities(token));
      continue;
    }

    const name = /^<\s*(\/?)\s*([a-zA-Z0-9]+)/.exec(token);
    if (!name) continue;
    const closing = name[1] === "/";
    const tag = name[2].toLowerCase();

    switch (tag) {
      case "p":
        if (closing) flush(inList ? "li" : "p");
        else spans = [];
        break;
      case "h1":
      case "h2":
      case "h3":
      case "h4":
        if (closing) flush("h");
        else spans = [];
        break;
      case "ul":
      case "ol":
        if (closing) closeList();
        else {
          flush("p");
          inList = true;
          listItems = [];
        }
        break;
      case "li":
        if (closing) flush("li");
        else spans = [];
        break;
      case "br":
        push("\n");
        break;
      case "strong":
      case "b":
        bold += closing ? -1 : 1;
        if (bold < 0) bold = 0;
        break;
      case "em":
      case "i":
        italic += closing ? -1 : 1;
        if (italic < 0) italic = 0;
        break;
      case "a":
        href = closing ? undefined : safeHref(attr(token, "href"));
        break;
      case "img": {
        flush(inList ? "li" : "p");
        const src = safeImage(attr(token, "src"));
        if (src) blocks.push({ type: "img", src });
        break;
      }
      default:
        // Unknown tag — ignored, its text content still flows through.
        break;
    }
  }

  closeList();
  flush("p"); // any trailing text outside a block

  return blocks;
}
