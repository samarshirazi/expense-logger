import { createClient } from '@supabase/supabase-js';

// Get Supabase config from environment
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

let supabase = null;

if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
} else {
  console.warn('Supabase configuration missing. Please set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY');
}

// Auth context and user management
class AuthService {
  constructor() {
    this.user = null;
    this.session = null;
    this.listeners = new Set();

    // Initialize auth state on startup
    this.initializeAuth();
  }

  async initializeAuth() {
    if (!supabase) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        this.setSession(session);
      }

      // Listen for auth changes
      supabase.auth.onAuthStateChange((event, session) => {
        console.log('Auth state changed:', event, session?.user?.email);

        if (session) {
          this.setSession(session);
        } else {
          this.clearSession();
        }

        this.notifyListeners();
      });

    } catch (error) {
      console.error('Error initializing auth:', error);
    }
  }

  setSession(session) {
    this.session = session;
    this.user = session.user;

    // Store session in localStorage for persistence
    localStorage.setItem('supabase_session', JSON.stringify(session));
  }

  clearSession() {
    this.session = null;
    this.user = null;

    // Remove session from localStorage
    localStorage.removeItem('supabase_session');
  }

  // Subscribe to auth state changes
  subscribe(callback) {
    this.listeners.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback);
    };
  }

  notifyListeners() {
    this.listeners.forEach(callback => {
      try {
        callback(this.user, this.session);
      } catch (error) {
        console.error('Error in auth listener:', error);
      }
    });
  }

  // Authentication methods
  async signUp(email, password, fullName) {
    if (!supabase) throw new Error('Supabase not configured');

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName || ''
          }
        }
      });

      if (error) throw error;

      return {
        user: data.user,
        session: data.session,
        needsConfirmation: !data.session // true if email confirmation is required
      };

    } catch (error) {
      console.error('Signup error:', error);
      throw new Error(error.message || 'Signup failed');
    }
  }

  async signIn(email, password) {
    if (!supabase) throw new Error('Supabase not configured');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      return {
        user: data.user,
        session: data.session
      };

    } catch (error) {
      console.error('Signin error:', error);
      throw new Error(error.message || 'Login failed');
    }
  }

  async signOut() {
    if (!supabase) return;

    try {
      const { error } = await supabase.auth.signOut();

      // Ignore session missing errors - just clear local session
      if (error && !error.message.includes('session missing')) {
        throw error;
      }

      this.clearSession();
      this.notifyListeners();

    } catch (error) {
      console.error('Signout error:', error);

      // Even if signout fails, clear local session
      this.clearSession();
      this.notifyListeners();

      // Don't throw error to UI if it's just a session issue
      if (!error.message.includes('session missing')) {
        throw new Error(error.message || 'Logout failed');
      }
    }
  }

  // Get current user and session
  getCurrentUser() {
    return this.user;
  }

  getCurrentSession() {
    return this.session;
  }

  getAccessToken() {
    return this.session?.access_token;
  }

  isAuthenticated() {
    return !!this.user && !!this.session;
  }

  // Get user display name
  getUserDisplayName() {
    if (!this.user) return '';

    return this.user.user_metadata?.full_name ||
           this.user.email?.split('@')[0] ||
           'User';
  }
}

// Create singleton instance
const authService = new AuthService();

export default authService;