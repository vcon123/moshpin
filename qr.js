/* MoshPin — QR codes.
   Wraps qrcode-generator (Kazuhiko Arase, MIT) rather than a hand-rolled
   encoder: it is small, dependency-free, and already correct. We only add the
   SVG rendering, so an invite code needs no network and no third-party image
   service. */
import qrcode from './vendor-qrcode.mjs';

/* boolean matrix — used by the renderer and by tests */
export function encode(text) {
  const q = qrcode(0, 'L');          // 0 = pick the smallest version that fits
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  return Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => q.isDark(r, c)));
}

/* Inline SVG: scales cleanly, prints well, and costs a couple of KB. */
export function svg(text, px) {
  const m = encode(text);
  const n = m.length, quiet = 4, total = n + quiet * 2;
  let path = '';
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (m[r][c]) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  return `<svg viewBox="0 0 ${total} ${total}" width="${px || 200}" height="${px || 200}" ` +
    `shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Invite QR code">` +
    `<rect width="${total}" height="${total}" fill="#fff"/>` +
    `<path d="${path}" fill="#000"/></svg>`;
}
