const express = require("express");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000;

// Statik dosyalar
app.use(express.static(path.join(__dirname, "public")));

// Basit örnek API uçları (ileride gerçek API ile değiştirilebilir)
app.get("/api/news", (req, res) => {
  // Şimdilik front-end içinde hazır JSON var, burayı daha sonra gerçek API'ye bağlayabilirsin.
  res.json({ message: "Haber verisini front-end içindeki sampleNews'ten alıyorsun. Burayı gerçek API ile değiştirebilirsin." });
});

app.get("/api/status", (req, res) => {
  res.json({ ok: true, name: "GreenLink", version: "1.0.0" });
});

app.listen(PORT, () => {
  console.log(`GreenLink sunucusu ${PORT} portunda çalışıyor`);
});
