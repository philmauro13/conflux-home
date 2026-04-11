# Session Continuation — Post v0.1.61

## What We Shipped Today (2026-04-10)

### v0.1.57–0.1.59: Voice Pipeline Fixes
- Android cron crash fixed, OpenAI key compile-time embedding
- Android CI missing env vars fixed
- Desktop STT/TTS confirmed working

### v0.1.60: Studio Features
- Studio-owned Replicate API key (CI secret)
- Credit check + deduction (image=3, voice=2)
- Save-to-Vault, voice output display, convertFileSrc
- Don tested — found Studio input field missing!

### v0.1.61: Studio UX Pass (pending build)
- **Fixed: Studio input field + generate button** (StudioPromptBar was imported but never rendered)
- **Credit badge** in Studio header (shows remaining credits)
- **Real thumbnails** in history (images shown instead of emoji)
- **Reference image upload** (📎 button, uses Tauri dialog plugin)
- **Rich backgrounds** for Studio/Vault/Echo (dark base + vivid gradients)
- **Default voice → George** (British male, JBFqnCBsd6RMkjVDRZzb)
- **Wallpaper generation command** (Replicate FLUX 1.1 Pro — blocked by 0 Replicate credits)
- **@tauri-apps/plugin-dialog** npm package installed
- **dialog:allow-open** permission added to capabilities

## Current Full Checklist

### ✅ Done
- [x] Desktop STT/TTS working (v0.1.57–0.1.59)
- [x] Studio image generation with studio-owned key (v0.1.60)
- [x] Studio voice generation with key fallback (v0.1.60)
- [x] Credit check + deduction for Studio (v0.1.60)
- [x] Save to Vault from Studio (v0.1.60)
- [x] Voice output display in frontend (v0.1.60)
- [x] Studio prompt bar + generate button visible (v0.1.61)
- [x] Credit badge in Studio header (v0.1.61)
- [x] Real image thumbnails in history (v0.1.61)
- [x] Reference image upload (v0.1.61)
- [x] Default voice → George (v0.1.61)
- [x] Rich backgrounds for Studio/Vault/Echo (v0.1.61)
- [x] Wallpaper generation command exists (v0.1.61) — needs Replicate credits to run

### 🔴 Open Issues
- [ ] **Android crash** — needs logcat: `adb logcat | grep -i "conflux|panic|rust"`
- [ ] **Replicate credits depleted** — can't generate wallpapers until credits added
- [ ] **Studio credit badge** — shows null when no user is logged in (expected, but verify)

### 📋 Remaining Features
- [ ] Studio: Video module (mocked)
- [ ] Studio: Music module (mocked)
- [ ] Studio: Web/Code module (mocked)
- [ ] Cybersecurity (Aegis/Viper)
- [ ] Heartbeat settings frequency fader
- [ ] Conflux drag-and-move

## Key Patterns
- API key chain: DB config → env var → option_env! compile-time → empty
- Credit: check before generate, charge after (fire & forget)
- Vault: download/copy to ~/.openclaw/studio/vault/, create vault_files entry
- Dialog: use `open()` from `@tauri-apps/plugin-dialog` (requires `dialog:allow-open` permission)
- History thumbnails: use getThumbnailUrl() → convertFileSrc(output_path) or output_url for images

## Where to Start Next Session
1. Ask Don: what worked, what broke in v0.1.61 testing
2. If Studio working: generate wallpapers (need Replicate credits), then move to next feature
3. If Android still crashes: get logcat output
4. Consider: wallpaper gen as a settings feature (user can trigger from UI)
