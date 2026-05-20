import { useState, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { blogPosts, getFeaturedPost, getPostsByCategory } from "../data/blogPosts";
import { buildCanonicalUrl, buildBlogListSchema } from "../utils/seo/blogSeo";
import BlogCard from "../components/blog/BlogCard";
import BlogCategoryFilter from "../components/blog/BlogCategoryFilter";
import SiteFooter from "../components/SiteFooter";
import "../styles/blog.css";

const SearchIcon = () => (
  <svg className="blog-search__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const CANONICAL = buildCanonicalUrl("/blog");
const PAGE_TITLE = "Travel & Living Blog | OneLuxStay";
const PAGE_DESCRIPTION =
  "Expert guides to luxury short-term rentals, local neighborhoods, and travel tips for Dubai, Antwerp, Miami, Los Angeles, and Redondo Beach.";

export default function BlogPage() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const featured = getFeaturedPost();

  const filteredPosts = useMemo(() => {
    let posts = getPostsByCategory(activeCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      posts = posts.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.excerpt.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          (p.keywords || []).some((k) => k.toLowerCase().includes(q)),
      );
    }
    return posts;
  }, [activeCategory, searchQuery]);

  const gridPosts = useMemo(
    () => filteredPosts.filter((p) => !featured || p.id !== featured.id || activeCategory !== "All" || searchQuery),
    [filteredPosts, featured, activeCategory, searchQuery],
  );

  const schemaJson = JSON.stringify(buildBlogListSchema(blogPosts));

  return (
    <>
      <Helmet>
        <title>{PAGE_TITLE}</title>
        <meta name="description" content={PAGE_DESCRIPTION} />
        <link rel="canonical" href={CANONICAL} />
        <meta property="og:title" content={PAGE_TITLE} />
        <meta property="og:description" content={PAGE_DESCRIPTION} />
        <meta property="og:url" content={CANONICAL} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={featured?.featuredImage || ""} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={PAGE_TITLE} />
        <meta name="twitter:description" content={PAGE_DESCRIPTION} />
        <script type="application/ld+json">{schemaJson}</script>
      </Helmet>

      <main className="blog-page">
        {/* ── Hero ─────────────────────────────────────────── */}
        <header className="blog-hero">
          <p className="blog-hero__eyebrow">OneLuxStay Journal</p>
          <h1 className="blog-hero__title">Luxury Travel, Lived Well</h1>
          <p className="blog-hero__subtitle">
            Insider guides to the world's most desirable short-term rentals, neighborhoods, and travel experiences — curated by people who actually live there.
          </p>
        </header>

        <div className="blog-container">
          {/* ── Controls ─────────────────────────────────────── */}
          <div className="blog-controls">
            <div className="blog-search">
              <SearchIcon />
              <input
                type="search"
                className="blog-search__input"
                placeholder="Search articles…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search articles"
              />
            </div>
          </div>

          <BlogCategoryFilter active={activeCategory} onChange={setActiveCategory} />

          {/* ── Featured ─────────────────────────────────────── */}
          {featured && activeCategory === "All" && !searchQuery && (
            <BlogCard post={featured} featured />
          )}

          {/* ── Grid ─────────────────────────────────────────── */}
          {gridPosts.length > 0 ? (
            <div className="blog-grid">
              {gridPosts.map((post) => (
                <BlogCard key={post.id} post={post} />
              ))}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "4rem 0", color: "var(--landing-muted)" }}>
              <p style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>No articles found</p>
              <p style={{ fontSize: "0.9rem" }}>
                Try a different search term or{" "}
                <button
                  onClick={() => { setSearchQuery(""); setActiveCategory("All"); }}
                  style={{ color: "var(--ink)", fontWeight: 600, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                >
                  clear filters
                </button>
              </p>
            </div>
          )}
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
