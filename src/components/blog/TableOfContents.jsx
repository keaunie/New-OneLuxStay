import { useState, useEffect } from "react";

export default function TableOfContents({ items = [] }) {
  const [activeId, setActiveId] = useState("");

  useEffect(() => {
    if (!items.length) return;
    const headingIds = items.map((item) => item.id).filter(Boolean);

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 },
    );

    headingIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [items]);

  if (!items.length) return null;

  return (
    <div className="article-sidebar__box">
      <p className="article-sidebar__title">Contents</p>
      <nav aria-label="Table of contents">
        <ul className="toc-list">
          {items.map((item) => (
            <li key={item.id} className="toc-item">
              <a
                href={`#${item.id}`}
                className={`toc-link${activeId === item.id ? " is-active" : ""}`}
                onClick={(e) => {
                  e.preventDefault();
                  const el = document.getElementById(item.id);
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                {item.text}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
