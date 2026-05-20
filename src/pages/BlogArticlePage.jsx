import { useParams, Link, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { getBlogPost, getRelatedPosts } from "../data/blogPosts";
import {
  buildCanonicalUrl,
  buildBlogPostSchema,
  buildBreadcrumbSchema,
  buildFaqSchema,
  formatPublishDate,
} from "../utils/seo/blogSeo";
import ArticleContent from "../components/blog/ArticleContent";
import ArticleSidebar from "../components/blog/ArticleSidebar";
import RelatedArticles from "../components/blog/RelatedArticles";
import SiteFooter from "../components/SiteFooter";
import "../styles/blog.css";

export default function BlogArticlePage() {
  const { slug } = useParams();
  const post = getBlogPost(slug);

  if (!post) return <Navigate to="/blog" replace />;

  const related = getRelatedPosts(post, 3);
  const canonical = buildCanonicalUrl(`/blog/${post.slug}`);

  const faqBlock = post.content?.find((b) => b.type === "faq");
  const faqSchema = faqBlock ? buildFaqSchema(faqBlock.items || []) : null;

  const postSchema = JSON.stringify(buildBlogPostSchema(post));
  const breadcrumbSchema = JSON.stringify(
    buildBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Blog", path: "/blog" },
      { name: post.title, path: `/blog/${post.slug}` },
    ]),
  );

  return (
    <>
      <Helmet>
        <title>{post.seoTitle || post.title}</title>
        <meta name="description" content={post.seoDescription || post.excerpt} />
        <meta name="keywords" content={(post.keywords || []).join(", ")} />
        <link rel="canonical" href={canonical} />

        <meta property="og:title" content={post.seoTitle || post.title} />
        <meta property="og:description" content={post.seoDescription || post.excerpt} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="article" />
        <meta property="og:image" content={post.featuredImage} />
        <meta property="article:published_time" content={post.publishDate} />
        <meta property="article:modified_time" content={post.updatedDate || post.publishDate} />
        <meta property="article:author" content={post.author?.name} />
        <meta property="article:section" content={post.category} />
        {(post.keywords || []).map((kw) => (
          <meta key={kw} property="article:tag" content={kw} />
        ))}

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={post.seoTitle || post.title} />
        <meta name="twitter:description" content={post.seoDescription || post.excerpt} />
        <meta name="twitter:image" content={post.featuredImage} />

        <script type="application/ld+json">{postSchema}</script>
        <script type="application/ld+json">{breadcrumbSchema}</script>
        {faqSchema && (
          <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
        )}
      </Helmet>

      <article className="article-page" itemScope itemType="https://schema.org/BlogPosting">
        {/* ── Hero ─────────────────────────────────────────── */}
        <header className="article-hero">
          <img
            src={post.featuredImage}
            alt={post.featuredImageAlt || post.title}
            className="article-hero__image"
            loading="eager"
            decoding="async"
            fetchPriority="high"
            itemProp="image"
          />
          <div className="article-hero__overlay" aria-hidden="true" />
          <div className="article-hero__content">
            <p className="article-hero__category">{post.category}</p>
            <h1 className="article-hero__title" itemProp="headline">{post.title}</h1>
            <div className="article-hero__meta">
              <span itemProp="author" itemScope itemType="https://schema.org/Person">
                <span itemProp="name">{post.author?.name}</span>
              </span>
              <span className="article-hero__meta-dot" aria-hidden="true" />
              <time dateTime={post.publishDate} itemProp="datePublished">
                {formatPublishDate(post.publishDate)}
              </time>
              {post.updatedDate && post.updatedDate !== post.publishDate && (
                <time dateTime={post.updatedDate} itemProp="dateModified" style={{ display: "none" }}>
                  {post.updatedDate}
                </time>
              )}
              <span className="article-hero__meta-dot" aria-hidden="true" />
              <span>{post.readingTime} min read</span>
            </div>
          </div>
        </header>

        {/* ── Body ─────────────────────────────────────────── */}
        <div className="article-layout">
          <div className="article-content">
            {/* Breadcrumb */}
            <nav className="article-breadcrumb" aria-label="Breadcrumb">
              <Link to="/">Home</Link>
              <span className="article-breadcrumb__sep" aria-hidden="true">›</span>
              <Link to="/blog">Blog</Link>
              <span className="article-breadcrumb__sep" aria-hidden="true">›</span>
              <span aria-current="page">{post.category}</span>
            </nav>

            {/* Excerpt lead */}
            <p
              itemProp="description"
              style={{
                fontSize: "1.15rem",
                fontWeight: 500,
                color: "var(--landing-muted)",
                lineHeight: 1.7,
                marginBottom: "2rem",
                borderLeft: "3px solid var(--landing-amber)",
                paddingLeft: "1.25rem",
              }}
            >
              {post.excerpt}
            </p>

            <div itemProp="articleBody">
              <ArticleContent content={post.content} />
            </div>

            {/* Author bio */}
            {post.author?.bio && (
              <div
                style={{
                  marginTop: "3rem",
                  padding: "1.5rem",
                  background: "var(--landing-card)",
                  border: "1px solid var(--landing-stroke)",
                  borderRadius: "14px",
                  display: "flex",
                  gap: "1rem",
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    background: "var(--landing-amber-soft)",
                    border: "1px solid var(--landing-stroke)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    fontSize: "1.2rem",
                    color: "var(--landing-amber)",
                    fontFamily: "var(--landing-font-display)",
                    fontWeight: 600,
                  }}
                >
                  {post.author.name.charAt(0)}
                </div>
                <div>
                  <p style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--ink)", marginBottom: "0.25rem" }}>
                    {post.author.name}
                  </p>
                  <p style={{ fontSize: "0.85rem", color: "var(--landing-muted)", lineHeight: 1.6 }}>
                    {post.author.bio}
                  </p>
                </div>
              </div>
            )}
          </div>

          <ArticleSidebar toc={post.tableOfContents || []} relatedCities={post.relatedCities || []} />
        </div>
      </article>

      {related.length > 0 && <RelatedArticles posts={related} />}

      <SiteFooter />
    </>
  );
}
