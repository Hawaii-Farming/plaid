const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // Only proxy in development
  if (process.env.NODE_ENV === 'development') {
    app.use(
      '/api', 
      createProxyMiddleware({
        target: process.env.REACT_APP_API_HOST || 'http://127.0.0.1:8000',
        changeOrigin: true,
      })
    );
  }
};
