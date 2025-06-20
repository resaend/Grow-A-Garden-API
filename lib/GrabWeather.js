const https = require("https");

function createOptions() {
  return {
    method: "GET",
    hostname: "api.joshlei.com",
    path: "/v2/growagarden/weather",
    headers: {
      accept: "application/json",
      "accept-language": "en-US,en;q=0.9",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    },
  };
}

function fetchWeatherData() {
  return new Promise((resolve, reject) => {
    const options = createOptions();
    const req = https.request(options, (res) => {
      let data = "";

      console.log(`[Weather] Response status: ${res.statusCode}`);

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          
          // Validate response structure
          if (!parsed.weather || !Array.isArray(parsed.weather)) {
            throw new Error("Invalid weather data structure");
          }

          console.log(`[Weather] Successfully fetched ${parsed.weather.length} weather types`);
          resolve(parsed);
          
        } catch (e) {
          console.error("[Weather] Parse error:", e.message);
          reject(new Error("Failed to parse weather data: " + e.message));
        }
      });
    });

    req.on("error", (e) => {
      console.error("[Weather] Request error:", e.message);
      reject(e);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error("Weather request timeout"));
    });

    req.end();
  });
}

// Format weather data untuk response yang user-friendly (tanpa discord_invite)
function formatWeatherData(rawData) {
  const activeWeather = rawData.weather.filter(w => w.active);
  const inactiveWeather = rawData.weather.filter(w => !w.active);
  
  return {
    summary: {
      total_weather_types: rawData.weather.length,
      active_weather_count: activeWeather.length,
      inactive_weather_count: inactiveWeather.length
    },
    active_weather: activeWeather.map(weather => ({
      name: weather.weather_name,
      id: weather.weather_id,
      duration: weather.duration,
      start_time: weather.start_duration_unix,
      end_time: weather.end_duration_unix,
      icon: weather.icon,
      active: weather.active
    })),
    all_weather: rawData.weather.map(weather => ({
      name: weather.weather_name,
      id: weather.weather_id,
      duration: weather.duration,
      start_time: weather.start_duration_unix,
      end_time: weather.end_duration_unix,
      icon: weather.icon,
      active: weather.active
    })),
    last_updated: new Date().toISOString()
  };
}

function register(app) {
  app.get("/api/GetWeather", async (req, res) => {
    try {
      console.log("[Weather] Fetching weather data from joshlei.com API...");
      
      const rawWeatherData = await fetchWeatherData();
      const formattedData = formatWeatherData(rawWeatherData);
      
      res.json(formattedData);
      
    } catch (err) {
      console.error("[Weather] Error:", err.message);
      
      // Fallback response jika API gagal (tanpa discord_invite)
      const fallbackData = {
        error: err.message || "Failed to fetch weather data",
        message: "Weather service temporarily unavailable",
        summary: {
          total_weather_types: 0,
          active_weather_count: 0,
          inactive_weather_count: 0
        },
        active_weather: [],
        all_weather: [],
        last_updated: new Date().toISOString(),
        status: "error"
      };
      
      res.status(500).json(fallbackData);
    }
  });

  // Endpoint untuk mendapatkan hanya weather yang aktif (tanpa discord_invite)
  app.get("/api/GetWeather/active", async (req, res) => {
    try {
      console.log("[Weather] Fetching active weather only...");
      
      const rawWeatherData = await fetchWeatherData();
      const activeWeather = rawWeatherData.weather.filter(w => w.active);
      
      const response = {
        active_weather_count: activeWeather.length,
        active_weather: activeWeather.map(weather => ({
          name: weather.weather_name,
          id: weather.weather_id,
          duration: weather.duration,
          start_time: weather.start_duration_unix,
          end_time: weather.end_duration_unix,
          icon: weather.icon
        })),
        last_updated: new Date().toISOString()
      };
      
      res.json(response);
      
    } catch (err) {
      console.error("[Weather] Error fetching active weather:", err.message);
      res.status(500).json({ 
        error: err.message || "Failed to fetch active weather data",
        active_weather: [],
        last_updated: new Date().toISOString()
      });
    }
  });
}

module.exports = { register };
