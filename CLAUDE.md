# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm run build    # Production build (outputs to dist/)
npm run dev      # Development build with watch mode
```

After building, load the `dist/` folder as an unpacked extension in Chrome (chrome://extensions → Developer mode → Load unpacked).

## Architecture

This is a Chrome Extension (Manifest V3) that creates PDFs from webpages and their linked pages using jsPDF and html2canvas.

### Component Communication Flow

```
Popup (UI) → Service Worker (orchestration) → Content Script (DOM access)
                    ↓
            Offscreen Document (PDF generation with jsPDF)
```

### Key Files

- **src/background/service-worker.js** - Central message handler that orchestrates all operations: link extraction, page capture (with scroll-and-capture for full pages), and PDF creation. Manages Chrome API calls (tabs, scripting, downloads, offscreen).

- **src/popup/popup.js** - UI for selecting links to include in PDF. Groups links by DOM context (headings, sections, nav elements). Handles user selections and triggers capture/PDF flow.

- **src/content/content-script.js** - Injected into pages to extract links grouped by their DOM parent context (headings, semantic elements).

- **src/offscreen/offscreen.js** - Runs in an offscreen document context (required by MV3) to use jsPDF for PDF generation. Receives captured screenshots and assembles them into a multi-page PDF.

### Chrome API Usage

- `chrome.tabs.captureVisibleTab` - Screenshot capture (rate limited ~2/sec, handled with retries)
- `chrome.offscreen` - Required for jsPDF in MV3 (no DOM in service workers)
- `chrome.scripting.executeScript` - Inject functions for link extraction and scroll control
- `chrome.downloads.download` - Save generated PDFs

### Build Output

Webpack bundles each entry point separately and copies static assets to `dist/`. The manifest references bundled files without `src/` paths.
