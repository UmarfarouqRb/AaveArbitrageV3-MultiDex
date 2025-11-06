import React from 'react';

const Dashboard = () => {
  const styles = {
    container: {
      padding: '30px',
      backgroundColor: '#fff',
      borderRadius: '12px',
      boxShadow: '0 6px 12px rgba(0,0,0,0.1)',
      color: '#333',
      textAlign: 'center',
    },
    header: {
      fontSize: '2em',
      color: '#007bff',
      marginBottom: '15px',
    },
    paragraph: {
      fontSize: '1.1em',
      lineHeight: '1.6',
      color: '#555',
      maxWidth: '600px',
      margin: '0 auto',
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Welcome to the Arbitrage Trading Platform</h1>
      <p style={styles.paragraph}>
        This application is designed to help you identify and analyze cryptocurrency arbitrage opportunities across various decentralized exchanges (DEXs).
      </p>
      <p style={styles.paragraph}>
        Use the navigation on the left to get started. The <strong>Arbitrage Finder</strong> lets you check for price differences on a specific token, while the <strong>Opportunities</strong> page shows a list of the top potential trades.
      </p>
    </div>
  );
};

export default Dashboard;
