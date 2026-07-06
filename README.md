# PaperFlow PDF Toolkit
Merge, split, compress, convert, edit, sign, and organize PDFs in seconds with Folio PDF Toolkit. Fast, secure, and free.

# PaperFlow PDF Toolkit: Merge-Compress-Convert-Edit-Sign-PDFs-Free

This project is a browser-based PDF toolkit built with HTML, CSS, and JavaScript.

## Files
- `index.html` — main app shell and markup
- `style.css` — app styling and layout
- `script.js` — app logic for merge, split, and compress tools

## How to run
1. Put all four files in the same folder.
2. Open `index.html` in a browser.
3. Make sure you are online so the CDN libraries load:
   - `pdf-lib`
   - `pdf.js`
   - `jszip`

## Notes
- All processing runs locally in the browser.
- No build step is required.
- The split tool supports page ranges like `1-3, 5` plus `odd` and `even`.

## Troubleshooting
- If the app does not render correctly, refresh the page.
- If PDF files fail to open, use a supported browser like Chrome or Edge.

## Additional info
The original `bindery_2.html` file has been split into separate files for easier editing and maintenance.
