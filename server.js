require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- JSON dosyaları için ayarlar ----------
const DATA_DIR = path.join(__dirname, "data");
const EVENT_REQUESTS_FILE = path.join(DATA_DIR, "event-requests.json");
const EVENT_VOTES_FILE = path.join(DATA_DIR, "event-votes.json");

// data klasörünü ve json dosyalarını hazırla
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

function ensureFile(filePath, defaultValue) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), "utf8");
  }
}

ensureFile(EVENT_REQUESTS_FILE, { requests: [] });
ensureFile(EVENT_VOTES_FILE, { votes: {} });

function readJson(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    console.error("JSON okuma hatası:", filePath, e.message);
    return fallback;
  }
}

function writeJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.error("JSON yazma hatası:", filePath, e.message);
  }
}

// ---------- MIDDLEWARE ----------
app.use(express.json()); // body'deki JSON'u parse et
app.use(express.static(path.join(__dirname, "public"))); // public klasörünü servis et

// ---------------------------------------------------------
//  HABER API (NewsAPI Proxy)
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

// Basit health check
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
    // 1) EVENTBRITE (opsiyonel)
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

    // 2) İBB (İstanbul)
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

    // 3) ABB (Ankara)
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

    // 4) İZBB (İzmir)
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
//  YARDIMCI: Etkinlik türünü label'a çevir
// ---------------------------------------------------------
function mapEventTypeLabel(type) {
  switch (type) {
    case "sahil-temizligi":
      return "Sahil Temizliği";
    case "orman-temizligi":
      return "Orman / Doğa Yürüyüşü & Temizlik";
    case "atolye":
      return "Atölye / Eğitim";
    case "soylesi":
      return "Söyleşi / Panel";
    case "kampanya":
      return "İmza / Farkındalık Kampanyası";
    case "diger":
      return "Diğer";
    default:
      return type || "Etkinlik";
  }
}

// ---------------------------------------------------------
//  ETKİNLİK TALEP FORMU  (/api/event-request)
//  -> Gönüllü sayfasındaki form bu endpoint'e POST atıyor
//  -> data/event-requests.json içine kaydediyoruz
// ---------------------------------------------------------
app.post("/api/event-request", (req, res) => {
  const body = req.body || {};
  const now = new Date().toISOString();

  const record = {
    id: `req-${Date.now()}`,
    name: body.name || "",
    email: body.email || "",
    city: body.city || "",
    type: body.type || "",
    date: body.date || "",
    people: body.people || "",
    message: body.message || "",
    motivation: body.motivation || [], // checkbox'lar
    createdAt: now,
  };

  const data = readJson(EVENT_REQUESTS_FILE, { requests: [] });
  data.requests.push(record);
  writeJson(EVENT_REQUESTS_FILE, data);

  return res.json({ ok: true, saved: record });
});

// ---------------------------------------------------------
//  PLANLANAN ETKİNLİK ANKETİ LİSTESİ  (/api/event-polls)
//  -> Hem statik örnekler + kullanıcı talepleri
//  -> Oy sayıları event-votes.json’dan alınır
// ---------------------------------------------------------

// Statik örnekler (backend tarafında)
const BASE_POLL_EVENTS = [
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

app.get("/api/event-polls", (req, res) => {
  const requestsData = readJson(EVENT_REQUESTS_FILE, { requests: [] });
  const votesData = readJson(EVENT_VOTES_FILE, { votes: {} });
  const votes = votesData.votes || {};

  // Kullanıcı taleplerini de ankete dönüştürelim
  const requestEvents = (requestsData.requests || []).map((r) => {
    const baseTitle =
      (r.message && r.message.trim().split("\n")[0]) ||
      `${r.city || "Şehir"} – ${mapEventTypeLabel(r.type)}`;

    return {
      id: r.id, // vote id'si bu olacak
      title: baseTitle.slice(0, 140),
      city: r.city || "Belirtilmedi",
      date: r.date || "Tarih net değil",
      type: mapEventTypeLabel(r.type),
      description:
        r.message ||
        "Gönüllü tarafından önerilen bir çevre etkinliği. Detaylar için organizatörle iletişime geçilecektir.",
    };
  });

  const allEvents = [...BASE_POLL_EVENTS, ...requestEvents].map((ev) => {
    const v = votes[ev.id] || { yes: 0, no: 0 };
    return {
      ...ev,
      yes: v.yes || 0,
      no: v.no || 0,
    };
  });

  res.json({ events: allEvents });
});

// ---------------------------------------------------------
//  ETKİNLİK ANKET OYLARI (/api/event-votes + /api/event-vote)
//  -> Butonlara tıklanınca burada toplu sayaç tutulur
// ---------------------------------------------------------
app.get("/api/event-votes", (req, res) => {
  const data = readJson(EVENT_VOTES_FILE, { votes: {} });
  res.json(data);
});

app.post("/api/event-vote", (req, res) => {
  const { id, choice, previousChoice } = req.body || {};
  if (!id || !["yes", "no"].includes(choice)) {
    return res.status(400).json({ error: "id ve choice (yes/no) gerekli" });
  }

  const data = readJson(EVENT_VOTES_FILE, { votes: {} });

  if (!data.votes[id]) {
    data.votes[id] = { yes: 0, no: 0 };
  }

  const entry = data.votes[id];

  // Eski tercihi geri al (başka cihazlarda sayıların tutması için)
  if (previousChoice === "yes" && entry.yes > 0) entry.yes -= 1;
  if (previousChoice === "no" && entry.no > 0) entry.no -= 1;

  // Yeni tercihi ekle
  if (choice === "yes") entry.yes += 1;
  if (choice === "no") entry.no += 1;

  writeJson(EVENT_VOTES_FILE, data);
  return res.json({ ok: true, votes: entry });
});

// ---------------------------------------------------------
//  SERVER START
// ---------------------------------------------------------
app.listen(PORT, () => {
  console.log(`GreenLink sunucusu ${PORT} portunda çalışıyor`);
});
