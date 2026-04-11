// Test script for API key generation flow
// Run with: deno run --allow-net test_api_key_generation.ts

const SUPABASE_URL = "https://zcvhozqrssotirabdlzr.supabase.co";
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/conflux-keys/v1/keys/generate`;

// This is a test JWT - replace with real one from Supabase auth
const TEST_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItaWQiLCJleHAiOjk5OTk5OTk5OTksImlhdCI6MTYwOTQ1OTIwMH0.test-signature";

async function testApiKeyGeneration() {
  console.log("Testing API Key Generation...");
  console.log(`URL: ${EDGE_FUNCTION_URL}`);

  try {
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TEST_JWT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Test Key" }),
    });

    console.log(`Status: ${response.status}`);
    console.log(`Status Text: ${response.statusText}`);

    const text = await response.text();
    console.log(`Response: ${text}`);

    if (!response.ok) {
      console.log("\n❌ Request failed!");
      return;
    }

    const data = JSON.parse(text);
    console.log("\n✅ Success!");
    console.log("Key generated:", data.api_key);
    console.log("Key prefix:", data.key_prefix);
  } catch (err) {
    console.error("\n❌ Error:", err);
  }
}

testApiKeyGeneration();
