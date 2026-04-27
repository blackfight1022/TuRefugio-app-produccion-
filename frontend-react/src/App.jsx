import { Navigate, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterVisitantePage from './pages/RegisterVisitantePage';
import ExplorePage from './pages/ExplorePage';
import DetailPage from './pages/DetailPage';
import ReservePage from './pages/ReservePage';
import TouristPanelPage from './pages/TouristPanelPage';
import HostPanelPage from './pages/HostPanelPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/explorar" element={<ExplorePage />} />
      <Route path="/detalle/:id" element={<DetailPage />} />
      <Route path="/reservar" element={<ReservePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/registro-turista" element={<RegisterVisitantePage />} />
      <Route path="/panel/turista" element={<TouristPanelPage />} />
      <Route path="/panel/anfitrion" element={<HostPanelPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
