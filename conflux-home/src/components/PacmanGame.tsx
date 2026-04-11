import { useState, useCallback, useRef, useEffect } from 'react';
import {
  playPacmanChomp,
  playPacmanPower,
  playPacmanEatGhost,
  playPacmanDeath,
  playPacmanLevelClear,
} from '../lib/sound';

// ─── Types ───────────────────────────────────────────────────────────────────

type Direction = 'up' | 'down' | 'left' | 'right';
type GameStatus = 'idle' | 'playing' | 'paused' | 'dead';
type PacDifficulty = 'classic' | 'frenzy' | 'nightmare';
type GhostMode = 'chase' | 'scatter' | 'scared' | 'eaten';

interface Position {
  x: number;
  y: number;
}

interface PacMan {
  x: number;
  y: number;
  dir: Direction;
  nextDir: Direction;
  mouthAngle: number;
  mouthDir: number;
  moving: boolean;
}

interface Ghost {
  x: number;
  y: number;
  dir: Direction;
  color: string;
  name: string;
  mode: GhostMode;
  startX: number;
  startY: number;
  released: boolean;
  scatterX: number;
  scatterY: number;
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
}

interface ScorePopup {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
}

interface PacGameConfig {
  label: string;
  meta: string;
  icon: string;
  speed: number;
  scaredMs: number;
  lives: number;
}

interface PacmanGameProps {
  onBack: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CELL = 20;
const COLS = 21;
const ROWS = 19;
const CANVAS_W = COLS * CELL;
const CANVAS_H = ROWS * CELL;

const MAZE_TEMPLATE: number[][] = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,1,0,1],
  [1,3,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,3,1],
  [1,0,1,0,1,0,1,0,1,1,1,1,1,0,1,0,1,0,1,0,1],
  [1,0,0,0,1,0,1,0,0,0,1,0,0,0,1,0,1,0,0,0,1],
  [1,1,1,0,1,0,1,1,1,2,1,2,1,1,1,0,1,0,1,1,1],
  [2,2,2,0,1,0,1,2,2,2,2,2,2,2,1,0,1,0,2,2,2],
  [1,1,1,0,1,0,1,2,1,1,4,1,1,2,1,0,1,0,1,1,1],
  [5,2,2,0,2,0,2,2,1,4,4,4,1,2,2,0,2,0,2,2,5],
  [1,1,1,0,1,0,1,2,1,1,1,1,1,2,1,0,1,0,1,1,1],
  [2,2,2,0,1,0,1,2,2,2,2,2,2,2,1,0,1,0,2,2,2],
  [1,1,1,0,1,0,1,2,1,1,1,1,1,2,1,0,1,0,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,1,0,1],
  [1,3,0,0,1,0,0,0,0,0,2,0,0,0,0,0,1,0,0,3,1],
  [1,0,1,0,1,0,1,0,1,1,1,1,1,0,1,0,1,0,1,0,1],
  [1,0,0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

const DIFFICULTY: Record<PacDifficulty, PacGameConfig> = {
  classic:   { label: 'Classic',   meta: 'Standard · 3 lives', icon: '🟡', speed: 140, scaredMs: 6000, lives: 3 },
  frenzy:    { label: 'Frenzy',    meta: 'Faster · 2 lives',  icon: '⚡', speed: 100, scaredMs: 4000, lives: 2 },
  nightmare: { label: 'Nightmare', meta: 'Brutal · 1 life',   icon: '💀', speed: 80,  scaredMs: 2500, lives: 1 },
};

const DELTA: Record<Direction, Position> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE: Record<Direction, Direction> = {
  up: 'down', down: 'up', left: 'right', right: 'left',
};

// Scatter target corners
const SCATTER_CORNERS: Record<string, [number, number]> = {
  Shadow: [COLS - 2, 1],
  Speedy: [1, 1],
  Bashful: [COLS - 2, ROWS - 2],
  Pokey: [1, ROWS - 2],
};

// Mode cycle: scatter/chase alternating
const MODE_CYCLE: Array<{ mode: GhostMode; duration: number }> = [
  { mode: 'scatter', duration: 7000 },
  { mode: 'chase', duration: 20000 },
  { mode: 'scatter', duration: 7000 },
  { mode: 'chase', duration: 20000 },
  { mode: 'scatter', duration: 5000 },
  { mode: 'chase', duration: 20000 },
  { mode: 'scatter', duration: 5000 },
  { mode: 'chase', duration: Infinity },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deepMaze(): number[][] {
  return MAZE_TEMPLATE.map(row => [...row]);
}

function countPellets(maze: number[][]): number {
  let count = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (maze[r][c] === 0 || maze[r][c] === 3) count++;
    }
  }
  return count;
}

function isWall(maze: number[][], x: number, y: number): boolean {
  if (y < 0 || y >= ROWS) return true;
  // Tunnel wrapping check — not a wall
  if (x < 0 || x >= COLS) return false;
  return maze[y][x] === 1;
}

function canMove(maze: number[][], x: number, y: number, dir: Direction): boolean {
  const d = DELTA[dir];
  const nx = x + d.x;
  const ny = y + d.y;
  if (ny < 0 || ny >= ROWS) return false;
  // Tunnel
  if (nx < 0 || nx >= COLS) return true;
  const cell = maze[ny][nx];
  return cell !== 1;
}

function manhattan(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

function loadBestScores(): Record<string, number> {
  try {
    const saved = localStorage.getItem('conflux_pacman_best');
    return saved ? JSON.parse(saved) : { classic: 0, frenzy: 0, nightmare: 0 };
  } catch {
    return { classic: 0, frenzy: 0, nightmare: 0 };
  }
}

function saveBestScores(scores: Record<string, number>) {
  localStorage.setItem('conflux_pacman_best', JSON.stringify(scores));
}

function makeGhosts(): Ghost[] {
  const [scShadow, scSpeedy, scBashful, scPokey] = [
    SCATTER_CORNERS.Shadow, SCATTER_CORNERS.Speedy,
    SCATTER_CORNERS.Bashful, SCATTER_CORNERS.Pokey,
  ];
  return [
    { x: 10, y: 7, dir: 'left', color: '#ff0000', name: 'Shadow',  mode: 'scatter', startX: 10, startY: 7, released: true,  scatterX: scShadow[0],  scatterY: scShadow[1] },
    { x: 9,  y: 9, dir: 'up',   color: '#ffb8ff', name: 'Speedy',  mode: 'scatter', startX: 9,  startY: 9, released: false, scatterX: scSpeedy[0],  scatterY: scSpeedy[1] },
    { x: 10, y: 9, dir: 'up',   color: '#00ffff', name: 'Bashful', mode: 'scatter', startX: 10, startY: 9, released: false, scatterX: scBashful[0], scatterY: scBashful[1] },
    { x: 11, y: 9, dir: 'up',   color: '#ffb852', name: 'Pokey',   mode: 'scatter', startX: 11, startY: 9, released: false, scatterX: scPokey[0],   scatterY: scPokey[1] },
  ];
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PacmanGame({ onBack }: PacmanGameProps) {
  const [status, setStatus] = useState<GameStatus>('idle');
  const [difficulty, setDifficulty] = useState<PacDifficulty>('classic');
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [bestScores, setBestScores] = useState<Record<string, number>>(loadBestScores);
  const [isNewBest, setIsNewBest] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const tickAccumRef = useRef<number>(0);

  const pacRef = useRef<PacMan>({ x: 10, y: 15, dir: 'left', nextDir: 'left', mouthAngle: 0.25, mouthDir: 1, moving: true });
  const mazeRef = useRef<number[][]>(deepMaze());
  const ghostsRef = useRef<Ghost[]>(makeGhosts());
  const pelletsRef = useRef<number>(0);
  const scoreRef = useRef<number>(0);
  const livesRef = useRef<number>(3);
  const levelRef = useRef<number>(1);
  const gameStatusRef = useRef<GameStatus>('idle');
  const speedRef = useRef<number>(140);
  const scaredTimerRef = useRef<number>(0);
  const ghostEatComboRef = useRef<number>(0);
  const modeTimerRef = useRef<number>(0);
  const modePhaseRef = useRef<number>(0);
  const ghostReleaseTimersRef = useRef<number[]>([0, 5000, 10000, 15000]);
  const releaseAccumRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const scorePopupsRef = useRef<ScorePopup[]>([]);
  const touchStartRef = useRef<Position | null>(null);
  const chompCounterRef = useRef<number>(0);
  const deathPauseRef = useRef<number>(0);
  const levelClearRef = useRef<number>(0);
  const flashRef = useRef<number>(0);

  useEffect(() => { gameStatusRef.current = status; }, [status]);

  // ── Sound ──────────────────────────────────────────────────────────────────

  const playSound = useCallback((type: 'chomp' | 'power' | 'eatghost' | 'death' | 'levelclear') => {
    switch (type) {
      case 'chomp': playPacmanChomp(); break;
      case 'power': playPacmanPower(); break;
      case 'eatghost': playPacmanEatGhost(); break;
      case 'death': playPacmanDeath(); break;
      case 'levelclear': playPacmanLevelClear(); break;
    }
  }, []);

  // ── Spawn Particles ────────────────────────────────────────────────────────

  const spawnDeathParticles = useCallback((px: number, py: number) => {
    const cx = px * CELL + CELL / 2;
    const cy = py * CELL + CELL / 2;
    const colors = ['#fbbf24', '#f59e0b', '#fcd34d', '#fde68a', '#fff'];
    for (let i = 0; i < 25; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      particlesRef.current.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1, maxLife: 0.5 + Math.random() * 0.5,
        radius: 2 + Math.random() * 3,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }, []);

  // ── Ghost AI ───────────────────────────────────────────────────────────────

  const getGhostTarget = useCallback((ghost: Ghost, pac: PacMan, ghosts: Ghost[]): Position => {
    if (ghost.mode === 'scared') {
      // Random target
      return { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
    }
    if (ghost.mode === 'eaten') {
      return { x: 10, y: 9 }; // Ghost house center
    }
    if (ghost.mode === 'scatter') {
      return { x: ghost.scatterX, y: ghost.scatterY };
    }
    // Chase mode — each ghost has unique targeting
    switch (ghost.name) {
      case 'Shadow':
        return { x: pac.x, y: pac.y };
      case 'Speedy': {
        const d = DELTA[pac.dir];
        return { x: pac.x + d.x * 4, y: pac.y + d.y * 4 };
      }
      case 'Bashful': {
        const d = DELTA[pac.dir];
        const aheadX = pac.x + d.x * 2;
        const aheadY = pac.y + d.y * 2;
        const shadow = ghosts[0];
        return { x: aheadX + (aheadX - shadow.x), y: aheadY + (aheadY - shadow.y) };
      }
      case 'Pokey': {
        if (manhattan(ghost.x, ghost.y, pac.x, pac.y) > 8) {
          return { x: pac.x, y: pac.y };
        }
        return { x: ghost.scatterX, y: ghost.scatterY };
      }
      default:
        return { x: pac.x, y: pac.y };
    }
  }, []);

  const chooseGhostDirection = useCallback((ghost: Ghost, target: Position, maze: number[][], isScared: boolean): Direction => {
    const dirs: Direction[] = ['up', 'down', 'left', 'right'];
    const reverse = OPPOSITE[ghost.dir];

    // Get available directions (can't reverse, can't go into walls)
    let available = dirs.filter(d => {
      if (d === reverse && ghost.mode !== 'scared') return false;
      return canMove(maze, ghost.x, ghost.y, d);
    });

    if (available.length === 0) {
      // Dead end — allow reverse
      available = dirs.filter(d => canMove(maze, ghost.x, ghost.y, d));
    }
    if (available.length === 0) return ghost.dir;

    if (isScared) {
      return available[Math.floor(Math.random() * available.length)];
    }

    // Pick direction that minimizes distance to target
    let bestDir = available[0];
    let bestDist = Infinity;
    for (const d of available) {
      const delta = DELTA[d];
      const dist = manhattan(ghost.x + delta.x, ghost.y + delta.y, target.x, target.y);
      if (dist < bestDist) {
        bestDist = dist;
        bestDir = d;
      }
    }
    return bestDir;
  }, []);

  // ── Reset ──────────────────────────────────────────────────────────────────

  const resetPositions = useCallback(() => {
    pacRef.current = { x: 10, y: 15, dir: 'left', nextDir: 'left', mouthAngle: 0.25, mouthDir: 1, moving: true };
    ghostsRef.current = makeGhosts();
    scaredTimerRef.current = 0;
    ghostEatComboRef.current = 0;
    modeTimerRef.current = 0;
    modePhaseRef.current = 0;
    releaseAccumRef.current = 0;
    ghostReleaseTimersRef.current = [0, 5000, 10000, 15000];
  }, []);

  const resetGame = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setStatus('idle');
    setScore(0); setLives(3); setLevel(1);
    setIsNewBest(false);
    scoreRef.current = 0; livesRef.current = 3; levelRef.current = 1;
    mazeRef.current = deepMaze();
    pelletsRef.current = countPellets(mazeRef.current);
    particlesRef.current = [];
    scorePopupsRef.current = [];
    resetPositions();
  }, [resetPositions]);

  // ── Start ──────────────────────────────────────────────────────────────────

  const startGame = useCallback((diff: PacDifficulty) => {
    const config = DIFFICULTY[diff];
    setDifficulty(diff);
    setScore(0); setLives(config.lives); setLevel(1); setIsNewBest(false);
    scoreRef.current = 0; livesRef.current = config.lives; levelRef.current = 1;
    speedRef.current = config.speed;
    mazeRef.current = deepMaze();
    pelletsRef.current = countPellets(mazeRef.current);
    particlesRef.current = [];
    scorePopupsRef.current = [];
    chompCounterRef.current = 0;
    deathPauseRef.current = 0;
    levelClearRef.current = 0;
    flashRef.current = 0;
    resetPositions();
    tickAccumRef.current = 0;
    lastTimeRef.current = performance.now();
    setStatus('playing');
  }, [resetPositions]);

  // ── Direction ──────────────────────────────────────────────────────────────

  const queueDirection = useCallback((dir: Direction) => {
    const pac = pacRef.current;
    if (dir === OPPOSITE[pac.dir]) {
      // Immediate reverse
      pac.nextDir = dir;
      return;
    }
    pac.nextDir = dir;
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (gameStatusRef.current !== 'playing') return;
    const keyMap: Record<string, Direction> = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', W: 'up', s: 'down', S: 'down', a: 'left', A: 'left', d: 'right', D: 'right',
    };
    const dir = keyMap[e.key];
    if (dir) { e.preventDefault(); queueDirection(dir); }
    if (e.key === 'Escape') {
      setStatus(prev => prev === 'playing' ? 'paused' : prev);
    }
  }, [queueDirection]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ── Touch ──────────────────────────────────────────────────────────────────

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (gameStatusRef.current !== 'playing') return;
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (gameStatusRef.current !== 'playing' || !touchStartRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    if (Math.abs(dx) < 30 && Math.abs(dy) < 30) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      queueDirection(dx > 0 ? 'right' : 'left');
    } else {
      queueDirection(dy > 0 ? 'down' : 'up');
    }
  }, [queueDirection]);

  const handleDpad = useCallback((dir: Direction) => {
    if (gameStatusRef.current !== 'playing') return;
    queueDirection(dir);
  }, [queueDirection]);

  // ── Game Loop ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (status !== 'playing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const config = DIFFICULTY[difficulty];
    let running = true;

    const gameLoop = (timestamp: number) => {
      if (!running) return;

      const dt = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      const pac = pacRef.current;
      const maze = mazeRef.current;
      const ghosts = ghostsRef.current;

      // ── Death pause ──────────────────────────────────────────────────────
      if (deathPauseRef.current > 0) {
        deathPauseRef.current -= dt;
        if (deathPauseRef.current <= 0) {
          livesRef.current--;
          setLives(livesRef.current);
          if (livesRef.current <= 0) {
            // Game over
            const finalScore = scoreRef.current;
            const wasNewBest = finalScore > (bestScores[difficulty] || 0);
            if (wasNewBest) {
              const updated = { ...bestScores, [difficulty]: finalScore };
              setBestScores(updated);
              saveBestScores(updated);
              setIsNewBest(true);
            }
            setStatus('dead');
            return;
          }
          resetPositions();
        }
        // Still render during death pause
        render(ctx, timestamp, dt);
        animFrameRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      // ── Level clear pause ────────────────────────────────────────────────
      if (levelClearRef.current > 0) {
        levelClearRef.current -= dt;
        if (levelClearRef.current <= 0) {
          levelRef.current++;
          setLevel(levelRef.current);
          mazeRef.current = deepMaze();
          pelletsRef.current = countPellets(mazeRef.current);
          resetPositions();
          speedRef.current = Math.max(60, config.speed - (levelRef.current - 1) * 5);
        }
        flashRef.current = Math.max(0, 200 - levelClearRef.current);
        render(ctx, timestamp, dt);
        animFrameRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      // ── Mode timer ───────────────────────────────────────────────────────
      modeTimerRef.current += dt;
      if (modePhaseRef.current < MODE_CYCLE.length) {
        const phase = MODE_CYCLE[modePhaseRef.current];
        if (modeTimerRef.current >= phase.duration) {
          modeTimerRef.current -= phase.duration;
          modePhaseRef.current++;
          if (modePhaseRef.current < MODE_CYCLE.length) {
            const nextMode = MODE_CYCLE[modePhaseRef.current].mode;
            for (const g of ghosts) {
              if (g.mode !== 'scared' && g.mode !== 'eaten') {
                g.mode = nextMode;
              }
            }
          }
        }
      }

      // ── Scared timer ─────────────────────────────────────────────────────
      if (scaredTimerRef.current > 0) {
        scaredTimerRef.current -= dt;
        if (scaredTimerRef.current <= 0) {
          scaredTimerRef.current = 0;
          ghostEatComboRef.current = 0;
          const currentMode = modePhaseRef.current < MODE_CYCLE.length
            ? MODE_CYCLE[modePhaseRef.current].mode : 'chase';
          for (const g of ghosts) {
            if (g.mode === 'scared') g.mode = currentMode;
          }
        }
      }

      // ── Ghost release timers ─────────────────────────────────────────────
      releaseAccumRef.current += dt;
      for (let i = 1; i < ghosts.length; i++) {
        if (!ghosts[i].released && releaseAccumRef.current >= ghostReleaseTimersRef.current[i]) {
          ghosts[i].released = true;
          ghosts[i].x = 10;
          ghosts[i].y = 7;
        }
      }

      // ── Tick accumulator ─────────────────────────────────────────────────
      tickAccumRef.current += dt;
      while (tickAccumRef.current >= speedRef.current) {
        tickAccumRef.current -= speedRef.current;

        // ── Pac-Man movement ───────────────────────────────────────────────
        const tryDir = pac.nextDir;
        if (canMove(maze, pac.x, pac.y, tryDir)) {
          pac.dir = tryDir;
        }

        if (canMove(maze, pac.x, pac.y, pac.dir)) {
          pac.moving = true;
          const d = DELTA[pac.dir];
          let nx = pac.x + d.x;
          let ny = pac.y + d.y;

          // Tunnel wrapping
          if (nx < 0) nx = COLS - 1;
          else if (nx >= COLS) nx = 0;

          pac.x = nx;
          pac.y = ny;

          // Eat pellet
          const cell = maze[ny][nx];
          if (cell === 0) {
            maze[ny][nx] = 2;
            scoreRef.current += 10;
            setScore(scoreRef.current);
            pelletsRef.current--;
            playSound('chomp');
          } else if (cell === 3) {
            maze[ny][nx] = 2;
            scoreRef.current += 50;
            setScore(scoreRef.current);
            pelletsRef.current--;
            playSound('power');
            // Scare all ghosts
            scaredTimerRef.current = config.scaredMs;
            ghostEatComboRef.current = 0;
            for (const g of ghosts) {
              if (g.mode !== 'eaten' && g.released) {
                g.mode = 'scared';
                // Reverse direction
                g.dir = OPPOSITE[g.dir];
              }
            }
          }

          // Level clear?
          if (pelletsRef.current <= 0) {
            playSound('levelclear');
            levelClearRef.current = 1500;
          }
        } else {
          pac.moving = false;
        }

        // ── Mouth animation ────────────────────────────────────────────────
        if (pac.moving) {
          pac.mouthAngle += pac.mouthDir * 0.06;
          if (pac.mouthAngle >= 0.4) pac.mouthDir = -1;
          if (pac.mouthAngle <= 0.02) pac.mouthDir = 1;
        }

        // ── Ghost movement ─────────────────────────────────────────────────
        for (const ghost of ghosts) {
          if (!ghost.released) continue;

          // Eaten ghosts return to house
          if (ghost.mode === 'eaten') {
            // Fast movement toward house center
            const target = { x: 10, y: 9 };
            if (ghost.x === target.x && ghost.y === target.y) {
              // Respawn
              const currentMode = modePhaseRef.current < MODE_CYCLE.length
                ? MODE_CYCLE[modePhaseRef.current].mode : 'chase';
              ghost.mode = scaredTimerRef.current > 0 ? 'scared' : currentMode;
              ghost.x = 10;
              ghost.y = 7;
            } else {
              const t = getGhostTarget(ghost, pac, ghosts);
              const dir = chooseGhostDirection(ghost, t, maze, false);
              ghost.dir = dir;
              const d = DELTA[dir];
              let nx = ghost.x + d.x;
              let ny = ghost.y + d.y;
              if (nx < 0) nx = COLS - 1;
              else if (nx >= COLS) nx = 0;
              if (!isWall(maze, nx, ny)) {
                ghost.x = nx;
                ghost.y = ny;
              }
            }
            continue;
          }

          // Normal/scared movement
          const isScared = ghost.mode === 'scared';
          const target = getGhostTarget(ghost, pac, ghosts);
          const dir = chooseGhostDirection(ghost, target, maze, isScared);
          ghost.dir = dir;
          const d = DELTA[dir];
          let nx = ghost.x + d.x;
          let ny = ghost.y + d.y;

          // Tunnel
          if (nx < 0) nx = COLS - 1;
          else if (nx >= COLS) nx = 0;

          if (!isWall(maze, nx, ny)) {
            ghost.x = nx;
            ghost.y = ny;
          }

          // Collision with Pac-Man
          if (ghost.x === pac.x && ghost.y === pac.y) {
            if (ghost.mode === 'scared') {
              // Eat ghost!
              ghost.mode = 'eaten';
              ghostEatComboRef.current++;
              const points = 200 * Math.pow(2, ghostEatComboRef.current - 1);
              scoreRef.current += points;
              setScore(scoreRef.current);
              playSound('eatghost');
              scorePopupsRef.current.push({
                x: ghost.x * CELL + CELL / 2,
                y: ghost.y * CELL,
                text: String(points),
                life: 1,
                color: '#00ffff',
              });
            } else if ((ghost.mode as string) !== 'eaten') {
              // Pac-Man dies
              playSound('death');
              spawnDeathParticles(pac.x, pac.y);
              deathPauseRef.current = 1000;
              render(ctx, timestamp, dt);
              animFrameRef.current = requestAnimationFrame(gameLoop);
              return;
            }
          }
        }

        // Check collision again after all ghosts moved
        for (const ghost of ghosts) {
          if (!ghost.released || ghost.mode === 'eaten') continue;
          if (ghost.x === pac.x && ghost.y === pac.y) {
            if (ghost.mode === 'scared') {
              ghost.mode = 'eaten';
              ghostEatComboRef.current++;
              const points = 200 * Math.pow(2, ghostEatComboRef.current - 1);
              scoreRef.current += points;
              setScore(scoreRef.current);
              playSound('eatghost');
              scorePopupsRef.current.push({
                x: ghost.x * CELL + CELL / 2,
                y: ghost.y * CELL,
                text: String(points),
                life: 1,
                color: '#00ffff',
              });
            } else {
              playSound('death');
              spawnDeathParticles(pac.x, pac.y);
              deathPauseRef.current = 1000;
              render(ctx, timestamp, dt);
              animFrameRef.current = requestAnimationFrame(gameLoop);
              return;
            }
          }
        }
      }

      // ── Render ───────────────────────────────────────────────────────────
      render(ctx, timestamp, dt);
      animFrameRef.current = requestAnimationFrame(gameLoop);
    };

    // ── Render Function ─────────────────────────────────────────────────────

    const render = (ctx: CanvasRenderingContext2D, timestamp: number, dt: number) => {
      const maze = mazeRef.current;
      const pac = pacRef.current;
      const ghosts = ghostsRef.current;

      // Clear
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Flash on level clear
      if (flashRef.current > 0) {
        const flashAlpha = (flashRef.current / 200) * 0.3;
        ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      }

      // Draw maze
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = maze[r][c];
          const x = c * CELL;
          const y = r * CELL;

          if (cell === 1) {
            // Wall
            ctx.fillStyle = '#0a0a1a';
            ctx.fillRect(x, y, CELL, CELL);
            ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
            ctx.lineWidth = 1.5;
            ctx.shadowColor = '#fbbf24';
            ctx.shadowBlur = 3;
            ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
            ctx.shadowBlur = 0;
          } else if (cell === 4) {
            // Ghost house
            ctx.fillStyle = 'rgba(255, 184, 255, 0.08)';
            ctx.fillRect(x, y, CELL, CELL);
          } else if (cell === 3) {
            // Power pellet
            const pulse = 4 + Math.sin(timestamp * 0.006) * 2;
            ctx.save();
            ctx.shadowColor = '#fbbf24';
            ctx.shadowBlur = 8;
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath();
            ctx.arc(x + CELL / 2, y + CELL / 2, pulse, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          } else if (cell === 0) {
            // Normal pellet
            ctx.fillStyle = 'rgba(251, 191, 36, 0.5)';
            ctx.beginPath();
            ctx.arc(x + CELL / 2, y + CELL / 2, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // Ghost house door
      ctx.strokeStyle = '#ffb8ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(9 * CELL, 8 * CELL + CELL / 2);
      ctx.lineTo(12 * CELL, 8 * CELL + CELL / 2);
      ctx.stroke();

      // ── Draw Ghosts ──────────────────────────────────────────────────────
      for (const ghost of ghosts) {
        if (!ghost.released) continue;

        const gx = ghost.x * CELL + CELL / 2;
        const gy = ghost.y * CELL + CELL / 2;
        const r = CELL / 2 - 2;

        if (ghost.mode === 'eaten') {
          // Just eyes
          drawGhostEyes(ctx, gx, gy, ghost.dir);
          continue;
        }

        const isScared = ghost.mode === 'scared';
        const bodyColor = isScared ? '#0000ff' : ghost.color;

        // Body
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.arc(gx, gy - 2, r, Math.PI, 0);
        ctx.lineTo(gx + r, gy + r - 2);
        // Feet bumps
        const footW = (r * 2) / 3;
        for (let i = 0; i < 3; i++) {
          const fx = gx - r + i * footW;
          ctx.lineTo(fx + footW / 2, gy + r - 2 - 3);
          ctx.lineTo(fx + footW, gy + r - 2);
        }
        ctx.closePath();
        ctx.fill();

        if (isScared) {
          // Scared face
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(gx - 3, gy - 4, 2, 0, Math.PI * 2);
          ctx.arc(gx + 3, gy - 4, 2, 0, Math.PI * 2);
          ctx.fill();
          // Wavy mouth
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(gx - 5, gy + 2);
          for (let i = 0; i < 5; i++) {
            ctx.lineTo(gx - 5 + i * 2.5, gy + 2 + (i % 2 === 0 ? 0 : -2));
          }
          ctx.stroke();
        } else {
          drawGhostEyes(ctx, gx, gy - 2, ghost.dir);
        }
      }

      // ── Draw Pac-Man ─────────────────────────────────────────────────────
      if (deathPauseRef.current <= 0) {
        const px = pac.x * CELL + CELL / 2;
        const py = pac.y * CELL + CELL / 2;
        const r = CELL / 2 - 1;

        let startAngle = 0;
        let endAngle = Math.PI * 2;

        switch (pac.dir) {
          case 'right':
            startAngle = pac.mouthAngle;
            endAngle = Math.PI * 2 - pac.mouthAngle;
            break;
          case 'left':
            startAngle = Math.PI + pac.mouthAngle;
            endAngle = Math.PI - pac.mouthAngle;
            break;
          case 'up':
            startAngle = Math.PI * 1.5 + pac.mouthAngle;
            endAngle = Math.PI * 1.5 - pac.mouthAngle;
            break;
          case 'down':
            startAngle = Math.PI * 0.5 + pac.mouthAngle;
            endAngle = Math.PI * 0.5 - pac.mouthAngle;
            break;
        }

        ctx.save();
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.arc(px, py, r, startAngle, endAngle);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Eye
        const eyeOffset = r * 0.3;
        let eyeX = px;
        let eyeY = py - eyeOffset;
        if (pac.dir === 'left') { eyeX = px - eyeOffset * 0.5; eyeY = py - eyeOffset; }
        else if (pac.dir === 'down') { eyeX = px + eyeOffset * 0.5; eyeY = py; }
        else if (pac.dir === 'up') { eyeX = px + eyeOffset * 0.5; eyeY = py - eyeOffset * 1.5; }
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(eyeX, eyeY, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Particles ────────────────────────────────────────────────────────
      const dtSec = dt / 1000;
      particlesRef.current = particlesRef.current.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1;
        p.life -= dtSec / p.maxLife;
        return p.life > 0;
      });
      for (const p of particlesRef.current) {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * p.life, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // ── Score Popups ─────────────────────────────────────────────────────
      scorePopupsRef.current = scorePopupsRef.current.filter(p => {
        p.life -= dt * 0.001;
        p.y -= 0.5;
        return p.life > 0;
      });
      for (const p of scorePopupsRef.current) {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y);
      }
      ctx.globalAlpha = 1;
    };

    // ── Draw Ghost Eyes ──────────────────────────────────────────────────────

    const drawGhostEyes = (ctx: CanvasRenderingContext2D, cx: number, cy: number, dir: Direction) => {
      // White ovals
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(cx - 4, cy - 2, 3.5, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + 4, cy - 2, 3.5, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Pupils — offset based on direction
      let px = 0, py = 0;
      switch (dir) {
        case 'left': px = -1.5; break;
        case 'right': px = 1.5; break;
        case 'up': py = -1.5; break;
        case 'down': py = 1.5; break;
      }
      ctx.fillStyle = '#00f';
      ctx.beginPath();
      ctx.arc(cx - 4 + px, cy - 2 + py, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 4 + px, cy - 2 + py, 2, 0, Math.PI * 2);
      ctx.fill();
    };

    lastTimeRef.current = performance.now();
    animFrameRef.current = requestAnimationFrame(gameLoop);

    return () => {
      running = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [status, difficulty, playSound, spawnDeathParticles, getGhostTarget, chooseGhostDirection, resetPositions, bestScores]);

  // ── Cleanup ────────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // ── Render JSX ─────────────────────────────────────────────────────────────

  return (
    <div className="pacman-container">
      {/* Difficulty Selector */}
      {status === 'idle' && (
        <div className="pacman-difficulty">
          {(Object.keys(DIFFICULTY) as PacDifficulty[]).map(diff => (
            <button
              key={diff}
              className="difficulty-tile"
              onClick={() => startGame(diff)}
            >
              <span className="diff-icon">{DIFFICULTY[diff].icon}</span>
              <span className="diff-label">{DIFFICULTY[diff].label}</span>
              <span className="diff-meta">{DIFFICULTY[diff].meta}</span>
            </button>
          ))}
        </div>
      )}

      {/* HUD + Canvas */}
      {status !== 'idle' && (
        <>
          <div className="pacman-hud">
            <div className="pacman-hud-score">
              <span className="pacman-hud-label">Score</span>
              <span className="pacman-hud-value">{score}</span>
            </div>
            <div className="pacman-hud-level">
              <span className="pacman-hud-label">Level</span>
              <span className="pacman-hud-value">{level}</span>
            </div>
            <div className="pacman-hud-lives">
              <span className="pacman-hud-label">Lives</span>
              <span className="pacman-hud-value">{'💛'.repeat(Math.max(0, lives))}</span>
            </div>
          </div>

          <div className="pacman-canvas-wrapper"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <canvas
              ref={canvasRef}
              className="pacman-canvas"
              width={CANVAS_W}
              height={CANVAS_H}
              style={{ width: '100%', maxWidth: CANVAS_W, aspectRatio: `${CANVAS_W}/${CANVAS_H}` }}
            />

            {/* Game Over */}
            {status === 'dead' && (
              <div className="pacman-game-over">
                <div className="pacman-go-card">
                  <div className="pacman-go-title">Game Over</div>
                  <div className="pacman-go-score">{score}</div>
                  <div className="pacman-go-level">Level {level}</div>
                  {isNewBest && <div className="pacman-go-newbest">🎉 New Best!</div>}
                  <div className="pacman-go-actions">
                    <button className="difficulty-tile" onClick={() => startGame(difficulty)}>
                      <span className="diff-label">Play Again</span>
                    </button>
                    <button className="difficulty-tile" onClick={resetGame}>
                      <span className="diff-label">Back to Modes</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Paused */}
            {status === 'paused' && (
              <div className="pacman-game-over">
                <div className="pacman-go-card">
                  <div className="pacman-go-title">Paused</div>
                  <div className="pacman-go-actions">
                    <button className="difficulty-tile" onClick={() => setStatus('playing')}>
                      <span className="diff-label">Resume</span>
                    </button>
                    <button className="difficulty-tile" onClick={resetGame}>
                      <span className="diff-label">Quit</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="pacman-controls">Arrow keys / WASD / Swipe</div>

          {/* D-pad */}
          <div className="pacman-dpad">
            <button className="pacman-dpad-btn pacman-dpad-up" onClick={() => handleDpad('up')}>▲</button>
            <button className="pacman-dpad-btn pacman-dpad-left" onClick={() => handleDpad('left')}>◀</button>
            <button className="pacman-dpad-btn pacman-dpad-right" onClick={() => handleDpad('right')}>▶</button>
            <button className="pacman-dpad-btn pacman-dpad-down" onClick={() => handleDpad('down')}>▼</button>
          </div>
        </>
      )}

      <button className="back-to-hub" onClick={onBack}>← Back to Games</button>
    </div>
  );
}
