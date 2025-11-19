require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Statik dosyalar
app.use(express.static(path.join(__dirname, "public")));

// Çevre haberleri için NewsAPI proxy
app.get("/api/news", async (req, res) => {
  try {
    const apiKey = process.env.NEWS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "NEWS_API_KEY tanımlı değil" });
    }

    // İstersen URL'den q parametresi ile özel arama gönderebilirsin
    const q =
      req.query.q ||
      'iklim OR çevre OR "çevre kirliliği" OR geri dönüşüm OR ekoloji';

    const url = new URL("https://newsapi.org/v2/everything");
    url.searchParams.set("q", q);
    url.searchParams.set("language", "tr");     // Türkçe haberler
    url.searchParams.set("sortBy", "publishedAt");
    url.searchParams.set("pageSize", "20");

    const response = await fetch(url, {
      headers: {
        "X-Api-Key": apiKey,
      },
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Haber API hatası:", err);
    res.status(500).json({ error: "Haber API isteği hata verdi" });
  }
});

// Sağlık kontrolü (aynı kalsın)
app.get("/api/status", (req, res) => {
  res.json({ ok: true, name: "GreenLink", version: "1.0.0" });
});

app.listen(PORT, () => {
  console.log(`GreenLink sunucusu ${PORT} portunda çalışıyor`);
});
