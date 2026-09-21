import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Coming from "./pages/Coming";
import Wedding from "./pages/Wedding";
import SeatingChart from "./pages/SeatingChart";
import NotFound from "./pages/NotFound";
import Music from "./components/site/Music";

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

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
