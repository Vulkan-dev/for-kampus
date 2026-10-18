# Water Invoice Maker

Automated monthly water billing invoice generator for **The Mega Mall** and **Kampus Integrated Services**, designed with a modern matte-dark UI and direct 1-click A4 PDF printing.

---

## Features

- **Matte Dark Minimal UI**: Crafted with a distraction-free, non-technical dashboard (`#0c0d10` obsidian & slate styling with emerald and amber highlights).
- **Exact PDF Template Matching**: Renders official invoices with The Mega Mall & Kampus Integrated Services branding, 5-column table, Meezan Bank payment info, and Account Department signatures.
- **Accurate Calendar & Leap Year Calculation**: Automatically calculates the exact number of days per month (e.g. Feb 2024 has 29 days, Feb 2025 has 28 days) and formats full billing period dates (`1 Feb 2024 to 29 FEB 2024`) and issuance dates (`29th Feb 2024`).
- **Configurable Previous Balance**:
  - Switch on/off.
  - When OFF: Previous Balance is locked at `0`.
  - When ON: Supports initial opening balance and cumulative rollover.
- **Sequential Invoice Numbering**: Configurable prefix (`#INV-`), start number (`3001`), and suffix (`-051026`).
- **Yearly & Period Rate Configuration**: Configure different rates and monthly consumption for each year (2024, 2025, 2026, etc.) with specific month overrides.
- **1-Click Presets**: Pre-configured defaults for **Falaknaz Springs** and **Mega Residency**.
- **A4 Multi-Page Print & Export Engine**: Uses native `@media print` with exact A4 dimensions (`210mm x 297mm`) and clean page breaks for standard print or "Save as PDF".

---

## Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

---

## Deploying to Railway

This project is container-ready and pre-configured for Railway:

1. Push this repository to GitHub.
2. In Railway, click **New Project** &rarr; **Deploy from GitHub repo**.
3. Select this repository. Railway will automatically detect the `Dockerfile` or `package.json`.
4. Railway binds `PORT` automatically. Your app will be live with an HTTPS domain immediately!
