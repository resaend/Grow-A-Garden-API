const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Handle favicon
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: "Welcome to GAG API",
    status: "running",
    endpoints: [
      "GET /status - Server status",
      "GET /api/stock/GetStock - Stock data",
      "GET /api/stock/GetRareStock - Rare items in stock",
      "GET /api/item-info - Item information",
      "GET /api/GetWeather - Weather data",
      "GET /api/stock/restock-time - Restock timers",
      "GET /api/CalculatePrice - Price calculator"
    ],
    author: "res",
    github: "https://github.com/resaend",
    deployment: "Vercel Serverless",
    timestamp: new Date().toISOString()
  });
});

// Status endpoint
app.get('/status', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
    environment: 'production',
    platform: 'Vercel'
  });
});

// Load modules dari lib directory
const libDir = path.join(__dirname, '../lib');
if (fs.existsSync(libDir)) {
  try {
    const files = fs.readdirSync(libDir);
    files.forEach(file => {
      if (file.endsWith('.js')) {
        const funcPath = path.join(libDir, file);
        try {
          const funcModule = require(funcPath);
          if (typeof funcModule.register === 'function') {
            funcModule.register(app);
            console.log(`[Loader] Registered module: ${file}`);
          }
        } catch (error) {
          console.error(`[Loader] Error in ${file}: ${error.message}`);
        }
      }
    });
  } catch (error) {
    console.error('[Loader] Error reading lib directory:', error.message);
  }
}

// 404 handler - DIPERBAIKI UNTUK EXPRESS 5.x
// Menggunakan middleware tanpa path parameter untuk menghindari path-to-regexp error
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
    method: req.method,
    availableEndpoints: [
      'GET /',
      'GET /status',
      'GET /api/stock/GetStock',
      'GET /api/stock/GetRareStock',
      'GET /api/item-info',
      'GET /api/GetWeather',
      'GET /api/stock/restock-time',
      'GET /api/CalculatePrice'
    ],
    timestamp: new Date().toISOString()
  });
});

module.exports = app;
