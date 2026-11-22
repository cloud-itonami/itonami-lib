// The app icon: the classification code in seven-segment digits on the
// scheme's colour. Drawn as paths so the result does not depend on a font.
import { SCHEMES } from "./identity.mjs";

//            a  b  c  d  e  f  g
const SEG = { 0: "abcdef", 1: "bc", 2: "abdeg", 3: "abcdg", 4: "bcfg", 5: "acdfg", 6: "acdefg", 7: "abc", 8: "abcdefg", 9: "abcdfg" };

function digit(ch, x, y, w, h, t) {
  const on = SEG[ch] ?? "g";
  const mid = y + h / 2;
  const bar = { a: [x + t, y, w - 2 * t, t], d: [x + t, y + h - t, w - 2 * t, t], g: [x + t, mid - t / 2, w - 2 * t, t],
    f: [x, y + t, t, h / 2 - 1.5 * t], b: [x + w - t, y + t, t, h / 2 - 1.5 * t],
    e: [x, mid + t / 2, t, h / 2 - 1.5 * t], c: [x + w - t, mid + t / 2, t, h / 2 - 1.5 * t] };
  return [...on].map((s) => { const [rx, ry, rw, rh] = bar[s]; return `<rect x="${rx.toFixed(1)}" y="${ry.toFixed(1)}" width="${rw.toFixed(1)}" height="${rh.toFixed(1)}" rx="${(t / 2).toFixed(1)}"/>`; }).join("");
}

export function iconSvg(identity) {
  const chars = [...identity.code.toUpperCase()].filter((c) => /[0-9A-Z]/.test(c)).slice(0, 6);
  const size = 1024, pad = 150, gap = 36;
  const w = Math.min(150, (size - 2 * pad - gap * (chars.length - 1)) / chars.length);
  const h = Math.min(w * 1.9, 330), t = Math.max(18, w * 0.2);
  const total = chars.length * w + gap * (chars.length - 1);
  let x = (size - total) / 2;
  const y = 560 - h / 2;
  const digits = chars.map((c) => { const d = digit(c, x, y, w, h, t); x += w + gap; return d; }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
    `<rect width="${size}" height="${size}" rx="200" fill="${SCHEMES[identity.scheme].colour}"/>` +
    `<rect x="${pad}" y="230" width="${size - 2 * pad}" height="28" rx="14" fill="#fff" fill-opacity="0.55"/>` +
    `<rect x="${pad}" y="862" width="${size - 2 * pad}" height="28" rx="14" fill="#fff" fill-opacity="0.55"/>` +
    `<g fill="#fff">${digits}</g></svg>\n`;
}
