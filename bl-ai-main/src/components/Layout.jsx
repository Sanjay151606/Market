import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  TrendingUp,
  MessageSquare,
  Users,
  Truck,
  Lightbulb,
  Bell,
  Settings,
  LogOut,
  Search,
  Menu,
  X,
} from 'lucide-react';
import './Layout.css';

const Layout = ({ children, user, onLogout }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/price-tracker', icon: TrendingUp, label: 'Price Tracker' },
    { path: '/reviews', icon: MessageSquare, label: 'Review Intelligence' },
    { path: '/competitors', icon: Users, label: 'Competitor Radar' },
    { path: '/logistics', icon: Truck, label: 'Logistics' },
    { path: '/insights', icon: Lightbulb, label: 'Insights Feed' },
    { path: '/notifications', icon: Bell, label: 'Notifications' },
  ];

  const handleLogout = () => {
    onLogout();
    navigate('/login');
  };

  const initials = user?.full_name
    ? user.full_name
        .split(' ')
        .map((item) => item[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'U';

  return (
    <div className="layout-shell">
      <aside className={`shell-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="shell-brand">
          <div className="brand-dot">M</div>
          <div className="brand-text">
            <strong>MarketMind AI</strong>
          </div>
        </div>

        <nav className="shell-nav">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`shell-nav-item ${location.pathname === item.path ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <item.icon size={16} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="shell-footer">
          <Link to="/settings" className="shell-footer-item">
            <Settings size={16} />
            <span>Settings</span>
          </Link>
          <button className="shell-footer-item logout" onClick={handleLogout}>
            <LogOut size={16} />
            <span>Log Out</span>
          </button>
        </div>
      </aside>

      {sidebarOpen && <button className="shell-overlay" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar" />}

      <div className="shell-main">
        <header className="shell-header">
          <button className="shell-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          <div className="shell-search">
            <Search size={16} className="shell-search-icon" />
            <input
              type="text"
              placeholder="Search insights, products, or reports..."
              className="shell-search-input"
            />
          </div>

          <div className="shell-user">
            <span className="shell-user-label">{user?.full_name || 'User'}</span>
            <div className="shell-avatar">{initials}</div>
          </div>
        </header>

        <main className="shell-content">{children}</main>
      </div>

      <div className="shell-mobile-bottom">
        <button className="shell-footer-item logout" onClick={handleLogout}>
          <LogOut size={16} />
          <span>Log Out</span>
        </button>
      </div>
    </div>
  );
};

export default Layout;
