const { createProxyMiddleware } = require('http-proxy-middleware');
const os = require('os');

// Get the network IP address
function getNetworkIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (localhost) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const networkIP = getNetworkIP();
const apiPort = process.env.API_PROXY_PORT || '5001';
const apiTarget = `http://${networkIP}:${apiPort}`;

console.log('🌐 Proxy target:', apiTarget);

module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: apiTarget,
      changeOrigin: true,
      logLevel: 'debug',
      onError: (err, req, res) => {
        console.error('Proxy Error:', err);
        res.writeHead(500, {
          'Content-Type': 'application/json',
        });
        res.end(JSON.stringify({ error: 'Proxy error', details: err.message }));
      },
    })
  );
};
