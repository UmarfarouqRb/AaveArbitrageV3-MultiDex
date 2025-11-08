import React from 'react';
import { NavLink } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import styled from 'styled-components';

const AppContainer = styled.div`
  display: flex;
  min-height: 100vh;
  background-color: #f4f7fa;
`;

const Sidebar = styled.div`
  width: 220px;
  background-color: #fff;
  padding: 20px;
  border-right: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
`;

const Logo = styled.img`
  height: 50px;
  margin-bottom: 30px;
  align-self: center;
`;

const MainContent = styled.main`
  flex: 1;
  padding: 20px 40px;
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 20px;
  border-bottom: 1px solid #e0e0e0;
  margin-bottom: 30px;
`;

const ConnectedAddress = styled.p`
  margin: 0;
  color: #555;
`;

const AuthButton = styled.button`
  padding: 10px 20px;
  border-radius: 6px;
  border: none;
  background-color: #007bff;
  color: white;
  cursor: pointer;
`;

const StyledNavLink = styled(NavLink)`
  display: block;
  padding: 12px 20px;
  margin: 8px 0;
  border-radius: 6px;
  text-decoration: none;
  color: #333;
  background-color: transparent;
  font-weight: normal;
  transition: background-color 0.2s, color 0.2s;

  &.active {
    color: #fff;
    background-color: #007bff;
    font-weight: bold;
  }
`;

export default function Layout({ children }) {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const address = user?.wallet?.address;

  return (
    <AppContainer>
      <Sidebar>
        <Logo src="/logo.png" alt="Forge Inc. Logo" />
        <nav style={{ flex: 1 }}>
          <StyledNavLink to="/dashboard">Dashboard</StyledNavLink>
          <StyledNavLink to="/finder">Arbitrage Finder</StyledNavLink>
          <StyledNavLink to="/opportunities">Opportunities</StyledNavLink>
          <StyledNavLink to="/history">Trade History</StyledNavLink>
        </nav>
      </Sidebar>

      <MainContent>
        <Header>
          <div>
            {address && <ConnectedAddress>Connected as: <strong>{address}</strong></ConnectedAddress>}
          </div>
          {ready && (authenticated ? (
            <AuthButton onClick={logout}>Logout</AuthButton>
          ) : (
            <AuthButton onClick={login}>Login</AuthButton>
          ))}
        </Header>
        {children}
      </MainContent>
    </AppContainer>
  );
}
