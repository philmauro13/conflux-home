// Check if SUPABASE_ANON_KEY is set in the Edge Function
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");

console.log("[ENV CHECK] SUPABASE_URL:", SUPABASE_URL);
console.log("[ENV CHECK] SUPABASE_ANON_KEY is set:", !!SUPABASE_ANON_KEY);
console.log("[ENV CHECK] SUPABASE_ANON_KEY length:", SUPABASE_ANON_KEY?.length || 0);
console.log("[ENV CHECK] SUPABASE_ANON_KEY preview:", SUPABASE_ANON_KEY?.substring(0, 10) + "...");

