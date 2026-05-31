import { promises as fs } from "fs";
import path from "path";
import { buildTrailsResponse } from "../src/lib/build-trails";
import { fetchTileImage, hasCreds } from "../src/lib/cdse";
import { TRUECOLOR_EVALSCRIPT } from "../src/lib/evalscript";
import { tiles, OVERLAY_PX, TRUECOLOR_LOOKBACK_DAYS } from "../src/lib/region";

// Regenerate everything production serves statically: the trail + snow
// snapshot and the satellite imagery tiles.
// Run with: pnpm snapshot   (needs CDSE_CLIENT_ID / CDSE_CLIENT_SECRET)
async function main() {
  const pub = path.join(process.cwd(), "public");

  console.log("Building trail + snow snapshot…");
  const res = await buildTrailsResponse();
  await fs.mkdir(pub, { recursive: true });
  await fs.writeFile(
    path.join(pub, "trails-snapshot.json"),
    JSON.stringify(res),
  );
  console.log(
    `  ${res.meta.trailCount} trails, ${res.features.length} segments` +
      `, mode ${res.meta.mode}, scene ${res.meta.sceneDate ?? "n/a"}`,
  );

  if (hasCreds()) {
    console.log("Rendering satellite imagery tiles…");
    const dir = path.join(pub, "overlay", "truecolor");
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
    const region = tiles();
    const toIso = new Date().toISOString();
    const fromIso = new Date(
      Date.now() - TRUECOLOR_LOOKBACK_DAYS * 864e5,
    ).toISOString();
    let done = 0;
    await Promise.all(
      region.map(async (t, i) => {
        const jpg = await fetchTileImage(
          t,
          TRUECOLOR_EVALSCRIPT,
          fromIso,
          toIso,
          OVERLAY_PX,
          "mostRecent",
          "image/jpeg",
        );
        await fs.writeFile(path.join(dir, `${i}.jpg`), jpg);
        console.log(`  imagery tile ${++done}/${region.length}`);
      }),
    );
  }
  console.log("Snapshot complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
