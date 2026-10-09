import { useState } from "react";
import { Link } from "react-router-dom";
import usePageMeta from "../lib/usePageMeta.js";
import useResidences from "../lib/useResidences.js";
import ResidenceCard from "../components/ResidenceCard.jsx";
import { BUILDINGS, SITE } from "../data/content.js";

export default function Residences() {
  usePageMeta(
    "Furnished residences",
    "Browse furnished one-, two- and three-bedroom homes in Redondo Beach, California, available for stays of 31 nights or more.",
  );
  const { residences, loading, live } = useResidences();
  const [buildingKey, setBuildingKey] = useState("all");

  const visible = buildingKey === "all" ? residences : residences.filter((r) => r.building.key === buildingKey);

  return (
    <>
      <section className="page-head">
        <div className="container">
          <p className="eyebrow">Residences</p>
          <h1>Furnished homes for {SITE.minNights}+ night stays</h1>
          <p className="page-head__lead">
            One-, two- and three-bedroom homes across two buildings in Redondo Beach. Every home is fully furnished and
            ready to live in.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="filters" role="group" aria-label="Filter by building">
            <button type="button" className={buildingKey === "all" ? "is-active" : ""} onClick={() => setBuildingKey("all")}>
              All buildings
            </button>
            {BUILDINGS.map((building) => (
              <button
                key={building.key}
                type="button"
                className={buildingKey === building.key ? "is-active" : ""}
                onClick={() => setBuildingKey(building.key)}
              >
                {building.name}
              </button>
            ))}
          </div>

          {loading && <p className="section__note" role="status">Loading the latest homes…</p>}
          {!loading && !live && (
            <p className="section__note" role="status">
              We couldn&rsquo;t load photos just now. The homes below are current. <Link to="/contact">Contact us</Link> for photos and availability.
            </p>
          )}

          <div className="grid-residences">
            {visible.map((residence) => (
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
