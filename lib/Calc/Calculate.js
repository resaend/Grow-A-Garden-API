const fs = require('fs');
const https = require('https');
const path = require('path');

const localPath = path.resolve(__dirname, './FruitDatabase.js');
const githubURL = 'https://raw.githubusercontent.com/Just3itx/Grow-A-Garden-API/refs/heads/main/Funcs/Calc/FruitDatabase.js';

let ItemData = [];
let Rarity = [];
let Mutations = {};

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}, status code: ${res.statusCode}`));
        res.resume();
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', err => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

async function loadFruitDatabase() {
  try {
    await downloadFile(githubURL, localPath);
  } catch (err) {
    throw new Error(`Failed to download FruitDatabase.js: ${err.message}`);
  }

  delete require.cache[require.resolve(localPath)];

  const mod = require(localPath);
  ItemData = mod.ItemData;
  Rarity = mod.Rarity;
  Mutations = mod.Mutations;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getFruitData(name) {
  return ItemData.find(item => item[0] === name) || null;
}

function calculateVariant(variantName) {
  const variant = Rarity.find(v => v[0] === variantName);
  return variant ? variant[2] : 1;
}

function calculateMutation(tool) {
  if (!tool.attributes || !Array.isArray(tool.attributes)) return 1;

  let mutationCount = 1;
  for (const attr of tool.attributes) {
    const mutation = Mutations[attr];
    if (mutation && typeof mutation.ValueMulti === 'number') {
      mutationCount += (mutation.ValueMulti - 1);
    }
  }
  return mutationCount;
}

function calculateFruit(tool) {
  if (!tool || typeof tool.Name !== 'string') {
    console.warn("Invalid tool or missing Name.");
    return 0;
  }

  const itemData = getFruitData(tool.Name);
  if (!itemData || itemData.length < 3) {
    console.warn(`No item data found for fruit: ${tool.Name}`);
    return 0;
  }

  if (typeof tool.Weight !== 'object' || typeof tool.Weight.value !== 'number') {
    console.warn("Missing or invalid weight for the tool.");
    return 0;
  }

  const baseValue = itemData[2];
  const weightDivisor = itemData[1];
  const variantMultiplier = calculateVariant(tool.Variant?.value || "Normal");
  const mutationValue = calculateMutation(tool);

  const weightRatio = tool.Weight.value / weightDivisor;
  const clampedRatio = clamp(weightRatio, 0.95, 1e8);
  const finalValue = baseValue * mutationValue * variantMultiplier * (clampedRatio * clampedRatio);

  return Math.round(finalValue);
}

(async () => {
  try {
    await loadFruitDatabase();
    console.log(`Loaded FruitDatabase with ${ItemData.length} items.`);
  } catch (e) {
    console.error('Error loading FruitDatabase:', e);
    process.exit(1);
  }
})();

module.exports = { calculateFruit };
