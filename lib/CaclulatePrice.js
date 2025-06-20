// Mock calculator untuk Vercel (karena file Calculate.js tidak tersedia)
const ListCalculator = {
  calculateFruit: (tool) => {
    // Simple mock calculation
    const baseValue = tool.Weight.value * 100;
    const variantMultiplier = tool.Variant.value === 'Golden' ? 2 : 1;
    const mutationBonus = tool.attributes.length * 50;
    
    return Math.round(baseValue * variantMultiplier + mutationBonus);
  }
};

function register(app) {
  app.get('/api/CalculatePrice', (req, res) => {
    const tool = req.query;
    const requiredParams = ['Name', 'Weight'];
    
    for (const param of requiredParams) {
      if (!tool || !tool[param]) {
        return res.status(400).json({ error: `Missing required parameter: ${param}` });
      }
    }

    try {
      tool.Weight = { value: parseFloat(tool.Weight) };
      tool.Variant = { value: tool.Variant || 'Normal' };
      
      if (tool.Mutation) {
        tool.attributes = tool.Mutation.split(',').map(m => m.trim());
      } else {
        tool.attributes = [];
      }

      const result = ListCalculator.calculateFruit(tool);
      return res.json({ 
        value: result,
        calculation: {
          name: tool.Name,
          weight: tool.Weight.value,
          variant: tool.Variant.value,
          mutations: tool.attributes
        }
      });
    } catch (error) {
      console.error("Error calculating fruit value:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
}

module.exports = { register };
