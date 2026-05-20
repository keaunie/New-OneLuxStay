import { Link } from "react-router-dom";
import { formatPublishDate } from "../../utils/seo/blogSeo";

const ClockIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);

export default function BlogCard({ post, featured = false }) {
  if (!post) return null;
  const href = `/blog/${post.slug}`;

  if (featured) {
    return (
      <Link to={href} className="blog-featured" aria-label={`Read: ${post.title}`}>
        <div className="blog-featured__image-wrap">
          <img
            src={post.featuredImage}
            alt={post.featuredImageAlt || post.title}
            className="blog-featured__image"
            loading="lazy"
            decoding="async"
          />
        </div>
        <div className="blog-featured__body">
          <span className="blog-featured__badge">✦ Featured Article</span>
          <h2 className="blog-featured__title">{post.title}</h2>
          <p className="blog-featured__excerpt">{post.excerpt}</p>
          <div className="blog-featured__meta">
            <span>{post.author?.name}</span>
            <span className="blog-featured__meta-dot" />
            <span>{formatPublishDate(post.publishDate)}</span>
            <span className="blog-featured__meta-dot" />
            <span>{post.readingTime} min read</span>
          </div>
          <span className="blog-featured__read-more">
            Read Article <span aria-hidden="true">→</span>
          </span>
        </div>
      </Link>
    );
  }

  return (
    <Link to={href} className="blog-card" aria-label={`Read: ${post.title}`}>
      <div className="blog-card__image-wrap">
        <img
          src={post.featuredImage}
          alt={post.featuredImageAlt || post.title}
          className="blog-card__image"
          loading="lazy"
          decoding="async"
        />
      </div>
      <div className="blog-card__body">
        <span className="blog-card__category">{post.category}</span>
        <h3 className="blog-card__title">{post.title}</h3>
        <p className="blog-card__excerpt">{post.excerpt}</p>
        <div className="blog-card__footer">
          <span>{formatPublishDate(post.publishDate)}</span>
          <span className="blog-card__read-time">
            <ClockIcon />
            {post.readingTime} min
          </span>
        </div>
      </div>
    </Link>
  );
}
