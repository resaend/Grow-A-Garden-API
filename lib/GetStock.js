const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "../data/Database.json");

// Global variables untuk menyimpan data stock dan WebSocket connection
let stockDataCache = null;
let wsConnection = null;
let reconnectInterval = null;

// Load database untuk mendapatkan rarity info
function loadDatabase() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const dataStr = fs.readFileSync(DATA_FILE, "utf-8");
      const data = JSON.parse(dataStr);
      return data.items || [];
    }
    return [];
  } catch (err) {
    return [];
  }
}

// Buat lookup map untuk rarity berdasarkan nama item
function createItemLookup() {
  const items = loadDatabase();
  const itemLookup = {};
  
  items.forEach(item => {
    itemLookup[item.name] = {
      rarity: item.rarity ? item.rarity.toLowerCase() : 'unknown'
    };
  });
  
  return itemLookup;
}

// Format data dari WebSocket ke format yang diinginkan
function formatStockData(wsData, itemLookup) {
  const formatCategory = (categoryData) => {
    if (!Array.isArray(categoryData)) return [];
    return categoryData.map(item => ({
      name: item.display_name || item.name,
      stock: (item.quantity || item.stock || 0).toString(),
      rarity: itemLookup[item.display_name || item.name]?.rarity || 'unknown'
    }));
  };

  return {
    Data: {
      updatedAt: Date.now(),
      gear: formatCategory(wsData.gear_stock || []),
      seeds: formatCategory(wsData.seed_stock || []),
      egg: formatCategory(wsData.egg_stock || []),
      honey: formatCategory(wsData.eventshop_stock || []),
      cosmetics: formatCategory(wsData.cosmetic_stock || [])
    }
  };
}

// Inisialisasi WebSocket connection
function initializeWebSocket() {
  const wsUrl = "wss://websocket.joshlei.com/growagarden?user_id=594321645280428052";
  
  wsConnection = new WebSocket(wsUrl);
  
  wsConnection.on('open', () => {
    // Clear reconnect interval jika ada
    if (reconnectInterval) {
      clearInterval(reconnectInterval);
      reconnectInterval = null;
    }
  });
  
  wsConnection.on('message', (data) => {
    try {
      const parsedData = JSON.parse(data.toString());
      
      // Update cache dengan data terbaru
      const itemLookup = createItemLookup();
      stockDataCache = formatStockData(parsedData, itemLookup);
      
    } catch (err) {
      // Silent error handling
    }
  });
  
  wsConnection.on('error', (error) => {
    // Silent error handling
  });
  
  wsConnection.on('close', (code, reason) => {
    // Auto-reconnect setelah 5 detik
    if (!reconnectInterval) {
      reconnectInterval = setTimeout(() => {
        initializeWebSocket();
      }, 5000);
    }
  });
}

// Fungsi untuk mendapatkan stock data dari cache
function getStockFromCache() {
  return new Promise((resolve, reject) => {
    if (stockDataCache) {
      resolve(stockDataCache);
    } else {
      reject(new Error("No stock data available. WebSocket may not be connected."));
    }
  });
}

// Express module registration
function register(app) {
  // Inisialisasi WebSocket saat server dimulai
  initializeWebSocket();
  
  app.get("/api/stock/GetStock", async (req, res) => {
    try {
      const stockData = await getStockFromCache();
      res.json(stockData);
      
    } catch (err) {
      // Jika WebSocket tidak terhubung, coba reconnect
      if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
        initializeWebSocket();
      }
      
      res.status(500).json({ 
        error: err.message || "Failed to get stock data",
        status: "WebSocket connection may be unavailable"
      });
    }
  });
  
  // Endpoint untuk status WebSocket
  app.get("/api/stock/status", (req, res) => {
    const status = {
      websocket_connected: wsConnection && wsConnection.readyState === WebSocket.OPEN,
      last_update: stockDataCache ? stockDataCache.Data.updatedAt : null,
      cache_available: !!stockDataCache,
      connection_state: wsConnection ? wsConnection.readyState : 'Not initialized'
    };
    
    res.json(status);
  });
}

// Cleanup function untuk menutup WebSocket saat aplikasi ditutup
function cleanup() {
  if (wsConnection) {
    wsConnection.close();
  }
  if (reconnectInterval) {
    clearTimeout(reconnectInterval);
  }
}

// Handle process termination
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

module.exports = { register, cleanup, initializeWebSocket, getStockFromCache };
