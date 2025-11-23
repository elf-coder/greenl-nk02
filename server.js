require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const fsPromises = require("fs/promises");

const app = express();
const PORT = process.env.PORT || 3000;

// ----------------- DATA DOSYALARI -----------------
const DATA_DIR = path.join(__dirname, "data");
const EVENT_REQUESTS_FILE = path.join(DATA_DIR, "event_requests.json");
const EVENT_VOTES_FILE = path.join(DATA_DIR, "event_votes.json");

// data klasörü yoksa oluştur
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// JSON helper fonksiyonları
async function readJsonSafe(filePath, defaultValue) {
  try {
    const data = await fsPromises.readFile(filePath, "utf8");
    return JSON.parse(data);
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error("JSON okuma hatası:", filePath, err.message);
    }
    return defaultValue;
  }
}

async function writeJsonSafe(filePath, value) {
  try {
    await fsPromises.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
  } catch (err) {
    console.error("JSON yazma hatası:", filePath, err.message);
  }
}

// ----------------- MIDDLEWARE -----------------
app.use(express.json()); // JSON gövdeleri için
// Statik dosyalar (public klasörü)
app.use(express.static(path.join(__dirname, "public")));

// ---------------------------------------------------------
//  GÖNÜLLÜ FORMU: /api/event-request
//  (gonullu.html'deki form buraya POST atacak)
// ---------------------------------------------------------
app.post("/api/event-request", async (req, res) => {
  try {
    const body = req.body || {};

    const entry = {
      id: Date.now().toString(36),
      receivedAt: new Date().toISOString(),
      name: body.name || "",
      email: body.email || "",
      city: body.city || "",
      type: body.type || "",
      date: body.date || "",
      people: body.people || null,
      message: body.message || "",
      motivation: Array.isArray(body.motivation) ? body.motivation : [],
    };

    const list = await readJsonSafe(EVENT_REQUESTS_FILE, []);
    list.push(entry);
    await writeJsonSafe(EVENT_REQUESTS_FILE, list);

    return res.json({ ok: true });
  } catch (err) {
    console.error("Etkinlik talebi kaydedilirken hata:", err);
    return res.status(500).json({ error: "Etkinlik talebi kaydedilemedi" });
  }
});

// ---------------------------------------------------------
//  GÖNÜLLÜ ETKİNLİK ANKETİ: /api/event-polls & /api/event-vote
// ---------------------------------------------------------

// Sabit etkinlik listesi (gönüllü sayfasında görünenler)
const PLANNED_EVENTS = [
  {
    id: "evt-1",
    title: "Kadıköy Sahil Temizliği",
    city: "İstanbul",
    date: "14 Aralık 2025 – 10.00",
    type: "Sahil Temizliği",
    description:
      "Eldiven ve çöp poşetlerini biz getiriyoruz. Sen sadece kendini ve enerjini getir.",
  },
  {
    id: "evt-2",
    title: "Şehirde Atıksız Yaşam Atölyesi",
    city: "Ankara",
    date: "21 Aralık 2025 – 14.00",
    type: "Atölye / Eğitim",
    description:
      "Evde, okulda ve işte atıksız yaşam pratikleri. Katılımcılara küçük bir rehber pdf gönderilecek.",
  },
  {
    id: "evt-3",
    title: "Deniz Kirliliği Farkındalık Yürüyüşü",
    city: "İzmir",
    date: "28 Aralık 2025 – 16.00",
    type: "Farkındalık Kampanyası",
    description:
      "Kısa bir yürüyüş ve basın açıklaması. Pankartlar için geri dönüştürülmüş karton kullanılacak.",
  },
];

// Etkinlik + mevcut oyları döndürür
app.get("/api/event-polls", async (req, res) => {
  try {
    const votes = await readJsonSafe(EVENT_VOTES_FILE, {});

    const eventsWithVotes = PLANNED_EVENTS.map((ev) => {
      const v = votes[ev.id] || { yes: 0, no: 0 };
      return {
        ...ev,
        yes: v.yes || 0,
        no: v.no || 0,
      };
    });

    return res.json({ events: eventsWithVotes });
  } catch (err) {
    console.error("Event polls okunamadı:", err);
    return res.status(500).json({ error: "Etkinlik anketi okunamadı" });
  }
});

// Oy kaydı
app.post("/api/event-vote", async (req, res) => {
  try {
    const { id, choice, previousChoice } = req.body || {};

    if (!id || !["yes", "no"].includes(choice)) {
      return res.status(400).json({ error: "Geçersiz istek" });
    }

    const votes = await readJsonSafe(EVENT_VOTES_FILE, {});
    const current = votes[id] || { yes: 0, no: 0 };

    // Eski oyu geri al (aynı cihazdan tercih değiştiyse)
    if (previousChoice === "yes") {
      current.yes = Math.max(0, current.yes - 1);
    } else if (previousChoice === "no") {
      current.no = Math.max(0, current.no - 1);
    }

    // Yeni oyu ekle
    if (choice === "yes") current.yes += 1;
    if (choice === "no") current.no += 1;

    votes[id] = current;
    await writeJsonSafe(EVENT_VOTES_FILE, votes);

    return res.json({ ok: true, id, votes: current });
  } catch (err) {
    console.error("Oy kaydedilirken hata:", err);
    return res.status(500).json({ error: "Oy kaydedilemedi" });
  }
});

// ---------------------------------------------------------
//  HABER API (NewsAPI Proxy) — SENİN MEVCUT KODUN
// ---------------------------------------------------------
app.get("/api/news", async (req, res) => {
  try {
    const apiKey = process.env.NEWS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "NEWS_API_KEY tanımlı değil" });
    }

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

    if (!response.ok) {
      console.error("NewsAPI HTTP hata kodu:", response.status);
      return res
        .status(500)
        .json({ error: "Haber API isteği başarısız", status: response.status });
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.articles)) {
      return res
        .status(500)
        .json({ error: "Haber API geçersiz yanıt döndürdü" });
    }

    const blacklist = [
      "bitcoin",
      "kripto",
      "btc",
      "borsa",
      "dolar",
      "transfer",
      "gol",
      "spor",
      "araba",
      "futbol",
      "siyaset",
      "suç",
      "cinayet",
      "ekonomi",
      "yatırım",
      "banka",
      "enflasyon",
      "mahkeme",
    ];

    data.articles = data.articles.filter((a) => {
      const t = ((a.title || "") + " " + (a.description || "")).toLowerCase();
      return !blacklist.some((b) => t.includes(b));
    });

    res.json(data);
  } catch (err) {
    console.error("Haber API hatası:", err);
    res.status(500).json({ error: "Haber API hata verdi" });
  }
});

// Basit health check (Render için)
app.get("/api/status", (req, res) => {
  res.json({ ok: true, name: "GreenLink", version: "1.0.0" });
});

// ---------------------------------------------------------
//  GERİ DÖNÜŞÜM — Google Places
// ---------------------------------------------------------
app.get("/api/recycling-points", async (req, res) => {
  try {
    const city = req.query.city;
    if (!city) {
      return res.status(400).json({ error: "city parametresi gerekli" });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return res
        .status(500)
        .json({ error: "GOOGLE_MAPS_API_KEY tanımlı değil" });
    }

    const query = encodeURIComponent(`recycling point in ${city} Turkey`);
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&language=tr&key=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    console.log("Google Places cevabı:", data.status);

    if (data.status !== "OK") {
      return res.status(500).json({
        error: `Google Places hatası: ${data.status}`,
        status: data.status,
        message: data.error_message || null,
        points: [],
      });
    }

    const points = (data.results || []).map((place) => ({
      name: place.name,
      address: place.formatted_address,
      rating: place.rating,
      lat: place.geometry?.location?.lat,
      lng: place.geometry?.location?.lng,
      place_id: place.place_id,
    }));

    res.json({ points, status: data.status });
  } catch (err) {
    console.error("Places API hatası:", err);
    res.status(500).json({ error: "Google Places API hatası" });
  }
});

// ---------------------------------------------------------
//  TÜRKİYE ETKİNLİK AGGREGATOR
// ---------------------------------------------------------
app.get("/api/events", async (req, res) => {
  const city = (req.query.city || "").toLowerCase();
  const results = [];

  if (!city) {
    return res.status(400).json({ error: "city parametresi gerekli" });
  }

  try {
    const EB_TOKEN = process.env.EVENTBRITE_TOKEN;
    if (EB_TOKEN) {
      try {
        const ebUrl = `https://www.eventbriteapi.com/v3/events/search/?q=environment&location.address=${encodeURIComponent(
          city
        )}`;

        const ebResp = await fetch(ebUrl, {
          headers: { Authorization: `Bearer ${EB_TOKEN}` },
        });

        if (!ebResp.ok) {
          console.warn("Eventbrite HTTP hatası:", ebResp.status);
        } else {
          const ebJson = await ebResp.json();
          if (ebJson.events) {
            ebJson.events.forEach((e) =>
              results.push({
                source: "eventbrite",
                title: e.name?.text,
                desc: e.description?.text || "",
                when: e.start?.local || "",
                org: e.organization_id,
                url: e.url,
              })
            );
          }
        }
      } catch (err) {
        console.warn("Eventbrite isteği hata verdi:", err.message);
      }
    }

    if (city === "istanbul") {
      try {
        const ibbURL =
          "https://data.ibb.gov.tr/api/3/action/datastore_search?resource_id=adf7f776-cedd-4b96-878f-4a8f564c64b9";
        const ibbResp = await fetch(ibbURL);

        if (!ibbResp.ok) {
          console.warn("İBB HTTP hatası:", ibbResp.status);
        } else {
          const ibbJson = await ibbResp.json();
          if (ibbJson?.result?.records) {
            ibbJson.result.records.forEach((ev) =>
              results.push({
                source: "ibb",
                title: ev.etkinlik_adi,
                desc: ev.aciklama || "",
                when: ev.etkinlik_tarihi,
                org: ev.organizasyon || "İBB",
                url: ev.link || "",
              })
            );
          }
        }
      } catch (err) {
        console.warn("İBB isteği hata verdi:", err.message);
      }
    }

    if (city === "ankara") {
      try {
        const abbURL =
          "https://acikveri.ankara.bel.tr/api/3/action/datastore_search?resource_id=8b920a81-9c35-4090-be4e-94a3e3fad100";
        const abbResp = await fetch(abbURL);

        if (!abbResp.ok) {
          console.warn("ABB HTTP hatası:", abbResp.status);
        } else {
          const abbJson = await abbResp.json();
          if (abbJson?.result?.records) {
            abbJson.result.records.forEach((ev) =>
              results.push({
                source: "abb",
                title: ev.EtkinlikAdi,
                desc: ev.EtkinlikAciklamasi,
                when: ev.EtkinlikBaslangicTarihi,
                org: ev.Duzenleyen || "Ankara Büyükşehir",
                url: ev.Link || "",
              })
            );
          }
        }
      } catch (err) {
        console.warn("ABB isteği hata verdi:", err.message);
      }
    }

    if (city === "izmir") {
      try {
        const izmirURL = "https://acikveri.bizizmir.com/api/data/etkinlik";
        const izResp = await fetch(izmirURL);

        if (!izResp.ok) {
          console.warn("İzmir HTTP hatası:", izResp.status);
        } else {
          const izJson = await izResp.json();
          if (Array.isArray(izJson)) {
            izJson.forEach((ev) =>
              results.push({
                source: "izmir",
                title: ev.etkinlikAdi,
                desc: ev.detay || "",
                when: ev.baslangicTarihi,
                org: ev.duzenleyen || "İzmir Büyükşehir",
                url: ev.kaynak || "",
              })
            );
          }
        }
      } catch (err) {
        console.warn("İzmir isteği hata verdi:", err.message);
      }
    }

    return res.json({ events: results });
  } catch (err) {
    console.error("Etkinlik API genel hatası:", err);
    return res.status(500).json({ error: "API birleştirme hatası" });
  }
});

// ---------------------------------------------------------
//  SERVER START
// ---------------------------------------------------------
app.listen(PORT, () => {
  console.log(`GreenLink sunucusu ${PORT} portunda çalışıyor`);
});
