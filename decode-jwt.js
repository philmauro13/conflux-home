// Test script to decode a JWT token
// Usage: node decode-jwt.js <token>

const token = process.argv[2];

if (!token) {
  console.log("Usage: node decode-jwt.js <JWT_TOKEN>");
  console.log("\nGet the token from browser console:");
  console.log("1. Open DevTools (F12)");
  console.log("2. Go to Application tab");
  console.log("3. Local Storage -> https://www.theconflux.com");
  console.log("4. Find 'sb-zcvhozqrssotirabdlzr-auth-token'");
  console.log("5. Copy the 'access_token' value");
  process.exit(1);
}

try {
  const parts = token.split('.');
  if (parts.length !== 3) {
    console.log("Invalid JWT format");
    process.exit(1);
  }
  
  const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
  console.log("JWT Payload:");
  console.log(JSON.stringify(payload, null, 2));
  
  // Check expiry
  if (payload.exp) {
    const expDate = new Date(payload.exp * 1000);
    const now = new Date();
    console.log("\nToken expires:", expDate.toISOString());
    console.log("Is expired:", now > expDate);
    console.log("Time until expiry:", Math.floor((expDate.getTime() - now.getTime()) / 1000), "seconds");
  }
  
  // Check issuer
  console.log("\nIssuer:", payload.iss);
  console.log("Expected:", "https://zcvhozqrssotirabdlzr.supabase.co/auth/v1");
  console.log("Issuer matches:", payload.iss === "https://zcvhozqrssotirabdlzr.supabase.co/auth/v1");
  
  // Check subject (user ID)
  console.log("\nUser ID (sub):", payload.sub);
  
} catch (err) {
  console.error("Error decoding token:", err.message);
}
