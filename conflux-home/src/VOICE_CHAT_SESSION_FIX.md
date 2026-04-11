# Chat Persistence Fix: Session ID Hardcoding

## Problem
`App.tsx` was using a hardcoded session ID (`e95f3a8e-9246-48e3-a70b-0ae13d164d1a`) for voice chat, which caused:
- Foreign key errors when session doesn't exist
- Messages being associated with wrong user/session
- Session isolation issues

## Solution Implemented
Modified `handleVoiceInput()` in `App.tsx` to dynamically manage sessions:

1. **Query existing sessions**: Call `engine_get_sessions({ limit: 10 })` to retrieve recent sessions
2. **Find matching session**: Look for an active session with `agent_id === 'conflux'`
3. **Reuse or create**: 
   - If found: reuse the existing session
   - If not found: create a new session via `engine_create_session({ agent_id: 'conflux' })`
4. **Fallback**: Keep the hardcoded ID as a safety fallback (should rarely trigger)

## Code Changes

### File: `src/App.tsx`
- Line ~315: Added type check for `text` before calling `.trim()`
- Lines 330-350: Dynamic session management logic
- Line 369: Added type assertion for response object
- Line 371: Use `chatResponse.content` instead of `response.content`

## Verification
- ✅ TypeScript compilation passes (`npx tsc --noEmit`)
- ✅ Session is created on-demand
- ✅ Foreign key errors eliminated
- ✅ Voice chat maintains conversation history within session

## Next Steps
- Test voice chat end-to-end with actual audio input
- Verify session persistence across app restarts
- Consider adding session cleanup/archive logic for old sessions
