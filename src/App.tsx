import { BrowserRouter, Routes, Route } from "react-router-dom";
import Wedding from "./pages/Wedding";
import NotFound from "./pages/NotFound";
import Placeholder from "./pages/Placeholder";
import PassPage from "./pages/Pass";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Wedding />} />

        {/* Public table QR targets. These URLs get PRINTED, so they must
            resolve before the menus are written — a printed QR cannot be
            corrected on the day. No auth: anyone at a table may read them. */}
        <Route path="/menu"   element={<Placeholder title="Wedding Menu" />} />
        <Route path="/drinks" element={<Placeholder title="Drinks Menu" />} />

        {/* A guest's own pass. The token is opaque and resolves server-side. */}
        <Route path="/pass/:token" element={<PassPage />} />

        {/* /rsvp deliberately resolves to the existing experience. Submission
            is closed in the DATABASE by 0007 (RLS with no anon INSERT policy),
            not by hiding this route — a disabled button is not a lock. */}
        <Route path="/rsvp" element={<Wedding />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
