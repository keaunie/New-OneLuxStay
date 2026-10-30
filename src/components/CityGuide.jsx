import { getCityGuide } from "../data/cityGuides";
import "./CityGuide.css";

// Written guide under the listings on city and neighbourhood pages. The same text is
// pre-rendered for search engines by scripts/prerender-seo.js.
export default function CityGuide({ cityKey, areaSlug }) {
  const guide = getCityGuide(cityKey, areaSlug);
  if (!guide) return null;

  return (
    <section className="city-guide" aria-labelledby={`city-guide-${cityKey}`}>
      <h2 id={`city-guide-${cityKey}`} className="city-guide__title">{guide.title}</h2>
      {guide.sections.map((section, index) => (
        <div key={section.heading || index} className="city-guide__section">
          {section.heading ? <h3 className="city-guide__heading">{section.heading}</h3> : null}
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 40)}>{paragraph}</p>
          ))}
        </div>
      ))}
      {guide.faqs?.length ? (
        <div className="city-guide__faqs">
          <h3 className="city-guide__heading">Good to know</h3>
          {guide.faqs.map((faq) => (
            <details key={faq.q} className="city-guide__faq">
              <summary>{faq.q}</summary>
              <p>{faq.a}</p>
            </details>
          ))}
        </div>
      ) : null}
    </section>
  );
}
