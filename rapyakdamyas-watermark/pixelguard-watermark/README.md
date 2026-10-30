# rapyakdamyas — Invisible Creator Watermark

A responsive Node.js + Express project for embedding a creator name into an image and checking for a rapyakdamyas watermark.

## Requirements
- Node.js 18 or newer
- npm

## Run locally
1. Extract the ZIP.
2. Open a terminal in the project folder.
3. Run `npm install`
4. Run `npm start`
5. Open http://localhost:3000

## Features
- Upload JPG, PNG, or WEBP (up to 15 MB)
- Add a creator name as an invisible frequency-domain watermark
- Download the watermarked image as PNG
- Verify a watermark from an uploaded image
- Responsive Indonesian UI

## Notes about robustness
The demo embeds a repeated payload by modifying a pair of mid-frequency 8×8 block-DCT coefficients. It is designed to be visually subtle and can survive some mild image transformations, but no watermark is guaranteed to survive every JPEG quality setting, resize, crop, screenshot, or editing workflow. For production use, add stronger error correction, cryptographic signing, and a broader test suite. A "not detected" result does not prove an image never had a watermark.

## API
- `POST /api/watermark` — multipart fields `image`, `creator`
- `POST /api/verify` — multipart field `image`
