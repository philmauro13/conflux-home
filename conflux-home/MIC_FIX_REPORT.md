# Windows Microphone Fix Report

**Date:** 2026-04-09  
**Agent:** Forge  
**Issue:** Voice input fails on Windows, works on Linux

---

## Root Cause Analysis

### Architecture: Native Audio (NOT Browser getUserMedia)

The voice input system uses **cpal** (Rust native audio library) for microphone capture — NOT browser `navigator.mediaDevices.getUserMedia()`. This means:

- No Tauri WebView microphone permission is needed for capture
- The audio capture happens at the **native OS level** via cpal
- On Windows, cpal uses **WASAPI** (Windows Audio Session API) to access the microphone

### Primary Root Cause: Windows OS-Level Privacy Gate

On Windows 10/11, the OS enforces a privacy gate for microphone access by desktop apps:

**Settings → Privacy & Security → Microphone → "Let desktop apps access your microphone"** must be **ON**.

cpal's WASAPI backend respects this OS-level gate. When it's OFF:
- `host.default_input_device()` returns `None`
- The app gets the error: `"No microphone found"`
- The code had a brief Windows-specific error message (line 86 in `capture.rs`) but it was not actionable enough

### Secondary: Capabilities Configuration Gap

The Tauri v2 capabilities file (`src-tauri/capabilities/default.json`) was missing:
1. **`platforms` field** — without it, Tauri may not properly associate the capability with Windows
2. **`core:window:default`** permission — needed for proper window event handling on all platforms

---

## Changes Made

### 1. `src-tauri/capabilities/default.json`
- Added `"platforms": ["linux", "macOS", "windows"]` — ensures capability is explicitly granted on Windows
- Added `"core:window:default"` permission — needed for window event handling

### 2. `src-tauri/src/voice/capture.rs`
- **Improved error message** when no microphone found on Windows — now includes step-by-step fix instructions
- **Added `microphone_status()` function** — returns diagnostic JSON with device availability, device list, and platform-specific guidance
- Added `use serde_json;` import

### 3. `src-tauri/src/commands.rs`
- **Added `voice_check_microphone` command** (desktop + Android stub) — returns microphone diagnostic info from the frontend

### 4. `src-tauri/src/lib.rs`
- **Registered `voice_check_microphone`** in the Tauri `generate_handler![]`

---

## What This is NOT

- **Not a CSP issue** — CSP is set to `null` (permissive), and capture doesn't use WebView APIs
- **Not a Tauri ACL permission issue** — Custom Tauri commands registered via `generate_handler![]` are accessible when the window has a matching capability
- **Not a WebView2 permission issue** — Audio capture bypasses WebView entirely via cpal

---

## Windows Test Instructions

1. **Check Windows privacy settings:**
   - Open **Settings** (Win+I) → **Privacy & Security** → **Microphone**
   - Turn ON **"Microphone access"**
   - Turn ON **"Let desktop apps access your microphone"**
   - **Restart the app** after changing these settings

2. **Verify microphone is detected:**
   - Open the app
   - Call `voice_check_microphone` via invoke — should show `"available": true` and list devices
   - If no devices listed, check Windows Sound Settings → Input devices

3. **Test voice capture:**
   - Tap the mic button
   - Speak for a few seconds
   - Tap stop
   - Verify transcription appears

4. **If still failing:**
   - Run `cargo tauri dev` and check the console for cpal errors
   - Look for `"No microphone found"` or `"Failed to build input stream"` messages
   - Try with a different microphone/input device
   - Check if another app has exclusive microphone access

---

## Frontend Usage (new diagnostic command)

```typescript
import { invoke } from '@tauri-apps/api/core';

// Check microphone status
const status = await invoke('voice_check_microphone');
// Returns: { available: boolean, device_count: number, devices: string[], guidance: string }
```

This can be used to show a helpful error banner on Windows when the microphone isn't available.
