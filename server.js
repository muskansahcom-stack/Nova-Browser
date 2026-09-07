/**
 * Web Server & Reverse Proxy for Nova Browser Web Edition
 * Allows running Nova Browser directly in standard web browsers (Chrome, Safari, Firefox, Edge)
 * Features an intelligent proxy that unstrips X-Frame-Options and CSP for live interactive web browsing.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const zlib = require('zlib');
const dotenv = require('dotenv');

// Load environment variables
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const PORT = process.env.PORT || 3000;
const RENDERER_DIR = path.join(__dirname, 'src/renderer');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // 1. PROXY ENDPOINT
  if (pathname === '/proxy') {
    const targetUrl = parsedUrl.query.url;
    if (!targetUrl) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      return res.end('Missing "url" query parameter');
    }

    let parsedTarget;
    try {
      parsedTarget = new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`);
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      return res.end('Invalid URL');
    }

    const client = parsedTarget.protocol === 'https:' ? https : http;
    const requestOptions = {
      protocol: parsedTarget.protocol,
      hostname: parsedTarget.hostname,
      port: parsedTarget.port || (parsedTarget.protocol === 'https:' ? 443 : 80),
      path: parsedTarget.pathname + parsedTarget.search,
      method: req.method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': req.headers['accept'] || '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
        'Referer': parsedTarget.origin
      }
    };

    const proxyReq = client.request(requestOptions, (proxyRes) => {
      // Handle redirects
      if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
        let redirectUrl = proxyRes.headers.location;
        if (redirectUrl.startsWith('/')) {
          redirectUrl = parsedTarget.origin + redirectUrl;
        }
        res.writeHead(302, { 'Location': `/proxy?url=${encodeURIComponent(redirectUrl)}` });
        return res.end();
      }

      // Clone and sanitize headers
      const responseHeaders = { ...proxyRes.headers };
      delete responseHeaders['x-frame-options'];
      delete responseHeaders['content-security-policy'];
      delete responseHeaders['content-security-policy-report-only'];
      delete responseHeaders['frame-options'];

      responseHeaders['access-control-allow-origin'] = '*';
      responseHeaders['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
      responseHeaders['access-control-allow-headers'] = '*';

      const contentType = responseHeaders['content-type'] || '';
      const encoding = responseHeaders['content-encoding'];

      // If HTML, decompress, inject link interception script and rewrite relative links
      if (contentType.includes('text/html')) {
        let stream = proxyRes;
        if (encoding === 'gzip') stream = proxyRes.pipe(zlib.createGunzip());
        else if (encoding === 'deflate') stream = proxyRes.pipe(zlib.createInflate());

        let bodyChunks = [];
        stream.on('data', chunk => bodyChunks.push(chunk));
        stream.on('end', () => {
          let html = Buffer.concat(bodyChunks).toString('utf-8');

          // Inject base href and frame message bridge
          const baseTag = `<base href="${parsedTarget.origin}/">`;
          const injectedScript = `
          <script>
            (function() {
              // Notify parent of navigation
              try {
                window.parent.postMessage({ type: 'nova_iframe_navigated', url: window.location.href, title: document.title }, '*');
              } catch(e) {}

              // Intercept internal links to route through proxy
              document.addEventListener('click', function(e) {
                const a = e.target.closest('a');
                if (a && a.href && !a.href.startsWith('javascript:')) {
                  if (a.href.startsWith('http')) {
                    e.preventDefault();
                    window.location.href = '/proxy?url=' + encodeURIComponent(a.href);
                  }
                }
              }, true);
            })();
          </script>
          `;

          if (html.includes('<head>')) {
            html = html.replace('<head>', `<head>${baseTag}${injectedScript}`);
          } else {
            html = baseTag + injectedScript + html;
          }

          delete responseHeaders['content-encoding'];
          delete responseHeaders['content-length'];
          responseHeaders['content-type'] = 'text/html; charset=utf-8';

          res.writeHead(proxyRes.statusCode, responseHeaders);
          res.end(html);
        });

        stream.on('error', (err) => {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Proxy Stream Error: ' + err.message);
        });

        return;
      }

      // Non-HTML content, pipe directly
      res.writeHead(proxyRes.statusCode, responseHeaders);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Proxy Connection Error: ' + err.message);
    });

    req.pipe(proxyReq);
    return;
  }

  // 2. STATIC FILES SERVING
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '') safePath = '/index.html';

  const filePath = path.join(RENDERER_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\x1b[36m==================================================\x1b[0m`);
  console.log(`\x1b[1m\x1b[32m✦ Nova Browser Web Edition is running!\x1b[0m`);
  console.log(`\x1b[34m➜ Local URL: \x1b[1m\x1b[37mhttp://localhost:${PORT}\x1b[0m`);
  console.log(`\x1b[36m==================================================\x1b[0m`);
});
