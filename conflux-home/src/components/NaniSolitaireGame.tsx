import { useState, useEffect, useRef, useCallback } from 'react';
import { playSolitairePlace, playSolitaireFoundation, playSolitaireWin, playSolitaireShuffle, playSolitaireInvalid } from '../lib/sound';
import '../styles-nani-solitaire.css';

// ── Types ──

interface Card {
  rank: string;       // 'A', '2'-'10', 'J', 'Q', 'K'
  suit: '♠' | '♥' | '♦' | '♣';
  isRed: boolean;
}

interface SlotState {
  type: SlotType;
  isEmpty: boolean;
  card: Card | null;
}

type SlotType = 'KING' | 'QUEEN' | 'JACK' | 'FREE';

type GamePhase = 'playing' | 'pairing' | 'gameover' | 'won';

interface NaniSolitaireGameProps {
  onBack: () => void;
}

// ── Constants ──

const SLOT_TYPES: SlotType[] = [
  'KING',  'QUEEN', 'QUEEN', 'KING',
  'JACK',  'FREE',  'FREE',  'JACK',
  'JACK',  'FREE',  'FREE',  'JACK',
  'KING',  'QUEEN', 'QUEEN', 'KING',
];

const SUITS: Card['suit'][] = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// ── Helpers ──

function isRed(suit: Card['suit']): boolean {
  return suit === '♥' || suit === '♦';
}

function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit, isRed: isRed(suit) });
    }
  }
  return deck;
}

function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function createInitialState(): SlotState[] {
  return SLOT_TYPES.map(type => ({ type, isEmpty: true, card: null }));
}

/** Convert rank to numeric value for sum-of-10 matching */
function rankToValue(rank: string): number {
  if (rank === 'A') return 1;
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 0; // face cards don't pair
  return parseInt(rank, 10);
}

/** Check if two cards sum to 10 */
function pairsTo10(a: Card, b: Card): boolean {
  const va = rankToValue(a.rank);
  const vb = rankToValue(b.rank);
  return va > 0 && vb > 0 && va + vb === 10;
}

/** Can a card be placed on a given slot? */
function canPlace(card: Card, slot: SlotState): boolean {
  if (!slot.isEmpty) return false;
  if (card.rank === 'K') return slot.type === 'KING';
  if (card.rank === 'Q') return slot.type === 'QUEEN';
  if (card.rank === 'J') return slot.type === 'JACK';
  // Number cards + Aces → any empty slot
  return true;
}

/** Count valid sum-of-10 pairs remaining on the grid */
function countValidPairs(slots: SlotState[]): number {
  // Count cards by numeric value
  const counts: Record<number, number> = {};
  for (const slot of slots) {
    if (slot.isEmpty || !slot.card) continue;
    const val = rankToValue(slot.card.rank);
    if (val > 0) {
      counts[val] = (counts[val] || 0) + 1;
    }
  }

  let pairs = 0;
  // A+9: min of count[1] and count[9]
  pairs += Math.min(counts[1] || 0, counts[9] || 0);
  // 2+8
  pairs += Math.min(counts[2] || 0, counts[8] || 0);
  // 3+7
  pairs += Math.min(counts[3] || 0, counts[7] || 0);
  // 4+6
  pairs += Math.min(counts[4] || 0, counts[6] || 0);
  // 5+5: floor(count[5] / 2)
  pairs += Math.floor((counts[5] || 0) / 2);

  return pairs;
}

/** Check if there's any valid placement for the current card */
function hasValidPlacement(card: Card, slots: SlotState[]): boolean {
  if (card.rank === '10') return true; // auto-discard
  return slots.some(slot => canPlace(card, slot));
}

// ── Particle System ──

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

function spawnParticles(
  canvas: HTMLCanvasElement,
  particles: Particle[],
  x: number,
  y: number,
  count: number,
  colors: string[],
) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const speed = 2 + Math.random() * 4;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      maxLife: 0.6 + Math.random() * 0.4,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 3 + Math.random() * 4,
    });
  }
}

// ── Component ──

export default function NaniSolitaireGame({ onBack }: NaniSolitaireGameProps) {
  // Core state
  const [deck, setDeck] = useState<Card[]>([]);
  const [currentCard, setCurrentCard] = useState<Card | null>(null);
  const [slots, setSlots] = useState<SlotState[]>(createInitialState);
  const [phase, setPhase] = useState<GamePhase>('playing');
  const [discardPile, setDiscardPile] = useState<Card[]>([]);
  const [roundsCompleted, setRoundsCompleted] = useState(0);
  const [showRules, setShowRules] = useState(false);

  // Refs for pairing mode (avoid stale closure issues)
  const selectedSlotRef = useRef<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const pairingModeRef = useRef(false);

  // Particle ref
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animFrameRef = useRef<number>(0);

  // ── Initialize game ──

  const initGame = useCallback(() => {
    const newDeck = shuffleDeck(createDeck());
    const firstCard = newDeck.pop()!;

    setDeck(newDeck);
    setCurrentCard(firstCard);
    setSlots(createInitialState());
    setPhase('playing');
    setDiscardPile([]);
    setRoundsCompleted(0);
    selectedSlotRef.current = null;
    setSelectedSlot(null);
    pairingModeRef.current = false;

    // Auto-discard if first card is a 10
    if (firstCard.rank === '10') {
      setTimeout(() => {
        setDiscardPile([firstCard]);
        setCurrentCard(null);
      }, 400);
    }
  }, []);

  useEffect(() => {
    initGame();
  }, [initGame]);

  // ── Particle animation loop ──

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const animate = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.12;
        p.life -= 0.016 / p.maxLife;

        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  const fireParticles = useCallback((colors: string[], count = 20) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = canvas.offsetWidth / 2;
    const cy = canvas.offsetHeight / 2;
    spawnParticles(canvas, particlesRef.current, cx, cy, count, colors);
  }, []);

  // ── Draw a card from the deck ──

  const drawCard = useCallback(() => {
    if (phase !== 'playing' || currentCard !== null) return;
    if (deck.length === 0) return;

    const newDeck = [...deck];
    const drawn = newDeck.pop()!;
    setDeck(newDeck);
    setCurrentCard(drawn);

    // Check if card is a 10 → auto-discard
    if (drawn.rank === '10') {
      setTimeout(() => {
        setDiscardPile(prev => [...prev, drawn]);
        setCurrentCard(null);
        playSolitaireInvalid();
      }, 400);
      return;
    }

    // Check if any valid placement exists
    if (!hasValidPlacement(drawn, slots)) {
      // No valid placement → game over
      setTimeout(() => {
        setPhase('gameover');
        playSolitaireInvalid();
      }, 600);
    }
  }, [phase, currentCard, deck, slots]);

  // ── Place card on a slot ──

  const handleSlotClick = useCallback((index: number) => {
    if (phase === 'gameover' || phase === 'won') return;

    // ── Pairing mode ──
    if (phase === 'pairing') {
      const slot = slots[index];
      if (slot.isEmpty) return; // can't select empty slots during pairing

      if (selectedSlotRef.current === null) {
        // First card selected
        selectedSlotRef.current = index;
        setSelectedSlot(index);
        playSolitairePlace();
      } else if (selectedSlotRef.current === index) {
        // Deselect
        selectedSlotRef.current = null;
        setSelectedSlot(null);
      } else {
        // Second card selected — check for sum-of-10
        const firstSlot = slots[selectedSlotRef.current];
        const secondSlot = slot;

        if (pairsTo10(firstSlot.card!, secondSlot.card!)) {
          // Match! Remove both cards
          const newSlots = [...slots];
          newSlots[selectedSlotRef.current] = { type: SLOT_TYPES[selectedSlotRef.current], isEmpty: true, card: null };
          newSlots[index] = { type: SLOT_TYPES[index], isEmpty: true, card: null };

          // Add matched cards to discard
          const newDiscard = [...discardPile, firstSlot.card!, secondSlot.card!];

          selectedSlotRef.current = null;
          setSelectedSlot(null);

          playSolitaireFoundation();
          fireParticles(['#34d399', '#6ee7b7', '#a7f3d0'], 15);

          // Check if more pairs available
          const remainingPairs = countValidPairs(newSlots);

          setSlots(newSlots);
          setDiscardPile(newDiscard);

          if (remainingPairs === 0) {
            // No more pairs available on current grid
            setTimeout(() => {
              const gridClear = newSlots.every(s => s.isEmpty);
              if (gridClear && deck.length === 0) {
                // Grid completely clear + deck exhausted = WIN!
                setPhase('won');
                playSolitaireWin();
                fireParticles(['#fbbf24', '#f59e0b', '#d97706', '#34d399', '#8b5cf6'], 40);
              } else if (deck.length > 0) {
                // Draw next card and continue placement
                setPhase('playing');
                pairingModeRef.current = false;
                const newDeck2 = [...deck];
                const drawn = newDeck2.pop()!;
                setDeck(newDeck2);
                setCurrentCard(drawn);
                if (drawn.rank === '10') {
                  setTimeout(() => {
                    setDiscardPile(prev => [...prev, drawn]);
                    setCurrentCard(null);
                  }, 400);
                }
              } else {
                // Deck empty but grid still has unpaired face cards — game over
                setPhase('gameover');
                playSolitaireInvalid();
              }
              setRoundsCompleted(prev => prev + 1);
            }, 500);
          } else {
            // More pairs available — stay in pairing mode
            pairingModeRef.current = true;
          }
        } else {
          // No match — deselect with error sound
          playSolitaireInvalid();
          selectedSlotRef.current = null;
          setSelectedSlot(null);
        }
      }
      return;
    }

    // ── Placement mode ──
    if (currentCard === null) return;
    if (!slots[index].isEmpty) return;
    if (!canPlace(currentCard, slots[index])) {
      playSolitaireInvalid();
      return;
    }

    // Place card
    playSolitairePlace();
    const newSlots = [...slots];
    newSlots[index] = { type: SLOT_TYPES[index], isEmpty: false, card: currentCard };

    // Check if grid is now full
    const isFull = newSlots.every(s => !s.isEmpty);

    setSlots(newSlots);
    setCurrentCard(null);

    if (isFull) {
      // Enter pairing mode
      setTimeout(() => {
        setPhase('pairing');
        pairingModeRef.current = true;
        fireParticles(['#a78bfa', '#8b5cf6', '#7c3aed'], 12);
      }, 300);
    } else if (deck.length === 0) {
      // Deck empty and grid not full — check if we can still play
      if (countValidPairs(newSlots) > 0) {
        // Grid has valid pairs — enter pairing mode even though not full
        setTimeout(() => {
          setPhase('pairing');
          pairingModeRef.current = true;
          fireParticles(['#a78bfa', '#8b5cf6', '#7c3aed'], 12);
        }, 300);
      } else {
        // No pairs, deck empty, grid not full — truly stuck
        setTimeout(() => {
          setPhase('gameover');
          playSolitaireInvalid();
        }, 500);
      }
    }
  }, [phase, slots, currentCard, discardPile, deck, fireParticles]);

  // ── Render ──

  const canDraw = phase === 'playing' && currentCard === null && deck.length > 0;
  const isPairing = phase === 'pairing';
  const isGameOver = phase === 'gameover';
  const isWon = phase === 'won';

  return (
    <div className="nani-solitaire">
      {/* Particles */}
      <canvas ref={canvasRef} className="nani-particles" />

      {/* Rules button */}
      <button className="nani-rules-btn" onClick={() => setShowRules(true)} title="How to play">
        ?
      </button>

      {/* Rules overlay */}
      {showRules && (
        <div className="nani-rules-overlay" onClick={() => setShowRules(false)}>
          <div className="nani-rules-content" onClick={e => e.stopPropagation()}>
            <h3>🎴 Nani Solitaire</h3>
            <p>
              <strong>Goal:</strong> Fill the 4×4 grid, then match pairs that sum to 10.
            </p>
            <p>
              <strong>Placement:</strong> Click the draw pile to reveal a card. Click an empty slot to place it.
              <br />• <strong>Kings</strong> → corner slots only
              <br />• <strong>Queens</strong> → edge slots only
              <br />• <strong>Jacks</strong> → side-middle slots only
              <br />• <strong>Number cards & Aces</strong> → any empty slot
              <br />• <strong>10s</strong> → auto-discarded
            </p>
            <p>
              <strong>Pairing:</strong> When the grid is full, click two cards whose values add up to 10.
              <br />A+9, 2+8, 3+7, 4+6, 5+5
            </p>
            <p>
              <strong>Win:</strong> Clear all cards from the deck and grid!
            </p>
            <button className="nani-rules-close" onClick={() => setShowRules(false)}>
              Got it!
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="nani-header">
        <div className="nani-title-group">
          <span className="nani-emoji">🎴</span>
          <div>
            <h2 className="nani-title">Nani Solitaire</h2>
            <p className="nani-subtitle">A family tradition</p>
          </div>
        </div>
        <div className="nani-stats">
          <div className="nani-stat">
            <div className="nani-stat-value">{deck.length}</div>
            <div className="nani-stat-label">Deck</div>
          </div>
          <div className="nani-stat">
            <div className="nani-stat-value">{roundsCompleted}</div>
            <div className="nani-stat-label">Rounds</div>
          </div>
          <div className="nani-stat">
            <div className="nani-stat-value">{discardPile.length}</div>
            <div className="nani-stat-label">Discard</div>
          </div>
        </div>
      </div>

      {/* Info bar */}
      {!isGameOver && !isWon && (
        <div className={`nani-info-bar ${isPairing ? 'pairing' : ''} ${deck.length < 5 ? 'warning' : ''}`}>
          {isPairing
            ? selectedSlot !== null
              ? 'Pick a second card that adds up to 10…'
              : 'Grid full! Select a card to start pairing…'
            : currentCard === null
              ? deck.length > 0
                ? 'Click the deck to draw a card'
                : ' '  // briefly shown before gameover handles it
              : `Place your ${currentCard.rank}${currentCard.suit}`
          }
        </div>
      )}

      {/* Grid */}
      <div className="nani-grid">
        {slots.map((slot, index) => {
          const classes = ['nani-slot'];
          if (slot.isEmpty) {
            if (isPairing) {
              classes.push('nani-slot-locked');
            }
          } else {
            classes.push('nani-slot-filled');
            if (isPairing) {
              classes.push('nani-slot-pairing');
              if (selectedSlot === index) {
                classes.push('nani-slot-selected');
              }
            }
          }

          return (
            <div
              key={index}
              className={classes.join(' ')}
              onClick={() => handleSlotClick(index)}
            >
              {slot.isEmpty ? (
                <span className="nani-slot-type">
                  {slot.type === 'FREE' ? 'Any' : slot.type.charAt(0)}
                </span>
              ) : (
                <div className={`nani-card ${slot.card!.isRed ? 'red' : 'black'}`}>
                  <span className="nani-card-rank">{slot.card!.rank}</span>
                  <span className="nani-card-suit">{slot.card!.suit}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Draw / Discard piles */}
      <div className="nani-piles">
        {/* Draw pile */}
        <div
          className={`nani-pile nani-draw-pile ${!canDraw ? 'nani-pile-disabled' : ''}`}
          onClick={canDraw ? drawCard : undefined}
        >
          <div className="nani-card-back" />
          <span className="nani-pile-label">Deck ({deck.length})</span>
        </div>

        {/* Current card */}
        <div className="nani-pile nani-current-card">
          {currentCard ? (
            <div className={`nani-card ${currentCard.isRed ? 'red' : 'black'}`}>
              <span className="nani-card-rank">{currentCard.rank}</span>
              <span className="nani-card-suit">{currentCard.suit}</span>
            </div>
          ) : (
            <span className="nani-discard-placeholder">
              {phase === 'pairing' ? 'Pairing…' : 'Draw'}
            </span>
          )}
        </div>

        {/* Discard pile */}
        <div className="nani-pile nani-discard-pile">
          {discardPile.length > 0 ? (
            <div className={`nani-card ${discardPile[discardPile.length - 1].isRed ? 'red' : 'black'}`}>
              <span className="nani-card-rank">{discardPile[discardPile.length - 1].rank}</span>
              <span className="nani-card-suit">{discardPile[discardPile.length - 1].suit}</span>
            </div>
          ) : (
            <span className="nani-discard-placeholder">Empty</span>
          )}
          <span className="nani-pile-label">Discard</span>
        </div>
      </div>

      {/* Actions */}
      <div className="nani-actions">
        <button className="nani-new-game-btn" onClick={() => { playSolitaireShuffle(); initGame(); }}>
          New Game
        </button>
        <button className="nani-back-btn" onClick={onBack}>
          ← Back
        </button>
      </div>

      {/* Game Over overlay */}
      {isGameOver && (
        <div className="nani-gameover-overlay">
          <div className="nani-gameover-title">Game Over</div>
          <div className="nani-gameover-sub">
            No valid moves remaining
            {roundsCompleted > 0 && ` · ${roundsCompleted} round${roundsCompleted > 1 ? 's' : ''} completed`}
          </div>
          <button className="nani-gameover-btn" onClick={() => { playSolitaireShuffle(); initGame(); }}>
            Try Again
          </button>
        </div>
      )}

      {/* Win overlay */}
      {isWon && (
        <div className="nani-win-overlay">
          <div className="nani-win-title">🎉 You Win!</div>
          <div className="nani-win-sub">
            All cards cleared in {roundsCompleted} round{roundsCompleted !== 1 ? 's' : ''}
          </div>
          <button className="nani-gameover-btn" onClick={() => { playSolitaireShuffle(); initGame(); }}>
            Play Again
          </button>
        </div>
      )}
    </div>
  );
}
