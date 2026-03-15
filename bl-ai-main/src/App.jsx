import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import PriceTracker from './pages/PriceTracker';
import ReviewIntelligence from './pages/ReviewIntelligence';
import CompetitorRadar from './pages/CompetitorRadar';
import LogisticsIntelligence from './pages/LogisticsIntelligence';
import InsightsFeed from './pages/InsightsFeed';
import Notifications from './pages/Notifications';
import ProfileSettings from './pages/ProfileSettings';
import Layout from './components/Layout';
import ChatAssistant from './components/ChatAssistant';
import api from './utils/api';
import realtime from './utils/realtime';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');

    if (token && savedUser) {
      setIsAuthenticated(true);
      const userData = JSON.parse(savedUser);
      setUser(userData);
      
      // Connect to real-time updates
      realtime.connect(userData.id);
    }
    setLoading(false);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    setUser(null);
    realtime.disconnect();
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}>
        <div style={{ textAlign: 'center', color: 'white' }}>
          <h1>🎯 MarketMind AI</h1>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login setAuth={setIsAuthenticated} />} />
        <Route path="/signup" element={<Signup setAuth={setIsAuthenticated} />} />
        <Route
          path="/*"
          element={
            isAuthenticated ? (
              <>
                <Layout user={user} onLogout={handleLogout}>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/price-tracker" element={<PriceTracker />} />
                    <Route path="/reviews" element={<ReviewIntelligence />} />
                    <Route path="/competitors" element={<CompetitorRadar />} />
                    <Route path="/logistics" element={<LogisticsIntelligence />} />
                    <Route path="/insights" element={<InsightsFeed />} />
                    <Route path="/notifications" element={<Notifications />} />
                    <Route path="/settings" element={<ProfileSettings />} />
                  </Routes>
                </Layout>
                <ChatAssistant />
              </>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
