import crypto from 'node:crypto';
import { PNG } from 'pngjs';
import { clamp, mix } from './utils';

export function createGradientPng(width: number, height: number, seed: string, thumbnail: boolean) {
  const png = new PNG({ width, height });
  const hash = crypto.createHash('sha256').update(seed).digest();
  const top = [255, 248 - (hash[0] % 20), 244 - (hash[1] % 16)];
  const bottom = [224 - (hash[2] % 24), 230 - (hash[3] % 20), 248 - (hash[4] % 14)];
  const accent = [209 + (hash[5] % 24), 196 + (hash[6] % 28), 173 + (hash[7] % 24)];

  for (let y = 0; y < height; y += 1) {
    const t = y / Math.max(height - 1, 1);
    for (let x = 0; x < width; x += 1) {
      const idx = (width * y + x) << 2;
      const wave = Math.sin((x / width) * Math.PI * 4 + t * Math.PI) * 10;
      png.data[idx] = clamp(mix(top[0], bottom[0], t) + wave);
      png.data[idx + 1] = clamp(mix(top[1], bottom[1], t) + wave / 2);
      png.data[idx + 2] = clamp(mix(top[2], bottom[2], t));
      png.data[idx + 3] = 255;

      const cx = width * 0.72;
      const cy = height * 0.28;
      const rx = thumbnail ? width * 0.18 : width * 0.22;
      const ry = thumbnail ? height * 0.11 : height * 0.13;
      const ellipse = ((x - cx) ** 2) / (rx ** 2) + ((y - cy) ** 2) / (ry ** 2);
      if (ellipse < 1) {
        png.data[idx] = clamp((png.data[idx] + accent[0]) / 2);
        png.data[idx + 1] = clamp((png.data[idx + 1] + accent[1]) / 2);
        png.data[idx + 2] = clamp((png.data[idx + 2] + accent[2]) / 2);
      }
    }
  }

  return PNG.sync.write(png);
}

export function createSolidPng(width: number, height: number, rgb: [number, number, number]) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (width * y + x) << 2;
      png.data[idx] = rgb[0];
      png.data[idx + 1] = rgb[1];
      png.data[idx + 2] = rgb[2];
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}
