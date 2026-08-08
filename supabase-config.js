// Create a new file : supabase-config.js
const SUPABASE_URL = "https://czqdmrkjqdnzjmvjslmr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_rHv_DYV8oIGrSklR2uOL8Q_bVHhgnyR";

const forgeSupabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

let currentUserProfile = null;
console.log("Supabase connected:", forgeSupabase);
