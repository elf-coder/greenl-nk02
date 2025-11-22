require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Statik dosyalar (public klasörü)
app.use(express.static(path.join(__dirname, "public")));

// Çevre haberleri için NewsAPI proxy
app.get("/api/news", async (req, res) => {
  try {
    const apiKey = process.env.NEWS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "NEWS_API_KEY tanımlı değil" });
    }

    // URL'den q parametresi gelirse onu kullan, yoksa çevre odaklı varsayılan arama
    const q =
  req.query.q ||
  '"çevre" OR "doğa" OR "ekoloji" OR "sürdürülebilirlik" OR "iklim" OR "çevresel etkiler" OR "karbon ayak izi" OR "yenilenebilir enerji" OR "biyoçeşitlilik" OR "ekosistem" OR "küresel ısınma" OR "iklim değişikliği" OR "çevre koruma" OR "çevre bilinci" OR "doğal yaşam" OR "yeşil enerji" OR "çevre politikaları" OR "çevre felaketleri" OR "sıcaklık artışı" OR "sera gazları" OR "karbon emisyonu" OR "yangın" OR "buzullar" OR "iklim krizi"';

    const url = new URL("https://newsapi.org/v2/everything");
    url.searchParams.set("q", q);
    url.searchParams.set("language", "tr");      // Türkçe haberler
    url.searchParams.set("sortBy", "publishedAt");
    url.searchParams.set("pageSize", "20");

    const response = await fetch(url, {
      headers: {
        "X-Api-Key": apiKey,
      },
    });

    if (!response.ok) {
      console.error("NewsAPI HTTP hata kodu:", response.status);
      return res
        .status(500)
        .json({ error: "Haber API isteği başarısız oldu", status: response.status });
    }

    const data = await response.json();

    if (!data || !Array.isArray(data.articles)) {
      console.error("Beklenmeyen NewsAPI yanıtı:", data);
      return res
        .status(500)
        .json({ error: "Haber API beklenmeyen yanıt döndürdü" });
    }

    // ---- Ekstra Filtre: BTC, finans, siyaset vb. haberleri temizle ----
    const blacklist = [
      "bitcoin",
      "kripto",
      "btc",
      "borsa",
      "hisse",
      "dolar",
      "deplasman",
      "transfer",
      "iha",
      "siha",
      "gol",
      "a milli",
      "akıncı",
      "dizi",
      "film",
      "spor",
      "otomotiv",
      "araba",
      "futbol",
      "basketbol",
      "transfer",
      "maç",
      "cumhurbaşkanı",
      "finans",
      "para",
      "öldürdü",
      "yaraladı",
      "suç",
      "cinayet",
      "soygun",
      "saldırı",
      "katil",
      "trafik",
      "felsefe",
      "hukuk",
      "kitap",
      "mahkeme",
      "tutuklandı",
      "serbest bırakıldı",
      "döviz",
      "ekonomi",
      "yatırım",
      "antrenman",
      "estetik",
      "banka",
      "parti",
      "altın",
      "euro",
      "faiz",
      "enflasyon",
      "siyaset",
      "milletvekili",
      "bakan",
      "meclis",
      "parti",
      "seçim",
    ];

    data.articles = data.articles.filter((a) => {
      const t = ((a.title || "") + " " + (a.description || "")).toLowerCase();
      return !blacklist.some((bad) => t.includes(bad));
    });

    // İstersen sadece filtered articles dönebilirsin, ama front-end zaten json.articles bekliyor
    return res.json(data);
  } catch (err) {
    console.error("Haber API hatası:", err);
    res.status(500).json({ error: "Haber API isteği hata verdi" });
  }
});

// Sağlık kontrolü (Render health check)
app.get("/api/status", (req, res) => {
  res.json({ ok: true, name: "GreenLink", version: "1.0.0" });
});

// ŞEHRE GÖRE GERİ DÖNÜŞÜM NOKTALARI ENDPOINTİ
app.get('/api/recycling-points', async (req, res) => {
  try {
    const city = req.query.city;
    if (!city) {
      return res.status(400).json({ error: 'city parametresi gerekli' });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    const query = encodeURIComponent(`geri dönüşüm noktası ${city}`);
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&language=tr&key=${apiKey}`;

    const response = await fetch(url);       // Node 18+’da global fetch var
    const data = await response.json();

    // Kullanıcıya sade bir liste döndürelim
    const points = (data.results || []).map(place => ({
      name: place.name,
      address: place.formatted_address,
      rating: place.rating,
      lat: place.geometry?.location?.lat,
      lng: place.geometry?.location?.lng,
      place_id: place.place_id
    }));

    res.json({ points });
  } catch (err) {
    console.error('Places API hata:', err);
    res.status(500).json({ error: 'Google Places API hatası' });
  }
});

// En altta zaten vardır, sadece kontrol et:


app.listen(PORT, () => {
  console.log(`GreenLink sunucusu ${PORT} portunda çalışıyor`);
});
