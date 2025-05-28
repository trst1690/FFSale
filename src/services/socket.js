// frontend/src/services/socket.js
import io from 'socket.io-client';

class SocketService {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.authenticated = false;
    this.reconnectAttempts = 0;
    this.eventQueue = [];
    this.listeners = new Map();
    this.userId = null;
    this.connectionPromise = null;
  }

  connect(token) {
    // If already connecting, return the existing promise
    if (this.connectionPromise) {
      console.log('Socket connection already in progress');
      return this.connectionPromise;
    }

    // If already connected and authenticated, return resolved promise
    if (this.socket?.connected && this.authenticated) {
      console.log('Socket already connected and authenticated');
      return Promise.resolve(this.socket);
    }

    // Create connection promise
    this.connectionPromise = new Promise((resolve, reject) => {
      console.log('🔌 Initiating socket connection...');
      
      // Determine API URL
      const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      console.log('Connecting to:', API_URL);

      // Create socket with auth
      this.socket = io(API_URL, {
        auth: { token },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 10,
        timeout: 10000,
        transports: ['websocket', 'polling'],
        upgrade: true,
        forceNew: false
      });

      // Connection timeout
      const connectionTimeout = setTimeout(() => {
        this.connectionPromise = null;
        reject(new Error('Socket connection timeout'));
      }, 15000);

      // Handle successful connection
      this.socket.on('connect', () => {
        console.log('✅ Socket connected:', this.socket.id);
        this.connected = true;
        this.reconnectAttempts = 0;
        clearTimeout(connectionTimeout);
        
        // Reattach all listeners
        this.reattachListeners();
        
        // Process queued events
        this.processEventQueue();
      });

      // Handle authentication success
      const authHandler = (data) => {
        console.log('✅ Socket authenticated:', data);
        this.authenticated = true;
        this.userId = data.user?.id || data.userId;
        this.connectionPromise = null;
        
        // Remove one-time auth handler
        this.socket.off('authenticated', authHandler);
        
        resolve(this.socket);
      };
      
      this.socket.once('authenticated', authHandler);

      // Handle authentication error
      this.socket.on('auth-error', (error) => {
        console.error('❌ Socket authentication failed:', error);
        this.authenticated = false;
        this.connectionPromise = null;
        clearTimeout(connectionTimeout);
        reject(error);
      });

      // Handle disconnection
      this.socket.on('disconnect', (reason) => {
        console.log('🔌 Socket disconnected:', reason);
        this.connected = false;
        this.authenticated = false;
        
        // Handle different disconnect reasons
        switch (reason) {
          case 'io server disconnect':
            // Server forced disconnect, need to manually reconnect
            console.log('Server forced disconnect, attempting reconnect...');
            setTimeout(() => {
              const newToken = localStorage.getItem('token');
              if (newToken) {
                this.reconnect(newToken);
              }
            }, 2000);
            break;
          
          case 'transport close':
          case 'transport error':
            // Network issues, socket.io will auto-reconnect
            console.log('Network issue, auto-reconnecting...');
            break;
          
          case 'ping timeout':
            // Server not responding, will auto-reconnect
            console.log('Server timeout, auto-reconnecting...');
            break;
          
          default:
            console.log('Disconnect reason:', reason);
        }
      });

      // Handle reconnection
      this.socket.on('reconnect', (attemptNumber) => {
        console.log(`✅ Reconnected after ${attemptNumber} attempts`);
        this.connected = true;
        
        // Re-authenticate
        const currentToken = localStorage.getItem('token');
        if (currentToken) {
          this.emit('authenticate', { 
            token: currentToken,
            userId: this.userId 
          });
        }
      });

      // Handle reconnection attempts
      this.socket.on('reconnect_attempt', (attemptNumber) => {
        console.log(`🔄 Reconnection attempt ${attemptNumber}`);
        this.reconnectAttempts = attemptNumber;
      });

      // Handle connection errors
      this.socket.on('connect_error', (error) => {
        console.error('❌ Socket connection error:', error.message);
        
        if (error.message === 'Authentication error') {
          // Token might be expired, clear auth state
          this.authenticated = false;
          this.connectionPromise = null;
          clearTimeout(connectionTimeout);
          reject(error);
        }
      });

      // Handle generic errors
      this.socket.on('error', (error) => {
        console.error('❌ Socket error:', error);
      });

      // Development helpers
      if (process.env.NODE_ENV === 'development') {
        this.socket.onAny((event, ...args) => {
          console.log(`📨 Socket event: ${event}`, args);
        });
        
        this.socket.onAnyOutgoing((event, ...args) => {
          console.log(`📤 Socket emit: ${event}`, args);
        });
      }
    });

    return this.connectionPromise;
  }

  async reconnect(token) {
    console.log('🔄 Manual reconnection initiated');
    
    // Clear existing connection promise
    this.connectionPromise = null;
    
    // Disconnect existing socket if any
    if (this.socket) {
      this.socket.disconnect();
    }
    
    // Reset state
    this.connected = false;
    this.authenticated = false;
    
    // Connect with new token
    return this.connect(token);
  }

  disconnect() {
    if (this.socket) {
      console.log('🔌 Manually disconnecting socket');
      
      // Clear all listeners
      this.listeners.clear();
      
      // Disconnect socket
      this.socket.disconnect();
      
      // Reset state
      this.socket = null;
      this.connected = false;
      this.authenticated = false;
      this.connectionPromise = null;
      this.eventQueue = [];
    }
  }

  emit(event, data) {
    if (this.socket && this.connected) {
      console.log(`📤 Emitting: ${event}`, data);
      this.socket.emit(event, data);
      return true;
    } else {
      console.warn(`⏳ Socket not connected, queueing: ${event}`);
      
      // Queue the event
      this.eventQueue.push({ event, data, timestamp: Date.now() });
      
      // Try to connect if we have a token
      const token = localStorage.getItem('token');
      if (token && !this.connectionPromise) {
        this.connect(token).catch(err => {
          console.error('Failed to reconnect:', err);
        });
      }
      
      return false;
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
      
      if (this.listeners.get(event).size === 0) {
        this.listeners.delete(event);
      }
    }
    
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  once(event, callback) {
    if (this.socket) {
      this.socket.once(event, callback);
    } else {
      console.warn('Socket not initialized, cannot add one-time listener for:', event);
    }
  }

  // Process queued events after reconnection
  processEventQueue() {
    if (this.eventQueue.length === 0) return;
    
    console.log(`📤 Processing ${this.eventQueue.length} queued events`);
    
    // Process events that are less than 30 seconds old
    const now = Date.now();
    const validEvents = this.eventQueue.filter(item => 
      (now - item.timestamp) < 30000
    );
    
    validEvents.forEach(({ event, data }) => {
      this.emit(event, data);
    });
    
    // Clear the queue
    this.eventQueue = [];
  }

  // Reattach all listeners after reconnection
  reattachListeners() {
    console.log('🔄 Reattaching event listeners');
    
    this.listeners.forEach((callbacks, event) => {
      callbacks.forEach(callback => {
        this.socket.on(event, callback);
      });
    });
  }

  // Utility methods
  getSocket() {
    return this.socket;
  }

  isConnected() {
    return this.connected && this.socket?.connected;
  }

  isAuthenticated() {
    return this.authenticated;
  }

  getUserId() {
    return this.userId;
  }

  getConnectionState() {
    return {
      connected: this.connected,
      authenticated: this.authenticated,
      reconnectAttempts: this.reconnectAttempts,
      queuedEvents: this.eventQueue.length,
      socketId: this.socket?.id
    };
  }

  // Room management helpers
  joinRoom(roomId, data = {}) {
    return this.emit('join-room', { roomId, ...data });
  }

  leaveRoom(roomId, data = {}) {
    return this.emit('leave-room', { roomId, ...data });
  }

  // Draft helpers
  joinDraft(contestId, entryId) {
    return this.emit('join-draft', { contestId, entryId });
  }

  leaveDraft(contestId, entryId) {
    return this.emit('leave-draft', { contestId, entryId });
  }

  // Clean up on app unmount
  cleanup() {
    console.log('🧹 Cleaning up socket service');
    this.disconnect();
  }
}

// Create singleton instance
const socketService = new SocketService();

// Auto-cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    socketService.cleanup();
  });
}

export default socketService;