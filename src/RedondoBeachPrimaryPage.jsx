import { Helmet } from "react-helmet-async";
import RedondoBeachLandingPage from "./RedondoBeachLandingPage";

const REDONDO_PRIMARY_LISTING_ID = "6948d9855a49ec0013d81ab5";

export default function RedondoBeachPrimaryPage() {
  return (
    <>
      <Helmet>
        <title>Luxury Long-Term Stay in Redondo Beach | OneLuxStay</title>
        <meta
          name="description"
          content="Executive furnished long-term stay in Redondo Beach with luxury amenities, premium interiors, and flexible lease options."
        />
        <link rel="canonical" href="https://oneluxstay.com/redondo-beach" />
      </Helmet>
      <h1 className="sr-only">Luxury Long-Term Stay in Redondo Beach</h1>
      <RedondoBeachLandingPage
        experience="primary"
        singleListingId={REDONDO_PRIMARY_LISTING_ID}
      />
    </>
  );
}
