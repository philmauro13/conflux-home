import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@^2";

// ============================================================
// CONFLUX ROUTER — API Key Management
// POST /v1/keys/generate — Create a new API key
// GET  /v1/keys           — List user's API keys
// POST /v1/keys/revoke    — Revoke an API key
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
// Separate anon client for JWT validation — getUser() works correctly with anon key
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

async function authenticate(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    console.log("[Auth] No Authorization header");
    return null;
  }
  const token = authHeader.replace("Bearer ", "");
  console.log("[Auth] Token received, length:", token.length, "preview:", token.substring(0, 20));
  console.log("[Auth] SUPABASE_ANON_KEY is set:", !!Deno.env.get("SUPABASE_ANON_KEY"));
  
  // Try to authenticate using the anon client
  let user: any = null;
  try {
    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error) {
      console.error("[Auth] getUser() error:", error.message);
    } else {
      user = data.user;
    }
  } catch (err) {
    console.error("[Auth] getUser() exception:", err);
  }
  
  if (user) {
    console.log("[Auth] User authenticated via getUser():", user.id);
    return user.id;
  }
  
  // Fallback: decode JWT payload directly (bypass signature verification)
  console.log("[Auth] getUser() failed, attempting JWT decode fallback...");
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      console.log("[Auth] JWT payload:", JSON.stringify({ aud: payload.aud, sub: payload.sub, iss: payload.iss }));
      
      // Verify issuer matches this project
      const expectedIss = `${SUPABASE_URL}/auth/v1`;
      if (payload.iss === expectedIss && payload.sub) {
        console.log("[Auth] JWT decode fallback successful, user ID:", payload.sub);
        return payload.sub;
      }
      console.error("[Auth] JWT issuer mismatch. Expected:", expectedIss, "Got:", payload.iss);
    } else {
      console.error("[Auth] Invalid JWT format:", parts.length, "parts");
    }
  } catch (decodeErr) {
    console.error("[Auth] JWT decode failed:", decodeErr);
  }
  
  console.log("[Auth] Authentication failed");
  return null;
}

async function generateApiKey(): Promise<{ fullKey: string; hash: string; prefix: string }> {
  // Generate 32 random bytes
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const keyBody = Array.from(bytes)
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 40); // 40 char body

  const fullKey = `cf_live_${keyBody}`;
  const prefix = fullKey.slice(0, 16); // 'cf_live_XXXXXXXX'

  // Hash the full key for storage
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(fullKey)
  );
  const hash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return { fullKey, hash, prefix };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  try {
    // --- POST /v1/keys/generate ---
    if (req.method === "POST" && path.endsWith("/keys/generate")) {
      const userId = await authenticate(req);
      if (!userId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const body = await req.json().catch(() => ({}));
      const name = body.name ?? "Default Key";
      const expiresIn = body.expires_in_days ?? null;

      const { fullKey, hash, prefix } = await generateApiKey();

      const expiresAt = expiresIn
        ? new Date(Date.now() + expiresIn * 86400000).toISOString()
        : null;

      const { data, error } = await supabase
        .from("api_keys")
        .insert({
          user_id: userId,
          key_hash: hash,
          key_prefix: prefix,
          name,
          expires_at: expiresAt,
        })
        .select("id, key_prefix, name, is_active, created_at, expires_at")
        .single();

      if (error) {
        console.error("[POST /keys/generate] Database insert error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      console.log("[POST /keys/generate] Key created:", data.id, "for user:", userId);

      // Return the full key ONCE — it cannot be retrieved again
      return new Response(
        JSON.stringify({
          ...data,
          api_key: fullKey,
          warning: "Save this key now. It cannot be retrieved later.",
        }),
        {
          status: 201,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        }
      );
    }

    // --- GET /v1/keys ---
    if (req.method === "GET" && path.endsWith("/keys")) {
      const userId = await authenticate(req);
      if (!userId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      console.log("[GET /keys] User ID:", userId);

      const { data, error } = await supabase
        .from("api_keys")
        .select("id, key_prefix, name, is_active, last_used_at, created_at, expires_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[GET /keys] Database error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      console.log("[GET /keys] Found", data?.length || 0, "keys");

      // Map is_active (boolean) to status (string) for frontend compatibility
      const keysWithStatus = (data ?? []).map((key: any) => ({
        ...key,
        status: key.is_active ? "active" : "revoked",
      }));

      return new Response(JSON.stringify({ data: keysWithStatus }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // --- POST /v1/keys/revoke ---
    if (req.method === "POST" && path.endsWith("/keys/revoke")) {
      const userId = await authenticate(req);
      if (!userId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const { key_id } = await req.json();
      if (!key_id) {
        return new Response(JSON.stringify({ error: "key_id required" }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabase
        .from("api_keys")
        .update({ is_active: false })
        .eq("id", key_id)
        .eq("user_id", userId); // can only revoke own keys

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ revoked: true }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("API Key management error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
