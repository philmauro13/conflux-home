import { useState, useEffect, useCallback } from 'react';
import { playSolitaireFlip, playSolitairePlace, playSolitaireFoundation, playSolitaireWin, playSolitaireShuffle, playSolitaireInvalid } from '../lib/sound';
import '../styles-johnny-solitaire.css';

// ── Types ──

interface Card {
  rank: string;
  suit: '♠' | '♥' | '♦' | '♣';
  isRed: boolean;
  faceUp: boolean;
}

type Column = Card[];

interface JohnnySolitaireGameProps {
  onBack: () => void;
}

// ── Constants ──

const SUITS: Card['suit'][] = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_VALUES: Record<string, number> = {
  'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13,
};
const COL_SIZES = [3, 4, 5, 6, 7, 8, 9, 10];

// ── Helpers ──

function isRed(suit: Card['suit']): boolean {
  return suit === '♥' || suit === '♦';
}

function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit, isRed: isRed(suit), faceUp: false });
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

function dealGame(): Column[] {
  const deck = shuffleDeck(createDeck());
  const columns: Column[] = [];
  let idx = 0;
  for (const size of COL_SIZES) {
    const col: Card[] = [];
    for (let i = 0; i < size; i++) {
      const card = { ...deck[idx++] };
      // First 2 cards are face-down, rest face-up
      card.faceUp = i >= 2;
      col.push(card);
    }
    columns.push(col);
  }
  return columns;
}

function canPlace(card: Card, targetCol: Column): boolean {
  if (targetCol.length === 0) {
    // King only, and only on empty column
    return card.rank === 'K';
  }
  const top = targetCol[targetCol.length - 1];
  if (!top.faceUp) return false;
  // Same suit, one rank lower
  if (card.suit !== top.suit) return false;
  return RANK_VALUES[card.rank] === RANK_VALUES[top.rank] - 1;
}

function checkWin(columns: Column[]): boolean {
  // Win: 4 columns have complete K→A same-suit sequences, rest empty
  let completeCount = 0;
  for (const col of columns) {
    if (col.length === 0) continue;
    if (col.length !== 13) return false;
    // Must start with K face-up and end with A face-up, all same suit, descending
    const suit = col[0].suit;
    for (let i = 0; i < 13; i++) {
      const expectedRank = RANKS[12 - i]; // K, Q, J, ..., A
      if (col[i].rank !== expectedRank || col[i].suit !== suit || !col[i].faceUp) {
        return false;
      }
    }
    completeCount++;
  }
  return completeCount === 4;
}

function getGameStatus(columns: Column[]): string {
  // Check for complete sequences
  let completeCount = 0;
  let hasMoves = false;

  for (const col of columns) {
    if (col.length === 13 && col[0].rank === 'K' && col[0].faceUp) {
      const suit = col[0].suit;
      let valid = true;
      for (let i = 0; i < 13; i++) {
        if (col[i].rank !== RANKS[12 - i] || col[i].suit !== suit || !col[i].faceUp) {
          valid = false;
          break;
        }
      }
      if (valid) completeCount++;
    }
  }

  // Check if any valid moves exist
  outer: for (let si = 0; si < columns.length; si++) {
    const col = columns[si];
    if (col.length === 0) continue;
    // Can only interact with the top card
    const topCard = col[col.length - 1];
    if (!topCard.faceUp) continue;
    for (let ti = 0; ti < columns.length; ti++) {
      if (ti === si) continue;
      if (canPlace(topCard, columns[ti])) { hasMoves = true; break outer; }
    }
  }

  if (checkWin(columns)) return 'won';
  if (!hasMoves) return 'gameover';
  return 'playing';
}

// ── Component ──

export default function JohnnySolitaireGame({ onBack }: JohnnySolitaireGameProps) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [selCol, setSelCol] = useState<number | null>(null);
  const [selRow, setSelRow] = useState<number | null>(null);
  const [status, setStatus] = useState<string>('playing');
  const [moveCount, setMoveCount] = useState(0);
  const [showWin, setShowWin] = useState(false);
  const [showGameOver, setShowGameOver] = useState(false);
  const [timer, setTimer] = useState(0);
  const [running, setRunning] = useState(false);
  const [completeSeqs, setCompleteSeqs] = useState(0);

  // Init game
  const initGame = useCallback(() => {
    const cols = dealGame();
    setColumns(cols);
    setSelCol(null);
    setSelRow(null);
    setStatus('playing');
    setMoveCount(0);
    setShowWin(false);
    setShowGameOver(false);
    setCompleteSeqs(0);
    setTimer(0);
    setRunning(true);
    playSolitaireShuffle();
  }, []);

  useEffect(() => {
    initGame();
  }, [initGame]);

  // Timer
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTimer(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  // Check win/gameover after each move
  useEffect(() => {
    if (columns.length === 0) return;
    const s = getGameStatus(columns);

    // Count complete sequences for progress display
    let seqs = 0;
    for (const col of columns) {
      if (col.length === 13 && col[0].rank === 'K' && col[0].faceUp) {
        const suit = col[0].suit;
        let valid = true;
        for (let i = 0; i < 13; i++) {
          if (col[i].rank !== RANKS[12 - i] || col[i].suit !== suit || !col[i].faceUp) {
            valid = false; break;
          }
        }
        if (valid) seqs++;
      }
    }
    setCompleteSeqs(seqs);

    if (s === 'won') {
      setStatus('won');
      setRunning(false);
      setShowWin(true);
      playSolitaireWin();
    } else if (s === 'gameover') {
      setStatus('gameover');
      setRunning(false);
      setShowGameOver(true);
      playSolitaireInvalid();
    }
  }, [columns]);

  // Handle card click
  const handleCardClick = (colIdx: number, rowIdx: number) => {
    if (status !== 'playing') return;
    const col = columns[colIdx];
    const card = col[rowIdx];

    // Can only select face-up cards
    if (!card.faceUp) return;

    // If nothing selected, select this card and all below it
    if (selCol === null) {
      setSelCol(colIdx);
      setSelRow(rowIdx);
      return;
    }

    // If clicking the same card, deselect
    if (selCol === colIdx && selRow === rowIdx) {
      setSelCol(null);
      setSelRow(null);
      return;
    }

    // If clicking a different card in the same column, reselect
    if (selCol === colIdx) {
      setSelRow(rowIdx);
      return;
    }

    // Try to move selected cards to this column
    tryMove(colIdx);
  };

  // Handle column click (empty space below cards)
  const handleColumnClick = (colIdx: number) => {
    if (status !== 'playing') return;
    if (selCol === null) return;
    tryMove(colIdx);
  };

  // Try to move selected stack to target column
  const tryMove = (targetIdx: number) => {
    if (selCol === null || selRow === null) return;
    if (selCol === targetIdx) {
      setSelCol(null);
      setSelRow(null);
      return;
    }

    const srcCol = columns[selCol];
    const targetCol = columns[targetIdx];
    const movingCard = srcCol[selRow]; // top card of selection

    if (!canPlace(movingCard, targetCol)) {
      playSolitaireInvalid();
      setSelCol(null);
      setSelRow(null);
      return;
    }

    // Valid move — copy columns deeply
    const newColumns = columns.map(c => [...c]);
    const movingCards = newColumns[selCol].splice(selRow);
    newColumns[targetIdx].push(...movingCards);

    // Flip newly exposed face-down card
    const srcAfter = newColumns[selCol];
    if (srcAfter.length > 0) {
      const topCard = srcAfter[srcAfter.length - 1];
      if (!topCard.faceUp) {
        topCard.faceUp = true;
        playSolitaireFlip();
      }
    }

    // Play appropriate sound
    if (movingCard.rank === 'K' && targetCol.length === 0) {
      playSolitaireFoundation();
    } else {
      playSolitairePlace();
    }

    setColumns(newColumns);
    setSelCol(null);
    setSelRow(null);
    setMoveCount(m => m + 1);
  };

  // Format timer
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // Get top face-up index for selection highlighting
  const isCardSelected = (colIdx: number, rowIdx: number) => {
    return selCol === colIdx && selRow !== null && rowIdx >= selRow;
  };

  return (
    <div className="johnny-solitaire">
      {/* Header */}
      <div className="johnny-header">
        <button className="johnny-back-btn" onClick={onBack}>
          ← Back
        </button>
        <div className="johnny-title">
          <span className="johnny-title-icon">🃏</span>
          <span>Johnny C's Solitaire</span>
        </div>
        <div className="johnny-stats">
          <span className="johnny-stat">⏱ {formatTime(timer)}</span>
          <span className="johnny-stat">Moves: {moveCount}</span>
          <span className="johnny-stat">Sequences: {completeSeqs}/4</span>
        </div>
        <button className="johnny-new-btn" onClick={initGame}>
          New Game
        </button>
      </div>

      {/* Game Table */}
      <div className="johnny-table">
        <div className="johnny-columns">
          {columns.map((col, colIdx) => (
            <div
              key={colIdx}
              className="johnny-column"
              onClick={() => handleColumnClick(colIdx)}
            >
              {/* Empty column placeholder */}
              {col.length === 0 && (
                <div className={`johnny-empty-slot ${selCol !== null ? 'johnny-drop-target' : ''}`}>
                  <span className="johnny-empty-label">K</span>
                </div>
              )}
              {/* Cards */}
              {col.map((card, rowIdx) => (
                <div
                  key={rowIdx}
                  className={`johnny-card-wrapper ${isCardSelected(colIdx, rowIdx) ? 'johnny-selected' : ''}`}
                  onClick={(e) => { e.stopPropagation(); handleCardClick(colIdx, rowIdx); }}
                >
                  {card.faceUp ? (
                    <div className={`johnny-card-face ${card.isRed ? 'red' : 'black'}`}>
                      <div className="johnny-card-corner johnny-card-tl">
                        <span className="johnny-card-rank">{card.rank}</span>
                        <span className="johnny-card-suit">{card.suit}</span>
                      </div>
                      <div className="johnny-card-center">
                        <span className="johnny-card-big-suit">{card.suit}</span>
                      </div>
                      <div className="johnny-card-corner johnny-card-br">
                        <span className="johnny-card-rank">{card.rank}</span>
                        <span className="johnny-card-suit">{card.suit}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="johnny-card-back">
                      <div className="johnny-card-back-pattern" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Status bar */}
      <div className="johnny-status-bar">
        {status === 'playing' && selCol !== null && (
          <span className="johnny-status-hint">Click a column to place the selected card(s)</span>
        )}
        {status === 'playing' && selCol === null && (
          <span className="johnny-status-hint">Click a face-up card to select it</span>
        )}
      </div>

      {/* Win overlay */}
      {showWin && (
        <div className="johnny-overlay">
          <div className="johnny-overlay-card johnny-win-card">
            <div className="johnny-overlay-icon">🏆</div>
            <h2>Johnny C's Complete!</h2>
            <p>All four suits in order — King to Ace</p>
            <div className="johnny-overlay-stats">
              <span>⏱ {formatTime(timer)}</span>
              <span>Moves: {moveCount}</span>
            </div>
            <div className="johnny-overlay-actions">
              <button className="johnny-btn-primary" onClick={initGame}>Play Again</button>
              <button className="johnny-btn-secondary" onClick={onBack}>Back to Games</button>
            </div>
          </div>
        </div>
      )}

      {/* Game Over overlay */}
      {showGameOver && (
        <div className="johnny-overlay">
          <div className="johnny-overlay-card johnny-gameover-card">
            <div className="johnny-overlay-icon">😵</div>
            <h2>No More Moves</h2>
            <p>No valid moves remaining</p>
            <div className="johnny-overlay-stats">
              <span>⏱ {formatTime(timer)}</span>
              <span>Moves: {moveCount}</span>
            </div>
            <div className="johnny-overlay-actions">
              <button className="johnny-btn-primary" onClick={initGame}>Try Again</button>
              <button className="johnny-btn-secondary" onClick={onBack}>Back to Games</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
