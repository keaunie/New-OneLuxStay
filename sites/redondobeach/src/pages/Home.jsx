import { Suspense, lazy } from "react";
import { Link } from "react-router-dom";
import { prefersReducedMotion } from "../lib/motion.js";
import usePageMeta from "../lib/usePageMeta.js";
import useResidences from "../lib/useResidences.js";
import ResidenceCard from "../components/ResidenceCard.jsx";
import HeroCards from "../components/HeroCards.jsx";
import InquiryForm from "../components/InquiryForm.jsx";
import { EXPLORE, FAQS, IMAGES, QUICK_FACTS, SITE, STEPS, WHO_FOR, WHY_LONG_TERM } from "../data/content.js";

// The 3D scene is its own chunk so the page text and photos never wait on three.js.
const BeachScene = lazy(() => import("../components/BeachScene.jsx"));
const PhotoBackdrop = lazy(() => import("../components/PhotoBackdrop.jsx"));

// Real photos are the default backdrop. Add ?scene=3d to the URL to see the original 3D scene.
const wants3d = () => new URLSearchParams(window.location.search).get("scene") === "3d";

export default function Home() {
  usePageMeta(
    null,
    "Furnished apartments in Redondo Beach, CA: modern 1-bedroom rentals for stays of 31+ nights, a short walk to the pier, marina and beach. Free parking. Pricing starting at $3,600 per month on a 6-month contract.",
  );
  const { residences, loading } = useResidences();

  return (
    <>
      {!prefersReducedMotion() && (
        <Suspense fallback={null}>
          {wants3d() ? <BeachScene /> : <PhotoBackdrop />}
        </Suspense>
      )}
      <section className="hero" style={{ backgroundImage: `url(${IMAGES.hero})` }}>
        <div className="hero__shade" />
        <div className="container hero__content">
          <p className="eyebrow eyebrow--light">Redondo Beach, California</p>
          <h1>Furnished apartments in Redondo Beach. Stay a month, or longer.</h1>
          <p className="hero__lead">
            Modern furnished rentals for stays of {SITE.minNights} nights or more, close to the pier, the marina and
            the beach, with the comforts of home already in place.
          </p>
          <div className="hero__actions">
            <Link to="/residences" className="btn btn--primary">See the residences</Link>
            <Link to="/contact" className="btn btn--light">Ask about monthly rates</Link>
          </div>
        </div>
        <HeroCards residences={residences} />
      </section>

      <section className="facts-bar" aria-label="At a glance">
        <div className="container facts-bar__grid">
          {QUICK_FACTS.map((fact) => (
            <div key={fact.label}>
              <p className="facts-bar__label">{fact.label}</p>
              <p className="facts-bar__value">{fact.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="beat">
        <div className="container beat__inner">
          <p className="eyebrow eyebrow--light">Morning</p>
          <p className="beat__text">Coffee on the sand, sunlight on the water.</p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <header className="section__head">
            <p className="eyebrow">Why stay long-term with us</p>
            <h2>A home, not just a room</h2>
          </header>
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
        <div className="container">
          <header className="section__head section__head--row">
            <div>
              <p className="eyebrow">Our residences</p>
              <h2>Furnished one-bedroom homes in Redondo Beach</h2>
            </div>
            <Link to="/residences" className="link-arrow">View all residences</Link>
          </header>
          <div className="grid-residences">
            {residences.map((residence) => (
              <ResidenceCard key={residence.slug} residence={residence} loading={loading} />
            ))}
          </div>
          <p className="section__note">
            Homes start from {SITE.monthlyRange} on a 6-month contract. Tell us when you&rsquo;d like to move in and we&rsquo;ll confirm
            availability.
          </p>
        </div>
      </section>

      <section className="beat">
        <div className="container beat__inner">
          <p className="eyebrow eyebrow--light">Afternoon</p>
          <p className="beat__text">Walk out along the pier and watch the South Bay go by.</p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <header className="section__head section__head--row">
            <div>
              <p className="eyebrow">Life in Redondo Beach</p>
              <h2>The South Bay, on your doorstep</h2>
            </div>
            <Link to="/explore" className="link-arrow">Explore Redondo Beach</Link>
          </header>
          <div className="grid-explore">
            {EXPLORE.map((category) => (
              <Link key={category.id} to="/explore" className="explore-tile" style={{ backgroundImage: `url(${category.image})` }}>
                <span className="explore-tile__shade" />
                <span className="explore-tile__label">{category.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--tint">
        <div className="container split">
          <div>
            <p className="eyebrow">Who it&rsquo;s for</p>
            <h2>Made for the way people really stay</h2>
            <ul className="tick-list">
              {WHO_FOR.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div>
            <p className="eyebrow">How it works</p>
            <h2>From inquiry to keys in four steps</h2>
            <ol className="steps">
              <svg className="steps__line" viewBox="0 0 2 100" preserveAspectRatio="none" aria-hidden="true">
                <path d="M1 0 V100" vectorEffect="non-scaling-stroke" />
              </svg>
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
        </div>
      </section>

      <section className="beat">
        <div className="container beat__inner">
          <p className="eyebrow eyebrow--light">Golden hour</p>
          <p className="beat__text">Every evening, the whole coast turns to gold.</p>
        </div>
      </section>

      <section className="section">
        <div className="container container--narrow">
          <header className="section__head">
            <p className="eyebrow">Good to know</p>
            <h2>Long-term stay questions</h2>
          </header>
          <div className="faq">
            {FAQS.slice(0, 4).map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
          <p className="section__note"><Link to="/long-term-stays" className="link-arrow">More about long-term stays</Link></p>
        </div>
      </section>

      <section className="beat">
        <div className="container beat__inner">
          <p className="eyebrow eyebrow--light">Dusk</p>
          <p className="beat__text">Then the pier lights come on. Stay as long as you like.</p>
        </div>
      </section>

      <section className="section section--cta" id="inquire">
        <div className="container split split--center">
          <div>
            <p className="eyebrow eyebrow--light">Plan your stay</p>
            <h2>Tell us when you&rsquo;d like to arrive</h2>
            <p>
              Send your dates and we&rsquo;ll come back with the homes that fit and your monthly rate. Prefer to talk?
              Call <a href={SITE.phone.href}>{SITE.phone.display}</a>.
            </p>
          </div>
          <div className="panel">
            <InquiryForm compact />
          </div>
        </div>
      </section>
    </>
  );
}
