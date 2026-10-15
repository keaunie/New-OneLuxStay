import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import usePageMeta from "../lib/usePageMeta.js";
import useResidences from "../lib/useResidences.js";
import InquiryForm from "../components/InquiryForm.jsx";
import PhotoImage from "../components/PhotoImage.jsx";
import { resizePhoto } from "../lib/residences.js";
import { BATHROOM_AMENITY, SITE, SLEEPING } from "../data/content.js";
import NotFound from "./NotFound.jsx";

// Same OpenStreetMap embed the main oneluxstay.com site uses, centred on the building's own coordinates.
const MAP_SPAN = 0.0035;
const buildMapUrl = ({ lat, lng }) =>
  `https://www.openstreetmap.org/export/embed.html?bbox=${lng - MAP_SPAN}%2C${lat - MAP_SPAN}%2C${lng + MAP_SPAN}%2C${lat + MAP_SPAN}&layer=mapnik&marker=${lat}%2C${lng}`;

function Lightbox({ photos, index, onClose, onChange }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") onChange((index + 1) % photos.length);
      if (event.key === "ArrowLeft") onChange((index - 1 + photos.length) % photos.length);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [index, photos.length, onClose, onChange]);

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Photo gallery">
      <button type="button" className="lightbox__close" onClick={onClose}>Close</button>
      <button type="button" className="lightbox__nav lightbox__nav--prev" onClick={() => onChange((index - 1 + photos.length) % photos.length)} aria-label="Previous photo">‹</button>
      <div className="lightbox__stage">
        <PhotoImage key={photos[index]} src={resizePhoto(photos[index], 1600)} alt={`Photo ${index + 1} of ${photos.length}`} eager fit="contain" />
      </div>
      <button type="button" className="lightbox__nav lightbox__nav--next" onClick={() => onChange((index + 1) % photos.length)} aria-label="Next photo">›</button>
      <p className="lightbox__count">{index + 1} / {photos.length}</p>
    </div>
  );
}

export default function ResidenceDetail() {
  const { slug } = useParams();
  const { residences, loading } = useResidences();
  const residence = residences.find((item) => item.slug === slug);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  usePageMeta(
    residence ? residence.title : "Residence",
    residence
      ? `Furnished ${residence.bedrooms}-bedroom apartment at ${residence.building.name}, Redondo Beach. ${residence.bathrooms} bath, sleeps ${residence.sleeps}, free parking, for stays of ${SITE.minNights} nights or more. ${SITE.monthlyStarts}.`
      : undefined,
  );

  if (!residence) {
    if (loading) return <section className="section"><div className="container"><p>Loading…</p></div></section>;
    return <NotFound />;
  }

  const photos = residence.photos;
  const gallery = photos.slice(0, 5);
  const amenities = residence.allAmenities.length ? residence.allAmenities : residence.amenities;
  const bathroomItems = amenities.filter((item) => BATHROOM_AMENITY.test(item));

  return (
    <>
      <section className="detail-head">
        <div className="container">
          <p className="crumbs"><Link to="/residences">Residences</Link> / {residence.building.name}</p>
          <p className="eyebrow">{residence.building.name} &middot; Redondo Beach</p>
          <h1>{residence.name}</h1>
          <ul className="facts facts--large">
            <li>{residence.bedrooms} bedroom{residence.bedrooms === 1 ? "" : "s"}</li>
            <li>{residence.bathrooms} bath</li>
            <li>Sleeps {residence.sleeps}</li>
            <li>{SITE.minNights}+ nights</li>
          </ul>
        </div>
      </section>

      <section className="container">
        {loading && gallery.length === 0 ? (
          <div className="gallery gallery--5" aria-busy="true" aria-label="Loading photos">
            {[0, 1, 2, 3, 4].map((index) => (
              <span key={index} className="gallery__item">
                <span className="photo photo--loading">
                  <span className="photo__spinner" role="status" aria-label="Loading photo" />
                </span>
              </span>
            ))}
          </div>
        ) : gallery.length > 0 ? (
          <div className={`gallery gallery--${Math.min(gallery.length, 5)}`}>
            {gallery.map((photo, index) => (
              <button key={photo} type="button" className="gallery__item" onClick={() => setLightboxIndex(index)} aria-label={`Open photo ${index + 1}`}>
                <PhotoImage key={photo} src={resizePhoto(photo, index === 0 ? 1200 : 700)} alt={index === 0 ? `Furnished apartment in Redondo Beach: ${residence.title} interior` : ""} eager={index === 0} />
              </button>
            ))}
            {photos.length > 5 && (
              <button type="button" className="gallery__more" onClick={() => setLightboxIndex(0)}>
                View all {photos.length} photos
              </button>
            )}
          </div>
        ) : (
          <div className="gallery-empty">Photos coming soon. <Link to="/contact">Contact us</Link> and we&rsquo;ll send them over.</div>
        )}
      </section>

      <section className="section">
        <div className="container detail-grid">
          <div>
            <h2>About this residence</h2>
            <p>
              A furnished {residence.bedrooms}-bedroom home on {residence.building.street.split(",")[0]} in Redondo
              Beach, set up for stays of {SITE.minNights} nights or more. {residence.building.blurb}
            </p>
            <p>
              {residence.units > 1
                ? `We have ${residence.units} homes of this type, so ask us about the best match for your dates.`
                : "Ask us about availability for your dates."}
            </p>

            <h3>Sleeping arrangements</h3>
            <ul className="amenities">
              {SLEEPING.map((item) => (
                <li key={item.room}><strong>{item.room}:</strong> {item.beds}</li>
              ))}
            </ul>

            <h3>Bathroom</h3>
            <ul className="amenities">
              <li><strong>{residence.bathrooms} bathroom{residence.bathrooms === 1 ? "" : "s"}</strong></li>
              {bathroomItems.map((item) => <li key={item}>{item}</li>)}
            </ul>

            <h3>Amenities</h3>
            {loading ? (
              <p className="section__note" role="status">Loading amenities…</p>
            ) : (
              <ul className="amenities">
                {amenities.filter((item) => !BATHROOM_AMENITY.test(item)).map((item) => <li key={item}>{item}</li>)}
              </ul>
            )}

            <h3>Location</h3>
            <p>{residence.building.street}</p>
            <div className="location-map">
              <iframe
                title={`Map showing ${residence.building.street}`}
                src={buildMapUrl(residence.building.coords)}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
            <p>
              <Link to="/explore" className="link-arrow">See what&rsquo;s nearby in Redondo Beach</Link>
            </p>
          </div>

          <aside className="booking-card" id="inquire">
            <p className="booking-card__badge">{SITE.minNights}+ nights only</p>
            <p className="booking-card__price">{SITE.monthlyStarts}</p>
            <p className="booking-card__note">{SITE.monthlyNote}. Share your dates to check availability.</p>
            <InquiryForm residence={residence.title} compact />
          </aside>
        </div>
      </section>

      {lightboxIndex !== null && (
        <Lightbox photos={photos} index={lightboxIndex} onClose={() => setLightboxIndex(null)} onChange={setLightboxIndex} />
      )}
    </>
  );
}
