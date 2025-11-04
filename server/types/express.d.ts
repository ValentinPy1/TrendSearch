import { User } from '@shared/schema';
import { User as SupabaseUser } from '@supabase/supabase-js';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      supabaseUser?: SupabaseUser;
    }
  }
}

export {};
