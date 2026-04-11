# Conflux Home

**A home for your AI family.**

[![License](https://img.shields.io/badge/license-Proprietary-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](https://theconflux.com)
[![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri-FFC131?style=flat&logo=tauri)](https://tauri.app)
[![OpenClaw](https://img.shields.io/badge/Built%20on-OpenClaw-7C3AED?style=flat)](https://github.com/openclaw/openclaw)

Conflux Home is a desktop application where your AI agents live, work, and grow alongside you. Not a chat window. Not a web wrapper. A native desktop app (~32MB with Tauri) where agents have persistent memory, distinct personalities, and the ability to collaborate as a team.

→ **Download:** [theconflux.com](https://theconflux.com)  
→ **Discord:** [Join our community](https://discord.gg/conflux)  
→ **Documentation:** [docs.theconflux.com](https://docs.theconflux.com)

---

## Why Conflux Home?

March 2026 saw **12 new frontier model releases**. GPT-5.4, Claude Sonnet 4.6, Gemini 3.1, Grok 4.20, Llama 4, and the leaked Claude Mythos. Model churn is accelerating.

Most AI desktop apps lock you into one provider. When a new model drops, you start from zero — no memory, no context, no preferences.

**Conflux Home is model-agnostic.** Your agents persist regardless of which model powers them. Models come and go. Your AI family stays.

---

## What You Get

### 16 Built-in AI Agents

Each with a name, personality, and persistent memory:

| App | Agent | Purpose |
|-----|-------|---------|
| 🍳 Kitchen | Hearth | Meal planning, pantry tracking, grocery lists |
| 💰 Budget | Pulse | Expense tracking, pattern detection, savings goals |
| 🧠 Life Autopilot | Orbit | Focus engine, habit tracking, smart rescheduling |
| 🎯 Dreams | Horizon | Goal decomposition, milestone tracking |
| 📡 News Feed | Current | Daily briefing, trend alerts, information curation |
| 🏠 Home | Foundation | Maintenance tracking, appliance monitoring |
| 📁 Vault | — | File organization, project management |
| 🎨 Studio | — | Image generation (Replicate), voice synthesis (ElevenLabs) |
| 💬 Echo | — | Communication hub with pattern recognition |
| 🎮 Games | — | Minesweeper, Snake, Pac-Man, Solitaire |
| ...and more | | |

### Key Features

- **Persistent Memory:** Agents remember conversations, preferences, and habits across sessions
- **Model-Agnostic:** Use OpenAI, Anthropic, Google, DeepSeek, Groq, or local LLMs — switch anytime without losing context
- **32MB Native App:** Tauri + Rust + React. Not Electron bloat
- **Agent Marketplace:** Install new agents and extend capabilities
- **Free Tier:** 500 credits/month, no credit card required

---

## Pricing

| Plan | Price | Credits | Agents | Support |
|------|-------|---------|--------|---------|
| **Free** | $0/mo | 500/mo | 5 | Community |
| **Power** | $24.99/mo | 10,000/mo | Unlimited | Email |
| **Pro** | $49.99/mo | 30,000/mo | Unlimited + premium agents | Priority |

[See full pricing](https://theconflux.com/pricing)

---

## Architecture

```
Conflux Home
├── Desktop App (Tauri + Rust + React, ~32MB)
│   ├── Agent Engine (Rust) — runtime, tool calling, memory management
│   ├── SQLite Database — persistent agent state and conversation history
│   ├── React Frontend — desktop UI, chat interface, settings
│   └── Supabase Auth — JWT-based authentication
│
├── Cloud Router (Supabase Edge Function)
│   ├── Provider Key Management — keys never reach the client
│   ├── Model Routing & Failover — automatic provider failover
│   ├── Credit Billing — per-request cost tracking
│   └── Usage Logging — telemetry and analytics
│
└── OpenClaw Runtime (open-source)
    └── Agent orchestration, MCP integration, skill system
```

**Security:** Provider API keys are managed server-side. The desktop app authenticates via Supabase JWT. No credentials are stored in the client bundle.

---

## Built On

- **[Tauri](https://tauri.app)** — Native desktop framework
- **[OpenClaw](https://github.com/openclaw/openclaw)** — Open-source multi-agent platform (97M+ MCP installs)
- **[Supabase](https://supabase.com)** — Auth, database, Edge Functions
- **[React](https://react.dev)** — Frontend UI
- **[MCP](https://modelcontextprotocol.io)** — Tool integration protocol

---

## System Requirements

| Platform | Minimum | Architecture |
|----------|---------|-------------|
| Windows | Windows 10+ | x86_64 |
| macOS | macOS 11+ (Big Sur) | Intel + Apple Silicon |
| Linux | Ubuntu 20.04+, Fedora 34+ | x86_64 (AppImage, .deb) |

---

## Quick Start (Developers)

```bash
# Clone the repo
git clone https://github.com/TheConflux-Core/conflux-home.git
cd conflux-home

# Install dependencies
npm install

# Run in dev mode (requires OpenClaw gateway on localhost:18789)
npm run tauri:dev

# Build for production
npm run tauri:build
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for full setup instructions.

---

## The Vision

The AOL Play. In the 1990s, AOL made the internet accessible to everyone by bundling it into an easy-to-use package. Conflux Home does the same for AI agents.

Most people don't want to configure OpenRouter API keys. They don't want to manage model contexts. They just want AI help with their kitchen, budget, schedule, and goals.

Conflux Home gives them that — out of the box.

**Agent Marketplace (coming)** — Third-party developers will build and publish agents. You'll install them like apps on your phone.

**Family Accounts (coming)** — Household-level agents that understand your whole family, not just individuals.

**Desktop → Everywhere (coming)** — Today: desktop. Tomorrow: mobile, web, voice.

---

## Status

- ✅ Product built (16 apps, persistent memory, cloud router)
- ✅ Auth + billing (Supabase + Stripe)
- ✅ Auto-updater pipeline
- ✅ Code signing configured (CI/CD via GitHub Actions)
- 🚀 Launch in progress

---

## Community & Support

- **[Discord](https://discord.gg/conflux)** — Join our community
- **[GitHub Issues](https://github.com/TheConflux-Core/conflux-home/issues)** — Bug reports + feature requests
- **[Support Email](mailto:support@theconflux.com)** — General inquiries
- **[Privacy Policy](https://theconflux.com/privacy)** — How we handle your data
- **[Terms of Service](https://theconflux.com/terms)** — License agreement

---

## License

Proprietary — The Conflux AI, LLC

Conflux Home is commercial software. You may use the free tier indefinitely. Commercial use requires a Power or Pro subscription. See [LICENSE](LICENSE) for details.

---

**Conflux Home — A home for your AI family.**
