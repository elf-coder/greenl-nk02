import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- KENDİ BİLGİLERİNİ BURAYA YAZ ---
const supabaseUrl = "https://zbitkecyagymhlsklpqr.supabase.co";
const supabaseAnonKey = "sb_publishable_dNC7xQgXQiH11TZjGnfkOQ_CWYblLnw";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- MESAJLARI YÜKLE ---
async function fetchForumPosts() {
  const list = document.getElementById("forum-list");
  if (!list) return;

  const { data, error } = await supabase
    .from("forum_posts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    list.innerHTML = "<p>Forum verisi çekilemedi.</p>";
    return;
  }

  if (!data || data.length === 0) {
    list.innerHTML = "<p>Henüz hiç gönderi yok.</p>";
    return;
  }

  list.innerHTML = data
    .map(
      (p) => `
        <div class="post-card">
          <h3>${escapeHtml(p.title)}</h3>
          <small><strong>${escapeHtml(p.name || "İsimsiz")}</strong> • 
          ${new Date(p.created_at).toLocaleString("tr-TR")}</small>
          <p>${escapeHtml(p.content)}</p>
        </div>
      `
    )
    .join("");
}

// --- FORM GÖNDERME ---
async function handleForumSubmit(e) {
  e.preventDefault();

  const name = document.getElementById("forum-name").value.trim() || "İsimsiz";
  const title = document.getElementById("forum-title").value.trim();
  const content = document.getElementById("forum-body").value.trim();

  if (!title || !content) {
    alert("Başlık ve içerik zorunlu.");
    return;
  }

  const { error } = await supabase.from("forum_posts").insert([
    {
      name,
      title,
      content,
    },
  ]);

  if (error) {
    alert("Gönderi kaydedilemedi.");
    return;
  }

  e.target.reset();
  fetchForumPosts();
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

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("forum-form");
  if (form) {
    form.addEventListener("submit", handleForumSubmit);
    fetchForumPosts();
  }
});
