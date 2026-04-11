/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CEREBRAS_API_KEY: string;
  readonly VITE_GROQ_API_KEY: string;
  readonly VITE_MISTRAL_API_KEY: string;
  readonly VITE_DEEPSEEK_API_KEY: string;
  readonly VITE_CLOUDFLARE_API_KEY: string;
  readonly VITE_CLOUDFLARE_ACCOUNT_ID: string;
  readonly VITE_OPENAI_API_KEY: string;
  readonly VITE_ANTHROPIC_API_KEY: string;
  readonly VITE_XIAOMI_API_KEY: string;
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_GOOGLE_CLIENT_SECRET: string;
  readonly VITE_GEMINI_API_KEY: string;
  readonly VITE_APP_VERSION: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
