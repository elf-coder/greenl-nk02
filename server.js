require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Statik dosyalar (public klasörü)
app.use(express.static(path.join(__dirname, "public")));


// ---------------------------------------------------------
//  HABER API (NewsAPI Proxy)
// ---------------------------------------------------------
app.get("/api/news", async (req, res) => {
  try {
    const apiKey = process.env.NEWS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "NEWS_API_KEY tanımlı değil" });

    const q =
      req.query.q ||
      '"çevre" OR "doğa" OR "ekoloji" OR "sürdürülebilirlik" OR "iklim" OR "çevresel etkiler" OR "karbon ayak izi" OR "yenilenebilir enerji" OR "biyoçeşitlilik" OR "ekosistem" OR "küresel ısınma" OR "iklim değişikliği" OR "çevre koruma" OR "çevre bilinci" OR "doğal yaşam" OR "yeşil enerji" OR "çevre politikaları" OR "çevre felaketleri" OR "sıcaklık artışı" OR "sera gazları" OR "karbon emisyonu" OR "yangın" OR "buzullar" OR "iklim krizi"';

    const url = new URL("https://newsapi.org/v2/everything");
    url.searchParams.set("q", q);
    url.searchParams.set("language", "tr");
    url.searchParams.set("sortBy", "publishedAt");
    url.searchParams.set("pageSize", "20");

    const response = await fetch(url, {
      headers: { "X-Api-Key": apiKey },
    });

    if (!response.ok)
      return res.status(500).json({ error: "Haber API isteği başarısız", status: response.status });

    const data = await response.json();
    if (!data.articles) return res.status(500).json({ error: "Haber API geçersiz yanıt döndürdü" });

    // Kara liste
    const blacklist = [
      "bitcoin","kripto","btc","borsa","dolar","transfer","gol","spor","araba","futbol","siyaset",
      "suç","cinayet","ekonomi","yatırım","banka","enflasyon","mahkeme"
    ];

    data.articles = data.articles.filter(a => {
      const t = (a.title + " " + a.description).toLowerCase();
      return !blacklist.some(b => t.includes(b));
    });

    res.json(data);
  } catch (err) {
    console.error("Haber API hatası:", err);
    res.status(500).json({ error: "Haber API hata verdi" });
  }
});


// ---------------------------------------------------------
//  GERİ DÖNÜŞÜM — Google Places
// ---------------------------------------------------------
app.get("/api/recycling-points", async (req, res) => {
  try {
    const city = req.query.city;
    if (!city) return res.status(400).json({ error: "city parametresi gerekli" });

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey)
      return res.status(500).json({ error: "GOOGLE_MAPS_API_KEY tanımlı değil" });

    const query = encodeURIComponent(`recycling point in ${city} Turkey`);
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&language=tr&key=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== "OK") {
      return res.status(500).json({
        error: `Google Places hatası: ${data.status}`,
        points: [],
        status: data.status,
      });
    }

    const points = data.results.map(place => ({
      name: place.name,
      address: place.formatted_address,
      rating: place.rating,
      lat: place.geometry?.location?.lat,
      lng: place.geometry?.location?.lng,
      place_id: place.place_id,
    }));

    res.json({ points, status: "OK" });
  } catch (err) {
    console.error("Places API hatası:", err);
    res.status(500).json({ error: "Google Places API hatası" });
  }
});


// ---------------------------------------------------------
//  TÜRKİYE ETKİNLİK AGGREGATOR
//  Eventbrite + İstanbul(İBB) + Ankara(ABB) + İzmir(İZBB)
//  *** Meetup tamamen kaldırıldı ***
// ---------------------------------------------------------
app.get("/api/events", async (req, res) => {
  const city = (req.query.city || "").toLowerCase();
  if (!city) return res.status(400).json({ error: "city parametresi gerekli" });

  const results = [];

  try {
    // EVENTBRITE
    const EB_TOKEN = process.env.EVENTBRITE_TOKEN;
    if (EB_TOKEN) {
      const url =
        `https://www.eventbriteapi.com/v3/events/search/` +
        `?q=environment&location.address=${encodeURIComponent(city)}`;

      const ebResp = await fetch(url, {
        headers: { Authorization: `Bearer ${EB_TOKEN}` },
      });
      const ebJson = await ebResp.json();

      if (ebJson.events) {
        ebJson.events.forEach(ev =>
          results.push({
            source: "eventbrite",
            title: ev.name?.text,
            desc: ev.description?.text,
            when: ev.start?.local,
            org: ev.organization_id,
            url: ev.url,
          })
        );
      }
    }

    // İBB — İstanbul
    if (city === "istanbul") {
      const ibbURL =
        "https://data.ibb.gov.tr/api/3/action/datastore_search?resource_id=adf7f776-cedd-4b96-878f-4a8f564c64b9";

      const r = await fetch(ibbURL);
      const j = await r.json();

      if (j?.result?.records) {
        j.result.records.forEach(ev =>
          results.push({
            source: "ibb",
            title: ev.etkinlik_adi,
            desc: ev.aciklama,
            when: ev.etkinlik_tarihi,
            org: ev.organizasyon || "İBB",
            url: ev.link,
          })
        );
      }
    }

    // ABB — Ankara
    if (city === "ankara") {
      const abbURL =
        "https://acikveri.ankara.bel.tr/api/3/action/datastore_search?resource_id=8b920a81-9c35-4090-be4e-94a3e3fad100";

      const r = await fetch(abbURL);
      const j = await r.json();

      if (j?.result?.records) {
        j.result.records.forEach(ev =>
          results.push({
            source: "abb",
            title: ev.EtkinlikAdi,
            desc: ev.EtkinlikAciklamasi,
            when: ev.EtkinlikBaslangicTarihi,
            org: ev.Duzenleyen,
            url: ev.Link,
          })
        );
      }
    }

    // İZBB — İzmir
    if (city === "izmir") {
      const izURL = "https://acikveri.bizizmir.com/api/data/etkinlik";

      const r = await fetch(izURL);
      const j = await r.json();

      if (Array.isArray(j)) {
        j.forEach(ev =>
          results.push({
            source: "izmir",
            title: ev.etkinlikAdi,
            desc: ev.detay,
            when: ev.baslangicTarihi,
            org: ev.duzenleyen,
            url: ev.kaynak,
          })
        );
      }
    }

    res.json({ events: results });
  } catch (err) {
    console.error("Etkinlik API hatası:", err);
    res.status(500).json({ error: "API birleştirme hatası" });
  }
});


// ---------------------------------------------------------
app.listen(PORT, () => {
  console.log(`GreenLink sunucusu ${PORT} portunda çalışıyor`);
});
