// Ana JS: navbar active durumu, yıl, haberler, kategoriler, eylem, gönüllü

document.addEventListener("DOMContentLoaded", async () => {
  highlightActiveNav();
  setYear();

  // 1) Önce haberleri store'a yükle (API + kara liste vs.)
  await initNews();

  // 2) Sonra bu haberlere göre diğer bölümler çalışsın
  initCategoriesPage();
  initRecycling();        // Eylem rehberi: Google Maps üzerinden geri dönüşüm noktaları
  initVolunteer();        // Gönüllü ol sayfası (API'siz, bilgilendirme)
  initEventRequestForm(); // Gönüllü etkinlik talep formu
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

// ------------------ EYLEM REHBERİ: Google Maps Places API ------------------

function initRecycling() {
  const input = document.getElementById("city-input");
  const btn = document.getElementById("city-search-btn");
  const resultsDiv = document.getElementById("recycling-results");

  // Sadece eylem.html sayfasında var; yoksa hiç çalışmasın
  if (!input || !btn || !resultsDiv) return;

  const handler = () => handleRecyclingSearch(input, resultsDiv);

  btn.addEventListener("click", handler);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handler();
  });
}

async function handleRecyclingSearch(input, resultsDiv) {
  const city = input.value.trim();

  if (!city) {
    resultsDiv.innerHTML = '<p class="prose">Lütfen önce bir şehir adı yaz.</p>';
    return;
  }

  resultsDiv.innerHTML = '<p class="prose">Yükleniyor...</p>';

  try {
    const res = await fetch(
      `/api/recycling-points?city=${encodeURIComponent(city)}`
    );

    const data = await res.json();
    console.log("Recycling API cevabı:", data);

    // HTTP hata
    if (!res.ok) {
      resultsDiv.innerHTML =
        `<p class="prose">Sunucu isteği başarısız oldu (${res.status}).` +
        (data.error ? ` Hata: ${data.error}` : "") +
        `</p>`;
      return;
    }

    // Backend özel hata döndürdüyse
    if (data.error) {
      resultsDiv.innerHTML = `<p class="prose">Sunucu hatası: ${data.error}${
        data.status ? " (" + data.status + ")" : ""
      }</p>`;
      return;
    }

    const points = data.points || [];
    if (!points.length) {
      resultsDiv.innerHTML =
        '<p class="prose">Bu şehirde geri dönüşüm noktası bulunamadı.</p>';
      return;
    }

    resultsDiv.innerHTML = points
      .map(
        (p) => `
      <article class="card" style="padding:1rem;">
        <div class="card-header-row">
          <h3 class="card-title" style="margin:0 0 0.4rem 0;">${p.name}</h3>
        </div>
        <p class="card-body" style="margin:0; opacity:0.85;">
          ${p.address || "Adres bilgisi yok"}
        </p>
        ${
          p.rating
            ? `<p class="card-meta" style="margin:0.2rem 0 0; font-size:0.85rem;">Puan: ${p.rating}</p>`
            : ""
        }
        ${
          p.lat && p.lng
            ? `
          <div class="card-actions" style="margin-top:0.6rem;">
            <a href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}"
               target="_blank"
               rel="noopener"
               class="btn"
               style="display:inline-block;">
              Haritada Aç
            </a>
          </div>
        `
            : ""
        }
      </article>
    `
      )
      .join("");
  } catch (err) {
    console.error(err);
    resultsDiv.innerHTML =
      "<p class='prose'>Bir hata oluştu. Lütfen daha sonra tekrar dene.</p>";
  }
}

// ------------------ GÖNÜLLÜ OL: API'SİZ BİLGİLENDİRME ------------------

function initVolunteer() {
  const input = document.getElementById("vol-city-input");
  const btn = document.getElementById("vol-city-search-btn");
  const resultsDiv = document.getElementById("volunteer-results");

  if (!input || !btn || !resultsDiv) return;

  const handler = () => {
    const city = input.value.trim();
    if (!city) {
      resultsDiv.innerHTML = "<p class='prose'>Lütfen şehir adı yaz.</p>";
      return;
    }

    // Burada artık hiçbir dış API çağrısı yok.
    // Kullanıcıya "henüz planlanan etkinlik yok" mesajı veriyoruz.
    resultsDiv.innerHTML = `
      <article class="card" style="padding:1rem;">
        <div class="card-header-row">
          <h3 class="card-title">📍 ${city} için planlanan etkinlik bulunmuyor</h3>
        </div>
        <p class="card-body">
          Şu anda <strong>${city}</strong> için sistemde kayıtlı bir gönüllü etkinliği yok.
          Aşağıdaki <strong>Etkinlik Talep / Öneri Formu</strong>nu kullanarak
          sahil/orman temizliği, atölye veya başka bir çevre etkinliği önerebilirsin.
        </p>
      </article>
    `;
  };

  btn.addEventListener("click", handler);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handler();
  });
}

// ------------------ ETKİNLİK TALEP FORMU ------------------

function initEventRequestForm() {
  const form = document.getElementById("event-request-form");
  const msg = document.getElementById("event-request-message");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    if (msg) {
      msg.style.display = "block";
      msg.textContent =
        "Teşekkürler! Etkinlik talebin kaydedildi. Onaydan Sonra Ankete Sunacağız.";
    }

    form.reset();
  });
}

/*************************************************
 * GÖNÜLLÜ SAYFASI: PLANLANAN ETKİNLİK ANKETİ
 *************************************************/

// ÖRNEK: Back-end'den veya başka bir js dosyasından gelen veri yerine bunu kullanıyorsun.
// İstersen burayı kendi verinle doldurabilirsin / API'den geleni buraya atayabilirsin.
const plannedEvents = [
  {
    id: "evt-1",
    title: "Kadıköy Sahil Temizliği",
    city: "İstanbul",
    date: "14 Aralık 2025 – 10.00",
    type: "Sahil Temizliği",
    description: "Eldiven ve çöp poşetlerini biz getiriyoruz. Sen sadece kendini ve enerjini getir.",
  },
  {
    id: "evt-2",
    title: "Şehirde Atıksız Yaşam Atölyesi",
    city: "Ankara",
    date: "21 Aralık 2025 – 14.00",
    type: "Atölye / Eğitim",
    description: "Evde, okulda ve işte atıksız yaşam pratikleri. Katılımcılara küçük bir rehber pdf gönderilecek.",
  },
  {
    id: "evt-3",
    title: "Deniz Kirliliği Farkındalık Yürüyüşü",
    city: "İzmir",
    date: "28 Aralık 2025 – 16.00",
    type: "Farkındalık Kampanyası",
    description: "Kısa bir yürüyüş ve basın açıklaması. Pankartlar için geri dönüştürülmüş karton kullanılacak.",
  },
];

// Yerel depolama anahtarı (aynı etkinliğe tekrar tekrar oy vermeyi engellemek için)
const VOTE_STORAGE_KEY = "greenlink_event_votes";

function loadEventVotes() {
  try {
    const raw = localStorage.getItem(VOTE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveEventVotes(votes) {
  try {
    localStorage.setItem(VOTE_STORAGE_KEY, JSON.stringify(votes));
  } catch {
    // sessizce geç
  }
}

function renderPlannedEventsPoll() {
  const page = document.documentElement.dataset.page;
  if (page !== "volunteer") return; // sadece gönüllü sayfasında çalışsın

  const listEl = document.getElementById("planned-events");
  const noEventsEl = document.getElementById("no-events-message");
  const introEl = document.getElementById("events-intro");
  if (!listEl || !noEventsEl || !introEl) return;

  if (!plannedEvents || plannedEvents.length === 0) {
    // hiç etkinlik yoksa mesajı göster
    noEventsEl.style.display = "block";
    introEl.style.display = "none";
    return;
  }

  // Etkinlik var -> listeyi doldur
  noEventsEl.style.display = "none";
  introEl.style.display = "block";

  const storedVotes = loadEventVotes();

  plannedEvents.forEach((ev) => {
    const wrapper = document.createElement("article");
    wrapper.className = "event-poll-card";

    // Varsayılan oy sayıları (sadece görsel istatistik)
    const yesCount = storedVotes[ev.id]?.yes ?? 0;
    const noCount = storedVotes[ev.id]?.no ?? 0;
    const userChoice = storedVotes[ev.id]?.choice ?? null;

    wrapper.innerHTML = `
      <div class="event-poll-main">
        <h3 class="event-poll-title">${ev.title}</h3>
        <div class="event-poll-meta">
          <span class="event-poll-pill">${ev.city}</span>
          <span class="event-poll-pill event-type">${ev.type}</span>
          <span class="event-poll-pill event-date">${ev.date}</span>
        </div>
        <p class="event-poll-desc">${ev.description}</p>
      </div>
      <div class="event-poll-actions">
        <button class="btn btn-yes" data-action="yes">Katılıyorum <span class="badge" data-count="yes">${yesCount}</span></button>
        <button class="btn btn-no" data-action="no">Katılmıyorum <span class="badge" data-count="no">${noCount}</span></button>
      </div>
      <p class="event-poll-note">
        Oylar sadece topluluk ilgisini ölçmek içindir; otomatik kayıt yerine geçmez.
      </p>
    `;

    listEl.appendChild(wrapper);

    const yesBtn = wrapper.querySelector('[data-action="yes"]');
    const noBtn = wrapper.querySelector('[data-action="no"]');
    const yesBadge = wrapper.querySelector('[data-count="yes"]');
    const noBadge = wrapper.querySelector('[data-count="no"]');

    // Kullanıcının önceki seçimini buton stiline yansıt
    if (userChoice === "yes") {
      yesBtn.classList.add("active");
    } else if (userChoice === "no") {
      noBtn.classList.add("active");
    }

    function handleVote(choice) {
      let votes = loadEventVotes();
      const current = votes[ev.id] || { yes: yesCount, no: noCount, choice: null };

      // Aynı seçeneğe tekrar tıklarsa hiçbir şey değiştirme (istersen burayı toggle yapabilirsin)
      if (current.choice === choice) return;

      // Önce eski oyu geri al
      if (current.choice === "yes") current.yes = Math.max(0, current.yes - 1);
      if (current.choice === "no") current.no = Math.max(0, current.no - 1);

      // Yeni oyu ekle
      if (choice === "yes") current.yes += 1;
      if (choice === "no") current.no += 1;
      current.choice = choice;

      votes[ev.id] = current;
      saveEventVotes(votes);

      // UI güncelle
      yesBadge.textContent = current.yes;
      noBadge.textContent = current.no;

      yesBtn.classList.toggle("active", choice === "yes");
      noBtn.classList.toggle("active", choice === "no");

      // Buraya istersen backend'e POST atan fetch ekleyebilirsin:
      // fetch("/api/event-vote", { method:"POST", body: JSON.stringify({ id: ev.id, choice }) });
    }

    yesBtn.addEventListener("click", () => handleVote("yes"));
    noBtn.addEventListener("click", () => handleVote("no"));
  });
}

document.addEventListener("DOMContentLoaded", renderPlannedEventsPoll);
