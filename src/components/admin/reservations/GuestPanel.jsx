const Row = ({ label, value, mono = false }) => (
  <div className="ar-field">
    <span className="ar-field-label">{label}</span>
    <span className={`ar-field-value${mono ? " ar-mono" : ""}${!value ? " ar-muted" : ""}`}>
      {value || "—"}
    </span>
  </div>
);

const formatAddress = (address) => {
  if (!address || typeof address !== "object") return null;
  const parts = [
    address.line1 || address.addressLine1 || address.street,
    address.line2 || address.addressLine2,
    address.city || address.locality,
    address.region || address.state,
    address.postalCode || address.zip,
    (address.countryCode || address.country || "").toUpperCase(),
  ].map((v) => String(v || "").trim()).filter(Boolean);
  return parts.length ? parts.join(", ") : null;
};

const extractGuest = (reservation) => {
  if (!reservation) return {};
  const raw = reservation.raw || reservation;

  const candidates = [
    reservation.guestProfile,
    reservation.guest,
    raw?.primaryGuest,
    raw?.booker,
    raw?.guest,
    raw?.contact,
  ].filter((c) => c && typeof c === "object");

  let firstName = String(reservation.guest?.firstName || "").trim();
  let lastName  = String(reservation.guest?.lastName  || "").trim();
  let email     = String(reservation.guestEmail || reservation.guest?.email || "").trim();
  let phone     = String(reservation.guestPhone || reservation.guest?.phone || "").trim();
  let address   = reservation.guestAddress || reservation.guest?.address || null;
  let profileId = String(reservation.guest?.profileId || "").trim();

  for (const c of candidates) {
    if (!firstName) firstName = String(c.firstName || c.givenName || "").trim();
    if (!lastName)  lastName  = String(c.lastName  || c.familyName || c.surname || "").trim();
    if (!email)     email     = String(c.email || c.emailAddress || "").trim();
    if (!phone)     phone     = String(c.phone || c.phoneNumber || c.mobilePhone || "").trim();
    if (!address)   address   = c.address || null;
    if (!profileId) profileId = String(c.id || c.profileId || "").trim();
  }

  const fullName = (reservation.guestName || `${firstName} ${lastName}`).trim();

  return { fullName, firstName, lastName, email, phone, address, profileId };
};

export default function GuestPanel({ reservation }) {
  if (!reservation) {
    return (
      <div className="ar-tab-placeholder">
        <div style={{ fontSize: 32, opacity: 0.4 }}>👤</div>
        <p style={{ margin: 0, fontSize: 13 }}>Select a reservation to view guest info</p>
      </div>
    );
  }

  const guest = extractGuest(reservation);
  const addr  = formatAddress(guest.address);

  const raw = reservation.raw || {};
  const company = String(raw?.company?.name || raw?.companyName || "").trim();
  const nationality = String(
    guest.address?.countryCode || guest.address?.country ||
    raw?.primaryGuest?.address?.countryCode || ""
  ).toUpperCase();

  return (
    <div>
      <div className="ar-section">
        <p className="ar-section-title">Guest Profile</p>
        <div className="ar-field-grid">
          <Row label="Full Name"   value={guest.fullName} />
          <Row label="Profile ID"  value={guest.profileId} mono />
          <Row label="Email"       value={guest.email} />
          <Row label="Phone"       value={guest.phone} />
          {company && <Row label="Company" value={company} />}
          {nationality && <Row label="Nationality" value={nationality} />}
        </div>
      </div>

      <div className="ar-section">
        <p className="ar-section-title">Address</p>
        <div className="ar-field-grid ar-cols-1">
          {addr
            ? <Row label="Full Address" value={addr} />
            : (
              <span className="ar-field-value ar-muted">No address on file</span>
            )
          }
          {guest.address?.line1 && (
            <>
              <Row label="Street"   value={guest.address.line1 || guest.address.addressLine1} />
              {(guest.address.line2 || guest.address.addressLine2) && (
                <Row label="Line 2" value={guest.address.line2 || guest.address.addressLine2} />
              )}
              <div className="ar-field-grid">
                <Row label="City"        value={guest.address.city || guest.address.locality} />
                <Row label="Postal Code" value={guest.address.postalCode || guest.address.zip} />
                <Row label="Region"      value={guest.address.region || guest.address.state} />
                <Row label="Country"     value={(guest.address.countryCode || guest.address.country || "").toUpperCase()} />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="ar-section">
        <p className="ar-section-title">Booking Party</p>
        <div className="ar-field-grid">
          <Row label="Adults"   value={reservation.adults != null ? String(reservation.adults) : null} />
          <Row label="Children" value={reservation.children != null ? String(reservation.children) : null} />
          <Row label="Channel"  value={reservation.channel} />
        </div>
      </div>
    </div>
  );
}
