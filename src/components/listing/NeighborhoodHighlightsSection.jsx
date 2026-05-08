import { getCityHighlights } from "../../data/cityHighlights";

const HighlightIcon = ({ idx }) => {
  if (idx % 3 === 0) {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 21h18" />
        <path d="M5 21V7l7-4 7 4v14" />
        <path d="M9 21v-8h6v8" />
      </svg>
    );
  }
  if (idx % 3 === 1) {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="5" r="2" />
        <path d="M12 7v4" />
        <path d="M5 21l7-10 7 10" />
        <path d="M8 17h8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 11l19-9-9 19-2-8-8-2z" />
    </svg>
  );
};

export default function NeighborhoodHighlightsSection({ cityKey = "antwerp", eyebrow = "Location" }) {
  const content = getCityHighlights(cityKey);
  return (
    <section className="ols-nbh" aria-label="Neighborhood highlights">
      <div className="ols-nbh__inner">
        <header className="ols-nbh__header">
          <span className="ols-nbh__eyebrow">{eyebrow}</span>
          <h2 className="ols-nbh__title">{content.title}</h2>
          <p className="ols-nbh__intro">{content.intro}</p>
        </header>
        <ul className="ols-nbh__grid">
          {content.items.map((item, idx) => (
            <li key={item.title} className="ols-nbh__card">
              <div className="ols-nbh__icon" aria-hidden="true">
                <HighlightIcon idx={idx} />
              </div>
              <div className="ols-nbh__card-body">
                <div className="ols-nbh__card-top">
                  <h3 className="ols-nbh__card-title">{item.title}</h3>
                  <span className="ols-nbh__pill">{item.distance}</span>
                </div>
                <p className="ols-nbh__card-desc">{item.desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
