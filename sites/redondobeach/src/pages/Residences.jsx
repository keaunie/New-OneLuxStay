import { Link } from "react-router-dom";
import usePageMeta from "../lib/usePageMeta.js";
import useResidences from "../lib/useResidences.js";
import ResidenceCard from "../components/ResidenceCard.jsx";
import { BUILDINGS, SITE } from "../data/content.js";

export default function Residences() {
  usePageMeta(
    "Monthly Furnished Apartments in Redondo Beach",
    "Furnished 1-bedroom apartments in Redondo Beach, California, for monthly and mid-term stays of 31 nights or more. Executive-style suites near the pier and marina. From $4,500 per month on a 6-month contract.",
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
                <h3><a href={building.mapsUrl} target="_blank" rel="noopener noreferrer">{building.street}</a></h3>
                <p>{building.blurb}</p>
                <ul className="chips">
                  {building.highlights.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </article>
            ))}
          </div>

          <p className="section__note">
            {SITE.monthlyNote}: homes start from {SITE.monthlyRange} on a 6-month contract. Send us your dates to check availability.{" "}
            <Link to="/contact" className="link-arrow">Ask about availability</Link>
          </p>
        </div>
      </section>
    </>
  );
}
