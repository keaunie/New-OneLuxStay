import { BLOG_CATEGORIES } from "../../data/blogPosts";

export default function BlogCategoryFilter({ active, onChange }) {
  return (
    <div className="blog-categories" role="list" aria-label="Filter by category">
      {BLOG_CATEGORIES.map((cat) => (
        <button
          key={cat}
          role="listitem"
          className={`blog-category-chip${active === cat ? " is-active" : ""}`}
          onClick={() => onChange(cat)}
          aria-pressed={active === cat}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}
