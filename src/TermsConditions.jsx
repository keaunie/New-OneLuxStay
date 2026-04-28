import { Link } from "react-router-dom";
import "./App.css";
import SiteFooter from "./components/SiteFooter";

function TermsConditions() {
  return (
    <div className="policy-page">
      <header className="policy-hero">
        <div className="policy-topbar">
          <div className="landing-logo-mark">OneLuxStay</div>
          <a className="policy-topbar-link" href="#contact">
            Contact Us
          </a>
        </div>
        <div className="policy-hero-inner">
          <p className="policy-kicker">Terms &amp; Conditions</p>
          <h1 className="policy-title landing-display">Terms &amp; Conditions</h1>
          <p className="policy-updated">
            Please read these Terms &amp; Conditions carefully before confirming your stay with One Lux Stay.
          </p>
          <div className="policy-scroll">Scroll</div>
        </div>
      </header>

      <main className="policy-body">
        <section className="policy-section">
          <h2>Administrative Fees and Surcharges</h2>
          <p>
            Rent payments made with Visa/MasterCard or American Express cards are subject to respective administration
            fees of 2.5% and 3.5%. PayPal payments do not incur any administrative fees or surcharges.
          </p>
          <p>
            Payment refunds may also be subject to a fee of approximately 2.5%-3.5% for PayPal or credit card services.
          </p>
        </section>

        <section className="policy-section">
          <h2>Agreement Acceptance</h2>
          <p>Your booking confirms your acceptance of these conditions:</p>
          <ul className="policy-list">
            <li>For security purposes, guests are required to send a photo ID and credit card before arrival.</li>
            <li>These documents must also be presented during check-in.</li>
            <li>This contract cannot be extended or renewed. New contracts must be signed for extensions.</li>
          </ul>
        </section>

        <section className="policy-section">
          <h2>Bookings Paid by Credit Card</h2>
          <p>All bookings paid with a credit card must adhere to the following conditions:</p>
          <ul className="policy-list">
            <li>We do not accept third-party payments.</li>
            <li>The credit card holder must be present at check-in and provide both the credit card and a valid ID.</li>
            <li>You are required to sign the registration card either before or during check-in.</li>
          </ul>
          <p>
            Failure to meet the above requirements will result in a refund to the credit card on file. You will need to
            provide an alternative payment method, which must be received before check-in.
          </p>
        </section>

        <section className="policy-section">
          <h2>Checkout</h2>
          <p>
            Checkout time is 11:00 a.m. If you wish for a later checkout, please contact us in advance and we will make
            every effort to accommodate your request.
          </p>
          <p>
            Failure to inform us of a delayed departure will result in a late checkout penalty of $50 per hour for USA €50 per hour for EU and AED 200 for UAE, which
            will be charged to your credit card.
          </p>
          <p>Upon checkout, please ensure:</p>
          <ul className="policy-list">
            <li>All doors and windows are closed and locked.</li>
            <li>The A/C is turned off.</li>
            <li>
              The following items are left on the dining table inside the unit: beach pass, parking sticker, parking
              pass, garage remote, gate remote, and unit and facility keys.
            </li>
            <li>
              Do not return any items to the front desk or give them to anyone other than our staff. Failure to return
              any of the mentioned items will incur a fee of $200 per lost item.
            </li>
          </ul>
        </section>

        <section className="policy-section">
          <h2>Deposit Policy</h2>
          <p>
            The guest will be charged 10% of the accommodation total at the time of booking. The remaining balance will
            be charged 14 days prior to arrival.
          </p>
        </section>

        <section className="policy-section">
          <h2>Cancellation Policy</h2>
          <p>
            Guests will be charged 10% of the total accommodation cost at the time of booking. The remaining balance
            will be charged 14 days prior to the arrival date.
          </p>
          <p>Please note:</p>
          <ul className="policy-list">
            <li>The full amount will be charged on the date of booking if arrival is less than 14 days away.</li>
            <li>Guests will be charged 100% of the total price if they cancel within 14 days of arrival.</li>
            <li>Guests will be charged 75% of the total price if they cancel 15-30 days before arrival.</li>
            <li>Guests will be charged 50% of the total price if they cancel 31 or more days before arrival.</li>
            <li>Non-Refundable: guests will be charged 100% of the total rate if they cancel a non-refundable stay.</li>
          </ul>
          <p>There is a 1-hour grace period from the time of booking. This is a very strict cancellation policy.</p>
        </section>

        <section className="policy-section">
          <h2>Repairs and Alternate Accommodations</h2>
          <p>
            Any issues with the house or apartment regarding appliances, electrical, pool, or other maintenance-related
            matters will be fixed within 24 hours. No compensation will be provided to the client in such cases.
          </p>
          <p>
            If the issue is beyond repair and the house or apartment becomes uninhabitable, alternate accommodations
            will be arranged. This will be done only after 48 hours from the initial complaint.
          </p>
          <p>If no alternate accommodation is available, the liability for compensation will not exceed $500.</p>
        </section>

        <section className="policy-section">
          <h2>Failure to Vacate</h2>
          <p>
            Failure by guests to vacate the premises upon the checkout time and date will result in a daily rental fee
            of $600.00 per day, unless a prior extension of stay has been agreed upon.
          </p>
        </section>

        <section className="policy-section">
          <h2>Things to Note</h2>
          <ul className="policy-list">
            <li>All properties are strictly non-smoking.</li>
            <li>All special requests are subject to availability, and additional charges may apply.</li>
            <li>Essential toiletries are provided upon arrival; additional supplies are the guest's responsibility.</li>
            <li>
              No parties are allowed, and excessive noise is strictly prohibited. Noise complaints may result in
              eviction without compensation and a penalty of $1,000.
            </li>
            <li>Actual units may not be exactly as shown in the listing, as multiple units exist per property.</li>
          </ul>
        </section>

        <section id="contact" className="policy-section policy-contact">
          <h2>Contact Us</h2>
          <p>Email: reservations@oneluxstay.com</p>
          <div className="policy-contact-grid">
            <div>
              <p className="policy-contact-label">UAE</p>
              <p>+971 557277059</p>
            </div>
            <div>
              <p className="policy-contact-label">USA</p>
              <p>+1 2138663589</p>
            </div>
            <div>
              <p className="policy-contact-label">EU</p>
              <p>+32 460 25 48 86</p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

export default TermsConditions;
