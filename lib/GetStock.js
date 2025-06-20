const https = require("https");
const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "../data/Database.json");

function createOptions() {
  return {
    method: "GET",
    hostname: "api.joshlei.com",
    path: "/v2/growagarden/stock",
    headers: {
      accept: "application/json",
      "accept-language": "en-US,en;q=0.9",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    },
  };
}

function fetchStockData() {
  return new Promise((resolve, reject) => {
    const options = createOptions();
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
          reject(new Error("Failed to parse JSON: " + e.message));
        }
      });
    });

    req.on("error", (e) => {
      reject(e);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    req.end();
  });
}

// Load database untuk mendapatkan tier info
function loadDatabase() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const dataStr = fs.readFileSync(DATA_FILE, "utf-8");
      const data = JSON.parse(dataStr);
      return data.items || [];
    }
    return [];
  } catch (err) {
    console.error("[GetStock] Error loading database:", err);
    return [];
  }
}

// Buat lookup map untuk tier berdasarkan nama item
function createItemLookup() {
  const items = loadDatabase();
  const itemLookup = {};
  
  items.forEach(item => {
    itemLookup[item.name] = {
      tier: item.rarity ? item.rarity.toLowerCase() : 'unknown'
    };
  });
  
  return itemLookup;
}

// Format data dari API joshlei.com ke format yang diinginkan
function formatStockData(apiData, itemLookup) {
  const formatCategory = (categoryData) => {
    return categoryData.map(item => ({
      name: item.display_name,
      stock: item.quantity.toString(),
      tier: itemLookup[item.display_name]?.tier || 'unknown'
    }));
  };

  return {
    Data: {
      updatedAt: Date.now(),
      gear: formatCategory(apiData.gear_stock || []),
      seeds: formatCategory(apiData.seed_stock || []),
      egg: formatCategory(apiData.egg_stock || []),
      honey: formatCategory(apiData.eventshop_stock || []), // Event shop items sebagai honey
      cosmetics: formatCategory(apiData.cosmetic_stock || [])
    }
  };
}

function register(app) {
  app.get("/api/stock/GetStock", async (req, res) => {
    try {
      console.log("[GetStock] Fetching stock data from joshlei.com API...");
      
      const stockData = await fetchStockData();
      
      // Load item lookup dari database
      const itemLookup = createItemLookup();
      
      // Format data sesuai struktur yang diinginkan
      const formattedData = formatStockData(stockData, itemLookup);

      console.log(`[GetStock] Successfully formatted stock data`);
      res.json(formattedData);
      
    } catch (err) {
      console.error("[GetStock] Error:", err.message);
      res.status(500).json({ error: err.message || "Failed to fetch stock data" });
    }
  });
}

module.exports = { register };
