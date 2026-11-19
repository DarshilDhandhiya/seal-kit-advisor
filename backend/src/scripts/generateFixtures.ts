/**
 * npm run fixtures
 * Generates (all FICTIONAL, original artwork — no JCB plates/photos/catalogue images):
 *   public/demo/kits/<SKU>.png            product-card placeholder per kit (seal-ring silhouette, SKU, assembly, "DEMO")
 *   public/demo/assemblies/<CODE>.png     assembly placeholder
 *   fixtures/plates-generated/*.png       OCR test plates from the DEMO serials: clear, blurred, rotated, cropped, low-res, noisy
 * The 11 plates in fixtures/plates/ (+ manifest.json) are the supplied reference set and are not overwritten.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const seed = JSON.parse(fs.readFileSync(path.join(root, 'data/seed.json'), 'utf8'));
const FONT = "DejaVu Sans, Verdana, Arial, Helvetica, sans-serif";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function plateSvg(model: string, serial: string, w = 1280, h = 800) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 1280 800">
  <rect width="1280" height="800" fill="#2f353b"/>
  <rect x="100" y="105" width="1080" height="590" rx="28" fill="#4a4f52"/>
  <rect x="112" y="117" width="1056" height="566" rx="20" fill="#c5cac6"/>
  ${[[145, 150], [1135, 150], [145, 650], [1135, 650]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="19" fill="#586064" stroke="#fff" stroke-width="2"/>`).join('')}
  <text x="195" y="205" font-family="${FONT}" font-size="46" font-weight="700" fill="#1f282c">DEMO MACHINE PLATE</text>
  <rect x="195" y="231" width="890" height="4" fill="#5d6a70"/>
  <text x="195" y="300" font-family="${FONT}" font-size="34" fill="#3d444a">MODEL</text>
  <text x="490" y="308" font-family="${FONT}" font-size="46" font-weight="700" fill="#0f1a20">${esc(model)}</text>
  <text x="195" y="397" font-family="${FONT}" font-size="34" fill="#3d444a">SERIAL NUMBER</text>
  <text x="195" y="476" font-family="${FONT}" font-size="58" font-weight="700" fill="#0b161d">${esc(serial)}</text>
  <text x="195" y="588" font-family="${FONT}" font-size="20" fill="#4a5256">FICTIONAL TEST FIXTURE  •  NOT A REAL MACHINE ID</text>
</svg>`;
}

function kitCardSvg(sku: string, name: string, asm: string, label: string) {
  const hue = { BOOM: '#1f6f8b', DIPPER: '#7b4b94', BUCKET: '#b5651d', STAB: '#2e7d5b' }[asm] ?? '#445';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
  <rect width="600" height="400" fill="#f4f6f7"/><rect x="12" y="12" width="576" height="376" rx="18" fill="#fff" stroke="#cfd6da" stroke-width="3"/>
  <rect x="12" y="12" width="576" height="64" rx="18" fill="${hue}"/><rect x="12" y="50" width="576" height="26" fill="${hue}"/>
  <text x="34" y="54" font-family="${FONT}" font-size="26" font-weight="700" fill="#fff">${esc(label.toUpperCase())}</text>
  <rect x="470" y="26" width="104" height="36" rx="18" fill="#fff"/><text x="522" y="51" text-anchor="middle" font-family="${FONT}" font-size="20" font-weight="700" fill="${hue}">DEMO</text>
  <g transform="translate(160,215)">
    <circle r="86" fill="none" stroke="#252b2f" stroke-width="30"/><circle r="86" fill="none" stroke="#5d6a70" stroke-width="6" stroke-dasharray="4 10"/>
    <circle r="38" fill="none" stroke="${hue}" stroke-width="14"/>
  </g>
  <g transform="translate(300,160)">
    <text font-family="${FONT}" font-size="22" fill="#59656b">SKU</text>
    <text y="40" font-family="${FONT}" font-size="30" font-weight="700" fill="#14202a">${esc(sku)}</text>
    <text y="90" font-family="${FONT}" font-size="22" fill="#59656b">ASSEMBLY</text>
    <text y="128" font-family="${FONT}" font-size="28" font-weight="700" fill="${hue}">${esc(asm)}</text>
    <text y="170" font-family="${FONT}" font-size="20" fill="#59656b">${esc(name)}</text>
  </g>
  <text x="300" y="368" text-anchor="middle" font-family="${FONT}" font-size="17" fill="#7a868c">Illustrative placeholder • fictional demo part • not a real fitment</text>
</svg>`;
}

const png = (svg: string) => sharp(Buffer.from(svg)).png();

async function main() {
  fs.mkdirSync(path.join(root, 'public/demo/kits'), { recursive: true });
  fs.mkdirSync(path.join(root, 'public/demo/assemblies'), { recursive: true });
  fs.mkdirSync(path.join(root, 'fixtures/plates-generated'), { recursive: true });

  const labelOf = Object.fromEntries(seed.assemblies.map((a: any) => [a.code, a.label]));
  for (const k of seed.kits) await png(kitCardSvg(k.sku, k.name, k.assemblyCode, labelOf[k.assemblyCode])).toFile(path.join(root, 'public/demo/kits', `${k.sku}.png`));
  for (const a of seed.assemblies) await png(kitCardSvg(a.code, a.label, a.code, a.label)).toFile(path.join(root, 'public/demo/assemblies', `${a.code.toLowerCase()}.png`));

  const out = path.join(root, 'fixtures/plates-generated');
  const manifest: Array<{ file: string; expectedSerial: string | null; expected: string }> = [];
  const add = (file: string, expectedSerial: string | null, expected: string) => manifest.push({ file, expectedSerial, expected });

  for (const m of seed.machines) {
    const base = await png(plateSvg(m.model, m.serial)).toBuffer();
    const n = m.serial.replace('DEMO-', '');
    await fs.promises.writeFile(path.join(out, `${n}_clear.png`), base);
    add(`${n}_clear.png`, m.serial, 'confirm_serial');
  }
  // degraded variants of the first machine
  const s0 = seed.machines[0];
  const clear = await png(plateSvg(s0.model, s0.serial)).toBuffer();
  await sharp(clear).blur(4).png().toFile(path.join(out, 'variant_blurred.png'));
  add('variant_blurred.png', s0.serial, 'confirm_if_readable_else_request_clearer_photo');
  await sharp(clear).blur(14).png().toFile(path.join(out, 'variant_very_blurred.png'));
  add('variant_very_blurred.png', null, 'request_clearer_photo_or_typed_serial');
  await sharp(clear).rotate(-9, { background: '#2f353b' }).png().toFile(path.join(out, 'variant_rotated.png'));
  add('variant_rotated.png', s0.serial, 'confirm_serial');
  await sharp(clear).extract({ left: 0, top: 0, width: 1280, height: 330 }).png().toFile(path.join(out, 'variant_serial_cropped_out.png'));
  add('variant_serial_cropped_out.png', null, 'request_clearer_photo_or_typed_serial');
  await sharp(clear).resize({ width: 420 }).jpeg({ quality: 35 }).toFile(path.join(out, 'variant_low_res.jpg'));
  add('variant_low_res.jpg', s0.serial, 'confirm_if_readable_else_request_clearer_photo');
  const noise = await sharp({ create: { width: 1280, height: 800, channels: 3, background: '#808080', noise: { type: 'gaussian', mean: 128, sigma: 40 } } }).png().toBuffer();
  await sharp(clear).composite([{ input: noise, blend: 'overlay' }]).png().toFile(path.join(out, 'variant_noisy.png'));
  add('variant_noisy.png', s0.serial, 'confirm_if_readable_else_request_clearer_photo');

  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ notice: 'Fictional OCR test plates. Not photographs or copies of JCB identification plates. Never infer real fitment.', images: manifest }, null, 2));
  console.log(`Generated ${seed.kits.length} kit cards, ${seed.assemblies.length} assembly cards, ${manifest.length} plate fixtures.`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
