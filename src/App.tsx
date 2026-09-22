import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home";
import Coming from "./pages/Coming";
import Wedding from "./pages/Wedding";
import SeatingChart from "./pages/SeatingChart";
import RegistryPage from "./pages/RegistryPage";
import NotFound from "./pages/NotFound";
import Music from "./components/site/Music";
import WeddingHub from "./pages/WeddingHub";
import MenuPage from "./pages/MenuPage";
import ThroughYourEyes from "./pages/ThroughYourEyes";
import { FOOD_MENU, DRINKS_MENU, MENU_TITLE } from "./features/weddingday/menu";
import { CAMERA_ENABLED } from "./features/weddingday/phase";

export default function App() {
  return (
    <BrowserRouter>
      {/* Outside <Routes> on purpose.
          Mounted inside the home route, the <audio> element would be torn
          down and rebuilt on every navigation — the song would cut out when
          a guest opened the menu, and restart from the first bar when they
          came back. Out here it survives navigation and simply keeps
          playing. It renders nothing at all until a licensed recording is
          present; see public/audio/README.md. */}
      <Music />

      <Routes>
        {/* The redesigned wedding-day homepage. */}
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
          <MenuPage
            eyebrow="At the Reception"
            title="Food Menu"
            subtitle={MENU_TITLE}
            sections={FOOD_MENU}
          />
        } />
        {/* Structure and styling are done; DRINKS_MENU is deliberately
            empty until the real list is supplied. Filling that one array
            is the whole remaining job. */}
        <Route path="/drinks" element={
          <MenuPage
            eyebrow="At the Reception"
            title="Drinks"
            sections={DRINKS_MENU}
            emptyNote="The drinks list is still being finalised. It will appear here before the day — and there will be plenty of it on the night."
          />
        } />

        {/* ── The table QR lands here ──────────────────────────────────
            One code on every reception table resolves to /wedding. Short,
            permanent and easy to encode, and the only URL printed on the
            cards — everything else is reached from it. */}
        <Route path="/wedding" element={<WeddingHub />} />
        {/* Phase 2. The capture flow is built and tested, but photographs
            have nowhere to go until 0008_guest_photos.sql is applied, so the
            route is closed rather than left open for someone to find by
            typing it — taking ten photos and then being told they cannot be
            sent is worse than never being offered the camera. The hub shows
            the card as Coming Soon so the concept still reads whole. */}
        <Route
          path="/wedding/camera"
          element={CAMERA_ENABLED ? <ThroughYourEyes /> : <Navigate to="/wedding" replace />}
        />

        {/* The real reception hall map, from the seating-chart workstream.
            This is the one line of the merge that mattered. The homepage
            branch shipped a <Coming> placeholder on this route, labelled in
            its own comment as a stand-in "until the seating-chart workstream
            builds it". It exists now and is on main, so the placeholder is
            dropped and the implementation takes the route.
            Public; admin editing lives behind a PIN inside the page rather
            than behind a separate route, so there is no admin URL to find. */}
        <Route path="/seating-chart" element={<SeatingChart />} />

        {/* The RSVP journey, kept intact and still reachable by URL. It moved
            off "/" when the homepage was redesigned; the menu lists it as
            closed rather than linking to it. Nothing here re-opens
            registrations — they are closed server-side. */}
        <Route path="/rsvp" element={<Wedding />} />

        {/* The registry on its own URL, so the closing signature can point at
            it now that the RSVP flow that used to hold it is closed. Same
            component, same single source of account details. */}
        <Route path="/registry" element={<RegistryPage />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
