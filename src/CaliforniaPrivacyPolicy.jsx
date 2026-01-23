import { Link } from "react-router-dom";
import "./App.css";
import SiteFooter from "./components/SiteFooter";

function CaliforniaPrivacyPolicy() {
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
          <p className="policy-kicker">California Privacy Policy</p>
          <h1 className="policy-title landing-display">California Privacy Policy</h1>
          <p className="policy-updated">
            This California Privacy Policy explains how One Lux Stay collects, uses, and protects your information,
            with specific rights for residents of California.
          </p>
          <div className="policy-scroll">Scroll</div>
        </div>
      </header>

      <main className="policy-body">
        <section className="policy-section">
          <h2>Overview</h2>
          <p>
            When you visit our website(s) and use our services, you trust us with your personal information. We take
            your privacy very seriously. In this privacy notice, we describe our Privacy Policy. We seek to explain to
            you in the clearest way possible what information we collect, how we use it, and what rights you have in
            relation to it.
          </p>
          <p>
            If there are any terms in this Privacy Policy that you do not agree with, please discontinue use of our
            products and services.
          </p>
          <p>
            This Privacy Policy applies to all information collected through our Sites and related services, sales,
            marketing, or events (collectively, the "Sites").
          </p>
        </section>

        <section className="policy-section">
          <h2>What Information Do We Collect?</h2>
          <p>
            We collect information from you when you register on our Sites, search for accommodations, reserve a room,
            subscribe to our newsletters or emails, respond to a survey, or fill out a form.
          </p>
          <p>
            When booking a reservation or registering on our Sites, you may be asked to enter your name, email address,
            mailing address, phone number or credit card information, reservation preferences, guest details, and
            smoking preferences.
          </p>
          <p>
            This information is required to process and complete your reservation. You may visit our Sites and search
            for accommodations anonymously.
          </p>
        </section>

        <section className="policy-section">
          <h2>Personal Information You Disclose to Us</h2>
          <p>
            Summary: We collect personal information that you provide to us such as name, address, contact information,
            passwords and security data, and payment information in order to process bookings and deliver relevant
            advertising.
          </p>
          <p>
            The personal information that we collect depends on the context of your interactions with the business and
            the choices you make. The personal information we collect can include:
          </p>
          <ul className="policy-list">
            <li>Name and contact information such as email address, postal address, and phone number.</li>
            <li>Credentials such as password hints and security information for authentication and account access.</li>
            <li>
              Payment data needed to process your payment, transmitted and stored using PCI-compliant processes and
              standards.
            </li>
          </ul>
          <p>
            All personal information that you provide to us must be true, complete, and accurate, and you must notify
            us of any changes to such personal information.
          </p>
        </section>

        <section className="policy-section">
          <h2>Information Automatically Collected</h2>
          <p>
            In short: some information, such as IP address and browser or device characteristics, is collected
            automatically when you visit our websites.
          </p>
          <p>
            This information does not reveal your specific identity but may include device and usage information such
            as IP address, browser and device characteristics, operating system, language preferences, referring URLs,
            device name, country, location, and other technical information.
          </p>
        </section>

        <section className="policy-section">
          <h2>Information Collected from Other Sources</h2>
          <p>
            In short: we may collect limited data from public databases, marketing partners, and other outside sources.
          </p>
          <p>
            Examples include social media profile information, marketing leads, and search results and links, including
            paid listings.
          </p>
        </section>

        <section className="policy-section">
          <h2>What Do We Use Your Information For?</h2>
          <ul className="policy-list">
            <li>To personalize your experience and tailor search results.</li>
            <li>To improve our website and service performance.</li>
            <li>To improve customer service and respond to requests.</li>
            <li>To process reservations and required disclosures.</li>
            <li>To administer contests, promotions, surveys, or improve site features.</li>
            <li>To send periodic emails related to reservations and opt-in communications.</li>
            <li>To complete reviews and share user feedback with the public.</li>
          </ul>
        </section>

        <section className="policy-section">
          <h2>How Do We Protect Your Information?</h2>
          <p>
            We implement appropriate technical and organizational security measures designed to protect personal
            information. However, no method of transmission over the Internet is 100% secure.
          </p>
          <p>
            Sensitive data is transmitted via TLS/SSL and encrypted in our systems. Authorized personnel only may
            access personal information.
          </p>
        </section>

        <section className="policy-section">
          <h2>Will Your Information Be Shared with Anyone?</h2>
          <p>
            In short: we only share information with your consent, to comply with laws, protect your rights, or fulfill
            business obligations.
          </p>
          <ul className="policy-list">
            <li>Compliance with laws or legal processes.</li>
            <li>Vendors and service providers such as payment processing and hosting.</li>
            <li>Business transfers such as mergers or acquisitions.</li>
            <li>Third-party advertisers and affiliates.</li>
            <li>With your consent.</li>
          </ul>
        </section>

        <section className="policy-section">
          <h2>Do We Use Cookies or Web Beacons?</h2>
          <p>
            Yes. Cookies and web beacons help us remember your search and process your reservation, understand your
            preferences, and compile aggregate analytics data. You can block cookies via your browser settings, but
            some features may not work properly.
          </p>
        </section>

        <section className="policy-section">
          <h2>Is Your Information Transferred Internationally?</h2>
          <p>
            In short: we may transfer, store, and process your information in countries other than your own. We will
            take all necessary measures to protect your personal information in accordance with this Privacy Policy and
            applicable law.
          </p>
        </section>

        <section className="policy-section">
          <h2>Do We Disclose Any Information to Outside Parties?</h2>
          <p>
            We do not sell or trade your personally identifiable information to outside parties. We may share
            information with trusted third parties who assist us in operating our website and servicing you, provided
            they keep this information confidential.
          </p>
        </section>

        <section className="policy-section">
          <h2>Third-Party Links</h2>
          <p>
            Our Sites may include links to third-party products or services. These sites have separate and independent
            privacy policies, and we have no responsibility for their content or activities.
          </p>
        </section>

        <section className="policy-section">
          <h2>Protect and Secure Your Credit Card Information</h2>
          <p>
            We follow PCI Security Standards. Credit card information is transmitted via TLS/SSL and encrypted in our
            systems. Only authorized employees may access personal information for duties.
          </p>
        </section>

        <section className="policy-section">
          <h2>What Are Your Privacy Rights?</h2>
          <p>In short: you may review, change, or terminate your account at any time.</p>
        </section>

        <section className="policy-section">
          <h2>Children's Privacy</h2>
          <p>
            We do not knowingly solicit data from or market to children under 18 years of age. If we learn that personal
            information from users under 18 has been collected, we will deactivate the account and delete the data.
          </p>
        </section>

        <section className="policy-section">
          <h2>COPPA Compliance</h2>
          <p>
            We are in compliance with COPPA and do not collect information from anyone under 13 years of age. Our
            website is directed to people who are at least 18 years old.
          </p>
        </section>

        <section className="policy-section">
          <h2>Do California Residents Have Specific Privacy Rights?</h2>
          <p>
            California Civil Code Section 1798.83 ("Shine The Light") permits California residents to request
            information about personal information disclosed to third parties for direct marketing purposes.
          </p>
          <p>
            California residents under 18 may request the removal of unwanted data publicly posted on our websites by
            contacting us using the information below.
          </p>
        </section>

        <section className="policy-section">
          <h2>California Online Privacy Protection Act (CalOPPA)</h2>
          <p>
            We have taken the necessary precautions to comply with CalOPPA. Users may make changes to their information
            at any time by logging into their account.
          </p>
        </section>

        <section className="policy-section">
          <h2>How Can You Review, Update, or Delete Data?</h2>
          <p>
            You may request access to, update, or delete your personal information by emailing us at
            datasecurity@oneluxstay.com. We will respond within 30 days.
          </p>
        </section>

        <section className="policy-section">
          <h2>Online Privacy Policy Only</h2>
          <p>This online Privacy Policy applies only to information collected through our website.</p>
        </section>

        <section className="policy-section">
          <h2>Terms and Conditions</h2>
          <p>
            Please also visit our Terms and Conditions section establishing the use, disclaimers, and limitations of
            liability governing the use of our website.
          </p>
        </section>

        <section className="policy-section">
          <h2>Your Consent</h2>
          <p>By using our Sites, you consent to our website's Privacy Policy.</p>
        </section>

        <section className="policy-section">
          <h2>Changes to Our Privacy Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. The updated version will be indicated by an updated
            "Revised" date and will be effective as soon as it is accessible.
          </p>
          <p>This policy was last modified on 5/25/2021.</p>
        </section>

        <section id="contact" className="policy-section policy-contact">
          <h2>Contacting Us</h2>
          <p>If you have questions regarding this Privacy Policy, you may contact us below.</p>
          <p>One Lux Stay</p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

export default CaliforniaPrivacyPolicy;
