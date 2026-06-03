const fs = require('fs');
const path = require('path');
const { MIME_TYPES } = require('./config');
const { safePathJoin, getNewestFile } = require('./file-utils');
const { Logger } = require('./logger');

const logger = new Logger('http-handler');

const WAITING_PAGE = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Brainstorm Companion</title>
<style>body { font-family: system-ui, sans-serif; padding: 2rem; max-width: 800px; margin: 0 auto; }
h1 { color: #333; } p { color: #666; }</style>
</head>
<body><h1>Brainstorm Companion</h1>
<p>Waiting for the agent to push a screen...</p></body></html>`;

function isFullDocument(html) {
  const trimmed = html.trimStart().toLowerCase();
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html');
}

function wrapInFrame(content, frameTemplate) {
  return frameTemplate.replace('<!-- CONTENT -->', content);
}

function createRequestHandler(contentDir, frameTemplate, helperScript, onActivity) {
  const helperInjection = '<script>\n' + helperScript + '\n</script>';

  return function handleRequest(req, res) {
    if (onActivity) onActivity();

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    if (req.method === 'GET' && req.url === '/') {
      try {
        const screenFile = getNewestFile(contentDir, '.html');
        let html = screenFile
          ? (raw => isFullDocument(raw) ? raw : wrapInFrame(raw, frameTemplate))(fs.readFileSync(screenFile, 'utf-8'))
          : WAITING_PAGE;

        if (html.includes('</body>')) {
          html = html.replace('</body>', helperInjection + '\n</body>');
        } else {
          html += helperInjection;
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        logger.debug('Served main page', { hasScreen: !!screenFile });
      } catch (e) {
        logger.error('Error serving main page', { error: e.message });
        res.writeHead(500);
        res.end('Internal server error');
      }
    } else if (req.method === 'GET' && req.url.startsWith('/files/')) {
      const fileName = req.url.slice(7);
      try {
        const filePath = safePathJoin(contentDir, fileName);
        if (!fs.existsSync(filePath)) {
          logger.debug('File not found', { path: filePath });
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          res.writeHead(400);
          res.end('Bad request: not a file');
          return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 
          'Content-Type': contentType,
          'Content-Length': stat.size
        });
        res.end(fs.readFileSync(filePath));
        logger.debug('Served file', { path: filePath });
      } catch (e) {
        logger.error('Error serving file', { error: e.message, path: fileName });
        res.writeHead(400);
        res.end('Bad request: ' + e.message);
      }
    } else {
      logger.debug('Route not found', { method: req.method, url: req.url });
      res.writeHead(404);
      res.end('Not found');
    }
  };
}

module.exports = { createRequestHandler };