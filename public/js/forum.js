// forum.js
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- PROJE BİLGİLERİ ---
const supabaseUrl = "https://zbitkecyagymhlsklpqr.supabase.co";
const supabaseAnonKey = "sb_publishable_dNC7xQgXQiH11TZjGnfkOQ_CWYblLnw";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- Mesajları Supabase'ten çek ---
async function fetchForumPosts() {
  const list = document.getElementById("forum-list");
  if (!list) return;

  try {
    const { data, error } = await supabase
      .from("forum_posts")
      .select("id, name, title, content, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase GET hata:", error);
      list.innerHTML =
        "<p>Forum verisi çekilemedi. Lütfen daha sonra tekrar dene.</p>";
      return;
    }

    if (!data || data.length === 0) {
      list.innerHTML =
        "<p>Henüz hiç gönderi yok. İlk başlığı sen aç.</p>";
      return;
    }

    list.innerHTML = data
      .map((p) => {
        const dateText = p.created_at
          ? new Date(p.created_at).toLocaleString("tr-TR", {
              dateStyle: "short",
              timeStyle: "short",
            })
          : "";

        return `
          <article class="post-card">
            <h3>${escapeHtml(p.title)}</h3>
            <p class="forum-meta">
              <strong>${escapeHtml(p.name || "İsimsiz")}</strong>
              <span> • ${dateText}</span>
            </p>
            <p>${escapeHtml(p.content)}</p>
          </article>
        `;
      })
      .join("");
  } catch (err) {
    console.error("Forum fetch hata:", err);
    list.innerHTML =
      "<p>Forum verisi çekilirken bir hata oluştu.</p>";
  }
}

// --- Form gönderme ---
async function handleForumSubmit(e) {
  e.preventDefault();

  const form = e.target;
  const nameInput = form.querySelector("#forum-name");
  const titleInput = form.querySelector("#forum-title");
  const bodyInput = form.querySelector("#forum-body");

  const name = (nameInput.value || "").trim() || "İsimsiz";
  const title = (titleInput.value || "").trim();
  const content = (bodyInput.value || "").trim();

  if (!title || !content) {
    alert("Başlık ve içerik zorunlu.");
    return;
  }

  try {
    const { error } = await supabase.from("forum_posts").insert([
      {
        name,
        title,
        content,
      },
    ]);

    if (error) {
      console.error("Supabase INSERT hata:", error);
      alert("Gönderi kaydedilemedi. Lütfen tekrar dene.");
      return;
    }

    form.reset();
    await fetchForumPosts();
  } catch (err) {
    console.error("Forum submit hata:", err);
    alert("Bir hata oluştu. Lütfen tekrar dene.");
  }
}

// HTML KORUMA
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// DOM hazır
const form = document.getElementById("forum-form");
if (form) {
  form.addEventListener("submit", handleForumSubmit);
}
fetchForumPosts();
