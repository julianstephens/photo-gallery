import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { generateGradientFromBuffer } from "../src/image/gradient";

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const bigint = parseInt(h, 16);
  if (h.length === 6) {
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
  }
  // fallback
  return [0, 0, 0];
}

// Euclidean distance in RGB space
function rgbDistance(a: RGB, b: RGB) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

describe("generateGradientFromBuffer", () => {
  it("extracts primary color close to solid red from a solid red image", async () => {
    const buf = await sharp({
      create: {
        width: 40,
        height: 40,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

    const result = await generateGradientFromBuffer(buf, { downscale: 40, k: 5 });

    // primary should be present
    expect(result.primary).toBeDefined();

    // palette should contain a color close to pure red
    const paletteRgbs = result.palette.map(hexToRgb);
    const hasRedNearby = paletteRgbs.some((p) => rgbDistance(p, [255, 0, 0]) <= 40);
    expect(hasRedNearby).toBe(true);

    // primary should be reasonably close to red
    const primaryRgb = hexToRgb(result.primary);
    expect(rgbDistance(primaryRgb, [255, 0, 0])).toBeLessThanOrEqual(50);

    // CSS should include both primary and secondary hexes
    expect(result.css).toContain(result.primary);
    expect(result.css).toContain(result.secondary);

    // foreground should be either black or white
    expect(["#000000", "#FFFFFF"]).toContain(result.foreground.toUpperCase());
  });

  it("finds both blue and green in a half-blue half-green image", async () => {
    // base blue image (40x20)
    const base = await sharp({
      create: {
        width: 40,
        height: 20,
        channels: 3,
        background: { r: 0, g: 0, b: 255 },
      },
    })
      .png()
      .toBuffer();

    // green rectangle 20x20
    const greenRect = await sharp({
      create: {
        width: 20,
        height: 20,
        channels: 3,
        background: { r: 0, g: 255, b: 0 },
      },
    })
      .png()
      .toBuffer();

    // composite green rect on the right half
    const combined = await sharp(base)
      .composite([{ input: greenRect, left: 20, top: 0 }])
      .png()
      .toBuffer();

    const result = await generateGradientFromBuffer(combined, { downscale: 40, k: 5 });

    const paletteRgbs = result.palette.map(hexToRgb);

    // require at least one color close to blue and one close to green
    const hasBlueNearby = paletteRgbs.some((p) => rgbDistance(p, [0, 0, 255]) <= 60);
    const hasGreenNearby = paletteRgbs.some((p) => rgbDistance(p, [0, 255, 0]) <= 60);

    expect(hasBlueNearby && hasGreenNearby).toBe(true);

    expect(result.css).toContain(result.primary);
    expect(result.css).toContain(result.secondary);
    expect(["#000000", "#FFFFFF"]).toContain(result.foreground.toUpperCase());
  });

  it("returns fallback gradient for a fully transparent image", async () => {
    // fully transparent RGBA image
    const buf = await sharp({
      create: {
        width: 40,
        height: 40,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();

    const result = await generateGradientFromBuffer(buf, { downscale: 40, k: 5 });

    // fallback in generator is #EEEEEE / #CCCCCC
    expect(result.primary.toUpperCase()).toBe("#EEEEEE");
    expect(result.secondary.toUpperCase()).toBe("#CCCCCC");
    expect(result.css).toContain("#EEEEEE");
    expect(result.css).toContain("#CCCCCC");
  });
});
