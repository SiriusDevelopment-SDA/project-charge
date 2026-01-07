import { Routes, Route } from "react-router-dom";
import EfetuarDisparo from "../pages/EfetuarDisparo";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<EfetuarDisparo />} />
    </Routes>
  );
}
