import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import AdminDashboard from "./pages/AdminDashboard";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/admingeral" replace />} />
        <Route path="/admingeral" element={<AdminDashboard />} />
      </Routes>
    </Router>
  );
}
