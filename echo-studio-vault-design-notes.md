# Echo → Studio → Vault Design Alignment

## Current State Summary

### Echo (Mirror/Notebook)
**Theme:** Indigo deep (#1e1b4b) + amber accent (#f59e0b)  
**Tabs:** Write, Mirror, Timeline  
**Status:** "Electric blue" per MEMORY.md, but styles read as deep indigo  
**Action:** Tighten tab navigation, add glassmorphism panels, align amber accents

### Studio (Creator)
**Theme:** Electric gradient mesh (purple/cyan)  
**Status:** Gradient mesh animation working, needs "tightening"  
**Action:** Improve prompt bar alignment, add frosted glass panels, reduce animation noise

### Vault (File Browser)
**Theme:** Obsidian glassmorphism  
**Status:** Don says "fine for now" — verify connection, leave as-is

## Kitchen Design Pattern (Reference)

From `styles-kitchen.css`:
- Container: `.kitchen-matrix` → `height: 100%`, `padding: 40px 64px`
- Tab containers: `background: rgba(12, 10, 9, 0.85)`, `backdrop-filter: blur(20px)`
- Header: `.kitchen-title` → 28px, uppercase, amber color
- Tabs: `.kitchen-tab` → 12px border radius, amber border, active state glow

## Design Checklist

### Echo
- [ ] Update `.echo-hub` to match Kitchen container padding (40px 64px)
- [ ] Add frosted glass panels to Write tab (background + backdrop-filter)
- [ ] Style tab navigation with amber accents (border color, active state)
- [ ] Check title/subtitle hierarchy (should match Kitchen's `.kitchen-title`)
- [ ] Verify mood selector buttons have clear hover/active states

### Studio
- [ ] Check `.studio-container` padding and height
- [ ] Update `.studio-tabs` to use frosted glass like Kitchen
- [ ] Tighten gradient mesh — reduce opacity or animation speed?
- [ ] Add amber accents to match overall palette (purple/cyan → amber accent)
- [ ] Verify `.studio-prompt-bar` alignment (max-width 800px, centered)

### Vault
- [ ] Verify connection works (Tauri invoke commands)
- [ ] No redesign — leave as-is per Don's request

## Next Steps

1. Read Echo full component (EchoView.tsx) to understand structure
2. Read Studio full component (StudioView.tsx) to understand structure  
3. Compare tab navigation patterns (Kitchen vs Echo vs Studio)
4. Create unified tab component or update each individually
5. Apply glassmorphism patterns from Kitchen to Echo and Studio
6. Test on Windows (Don's primary platform)

## Reference Files

- `/home/calo/.openclaw/workspace/conflux-home/src/components/EchoView.tsx`
- `/home/calo/.openclaw/workspace/conflux-home/src/components/StudioView.tsx`
- `/home/calo/.openclaw/workspace/conflux-home/src/components/KitchenView.tsx`
- `/home/calo/.openclaw/workspace/conflux-home/src/styles-echo.css`
- `/home/calo/.openclaw/workspace/conflux-home/src/styles-studio.css`
- `/home/calo/.openclaw/workspace/conflux-home/src/styles-kitchen.css`
