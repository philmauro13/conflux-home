# Onboarding Polish — Deferred Items

> Things that stand out but aren't worth fixing today. Ship first, polish later.

## Guided Tour (Post-Desktop First Load)
- **First-run guided tour** — After the WelcomeOverlay ("Hey [name], I'm ZigBot"), the desktop should walk through a skippable guided tour. Steps: "This is your Dock" (highlight taskbar), "This is your TopBar" (highlight system icons), "Chat with any agent" (highlight agent click), "Explore your apps" (highlight a widget). Standard OS-style skip/done flow. Needs a TourOverlay component with spotlight/highlight masks.
- **WelcomeOverlay could be richer** — currently a card with avatars. Could be a full cinematic moment before the desktop loads.

## Welcome Screen (Step 0)
- **Mouse-follow glow is choppy** — the 0.3s CSS transition feels laggy on fast mouse movement. Could use `requestAnimationFrame` + lerped interpolation for buttery smooth tracking, or a canvas-based approach. Low priority for launch.

## Provider Screen (Step 1)
- **Heartbeat SVG animation could be smoother** — the draw animation restarts feels abrupt. Could use a continuous loop with shorter gaps.
- **BYOK modal z-index stacking** — when both the advanced modal and key input modal are open, backdrop blur stacks. Minor.

## Conversation Screen (Step 2)
- **Chat bubbles have no entrance animation per-message** — they just appear. Could add staggered slide-up per bubble.
- **Typing indicator** — ZigBot's response appears after 800ms timeout with no typing animation. A "ZigBot is typing..." indicator would feel more alive.

## Team Screen (Step 3)
- **Agent cards could show avatars/images** — currently emoji-only. Agent artwork would elevate this significantly.
- **Toggle switch animation** — works but could use a small haptic-like bounce sound effect.

## Google Connect (Step 4)
- **OAuth flow UX** — opening a browser tab and coming back feels disconnected. Deep linking or embedded flow would be better long-term.
- **Error states are basic** — just a warning emoji and retry button. Could be more helpful.

## Alive Screen (Step 5)
- **Confetti particles are simple** — could use physics-based particles with gravity and wind.
- **"Syncing neural pathways" text is generic** — could show actual per-agent status messages.

## Global / Cross-Cutting
- **No mobile breakpoint testing yet** — all screens need a pass on narrow viewports (< 400px).
- **No dark/light theme transition** — onboarding forces dark, but the switch to user preference after could be jarring.
- **Progress dots animation** — could be more dynamic (liquid fill, morphing shapes).
- **No sound design** — subtle UI sounds (clicks, success chimes) would add polish.
- **No loading skeletons** — if provider check or Google auth takes time, there's no skeleton/shimmer.
- **Step transitions** — currently a quick opacity swap. Could use slide or fade transitions between steps.
- **Accessibility** — no ARIA labels, keyboard navigation, or screen reader support yet.
- **`AGENT_EMOJIS` constant is unused** — now that `BACKGROUND_EMOJIS` is removed, `AGENT_EMOJIS` is dead code. Can remove later.
