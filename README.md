# Multi-Page PDF Creator

A Chrome extension that creates PDFs from webpages and their linked pages.

## Features

- **Single page PDF** - Right-click context menu to create PDF from current page
- **Multi-page PDF** - Select links from the current page to include in a single PDF
- **Smart link grouping** - Links are grouped by their DOM context (headings, sections, nav elements)
- **Full page capture** - Scrolls and captures entire page content, not just visible viewport
- **Configurable output** - Choose page size (A4, Letter, Legal) and orientation

## Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
4. Load in Chrome:
   - Navigate to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist/` folder

## Usage

### Create PDF from current page
Right-click anywhere on a webpage and select "Create PDF from this page"

### Create PDF with linked pages
1. Click the extension icon in the toolbar
2. Select which links to include (use filters, select all, or select same-domain)
3. Configure page size and orientation
4. Click "Create PDF"

## Development

```bash
npm run dev    # Build with watch mode
npm run build  # Production build
```

## Tech Stack

- Chrome Extension Manifest V3
- jsPDF for PDF generation
- Webpack for bundling
