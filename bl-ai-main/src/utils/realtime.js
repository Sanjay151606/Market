import io from 'socket.io-client';

class RealtimeClient {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect(userId) {
    if (this.socket?.connected) return;

    const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:8000';
    this.socket = io(socketUrl, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });

    this.socket.on('connect', () => {
      console.log('Connected to real-time server');
      if (userId) {
        this.socket.emit('join-seller', userId);
      }
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from real-time server');
    });

    this.setupDefaultListeners();
  }

  setupDefaultListeners() {
    // Listen for all events and trigger registered callbacks
    const events = [
      'new-insight',
      'product-added',
      'product-updated',
      'product-deleted',
      'price-updated',
      'new-review',
      'competitor-added',
      'competitor-price-updated',
      'logistics-update',
      'new-alert'
    ];

    events.forEach(event => {
      this.socket.on(event, (data) => {
        if (this.listeners.has(event)) {
          const callbacks = this.listeners.get(event);
          callbacks.forEach(callback => callback(data));
        }
      });
    });
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export default new RealtimeClient();
