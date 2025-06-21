const https = require("https");
const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "../data/Database.json");

// Fungsi untuk mengambil data dari joshlei.com API
function fetchStockFromJoshlei() {
  return new Promise((resolve, reject) => {
    const options = {
      method: "GET",
      hostname: "api.joshlei.com",
      path: "/v2/growagarden/stock",
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

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error("Stock request timeout"));
    });

    req.end();
  });
}

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
    console.error("[GetRareStock] Error loading database:", err);
    return [];
  }
}

// Buat map rarity dari database
function createRarityMap() {
  const items = loadDatabase();
  const rarityMap = {};
  
  items.forEach(item => {
    rarityMap[item.name] = {
      tier: item.rarity ? item.rarity.toLowerCase() : 'unknown'
    };
  });

  return rarityMap;
}

// Convert joshlei API data ke format GetStock
function convertToGetStockFormat(apiData, rarityMap) {
  const formatCategory = (categoryData) => {
    return categoryData.map(item => ({
      name: item.display_name,
      stock: item.quantity.toString(),
      tier: rarityMap[item.display_name]?.tier || 'unknown'
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

// Filter rare items sesuai kriteria spesifik
function filterRareItems(stockData, rarityMap) {
  const rareStock = {
    updatedAt: stockData.Data?.updatedAt || Date.now(),
    gear: [],
    seeds: [],
    egg: []
  };

  // Filter SEEDS: hanya Legendary ke atas
  const seedsLegendaryPlus = ['legendary', 'mythical', 'divine', 'prismatic'];
  const seedItems = stockData.Data?.seeds || [];
  seedItems.forEach(item => {
    if (seedsLegendaryPlus.includes(item.tier) && parseInt(item.stock) > 0) {
      rareStock.seeds.push({
        name: item.name,
        stock: item.stock,
        tier: item.tier
      });
    }
  });

  // Filter GEAR: hanya sprinkler
  const gearItems = stockData.Data?.gear || [];
  gearItems.forEach(item => {
    if (item.name.toLowerCase().includes('sprinkler') && parseInt(item.stock) > 0) {
      rareStock.gear.push({
        name: item.name,
        stock: item.stock,
        tier: item.tier
      });
    }
  });

  // Filter EGG: hanya Legendary Egg, Mythical Egg, Bug Egg
  const allowedEggs = ['Legendary Egg', 'Mythical Egg', 'Bug Egg'];
  const eggItems = stockData.Data?.egg || [];
  eggItems.forEach(item => {
    if (allowedEggs.includes(item.name) && parseInt(item.stock) > 0) {
      rareStock.egg.push({
        name: item.name,
        stock: item.stock,
        tier: item.tier
      });
    }
  });

  return rareStock;
}

function getRarityPriority(tier) {
  const priorities = {
    'prismatic': 5,
    'divine': 4,
    'mythical': 3,
    'mythic': 3,
    'legendary': 2,
    'rare': 1,
    'uncommon': 0.5,
    'common': 0
  };
  return priorities[tier] || 0;
}

function register(app) {
  app.get('/api/stock/GetRareStock', async (req, res) => {
    try {
      console.log('[GetRareStock] Fetching stock data from joshlei.com API...');
      
      // Ambil data langsung dari joshlei.com API
      const apiData = await fetchStockFromJoshlei();
      
      // Buat rarity map dari database
      const rarityMap = createRarityMap();
      
      // Convert ke format GetStock
      const stockData = convertToGetStockFormat(apiData, rarityMap);
      
      // Filter rare items sesuai kriteria
      const rareStock = filterRareItems(stockData, rarityMap);
      
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

      // Hitung breakdown berdasarkan tier
      const tierBreakdown = {};
      ['gear', 'seeds', 'egg'].forEach(category => {
        rareStock[category].forEach(item => {
          tierBreakdown[item.tier] = (tierBreakdown[item.tier] || 0) + 1;
        });
      });

      // Sort items berdasarkan tier priority
      ['gear', 'seeds', 'egg'].forEach(category => {
        rareStock[category].sort((a, b) => {
          const aPriority = getRarityPriority(a.tier);
          const bPriority = getRarityPriority(b.tier);
          if (aPriority !== bPriority) {
            return bPriority - aPriority;
          }
          return a.name.localeCompare(b.name);
        });
      });

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

      console.log(`[GetRareStock] Found ${totalRareItems} rare items in stock`);
      res.json(response);

    } catch (error) {
      console.error("[GetRareStock] Error:", error.message);
      res.status(500).json({ 
        error: "Failed to fetch rare stock data",
        message: error.message,
        suggestion: "Please check if joshlei.com API is accessible"
      });
    }
  });
}

module.exports = { register };
