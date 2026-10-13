import { Link } from "react-router-dom";
import usePageMeta from "../lib/usePageMeta.js";
import useResidences from "../lib/useResidences.js";
import ResidenceCard from "../components/ResidenceCard.jsx";
import { BUILDINGS, SITE } from "../data/content.js";

export default function Residences() {
  usePageMeta(
    "Furnished apartments in Redondo Beach",
    "Furnished apartments and modern 1-bedroom rentals in Redondo Beach, California, for stays of 31 nights or more. Executive-style suites near the pier and marina, $3,900 per month.",
  );
  const { residences, loading, live } = useResidences();

  return (
    <>
      <section className="page-head">
        <div className="container">
          <p className="eyebrow">Residences</p>
          <h1>Furnished homes for {SITE.minNights}+ night stays</h1>
          <p className="page-head__lead">
            Modern furnished apartments in Redondo Beach, each a one-bedroom suite ready to live in.
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
            {SITE.monthlyNote}: {SITE.monthlyRange} for every home. Send us your dates to check availability.{" "}
            <Link to="/contact" className="link-arrow">Ask about availability</Link>
          </p>
        </div>
      </section>
    </>
  );
}
