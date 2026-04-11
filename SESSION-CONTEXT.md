# Session Context — Pick Up Here Next Session

> **Last session:** 2026-04-02 14:18 MDT
> **Next priority:** Implement sound system (Phase 1: UI sounds)

---

## What We Did This Session

1. **Family Pitch Package** — Complete and updated
   - All docs use **Frank Azzaro** (professional) / **Frankie** (informal email)
   - Pricing corrected to **$24.99/mo Pro**, **$49.99/mo Power**, 3 break-even
   - Credit packs: $5 (1,500), $10 (3,200), $20 (7,000), $50 (18,000)
   - Files at `/home/calo/.openclaw/workspace/family-pitch/`

2. **Guided Tour Spec** — Written, NOT implemented
   - File: `/home/calo/.openclaw/workspace/tour-design-spec.md`
   - 7-step walkthrough post-onboarding
   - SVG spotlight system, localStorage, keyboard nav

3. **Sound Design Plan** — Written, NOT implemented
   - File: `/home/calo/.openclaw/workspace/sound-design-plan.md`
   - 55+ sounds across 4 categories
   - Web Audio API architecture

---

## What's Next: Sound Implementation

**Goal:** Implement Phase 1 UI sounds in one session.

### Start Here (paste this as your first message):

```
We're picking up from where we left off. The sound design plan is at /home/calo/.openclaw/workspace/sound-design-plan.md — read it first, then implement Phase 1 (UI sounds foundation).

What Phase 1 includes:
1. SoundManager class using Web Audio API — src/lib/sound.ts
2. Volume settings UI in Settings — src/components/settings/SoundSection.tsx
3. localStorage persistence for volume/mute
4. Preload critical UI sounds
5. Wire sound triggers to existing buttons/components

Sound files needed (generate or source from free packs):
- ui/click.ogg — soft tactile tap
- ui/success.ogg — bright ding
- ui/error.ogg — soft buzz
- ui/notify.ogg — notification chime
- ui/toggle-on.ogg — rising tick
- ui/toggle-off.ogg — falling tick

Save files to: src/assets/sounds/ui/

The project is at /home/calo/.openclaw/workspace/conflux-home/
Tech: Tauri v2 + React + TypeScript
```

---

## What's After Sound: Guided Tour

**Goal:** Implement the guided tour in a separate session.

### Start Here (paste this as your first message):

```
We're picking up from where we left off. The guided tour spec is at /home/calo/.openclaw/workspace/tour-design-spec.md — read it first, then implement the guided tour.

What to build:
1. GuidedTour.tsx — main tour controller
2. TourSpotlight.tsx — SVG overlay with cutout
3. TourTooltip.tsx — floating tooltip with arrow
4. useTourState.ts — localStorage + state hook
5. tour.css — all tour styles
6. Add data-tour-id attributes to DesktopV2.tsx elements
7. Add "Replay Tour" button to Settings

Tour triggers after WelcomeOverlay dismisses (check localStorage 'conflux-tour-completed').
7 steps: Welcome → Dock → Agents → Apps → Chat → Settings → Ready

The project is at /home/calo/.openclaw/workspace/conflux-home/
Tech: Tauri v2 + React + TypeScript
```

---

## Key Files Reference

| File | Purpose |
|---|---|
| `family-pitch/FAMILY_EMAIL.md` | Personal email to parents |
| `family-pitch/pitch-deck.html` | Visual 11-slide deck (HTML) |
| `family-pitch/ONE_PAGER.md` | Product overview |
| `family-pitch/FINANCIALS.md` | Numbers, grants, projections |
| `family-pitch/DEMO_SCRIPT.md` | 5-min presentation script |
| `tour-design-spec.md` | Tour design spec (not implemented) |
| `sound-design-plan.md` | Sound design plan (not implemented) |

---

## Current Pricing (Verified from stripe.rs)
- Free: $0/mo, 500 credits
- Pro: $24.99/mo, 10,000 credits
- Power: $49.99/mo, 30,000 credits
- Credit packs: $5/1,500 | $10/3,200 | $20/7,000 | $50/18,000
- Break-even: 3 Pro subscribers

---

## Don's Preferences Reminder
- Name: Frank Azzaro (professional docs), Frankie (family email)
- Pricing: $24.99/mo Pro (NOT $14.99 — that was wrong, corrected)
- Always verify from actual code, not assumptions
