# Lite Office

A small, ad-free office app for viewing and editing **Word** and **Excel** files.
It runs in the browser, works offline, and can be installed on a phone or PC like a normal app.
The whole thing is about **2 MB** (WPS Office is 2–3 GB).

Your files never leave your device: there is no server, no account, no tracking and no ads.

## What it can do

**Documents (.docx, .txt, .html)**
- Open, edit and save Word files (`.docx`)
- Headings, bold / italic / underline / strikethrough, text colour, highlight, font size
- Alignment, indents, bullet and numbered lists (nested)
- Tables (including merged cells), pictures, links, page breaks
- Find & replace, word count
- Save as `.docx`, `.html`, `.txt`, or print / save as PDF

**Spreadsheets (.xlsx, .xls, .csv, .ods)**
- Open, edit and save Excel files with several sheets
- About 90 formulas: `SUM`, `AVERAGE`, `IF`, `IFERROR`, `VLOOKUP`, `XLOOKUP`, `INDEX`/`MATCH`,
  `SUMIF(S)`, `COUNTIF(S)`, `ROUND`, `TEXT`, `DATE`, `TODAY`, text functions and more
- References to other sheets (`=Sheet2!A1`), `$` absolute references, whole columns (`A:A`)
- Bold / italic / underline, text and fill colour, alignment, number formats (₹, $, %, dates)
- Insert / delete rows and columns (formulas adjust), sort, merge cells, AutoSum, resize columns
- Sum / average / count of the selected cells in the status bar
- Save as `.xlsx`, `.csv`, `.ods`, or print / save as PDF

**General**
- Recent files list; your work is auto-saved on the device while you edit
- Works with no internet after the first visit
- Dark mode follows your phone or PC setting

## Android app (APK)

Download [`android/LiteOffice.apk`](../android/LiteOffice.apk) on your phone and open it to install
(Android 5.0 or newer). The first time, Android asks you to allow installing apps from your browser or file manager.

The APK has no internet permission at all, so it cannot show ads or send your files anywhere.
Extra features in the APK:
- **Open with Lite Office** from your file manager, WhatsApp, Gmail, Drive, etc.
- **Save** lets you pick the folder and file name
- **Share** sends the file to any app
- **Print / Save as PDF** uses Android's printing

To rebuild it on Ubuntu/Debian: `sudo apt-get install aapt apksigner dalvik-exchange android-sdk-platform-23 zipalign default-jdk`,
then run `android/build.sh`. The signing key (`android/liteoffice.keystore`) is created on the first build and is not stored in git.
An APK signed with a different key can't install over the old one, so uninstall the old app first (your recent-files list resets).

## Using it in a phone browser instead

1. Open the app's web address in Chrome (see "Publishing" below).
2. Tap **Install** on the home screen of the app, or Chrome menu ⋮ → **Add to Home screen**.
3. It now opens like a normal app, works offline, and shows no ads.

Tips for spreadsheets on a phone: tap a cell to select it, tap it again to type in it.
You can also type in the **fx** bar at the top. While typing a formula, tap other cells to insert their address.

## Publishing (free, with GitHub Pages)

This repository includes a workflow (`.github/workflows/pages.yml`) that publishes the `office/` folder.

1. Merge this branch into `main`.
2. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The app will be at `https://<your-username>.github.io/<repo-name>/`.

To run it on a computer without publishing: `cd office && python3 -m http.server 8000`, then open http://localhost:8000.

## Limits

- Old binary `.doc` files and PowerPoint files are not supported (save `.doc` as `.docx` first).
- Very complex Word layouts (text boxes, columns, headers/footers, footnotes, tracked changes)
  are simplified when opened. The text is kept, but some of that layout is lost on save.
- Charts, pivot tables, macros, conditional formatting and cell borders in Excel files are not kept on save.
- The spreadsheet reader (SheetJS 0.18.5, the last version published on npm) has known issues with
  deliberately malicious spreadsheet files. Only open spreadsheets from sources you trust.

## How it is built

Plain HTML, CSS and JavaScript, no build step.

| File | Purpose |
| --- | --- |
| `index.html`, `css/app.css` | Layout and styling |
| `js/app.js` | Home screen, recent files, opening files, install/offline |
| `js/doc-editor.js` | Document editor |
| `js/docx-reader.js` / `js/docx-writer.js` | `.docx` → editable page, and back to `.docx` |
| `js/sheet-editor.js` | Spreadsheet grid, editing, formatting, sheets |
| `js/formula.js` | Formula engine |
| `js/xlsx-io.js` | Reading spreadsheet files and writing `.xlsx` (with formatting) |
| `sw.js`, `manifest.webmanifest` | Offline support and app install |
| `vendor/` | [SheetJS](https://sheetjs.com) (Apache 2.0), [JSZip](https://stuk.github.io/jszip/) (MIT), [mammoth](https://github.com/mwilliamson/mammoth.js) (BSD) |
