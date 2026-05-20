import BlogCard from "./BlogCard";

export default function RelatedArticles({ posts = [] }) {
  if (!posts.length) return null;
  return (
    <section className="related-section" aria-label="Related articles">
      <h2 className="related-section__title">You Might Also Enjoy</h2>
      <div className="related-grid">
        {posts.map((post) => (
          <BlogCard key={post.id} post={post} />
        ))}
      </div>
    </section>
  );
}
