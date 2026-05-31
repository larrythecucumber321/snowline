// Sentinel-2 L2A snow classification evalscript (process API, V3).
//
// Mosaics every orbit in the lookback window, most-recent first. For each
// pixel it walks scenes until it finds one that is not cloud/shadow (per the
// L2A Scene Classification band) and classifies snow from NDSI:
//   NDSI = (B03 - B11) / (B03 + B11),  snow when NDSI > 0.42 AND B08 > 0.11.
// The B08 (NIR) gate rejects water, which also has a high NDSI.
//
// Output band: 0 = snow-free, 1 = snow, 255 = no cloud-free observation.
export const SNOW_EVALSCRIPT = `//VERSION=3
function setup() {
  // No units specified: S2L2A optical bands default to reflectance (0-1),
  // SCL keeps its native DN. Mixing units in one input block is rejected.
  return {
    input: [{ bands: ["B03", "B08", "B11", "SCL", "dataMask"] }],
    output: { bands: 1, sampleType: "FLOAT32" },
    mosaicking: "ORBIT"
  };
}
function evaluatePixel(samples) {
  for (var i = 0; i < samples.length; i++) {
    var s = samples[i];
    if (!s || s.dataMask !== 1) continue;
    var scl = s.SCL;
    // skip: 0 no-data, 1 saturated, 3 cloud shadow, 8/9 cloud, 10 cirrus
    if (scl === 0 || scl === 1 || scl === 3 || scl === 8 || scl === 9 || scl === 10) continue;
    // Cloud the SCL mask missed: bright in green AND in SWIR. Snow is bright
    // in green but dark in SWIR, so this rejects cloud without losing snow.
    if (s.B03 > 0.28 && s.B11 > 0.2) continue;
    // Forest canopy (SCL vegetation) and water tell us nothing about trail
    // snow — and bright/turbid water can be mistaken for snow. Mark 254 so the
    // model ignores them and reads the snow line from open land only.
    if (scl === 4 || scl === 6) return [254];
    var ndsi = (s.B03 - s.B11) / (s.B03 + s.B11 + 1e-6);
    return [ndsi > 0.42 && s.B08 > 0.11 ? 1 : 0];
  }
  return [255];
}`;

// True-colour RGB imagery for the photo overlay. Composites the most recent
// cloud-free pixel per location (skipping cloud/shadow via the SCL band) so the
// overlay shows real ground, not cloud tops mistaken for snow. RGB (not RGBA)
// so tiles can be served as compact JPEGs; gaps fall back to a neutral grey.
export const TRUECOLOR_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B02", "B03", "B04", "SCL", "dataMask"] }],
    output: { bands: 3 },
    mosaicking: "ORBIT"
  };
}
function evaluatePixel(samples) {
  for (var i = 0; i < samples.length; i++) {
    var s = samples[i];
    if (!s || s.dataMask !== 1) continue;
    var scl = s.SCL;
    if (scl === 0 || scl === 1 || scl === 3 || scl === 8 || scl === 9 || scl === 10) continue;
    return [2.8 * s.B04, 2.8 * s.B03, 2.8 * s.B02];
  }
  return [0.62, 0.64, 0.66];
}`;
