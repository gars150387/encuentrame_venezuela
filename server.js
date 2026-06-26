const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const {
  loadReports,
  saveReports,
  addReport,
  updateReportStatus,
  voteOnReport,
  listReports,
  defaultReports,
} = require('./reportStore');

const PORT = Number(process.env.PORT || 3000);
const rootDir = __dirname;
const adminToken = process.env.ADMIN_TOKEN || '';

let reports = loadReports();
if (!Array.isArray(reports) || !reports.length) {
  reports = defaultReports();
  saveReports(reports);
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const typeMap = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
  };

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    'Content-Type': typeMap[ext] || 'application/octet-stream',
    'Content-Length': body.length,
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) {
        reject(new Error('payload_too_large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('invalid_json'));
      }
    });
    req.on('error', reject);
  });
}

function healthPayload() {
  return {
    ok: true,
    status: 'ready',
    count: reports.length,
    updatedAt: new Date().toISOString(),
  };
}

function isAuthorizedAdmin(req) {
  if (!adminToken) return false;
  const headerToken = req.headers['x-admin-token'];
  const bearerToken = (req.headers.authorization || '').startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
  return headerToken === adminToken || bearerToken === adminToken;
}

function handleApi(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/health') {
    return sendJson(res, 200, healthPayload());
  }

  if (req.method === 'GET' && pathname === '/api/reports') {
    return sendJson(res, 200, listReports(reports, Object.fromEntries(new URL(req.url, `http://${req.headers.host}`).searchParams.entries())));
  }

  if (req.method === 'GET' && pathname === '/api/reports/export') {
    return sendJson(res, 200, { items: reports });
  }

  if (req.method === 'GET' && pathname.startsWith('/api/reports/')) {
    const id = pathname.split('/').pop();
    const report = reports.find((entry) => entry.id === id);
    if (!report) return sendJson(res, 404, { error: 'not_found' });
    return sendJson(res, 200, report);
  }

  if (req.method === 'POST' && pathname === '/api/reports') {
    return parseBody(req)
      .then((body) => {
        const result = addReport(reports, body, { allowDuplicate: Boolean(body.allowDuplicate) });
        if (!result.ok) {
          return sendJson(res, result.status, { error: result.error || 'validation_error', errors: result.errors || [], duplicate: Boolean(result.duplicate) });
        }

        reports = result.reports;
        saveReports(reports);
        return sendJson(res, 201, result.report);
      })
      .catch((error) => {
        const status = error.message === 'payload_too_large' ? 413 : 400;
        return sendJson(res, status, { error: error.message });
      });
  }

  if (req.method === 'PATCH' && pathname.startsWith('/api/reports/')) {
    const id = pathname.split('/')[3];
    return parseBody(req)
      .then((body) => {
        const result = updateReportStatus(reports, id, body.status);
        if (!result.ok) {
          return sendJson(res, result.status, { error: result.error });
        }

        reports = result.reports;
        saveReports(reports);
        return sendJson(res, 200, result.report);
      })
      .catch((error) => sendJson(res, 400, { error: error.message }));
  }

  if (req.method === 'POST' && pathname.startsWith('/api/reports/') && pathname.endsWith('/vote')) {
    const id = pathname.split('/')[3];
    return parseBody(req)
      .then((body) => {
        const clientId = String(body.clientId || req.headers['x-client-id'] || '').trim();
        const result = voteOnReport(reports, id, body.vote, clientId);
        if (!result.ok) {
          return sendJson(res, result.status, { error: result.error });
        }

        reports = result.reports;
        saveReports(reports);
        return sendJson(res, 200, result.report);
      })
      .catch((error) => sendJson(res, 400, { error: error.message }));
  }

  if (req.method === 'POST' && pathname === '/api/admin/reset') {
    if (!isAuthorizedAdmin(req)) {
      return sendJson(res, 403, { error: 'forbidden' });
    }

    reports = defaultReports();
    saveReports(reports);
    return sendJson(res, 200, reports);
  }

  return sendJson(res, 404, { error: 'not_found' });
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = requestUrl;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    });
    res.end();
    return;
  }

  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname);
    return;
  }

  if (pathname === '/' || pathname === '/index.html') {
    sendFile(res, path.join(rootDir, 'index.html'));
    return;
  }

  if (pathname === '/app.js' || pathname === '/styles.css') {
    sendFile(res, path.join(rootDir, pathname.slice(1)));
    return;
  }

  sendJson(res, 404, { error: 'not_found' });
});

server.listen(PORT, () => {
  process.stdout.write(`Encuentrame running on http://localhost:${PORT}\n`);
});
