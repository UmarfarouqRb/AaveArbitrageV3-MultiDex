import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { PrivyProvider } from '@privy-io/react-auth';
import { NetworkProvider } from './contexts/NetworkContext';
import './index.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID || "cmhooe9em00zsl40cn33f5lus"}
      config={{
        appearance: {
          theme: 'light',
          accentColor: '#676FFF',
          logo: '/logo.png',
        },
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
      }}
    >
      <NetworkProvider>
        <App />
      </NetworkProvider>
    </PrivyProvider>
  </React.StrictMode>
);
