// Re-export the same Supabase client used by authService so realtime
// subscriptions share the user's authenticated session (instead of opening
// a second, unauthenticated socket).
import { supabase } from './authService';

export default supabase;
