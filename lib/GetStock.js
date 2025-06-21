const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

// Configuration
const CONFIG = {
  DATA_FILE: path.join(__dirname, "../data/Database.json"),
  WS_URL: "wss://websocket.joshlei.com/growagarden?user_id=594321645280428052",
  RECONNECT_DELAY: 5000,
  STATUS_CHECK_INTERVAL: 30000
};

// Global state
let stockDataCache = null;
let wsConnection = null;
let reconnectInterval = null;

/**
 * Database operations
 */
class DatabaseService {
  static loadItems() {
    try {
      if (!fs.existsSync(CONFIG.DATA_FILE)) {
        return [];
      }
      
      const dataStr = fs.readFileSync(CONFIG.DATA_FILE, "utf-8");
      const data = JSON.parse(dataStr);
      return data || [];
    } catch (error) {
      return [];
    }
  }

  static createItemLookup() {
    const items = this.loadItems();
    const itemLookup = {};
    
    items.forEach(item => {
      const rarity = item.rarity?.toLowerCase() || 'unknown';
      
      // Multiple lookup strategies
      const keys = [
        item.display_name,
        item.display_name?.toLowerCase(),
        item.item_id,
        item.item_id?.toLowerCase(),
        this.normalizeItemName(item.display_name),
        this.normalizeItemName(item.item_id)
      ].filter(Boolean);
      
      keys.forEach(key => {
        itemLookup[key] = { rarity };
      });
    });
    
    return itemLookup;
  }

  static normalizeItemName(name) {
    return name ? name.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  }
}

/**
 * Data formatting service
 */
class DataFormatter {
  static formatStockData(wsData, itemLookup) {
    return {
      Data: {
        updatedAt: Date.now(),
        gear: this.formatCategory(wsData.gear_stock || [], itemLookup),
        seeds: this.formatCategory(wsData.seed_stock || [], itemLookup),
        egg: this.formatCategory(wsData.egg_stock || [], itemLookup),
        honey: this.formatCategory(wsData.eventshop_stock || [], itemLookup),
        cosmetics: this.formatCategory(wsData.cosmetic_stock || [], itemLookup)
      }
    };
  }

  static formatCategory(categoryData, itemLookup) {
    if (!Array.isArray(categoryData)) return [];
    
    return categoryData.map(item => ({
      name: item.display_name || item.name,
      stock: (item.quantity || item.stock || 0).toString(),
      rarity: this.findItemRarity(item, itemLookup)
    }));
  }

  static findItemRarity(item, itemLookup) {
    const searchKeys = [
      item.display_name,
      item.display_name?.toLowerCase(),
      item.item_id,
      item.item_id?.toLowerCase(),
      DatabaseService.normalizeItemName(item.display_name),
      DatabaseService.normalizeItemName(item.item_id)
    ].filter(Boolean);

    for (const key of searchKeys) {
      if (itemLookup[key]?.rarity) {
        return itemLookup[key].rarity;
      }
    }
    
    return 'unknown';
  }
}

/**
 * WebSocket service
 */
class WebSocketService {
  static initialize() {
    this.connect();
  }

  static connect() {
    wsConnection = new WebSocket(CONFIG.WS_URL);
    
    wsConnection.on('open', this.handleOpen);
    wsConnection.on('message', this.handleMessage);
    wsConnection.on('error', this.handleError);
    wsConnection.on('close', this.handleClose);
  }

  static handleOpen() {
    if (reconnectInterval) {
      clearInterval(reconnectInterval);
      reconnectInterval = null;
    }
  }

  static handleMessage(data) {
    try {
      const parsedData = JSON.parse(data.toString());
      const itemLookup = DatabaseService.createItemLookup();
      stockDataCache = DataFormatter.formatStockData(parsedData, itemLookup);
    } catch (error) {
      // Silent error handling
    }
  }

  static handleError(error) {
    // Silent error handling
  }

  static handleClose(code, reason) {
    if (!reconnectInterval) {
      reconnectInterval = setTimeout(() => {
        this.connect();
      }, CONFIG.RECONNECT_DELAY);
    }
  }

  static getConnectionState() {
    if (!wsConnection) return 'Not initialized';
    
    const states = {
      [WebSocket.CONNECTING]: 'Connecting',
      [WebSocket.OPEN]: 'Connected',
      [WebSocket.CLOSING]: 'Closing',
      [WebSocket.CLOSED]: 'Closed'
    };
    
    return states[wsConnection.readyState] || 'Unknown';
  }

  static isConnected() {
    return wsConnection && wsConnection.readyState === WebSocket.OPEN;
  }
}

/**
 * Cache service
 */
class CacheService {
  static async getStockData() {
    return new Promise((resolve, reject) => {
      if (stockDataCache) {
        resolve(stockDataCache);
      } else {
        reject(new Error("No stock data available. WebSocket may not be connected."));
      }
    });
  }

  static hasData() {
    return !!stockDataCache;
  }

  static getLastUpdate() {
    return stockDataCache?.Data?.updatedAt || null;
  }
}

/**
 * Express route handlers
 */
class RouteHandlers {
  static async getStock(req, res) {
    try {
      const stockData = await CacheService.getStockData();
      res.json(stockData);
    } catch (error) {
      if (!WebSocketService.isConnected()) {
        WebSocketService.connect();
      }
      
      res.status(500).json({
        error: error.message || "Failed to get stock data",
        status: "WebSocket connection may be unavailable"
      });
    }
  }

  static getStatus(req, res) {
    const status = {
      websocket_connected: WebSocketService.isConnected(),
      last_update: CacheService.getLastUpdate(),
      cache_available: CacheService.hasData(),
      connection_state: WebSocketService.getConnectionState()
    };
    
    res.json(status);
  }
}

/**
 * Application lifecycle management
 */
class AppLifecycle {
  static initialize() {
    WebSocketService.initialize();
    this.setupProcessHandlers();
  }

  static setupProcessHandlers() {
    const gracefulShutdown = () => {
      this.cleanup();
      process.exit(0);
    };

    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);
  }

  static cleanup() {
    if (wsConnection) {
      wsConnection.close();
    }
    if (reconnectInterval) {
      clearTimeout(reconnectInterval);
    }
  }

  static startStandaloneMode() {
    this.initialize();
    
    const statusInterval = setInterval(() => {
      // Silent status monitoring
    }, CONFIG.STATUS_CHECK_INTERVAL);
    
    process.on('SIGINT', () => {
      clearInterval(statusInterval);
      this.cleanup();
      process.exit(0);
    });
  }
}

/**
 * Main application interface
 */
function register(app) {
  AppLifecycle.initialize();
  
  app.get("/api/stock/GetStock", RouteHandlers.getStock);
  app.get("/api/stock/status", RouteHandlers.getStatus);
}

// Standalone mode detection
if (require.main === module) {
  AppLifecycle.startStandaloneMode();
}

module.exports = {
  register,
  cleanup: AppLifecycle.cleanup,
  initializeWebSocket: WebSocketService.initialize,
  getStockFromCache: CacheService.getStockData
};
