import { Link } from "react-router-dom";
import usePageMeta from "../lib/usePageMeta.js";

export default function NotFound() {
  usePageMeta("Page not found");
  return (
    <section className="section">
      <div className="container container--narrow center">
        <p className="eyebrow">404</p>
        <h1>We couldn&rsquo;t find that page</h1>
        <p>It may have moved. Try the residences or get in touch and we&rsquo;ll help.</p>
        <div className="hero__actions hero__actions--center">
          <Link to="/residences" className="btn btn--primary">See the residences</Link>
          <Link to="/" className="btn btn--ghost">Back to home</Link>
        </div>
      </div>
    </section>
  );
}
