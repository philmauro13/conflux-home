// triggerFairyNudge — fires a nudge into the Conflux Fairy (NeuralBrain)
// Any component can call this to make the fairy deliver a speech bubble nudge.

import type { FairyNudge } from '../components/conflux/ConfluxPresence';

export function triggerFairyNudge(nudge: FairyNudge) {
  window.dispatchEvent(new CustomEvent('conflux:fairy-nudge', { detail: nudge }));
}
