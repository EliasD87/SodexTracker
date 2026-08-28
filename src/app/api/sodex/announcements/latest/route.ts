import { NextResponse } from "next/server";
import { parseAnnouncementBody, type Block } from "@/lib/announcementBody";

/**
 * GET /api/sodex/announcements/latest
 *
 * The newest SoDEX announcement, flattened for the landing card.
 *
 * Server-side so the page gets one small payload instead of three upstream
 * round trips, and so the announcement HTML never reaches the browser: the
 * excerpt comes from the plain-text body, and the HTML one is parsed into an
 * allow-listed block model the modal renders as React elements. Remote markup
 * never becomes live markup.
 */

const GW_BASE = "https://mainnet-gw.sodex.dev/api/v1";
const REVALIDATE = 300; // 5 min — announcements land a few times a month

/** Only images served by SoDEX are surfaced; anything else is dropped. */
const ALLOWED_IMAGE_HOST = "static.sodex.com";

interface Article {
  id: number;
  style: string;
  title: string;
  label_names: string[];
  createdAt: number;
  updatedAt: number;
}

interface Detail extends Article {
  body: string;
}

interface Envelope<T> {
  code: number;
  data?: T;
}

export interface LatestAnnouncement {
  id: number;
  title: string;
  /** First label, e.g. "Updates" / "Listings". Null when unlabelled. */
  label: string | null;
  /** "regular" | "alert" — alert is SoDEX's own emphasis (e.g. downtime notices). */
  style: string;
  /** Publish time in MILLISECONDS. The upstream field is seconds. */
  publishedAt: number;
  excerpt: string;
  image: string | null;
  /** Full body, parsed into safe blocks for the modal. Empty if unparseable. */
  blocks: Block[];
  url: string;
}

async function gw<T>(path: string): Promise<T> {
  const res = await fetch(`${GW_BASE}${path}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: REVALIDATE },
  });
  if (!res.ok) throw new Error(`SoDEX gateway ${res.status}`);
  const json = (await res.json()) as Envelope<T>;
  if (json.code !== 0 || !json.data) throw new Error("SoDEX gateway rejected the request");
  return json.data;
}

/** Pull the hero image out of the announcement HTML, ignoring any other host. */
function heroImage(html: string): string | null {
  const m = /<img[^>]+src="([^"]+)"/i.exec(html);
  if (!m) return null;
  try {
    const u = new URL(m[1]);
    return u.protocol === "https:" && u.hostname === ALLOWED_IMAGE_HOST ? u.href : null;
  } catch {
    return null;
  }
}

/** Collapse the plain-text body into a single-paragraph teaser. */
function excerptOf(text: string, max = 220): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export async function GET() {
  try {
    const list = await gw<{ articles: Article[] }>("/announcements?page=1&size=1&lang=en");
    const article = list.articles?.[0];
    if (!article) return NextResponse.json({ code: 1, message: "No announcements" }, { status: 404 });

    // plainText gives a clean, entity-decoded excerpt; the HTML copy is read
    // only for its hero image. Both hit the same cached upstream path.
    const [plain, rich] = await Promise.all([
      gw<Detail>(`/announcements/detail/${article.id}?lang=en&plainText=true`),
      gw<Detail>(`/announcements/detail/${article.id}?lang=en&plainText=false`).catch(() => null),
    ]);

    const data: LatestAnnouncement = {
      id: article.id,
      title: article.title.trim(),
      label: article.label_names?.[0] ?? null,
      style: article.style,
      publishedAt: article.createdAt * 1000,
      excerpt: excerptOf(plain.body ?? ""),
      image: rich?.body ? heroImage(rich.body) : null,
      blocks: rich?.body ? parseAnnouncementBody(rich.body) : [],
      url: `https://sodex.com/announcement?id=${article.id}`,
    };

    return NextResponse.json({ code: 0, message: "success", data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch announcement";
    return NextResponse.json({ code: 1, message }, { status: 502 });
  }
}
