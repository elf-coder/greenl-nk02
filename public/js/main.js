// Ana JS: navbar active durumu, yıl, haberler ve kategoriler

document.addEventListener("DOMContentLoaded", async () => {
  highlightActiveNav();
  setYear();

  // 1) Önce haberleri store'a yükle (API + kara liste vs.)
  await initNews();

  // 2) Sonra bu haberlere göre diğer bölümler çalışsın
  initCategoriesPage();
  initRecycling();
  initVolunteer();
  // Forum artık Supabase tarafında forum.js ile yönetiliyor,
  // burada initForum çağırmıyoruz.
});

// ------------------ NAVBAR & YIL ------------------

function highlightActiveNav() {
  const htmlEl = document.documentElement;
  const pageId = htmlEl.getAttribute("data-page");
  const links = document.querySelectorAll(".nav-link");
  links.forEach((link) => {
    const id = link.getAttribute("data-page");
    if (id === pageId) {
      link.classList.add("active");
    }
  });
}

function setYear() {
  const span = document.getElementById("year-span");
  if (span) span.textContent = new Date().getFullYear();
}

// ------------------ HABERLER ------------------

// Statik örnekler (API gelmezse fallback)
const sampleNews = [
  {
    id: 1,
    title: "Akdeniz'de deniz suyu sıcaklıkları mevsim normallerinin üzerinde",
    summary:
      "Yeni ölçümler, Akdeniz'deki yüzey suyu sıcaklıklarının uzun dönem ortalamasının belirgin şekilde üstüne çıktığını gösteriyor.",
    source: "Çevre Ajansı",
    date: "2025-06-12",
    category: "iklim",
    tags: ["iklim", "deniz"],
    url: "#",
  },
  {
    id: 2,
    title: "İstanbul'da plastik atık toplama istasyonları genişletiliyor",
    summary:
      "Büyükşehir belediyesi, mahalle bazlı yeni plastik ve ambalaj atığı toplama noktalarını hayata geçiriyor.",
    source: "Yerel Haber",
    date: "2025-05-28",
    category: "atik",
    tags: ["atik", "geri-donusum", "sehir"],
    url: "#",
  },
  {
    id: 3,
    title: "Rüzgar enerjisinde yeni rekor",
    summary:
      "Birçok ülkede elektrik ihtiyacının önemli kısmı ilk kez rüzgar ve güneşten karşılandı.",
    source: "Enerji Raporu",
    date: "2025-04-15",
    category: "enerji",
    tags: ["enerji", "yenilenebilir"],
    url: "#",
  },
  {
    id: 4,
    title: "Ege'de orman yangınlarına karşı erken uyarı sistemi test ediliyor",
    summary:
      "Uydu görüntüleri ve yapay zekâ destekli tahmin modelleriyle yangın riski daha oluşmadan değerlendiriliyor.",
    source: "Bilim Haber",
    date: "2025-07-02",
    category: "yangin",
    tags: ["yangin", "iklim"],
    url: "#",
  },
  {
    id: 5,
    title: "Şehir içi bisiklet yolları karbon ayak izini düşürüyor",
    summary:
      "Yeni bir çalışma, bisiklet altyapısına yapılan her yatırımın uzun vadede emisyonu anlamlı ölçüde azalttığını gösteriyor.",
    source: "Araştırma Özeti",
    date: "2025-03-09",
    category: "karbon",
    tags: ["karbon", "ulasim"],
    url: "#",
  },
  {
    id: 6,
    title: "Atık yağların toplanmasıyla binlerce litre su korunuyor",
    summary:
      "Evsel atık yağların lavaboya dökülmesi yerine toplama noktalarına bırakılması, su ekosistemlerini ciddi şekilde koruyor.",
    source: "Su Gözlem Merkezi",
    date: "2025-01-19",
    category: "atik",
    tags: ["atik", "su", "geri-donusum"],
    url: "#",
  },
];

// Burada tutulan veri hem ana sayfa hem kategoriler tarafından kullanılıyor
let newsStore = sampleNews.slice();

// Sadece veriyi çeker, DOM'a dokunmaz
async function fetchNewsIntoStore() {
  // Varsayılan: statik örnekler
  newsStore = sampleNews.slice();

  try {
    const resp = await fetch("/api/news");
    const json = await resp.json();

    if (json && Array.isArray(json.articles) && json.articles.length) {
      newsStore = json.articles.map((a, idx) => ({
        id: idx + 1,
        title: a.title || "(Başlık yok)",
        summary: a.description || a.content || "",
        source: (a.source && a.source.name) || "Kaynak",
        date: a.publishedAt,
        category: detectCategory(a),
        tags: buildTags(a),
        url: a.url || "#",
      }));
    }
  } catch (err) {
    console.error("API'den haber alınamadı, sampleNews kullanılacak:", err);
  }
}

// Bu fonksiyon HER SAYFADA çağrılır: önce store'u doldurur,
// sonra sadece ana sayfadaysa listeyi çizer + filtreleri bağlar.
async function initNews() {
  await fetchNewsIntoStore();

  const newsList = document.getElementById("news-list");
  if (!newsList) {
    // Kategoriler, eylem vb. sayfalar: sadece veri lazım, DOM yok
    return;
  }

  // Ana sayfadaysak kartları çiz ve filtreleri bağla
  renderNewsCards("all");
  attachNewsFilterHandlers();
}

// Filtre butonlarını aktif hale getirir
function attachNewsFilterHandlers() {
  const filterContainer = document.querySelector("[data-news-filters]");
  if (!filterContainer) return;

  filterContainer.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-filter]");
    if (!btn) return;

    const filter = btn.getAttribute("data-filter");
    renderNewsCards(filter);

    // Görsel olarak hangi filtrenin seçili olduğunu göstermek için
    const allButtons = filterContainer.querySelectorAll("button[data-filter]");
    allButtons.forEach((b) => b.classList.remove("active-filter"));
    btn.classList.add("active-filter");
  });
}

// Haber kartlarını çizer
function renderNewsCards(filter) {
  const newsList = document.getElementById("news-list");
  if (!newsList) return;

  let filtered = newsStore;
  if (filter && filter !== "all") {
    filtered = newsStore.filter((item) => {
      return item.category === filter || (item.tags || []).includes(filter);
    });
  }

  newsList.innerHTML = "";
  if (!filtered.length) {
    newsList.innerHTML =
      '<p class="prose">Bu filtreye uygun haber bulunamadı.</p>';
    return;
  }

  filtered.forEach((item) => {
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <div class="card-header-row">
        <h3 class="card-title">${item.title}</h3>
        <span class="chip">${formatCategoryLabel(item.category)}</span>
      </div>
      <div class="card-meta">
        <span>${formatDate(item.date)}</span>
        <span>•</span>
        <span>${item.source}</span>
      </div>
      <p class="card-body">${item.summary}</p>
      <div class="card-tags">
        ${(item.tags || [])
          .map((t) => `<span class="tag">#${t}</span>`)
          .join("")}
      </div>
      <div class="card-actions">
        <a href="${item.url}" class="card-link" target="_blank" rel="noopener">
          Habere git
          <span class="card-link-icon">↗</span>
        </a>
        <span class="card-meta">ID: ${item.id}</span>
      </div>
    `;
    newsList.appendChild(card);
  });
}

function formatCategoryLabel(cat) {
  switch (cat) {
    case "iklim":
      return "🌍 İklim";
    case "dogA":
      return "🌱 Doğa";
    case "yangin":
      return "🔥 Yangın";
    case "deniz":
      return "🌊 Deniz & Okyanus";
    case "enerji":
      return "⚡ Enerji";
    case "atik":
      return "🧪 Atık – Geri Dönüşüm";
    case "karbon":
      return "👣 Karbon Ayak İzi";
    default:
      return "Çevre";
  }
}

// Haber metnine bakıp kategori tahmini yapar
function detectCategory(a) {
  const text = ((a.title || "") + " " + (a.description || "")).toLowerCase();

  if (text.includes("yangın")) return "yangin";
  if (text.includes("deniz") || text.includes("okyanus")) return "deniz";
  if (text.includes("rüzgar") || text.includes("güneş") || text.includes("enerji"))
    return "enerji";
  if (
    text.includes("geri dönüşüm") ||
    text.includes("atık") ||
    text.includes("plastik")
  )
    return "atik";
  if (text.includes("karbon") || text.includes("emisyon")) return "karbon";
  if (text.includes("orman") || text.includes("doğa")) return "dogA";

  return "iklim"; // varsayılan
}

// Haberlerden tag listesi çıkarır
function buildTags(a) {
  const text = ((a.title || "") + " " + (a.description || "")).toLowerCase();
  const tags = [];

  if (text.includes("iklim") || text.includes("ısınma")) tags.push("iklim");
  if (text.includes("deniz") || text.includes("okyanus")) tags.push("deniz");
  if (text.includes("yangın")) tags.push("yangin");
  if (
    text.includes("geri dönüşüm") ||
    text.includes("atık") ||
    text.includes("plastik")
  )
    tags.push("atik");
  if (text.includes("enerji") || text.includes("rüzgar") || text.includes("güneş"))
    tags.push("enerji");
  if (text.includes("karbon") || text.includes("emisyon")) tags.push("karbon");

  if (!tags.length) tags.push("cevre");
  return tags;
}

function formatDate(str) {
  if (!str) return "";
  const d = new Date(str);
  if (isNaN(d)) return str;
  return d.toLocaleDateString("tr-TR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ------------------ KATEGORİLER SAYFASI ------------------

function initCategoriesPage() {
  const container = document.getElementById("category-list");
  if (!container) return; // sadece kategoriler sayfasında var

  const categories = [
    { id: "iklim", label: "🌍 İklim" },
    { id: "dogA", label: "🌱 Doğa" },
    { id: "yangin", label: "🔥 Yangın" },
    { id: "deniz", label: "🌊 Deniz & Okyanus" },
    { id: "enerji", label: "⚡ Enerji" },
    { id: "atik", label: "🧪 Atık – Geri Dönüşüm" },
    { id: "karbon", label: "👣 Karbon Ayak İzi" },
  ];

  container.innerHTML = "";

  categories.forEach((cat) => {
    const related = newsStore.filter(
      (n) => n.category === cat.id || (n.tags || []).includes(cat.id)
    );

    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <div class="card-header-row">
        <h2 class="card-title">${cat.label}</h2>
        <span class="card-meta">${related.length} haber</span>
      </div>
      <p class="card-body">
        Bu kategori, <strong>${cat.label}</strong> etiketiyle işaretlenmiş çevre haberlerini içerir.
        Aşağıda son haberlerden bazı başlıkları görebilirsin.
      </p>
      <ul class="bullet-list">
        ${
          related.length
            ? related
                .slice(0, 3)
                .map((r) => `<li>${r.title}</li>`)
                .join("")
            : "<li>Şimdilik bu etikette haber yok.</li>"
        }
      </ul>
      <div class="card-actions">
        <a href="index.html" class="card-link">
          Ana sayfada bu etiketi filtrele
          <span class="card-link-icon">↩</span>
        </a>
      </div>
    `;
    container.appendChild(card);
  });
}

// ------------------ EYLEM REHBERİ / GÖNÜLLÜ ------------------

// ----- Eylem rehberi: geri dönüşüm noktaları -----

const recyclingData = {
  istanbul: [
    {
      type: "Plastik / Ambalaj",
      name: "Kadıköy Plastik Atık Noktası",
      desc: "Mahalle bazlı plastik ve ambalaj atığı konteyneri.",
      address: "Moda Caddesi, Kadıköy",
      icon: "♻️",
    },
    {
      type: "Pil",
      name: "Beşiktaş Pil Toplama Kutusu",
      desc: "Küçük el tipi piller için yeşil kutu.",
      address: "Beşiktaş Meydanı, Çevre Bilgilendirme Çadırı",
      icon: "🔋",
    },
    {
      type: "Atık Yağ",
      name: "Atık Yağ Teslim Noktası",
      desc: "Evsel atık yağları teslim edebileceğin resmi nokta.",
      address: "Üsküdar Belediye Binası önü",
      icon: "🧴",
    },
  ],
  ankara: [
    {
      type: "Plastik / Kağıt",
      name: "Kızılay Geri Dönüşüm Noktası",
      desc: "Karışık ambalaj (plastik, kağıt, metal) konteyneri.",
      address: "Kızılay Meydanı, Güvenpark yanı",
      icon: "♻️",
    },
    {
      type: "Pil",
      name: "Pil Toplama Kutusu",
      desc: "Küçük piller için kırmızı kutu.",
      address: "Çankaya Belediyesi hizmet binası",
      icon: "🔋",
    },
  ],
  izmir: [
    {
      type: "Plastik / Cam",
      name: "Karşıyaka Atık Noktası",
      desc: "Cam ve plastik şişe odaklı geri dönüşüm ünitesi.",
      address: "Karşıyaka sahil bandı",
      icon: "♻️",
    },
    {
      type: "Atık Yağ",
      name: "Evsel Atık Yağ Toplama",
      desc: "Belirli günlerde mobil atık yağ aracı.",
      address: "Konak Meydanı (hafta içi belirli günler)",
      icon: "🧴",
    },
  ],
};

function initRecycling() {
  const input = document.getElementById("city-input");
  const btn = document.getElementById("city-search-btn");
  if (!input || !btn) return;

  btn.addEventListener("click", () => {
    const city = (input.value || "").trim().toLowerCase();
    renderRecycling(city);
  });
}

function renderRecycling(city) {
  const container = document.getElementById("recycling-results");
  if (!container) return;
  container.innerHTML = "";

  if (!city) {
    container.innerHTML = '<p class="prose">Lütfen önce bir şehir gir.</p>';
    return;
  }

  const data = recyclingData[city];
  if (!data) {
    container.innerHTML =
      "<p class=\"prose\">Bu şehir için henüz örnek veri yok. Daha sonra JSON'a ekleyebilirsin.</p>";
    return;
  }

  data.forEach((item) => {
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <div class="card-header-row">
        <h3 class="card-title">${item.icon} ${item.name}</h3>
        <span class="chip">${item.type}</span>
      </div>
      <p class="card-body">${item.desc}</p>
      <div class="card-meta">
        <span>📍 ${item.address}</span>
      </div>
    `;
    container.appendChild(card);
  });
}

// ----- Gönüllü Ol: etkinlikler -----

const volunteerData = {
  istanbul: [
    {
      title: "Kadıköy Sahil Temizliği",
      desc: "Pazar sabahı 09:00'da sahil boyunca çöp toplama etkinliği.",
      when: "Her ayın ilk pazarı",
      org: "Yerel Çevre Gönüllüleri",
    },
    {
      title: "Moda Parkı Yeşil Buluşma",
      desc: "Ağaç dikimi, tohum topları ve kompost atölyesi.",
      when: "Yaz döneminde her iki haftada bir",
      org: "Yeşil Adımlar Kolektifi",
    },
  ],
  ankara: [
    {
      title: "Eymir Gölü Kıyı Temizliği",
      desc: "Göl çevresinde çöp toplama ve farkındalık yürüyüşü.",
      when: "Bahar aylarında belirli hafta sonları",
      org: "Ankara Doğa Dostları",
    },
  ],
  izmir: [
    {
      title: "Karşıyaka Sahil Çöp Toplama Günü",
      desc: "Gönüllülerle birlikte sahil hattı boyunca çöp toplama.",
      when: "Her ayın son cumartesi günü",
      org: "İzmir Çevre Gönüllüleri",
    },
  ],
};

function initVolunteer() {
  const input = document.getElementById("vol-city-input");
  const btn = document.getElementById("vol-city-search-btn");
  if (!input || !btn) return;

  btn.addEventListener("click", () => {
    const city = (input.value || "").trim().toLowerCase();
    renderVolunteer(city);
  });
}

function renderVolunteer(city) {
  const container = document.getElementById("volunteer-results");
  if (!container) return;
  container.innerHTML = "";

  if (!city) {
    container.innerHTML = '<p class="prose">Lütfen önce bir şehir gir.</p>';
    return;
  }

  const data = volunteerData[city];
  if (!data) {
    container.innerHTML =
      "<p class=\"prose\">Bu şehir için henüz örnek gönüllü etkinliği eklenmedi.</p>";
    return;
  }

  data.forEach((item) => {
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <div class="card-header-row">
        <h3 class="card-title">🤝 ${item.title}</h3>
        <span class="chip">${item.when}</span>
      </div>
      <p class="card-body">${item.desc}</p>
      <div class="card-meta">
        <span>👥 ${item.org}</span>
      </div>
    `;
    container.appendChild(card);
  });
}
