import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { NetworkBackground } from './components/NetworkBackground';
import { TopNav } from './components/TopNav';
import { Landing } from './pages/Landing';
import { Dashboard } from './pages/Dashboard';
import { AgentLookup } from './pages/AgentLookup';
import { Vaults } from './pages/Vaults';
import { AuditTrail } from './pages/AuditTrail';
import { Settlements } from './pages/Settlements';

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -8 },
};

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      >
        <Routes location={location}>
          <Route path="/"            element={<Landing />} />
          <Route path="/dashboard"   element={<Dashboard />} />
          <Route path="/agent"       element={<AgentLookup />} />
          <Route path="/vaults"      element={<Vaults />} />
          <Route path="/audit"       element={<AuditTrail />} />
          <Route path="/settlements" element={<Settlements />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--void)' }}>
      <NetworkBackground />
      <TopNav />
      <main
        className="relative z-10 min-h-screen"
        style={{ paddingTop: 56 }}
      >
        <div style={{ maxWidth: 1440, margin: '0 auto', padding: '24px 36px 52px' }}>
          <AnimatedRoutes />
        </div>
      </main>
    </div>
  );
}
