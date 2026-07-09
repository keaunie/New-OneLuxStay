const SITE_URL = "https://oneluxstay.com";
const SITE_NAME = "OneLuxStay";

export const buildCanonicalUrl = (path = "") =>
  `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;

export const buildBlogPostSchema = (post) => {
  if (!post) return null;
  const url = buildCanonicalUrl(`/blog/${post.slug}`);
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.seoTitle || post.title,
    description: post.seoDescription || post.excerpt,
    image: post.featuredImage,
    url,
    datePublished: post.publishDate,
    dateModified: post.updatedDate || post.publishDate,
    author: {
      "@type": "Person",
      name: post.author?.name || SITE_NAME,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/ols-logo.webp`,
      },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    keywords: (post.keywords || []).join(", "),
    wordCount: estimateWordCount(post.content),
    timeRequired: `PT${post.readingTime || 8}M`,
  };
};

export const buildBreadcrumbSchema = (items = []) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((item, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: item.name,
    item: buildCanonicalUrl(item.path),
  })),
});

export const buildFaqSchema = (faqs = []) => {
  if (!faqs.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
};

export const buildBlogListSchema = (posts = []) => ({
  "@context": "https://schema.org",
  "@type": "Blog",
  name: `${SITE_NAME} Travel Blog`,
  description:
    "Expert guides to luxury short-term rentals in Dubai, Antwerp, Los Angeles, and Redondo Beach.",
  url: buildCanonicalUrl("/blog"),
  publisher: {
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
  },
  blogPost: posts.map((p) => ({
    "@type": "BlogPosting",
    headline: p.title,
    url: buildCanonicalUrl(`/blog/${p.slug}`),
    datePublished: p.publishDate,
    image: p.featuredImage,
    author: { "@type": "Person", name: p.author?.name || SITE_NAME },
  })),
});

const estimateWordCount = (content = []) => {
  if (!Array.isArray(content)) return 800;
  return content.reduce((total, block) => {
    if (block.type === "paragraph" || block.type === "heading") {
      return total + (block.text || "").split(/\s+/).length;
    }
    if (block.type === "list") {
      return total + (block.items || []).join(" ").split(/\s+/).length;
    }
    if (block.type === "faq") {
      return (
        total +
        (block.items || []).reduce(
          (s, item) =>
            s + (item.question || "").split(/\s+/).length + (item.answer || "").split(/\s+/).length,
          0,
        )
      );
    }
    return total;
  }, 0);
};

export const formatPublishDate = (dateStr = "") => {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
};
