const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const { embedWatermark, detectWatermark } = require('./watermark');

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    cb(allowed.includes(file.mimetype) ? null : new Error('Format file harus JPG, PNG, atau WEBP.'), allowed.includes(file.mimetype));
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'rapyakdamyas' }));

app.post('/api/watermark', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Pilih foto terlebih dahulu.' });
    const creator = String(req.body.creator || '').trim();
    if (!creator) return res.status(400).json({ error: 'Masukkan nama kreator.' });
    if (creator.length > 80) return res.status(400).json({ error: 'Nama kreator maksimal 80 karakter.' });

    const input = sharp(req.file.buffer, { failOn: 'none' }).rotate();
    const meta = await input.metadata();
    if (!meta.width || !meta.height) return res.status(400).json({ error: 'Foto tidak dapat dibaca.' });
    if (meta.width < 64 || meta.height < 64) return res.status(400).json({ error: 'Resolusi foto terlalu kecil. Gunakan foto minimal 64 × 64 piksel.' });

    const { data, info } = await input.removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    const result = embedWatermark(data, info.width, info.height, creator, info.channels);
    if (!result.ok) return res.status(400).json({ error: result.error });

    const png = await sharp(result.data, {
      raw: { width: info.width, height: info.height, channels: info.channels }
    }).png().toBuffer();

    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', `attachment; filename="rapyakdamyas-watermarked.png"`);
    res.set('X-rapyakdamyas-Creator', encodeURIComponent(creator));
    res.send(png);
  } catch (err) { next(err); }
});

app.post('/api/verify', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Pilih foto yang ingin diperiksa.' });
    const { data, info } = await sharp(req.file.buffer, { failOn: 'none' })
      .rotate().removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    const result = detectWatermark(data, info.width, info.height, info.channels);
    res.json(result);
  } catch (err) { next(err); }
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Ukuran file maksimal 15 MB.' });
  }
  res.status(400).json({ error: err.message || 'Terjadi kesalahan saat memproses gambar.' });
});

app.listen(PORT, () => console.log(`rapyakdamyas berjalan di http://localhost:${PORT}`));
