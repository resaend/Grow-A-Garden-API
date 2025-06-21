const https = require("https");
const fs = require("fs");
const path = require("path");

// Configuration
const CONFIG = {
  DATA_FILE: path.join(__dirname, "../data/Database.json"),
  API_HOSTNAME: "api.joshlei.com",
  API_PATH: "/v2/growagarden/stock",
  REQUEST_TIMEOUT: 10000
};

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
 * API service for fetching stock data
 */
class ApiService {
  static fetchStockData() {
    return new Promise((resolve, reject) => {
      const options = {
        method: "GET",
        hostname: CONFIG.API_HOSTNAME,
        path: CONFIG.API_PATH,
        headers: {
          accept: "application/json",
          "accept-language": "en-US,en;q=0.9",
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        },
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (e) {
            reject(new Error("Failed to parse stock JSON: " + e.message));
          }
        });
      });

      req.on("error", (e) => {
        reject(e);
      });

      req.setTimeout(CONFIG.REQUEST_TIMEOUT, () => {
        req.destroy();
        reject(new Error("Stock request timeout"));
      });

      req.end();
    });
  }
}

/**
 * Data formatting service
 */
class DataFormatter {
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

  static formatStockData(apiData, itemLookup) {
    const formatCategory = (categoryData) => {
      if (!Array.isArray(categoryData)) return [];
      
      return categoryData.map(item => ({
        name: item.display_name || item.name,
        stock: (item.quantity || item.stock || 0).toString(),
        rarity: this.findItemRarity(item, itemLookup)
      }));
    };

    return {
      Data: {
        updatedAt: Date.now(),
        gear: formatCategory(apiData.gear_stock || []),
        seeds: formatCategory(apiData.seed_stock || []),
        egg: formatCategory(apiData.egg_stock || []),
        honey: formatCategory(apiData.eventshop_stock || []),
        cosmetics: formatCategory(apiData.cosmetic_stock || [])
      }
    };
  }
}

/**
 * Express route handlers
 */
class RouteHandlers {
  static async getStock(req, res) {
    try {
      // Fetch fresh data from API on every request
      const apiData = await ApiService.fetchStockData();
      
      // Create item lookup from database
      const itemLookup = DatabaseService.createItemLookup();
      
      // Format the data
      const formattedData = DataFormatter.formatStockData(apiData, itemLookup);
      
      res.json(formattedData);
      
    } catch (error) {
      res.status(500).json({
        error: error.message || "Failed to get stock data",
        status: "API request failed"
      });
    }
  }

  static getStatus(req, res) {
    const status = {
      service: "On-demand stock fetching",
      api_endpoint: `https://${CONFIG.API_HOSTNAME}${CONFIG.API_PATH}`,
      database_available: fs.existsSync(CONFIG.DATA_FILE),
      request_timeout: `${CONFIG.REQUEST_TIMEOUT / 1000} seconds`
    };
    
    res.json(status);
  }
}

/**
 * Main application interface
 */
function register(app) {
  app.get("/api/stock/GetStock", RouteHandlers.getStock);
  app.get("/api/stock/status", RouteHandlers.getStatus);
}

module.exports = {
  register,
  fetchStockData: ApiService.fetchStockData,
  formatStockData: DataFormatter.formatStockData
};
