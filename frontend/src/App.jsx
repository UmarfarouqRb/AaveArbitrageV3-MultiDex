import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import { NetworkProvider } from './contexts/NetworkContext';

// Lazy load the components
const ArbitrageFinder = lazy(() => import('./components/ArbitrageFinder'));

export default function App() {
  return (
    <NetworkProvider>
      <Router>
        <Layout>
          <Suspense fallback={<div style={{ textAlign: 'center', padding: '40px' }}><h2>Loading Page...</h2></div>}>
            <Routes>
              <Route path="/" element={<Navigate to="/finder" replace />} />
              <Route path="/finder" element={<ErrorBoundary><ArbitrageFinder /></ErrorBoundary>} />
            </Routes>
          </Suspense>
        </Layout>
      </Router>
    </NetworkProvider>
  );
}
