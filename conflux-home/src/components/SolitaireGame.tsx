import { useState, useCallback, useRef, useEffect } from 'react';
import {
  playSolitaireFlip,
  playSolitairePlace,
  playSolitaireFoundation,
  playSolitaireWin,
  playSolitaireShuffle,
  playSolitaireInvalid,
} from '../lib/sound';

// ─── Types ───────────────────────────────────────────────────────────────────

type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
type Color = 'red' | 'black';
type GameStatus = 'playing' | 'won' | 'idle';

interface Card {
  suit: Suit;
  rank: number; // 1=A, 11=J, 12=Q, 13=K
  faceUp: boolean;
}

interface Pile {
  cards: Card[];
}

interface DragState {
  active: boolean;
  sourcePile: string;
  sourceIndex: number;
  cards: Card[];
  offsetX: number;
  offsetY: number;
  x: number;
  y: number;
}

interface SolitaireGameProps {
  onBack: () => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  radius: number;
  color: string;
  suit: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CARD_W = 70;
const CARD_H = 98;
const CARD_RADIUS = 8;
const CARD_GAP = 20; // horizontal gap between columns
const CASCADE_OFFSET = 22; // vertical offset for face-down cards
const CASCADE_OPEN = 28; // vertical offset for face-up cards
const BOARD_PADDING = 16;
const CANVAS_W = BOARD_PADDING * 2 + CARD_W * 7 + CARD_GAP * 6;
const CANVAS_H = 540;

const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

const SUIT_COLORS: Record<Suit, string> = {
  hearts: '#ef4444',
  diamonds: '#ef4444',
  clubs: '#1f2937',
  spades: '#1f2937',
};

const RANK_LABELS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSuitColor(suit: Suit): Color {
  return suit === 'hearts' || suit === 'diamonds' ? 'red' : 'black';
}

function createDeck(): Card[] {
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const deck: Card[] = [];
  for (const suit of suits) {
    for (let rank = 1; rank <= 13; rank++) {
      deck.push({ suit, rank, faceUp: false });
    }
  }
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function dealGame(): {
  stock: Pile;
  waste: Pile;
  foundations: Pile[];
  tableau: Pile[];
} {
  const deck = createDeck();
  const tableau: Pile[] = Array.from({ length: 7 }, () => ({ cards: [] }));
  const foundations: Pile[] = Array.from({ length: 4 }, () => ({ cards: [] }));

  let idx = 0;
  for (let col = 0; col < 7; col++) {
    for (let row = col; row < 7; row++) {
      const card = deck[idx++];
      if (row === col) card.faceUp = true;
      tableau[row].cards.push(card);
    }
  }

  const stock: Pile = { cards: deck.slice(idx) };
  const waste: Pile = { cards: [] };

  return { stock, waste, foundations, tableau };
}

function getCardAt(tableau: Pile[], col: number, row: number): Card | null {
  if (col < 0 || col >= 7) return null;
  const pile = tableau[col];
  if (row < 0 || row >= pile.cards.length) return null;
  return pile.cards[row];
}

function canMoveToFoundation(card: Card, foundation: Pile): boolean {
  if (foundation.cards.length === 0) return card.rank === 1; // Only A on empty
  const top = foundation.cards[foundation.cards.length - 1];
  return top.suit === card.suit && card.rank === top.rank + 1;
}

function canMoveToTableau(card: Card, pile: Pile): boolean {
  if (pile.cards.length === 0) return card.rank === 13; // Only K on empty
  const top = pile.cards[pile.cards.length - 1];
  if (!top.faceUp) return false;
  return getSuitColor(card.suit) !== getSuitColor(top.suit) && card.rank === top.rank - 1;
}

function cardRect(
  pileName: string,
  pileIndex: number,
  cardIndex: number,
  totalCards: number,
  foundations: Pile[],
  tableau: Pile[],
): { x: number; y: number; w: number; h: number } {
  const pad = BOARD_PADDING;

  if (pileName === 'stock') {
    return { x: pad, y: pad, w: CARD_W, h: CARD_H };
  }
  if (pileName === 'waste') {
    return { x: pad + CARD_W + CARD_GAP, y: pad, w: CARD_W, h: CARD_H };
  }
  if (pileName === 'foundation') {
    const fx = pad + (CANVAS_W - BOARD_PADDING * 2) - (4 - pileIndex) * (CARD_W + CARD_GAP);
    return { x: fx, y: pad, w: CARD_W, h: CARD_H };
  }
  if (pileName === 'tableau') {
    const tx = pad + pileIndex * (CARD_W + CARD_GAP);
    let ty = pad + CARD_H + CARD_GAP;
    const pile = tableau[pileIndex];
    for (let i = 0; i < cardIndex; i++) {
      ty += pile.cards[i].faceUp ? CASCADE_OPEN : CASCADE_OFFSET;
    }
    return { x: tx, y: ty, w: CARD_W, h: CARD_H };
  }
  return { x: 0, y: 0, w: CARD_W, h: CARD_H };
}

function loadBestScores(): Record<string, number> {
  try {
    const saved = localStorage.getItem('conflux_solitaire_best');
    return saved ? JSON.parse(saved) : { time: Infinity, moves: Infinity };
  } catch {
    return { time: Infinity, moves: Infinity };
  }
}

function saveBestScores(scores: Record<string, number>) {
  localStorage.setItem('conflux_solitaire_best', JSON.stringify(scores));
}

// ─── Draw Card ───────────────────────────────────────────────────────────────

function drawCard(
  ctx: CanvasRenderingContext2D,
  card: Card,
  x: number,
  y: number,
  highlight: boolean,
  dragging: boolean,
) {
  const w = CARD_W;
  const h = CARD_H;
  const r = CARD_RADIUS;

  ctx.save();

  if (dragging) {
    ctx.shadowColor = 'rgba(251, 191, 36, 0.4)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;
  }

  // Card body
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);

  if (card.faceUp) {
    // Face up — white/light bg
    ctx.fillStyle = dragging ? '#fffef5' : '#fffefa';
    ctx.fill();

    if (highlight) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 10;
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 1;
    }
    ctx.stroke();

    // Reset shadow for text
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    const color = SUIT_COLORS[card.suit];
    const symbol = SUIT_SYMBOLS[card.suit];
    const label = RANK_LABELS[card.rank];

    // Top-left rank + suit
    ctx.fillStyle = color;
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 6, y + 17);
    ctx.font = '14px sans-serif';
    ctx.fillText(symbol, x + 6, y + 32);

    // Bottom-right rank + suit (rotated)
    ctx.save();
    ctx.translate(x + w - 6, y + h - 6);
    ctx.rotate(Math.PI);
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, 0, 11);
    ctx.font = '14px sans-serif';
    ctx.fillText(symbol, 0, 26);
    ctx.restore();

    // Center suit for face cards or large suit
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (card.rank >= 11) {
      // Face cards — show rank letter big
      ctx.fillStyle = color;
      ctx.font = 'bold 36px serif';
      ctx.fillText(label, x + w / 2, y + h / 2);
    } else if (card.rank === 1) {
      // Ace — big suit symbol
      ctx.fillStyle = color;
      ctx.font = '42px sans-serif';
      ctx.fillText(symbol, x + w / 2, y + h / 2);
    } else {
      // Number cards — show suit pattern
      ctx.fillStyle = color;
      ctx.font = '18px sans-serif';
      const count = card.rank;
      if (count <= 3) {
        for (let i = 0; i < count; i++) {
          const py = y + h * 0.25 + (i * h * 0.25);
          ctx.fillText(symbol, x + w / 2, py);
        }
      } else if (count <= 6) {
        for (let i = 0; i < Math.ceil(count / 2); i++) {
          const py = y + h * 0.2 + (i * h * 0.25);
          ctx.fillText(symbol, x + w * 0.3, py);
          if (i + Math.ceil(count / 2) < count || (count % 2 === 0)) {
            ctx.fillText(symbol, x + w * 0.7, py);
          }
        }
        if (count % 2 === 1) {
          ctx.fillText(symbol, x + w / 2, y + h * 0.5);
        }
      } else {
        // 7-10: simplified — show number big
        ctx.font = 'bold 32px serif';
        ctx.fillText(String(card.rank), x + w / 2, y + h / 2);
      }
    }
  } else {
    // Face down — patterned back
    ctx.fillStyle = '#1e1b4b';
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Inner pattern
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.12)';
    ctx.lineWidth = 0.5;
    const inset = 6;
    ctx.beginPath();
    ctx.roundRect(x + inset, y + inset, w - inset * 2, h - inset * 2, r - 2);
    ctx.stroke();

    // Diamond pattern
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.fillStyle = 'rgba(251, 191, 36, 0.15)';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 14);
    ctx.lineTo(cx + 10, cy);
    ctx.lineTo(cx, cy + 14);
    ctx.lineTo(cx - 10, cy);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function drawEmptyPile(ctx: CanvasRenderingContext2D, x: number, y: number, symbol?: string) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, CARD_W, CARD_H, CARD_RADIUS);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  if (symbol) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, x + CARD_W / 2, y + CARD_H / 2);
  }
  ctx.restore();
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SolitaireGame({ onBack }: SolitaireGameProps) {
  const [status, setStatus] = useState<GameStatus>('idle');
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(0);
  const [timer, setTimer] = useState(0);
  const [bestScores, setBestScores] = useState<Record<string, number>>(loadBestScores);
  const [isNewBest, setIsNewBest] = useState(false);
  const [autoHint, setAutoHint] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stockRef = useRef<Pile>({ cards: [] });
  const wasteRef = useRef<Pile>({ cards: [] });
  const foundationsRef = useRef<Pile[]>([]);
  const tableauRef = useRef<Pile[]>([]);
  const dragRef = useRef<DragState>({ active: false, sourcePile: '', sourceIndex: 0, cards: [], offsetX: 0, offsetY: 0, x: 0, y: 0 });
  const highlightRef = useRef<{ pile: string; index: number; cardIdx: number } | null>(null);
  const scoreRef = useRef<number>(0);
  const movesRef = useRef<number>(0);
  const timerRef = useRef<number>(0);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animFrameRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const clickTimeRef = useRef<number>(0);
  const clickCardRef = useRef<{ pile: string; index: number; cardIdx: number } | null>(null);
  const gameStatusRef = useRef<GameStatus>('idle');

  useEffect(() => { gameStatusRef.current = status; }, [status]);

  // ── Sound ──────────────────────────────────────────────────────────────────

  const playSound = useCallback((type: 'flip' | 'place' | 'foundation' | 'win' | 'shuffle' | 'invalid') => {
    switch (type) {
      case 'flip': playSolitaireFlip(); break;
      case 'place': playSolitairePlace(); break;
      case 'foundation': playSolitaireFoundation(); break;
      case 'win': playSolitaireWin(); break;
      case 'shuffle': playSolitaireShuffle(); break;
      case 'invalid': playSolitaireInvalid(); break;
    }
  }, []);

  // ── Win particles ──────────────────────────────────────────────────────────

  const spawnWinParticles = useCallback(() => {
    const symbols = ['♥', '♦', '♣', '♠', '✨', '⭐'];
    const colors = ['#ef4444', '#fbbf24', '#1f2937', '#60a5fa', '#fbbf24', '#fbbf24'];
    for (let i = 0; i < 60; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 4;
      particlesRef.current.push({
        x: Math.random() * CANVAS_W,
        y: CANVAS_H + 20,
        vx: Math.cos(angle) * speed * 0.5,
        vy: -(2 + Math.random() * 4),
        life: 1,
        maxLife: 1 + Math.random() * 1.5,
        radius: 6 + Math.random() * 8,
        color: colors[Math.floor(Math.random() * colors.length)],
        suit: symbols[Math.floor(Math.random() * symbols.length)],
      });
    }
  }, []);

  // ── Check win ──────────────────────────────────────────────────────────────

  const checkWin = useCallback(() => {
    const total = foundationsRef.current.reduce((sum, f) => sum + f.cards.length, 0);
    if (total === 52) {
      playSound('win');
      spawnWinParticles();

      const finalTime = timerRef.current;
      const finalMoves = movesRef.current;
      const currentBest = bestScores.time ?? Infinity;
      let wasNewBest = false;

      if (finalTime < currentBest) {
        const updated = { time: finalTime, moves: finalMoves };
        setBestScores(updated);
        saveBestScores(updated);
        wasNewBest = true;
      }
      setIsNewBest(wasNewBest);

      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      setStatus('won');
    }
  }, [playSound, spawnWinParticles, bestScores]);

  // ── Double-click auto-move ─────────────────────────────────────────────────

  const tryAutoMove = useCallback((pileName: string, pileIndex: number, cardIdx: number) => {
    const tableau = tableauRef.current;
    const foundations = foundationsRef.current;
    const waste = wasteRef.current;

    let card: Card | null = null;
    let sourceCards: Card[] = [];

    if (pileName === 'waste' && waste.cards.length > 0) {
      card = waste.cards[waste.cards.length - 1];
      sourceCards = [card];
    } else if (pileName === 'tableau') {
      const pile = tableau[pileIndex];
      if (pile.cards.length > 0) {
        const topCard = pile.cards[pile.cards.length - 1];
        if (topCard.faceUp) {
          card = topCard;
          sourceCards = [card];
        }
      }
    }

    if (!card) return;

    // Try foundations first
    for (let f = 0; f < 4; f++) {
      if (canMoveToFoundation(card, foundations[f])) {
        if (pileName === 'waste') {
          waste.cards.pop();
          scoreRef.current += 10;
        } else {
          tableau[pileIndex].cards.pop();
          // Flip next card
          const tpile = tableau[pileIndex];
          if (tpile.cards.length > 0 && !tpile.cards[tpile.cards.length - 1].faceUp) {
            tpile.cards[tpile.cards.length - 1].faceUp = true;
            scoreRef.current += 5;
          }
        }
        foundations[f].cards.push(card);
        movesRef.current++;
        setMoves(movesRef.current);
        setScore(scoreRef.current);
        playSound('foundation');
        checkWin();
        return;
      }
    }

    // Try tableau
    for (let t = 0; t < 7; t++) {
      if (pileName === 'tableau' && t === pileIndex) continue;
      if (canMoveToTableau(card, tableau[t])) {
        if (pileName === 'waste') {
          waste.cards.pop();
        } else {
          tableau[pileIndex].cards.pop();
          const tpile = tableau[pileIndex];
          if (tpile.cards.length > 0 && !tpile.cards[tpile.cards.length - 1].faceUp) {
            tpile.cards[tpile.cards.length - 1].faceUp = true;
            scoreRef.current += 5;
          }
        }
        tableau[t].cards.push(card);
        movesRef.current++;
        setMoves(movesRef.current);
        setScore(scoreRef.current);
        playSound('place');
        return;
      }
    }

    playSound('invalid');
  }, [playSound, checkWin]);

  // ── Start game ─────────────────────────────────────────────────────────────

  const startGame = useCallback(() => {
    const game = dealGame();
    stockRef.current = game.stock;
    wasteRef.current = game.waste;
    foundationsRef.current = game.foundations;
    tableauRef.current = game.tableau;
    scoreRef.current = 0;
    movesRef.current = 0;
    timerRef.current = 0;
    particlesRef.current = [];
    dragRef.current = { active: false, sourcePile: '', sourceIndex: 0, cards: [], offsetX: 0, offsetY: 0, x: 0, y: 0 };
    highlightRef.current = null;
    setIsNewBest(false);
    setScore(0);
    setMoves(0);
    setTimer(0);
    setAutoHint(false);

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      if (gameStatusRef.current === 'playing') {
        timerRef.current++;
        setTimer(timerRef.current);
      }
    }, 1000);

    playSound('shuffle');
    setStatus('playing');
  }, [playSound]);

  const resetGame = useCallback(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setStatus('idle');
    setScore(0); setMoves(0); setTimer(0);
    setIsNewBest(false);
  }, []);

  // ── Hit detection ──────────────────────────────────────────────────────────

  const hitTest = useCallback((mx: number, my: number): {
    pile: string; index: number; cardIdx: number
  } | null => {
    const tableau = tableauRef.current;
    const foundations = foundationsRef.current;
    const stock = stockRef.current;
    const waste = wasteRef.current;

    // Check tableau (reverse order — top cards first)
    for (let col = 6; col >= 0; col--) {
      const pile = tableau[col];
      for (let row = pile.cards.length - 1; row >= 0; row--) {
        const rect = cardRect('tableau', col, row, pile.cards.length, foundations, tableau);
        if (mx >= rect.x && mx <= rect.x + rect.w && my >= rect.y && my <= rect.y + rect.h) {
          return { pile: 'tableau', index: col, cardIdx: row };
        }
      }
      // Empty column
      if (pile.cards.length === 0) {
        const rect = cardRect('tableau', col, 0, 0, foundations, tableau);
        if (mx >= rect.x && mx <= rect.x + rect.w && my >= rect.y && my <= rect.y + rect.h) {
          return { pile: 'tableau', index: col, cardIdx: -1 };
        }
      }
    }

    // Check foundations
    for (let f = 3; f >= 0; f--) {
      const rect = cardRect('foundation', f, 0, 0, foundations, tableau);
      if (mx >= rect.x && mx <= rect.x + rect.w && my >= rect.y && my <= rect.y + rect.h) {
        return { pile: 'foundation', index: f, cardIdx: foundations[f].cards.length - 1 };
      }
    }

    // Check stock
    const stockRect = cardRect('stock', 0, 0, 0, foundations, tableau);
    if (mx >= stockRect.x && mx <= stockRect.x + stockRect.w && my >= stockRect.y && my <= stockRect.y + stockRect.h) {
      return { pile: 'stock', index: 0, cardIdx: -1 };
    }

    // Check waste
    const wasteRect = cardRect('waste', 0, 0, 0, foundations, tableau);
    if (mx >= wasteRect.x && mx <= wasteRect.x + wasteRect.w && my >= wasteRect.y && my <= wasteRect.y + wasteRect.h) {
      return { pile: 'waste', index: 0, cardIdx: waste.cards.length - 1 };
    }

    return null;
  }, []);

  // ── Mouse/Touch handlers ───────────────────────────────────────────────────

  const getCanvasPos = useCallback((e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;

    let clientX: number, clientY: number;
    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (status !== 'playing') return;
    const pos = getCanvasPos(e);
    if (!pos) return;

    const hit = hitTest(pos.x, pos.y);
    if (!hit) return;

    const now = Date.now();
    const isDoubleClick = now - clickTimeRef.current < 350 &&
      clickCardRef.current?.pile === hit.pile &&
      clickCardRef.current?.index === hit.index;

    if (isDoubleClick) {
      // Double click — auto move
      tryAutoMove(hit.pile, hit.index, hit.cardIdx);
      clickTimeRef.current = 0;
      clickCardRef.current = null;
      return;
    }

    clickTimeRef.current = now;
    clickCardRef.current = hit;

    // Stock click — draw card
    if (hit.pile === 'stock') {
      const stock = stockRef.current;
      const waste = wasteRef.current;
      if (stock.cards.length === 0) {
        // Recycle waste
        if (waste.cards.length > 0) {
          stock.cards = waste.cards.reverse().map(c => ({ ...c, faceUp: false }));
          waste.cards = [];
          playSound('shuffle');
        }
      } else {
        const card = stock.cards.pop()!;
        card.faceUp = true;
        waste.cards.push(card);
        playSound('flip');
      }
      movesRef.current++;
      setMoves(movesRef.current);
      return;
    }

    // Pick up card(s)
    let cards: Card[] = [];
    let sourcePile = hit.pile;
    let sourceIndex = hit.index;

    if (hit.pile === 'waste') {
      const waste = wasteRef.current;
      if (waste.cards.length === 0) return;
      cards = [waste.cards[waste.cards.length - 1]];
    } else if (hit.pile === 'tableau') {
      const pile = tableauRef.current[hit.index];
      if (hit.cardIdx < 0 || !pile.cards[hit.cardIdx]?.faceUp) return;
      cards = pile.cards.slice(hit.cardIdx);
    } else if (hit.pile === 'foundation') {
      const pile = foundationsRef.current[hit.index];
      if (pile.cards.length === 0) return;
      cards = [pile.cards[pile.cards.length - 1]];
    } else {
      return;
    }

    if (cards.length === 0) return;

    dragRef.current = {
      active: true,
      sourcePile,
      sourceIndex,
      cards,
      offsetX: pos.x,
      offsetY: pos.y,
      x: pos.x,
      y: pos.y,
    };
  }, [status, getCanvasPos, hitTest, playSound, tryAutoMove]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current.active) return;
    const pos = getCanvasPos(e);
    if (!pos) return;
    dragRef.current.x = pos.x;
    dragRef.current.y = pos.y;
  }, [getCanvasPos]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current.active) return;
    const pos = getCanvasPos(e);
    if (!pos) { dragRef.current.active = false; return; }

    const drag = dragRef.current;
    const hit = hitTest(pos.x, pos.y);

    let moved = false;

    if (hit) {
      if (drag.cards.length === 1) {
        // Single card — try foundation
        if (hit.pile === 'foundation' && canMoveToFoundation(drag.cards[0], foundationsRef.current[hit.index])) {
          // Remove from source
          if (drag.sourcePile === 'waste') {
            wasteRef.current.cards.pop();
            scoreRef.current += 10;
          } else if (drag.sourcePile === 'tableau') {
            tableauRef.current[drag.sourceIndex].cards.pop();
            const tpile = tableauRef.current[drag.sourceIndex];
            if (tpile.cards.length > 0 && !tpile.cards[tpile.cards.length - 1].faceUp) {
              tpile.cards[tpile.cards.length - 1].faceUp = true;
              scoreRef.current += 5;
            }
          } else if (drag.sourcePile === 'foundation') {
            foundationsRef.current[drag.sourceIndex].cards.pop();
          }
          foundationsRef.current[hit.index].cards.push(drag.cards[0]);
          moved = true;
          playSound('foundation');
          checkWin();
        }
      }

      // Try tableau
      if (!moved && hit.pile === 'tableau') {
        const targetPile = tableauRef.current[hit.index];
        if (canMoveToTableau(drag.cards[0], targetPile)) {
          // Remove from source
          if (drag.sourcePile === 'waste') {
            wasteRef.current.cards.pop();
            scoreRef.current += 10;
          } else if (drag.sourcePile === 'tableau') {
            tableauRef.current[drag.sourceIndex].cards.splice(
              tableauRef.current[drag.sourceIndex].cards.length - drag.cards.length,
            );
            const tpile = tableauRef.current[drag.sourceIndex];
            if (tpile.cards.length > 0 && !tpile.cards[tpile.cards.length - 1].faceUp) {
              tpile.cards[tpile.cards.length - 1].faceUp = true;
              scoreRef.current += 5;
            }
          } else if (drag.sourcePile === 'foundation') {
            foundationsRef.current[drag.sourceIndex].cards.pop();
          }
          targetPile.cards.push(...drag.cards);
          moved = true;
          playSound('place');
        }
      }
    }

    if (!moved) {
      // Snap back — cards stay where they were
      playSound('invalid');
    }

    if (moved) {
      movesRef.current++;
      setMoves(movesRef.current);
      setScore(scoreRef.current);
    }

    dragRef.current.active = false;
  }, [getCanvasPos, hitTest, playSound, checkWin]);

  // ── Touch handlers ─────────────────────────────────────────────────────────

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const pos = getCanvasPos(e);
    if (!pos || status !== 'playing') return;

    const hit = hitTest(pos.x, pos.y);
    if (!hit) return;

    const now = Date.now();
    const isDoubleClick = now - clickTimeRef.current < 400 &&
      clickCardRef.current?.pile === hit.pile &&
      clickCardRef.current?.index === hit.index;

    if (isDoubleClick) {
      tryAutoMove(hit.pile, hit.index, hit.cardIdx);
      clickTimeRef.current = 0;
      return;
    }

    clickTimeRef.current = now;
    clickCardRef.current = hit;

    if (hit.pile === 'stock') {
      const stock = stockRef.current;
      const waste = wasteRef.current;
      if (stock.cards.length === 0) {
        if (waste.cards.length > 0) {
          stock.cards = waste.cards.reverse().map(c => ({ ...c, faceUp: false }));
          waste.cards = [];
          playSound('shuffle');
        }
      } else {
        const card = stock.cards.pop()!;
        card.faceUp = true;
        waste.cards.push(card);
        playSound('flip');
      }
      movesRef.current++;
      setMoves(movesRef.current);
      return;
    }

    let cards: Card[] = [];
    if (hit.pile === 'waste') {
      if (wasteRef.current.cards.length === 0) return;
      cards = [wasteRef.current.cards[wasteRef.current.cards.length - 1]];
    } else if (hit.pile === 'tableau') {
      const pile = tableauRef.current[hit.index];
      if (hit.cardIdx < 0 || !pile.cards[hit.cardIdx]?.faceUp) return;
      cards = pile.cards.slice(hit.cardIdx);
    } else if (hit.pile === 'foundation') {
      const pile = foundationsRef.current[hit.index];
      if (pile.cards.length === 0) return;
      cards = [pile.cards[pile.cards.length - 1]];
    } else return;

    if (cards.length === 0) return;

    dragRef.current = {
      active: true, sourcePile: hit.pile, sourceIndex: hit.index,
      cards, offsetX: pos.x, offsetY: pos.y, x: pos.x, y: pos.y,
    };
  }, [status, getCanvasPos, hitTest, playSound, tryAutoMove]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (!dragRef.current.active) return;
    const pos = getCanvasPos(e);
    if (!pos) return;
    dragRef.current.x = pos.x;
    dragRef.current.y = pos.y;
  }, [getCanvasPos]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (!dragRef.current.active) return;

    const drag = dragRef.current;
    const hit = hitTest(drag.x, drag.y);

    let moved = false;

    if (hit) {
      if (drag.cards.length === 1 && hit.pile === 'foundation' && canMoveToFoundation(drag.cards[0], foundationsRef.current[hit.index])) {
        if (drag.sourcePile === 'waste') { wasteRef.current.cards.pop(); scoreRef.current += 10; }
        else if (drag.sourcePile === 'tableau') {
          tableauRef.current[drag.sourceIndex].cards.pop();
          const t = tableauRef.current[drag.sourceIndex];
          if (t.cards.length > 0 && !t.cards[t.cards.length - 1].faceUp) { t.cards[t.cards.length - 1].faceUp = true; scoreRef.current += 5; }
        } else { foundationsRef.current[drag.sourceIndex].cards.pop(); }
        foundationsRef.current[hit.index].cards.push(drag.cards[0]);
        moved = true;
        playSound('foundation');
        checkWin();
      } else if (hit.pile === 'tableau' && canMoveToTableau(drag.cards[0], tableauRef.current[hit.index])) {
        if (drag.sourcePile === 'waste') { wasteRef.current.cards.pop(); scoreRef.current += 10; }
        else if (drag.sourcePile === 'tableau') {
          tableauRef.current[drag.sourceIndex].cards.splice(tableauRef.current[drag.sourceIndex].cards.length - drag.cards.length);
          const t = tableauRef.current[drag.sourceIndex];
          if (t.cards.length > 0 && !t.cards[t.cards.length - 1].faceUp) { t.cards[t.cards.length - 1].faceUp = true; scoreRef.current += 5; }
        } else { foundationsRef.current[drag.sourceIndex].cards.pop(); }
        tableauRef.current[hit.index].cards.push(...drag.cards);
        moved = true;
        playSound('place');
      }
    }

    if (!moved) playSound('invalid');
    if (moved) { movesRef.current++; setMoves(movesRef.current); setScore(scoreRef.current); }
    dragRef.current.active = false;
  }, [getCanvasPos, hitTest, playSound, checkWin]);

  // ── Game Loop (render only — no game logic in loop) ────────────────────────

  useEffect(() => {
    if (status !== 'playing' && status !== 'won') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;

    const render = (timestamp: number) => {
      if (!running) return;

      // Clear
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      const tableau = tableauRef.current;
      const foundations = foundationsRef.current;
      const stock = stockRef.current;
      const waste = wasteRef.current;
      const drag = dragRef.current;

      // ── Draw stock ─────────────────────────────────────────────────────
      const sx = BOARD_PADDING;
      const sy = BOARD_PADDING;
      if (stock.cards.length > 0) {
        drawCard(ctx, stock.cards[stock.cards.length - 1], sx, sy, false, false);
        // Show card count if > 1
        if (stock.cards.length > 1) {
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(String(stock.cards.length), sx + CARD_W / 2, sy + CARD_H + 12);
        }
      } else {
        // Empty stock — show recycle icon
        drawEmptyPile(ctx, sx, sy, '↻');
      }

      // ── Draw waste ─────────────────────────────────────────────────────
      const wx = BOARD_PADDING + CARD_W + CARD_GAP;
      if (waste.cards.length > 0) {
        // Show last 3 cards fanned slightly
        const showCount = Math.min(3, waste.cards.length);
        for (let i = waste.cards.length - showCount; i < waste.cards.length; i++) {
          const offsetX = (i - (waste.cards.length - showCount)) * 18;
          const isTop = i === waste.cards.length - 1;
          const isDragging = drag.active && drag.sourcePile === 'waste';
          if (isDragging && isTop) continue;
          drawCard(ctx, waste.cards[i], wx + offsetX, sy, false, false);
        }
      } else {
        drawEmptyPile(ctx, wx, sy);
      }

      // ── Draw foundations ───────────────────────────────────────────────
      for (let f = 0; f < 4; f++) {
        const fx = BOARD_PADDING + (CANVAS_W - BOARD_PADDING * 2) - (3 - f) * (CARD_W + CARD_GAP);
        const pile = foundations[f];
        if (pile.cards.length > 0) {
          const isDragging = drag.active && drag.sourcePile === 'foundation' && drag.sourceIndex === f;
          if (!isDragging) {
            drawCard(ctx, pile.cards[pile.cards.length - 1], fx, sy, false, false);
          }
        } else {
          drawEmptyPile(ctx, fx, sy, SUIT_SYMBOLS[['hearts', 'diamonds', 'clubs', 'spades'][f] as Suit]);
        }
      }

      // ── Draw tableau ───────────────────────────────────────────────────
      for (let col = 0; col < 7; col++) {
        const pile = tableau[col];
        const tx = BOARD_PADDING + col * (CARD_W + CARD_GAP);
        const ty = sy + CARD_H + CARD_GAP;

        if (pile.cards.length === 0) {
          drawEmptyPile(ctx, tx, ty);
          continue;
        }

        for (let row = 0; row < pile.cards.length; row++) {
          // Skip cards being dragged
          if (drag.active && drag.sourcePile === 'tableau' && drag.sourceIndex === col && row >= (pile.cards.length - drag.cards.length)) {
            continue;
          }

          const card = pile.cards[row];
          const cy = ty + (row === 0 ? 0 : pile.cards.slice(0, row).reduce((sum, c) => sum + (c.faceUp ? CASCADE_OPEN : CASCADE_OFFSET), 0));
          drawCard(ctx, card, tx, cy, false, false);
        }
      }

      // ── Draw dragging cards ────────────────────────────────────────────
      if (drag.active && drag.cards.length > 0) {
        for (let i = 0; i < drag.cards.length; i++) {
          const dx = drag.x - CARD_W / 2;
          const dy = drag.y - CARD_H / 2 + i * CASCADE_OPEN;
          drawCard(ctx, drag.cards[i], dx, dy, true, true);
        }
      }

      // ── Particles (win) ────────────────────────────────────────────────
      const dt = 16 / 1000;
      particlesRef.current = particlesRef.current.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05;
        p.vx *= 0.99;
        p.life -= dt / p.maxLife;
        return p.life > 0;
      });

      for (const p of particlesRef.current) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.font = `${p.radius * 2}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(p.suit, p.x, p.y);
      }
      ctx.globalAlpha = 1;

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      running = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [status]);

  // ── Cleanup ────────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // ── Format time ────────────────────────────────────────────────────────────

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // ── Render JSX ─────────────────────────────────────────────────────────────

  return (
    <div className="solitaire-container">
      {status === 'idle' && (
        <div className="solitaire-start" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🃏</div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>Solitaire</h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 24px' }}>Classic Klondike · Drag & Drop</p>
          <button className="difficulty-tile" onClick={startGame} style={{ display: 'inline-flex', flexDirection: 'column', padding: '20px 40px' }}>
            <span className="diff-icon">🃏</span>
            <span className="diff-label">New Game</span>
            <span className="diff-meta">Classic Klondike</span>
          </button>
          {bestScores.time != null && bestScores.time < Infinity && (
            <div style={{ marginTop: 16, fontSize: 13, color: '#fbbf24', fontWeight: 600 }}>
              🏆 Best: {formatTime(bestScores.time)} · {bestScores.time} moves
            </div>
          )}
        </div>
      )}

      {status !== 'idle' && (
        <>
          {/* HUD */}
          <div className="solitaire-hud">
            <div className="solitaire-hud-section">
              <span className="solitaire-hud-label">Score</span>
              <span className="solitaire-hud-value gold">{score}</span>
            </div>
            <div className="solitaire-hud-section center">
              <span className="solitaire-hud-label">Time</span>
              <span className="solitaire-hud-value">{formatTime(timer)}</span>
            </div>
            <div className="solitaire-hud-section right">
              <span className="solitaire-hud-label">Moves</span>
              <span className="solitaire-hud-value">{moves}</span>
            </div>
            <div className="solitaire-hud-actions">
              <button className="solitaire-hud-btn" onClick={startGame} title="New Game">🔄</button>
              <button className="solitaire-hud-btn" onClick={resetGame} title="Menu">☰</button>
            </div>
          </div>

          {/* Board */}
          <div className="solitaire-board">
            <canvas
              ref={canvasRef}
              className="solitaire-canvas"
              width={CANVAS_W}
              height={CANVAS_H}
              style={{ width: '100%', maxWidth: CANVAS_W, aspectRatio: `${CANVAS_W}/${CANVAS_H}` }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={() => { if (dragRef.current.active) { playSound('invalid'); dragRef.current.active = false; } }}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            />

            {/* Win overlay */}
            {status === 'won' && (
              <div className="solitaire-win-overlay">
                <div className="solitaire-win-card">
                  <div className="solitaire-win-icon">🏆</div>
                  <div className="solitaire-win-title">You Win!</div>
                  <div className="solitaire-win-stats">
                    <div className="solitaire-win-stat">
                      <span className="solitaire-win-stat-value">{formatTime(timer)}</span>
                      <span className="solitaire-win-stat-label">Time</span>
                    </div>
                    <div className="solitaire-win-stat">
                      <span className="solitaire-win-stat-value">{score}</span>
                      <span className="solitaire-win-stat-label">Score</span>
                    </div>
                    <div className="solitaire-win-stat">
                      <span className="solitaire-win-stat-value">{moves}</span>
                      <span className="solitaire-win-stat-label">Moves</span>
                    </div>
                  </div>
                  {isNewBest && <div className="solitaire-win-newbest">🎉 New Best Time!</div>}
                  <div className="solitaire-win-actions">
                    <button className="solitaire-btn primary" onClick={startGame}>Play Again</button>
                    <button className="solitaire-btn secondary" onClick={resetGame}>Menu</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="solitaire-controls">
            Click stock to draw · Double-click to auto-move · Drag cards to place
          </div>
        </>
      )}

      <button className="back-to-hub" onClick={onBack}>← Back to Games</button>
    </div>
  );
}
