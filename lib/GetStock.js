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
      console.log(`[GetStock] 📚 Database loaded: ${data.items?.length || 0} items`);
      return data.items || [];
    }
    console.log("[GetStock] ⚠️  Database file not found");
    return [];
  } catch (err) {
    console.error("[GetStock] ❌ Error loading database:", err.message);
    return [];
  }
}

// Fungsi normalisasi untuk mencocokkan nama item
function normalizeItemName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Buat lookup map untuk rarity berdasarkan display_name sebagai key utama
function createItemLookup() {
  const items = loadDatabase();
  const itemLookup = {};
  
  items.forEach(item => {
    const rarity = item.rarity ? item.rarity.toLowerCase() : 'unknown';
    
    // Lookup berdasarkan display_name (key utama)
    if (item.display_name) {
      itemLookup[item.display_name] = { rarity };
    }
    
    // Lookup berdasarkan normalized display_name
    if (item.display_name) {
      itemLookup[normalizeItemName(item.display_name)] = { rarity };
    }
    
    // Backup lookup berdasarkan item_id jika diperlukan
    if (item.item_id) {
      itemLookup[item.item_id] = { rarity };
    }
    
    // Backup lookup berdasarkan normalized item_id
    if (item.item_id) {
      itemLookup[normalizeItemName(item.item_id)] = { rarity };
    }
  });
  
  console.log(`[GetStock] 🔍 Item lookup created: ${Object.keys(itemLookup).length} entries`);
  return itemLookup;
}

// Format data dari WebSocket ke format yang diinginkan
function formatStockData(wsData, itemLookup) {
  const formatCategory = (categoryData) => {
    if (!Array.isArray(categoryData)) return [];
    return categoryData.map(item => {
      // Prioritas lookup: display_name -> normalized display_name -> item_id -> normalized item_id
      const rarityFromDisplayName = itemLookup[item.display_name]?.rarity;
      const rarityFromNormalizedDisplayName = itemLookup[normalizeItemName(item.display_name || '')]?.rarity;
      const rarityFromItemId = itemLookup[item.item_id]?.rarity;
      const rarityFromNormalizedItemId = itemLookup[normalizeItemName(item.item_id || '')]?.rarity;
      
      const finalRarity = rarityFromDisplayName || rarityFromNormalizedDisplayName || rarityFromItemId || rarityFromNormalizedItemId || 'unknown';
      
      return {
        name: item.display_name || item.name,
        stock: (item.quantity || item.stock || 0).toString(),
        rarity: finalRarity
      };
    });
  };

  const formattedData = {
    Data: {
      updatedAt: Date.now(),
      gear: formatCategory(wsData.gear_stock || []),
      seeds: formatCategory(wsData.seed_stock || []),
      egg: formatCategory(wsData.egg_stock || []),
      honey: formatCategory(wsData.eventshop_stock || []),
      cosmetics: formatCategory(wsData.cosmetic_stock || [])
    }
  };

  // Log summary
  const categories = Object.keys(formattedData.Data).filter(key => key !== 'updatedAt');
  const totalItems = categories.reduce((total, cat) => {
    return total + (formattedData.Data[cat]?.length || 0);
  }, 0);

  console.log(`[GetStock] 📦 Data formatted: ${totalItems} items across ${categories.length} categories`);
  categories.forEach(cat => {
    const count = formattedData.Data[cat]?.length || 0;
    console.log(`[GetStock]   - ${cat}: ${count} items`);
  });

  return formattedData;
}

// Inisialisasi WebSocket connection
function initializeWebSocket() {
  const wsUrl = "wss://websocket.joshlei.com/growagarden?user_id=594321645280428052";
  
  console.log("[GetStock] 🔌 Connecting to WebSocket:", wsUrl);
  
  wsConnection = new WebSocket(wsUrl);
  
  wsConnection.on('open', () => {
    console.log("[GetStock] ✅ WebSocket connected successfully");
    
    // Clear reconnect interval jika ada
    if (reconnectInterval) {
      clearInterval(reconnectInterval);
      reconnectInterval = null;
    }
  });
  
  wsConnection.on('message', (data) => {
    try {
      const parsedData = JSON.parse(data.toString());
      console.log("[GetStock] 📨 Received WebSocket data");
      
      // Update cache dengan data terbaru
      const itemLookup = createItemLookup();
      stockDataCache = formatStockData(parsedData, itemLookup);
      
      console.log(`[GetStock] 💾 Cache updated at: ${new Date(stockDataCache.Data.updatedAt).toLocaleString()}`);
      
    } catch (err) {
      console.error("[GetStock] ❌ Error parsing WebSocket data:", err.message);
    }
  });
  
  wsConnection.on('error', (error) => {
    console.error("[GetStock] ❌ WebSocket error:", error.message);
  });
  
  wsConnection.on('close', (code, reason) => {
    console.log(`[GetStock] 🔌 WebSocket closed: ${code} - ${reason}`);
    
    // Auto-reconnect setelah 5 detik
    if (!reconnectInterval) {
      console.log("[GetStock] 🔄 Scheduling reconnect in 5 seconds...");
      reconnectInterval = setTimeout(() => {
        console.log("[GetStock] 🔄 Attempting to reconnect WebSocket...");
        initializeWebSocket();
      }, 5000);
    }
  });
}

// Fungsi untuk mendapatkan stock data dari cache
function getStockFromCache() {
  return new Promise((resolve, reject) => {
    if (stockDataCache) {
      console.log("[GetStock] 📋 Retrieving data from cache");
      resolve(stockDataCache);
    } else {
      console.log("[GetStock] ⚠️  No cache data available");
      reject(new Error("No stock data available. WebSocket may not be connected."));
    }
  });
}

// Express module registration
function register(app) {
  console.log("[GetStock] 🚀 Registering Express routes");
  
  // Inisialisasi WebSocket saat server dimulai
  initializeWebSocket();
  
  app.get("/api/stock/GetStock", async (req, res) => {
    try {
      console.log("[GetStock] 🌐 API request received: /api/stock/GetStock");
      
      const stockData = await getStockFromCache();
      
      console.log("[GetStock] ✅ Successfully retrieved stock data from cache");
      res.json(stockData);
      
    } catch (err) {
      console.error("[GetStock] ❌ API Error:", err.message);
      
      // Jika WebSocket tidak terhubung, coba reconnect
      if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
        console.log("[GetStock] 🔄 WebSocket not connected, attempting to reconnect...");
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
    console.log("[GetStock] 🌐 API request received: /api/stock/status");
    
    const status = {
      websocket_connected: wsConnection && wsConnection.readyState === WebSocket.OPEN,
      last_update: stockDataCache ? stockDataCache.Data.updatedAt : null,
      cache_available: !!stockDataCache,
      connection_state: wsConnection ? wsConnection.readyState : 'Not initialized'
    };
    
    console.log("[GetStock] 📊 Status:", status);
    res.json(status);
  });
}

// Cleanup function untuk menutup WebSocket saat aplikasi ditutup
function cleanup() {
  console.log("[GetStock] 🧹 Cleaning up WebSocket connection...");
  if (wsConnection) {
    wsConnection.close();
  }
  if (reconnectInterval) {
    clearTimeout(reconnectInterval);
  }
  console.log("[GetStock] ✅ Cleanup completed");
}

// Handle process termination
process.on('SIGINT', () => {
  console.log("\n[GetStock] 🛑 Received SIGINT, shutting down gracefully...");
  cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log("\n[GetStock] 🛑 Received SIGTERM, shutting down gracefully...");
  cleanup();
  process.exit(0);
});

// Standalone testing mode
if (require.main === module) {
  console.log("[GetStock] 🚀 Starting WebSocket test mode...");
  console.log("[GetStock] Press Ctrl+C to exit");
  
  initializeWebSocket();
  
  // Status monitoring setiap 30 detik
  const statusInterval = setInterval(() => {
    console.log("─".repeat(60));
    console.log(`[GetStock] 🕒 Status Check - ${new Date().toLocaleString()}`);
    
    if (stockDataCache) {
      const categories = Object.keys(stockDataCache.Data).filter(key => key !== 'updatedAt');
      const totalItems = categories.reduce((total, cat) => {
        return total + (stockDataCache.Data[cat]?.length || 0);
      }, 0);
      
      console.log(`[GetStock] 📊 Cache Status: ${totalItems} items across ${categories.length} categories`);
      console.log(`[GetStock] 🕒 Last Update: ${new Date(stockDataCache.Data.updatedAt).toLocaleString()}`);
      console.log(`[GetStock] 📋 Categories: ${categories.join(', ')}`);
    } else {
      console.log("[GetStock] ⏳ Cache Status: No data available");
    }
    
    // WebSocket status
    const wsStatus = wsConnection ? 
      (wsConnection.readyState === WebSocket.OPEN ? '🟢 Connected' : 
       wsConnection.readyState === WebSocket.CONNECTING ? '🟡 Connecting' : 
       wsConnection.readyState === WebSocket.CLOSING ? '🟠 Closing' : '🔴 Closed') : 
      '⚫ Not initialized';
    
    console.log(`[GetStock] 🔗 WebSocket Status: ${wsStatus}`);
    console.log("─".repeat(60));
  }, 30000);
  
  // Cleanup untuk standalone mode
  process.on('SIGINT', () => {
    clearInterval(statusInterval);
    cleanup();
    process.exit(0);
  });
}

module.exports = { register, cleanup, initializeWebSocket, getStockFromCache };
