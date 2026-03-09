import React from 'react';
import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import CollabApp from './collab/App';
import { parseAppRoute } from './collab/router';
import { AuthProvider } from './context/AuthContext';
import './styles.css';

function Root() {
  const [route, setRoute] = useState(() => parseAppRoute(window.location.pathname));

  useEffect(() => {
    const handleRouteChange = () => setRoute(parseAppRoute(window.location.pathname));
    window.addEventListener('popstate', handleRouteChange);
    return () => window.removeEventListener('popstate', handleRouteChange);
  }, []);

  return route.type === 'legacy' ? <App /> : <CollabApp route={route} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </React.StrictMode>,
);
