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
  static fetchStockFromJoshlei() {
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

  static convertToStockFormat(apiData, itemLookup) {
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
 * Rare items filtering service
 */
class RareItemsFilter {
  static getRarityPriority(rarity) {
    const priorities = {
      'prismatic': 6,
      'divine': 5,
      'mythical': 4,
      'mythic': 4,
      'legendary': 3,
      'rare': 2,
      'uncommon': 1,
      'common': 0
    };
    return priorities[rarity?.toLowerCase()] || 0;
  }

  static isRareRarity(rarity) {
    const rareRarities = ['legendary', 'mythical', 'mythic', 'divine', 'prismatic'];
    return rareRarities.includes(rarity?.toLowerCase());
  }

  static isSprinkler(itemName) {
    return itemName?.toLowerCase().includes('sprinkler');
  }

  static isAllowedEgg(itemName) {
    const allowedEggs = ['Legendary Egg', 'Mythical Egg', 'Bug Egg', 'Paradise Egg', 'Bee Egg'];
    return allowedEggs.includes(itemName);
  }

  static filterRareItems(stockData) {
    const rareStock = {
      updatedAt: stockData.Data?.updatedAt || Date.now(),
      gear: [],
      seeds: [],
      egg: []
    };

    // Filter SEEDS: hanya Legendary ke atas
    const seedItems = stockData.Data?.seeds || [];
    seedItems.forEach(item => {
      if (this.isRareRarity(item.rarity) && parseInt(item.stock) > 0) {
        rareStock.seeds.push({
          name: item.name,
          stock: item.stock,
          rarity: item.rarity
        });
      }
    });

    // Filter GEAR: hanya sprinkler dengan rarity rare ke atas
    const gearItems = stockData.Data?.gear || [];
    gearItems.forEach(item => {
      if (this.isSprinkler(item.name) && parseInt(item.stock) > 0) {
        rareStock.gear.push({
          name: item.name,
          stock: item.stock,
          rarity: item.rarity
        });
      }
    });

    // Filter EGG: hanya egg tertentu
    const eggItems = stockData.Data?.egg || [];
    eggItems.forEach(item => {
      if (this.isAllowedEgg(item.name) && parseInt(item.stock) > 0) {
        rareStock.egg.push({
          name: item.name,
          stock: item.stock,
          rarity: item.rarity
        });
      }
    });

    return rareStock;
  }

  static sortItemsByRarity(rareStock) {
    ['gear', 'seeds', 'egg'].forEach(category => {
      rareStock[category].sort((a, b) => {
        const aPriority = this.getRarityPriority(a.rarity);
        const bPriority = this.getRarityPriority(b.rarity);
        if (aPriority !== bPriority) {
          return bPriority - aPriority;
        }
        return a.name.localeCompare(b.name);
      });
    });
    
    return rareStock;
  }

  static calculateTierBreakdown(rareStock) {
    const tierBreakdown = {};
    ['gear', 'seeds', 'egg'].forEach(category => {
      rareStock[category].forEach(item => {
        tierBreakdown[item.rarity] = (tierBreakdown[item.rarity] || 0) + 1;
      });
    });
    return tierBreakdown;
  }
}

/**
 * Main route handler
 */
class RareStockHandler {
  static async handleRequest(req, res) {
    try {
      // Ambil data langsung dari joshlei.com API
      const apiData = await ApiService.fetchStockFromJoshlei();
      
      // Buat item lookup dari database
      const itemLookup = DatabaseService.createItemLookup();
      
      // Convert ke format stock
      const stockData = DataFormatter.convertToStockFormat(apiData, itemLookup);
      
      // Filter rare items sesuai kriteria
      let rareStock = RareItemsFilter.filterRareItems(stockData);
      
      // Hitung total rare items
      const totalRareItems = rareStock.gear.length + rareStock.seeds.length + rareStock.egg.length;

      // Jika tidak ada item rare, return empty response
      if (totalRareItems === 0) {
        return res.json({
          message: "No rare items currently in stock",
          totalRareItems: 0,
          lastUpdated: new Date().toISOString(),
          data: {
            gear: [],
            seeds: [],
            egg: []
          }
        });
      }

      // Sort items berdasarkan rarity priority
      rareStock = RareItemsFilter.sortItemsByRarity(rareStock);

      // Hitung breakdown berdasarkan rarity
      const tierBreakdown = RareItemsFilter.calculateTierBreakdown(rareStock);

      const response = {
        message: "Rare items currently in stock",
        totalRareItems: totalRareItems,
        tierBreakdown: tierBreakdown,
        lastUpdated: new Date().toISOString(),
        data: {
          gear: rareStock.gear,
          seeds: rareStock.seeds,
          egg: rareStock.egg
        }
      };

      res.json(response);

    } catch (error) {
      res.status(500).json({ 
        error: "Failed to fetch rare stock data",
        message: error.message,
        suggestion: "Please check if joshlei.com API is accessible"
      });
    }
  }
}

/**
 * Express route registration
 */
function register(app) {
  app.get('/api/stock/GetRareStock', RareStockHandler.handleRequest);
}

module.exports = { register };