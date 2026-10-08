import { Link } from "react-router-dom";
import usePageMeta from "../lib/usePageMeta.js";
import { EXPLORE, SITE } from "../data/content.js";

export default function Explore() {
  usePageMeta(
    "Explore Redondo Beach",
    "A local guide to Redondo Beach: the pier, King Harbor marina, The Strand bike path, Riviera Village, the South Bay beach towns, parks and where to eat.",
  );

  return (
    <>
      <section className="page-head">
        <div className="container">
          <p className="eyebrow">Explore Redondo Beach</p>
          <h1>Where the Pacific breeze meets laid-back South Bay living</h1>
          <p className="page-head__lead">
            Redondo Beach is one of LA&rsquo;s beloved South Bay beach towns, quieter and more residential than Santa
            Monica, with a working pier, a marina, ocean-path cycling and fresh seafood close by.
          </p>
          <ul className="chips chips--row">
            {EXPLORE.map((category) => (
              <li key={category.id}><a href={`#${category.id}`}>{category.label}</a></li>
            ))}
          </ul>
        </div>
      </section>

      {EXPLORE.map((category, index) => (
        <section key={category.id} id={category.id} className={`section${index % 2 ? " section--tint" : ""}`}>
          <div className="container">
            <div className="explore-intro">
              <img src={category.image} alt="" loading="lazy" width="1100" height="733" />
              <div>
                <p className="eyebrow">{category.label}</p>
                <h2>{category.label}</h2>
                <p className="explore-intro__text">{category.narrative}</p>
              </div>
            </div>
            <div className="cards-3">
              {category.places.map((place) => (
                <article key={place.name} className="place-card">
                  <p className="place-card__tag">{place.tag}</p>
                  <h3>{place.name}</h3>
                  <p>{place.body}</p>
                  <p className="place-card__distance">{place.distance}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      ))}

      <section className="section section--cta">
        <div className="container container--narrow center">
          <h2>Make it your neighbourhood</h2>
          <p>Stay {SITE.minNights} nights or more in a furnished home close to all of it.</p>
          <div className="hero__actions hero__actions--center">
            <Link to="/residences" className="btn btn--primary">See the residences</Link>
            <Link to="/contact" className="btn btn--light">Ask about monthly rates</Link>
          </div>
          <p className="section__note section__note--light">
            Walking and driving times are approximate and measured from central Redondo Beach. Ask us how far a
            specific home is from where you&rsquo;ll be spending your time.
          </p>
        </div>
      </section>
    </>
  );
}
