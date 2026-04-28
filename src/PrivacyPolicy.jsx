import { Link } from "react-router-dom";
import "./App.css";
import SiteFooter from "./components/SiteFooter";

function PrivacyPolicy() {
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
          <p className="policy-kicker">Privacy Policy</p>
          <h1 className="policy-title landing-display">Privacy Policy</h1>
          <p className="policy-updated">Last Updated: January 14, 2025</p>
          <div className="policy-scroll">Scroll</div>
        </div>
      </header>

      <main className="policy-body">
        <section id="introduction" className="policy-section">
          <h2>Introduction</h2>
          <p>
            This Privacy Policy ("Policy") explains how One Lux Stay ("we," "us," "our") collects, uses, and protects
            your personal information when you use tgest.oneluxstay.com and related services.
          </p>
        </section>

        <section className="policy-section">
          <h2>Collection of Personal Information</h2>
          <p>We collect information you provide when creating an account, booking a stay, or filling forms:</p>
          <ul className="policy-list">
            <li>Name, email, phone number, and address</li>
            <li>Payment information (credit card, bank details)</li>
          </ul>
        </section>

        <section className="policy-section">
          <h2>Collection of Non-Personal Information</h2>
          <p>Your browser automatically sends:</p>
          <ul className="policy-list">
            <li>IP address, browser type, OS version</li>
            <li>Language settings, referring pages</li>
            <li>Date and time of access</li>
          </ul>
        </section>

        <section className="policy-section">
          <h2>Use of Information</h2>
          <ul className="policy-list">
            <li>Personalize user experience</li>
            <li>Process bookings and payments</li>
            <li>Customer service</li>
            <li>Security improvements and troubleshooting</li>
          </ul>
        </section>

        <section className="policy-section">
          <h2>Legal Basis</h2>
          <ul className="policy-list">
            <li>Consent</li>
            <li>Contractual necessity</li>
            <li>Legitimate interests</li>
          </ul>
        </section>

        <section className="policy-section">
          <h2>Cookies</h2>
          <p>
            Our Website uses cookies to improve your browsing experience. You can disable cookies in your browser, but
            some features may not function properly.
          </p>
        </section>

        <section className="policy-section">
          <h2>Your Rights</h2>
          <ul className="policy-list">
            <li>Access, update, delete your data</li>
            <li>Data portability</li>
            <li>Limit or object to processing</li>
            <li>Withdraw consent at any time</li>
          </ul>
        </section>

        <section className="policy-section">
          <h2>Sharing of Information</h2>
          <p>We share information with secure, trusted third-party partners only when necessary for:</p>
          <ul className="policy-list">
            <li>Payments</li>
            <li>Website functionality</li>
            <li>Legal compliance</li>
          </ul>
        </section>

        <section className="policy-section">
          <h2>Data Retention</h2>
          <p>
            We retain your information only as long as required for legitimate business, legal, or operational
            purposes.
          </p>
        </section>

        <section className="policy-section">
          <h2>Children's Privacy</h2>
          <p>We do not knowingly collect information from individuals under the age of 16.</p>
        </section>

        <section className="policy-section">
          <h2>Information Security</h2>
          <p>We implement administrative, technical, and physical safeguards - but no method is 100% secure.</p>
        </section>

        <section className="policy-section">
          <h2>Data Breaches</h2>
          <p>If a breach occurs, we will:</p>
          <ul className="policy-list">
            <li>Investigate immediately</li>
            <li>Notify affected users (if required)</li>
            <li>Report to authorities when applicable</li>
          </ul>
        </section>

        <section className="policy-section">
          <h2>Legal Disclosure</h2>
          <p>We may disclose data to comply with legal obligations or business transitions.</p>
        </section>

        <section className="policy-section">
          <h2>Acceptance</h2>
          <p>By using our Website, you acknowledge and accept this Privacy Policy.</p>
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

export default PrivacyPolicy;
