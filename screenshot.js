const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const SITE_DIR = path.resolve(__dirname, '_site');
const OUTPUT = path.resolve(SITE_DIR, 'images', 'og-preview.png');
const PORT = 8787;

// Simple static file server
function startServer() {
    const mimeTypes = {
        '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
        '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
    };
    const server = http.createServer((req, res) => {
        const parsed = url.parse(req.url);
        let filePath = path.join(SITE_DIR, parsed.pathname === '/' ? 'index.html' : parsed.pathname);
        const ext = path.extname(filePath);
        fs.readFile(filePath, (err, data) => {
            if (err) { res.writeHead(404); res.end(); return; }
            res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
            res.end(data);
        });
    });
    return new Promise(resolve => server.listen(PORT, () => resolve(server)));
}

(async () => {
    const server = await startServer();
    console.log(`Serving _site on port ${PORT}`);

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });

    // Don't wait for all network requests (avatar tinting loads thousands of images)
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for the solo leaderboard table to render
    await page.waitForSelector('#solo-table-container table', { timeout: 30000 });
    console.log('Table rendered');

    // Small delay to let fonts and styles settle
    await new Promise(r => setTimeout(r, 1000));

    // Hide search bar, nav, and rows beyond top 10 for a clean preview
    await page.evaluate(() => {
        document.querySelectorAll('.search-bar, .nav').forEach(el => el.style.display = 'none');
        const rows = document.querySelectorAll('#solo-table-container tbody tr');
        rows.forEach((row, i) => { if (i >= 10) row.style.display = 'none'; });
    });

    // Screenshot just the solo leaderboard section (now clipped to top 10)
    const section = await page.$('#solo-leaderboard');
    await section.screenshot({ path: OUTPUT, type: 'png' });

    console.log(`Screenshot saved to ${OUTPUT}`);
    await browser.close();
    server.close();
})();
