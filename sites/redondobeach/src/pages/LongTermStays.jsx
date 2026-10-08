import { Link } from "react-router-dom";
import usePageMeta from "../lib/usePageMeta.js";
import { FAQS, SITE, STEPS, WHO_FOR, WHY_LONG_TERM } from "../data/content.js";

export default function LongTermStays() {
  usePageMeta(
    "Long-term stays",
    `How long-term stays work at OneLuxStay Redondo Beach: furnished homes, ${SITE.minNights}-night minimum, monthly seasonal pricing, and answers to common questions.`,
  );

  return (
    <>
      <section className="page-head">
        <div className="container">
          <p className="eyebrow">Long-term stays</p>
          <h1>Furnished homes for {SITE.minNights} nights or more</h1>
          <p className="page-head__lead">
            Our Redondo Beach homes are offered for long stays only. That means simple monthly pricing, homes set up for
            everyday living, and a team that knows the area.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="cards-3">
            {WHY_LONG_TERM.map((item) => (
              <article key={item.title} className="info-card">
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--tint">
        <div className="container split">
          <div>
            <p className="eyebrow">Pricing</p>
            <h2>{SITE.monthlyNote}</h2>
            <p className="price-line">{SITE.monthlyRange}</p>
            <p>
              Rates move with the season and depend on the home you choose and the length of your stay. Send us your
              dates and we&rsquo;ll quote you exactly, including what&rsquo;s included in your monthly rate and any
              deposit.
            </p>
            <Link to="/contact" className="btn btn--primary">Request a quote</Link>
          </div>
          <div>
            <p className="eyebrow">Who it&rsquo;s for</p>
            <h2>Stays that suit you</h2>
            <ul className="tick-list">
              {WHO_FOR.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container container--narrow">
          <header className="section__head">
            <p className="eyebrow">How it works</p>
            <h2>From inquiry to keys in four steps</h2>
          </header>
          <ol className="steps">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <span className="steps__num">{index + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section section--tint">
        <div className="container container--narrow">
          <header className="section__head">
            <p className="eyebrow">FAQ</p>
            <h2>Long-term stay questions</h2>
          </header>
          <div className="faq">
            {FAQS.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--cta">
        <div className="container container--narrow center">
          <h2>Ready to plan your stay?</h2>
          <p>Tell us when you&rsquo;d like to arrive and we&rsquo;ll take it from there.</p>
          <div className="hero__actions hero__actions--center">
            <Link to="/contact" className="btn btn--primary">Send an inquiry</Link>
            <Link to="/residences" className="btn btn--light">Browse residences</Link>
          </div>
        </div>
      </section>
    </>
  );
}
