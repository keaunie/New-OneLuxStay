import { Link } from "react-router-dom";
import usePageMeta from "../lib/usePageMeta.js";
import useResidences from "../lib/useResidences.js";
import ResidenceCard from "../components/ResidenceCard.jsx";
import { BUILDINGS, SITE } from "../data/content.js";

export default function Residences() {
  usePageMeta(
    "Furnished apartments in Torrance",
    "Browse furnished 2-bedroom apartments in Torrance, CA for monthly stays of 31 nights or more. Full kitchen, in-home washer and dryer, free parking and Wi-Fi included.",
  );
  const { residences, loading, live } = useResidences();

  return (
    <>
      <section className="page-head">
        <div className="container">
          <p className="eyebrow">Residences</p>
          <h1>Furnished apartments in Torrance, {SITE.minNights}+ nights</h1>
          <p className="page-head__lead">
            Furnished 2-bedroom apartments in South Torrance. Every home is fully furnished and ready to live in.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          {loading && <p className="section__note" role="status">Loading the latest homes…</p>}
          {!loading && !live && (
            <p className="section__note" role="status">
              We couldn&rsquo;t load photos just now. The homes below are current. <Link to="/contact">Contact us</Link> for photos and availability.
            </p>
          )}

          <div className="grid-residences">
            {residences.map((residence) => (
              <ResidenceCard key={residence.slug} residence={residence} loading={loading} />
            ))}
          </div>

          <div className="buildings">
            {BUILDINGS.map((building) => (
              <article key={building.key} className="info-card">
                <p className="eyebrow">{building.name}</p>
                <h3>{building.street}</h3>
                <p>{building.blurb}</p>
                <ul className="chips">
                  {building.highlights.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </article>
            ))}
          </div>

          <p className="section__note">
            {SITE.monthlyNote}: typically {SITE.monthlyRange}. Send us your dates for an exact quote.{" "}
            <Link to="/contact" className="link-arrow">Ask about availability</Link>
          </p>
        </div>
      </section>
    </>
  );
}
