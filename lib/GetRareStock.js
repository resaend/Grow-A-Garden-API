const https = require("https");
const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "../data/Database.json");

function fetchStockData() {
  return new Promise((resolve, reject) => {
    // Untuk Vercel, gunakan HTTPS ke domain sendiri
    const isProduction = process.env.VERCEL || process.env.NODE_ENV === 'production';
    const hostname = isProduction ? process.env.VERCEL_URL || 'grow-a-garden-api-sand.vercel.app' : 'localhost';
    const port = isProduction ? 443 : 3000;
    const protocol = isProduction ? https : require('http');
    
    const options = {
      hostname: hostname,
      port: port,
      path: '/api/stock/GetStock',
      method: 'GET',
      headers: {
        'User-Agent': 'GAG-API-Internal'
      }
    };

    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (data.trim().startsWith('<!DOCTYPE') || data.trim().startsWith('<html')) {
          reject(new Error('GetStock endpoint returned HTML error page instead of JSON'));
          return;
        }
        
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(new Error('Failed to parse JSON: ' + e.message + '. Response: ' + data.substring(0, 100)));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error('Request failed: ' + err.message));
    });
    
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

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

function getRareItemsMap() {
  const items = loadDatabase();
  const rareItems = {};
  
  items.forEach(item => {
    // Untuk gear: hanya sprinkler yang ditampilkan (semua rarity)
    if (item.category === 'Gears' && item.name.toLowerCase().includes('sprinkler')) {
      rareItems[item.name] = {
        rarity: item.rarity,
        category: item.category,
        buyPrice: item.metadata?.buyPrice || "N/A",
        sellValue: item.metadata?.sellValue || "N/A",
        image: item.image,
        itemId: item.itemId,
        tier: item.metadata?.tier || item.rarity,
        type: item.metadata?.type || "N/A",
        tradeable: item.metadata?.tradeable !== undefined ? item.metadata.tradeable : true
      };
    }
    // Untuk kategori lain: berdasarkan rarity Legendary ke atas (KECUALI COSMETICS)
    else if (item.category !== 'Gears' && item.category !== 'Cosmetics' && ['Legendary', 'Mythical', 'Mythic', 'Divine', 'Prismatic'].includes(item.rarity)) {
      rareItems[item.name] = {
        rarity: item.rarity,
        category: item.category,
        buyPrice: item.metadata?.buyPrice || "N/A",
        sellValue: item.metadata?.sellValue || "N/A",
        image: item.image,
        itemId: item.itemId,
        tier: item.metadata?.tier || item.rarity,
        type: item.metadata?.type || "N/A",
        tradeable: item.metadata?.tradeable !== undefined ? item.metadata.tradeable : true
      };
    }
  });

  // Tambahkan Bee Egg sebagai item khusus untuk event
  rareItems['Bee Egg'] = {
    rarity: 'Mythical',
    category: 'Eggs',
    buyPrice: '18 Honey or 129 Robux',
    sellValue: 'N/A',
    image: 'https://i.postimg.cc/x81BptYT/image.png',
    itemId: 'BEE_EGG',
    tier: 'Mythical',
    type: 'Event Egg',
    tradeable: false,
    eventItem: true,
    description: 'Limited-time Bizzy Bees event egg'
  };

  // Tambahkan Anti Bee Egg juga
  rareItems['Anti Bee Egg'] = {
    rarity: 'Divine',
    category: 'Eggs',
    buyPrice: 'Craftable (Bee Egg + 18 Honey)',
    sellValue: 'N/A',
    image: 'https://i.postimg.cc/x81BptYT/image.png',
    itemId: 'ANTI_BEE_EGG',
    tier: 'Divine',
    type: 'Craftable Event Egg',
    tradeable: false,
    eventItem: true,
    description: 'Craftable egg with red and black stripes'
  };
  
  return rareItems;
}

function filterRareStock(stockData) {
  const rareItemsMap = getRareItemsMap();
  const rareStock = {
    updatedAt: stockData.Data?.updatedAt || Date.now(),
    gear: [],
    seeds: [],
    egg: [],
    honey: []
  };

  // Filter setiap kategori (kecuali cosmetics)
  Object.keys(rareStock).forEach(category => {
    if (category === 'updatedAt') return;
    
    const items = stockData.Data?.[category] || [];
    items.forEach(item => {
      const rareInfo = rareItemsMap[item.name];
      if (rareInfo) {
        rareStock[category].push({
          ...item,
          rarity: rareInfo.rarity,
          category: rareInfo.category,
          buyPrice: rareInfo.buyPrice,
          sellValue: rareInfo.sellValue,
          image: rareInfo.image,
          itemId: rareInfo.itemId,
          tier: rareInfo.tier,
          type: rareInfo.type,
          tradeable: rareInfo.tradeable,
          eventItem: rareInfo.eventItem || false,
          description: rareInfo.description || ''
        });
      }
    });
  });

  return rareStock;
}

function getRarityPriority(rarity) {
  const priorities = {
    'Prismatic': 5,
    'Divine': 4,
    'Mythical': 3,
    'Mythic': 3,
    'Legendary': 2,
    'Rare': 1,
    'Uncommon': 0.5,
    'Common': 0
  };
  return priorities[rarity] || 0;
}

function register(app) {
  app.get('/api/stock/GetRareStock', async (req, res) => {
    try {
      const stockData = await fetchStockData();
      
      if (!stockData || !stockData.Data) {
        return res.status(503).json({ 
          error: "Stock data not available",
          message: "Unable to fetch stock data from GetStock endpoint",
          suggestion: "Please check if /api/stock/GetStock is working properly"
        });
      }

      const rareStock = filterRareStock(stockData);
      
      const totalRareItems = Object.keys(rareStock)
        .filter(key => key !== 'updatedAt')
        .reduce((total, category) => total + rareStock[category].length, 0);

      const rarityBreakdown = {};
      Object.keys(rareStock).forEach(category => {
        if (category !== 'updatedAt') {
          rareStock[category].forEach(item => {
            rarityBreakdown[item.rarity] = (rarityBreakdown[item.rarity] || 0) + 1;
          });
        }
      });

      // Sort items dalam setiap kategori berdasarkan rarity
      Object.keys(rareStock).forEach(category => {
        if (category !== 'updatedAt') {
          rareStock[category].sort((a, b) => {
            const aPriority = getRarityPriority(a.rarity);
            const bPriority = getRarityPriority(b.rarity);
            if (aPriority !== bPriority) {
              return bPriority - aPriority;
            }
            return a.name.localeCompare(b.name);
          });
        }
      });

      const response = {
        message: "Rare items currently in stock (Legendary+ for seeds/fruits/etc, Sprinklers only for gear, Event eggs included)",
        totalRareItems: totalRareItems,
        rarityBreakdown: rarityBreakdown,
        lastUpdated: new Date().toISOString(),
        stockUpdatedAt: new Date(rareStock.updatedAt).toISOString(),
        filterInfo: {
          gear: "Shows only sprinklers (all rarities)",
          seeds: "Shows Legendary and above",
          egg: "Shows Legendary and above + Event eggs (Bee Egg, Anti Bee Egg)", 
          honey: "Shows Legendary and above",
          cosmetics: "Excluded from results"
        },
        eventInfo: {
          beeEgg: {
            available: rareStock.egg.some(item => item.name === 'Bee Egg'),
            price: "18 Honey or 129 Robux",
            rarity: "Mythical",
            event: "Bizzy Bees Event",
            shopResetTime: "Every 30 minutes"
          },
          antiBeeEgg: {
            available: rareStock.egg.some(item => item.name === 'Anti Bee Egg'),
            craftingRequirement: "Bee Egg + 18 Honey",
            rarity: "Divine",
            craftingTime: "40 minutes"
          }
        },
        data: rareStock
      };

      res.json(response);

    } catch (error) {
      console.error("[GetRareStock] Error fetching rare stock:", error.message);
      res.status(503).json({ 
        error: "Stock data temporarily unavailable",
        message: "The main stock endpoint is currently not responding with valid data",
        details: error.message,
        suggestion: "Please check if /api/stock/GetStock is working properly"
      });
    }
  });

  // Endpoint untuk kategori spesifik (tanpa cosmetics)
  app.get('/api/stock/GetRareStock/:category', async (req, res) => {
    try {
      const category = req.params.category.toLowerCase();
      const validCategories = ['gear', 'seeds', 'egg', 'honey'];
      
      if (!validCategories.includes(category)) {
        return res.status(400).json({
          error: "Invalid category",
          validCategories: validCategories,
          note: "Cosmetics category is excluded from rare stock"
        });
      }

      const stockData = await fetchStockData();
      
      if (!stockData || !stockData.Data) {
        return res.status(503).json({ 
          error: "Stock data not available",
          message: "Unable to fetch stock data from GetStock endpoint"
        });
      }

      const rareStock = filterRareStock(stockData);

      if (rareStock[category]) {
        rareStock[category].sort((a, b) => {
          const aPriority = getRarityPriority(a.rarity);
          const bPriority = getRarityPriority(b.rarity);
          if (aPriority !== bPriority) {
            return bPriority - aPriority;
          }
          return a.name.localeCompare(b.name);
        });
      }

      const response = {
        category: category,
        filterRule: category === 'gear' ? "Shows only sprinklers (all rarities)" : 
                   category === 'egg' ? "Shows Legendary and above + Event eggs" :
                   "Shows Legendary and above",
        items: rareStock[category] || [],
        count: rareStock[category]?.length || 0,
        lastUpdated: new Date().toISOString(),
        stockUpdatedAt: new Date(rareStock.updatedAt).toISOString()
      };

      res.json(response);

    } catch (error) {
      console.error("[GetRareStock] Error fetching category rare stock:", error.message);
      res.status(503).json({ 
        error: "Stock data temporarily unavailable",
        message: error.message
      });
    }
  });
}

module.exports = { register };
