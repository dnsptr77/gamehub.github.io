#!/usr/bin/env node
/**
 * server.js — server lokal opsional untuk "Akun WS+TLS".
 *
 * Fitur:
 *   1. Menyajikan file statis (index.html, style.css, app.js, dll).
 *   2. Endpoint /api/sub?url=... → mengambil subscription dari sisi server,
 *      sehingga bebas masalah CORS (berguna saat dijalankan di komputer sendiri).
 *
 * Jalankan:  node server.js   (lalu buka http://localhost:8080)
 * Butuh Node.js >= 18 (agar fetch() bawaan tersedia).
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

function send(res, code, body, type) {
  res.writeHead(code, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) return send(res, 403, 'Forbidden');

  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, '404 Not Found');
    const ext = path.extname(file).toLowerCase();
    send(res, 200, data, MIME[ext] || 'application/octet-stream');
  });
}

async function proxySub(req, res, target) {
  try {
    const r = await fetch(target, {
      headers: { 'User-Agent': 'v2rayNG/1.8.23' },
      redirect: 'follow'
    });
    if (!r.ok) return send(res, 502, 'Upstream HTTP ' + r.status);
    const text = await r.text();
    send(res, 200, text, 'text/plain; charset=utf-8');
  } catch (e) {
    send(res, 502, 'Proxy gagal: ' + (e && e.message));
  }
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/api/sub') {
    const target = u.searchParams.get('url');
    if (!target || !/^https?:\/\//i.test(target)) {
      return send(res, 400, 'Parameter ?url= https://... wajib diisi');
    }
    return proxySub(req, res, target);
  }
  serveStatic(req, res, u.pathname);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('✅ Akun WS+TLS berjalan di http://localhost:' + PORT);
  console.log('   (endpoint proxy: /api/sub?url=<link subscription>)');
});
