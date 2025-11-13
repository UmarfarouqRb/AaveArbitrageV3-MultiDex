import React, { useState, useEffect } from 'react';
import styled from 'styled-components';

const Container = styled.div`
  padding: 20px;
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
`;

const Header = styled.h2`
  color: #333;
  text-align: center;
`;

const TradeList = styled.ul`
  list-style: none;
  padding: 0;
`;

const TradeItem = styled.li`
  background: #f9f9f9;
  border: 1px solid #eee;
  padding: 10px;
  margin-bottom: 10px;
  border-radius: 4px;
`;

const ErrorMessage = styled.p`
  color: red;
  text-align: center;
`;

const TradeHistory = () => {
  const [trades, setTrades] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchTradeHistory = async () => {
      try {
        const response = await fetch('/api/trade-history');
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        const data = await response.json();
        setTrades(data);
      } catch (error) {
        setError('Failed to fetch trade history.');
        console.error('Fetch error:', error);
      }
    };

    fetchTradeHistory();
  }, []);

  return (
    <Container>
      <Header>Trade History</Header>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {trades.length > 0 ? (
        <TradeList>
          {trades.map((trade, index) => (
            <TradeItem key={index}>
              <p>Profit: {trade.profit}</p>
              <p>Path: {trade.path.join(' -> ')}</p>
            </TradeItem>
          ))}
        </TradeList>
      ) : (
        <p>No trades recorded yet.</p>
      )}
    </Container>
  );
};

export default TradeHistory;
