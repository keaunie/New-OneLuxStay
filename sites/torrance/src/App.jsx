import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Home from "./pages/Home.jsx";
import Residences from "./pages/Residences.jsx";
import ResidenceDetail from "./pages/ResidenceDetail.jsx";
import Explore from "./pages/Explore.jsx";
import LongTermStays from "./pages/LongTermStays.jsx";
import Contact from "./pages/Contact.jsx";
import NotFound from "./pages/NotFound.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="residences" element={<Residences />} />
        <Route path="residences/:slug" element={<ResidenceDetail />} />
        <Route path="explore" element={<Explore />} />
        <Route path="long-term-stays" element={<LongTermStays />} />
        <Route path="contact" element={<Contact />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
