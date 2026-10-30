// Lightweight block-DCT watermark demo. This is intentionally dependency-free.
// Each payload bit is repeated over several 8x8 blocks for majority-vote decoding.
const MAGIC = [80, 71, 49, 58]; // "PG1:"
const REPEAT = 7;
const GAP = 28;
const U1 = 2, V1 = 3, U2 = 3, V2 = 2;
const COS = Array.from({ length: 8 }, (_, x) =>
  Array.from({ length: 8 }, (_, u) => Math.cos(((2 * x + 1) * u * Math.PI) / 16))
);
const ALPHA = (n) => n === 0 ? Math.sqrt(1 / 8) : Math.sqrt(2 / 8);

function dct(block) {
  const out = Array.from({ length: 8 }, () => Array(8).fill(0));
  for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) {
    let sum = 0;
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) sum += block[x][y] * COS[x][u] * COS[y][v];
    out[u][v] = ALPHA(u) * ALPHA(v) * sum;
  }
  return out;
}
function idct(coeff) {
  const out = Array.from({ length: 8 }, () => Array(8).fill(0));
  for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
    let sum = 0;
    for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) sum += ALPHA(u) * ALPHA(v) * coeff[u][v] * COS[x][u] * COS[y][v];
    out[x][y] = sum;
  }
  return out;
}
function getY(data, idx, channels) {
  const r = data[idx], g = data[idx + 1], b = data[idx + 2];
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
function payloadFor(name) {
  const bytes = Buffer.from(name, 'utf8');
  const body = Buffer.alloc(4 + 2 + bytes.length);
  MAGIC.forEach((b, i) => body[i] = b);
  body.writeUInt16BE(bytes.length, 4);
  bytes.copy(body, 6);
  return body;
}
function bitsFromBuffer(buf) {
  const bits = [];
  for (const byte of buf) for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);
  return bits;
}
function blockCoordinates(width, height) {
  const coords = [];
  for (let y = 0; y + 7 < height; y += 8) {
    for (let x = 0; x + 7 < width; x += 8) coords.push([x, y]);
  }
  return coords;
}
function readBlock(data, width, channels, x0, y0) {
  const block = Array.from({ length: 8 }, () => Array(8).fill(0));
  for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
    const idx = ((y0 + y) * width + (x0 + x)) * channels;
    block[x][y] = getY(data, idx, channels) - 128;
  }
  return block;
}
function writeBlock(data, width, channels, x0, y0, block, original) {
  // Apply luminance delta while retaining each pixel's chroma as much as possible.
  for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
    const idx = ((y0 + y) * width + (x0 + x)) * channels;
    const oldY = getY(original, idx, channels);
    const newY = block[x][y] + 128;
    const delta = newY - oldY;
    for (let c = 0; c < 3; c++) data[idx + c] = Math.max(0, Math.min(255, Math.round(original[idx + c] + delta)));
  }
}
function embedWatermark(input, width, height, creator, channels = 3) {
  if (channels < 3) return { ok: false, error: 'Format warna gambar tidak didukung.' };
  const payload = payloadFor(creator);
  const bits = bitsFromBuffer(payload);
  const coords = blockCoordinates(width, height);
  const needed = bits.length * REPEAT;
  if (coords.length < needed) {
    return { ok: false, error: `Foto terlalu kecil untuk nama ini. Kapasitas tersedia ${Math.floor(coords.length / REPEAT * 8)} bit; gunakan foto beresolusi lebih besar.` };
  }
  const original = Buffer.from(input);
  const output = Buffer.from(input);
  let ci = 0;
  for (const bit of bits) {
    for (let rep = 0; rep < REPEAT; rep++) {
      const [x0, y0] = coords[ci++];
      const block = readBlock(output, width, channels, x0, y0);
      const coeff = dct(block);
      const a = coeff[U1][V1], b = coeff[U2][V2];
      const diff = a - b;
      const target = bit ? GAP : -GAP;
      const adjust = (target - diff) / 2;
      coeff[U1][V1] = a + adjust;
      coeff[U2][V2] = b - adjust;
      const spatial = idct(coeff);
      writeBlock(output, width, channels, x0, y0, spatial, original);
    }
  }
  return { ok: true, data: output };
}
function detectWatermark(data, width, height, channels = 3) {
  const coords = blockCoordinates(width, height);
  const bytesNeeded = 6; // magic + length before knowing name length
  const bitsNeeded = bytesNeeded * 8;
  if (coords.length < bitsNeeded * REPEAT) return { found: false, message: 'Foto terlalu kecil untuk diverifikasi.' };
  function decodeBits(count, offset = 0) {
    const bits = [];
    for (let i = 0; i < count; i++) {
      let votes = 0;
      for (let rep = 0; rep < REPEAT; rep++) {
        const [x0, y0] = coords[offset + i * REPEAT + rep];
        const coeff = dct(readBlock(data, width, channels, x0, y0));
        if (coeff[U1][V1] - coeff[U2][V2] >= 0) votes++;
      }
      bits.push(votes > REPEAT / 2 ? 1 : 0);
    }
    return bits;
  }
  function bytesFromBits(bits) {
    const out = [];
    for (let i = 0; i + 7 < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
      out.push(byte);
    }
    return Buffer.from(out);
  }
  const header = bytesFromBits(decodeBits(bitsNeeded));
  if (!MAGIC.every((b, i) => header[i] === b)) {
    return { found: false, message: 'Watermark rapyakdamyas tidak terdeteksi pada foto ini.' };
  }
  const length = header.readUInt16BE(4);
  if (length < 1 || length > 80) return { found: false, message: 'Pola watermark ditemukan, tetapi datanya tidak terbaca utuh.' };
  const totalBits = (6 + length) * 8;
  if (coords.length < totalBits * REPEAT) return { found: false, message: 'Pola awal terdeteksi, tetapi foto tidak memiliki cukup data untuk membaca nama kreator.' };
  const payload = bytesFromBits(decodeBits(totalBits));
  const name = payload.subarray(6, 6 + length).toString('utf8');
  if (!name || name.includes('\uFFFD')) return { found: false, message: 'Pola watermark ditemukan, tetapi nama kreator tidak dapat dibaca.' };
  return { found: true, creator: name, message: 'Watermark rapyakdamyas terdeteksi.' };
}
module.exports = { embedWatermark, detectWatermark };
