import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase ortam değişkenleri (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) bulunamadı! " +
    "Lütfen frontend-react/.env dosyasına bu anahtarları tanımlayın."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
