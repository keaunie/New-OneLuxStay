import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { blogPosts, BLOG_CATEGORIES } from "../data/blogPosts";
import "../styles/blog.css";

const generateSlug = (title = "") =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

const calcSeoScore = (form) => {
  let score = 0;
  if (form.title.length >= 30 && form.title.length <= 65) score += 20;
  else if (form.title.length > 0) score += 10;
  if (form.seoDescription.length >= 120 && form.seoDescription.length <= 160) score += 20;
  else if (form.seoDescription.length > 0) score += 10;
  if (form.keywords.split(",").filter(Boolean).length >= 3) score += 20;
  else if (form.keywords.length > 0) score += 10;
  if (form.content.length >= 800) score += 20;
  else if (form.content.length > 0) score += 10;
  if (form.slug.length > 3) score += 10;
  if (form.featuredImage.startsWith("http")) score += 10;
  return score;
};

const EMPTY_FORM = {
  title: "",
  slug: "",
  excerpt: "",
  category: "Luxury Stays",
  content: "",
  featuredImage: "",
  seoTitle: "",
  seoDescription: "",
  keywords: "",
  published: false,
  author: "",
};

export default function AdminBlogPage() {
  const [view, setView] = useState("list");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [saved, setSaved] = useState(false);

  const seoScore = calcSeoScore(form);
  const scoreLevel = seoScore < 40 ? "low" : seoScore < 70 ? "mid" : "good";

  const handleChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => {
      const next = { ...prev, [name]: type === "checkbox" ? checked : value };
      if (name === "title" && !editingId) {
        next.slug = generateSlug(value);
        if (!next.seoTitle) next.seoTitle = value;
      }
      return next;
    });
    setSaved(false);
  }, [editingId]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const startEdit = (post) => {
    setForm({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      category: post.category,
      content: JSON.stringify(post.content, null, 2),
      featuredImage: post.featuredImage || "",
      seoTitle: post.seoTitle || "",
      seoDescription: post.seoDescription || "",
      keywords: (post.keywords || []).join(", "),
      published: true,
      author: post.author?.name || "",
    });
    setEditingId(post.id);
    setView("editor");
  };

  const startNew = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setPreviewMode(false);
    setView("editor");
  };

  return (
    <>
      <Helmet>
        <title>Blog Management | OneLuxStay</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="admin-blog-page">
        {/* ── Nav ──────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "2rem", flexWrap: "wrap" }}>
          <Link
            to="/executive-ols"
            style={{ fontSize: "0.82rem", color: "var(--landing-muted)", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.3rem" }}
          >
            ← Dashboard
          </Link>
          <span style={{ color: "var(--landing-stroke)" }}>|</span>
          <h1 style={{ fontFamily: "var(--landing-font-display)", fontSize: "1.5rem", fontWeight: 600, color: "var(--ink)", margin: 0 }}>
            Blog Management
          </h1>
          <div style={{ marginLeft: "auto", display: "flex", gap: "0.75rem" }}>
            {view === "editor" && (
              <>
                <button
                  onClick={() => setPreviewMode((p) => !p)}
                  style={{ padding: "0.55rem 1.1rem", border: "1px solid var(--landing-stroke)", borderRadius: "9px", background: previewMode ? "var(--ink)" : "transparent", color: previewMode ? "var(--cream-1)" : "var(--ink)", fontFamily: "var(--landing-font-body)", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer" }}
                >
                  {previewMode ? "← Edit" : "Preview"}
                </button>
                <button
                  onClick={() => setView("list")}
                  style={{ padding: "0.55rem 1.1rem", border: "1px solid var(--landing-stroke)", borderRadius: "9px", background: "transparent", color: "var(--landing-muted)", fontFamily: "var(--landing-font-body)", fontSize: "0.85rem", cursor: "pointer" }}
                >
                  Cancel
                </button>
              </>
            )}
            {view === "list" && (
              <button
                onClick={startNew}
                style={{ padding: "0.6rem 1.4rem", background: "var(--ink)", border: "none", borderRadius: "10px", color: "var(--cream-1)", fontFamily: "var(--landing-font-body)", fontSize: "0.88rem", fontWeight: 600, cursor: "pointer" }}
              >
                + New Article
              </button>
            )}
          </div>
        </div>

        {/* ── List View ────────────────────────────────────── */}
        {view === "list" && (
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <p style={{ fontSize: "0.85rem", color: "var(--landing-muted)", marginBottom: "1.5rem" }}>
              {blogPosts.length} articles · Showing static data. Connect to Supabase <code>blog_posts</code> table for live editing.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {blogPosts.map((post) => (
                <div
                  key={post.id}
                  style={{ background: "var(--landing-card)", border: "1px solid var(--landing-stroke)", borderRadius: "14px", padding: "1.25rem 1.5rem", display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}
                >
                  <img
                    src={post.featuredImage}
                    alt=""
                    style={{ width: 60, height: 44, objectFit: "cover", borderRadius: "8px", flexShrink: 0 }}
                    loading="lazy"
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 600, color: "var(--ink)", fontSize: "0.95rem", marginBottom: "0.2rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {post.title}
                    </p>
                    <p style={{ fontSize: "0.78rem", color: "var(--landing-muted)" }}>
                      {post.category} · {post.publishDate} · {post.readingTime} min read
                    </p>
                  </div>
                  <span style={{ fontSize: "0.72rem", fontWeight: 600, background: "rgba(90,154,106,0.12)", color: "#3a7a4a", border: "1px solid rgba(90,154,106,0.25)", borderRadius: "999px", padding: "0.25rem 0.7rem" }}>
                    Published
                  </span>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      onClick={() => startEdit(post)}
                      style={{ padding: "0.42rem 0.9rem", border: "1px solid var(--landing-stroke)", borderRadius: "8px", background: "transparent", color: "var(--ink)", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer", fontFamily: "var(--landing-font-body)" }}
                    >
                      Edit
                    </button>
                    <Link
                      to={`/blog/${post.slug}`}
                      target="_blank"
                      style={{ padding: "0.42rem 0.9rem", border: "1px solid var(--landing-stroke)", borderRadius: "8px", textDecoration: "none", color: "var(--landing-muted)", fontSize: "0.82rem", fontWeight: 600 }}
                    >
                      View ↗
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Editor View ───────────────────────────────────── */}
        {view === "editor" && !previewMode && (
          <form className="admin-blog-form" onSubmit={handleSubmit}>
            {/* SEO Score */}
            <div style={{ background: "var(--landing-card)", border: "1px solid var(--landing-stroke)", borderRadius: "14px", padding: "1.25rem 1.5rem", marginBottom: "1.75rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <p style={{ fontSize: "0.82rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--landing-muted)" }}>SEO Score</p>
                <span style={{ fontSize: "1rem", fontWeight: 700, color: scoreLevel === "good" ? "#3a7a4a" : scoreLevel === "mid" ? "#b87a10" : "#c0524a" }}>
                  {seoScore}/100
                </span>
              </div>
              <div className="seo-score">
                <div className="seo-score__bar">
                  <div className={`seo-score__fill seo-score__fill--${scoreLevel}`} style={{ width: `${seoScore}%` }} />
                </div>
                <span className="seo-score__label" style={{ color: scoreLevel === "good" ? "#3a7a4a" : scoreLevel === "mid" ? "#b87a10" : "#c0524a" }}>
                  {scoreLevel === "good" ? "Good" : scoreLevel === "mid" ? "Fair" : "Needs work"}
                </span>
              </div>
              <p style={{ fontSize: "0.78rem", color: "var(--landing-muted)", marginTop: "0.5rem" }}>
                Tip: write a 30–65 char title, 120–160 char description, add 3+ keywords, and 800+ words of content.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div className="admin-blog-form__field" style={{ gridColumn: "1 / -1" }}>
                <label className="admin-blog-form__label">Article Title *</label>
                <input className="admin-blog-form__input" name="title" value={form.title} onChange={handleChange} required placeholder="e.g. The Ultimate Guide to Luxury Stays in Dubai 2025" />
                <p style={{ fontSize: "0.75rem", color: seoScore < 40 ? "#c0524a" : "var(--landing-muted)", marginTop: "0.3rem" }}>
                  {form.title.length}/65 chars {form.title.length >= 30 && form.title.length <= 65 ? "✓" : "(aim for 30–65)"}
                </p>
              </div>

              <div className="admin-blog-form__field">
                <label className="admin-blog-form__label">URL Slug *</label>
                <input className="admin-blog-form__input" name="slug" value={form.slug} onChange={handleChange} required placeholder="auto-generated-from-title" />
              </div>

              <div className="admin-blog-form__field">
                <label className="admin-blog-form__label">Category</label>
                <select className="admin-blog-form__select" name="category" value={form.category} onChange={handleChange}>
                  {BLOG_CATEGORIES.filter((c) => c !== "All").map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="admin-blog-form__field" style={{ gridColumn: "1 / -1" }}>
                <label className="admin-blog-form__label">Excerpt (for cards & meta) *</label>
                <textarea className="admin-blog-form__textarea" name="excerpt" value={form.excerpt} onChange={handleChange} rows={3} style={{ minHeight: 90 }} placeholder="2–3 sentence summary of the article…" />
              </div>

              <div className="admin-blog-form__field" style={{ gridColumn: "1 / -1" }}>
                <label className="admin-blog-form__label">Featured Image URL</label>
                <input className="admin-blog-form__input" name="featuredImage" value={form.featuredImage} onChange={handleChange} placeholder="https://images.unsplash.com/…" />
                {form.featuredImage && (
                  <img src={form.featuredImage} alt="preview" style={{ marginTop: "0.5rem", width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: "10px" }} loading="lazy" />
                )}
              </div>

              <div className="admin-blog-form__field">
                <label className="admin-blog-form__label">SEO Title</label>
                <input className="admin-blog-form__input" name="seoTitle" value={form.seoTitle} onChange={handleChange} placeholder="Falls back to Title if empty" />
                <p style={{ fontSize: "0.75rem", color: "var(--landing-muted)", marginTop: "0.3rem" }}>{form.seoTitle.length}/65 chars</p>
              </div>

              <div className="admin-blog-form__field">
                <label className="admin-blog-form__label">Author</label>
                <input className="admin-blog-form__input" name="author" value={form.author} onChange={handleChange} placeholder="OneLuxStay Editorial" />
              </div>

              <div className="admin-blog-form__field" style={{ gridColumn: "1 / -1" }}>
                <label className="admin-blog-form__label">Meta Description *</label>
                <textarea className="admin-blog-form__textarea" name="seoDescription" value={form.seoDescription} onChange={handleChange} rows={3} style={{ minHeight: 80 }} placeholder="120–160 chars for Google SERP preview…" />
                <p style={{ fontSize: "0.75rem", color: form.seoDescription.length >= 120 && form.seoDescription.length <= 160 ? "#3a7a4a" : "var(--landing-muted)", marginTop: "0.3rem" }}>
                  {form.seoDescription.length}/160 chars {form.seoDescription.length >= 120 && form.seoDescription.length <= 160 ? "✓ Perfect" : "(aim for 120–160)"}
                </p>
              </div>

              <div className="admin-blog-form__field" style={{ gridColumn: "1 / -1" }}>
                <label className="admin-blog-form__label">Keywords (comma-separated)</label>
                <input className="admin-blog-form__input" name="keywords" value={form.keywords} onChange={handleChange} placeholder="luxury stays Dubai, Dubai Marina apartments, …" />
                <p style={{ fontSize: "0.75rem", color: "var(--landing-muted)", marginTop: "0.3rem" }}>
                  {form.keywords.split(",").filter((k) => k.trim()).length} keywords added
                </p>
              </div>

              <div className="admin-blog-form__field" style={{ gridColumn: "1 / -1" }}>
                <label className="admin-blog-form__label">Content (JSON block array)</label>
                <textarea className="admin-blog-form__textarea" name="content" value={form.content} onChange={handleChange} placeholder={`[\n  { "type": "paragraph", "text": "..." },\n  { "type": "heading", "level": 2, "id": "...", "text": "..." }\n]`} />
                <p style={{ fontSize: "0.75rem", color: "var(--landing-muted)", marginTop: "0.3rem" }}>
                  Supported types: paragraph · heading · list · quote · callout · cta · faq · image
                </p>
              </div>

              <div className="admin-blog-form__field">
                <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer" }}>
                  <input type="checkbox" name="published" checked={form.published} onChange={handleChange} style={{ width: 16, height: 16, accentColor: "var(--ink)" }} />
                  <span style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--ink)" }}>Publish article</span>
                </label>
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
              <button
                type="submit"
                style={{ padding: "0.7rem 1.75rem", background: "var(--ink)", border: "none", borderRadius: "10px", color: "var(--cream-1)", fontFamily: "var(--landing-font-body)", fontSize: "0.9rem", fontWeight: 600, cursor: "pointer" }}
              >
                {saved ? "✓ Saved" : editingId ? "Save Changes" : "Create Article"}
              </button>
              {saved && (
                <p style={{ fontSize: "0.85rem", color: "#3a7a4a", alignSelf: "center" }}>
                  Saved locally. Connect Supabase to persist to database.
                </p>
              )}
            </div>
          </form>
        )}

        {/* ── Preview Mode ──────────────────────────────────── */}
        {view === "editor" && previewMode && (
          <div style={{ maxWidth: 780, margin: "0 auto", background: "var(--landing-card)", border: "1px solid var(--landing-stroke)", borderRadius: "16px", overflow: "hidden" }}>
            {form.featuredImage && (
              <img src={form.featuredImage} alt="" style={{ width: "100%", height: 300, objectFit: "cover", display: "block" }} />
            )}
            <div style={{ padding: "2rem 2.5rem" }}>
              <p style={{ fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--landing-amber)", marginBottom: "0.5rem" }}>{form.category}</p>
              <h1 style={{ fontFamily: "var(--landing-font-display)", fontSize: "2rem", fontWeight: 600, color: "var(--ink)", lineHeight: 1.15, marginBottom: "0.75rem" }}>{form.title || "Article Title"}</h1>
              <p style={{ color: "var(--landing-muted)", lineHeight: 1.7, marginBottom: "1.5rem" }}>{form.excerpt}</p>
              <div style={{ borderTop: "1px solid var(--landing-stroke)", paddingTop: "1rem", fontSize: "0.82rem", color: "var(--landing-muted)" }}>
                <strong>SEO Title:</strong> {form.seoTitle || form.title}<br />
                <strong>Meta Desc:</strong> {form.seoDescription}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
