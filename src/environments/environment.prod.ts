import { supabasePublicConfig } from './supabase-public.config';

export const environment = {
  production: true,
  ...supabasePublicConfig,
};
