// behav.js
//OpenWeatherMap API key
const API_KEY = "YOUR_OPENWEATHERMAP_API_KEY"; // https://openweathermap.org/current

// State
let state = {
  baseTempC: null, // store in Celsius, convert to F for toggle
  unitIsF: false,
  timezoneOffsetSec: 0,
  themeDark: false,
  clockTimer: null
};

// DOM
const els = {
  background: document.getElementById("background"),
  themeToggle: document.getElementById("themeToggle"),
  unitToggle: document.getElementById("unitToggle"),
  localTime: document.getElementById("localTime"),
  form: document.getElementById("searchForm"),
  input: document.getElementById("cityInput"),
  locBtn: document.getElementById("locBtn"),
  card: document.getElementById("weatherCard"),
  cityName: document.getElementById("cityName"),
  icon: document.getElementById("conditionIcon"),
  temp: document.getElementById("temperature"),
  tempUnit: document.getElementById("tempUnit"),
  humidity: document.getElementById("humidity"),
  conditionText: document.getElementById("conditionText"),
  errorMsg: document.getElementById("errorMsg")
};

// Init
init();

function init() {
  // Restore theme + unit from localStorage
  state.themeDark = localStorage.getItem("themeDark") === "1";
  document.body.classList.toggle("dark", state.themeDark);
  els.themeToggle.checked = state.themeDark;

  state.unitIsF = localStorage.getItem("unitIsF") === "1";
  els.unitToggle.checked = state.unitIsF;
  els.tempUnit.textContent = state.unitIsF ? "°F" : "°C";

  // Events
  els.form.addEventListener("submit", onSearch);
  els.locBtn.addEventListener("click", useGeolocation);
  els.themeToggle.addEventListener("change", onThemeToggle);
  els.unitToggle.addEventListener("change", onUnitToggle);
  window.addEventListener("scroll", onParallaxScroll, { passive: true });
  window.addEventListener("deviceorientation", onTilt, { passive: true });

  // Try geolocation on load, fallback to Karachi for first render
  useGeolocation().catch(() => fetchByCity("Karachi"));
}

function onThemeToggle(e) {
  state.themeDark = e.target.checked;
  document.body.classList.toggle("dark", state.themeDark);
  localStorage.setItem("themeDark", state.themeDark ? "1" : "0");
}

function onUnitToggle(e) {
  state.unitIsF = e.target.checked;
  localStorage.setItem("unitIsF", state.unitIsF ? "1" : "0");
  renderTemperature();
}

async function onSearch(e) {
  e.preventDefault();
  const q = els.input.value.trim();
  if (!q) return;
  await fetchByCity(q);
}

function useGeolocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude, longitude } = pos.coords;
        await fetchByCoords(latitude, longitude);
        resolve();
      },
      err => {
        showError("Location permission denied. You can search by city name.");
        reject(err);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  });
}

// Fetch helpers
async function fetchByCity(city) {
  return fetchWeather(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`);
}
async function fetchByCoords(lat, lon) {
  return fetchWeather(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`);
}

async function fetchWeather(url) {
  try {
    toggleError(false);
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 404) throw new Error("City not found. Try another name.");
      throw new Error("Failed to fetch weather. Please try again.");
    }
    const data = await res.json();
    updateUI(data);
  } catch (err) {
    showError(err.message || "Something went wrong.");
  }
}

function updateUI(data) {
  // Extract
  const name = `${data.name || ""}${data.sys?.country ? ", " + data.sys.country : ""}`;
  const humidity = data.main?.humidity ?? null;
  const condition = data.weather?.[0]?.main || "Clear";
  const description = data.weather?.[0]?.description || condition;
  const tempC = data.main?.temp ?? null;
  const isDay = (data.sys?.sunrise && data.sys?.sunset)
    ? isDaytime(data.sys.sunrise, data.sys.sunset, data.timezone)
    : true;
  const tz = data.timezone ?? 0;

  // Save state
  state.baseTempC = tempC;
  state.timezoneOffsetSec = tz;

  // Text
  els.cityName.textContent = name || "—";
  els.humidity.textContent = humidity != null ? String(humidity) : "—";
  els.conditionText.textContent = capitalize(description);

  // Icon
  els.icon.textContent = getIcon(condition, isDay);

  // Temperature
  renderTemperature();

  // Background with fade
  const bgUrl = pickBackground(condition, isDay);
  crossfadeBackground(bgUrl);

  // Card animation pulse
  pulseCard();

  // Start clock for city time
  startClock(tz);
}

function renderTemperature() {
  if (state.baseTempC == null) {
    els.temperature.textContent = "—";
    els.tempUnit.textContent = state.unitIsF ? "°F" : "°C";
    return;
  }
  const val = state.unitIsF ? (state.baseTempC * 9/5 + 32) : state.baseTempC;
  els.temperature.textContent = Math.round(val);
  els.tempUnit.textContent = state.unitIsF ? "°F" : "°C";
}

function isDaytime(sunriseSec, sunsetSec, tz) {
  // Convert current UTC to city local epoch
  const utcNow = Date.now() + (new Date().getTimezoneOffset() * 60000);
  const cityNow = utcNow + tz * 1000;
  return cityNow >= sunriseSec * 1000 && cityNow < sunsetSec * 1000;
}

function startClock(timezoneOffsetSec) {
  if (state.clockTimer) clearInterval(state.clockTimer);

  const tick = () => {
    const utc = Date.now() + (new Date().getTimezoneOffset() * 60000);
    const city = new Date(utc + timezoneOffsetSec * 1000);
    const hh = String(city.getHours()).padStart(2, "0");
    const mm = String(city.getMinutes()).padStart(2, "0");
    els.localTime.textContent = `${hh}:${mm}`;
  };
  tick();
  state.clockTimer = setInterval(tick, 60 * 1000);
}

function showError(msg) {
  els.cityName.textContent = "—";
  els.temperature.textContent = "—";
  els.humidity.textContent = "—";
  els.conditionText.textContent = "—";
  els.icon.textContent = "⚠️";
  toggleError(true, msg);
}
function toggleError(show, msg = "") {
  els.errorMsg.hidden = !show;
  els.errorMsg.textContent = show ? msg : "";
}

// Icon mapping
function getIcon(main, isDay) {
  const m = (main || "").toLowerCase();
  if (m.includes("thunder")) return "⛈️";
  if (m.includes("drizzle")) return "🌦️";
  if (m.includes("rain")) return "🌧️";
  if (m.includes("snow")) return "🌨️";
  if (m.includes("mist") || m.includes("fog")) return "🌫️";
  if (m.includes("sun")) return "☀️";
  if (m.includes("haze") || m.includes("smoke") || m.includes("dust")) return "🌁";
  if (m.includes("cloud")) return "☁️";
  return isDay ? "☀️" : "🌙";
}

// Background selection
function pickBackground(main, isDay) {
  const m = (main || "").toLowerCase();
  if (m.includes("thunder")) return "assets/backgrs/thunderstorm.png";
  if (m.includes("drizzle") || m.includes("rain")) return "assets/backgrs/rainy.png";
  if (m.includes("snow")) return "assets/backgrs/snowy";
  if (m.includes("mist") || m.includes("fog")) return "assets/backgrs/foggy.png";
  if (m.includes("sun")) return "assets/backgrs/sunny.png";
  if (m.includes("haze") || m.includes("smoke") || m.includes("dust")) return "assets/backgrs/hazy.png";
  if (m.includes("cloud")) return "assets/backgrs/cloudy.png";
  return isDay ? "assets/backgrs/clearDay.png" : "assets/backgrs/clearNight.png";
}

// Cross-fade background layers
function crossfadeBackground(url) {
  const layer = document.createElement("div");
  layer.className = "bg-layer";
  layer.style.backgroundImage = `url("${url}")`;
  // Parallax seed
  layer.style.transform = `translateY(${window.scrollY * -0.06}px)`;
  els.background.appendChild(layer);

  // Wait for image to decode before showing
  const img = new Image();
  img.src = url;
  img.decode?.().then(show).catch(show);
  function show() {
    requestAnimationFrame(() => {
      layer.classList.add("show");
      // Remove older layers after fade
      const previous = els.background.querySelectorAll(".bg-layer");
      if (previous.length > 2) {
        previous[0].addEventListener("transitionend", () => previous[0].remove(), { once: true });
        previous[0].classList.remove("show");
      }
    });
  }
}

// Pulse overlay on weather change
function pulseCard() {
  els.card.classList.remove("pulse");
  // force reflow to restart animation
  void els.card.offsetWidth;
  els.card.classList.add("pulse");
  // optional clean-up
  setTimeout(() => els.card.classList.remove("pulse"), 2000);
}

// Parallax: subtle background + card shift
function onParallaxScroll() {
  const y = window.scrollY || 0;
  // Move background slower
  els.background.querySelectorAll(".bg-layer.show").forEach(layer => {
    layer.style.transform = `translateY(${y * -0.06}px)`;
  });
  // Lift card slightly
  els.card.style.transform = `translateY(${y * -0.02}px)`;
}

// Tilt: gentle 3D lean
function onTilt(e) {
  if (e.beta == null || e.gamma == null) return;
  const maxTilt = 8; // degrees
  const x = clamp(e.gamma / 45 * maxTilt, -maxTilt, maxTilt);
  const y = clamp(e.beta / 45 * maxTilt, -maxTilt, maxTilt);
  els.card.style.transform = `rotateY(${x}deg) rotateX(${y * -1}deg)`;
  // Also offset the top background layer a touch
  const topLayer = els.background.querySelector(".bg-layer.show:last-of-type");
  if (topLayer) {
    topLayer.style.transform = `translate(${x * -2}px, ${y * -2}px)`;
  }
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function capitalize(s = "") { return s.charAt(0).toUpperCase() + s.slice(1); }