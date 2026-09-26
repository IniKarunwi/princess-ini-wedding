import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home";
import Wedding from "./pages/Wedding";
import SeatingChart from "./pages/SeatingChart";
import RegistryPage from "./pages/RegistryPage";
import NotFound from "./pages/NotFound";
import Music from "./components/site/Music";
import WeddingHub from "./pages/WeddingHub";
import MenuPage from "./pages/MenuPage";
import ThroughYourEyes from "./pages/ThroughYourEyes";
import ProgramPage from "./pages/ProgramPage";
import { FOOD_MENU, MENU_TITLE } from "./features/weddingday/menu";
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

        {/* The placeholder here promised the programme would arrive before
            the day. It has: the real order of service, transcribed from the
            printed sheet. See src/features/weddingday/program.ts. */}
        <Route path="/program" element={<ProgramPage />} />
        <Route path="/menu" element={
          <MenuPage
            eyebrow="At the Reception"
            title="Food Menu"
            subtitle={MENU_TITLE}
            sections={FOOD_MENU}
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
