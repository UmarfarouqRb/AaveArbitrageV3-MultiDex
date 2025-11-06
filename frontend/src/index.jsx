import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { PrivyProvider } from '@privy-io/react-auth';

createRoot(document.getElementById('root')).render(
  <PrivyProvider
    appId="cmhaqojjs08k9ky0dd0jlxss1"
    config={{
      // Customize Privy's appearance in your app
      appearance: {
        theme: 'light',
        accentColor: '#676FFF',
        logo: 'https://your-logo-url',
      },
      // Create embedded wallets for users who don't have a wallet
      embeddedWallets: {
        createOnLogin: 'users-without-wallets',
      },
    }}
  >
    <App />
  </PrivyProvider>
);
