import { usePrivy } from '@privy-io/react-auth';

// ConnectWallet component
const ConnectWallet = () => {
  const { ready, authenticated, login, logout } = usePrivy();

  return (
    <div>
      {ready && authenticated ? (
        <button onClick={logout} style={{padding: '10px 20px', borderRadius: '6px', border: 'none', backgroundColor: '#007bff', color: 'white', cursor: 'pointer'}}>Logout</button>
      ) : (
        <button onClick={login} style={{padding: '10px 20px', borderRadius: '6px', border: 'none', backgroundColor: '#007bff', color: 'white', cursor: 'pointer'}}>Login</button>
      )}
    </div>
  );
};

export default ConnectWallet;
