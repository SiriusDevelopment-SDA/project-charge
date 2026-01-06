import { Routes, Route } from 'react-router-dom';
import EfetuarDisparo from '../pages/EfetuarDisparo';
// import EfetuarDisparo2 from '../pages/EfetuarDisparo2';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<EfetuarDisparo page="disparo"/>} />
      <Route path="/efetuar-disparo-2" element={<EfetuarDisparo page="disparo-2"/>} />
    </Routes>
  );
}