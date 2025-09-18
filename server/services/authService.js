const { initSupabase } = require('./supabaseService');

async function signUp(email, password, userData = {}) {
  try {
    const supabase = initSupabase();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: userData.fullName || '',
          ...userData
        }
      }
    });

    if (error) {
      throw error;
    }

    console.log('✅ User signed up successfully:', data.user?.email);
    return {
      user: data.user,
      session: data.session
    };

  } catch (error) {
    console.error('❌ Error signing up user:', error);
    throw new Error(`Signup failed: ${error.message}`);
  }
}

async function signIn(email, password) {
  try {
    const supabase = initSupabase();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      throw error;
    }

    console.log('✅ User signed in successfully:', data.user?.email);
    return {
      user: data.user,
      session: data.session
    };

  } catch (error) {
    console.error('❌ Error signing in user:', error);
    throw new Error(`Login failed: ${error.message}`);
  }
}

async function signOut() {
  try {
    const supabase = initSupabase();

    const { error } = await supabase.auth.signOut();

    if (error) {
      throw error;
    }

    console.log('✅ User signed out successfully');
    return true;

  } catch (error) {
    console.error('❌ Error signing out user:', error);
    throw new Error(`Logout failed: ${error.message}`);
  }
}

async function getCurrentUser(accessToken) {
  try {
    const supabase = initSupabase();

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);

    if (error) {
      throw error;
    }

    return user;

  } catch (error) {
    console.error('❌ Error getting current user:', error);
    return null;
  }
}

async function refreshSession(refreshToken) {
  try {
    const supabase = initSupabase();

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken
    });

    if (error) {
      throw error;
    }

    return {
      user: data.user,
      session: data.session
    };

  } catch (error) {
    console.error('❌ Error refreshing session:', error);
    throw new Error(`Session refresh failed: ${error.message}`);
  }
}

async function verifyAccessToken(accessToken) {
  try {
    const supabase = initSupabase();

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);

    if (error || !user) {
      return null;
    }

    return user;

  } catch (error) {
    console.error('❌ Error verifying access token:', error);
    return null;
  }
}

// Middleware to protect routes
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const token = authHeader.substring(7);

  verifyAccessToken(token)
    .then(user => {
      if (!user) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      req.user = user;
      next();
    })
    .catch(error => {
      console.error('Auth middleware error:', error);
      res.status(401).json({ error: 'Authentication failed' });
    });
}

module.exports = {
  signUp,
  signIn,
  signOut,
  getCurrentUser,
  refreshSession,
  verifyAccessToken,
  requireAuth
};