import { useEffect, useRef, useState } from "react";

// Apaleo prices a specific stay (arrival/departure/adults) via /booking/v1/offers rather
// than exposing a day-by-day rate calendar, so this replaces the old Guesty-backed
// day-grid calendar with a "pick dates, then see live offers" flow for the four cities
// wired to the Apaleo booking engine.
//
// The guest already picked dates/guests on the property page before clicking Reserve
// (that's where defaultArrival/defaultDeparture/defaultAdults come from), so when those
// are present this step auto-searches immediately and shows a read-only summary instead
// of asking again. The editable form is only a fallback for the rare case a caller opens
// this modal without a pre-selected stay.

const describeGuarantee = (type) => {
  if (type === "PM6Hold") return "Pay at property — no payment required now";
  if (type === "CreditCard") return "Card on file — charged at the property";
  if (type === "Prepayment") return "Prepay now to confirm";
  return "";
};

const formatMoney = (money, fallbackCurrency = "") => {
  const amount = money?.amount ?? money?.grossAmount ?? money?.gross?.amount;
  const currency = money?.currency || money?.gross?.currency || fallbackCurrency;
  if (amount === undefined || amount === null || amount === "") return "";
  const numeric = Number(amount);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(numeric);
  } catch {
    return `${amount} ${currency}`.trim();
  }
};

const serviceName = (entry) => entry?.service?.name || entry?.name || entry?.serviceId || "Included service";

export default function DateOfferSearch({
  flow,
  defaultAdults = 2,
  defaultArrival = "",
  defaultDeparture = "",
  onOfferSelected,
}) {
  const [arrival, setArrival] = useState(defaultArrival);
  const [departure, setDeparture] = useState(defaultDeparture);
  const [adults, setAdults] = useState(defaultAdults);
  const [formError, setFormError] = useState("");
  const autoSearchedRef = useRef(false);
  const autoSelectedRef = useRef(false);

  const today = new Date().toISOString().slice(0, 10);
  const datesLocked = Boolean(defaultArrival && defaultDeparture);

  const runSearch = async (searchArrival, searchDeparture, searchAdults) => {
    setFormError("");
    try {
      await flow.searchOffers({ arrival: searchArrival, departure: searchDeparture, adults: searchAdults });
    } catch (err) {
      setFormError(err?.message || "Unable to check availability.");
    }
  };

  // Dates/guests were already chosen on the property page — search immediately
  // instead of making the guest re-enter them here.
  useEffect(() => {
    if (datesLocked && !autoSearchedRef.current && !flow.stay) {
      autoSearchedRef.current = true;
      runSearch(defaultArrival, defaultDeparture, defaultAdults);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datesLocked, defaultArrival, defaultDeparture, defaultAdults]);

  const handleSelect = async (offer) => {
    await flow.selectOffer(offer);
    onOfferSelected?.(offer);
  };

  // Most listings only have one bookable rate plan — skip the extra click when
  // there's nothing to actually choose between.
  useEffect(() => {
    if (flow.offers.length === 1 && !flow.selectedOffer && !autoSelectedRef.current) {
      autoSelectedRef.current = true;
      handleSelect(flow.offers[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.offers, flow.selectedOffer]);

  const handleSearch = async (event) => {
    event.preventDefault();
    if (!arrival || !departure) {
      setFormError("Select check-in and check-out dates.");
      return;
    }
    if (departure <= arrival) {
      setFormError("Check-out must be after check-in.");
      return;
    }
    await runSearch(arrival, departure, adults);
  };

  return (
    <div className="apaleo-offer-search">
      {datesLocked ? (
        <p className="apaleo-offer-search__summary">
          {defaultArrival} – {defaultDeparture} · {defaultAdults} guest{defaultAdults === 1 ? "" : "s"}
        </p>
      ) : (
        <form className="apaleo-offer-search__form" onSubmit={handleSearch}>
          <label className="apaleo-offer-search__field">
            <span>Check-in</span>
            <input type="date" min={today} value={arrival} onChange={(event) => setArrival(event.target.value)} required />
          </label>
          <label className="apaleo-offer-search__field">
            <span>Check-out</span>
            <input type="date" min={arrival || today} value={departure} onChange={(event) => setDeparture(event.target.value)} required />
          </label>
          <label className="apaleo-offer-search__field apaleo-offer-search__field--guests">
            <span>Guests</span>
            <input
              type="number"
              min={1}
              max={20}
              value={adults}
              onChange={(event) => setAdults(Math.max(1, Number(event.target.value) || 1))}
            />
          </label>
          <button type="submit" className="apaleo-offer-search__submit" disabled={flow.loading}>
            {flow.loading ? "Checking..." : "Check availability"}
          </button>
        </form>
      )}

      {flow.loading && datesLocked && (
        <p className="apaleo-offer-search__hint">Checking availability…</p>
      )}

      {(formError || flow.error) && (
        <p className="apaleo-offer-search__error">{formError || flow.error?.message}</p>
      )}

      {flow.offers.length > 0 && (
        <ul className="apaleo-offer-list">
          {flow.offers.map((offer) => {
            const isSelected =
              flow.selectedOffer?.ratePlanId === offer.ratePlanId &&
              flow.selectedOffer?.unitGroupId === offer.unitGroupId;
            return (
              <li key={`${offer.ratePlanId}-${offer.unitGroupId}`} className={`apaleo-offer-card${isSelected ? " is-selected" : ""}`}>
                <button type="button" className="apaleo-offer-card__button" onClick={() => handleSelect(offer)}>
                  <span className="apaleo-offer-card__name">{offer.unitGroupName || offer.ratePlanName}</span>
                  <span className="apaleo-offer-card__rate-plan">{offer.ratePlanName}</span>
                  <span className="apaleo-offer-card__price">
                    {formatMoney(offer.totalGrossAmount)} total
                  </span>
                  <span className="apaleo-offer-card__prepayment">
                    {formatMoney(offer.prePaymentGrossAmount, offer.totalGrossAmount?.currency)} due now
                  </span>
                  <span className="apaleo-offer-card__guarantee">{describeGuarantee(offer.minGuaranteeType)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {flow.selectedOffer && (
        <div className="apaleo-offer-breakdown" aria-live="polite">
          <h4>Price details</h4>
          <dl>
            <dt>Stay total</dt>
            <dd>{formatMoney(flow.selectedOffer.totalGrossAmount)}</dd>
            <dt>Due at booking</dt>
            <dd>{formatMoney(flow.selectedOffer.prePaymentGrossAmount, flow.selectedOffer.totalGrossAmount?.currency)}</dd>
            {flow.selectedOffer.cityTax && <><dt>City tax</dt><dd>{formatMoney(flow.selectedOffer.cityTax, flow.selectedOffer.totalGrossAmount?.currency) || "Calculated by Apaleo"}</dd></>}
          </dl>
          {flow.selectedOffer.mandatoryServices?.length > 0 && (
            <div className="apaleo-offer-services">
              <strong>Included mandatory services</strong>
              <ul>{flow.selectedOffer.mandatoryServices.map((service, index) => <li key={service?.service?.id || service?.id || index}>{serviceName(service)}</li>)}</ul>
            </div>
          )}
          {flow.serviceOffers.length > 0 && (
            <fieldset className="apaleo-offer-services">
              <legend>Optional extras</legend>
              {flow.serviceOffers.map((service) => (
                <label key={service.serviceId}>
                  <input type="checkbox" checked={flow.selectedServiceIds.includes(service.serviceId)} onChange={() => flow.toggleService(service.serviceId)} />
                  <span>{service.name} {formatMoney(service.totalAmount, service.prePaymentGrossAmount?.currency) ? `— ${formatMoney(service.totalAmount, service.prePaymentGrossAmount?.currency)}` : ""}</span>
                </label>
              ))}
            </fieldset>
          )}
        </div>
      )}

      {!flow.loading && flow.stay && flow.offers.length === 0 && !formError && !flow.error && (
        <p className="apaleo-offer-search__empty">No availability for these dates. Try different dates or fewer guests.</p>
      )}
    </div>
  );
}
