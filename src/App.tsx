import { BrowserRouter, Routes, Route } from "react-router-dom";
import Wedding from "./pages/Wedding";
import SeatingChart from "./pages/SeatingChart";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Wedding />} />

        {/* The reception hall map. Public; admin editing lives behind a PIN
            inside the page rather than behind a separate route, so there is
            no admin URL to find. */}
        <Route path="/seating-chart" element={<SeatingChart />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
