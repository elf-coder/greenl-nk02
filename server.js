// server.js
require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");

const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { body, validationResult } = require("express-validator");

const app = express();
const PORT = process.env.PORT || 10000;

// Proxy (Render vb.) arkasında gerçek IP'yi alabilmek için
app.set("trust proxy", 1);

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

// ---------- GLOBAL MIDDLEWARE ----------

// Body parse
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Güvenlik header'ları
app.use(
  helmet({
    contentSecurityPolicy: false, // CSP'yi kapat
  })
);


// CORS
const allowedOriginsEnv = process.env.ALLOWED_ORIGINS || "";
const allowedOrigins = allowedOriginsEnv
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Postman / curl gibi origin'siz istekleri kabul et
    if (!origin) return callback(null, true);

    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Origin not allowed by CORS"), false);
  },
  credentials: true,
};

app.use(cors(corsOptions));

// Rate limit (15 dk / IP başına 100 istek)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Çok fazla istek gönderildi. Lütfen kısa bir süre sonra tekrar dene.",
  },
});

// Sadece /api altına uygula
app.use("/api", apiLimiter);

// IP allowlist (opsiyonel)
// .env: ALLOWED_IPS=127.0.0.1,::1 gibi
const allowedIpsEnv = process.env.ALLOWED_IPS || "";
const allowedIps = allowedIpsEnv
  .split(",")
  .map((ip) => ip.trim())
  .filter(Boolean);

if (allowedIps.length > 0) {
  app.use((req, res, next) => {
    const forwarded = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    const ip = forwarded || req.ip || req.connection.remoteAddress || "";

    if (allowedIps.includes(ip)) {
      return next();
    }

    return res.status(403).json({
      ok: false,
      error: "Bu IP adresinin bu API'ye erişim izni yok.",
    });
  });
}

// reCAPTCHA doğrulama middleware'i
async function verifyRecaptcha(req, res, next) {
  try {
    const secret = process.env.RECAPTCHA_SECRET_KEY;

    // Development sırasında secret yoksa reCAPTCHA'yı atla
    if (!secret) {
      console.warn("Uyarı: RECAPTCHA_SECRET_KEY tanımlı değil, doğrulama atlanıyor.");
      return next();
    }

    const token = req.body.recaptchaToken;
    if (!token) {
      return res.status(400).json({
        ok: false,
        error: "reCAPTCHA doğrulaması eksik.",
      });
    }

    const params = new URLSearchParams();
    params.append("secret", secret);
    params.append("response", token);

    const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      body: params,
    });

    const data = await response.json();

    if (!data.success || (typeof data.score === "number" && data.score < 0.5)) {
      return res.status(400).json({
        ok: false,
        error: "reCAPTCHA doğrulaması başarısız.",
      });
    }

    next();
  } catch (err) {
    console.error("reCAPTCHA doğrulama hatası:", err);
    res.status(500).json({
      ok: false,
      error: "reCAPTCHA doğrulama hatası.",
    });
  }
}

// Statik dosyalar (sonlara yakın ama API'den önce de olsa olur)
app.use(express.static(path.join(__dirname, "public")));

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
//  GÖNÜLLÜ ANKETİ: BASE EVENTS (backend tarafındaki sabit taslaklar)
// ---------------------------------------------------------
const BASE_PLANNED_EVENTS = [
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

// request.type -> görünür etiket
const TYPE_LABELS = {
  "sahil-temizligi": "Sahil Temizliği",
  "orman-temizligi": "Orman / Doğa Yürüyüşü & Temizlik",
  atolye: "Atölye / Eğitim",
  soylesi: "Söyleşi / Panel",
  kampanya: "İmza / Farkındalık Kampanyası",
  diger: "Önerilen etkinlik",
};

// ---------------------------------------------------------
//  ETKİNLİK TALEP FORMU  (/api/event-request)
// ---------------------------------------------------------
app.post(
  "/api/event-request",
  verifyRecaptcha,
  [
    body("name").optional().isString().isLength({ max: 200 }).trim(),
    body("email").optional().isEmail().normalizeEmail(),
    body("city").optional().isString().isLength({ max: 100 }).trim(),
    body("type").optional().isString().isLength({ max: 100 }).trim(),
    body("date").optional().isString().isLength({ max: 100 }).trim(),
    body("people").optional().isString().isLength({ max: 50 }).trim(),
    body("message").optional().isString().isLength({ max: 2000 }).trim(),
    body("motivation").optional().isArray(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        ok: false,
        error: "Geçersiz alanlar var.",
        details: errors.array(),
      });
    }

    const body = req.body || {};
    const now = new Date().toISOString();

    const record = {
      id: `req-${Date.now()}`, // bu id aynı zamanda ankette de kullanılacak
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
  }
);

// ---------------------------------------------------------
//  ETKİNLİK ANKET OYLARI (/api/event-vote, /api/event-votes)
// ---------------------------------------------------------
app.get("/api/event-votes", (req, res) => {
  const data = readJson(EVENT_VOTES_FILE, { votes: {} });
  res.json(data);
});

// choice: yes/no, previousChoice: yes/no/null
app.post(
  "/api/event-vote",
  verifyRecaptcha,
  [
    body("id").isString().isLength({ max: 100 }),
    body("choice").isIn(["yes", "no"]),
    body("previousChoice")
      .optional({ nullable: true })
      .isIn(["yes", "no", null]),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        ok: false,
        error: "Geçersiz oy verisi.",
        details: errors.array(),
      });
    }

    const { id, choice, previousChoice } = req.body || {};
    if (!id || !["yes", "no"].includes(choice)) {
      return res.status(400).json({ error: "id ve choice (yes/no) gerekli" });
    }

    const data = readJson(EVENT_VOTES_FILE, { votes: {} });

    if (!data.votes[id]) {
      data.votes[id] = { yes: 0, no: 0 };
    }

    // Önce eski oyu geri al
    if (previousChoice === "yes") {
      data.votes[id].yes = Math.max(0, data.votes[id].yes - 1);
    }
    if (previousChoice === "no") {
      data.votes[id].no = Math.max(0, data.votes[id].no - 1);
    }

    // Sonra yeni oyu ekle
    if (choice === "yes") data.votes[id].yes += 1;
    if (choice === "no") data.votes[id].no += 1;

    writeJson(EVENT_VOTES_FILE, data);
    return res.json({ ok: true, votes: data.votes[id] });
  }
);

// ---------------------------------------------------------
//  ETKİNLİK ANKET LİSTESİ (/api/event-polls)
// ---------------------------------------------------------
app.get("/api/event-polls", (req, res) => {
  const votesData = readJson(EVENT_VOTES_FILE, { votes: {} });
  const requestsData = readJson(EVENT_REQUESTS_FILE, { requests: [] });

  // 1) Sabit base etkinlikler
  const baseEvents = BASE_PLANNED_EVENTS.map((e) => ({
    ...e,
    yes: votesData.votes[e.id]?.yes || 0,
    no: votesData.votes[e.id]?.no || 0,
  }));

  // 2) Kullanıcıdan gelen talepleri de ankete ekle
  const requestEvents = (requestsData.requests || []).map((r) => {
    const label = TYPE_LABELS[r.type] || "Önerilen etkinlik";
    return {
      id: r.id,
      title:
        r.message?.trim()
          ? r.message.trim().slice(0, 80) + (r.message.length > 80 ? "..." : "")
          : `${r.city || "Şehir"} – ${label}`,
      city: r.city || "Şehir belirtilmedi",
      date: r.date || "Tarih net değil",
      type: label,
      description:
        r.message ||
        "Gönüllü tarafından önerilen çevre etkinliği. Detaylar için iletişime geçilebilir.",
      yes: votesData.votes[r.id]?.yes || 0,
      no: votesData.votes[r.id]?.no || 0,
    };
  });

  const allEvents = [...baseEvents, ...requestEvents];

  return res.json({ events: allEvents });
});

// ---------------------------------------------------------
//  SERVER START
// ---------------------------------------------------------
app.listen(PORT, () => {
  console.log(`GreenLink sunucusu ${PORT} portunda çalışıyor`);
});
