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
  '"çevre" OR "doğa" OR "ekoloji" OR "sürdürülebilirlik" OR "iklim" OR "çevresel etkiler" OR "karbon ayak izi" OR "yenilenebilir enerji" OR "biyoçeşitlilik" OR "ekosistem" OR "küresel ısınma" OR "iklim değişikliği" OR "çevre koruma" OR "çevre bilinci" OR "çevreci teknoloji" OR "doğal yaşam" OR "yeşil enerji" OR "çevre politikaları" OR "çevre felaketleri" OR "sıcaklık artışı" OR "sera gazları" OR "karbon emisyonu" OR "ormansızlaşma" OR "deniz seviyesinin yükselmesi" OR "buzullar" OR "iklim krizi" OR "karbon nötr" OR "güneş enerjisi" OR "rüzgar enerjisi" OR "hidroelektrik" OR "nükleer enerji" OR "temiz enerji" OR "enerji verimliliği" OR "okyanus kirliliği" OR "plastik atık" OR "mikroplastik" OR "mercan resifleri" OR "deniz canlıları" OR "balıkçılık politikaları" OR "geri dönüşüm" OR "atık yönetimi" OR "sıfır atık" OR "döngüsel ekonomi" OR "kompost" OR "organik tarım" OR "sürdürülebilir tarım" OR "toprak kirliliği" OR "pestisitler" OR "gıda israfı" OR "nesli tükenen türler"';

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

app.listen(PORT, () => {
  console.log(`GreenLink sunucusu ${PORT} portunda çalışıyor`);
});
