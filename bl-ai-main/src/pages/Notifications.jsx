import { useEffect, useState } from 'react';
import { TrendingDown, MessageSquare, Users, Truck, Bell, Check, Loader } from 'lucide-react';
import api from '../utils/api';
import './Notifications.css';

const Notifications = () => {
  const [filter, setFilter] = useState('all');
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();

    // Listen for real-time notifications
    if (window.socket) {
      window.socket.on('new_alert', (alert) => {
        setNotifications(prev => [{
          id: prev.length + 1,
          type: alert.type || 'pricing',
          icon: TrendingDown,
          title: alert.title,
          message: alert.message,
          time: 'just now',
          read: false,
          priority: alert.priority || 'medium'
        }, ...prev]);
      });
    }

    return () => {
      if (window.socket) {
        window.socket.off('new_alert');
      }
    };
  }, []);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await api.getAlerts();
      const formattedNotifications = (res.data || []).map(alert => ({
        id: alert.id,
        type: alert.type || 'pricing',
        icon: getIconComponent(alert.type),
        title: alert.title,
        message: alert.message,
        time: formatTime(alert.created_at),
        read: Boolean(alert.read ?? alert.is_read ?? false),
        priority: alert.urgency || alert.severity || 'medium'
      }));
      setNotifications(formattedNotifications);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  const getIconComponent = (type) => {
    switch(type) {
      case 'pricing': return TrendingDown;
      case 'reviews': return MessageSquare;
      case 'competitors': return Users;
      case 'logistics': return Truck;
      default: return Bell;
    }
  };

  const formatTime = (date) => {
    if (!date) return 'recently';
    const now = new Date();
    const alertDate = new Date(date);
    if (Number.isNaN(alertDate.getTime())) return 'recently';
    const diffMs = now - alertDate;
    const safeDiffMs = Math.max(0, diffMs);
    const diffMins = Math.floor(safeDiffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${Math.floor(safeDiffMs / 3600000)}h ago`;
    if (Math.floor(safeDiffMs / 86400000) === 1) return '1 day ago';
    if (Math.floor(safeDiffMs / 86400000) < 7) return `${Math.floor(safeDiffMs / 86400000)}d ago`;
    return alertDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="notifications-page">
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
          <Loader className="animate-spin" size={40} style={{ margin: '0 auto 20px' }} />
          <p>Loading notifications...</p>
        </div>
      </div>
    );
  }

  const filteredNotifications = filter === 'all' 
    ? notifications 
    : filter === 'unread'
    ? notifications.filter(n => !n.read)
    : notifications.filter(n => n.type === filter);

  const unreadCount = notifications.filter(n => !n.read).length;

  const getIconColor = (type) => {
    switch(type) {
      case 'pricing': return '#6366f1';
      case 'reviews': return '#10b981';
      case 'competitors': return '#f59e0b';
      case 'logistics': return '#8b5cf6';
      default: return '#64748b';
    }
  };

  const getPriorityColor = (priority) => {
    switch(priority) {
      case 'high': return '#ef4444';
      case 'medium': return '#f59e0b';
      case 'low': return '#10b981';
      default: return '#64748b';
    }
  };

  return (
    <div className="notifications-page">
      <div className="page-header">
        <h1>Notifications</h1>
        <p>Stay updated with real-time alerts and insights</p>
      </div>

      <div className="notifications-controls">
        <div className="filter-buttons">
          <button 
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button 
            className={filter === 'unread' ? 'active' : ''}
            onClick={() => setFilter('unread')}
          >
            Unread {unreadCount > 0 && <span className="count-badge">{unreadCount}</span>}
          </button>
          <button 
            className={filter === 'pricing' ? 'active' : ''}
            onClick={() => setFilter('pricing')}
          >
            Pricing
          </button>
          <button 
            className={filter === 'reviews' ? 'active' : ''}
            onClick={() => setFilter('reviews')}
          >
            Reviews
          </button>
          <button 
            className={filter === 'competitors' ? 'active' : ''}
            onClick={() => setFilter('competitors')}
          >
            Competitors
          </button>
          <button 
            className={filter === 'logistics' ? 'active' : ''}
            onClick={() => setFilter('logistics')}
          >
            Logistics
          </button>
        </div>
        <button className="mark-all-read">
          <Check size={16} />
          Mark all as read
        </button>
      </div>

      <div className="notifications-list">
        {filteredNotifications.map((notification) => (
          <div 
            key={notification.id} 
            className={`notification-item ${!notification.read ? 'unread' : ''}`}
          >
            <div 
              className="notification-icon"
              style={{ background: `${getIconColor(notification.type)}15`, color: getIconColor(notification.type) }}
            >
              <notification.icon size={20} />
            </div>
            <div className="notification-content">
              <div className="notification-header">
                <h4>{notification.title}</h4>
                <div className="notification-meta">
                  <span 
                    className="priority-dot"
                    style={{ background: getPriorityColor(notification.priority) }}
                  />
                  <span className="notification-time">{notification.time}</span>
                </div>
              </div>
              <p className="notification-message">{notification.message}</p>
            </div>
            {!notification.read && <div className="unread-indicator" />}
          </div>
        ))}
      </div>

      {filteredNotifications.length === 0 && (
        <div className="empty-state">
          <Bell size={48} color="#cbd5e1" />
          <h3>No notifications</h3>
          <p>You're all caught up!</p>
        </div>
      )}
    </div>
  );
};

export default Notifications;
