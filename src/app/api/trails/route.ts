import { NextRequest, NextResponse } from "next/server";
import { buildTrailsResponse } from "@/lib/build-trails";
import { getJson, setJson } from "@/lib/cache";
import type { TrailsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const RESPONSE_TTL = 6 * 3600 * 1000;

// Live build, for local development. Production serves the precomputed
// /trails-snapshot.json instead (the full build is too slow for a request).
export async function GET(req: NextRequest) {
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";

  if (!refresh) {
    const cached = await getJson<TrailsResponse>("response-v2", RESPONSE_TTL);
    if (cached) return NextResponse.json(cached);
  }

  const response = await buildTrailsResponse();
  await setJson("response-v2", response);
  return NextResponse.json(response);
}
