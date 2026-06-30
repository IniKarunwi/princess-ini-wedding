import { BrowserRouter, Routes, Route } from "react-router-dom";
import Wedding from "./pages/Wedding";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Wedding />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
