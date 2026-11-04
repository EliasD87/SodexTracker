import { NextRequest, NextResponse } from "next/server";
import { liveView, snapshotKey, SNAPSHOT_TTL } from "@/lib/snapshots";
import { shardOf, squadShard, squadWho, type SquadShard, type SquadWho } from "@/lib/squadStore";
import { SQUADS_LIVE } from "@/lib/features";

/**
 * GET /api/analytics/squads/lookup?address=0x…
 *
 * A wallet's two squads: the one it joined (its inviter's) and the one it
 * built (its own invitees'), from the hourly published views, plus the boost
 * they'd give it. Who invited the wallet, and whether it counts, come from
 * the same views; a wallet our scan hasn't reached yet is asked of SoDEX live
 * (which allows 20 such calls a minute per IP, so it's only the fallback).
 */
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
type Unavailable = { available: false; reason: string };

const inviters = new Map<string, { at: number; value: Promise<string | null> }>();

/** Who invited a wallet, from SoDEX's public referral lookup; answers are remembered for 10 minutes, failures not at all. */
function liveInviter(address: string): Promise<string | null> {
  const hit = inviters.get(address);
  if (hit && Date.now() - hit.at < 600_000) return hit.value;
  const value = (async () => {
    const res = await fetch(`https://alpha-biz.sodex.dev/biz/referral/referrer?wallet_address=${address}`, {
      headers: { Accept: "application/json", Origin: "https://sodex.com", Referer: "https://sodex.com/" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    // Over the rate limit SoDEX answers in plain text, which fails here as it should.
    const json = JSON.parse(await res.text()) as { code?: number | string; data?: { referredBy?: { referrer?: string } | null } };
    if (!res.ok || (json.code !== 0 && json.code !== "0")) throw new Error("SoDEX's referral lookup failed");
    const ref = json.data?.referredBy?.referrer;
    return typeof ref === "string" && ADDRESS.test(ref) && ref.toLowerCase() !== address ? ref.toLowerCase() : null;
  })();
  inviters.set(address, { at: Date.now(), value });
  value.catch(() => inviters.delete(address));
  if (inviters.size > 5_000) inviters.delete(inviters.keys().next().value!);
  return value;
}

const squadsOf = (address: string) => {
  const p = shardOf(address);
  return liveView<SquadShard | Unavailable>(snapshotKey.squadShard(p), SNAPSHOT_TTL.squadShard, () => squadShard(p));
};
const whoOf = (address: string) => {
  const p = shardOf(address);
  return liveView<SquadWho | Unavailable>(snapshotKey.squadWho(p), SNAPSHOT_TTL.squadWho, () => squadWho(p));
};

export async function GET(request: NextRequest) {
  if (!SQUADS_LIVE) return NextResponse.json({ code: 1, message: "Not found" }, { status: 404 });
  const raw = (request.nextUrl.searchParams.get("address") ?? "").trim();
  if (!ADDRESS.test(raw)) return NextResponse.json({ code: 1, message: "Enter a full wallet address (0x followed by 40 characters)." }, { status: 400 });
  const address = raw.toLowerCase();
  try {
    const [own, who] = await Promise.all([squadsOf(address), whoOf(address)]);
    if (!own.available) return NextResponse.json({ code: 0, message: "success", data: own });

    // From our data once the scan has reached this wallet; else asked live (undefined: SoDEX didn't answer).
    const known = who.available ? who.wallets[address] : undefined;
    const inviter: string | null | undefined = known ? known[0] || null : await liveInviter(address).catch(() => undefined);
    const theirs = inviter ? (shardOf(inviter) === shardOf(address) ? own : await squadsOf(inviter)) : null;
    const joined = theirs?.available ? (theirs.squads[inviter!] ?? null) : null;
    const built = own.squads[address] ?? null;
    const listed = built?.people?.find((m) => m.address === address) ?? joined?.people?.find((m) => m.address === address) ?? null;
    const counts = known ? known[1] === 1 : (listed?.active ?? null);
    return NextResponse.json(
      {
        code: 0,
        message: "success",
        data: {
          available: true,
          address,
          scanned: !!known,
          inviter: inviter ?? null,
          inviterKnown: inviter !== undefined,
          joined,
          built,
          // null where we can't tell.
          self: { counts, volume: listed?.volume ?? null },
          boost: {
            // A wallet that doesn't count gets no boost, whatever its squads reach.
            squads: counts === false ? 0 : Math.min(own.maxBoost, (joined?.boost ?? 0) + (built?.boost ?? 0)),
            // No extra boost for joining through a code: SoDEX's own total for a member is its two squads' boosts.
            invited: 0,
            max: own.maxBoost,
          },
          asOf: own.asOf,
        },
      },
      // An answer missing SoDEX's part isn't one to keep: the next try should ask again.
      { headers: { "Cache-Control": inviter === undefined ? "no-store" : "public, s-maxage=300, stale-while-revalidate=900" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Squad lookup failed";
    return NextResponse.json({ code: 1, message }, { status: 502 });
  }
}
