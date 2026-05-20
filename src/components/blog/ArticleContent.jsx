import { useState } from "react";
import { Link } from "react-router-dom";
import { CITY_INTERNAL_LINKS } from "../../utils/seo/internalLinks";

const PlusIcon = ({ open }) => (
  <svg
    className={`article-faq__icon${open ? " is-open" : ""}`}
    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
    strokeLinecap="round" strokeLinejoin="round"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const TipIcon = () => (
  <svg className="article-callout__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const injectInternalLinks = (text = "") => {
  if (!text) return text;
  let result = text;
  const replacements = [];

  CITY_INTERNAL_LINKS.forEach(({ pattern, href, label }) => {
    let match;
    const re = new RegExp(pattern.source, pattern.flags);
    while ((match = re.exec(result)) !== null) {
      replacements.push({ index: match.index, length: match[0].length, text: label || match[0], href });
    }
  });

  if (!replacements.length) return <>{text}</>;

  replacements.sort((a, b) => a.index - b.index);
  const parts = [];
  let cursor = 0;

  replacements.forEach((rep, i) => {
    if (rep.index < cursor) return;
    if (rep.index > cursor) parts.push(text.slice(cursor, rep.index));
    parts.push(
      <Link key={`il-${i}`} to={rep.href} className="internal-link">
        {rep.text}
      </Link>,
    );
    cursor = rep.index + rep.length;
  });

  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
};

function FaqBlock({ items }) {
  const [openIndex, setOpenIndex] = useState(null);
  return (
    <div className="article-faq">
      {items.map((item, i) => (
        <div key={i} className="article-faq__item">
          <button
            className="article-faq__question"
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            aria-expanded={openIndex === i}
          >
            <span>{item.question}</span>
            <PlusIcon open={openIndex === i} />
          </button>
          {openIndex === i && (
            <div className="article-faq__answer">{item.answer}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function renderBlock(block, index) {
  switch (block.type) {
    case "heading":
      if (block.level === 2) {
        return (
          <h2 key={index} id={block.id}>
            {block.text}
          </h2>
        );
      }
      return (
        <h3 key={index} id={block.id}>
          {block.text}
        </h3>
      );

    case "paragraph":
      return <p key={index}>{injectInternalLinks(block.text)}</p>;

    case "list":
      if (block.ordered) {
        return (
          <ol key={index}>
            {block.items.map((item, i) => (
              <li key={i}>{injectInternalLinks(item)}</li>
            ))}
          </ol>
        );
      }
      return (
        <ul key={index}>
          {block.items.map((item, i) => (
            <li key={i}>{injectInternalLinks(item)}</li>
          ))}
        </ul>
      );

    case "quote":
      return (
        <blockquote key={index} className="article-quote">
          <p className="article-quote__text">"{block.text}"</p>
          {block.author && <cite className="article-quote__author">— {block.author}</cite>}
        </blockquote>
      );

    case "callout":
      return (
        <div key={index} className={`article-callout article-callout--${block.variant || "tip"}`}>
          <TipIcon />
          <span>{block.text}</span>
        </div>
      );

    case "cta":
      return (
        <div key={index} className={`article-inline-cta article-inline-cta--${block.variant || "default"}`}>
          <p className="article-inline-cta__title">{block.title}</p>
          <p className="article-inline-cta__desc">{block.description}</p>
          <Link to={block.buttonHref} className="article-inline-cta__btn">
            {block.buttonText} →
          </Link>
        </div>
      );

    case "faq":
      return <FaqBlock key={index} items={block.items || []} />;

    case "image":
      return (
        <figure key={index} style={{ margin: "2rem 0" }}>
          <img
            src={block.src}
            alt={block.alt || ""}
            style={{ width: "100%", borderRadius: "12px", display: "block" }}
            loading="lazy"
            decoding="async"
          />
          {block.caption && (
            <figcaption style={{ fontSize: "0.82rem", color: "var(--landing-muted)", marginTop: "0.5rem", textAlign: "center" }}>
              {block.caption}
            </figcaption>
          )}
        </figure>
      );

    default:
      return null;
  }
}

export default function ArticleContent({ content = [] }) {
  return (
    <div className="article-body">
      {content.map((block, i) => renderBlock(block, i))}
    </div>
  );
}
