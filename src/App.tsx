import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Coming from "./pages/Coming";
import Wedding from "./pages/Wedding";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />

        {/* Content not written yet. Deliberately honest rather than invented —
            these URLs go on printed table cards, so they must resolve now. */}
        <Route path="/program" element={
          <Coming
            eyebrow="The Service"
            title="Order of Service"
            note="The order of service is still being finalised. It will be here before the day, and printed copies will be waiting for you at the ceremony."
          />
        } />
        <Route path="/menu" element={
          <Coming
            eyebrow="At the Reception"
            title="Food Menu"
            note="Our menu is still being finalised with the kitchen. It will appear here in good time — and on your table on the day."
          />
        } />
        <Route path="/drinks" element={
          <Coming
            eyebrow="At the Reception"
            title="Drinks"
            note="The drinks list is still being finalised. It will appear here before the day."
          />
        } />

        {/* Built by the seating-chart workstream. Not implemented here — this
            shell only exists so Find Your Seat resolves during development. */}
        <Route path="/seating-chart" element={
          <Coming
            eyebrow="When you arrive"
            title="Find Your Seat"
            note="Seat lookup opens closer to the wedding day. On the day you'll be able to search your name here and we'll show you your table."
          />
        } />

        {/* The RSVP journey, kept intact. Registrations are closed server-side
            by the backend workstream; nothing here re-opens them. */}
        <Route path="/rsvp" element={<Wedding />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
