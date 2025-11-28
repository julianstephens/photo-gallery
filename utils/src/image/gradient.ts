import sharp from "sharp";

// `quantize` is the median-cut quantizer used by color-thief / vibrant.
// It has no bundled TypeScript types; we use a require with ts-ignore for simplicity.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const quantize = require("quantize");

type RGB = [number, number, number];

export interface GradientResult {
  palette: string[]; // hex palette, e.g., ["#AABBCC", ...]
  primary: string; // hex
  secondary: string; // hex
  foreground: string; // "#000000" or "#FFFFFF"
  css: string; // linear-gradient CSS string
}

export interface GradientResultWithPlaceholder extends GradientResult {
  // base64 data URL for a small blurred placeholder image (e.g., data:image/jpeg;base64,...)
  placeholder: string;
}

/**
 * Generate a two-color gradient and palette from image bytes (server-side).
 * This function is the original one (no placeholder).
 */
export async function generateGradientFromBuffer(
  buffer: Buffer,
  options?: { downscale?: number; k?: number },
): Promise<GradientResult> {
  return (await generateGradientInternal(buffer, options, { createPlaceholder: false })).result;
}

/**
 * Generate gradient AND a small blurred placeholder (data URL).
 *
 * options.placeholderWidth: width (px) of the tiny placeholder (default 20)
 * options.placeholderQuality: jpeg quality (default 60)
 * options.placeholderBlur: sharp blur sigma (default 8)
 */
export async function generateGradientWithPlaceholder(
  buffer: Buffer,
  options?: {
    downscale?: number;
    k?: number;
    placeholderWidth?: number;
    placeholderQuality?: number;
    placeholderBlur?: number;
  },
): Promise<GradientResultWithPlaceholder> {
  const { result, placeholder } = await generateGradientInternal(buffer, options, {
    createPlaceholder: true,
  });
  return { ...result, placeholder };
}

/* ---------------------------
   Internal implementation
   --------------------------- */

async function generateGradientInternal(
  buffer: Buffer,
  options?: {
    downscale?: number;
    k?: number;
    placeholderWidth?: number;
    placeholderQuality?: number;
    placeholderBlur?: number;
  },
  flags?: { createPlaceholder?: boolean },
): Promise<{ result: GradientResult; placeholder?: string }> {
  const downscale = options?.downscale ?? 40;
  const k = options?.k ?? 5;
  const alphaSkipThreshold = 8; // alpha < 8 considered transparent

  // Step A: decode + downscale using sharp (rotate handles EXIF orientation)
  const { data, info } = await sharp(buffer)
    .rotate()
    .resize(downscale, downscale, { fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels; // 3 (rgb) or 4 (rgba)
  const pixels: RGB[] = [];
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (channels === 4) {
      const a = data[i + 3];
      if (a < alphaSkipThreshold) continue; // skip transparent
    }
    pixels.push([r, g, b]);
  }

  // If not enough pixels (all transparent or tiny), return fallback neutral gradient
  if (pixels.length === 0) {
    const fallbackA = "#EEEEEE";
    const fallbackB = "#CCCCCC";
    const fallbackResult: GradientResult = {
      palette: [fallbackA, fallbackB],
      primary: fallbackA,
      secondary: fallbackB,
      foreground: pickForegroundColor(hexToRgb(fallbackA), hexToRgb(fallbackB)),
      css: `linear-gradient(135deg, ${fallbackA} 0%, ${fallbackB} 100%)`,
    };

    if (flags?.createPlaceholder) {
      const placeholder = await createBlurDataURL(buffer, {
        width: options?.placeholderWidth ?? 20,
        quality: options?.placeholderQuality ?? 60,
        blurSigma: options?.placeholderBlur ?? 8,
      });
      return { result: fallbackResult, placeholder };
    }

    return { result: fallbackResult };
  }

  // Step C: quantize to obtain palette using median cut
  const cmap = quantize(pixels, Math.max(2, k));
  const rawPalette: RGB[] = cmap.palette(); // returns array of [r,g,b]

  // Step D: cluster stats - map each pixel to nearest palette color (euclidean rgb)
  const clusters: { sum: number[]; count: number }[] = rawPalette.map(() => ({
    sum: [0, 0, 0],
    count: 0,
  }));

  for (const p of pixels) {
    let bestIndex = 0;
    let bestDist = Infinity;
    for (let i = 0; i < rawPalette.length; ++i) {
      const q = rawPalette[i];
      const d = rgbDistanceSquared(p, q);
      if (d < bestDist) {
        bestDist = d;
        bestIndex = i;
      }
    }
    clusters[bestIndex].count += 1;
    clusters[bestIndex].sum[0] += p[0];
    clusters[bestIndex].sum[1] += p[1];
    clusters[bestIndex].sum[2] += p[2];
  }

  const totalCount = clusters.reduce((s, c) => s + c.count, 0);

  // Build cluster averages and filter small clusters
  const clusterInfos = clusters
    .map((c, i) => {
      const avg =
        c.count > 0
          ? ([
              Math.round(c.sum[0] / c.count),
              Math.round(c.sum[1] / c.count),
              Math.round(c.sum[2] / c.count),
            ] as RGB)
          : (rawPalette[i] as RGB);

      return {
        index: i,
        count: c.count,
        populationPct: c.count / totalCount,
        rgb: avg,
        lab: rgbToLab(avg),
        hsl: rgbToHsl(avg),
      };
    })
    .filter((c) => c.count > 0);

  // Step E: pick primary (largest population) and secondary (most distinct)
  clusterInfos.sort((a, b) => b.count - a.count);
  const primaryCluster = clusterInfos[0];

  // compute deltaE (CIE76) difference and pick candidate secondary
  const deltaEs = clusterInfos
    .slice(1)
    .map((c) => ({ ...c, delta: deltaE76(primaryCluster.lab, c.lab) }));

  // pick cluster with max delta and decent population or threshold
  const deltaThreshold = 15; // perceptual delta threshold
  deltaEs.sort((a, b) => b.delta - a.delta || b.count - a.count);

  let secondaryCluster = deltaEs.find((c) => c.delta >= deltaThreshold) || deltaEs[0];

  // if no candidate at all (only one cluster), synthesize secondary by hue shift
  if (!secondaryCluster) {
    const synthesized = synthesizeSecondaryFromPrimary(primaryCluster.rgb);
    secondaryCluster = {
      index: -1,
      count: 0,
      populationPct: 0,
      rgb: synthesized,
      lab: rgbToLab(synthesized),
      hsl: rgbToHsl(synthesized),
    };
  }

  // Step F: post-process tweak saturation/lightness
  const minSaturation = 0.12;
  const minLightness = 0.12;
  const maxLightness = 0.92;
  const minLuminanceDiff = 0.12;

  const primaryRgbAdjusted = clampSatLight(primaryCluster.rgb, {
    minS: minSaturation,
    minL: minLightness,
    maxL: maxLightness,
  });
  let secondaryRgbAdjusted = clampSatLight(secondaryCluster.rgb, {
    minS: minSaturation,
    minL: minLightness,
    maxL: maxLightness,
  });

  // ensure sufficient luminance difference (relative luminance)
  const L1 = rgbRelativeLuminance(primaryRgbAdjusted);
  const L2 = rgbRelativeLuminance(secondaryRgbAdjusted);
  if (Math.abs(L1 - L2) < minLuminanceDiff) {
    // nudge secondary away in lightness
    secondaryRgbAdjusted = nudgeLightnessAway(
      primaryRgbAdjusted,
      secondaryRgbAdjusted,
      minLuminanceDiff,
    );
  }

  // Final hex strings
  const primaryHex = rgbToHex(primaryRgbAdjusted);
  const secondaryHex = rgbToHex(secondaryRgbAdjusted);

  // palette hex list (map rawPalette to hex)
  const paletteHex = rawPalette.map((c) => rgbToHex(c as RGB));

  // Step G: pick foreground (black/white)
  const foreground = pickForegroundColor(hexToRgb(primaryHex), hexToRgb(secondaryHex));

  const css = `linear-gradient(135deg, ${primaryHex} 0%, ${secondaryHex} 100%)`;

  const result: GradientResult = {
    palette: paletteHex,
    primary: primaryHex,
    secondary: secondaryHex,
    foreground,
    css,
  };

  if (flags?.createPlaceholder) {
    const placeholder = await createBlurDataURL(buffer, {
      width: options?.placeholderWidth ?? 20,
      quality: options?.placeholderQuality ?? 60,
      blurSigma: options?.placeholderBlur ?? 8,
    });
    return { result, placeholder };
  }

  return { result };
}

/* ---------------------------
   Blurred placeholder helper
   --------------------------- */

/**
 * Create a small blurred JPEG/WEBP data URL from the source buffer.
 * - width: target width in px for tiny image (square). Defaults to 20.
 * - quality: jpeg quality (1..100). Defaults to 60.
 * - blurSigma: sharp blur sigma (e.g., 8). Defaults to 8.
 */
async function createBlurDataURL(
  buffer: Buffer,
  opts?: { width?: number; quality?: number; blurSigma?: number },
): Promise<string> {
  const width = opts?.width ?? 20;
  const quality = opts?.quality ?? 60;
  const blurSigma = opts?.blurSigma ?? 8;

  // Resize to a small square, apply a strong blur, and encode as jpeg
  const buf = await sharp(buffer)
    .rotate()
    .resize(width, width, { fit: "cover" })
    .blur(blurSigma)
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();

  const mime = "image/jpeg";
  const data = buf.toString("base64");
  return `data:${mime};base64,${data}`;
}

/* ---------------------------
   Helper functions & color math
   --------------------------- */

function rgbDistanceSquared(a: RGB, b: RGB): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function rgbToHex(rgb: RGB) {
  return (
    "#" +
    rgb
      .map((v) => {
        const s = clamp(Math.round(v), 0, 255).toString(16);
        return s.length === 1 ? "0" + s : s;
      })
      .join("")
  ).toUpperCase();
}

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const bigint = parseInt(h, 16);
  if (h.length === 6) {
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
  }
  // fallback
  return [0, 0, 0];
}

// convert sRGB [0..255] to linear RGB component [0..1]
function srgbToLinear(c: number) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

// relative luminance per WCAG
function rgbRelativeLuminance(rgb: RGB) {
  const r = srgbToLinear(rgb[0]);
  const g = srgbToLinear(rgb[1]);
  const b = srgbToLinear(rgb[2]);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// pick foreground black/white using contrast ratio, prefer the one with higher minimal contrast across the two stops
function pickForegroundColor(a: RGB, b: RGB): string {
  const white = [255, 255, 255] as RGB;
  const black = [0, 0, 0] as RGB;
  const contrastAWhite = contrastRatio(a, white);
  const contrastBWhite = contrastRatio(b, white);
  const minWhite = Math.min(contrastAWhite, contrastBWhite);

  const contrastABlack = contrastRatio(a, black);
  const contrastBBlack = contrastRatio(b, black);
  const minBlack = Math.min(contrastABlack, contrastBBlack);

  return minWhite >= minBlack ? "#FFFFFF" : "#000000";
}

function contrastRatio(rgbA: RGB, rgbB: RGB) {
  const LA = rgbRelativeLuminance(rgbA);
  const LB = rgbRelativeLuminance(rgbB);
  const lighter = Math.max(LA, LB);
  const darker = Math.min(LA, LB);
  return (lighter + 0.05) / (darker + 0.05);
}

/* RGB -> XYZ -> Lab conversions for deltaE (CIE76) */
function rgbToXyz(rgb: RGB) {
  const r = srgbToLinear(rgb[0]);
  const g = srgbToLinear(rgb[1]);
  const b = srgbToLinear(rgb[2]);

  // sRGB D65
  const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;

  return [x, y, z];
}

function xyzToLab(xyz: number[]) {
  // reference white D65
  const refX = 0.95047;
  const refY = 1.0;
  const refZ = 1.08883;
  const [x, y, z] = xyz;
  const fx = pivotXyz(x / refX);
  const fy = pivotXyz(y / refY);
  const fz = pivotXyz(z / refZ);
  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const b = 200 * (fy - fz);
  return [L, a, b];
}

function pivotXyz(t: number) {
  return t > 0.008856 ? Math.cbrt(t) : 7.787037 * t + 16 / 116;
}

function rgbToLab(rgb: RGB) {
  const xyz = rgbToXyz(rgb);
  return xyzToLab(xyz);
}

// CIE76 deltaE (Euclidean in Lab)
function deltaE76(labA: number[], labB: number[]) {
  const dL = labA[0] - labB[0];
  const da = labA[1] - labB[1];
  const db = labA[2] - labB[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}

/* RGB -> HSL (0..1 ranges except h in degrees) */
function rgbToHsl(rgb: RGB) {
  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
  }

  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hh = h / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r1 = 0,
    g1 = 0,
    b1 = 0;
  if (0 <= hh && hh < 1) {
    r1 = c;
    g1 = x;
  } else if (1 <= hh && hh < 2) {
    r1 = x;
    g1 = c;
  } else if (2 <= hh && hh < 3) {
    g1 = c;
    b1 = x;
  } else if (3 <= hh && hh < 4) {
    g1 = x;
    b1 = c;
  } else if (4 <= hh && hh < 5) {
    r1 = x;
    b1 = c;
  } else if (5 <= hh && hh < 6) {
    r1 = c;
    b1 = x;
  }
  const m = l - c / 2;
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
}

// ensure saturation / lightness within reasonable bounds, returns new RGB
function clampSatLight(rgb: RGB, opts: { minS: number; minL: number; maxL: number }): RGB {
  const hsl = rgbToHsl(rgb);
  const s = Math.max(hsl.s, opts.minS);
  const l = clamp(hsl.l, opts.minL, opts.maxL);
  return hslToRgb(hsl.h, s, l);
}

// synthesize a secondary by shifting hue (used when there is no distinct secondary)
function synthesizeSecondaryFromPrimary(primary: RGB): RGB {
  const hsl = rgbToHsl(primary);
  const newHue = (hsl.h + 60) % 360; // shift 60 degrees
  const newS = Math.max(hsl.s, 0.18);
  const newL = clamp(hsl.l + (hsl.l < 0.5 ? 0.18 : -0.18), 0.12, 0.92);
  return hslToRgb(newHue, newS, newL);
}

// nudge secondary lightness away from primary, trying to reach minDiff in relative luminance
function nudgeLightnessAway(primary: RGB, secondary: RGB, minDiff: number): RGB {
  const pL = rgbRelativeLuminance(primary);
  const sHsl = rgbToHsl(secondary);
  // const sL = sHsl.l;
  const step = 0.06;
  let attempts = 0;
  while (attempts < 8) {
    const candidate = hslToRgb(sHsl.h, sHsl.s, sHsl.l);
    const candL = rgbRelativeLuminance(candidate);
    if (Math.abs(pL - candL) >= minDiff) {
      return candidate;
    }
    if (pL < candL) {
      sHsl.l = Math.max(0.12, sHsl.l - step);
    } else {
      sHsl.l = Math.min(0.92, sHsl.l + step);
    }
    attempts++;
  }
  return hslToRgb(sHsl.h, sHsl.s, sHsl.l);
}
