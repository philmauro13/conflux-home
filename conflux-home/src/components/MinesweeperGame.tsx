import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  playMinesweeperReveal,
  playMinesweeperFlag,
  playMinesweeperExplode,
  playMinesweeperCascade,
  playMinesweeperWin,
} from '../lib/sound';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Tile {
  row: number;
  col: number;
  isMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
  adjacentMines: number;
  cascadeDelay?: number;
  isExploded?: boolean;
}

type GameState = 'idle' | 'playing' | 'won' | 'lost';
type Difficulty = 'beginner' | 'intermediate' | 'expert';

interface MinesweeperGameProps {
  onBack: () => void;
}

// ─── Difficulty Config ───────────────────────────────────────────────────────

const DIFFICULTY_CONFIG: Record<Difficulty, { rows: number; cols: number; mines: number; label: string; meta: string }> = {
  beginner:     { rows: 9,  cols: 9,  mines: 10, label: 'Beginner',     meta: '9×9 · 10 mines' },
  intermediate: { rows: 16, cols: 16, mines: 40, label: 'Intermediate', meta: '16×16 · 40 mines' },
  expert:       { rows: 16, cols: 30, mines: 99, label: 'Expert',       meta: '16×30 · 99 mines' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createEmptyBoard(rows: number, cols: number): Tile[][] {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => ({
      row: r,
      col: c,
      isMine: false,
      isRevealed: false,
      isFlagged: false,
      adjacentMines: 0,
    }))
  );
}

function getNeighbors(row: number, col: number, rows: number, cols: number): [number, number][] {
  const neighbors: [number, number][] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        neighbors.push([nr, nc]);
      }
    }
  }
  return neighbors;
}

function placeMines(board: Tile[][], safeRow: number, safeCol: number, mineCount: number): Tile[][] {
  const rows = board.length;
  const cols = board[0].length;
  const safeZone = new Set<string>();

  // Exclude clicked cell and its neighbors
  safeZone.add(`${safeRow},${safeCol}`);
  for (const [nr, nc] of getNeighbors(safeRow, safeCol, rows, cols)) {
    safeZone.add(`${nr},${nc}`);
  }

  // Collect valid positions
  const positions: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!safeZone.has(`${r},${c}`)) {
        positions.push([r, c]);
      }
    }
  }

  // Shuffle and pick mine positions
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }

  const minesToPlace = Math.min(mineCount, positions.length);
  const newBoard = board.map(row => row.map(tile => ({ ...tile })));

  for (let i = 0; i < minesToPlace; i++) {
    const [r, c] = positions[i];
    newBoard[r][c].isMine = true;
  }

  // Calculate adjacent mine counts
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (newBoard[r][c].isMine) continue;
      let count = 0;
      for (const [nr, nc] of getNeighbors(r, c, rows, cols)) {
        if (newBoard[nr][nc].isMine) count++;
      }
      newBoard[r][c].adjacentMines = count;
    }
  }

  return newBoard;
}

function floodReveal(board: Tile[][], row: number, col: number): Tile[][] {
  const rows = board.length;
  const cols = board[0].length;
  const newBoard = board.map(r => r.map(t => ({ ...t })));

  const queue: [number, number, number][] = [[row, col, 0]];
  const visited = new Set<string>();
  visited.add(`${row},${col}`);

  while (queue.length > 0) {
    const [r, c, dist] = queue.shift()!;
    const tile = newBoard[r][c];
    if (tile.isRevealed || tile.isFlagged) continue;
    tile.isRevealed = true;
    tile.cascadeDelay = dist * 30;

    if (tile.adjacentMines === 0 && !tile.isMine) {
      for (const [nr, nc] of getNeighbors(r, c, rows, cols)) {
        const key = `${nr},${nc}`;
        if (!visited.has(key)) {
          visited.add(key);
          queue.push([nr, nc, dist + 1]);
        }
      }
    }
  }

  return newBoard;
}

function checkWin(board: Tile[][]): boolean {
  for (const row of board) {
    for (const tile of row) {
      if (!tile.isMine && !tile.isRevealed) return false;
    }
  }
  return true;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function MinesweeperGame({ onBack }: MinesweeperGameProps) {
  const [gameState, setGameState] = useState<GameState>('idle');
  const [difficulty, setDifficulty] = useState<Difficulty>('beginner');
  const [board, setBoard] = useState<Tile[][]>([]);
  const [mineCount, setMineCount] = useState(0);
  const [flagCount, setFlagCount] = useState(0);
  const [timer, setTimer] = useState(0);
  const [firstClick, setFirstClick] = useState(true);
  const [muted, setMuted] = useState(false);
  const [bestTimes, setBestTimes] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('conflux_minesweeper_best');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTargetRef = useRef<{ row: number; col: number } | null>(null);

  // ── Timer Management ─────────────────────────────────────────────────────

  const startTimer = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      setTimer(prev => prev + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ── Sound Effects ────────────────────────────────────────────────────────

  const playSound = useCallback((type: 'reveal' | 'flag' | 'explode' | 'win' | 'cascade') => {
    if (muted) return;
    switch (type) {
      case 'reveal': playMinesweeperReveal(); break;
      case 'flag': playMinesweeperFlag(); break;
      case 'explode': playMinesweeperExplode(); break;
      case 'cascade': playMinesweeperCascade(); break;
      case 'win': playMinesweeperWin(); break;
    }
  }, [muted]);

  // ── Save Best Time ───────────────────────────────────────────────────────

  const saveBestTime = useCallback((diff: string, time: number) => {
    setBestTimes(prev => {
      const current = prev[diff];
      if (!current || time < current) {
        const updated = { ...prev, [diff]: time };
        localStorage.setItem('conflux_minesweeper_best', JSON.stringify(updated));
        return updated;
      }
      return prev;
    });
  }, []);

  // ── Game Actions ─────────────────────────────────────────────────────────

  const startGame = useCallback((diff: Difficulty) => {
    const config = DIFFICULTY_CONFIG[diff];
    const emptyBoard = createEmptyBoard(config.rows, config.cols);
    setBoard(emptyBoard);
    setDifficulty(diff);
    setMineCount(config.mines);
    setFlagCount(0);
    setTimer(0);
    setFirstClick(true);
    setGameState('playing');
    stopTimer();
  }, [stopTimer]);

  const resetGame = useCallback(() => {
    stopTimer();
    setGameState('idle');
    setBoard([]);
    setTimer(0);
    setFlagCount(0);
    setFirstClick(true);
  }, [stopTimer]);

  const handleLeftClick = useCallback((row: number, col: number) => {
    if (gameState !== 'playing') return;
    const tile = board[row]?.[col];
    if (!tile || tile.isRevealed || tile.isFlagged) return;

    // First click: place mines, ensure safe
    if (firstClick) {
      const config = DIFFICULTY_CONFIG[difficulty];
      const newBoard = placeMines(board, row, col, config.mines);
      setFirstClick(false);
      startTimer();

      // Reveal the clicked tile on the new board
      const clickedTile = newBoard[row][col];
      if (clickedTile.isMine) {
        // Shouldn't happen with safe zone, but just in case
        clickedTile.isExploded = true;
        newBoard.forEach(r => r.forEach(t => { if (t.isMine) t.isRevealed = true; }));
        setBoard(newBoard);
        setGameState('lost');
        stopTimer();
        playSound('explode');
        return;
      }

      let revealedBoard: Tile[][];
      if (clickedTile.adjacentMines === 0) {
        revealedBoard = floodReveal(newBoard, row, col);
        playSound('cascade');
      } else {
        revealedBoard = newBoard.map(r => r.map(t => ({ ...t })));
        revealedBoard[row][col].isRevealed = true;
        playSound('reveal');
      }

      setBoard(revealedBoard);

      if (checkWin(revealedBoard)) {
        setGameState('won');
        stopTimer();
        playSound('win');
        saveBestTime(difficulty, 0);
      }
      return;
    }

    // Normal click
    if (tile.isMine) {
      const newBoard = board.map(r => r.map(t => ({ ...t })));
      newBoard[row][col].isRevealed = true;
      newBoard[row][col].isExploded = true;
      // Reveal all mines
      newBoard.forEach(r => r.forEach(t => { if (t.isMine) t.isRevealed = true; }));
      setBoard(newBoard);
      setGameState('lost');
      stopTimer();
      playSound('explode');
      return;
    }

    let newBoard: Tile[][];
    if (tile.adjacentMines === 0) {
      newBoard = floodReveal(board, row, col);
      playSound('cascade');
    } else {
      newBoard = board.map(r => r.map(t => ({ ...t })));
      newBoard[row][col].isRevealed = true;
      playSound('reveal');
    }

    setBoard(newBoard);

    if (checkWin(newBoard)) {
      setGameState('won');
      stopTimer();
      playSound('win');
      saveBestTime(difficulty, timer);
    }
  }, [gameState, board, firstClick, difficulty, timer, startTimer, stopTimer, playSound, saveBestTime]);

  const handleRightClick = useCallback((row: number, col: number) => {
    if (gameState !== 'playing') return;
    const tile = board[row]?.[col];
    if (!tile || tile.isRevealed) return;

    const newBoard = board.map(r => r.map(t => ({ ...t })));
    newBoard[row][col].isFlagged = !newBoard[row][col].isFlagged;
    setBoard(newBoard);

    const newFlagCount = newBoard.flat().filter(t => t.isFlagged).length;
    setFlagCount(newFlagCount);
    playSound('flag');
  }, [gameState, board, playSound]);

  // ── Long-press to flag ───────────────────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // left click only
    const target = e.currentTarget as HTMLElement;
    const row = parseInt(target.dataset.row ?? '-1', 10);
    const col = parseInt(target.dataset.col ?? '-1', 10);
    if (row < 0 || col < 0) return;

    longPressTargetRef.current = { row, col };
    longPressTimerRef.current = setTimeout(() => {
      // Long press triggered — flag the tile
      handleRightClick(row, col);
      longPressTargetRef.current = null;
    }, 300);
  }, [handleRightClick]);

  const handleMouseUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressTargetRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  // ── Tile Rendering ───────────────────────────────────────────────────────

  const getTileClass = useCallback((tile: Tile): string => {
    const classes = ['minesweeper-tile'];
    if (tile.isFlagged && !tile.isRevealed) {
      classes.push('tile-flagged');
    } else if (!tile.isRevealed) {
      classes.push('tile-hidden');
    } else if (tile.isMine) {
      classes.push(tile.isExploded ? 'tile-mine-exploded' : 'tile-mine');
    } else {
      classes.push('tile-revealed');
      if (tile.adjacentMines > 0) {
        classes.push(`tile-num-${tile.adjacentMines}`);
      }
    }
    return classes.join(' ');
  }, []);

  const getTileContent = useCallback((tile: Tile): string => {
    if (tile.isFlagged && !tile.isRevealed) return '🚩';
    if (!tile.isRevealed) return '';
    if (tile.isMine) return '💣';
    if (tile.adjacentMines > 0) return String(tile.adjacentMines);
    return '';
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="minesweeper-container">
      {gameState === 'idle' && (
        <div className="difficulty-selector">
          {(Object.keys(DIFFICULTY_CONFIG) as Difficulty[]).map(diff => (
            <button
              key={diff}
              className="difficulty-tile"
              onClick={() => startGame(diff)}
            >
              <span className="diff-icon">💣</span>
              <span className="diff-label">{DIFFICULTY_CONFIG[diff].label}</span>
              <span className="diff-meta">{DIFFICULTY_CONFIG[diff].meta}</span>
            </button>
          ))}
        </div>
      )}

      {gameState !== 'idle' && (
        <>
          <div className="minesweeper-header">
            <div className="mine-counter">💣 {mineCount - flagCount}</div>
            <button className="new-game-btn" onClick={resetGame}>New Game</button>
            <div className="mine-timer">⏱ {formatTime(timer)}</div>
            <button className="sound-toggle" onClick={() => setMuted(!muted)}>
              {muted ? '🔇' : '🔊'}
            </button>
          </div>

          <div className={`minesweeper-board ${gameState}`}>
            {board.map((row, ri) => (
              <div key={ri} className="minesweeper-row">
                {row.map((tile, ci) => (
                  <button
                    key={`${ri}-${ci}`}
                    data-row={ri}
                    data-col={ci}
                    className={getTileClass(tile)}
                    style={
                      tile.isRevealed && tile.adjacentMines === 0 && !tile.isMine
                        ? { animationDelay: `${tile.cascadeDelay || 0}ms` }
                        : {}
                    }
                    onClick={() => handleLeftClick(ri, ci)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      handleRightClick(ri, ci);
                    }}
                    onMouseDown={handleMouseDown}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                  >
                    {getTileContent(tile)}
                  </button>
                ))}
              </div>
            ))}
          </div>

          {gameState === 'won' && (
            <div className="win-banner">🎉 You cleared the field!</div>
          )}
          {gameState === 'lost' && (
            <div className="lose-banner">💥 Better luck next time!</div>
          )}
          {bestTimes[difficulty] && (
            <div className="best-times">🏆 Best: {formatTime(bestTimes[difficulty])}</div>
          )}
        </>
      )}

      <button className="back-to-hub" onClick={onBack}>← Back to Games</button>
    </div>
  );
}
