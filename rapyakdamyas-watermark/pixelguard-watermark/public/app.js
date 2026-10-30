const $ = (id) => document.getElementById(id);
const creatorInput = $('creator');
const imageInput = $('image-input');
const dropzone = $('dropzone');
const selectedFile = $('selected-file');
const formError = $('form-error');
const watermarkBtn = $('watermark-btn');
const preview = $('preview-image');
const emptyPreview = $('empty-preview');
const previewTag = $('preview-tag');
const resultBox = $('result-box');
let currentFile = null;
let previewUrl = null;
let outputUrl = null;

creatorInput.addEventListener('input', () => $('char-count').textContent = `${creatorInput.value.length}/80`);
dropzone.addEventListener('click', () => imageInput.click());
dropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); imageInput.click(); } });
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragging'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragging'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault(); dropzone.classList.remove('dragging');
  if (e.dataTransfer.files.length) setFile(e.dataTransfer.files[0]);
});
imageInput.addEventListener('change', () => { if (imageInput.files.length) setFile(imageInput.files[0]); });
$('remove-file').addEventListener('click', clearFile);

function humanSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
function setFile(file) {
  hideError();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return showError('Format belum didukung. Pilih JPG, PNG, atau WEBP.');
  if (file.size > 15 * 1024 * 1024) return showError('Ukuran foto maksimal 15 MB.');
  currentFile = file;
  $('file-name').textContent = file.name;
  $('file-meta').textContent = humanSize(file.size);
  selectedFile.hidden = false;
  dropzone.hidden = true;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  preview.src = previewUrl;
  preview.hidden = false;
  emptyPreview.hidden = true;
  $('image-overlay').hidden = true;
  previewTag.textContent = 'FOTO DIPILIH';
  $('detail-format').textContent = file.type.split('/')[1].toUpperCase().replace('JPEG', 'JPG');
  $('detail-size').textContent = humanSize(file.size);
  const img = new Image();
  img.onload = () => $('detail-dimensions').textContent = `${img.naturalWidth} × ${img.naturalHeight}`;
  img.src = previewUrl;
  clearResult();
}
function clearFile() {
  currentFile = null;
  imageInput.value = '';
  selectedFile.hidden = true;
  dropzone.hidden = false;
  preview.hidden = true;
  emptyPreview.hidden = false;
  $('image-overlay').hidden = true;
  previewTag.textContent = 'MENUNGGU FOTO';
  $('detail-format').textContent = '—'; $('detail-dimensions').textContent = '—'; $('detail-size').textContent = '—';
  clearResult(); hideError();
}
function showError(message) { formError.textContent = message; formError.hidden = false; }
function hideError() { formError.hidden = true; }
function clearResult() {
  resultBox.hidden = true;
  if (outputUrl) URL.revokeObjectURL(outputUrl);
  outputUrl = null;
}
function setBusy(busy) {
  watermarkBtn.disabled = busy;
  $('processing').hidden = !busy;
  watermarkBtn.innerHTML = busy ? '<span>✧</span> Memproses gambar…' : '<span>✧</span> Sisipkan watermark <span class="button-arrow">↗</span>';
}
watermarkBtn.addEventListener('click', async () => {
  hideError();
  const creator = creatorInput.value.trim();
  if (!creator) { creatorInput.focus(); return showError('Masukkan nama kreator terlebih dahulu.'); }
  if (!currentFile) return showError('Pilih foto yang ingin diberi watermark.');
  const form = new FormData();
  form.append('creator', creator); form.append('image', currentFile);
  setBusy(true);
  try {
    const response = await fetch('/api/watermark', { method: 'POST', body: form });
    if (!response.ok) {
      let message = 'Foto gagal diproses.';
      try { message = (await response.json()).error || message; } catch {}
      throw new Error(message);
    }
    const blob = await response.blob();
    clearResult();
    outputUrl = URL.createObjectURL(blob);
    $('download-link').href = outputUrl;
    resultBox.hidden = false;
    $('result-title').textContent = 'Watermark berhasil disisipkan';
    $('result-message').textContent = `Identitas “${creator}” telah disisipkan ke gambar.`;
    preview.src = outputUrl;
    previewTag.textContent = 'WATERMARK AKTIF';
    $('image-overlay').hidden = false;
  } catch (error) { showError(error.message || 'Terjadi kesalahan saat memproses gambar.'); }
  finally { setBusy(false); }
});

$('verify-btn').addEventListener('click', () => $('verify-input').click());
$('verify-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const out = $('verify-result');
  out.hidden = false; out.className = 'verify-result'; out.textContent = 'Sedang memeriksa sinyal watermark…';
  const button = $('verify-btn'); button.disabled = true;
  try {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Pilih file JPG, PNG, atau WEBP.');
    if (file.size > 15 * 1024 * 1024) throw new Error('Ukuran foto maksimal 15 MB.');
    const form = new FormData(); form.append('image', file);
    const response = await fetch('/api/verify', { method: 'POST', body: form });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Foto gagal diperiksa.');
    out.className = `verify-result ${data.found ? 'success' : 'error'}`;
    out.textContent = data.found ? `✓ ${data.message} Kreator: ${data.creator}` : `ⓘ ${data.message} Ini bukan bukti bahwa foto tidak pernah memiliki watermark.`;
  } catch (error) { out.className = 'verify-result error'; out.textContent = error.message; }
  finally { button.disabled = false; e.target.value = ''; }
});
