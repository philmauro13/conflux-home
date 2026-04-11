import { useState, useCallback, useRef, useEffect } from 'react';
import {
  playSnakeEat,
  playSnakeTurn,
  playSnakeDeath,
  playSnakeNewBest,
  playSnakeSpeedUp,
} from '../lib/sound';

// ─── Types ───────────────────────────────────────────────────────────────────

type SnakeDifficulty = 'classic' | 'zen' | 'challenge' | 'speedrun';
type GameStatus = 'idle' | 'playing' | 'paused' | 'dead';

interface SnakeGameConfig {
  gridSize: number;
  cellSize: number;
  baseSpeed: number;
  speedIncrement: number;
  minSpeed: number;
  wallsKill: boolean;
  hasObstacles: boolean;
  label: string;
  meta: string;
  icon: string;
}

interface SnakeGameProps {
  onBack: () => void;
}

type Direction = 'up' | 'down' | 'left' | 'right';

interface Position {
  x: number;
  y: number;
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

interface TrailSegment {
  x: number;
  y: number;
  createdAt: number;
}

// ─── Difficulty Config ───────────────────────────────────────────────────────

const DIFFICULTY_CONFIG: Record<SnakeDifficulty, SnakeGameConfig> = {
  classic:   { gridSize: 20, cellSize: 20, baseSpeed: 150, speedIncrement: 3, minSpeed: 60, wallsKill: true,  hasObstacles: false, label: 'Classic',    meta: 'Walls kill · Speeds up', icon: '🐍' },
  zen:       { gridSize: 20, cellSize: 20, baseSpeed: 120, speedIncrement: 0, minSpeed: 120, wallsKill: false, hasObstacles: false, label: 'Zen',        meta: 'Wrap around · Chill',    icon: '🧘' },
  challenge: { gridSize: 20, cellSize: 20, baseSpeed: 140, speedIncrement: 4, minSpeed: 70,  wallsKill: true,  hasObstacles: true,  label: 'Challenge',  meta: 'Obstacles · Speeds up',  icon: '⚡' },
  speedrun:  { gridSize: 20, cellSize: 20, baseSpeed: 80,  speedIncrement: 2, minSpeed: 50,  wallsKill: true,  hasObstacles: false, label: 'Speedrun',   meta: 'Starts fast · Faster',   icon: '🏎️' },
};

const CANVAS_SIZE = DIFFICULTY_CONFIG.classic.gridSize * DIFFICULTY_CONFIG.classic.cellSize; // 400

const OPPOSITE: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' };
const DELTA: Record<Direction, Position> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadBestScores(): Record<string, number> {
  try {
    const saved = localStorage.getItem('conflux_snake_best');
    return saved ? JSON.parse(saved) : { classic: 0, zen: 0, challenge: 0, speedrun: 0 };
  } catch {
    return { classic: 0, zen: 0, challenge: 0, speedrun: 0 };
  }
}

function saveBestScores(scores: Record<string, number>) {
  localStorage.setItem('conflux_snake_best', JSON.stringify(scores));
}

function isOnSnake(pos: Position, snake: Position[]): boolean {
  return snake.some(s => s.x === pos.x && s.y === pos.y);
}

function isOnObstacle(pos: Position, obstacles: Position[]): boolean {
  return obstacles.some(o => o.x === pos.x && o.y === pos.y);
}

function randomFreeCell(gridSize: number, snake: Position[], obstacles: Position[]): Position {
  let attempts = 0;
  while (attempts < 1000) {
    const pos = { x: Math.floor(Math.random() * gridSize), y: Math.floor(Math.random() * gridSize) };
    if (!isOnSnake(pos, snake) && !isOnObstacle(pos, obstacles)) return pos;
    attempts++;
  }
  return { x: Math.floor(gridSize / 2), y: 0 };
}

function generateObstacles(count: number, gridSize: number, snake: Position[], existingObstacles: Position[], food: Position): Position[] {
  const newObs: Position[] = [];
  let attempts = 0;
  while (newObs.length < count && attempts < 500) {
    const pos = { x: Math.floor(Math.random() * gridSize), y: Math.floor(Math.random() * gridSize) };
    if (!isOnSnake(pos, snake) && !isOnObstacle(pos, [...existingObstacles, ...newObs]) && !(pos.x === food.x && pos.y === food.y)) {
      newObs.push(pos);
    }
    attempts++;
  }
  return newObs;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SnakeGame({ onBack }: SnakeGameProps) {
  const [status, setStatus] = useState<GameStatus>('idle');
  const [difficulty, setDifficulty] = useState<SnakeDifficulty>('classic');
  const [score, setScore] = useState(0);
  const [bestScores, setBestScores] = useState<Record<string, number>>(loadBestScores);
  const [isNewBest, setIsNewBest] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const tickAccumRef = useRef<number>(0);
  const snakeRef = useRef<Position[]>([]);
  const foodRef = useRef<Position>({ x: 0, y: 0 });
  const dirRef = useRef<Direction>('right');
  const dirQueueRef = useRef<Direction[]>([]);
  const obstaclesRef = useRef<Position[]>([]);
  const scoreRef = useRef<number>(0);
  const speedRef = useRef<number>(150);
  const gameStatusRef = useRef<GameStatus>('idle');
  const particlesRef = useRef<Particle[]>([]);
  const trailsRef = useRef<TrailSegment[]>([]);
  const foodSpawnTimeRef = useRef<number>(0);
  const touchStartRef = useRef<Position | null>(null);

  // Keep refs in sync
  useEffect(() => { gameStatusRef.current = status; }, [status]);

  // ── Sound Effects ────────────────────────────────────────────────────────

  const playSound = useCallback((type: 'eat' | 'turn' | 'speedup' | 'death' | 'newbest') => {
    switch (type) {
      case 'eat': playSnakeEat(); break;
      case 'turn': playSnakeTurn(); break;
      case 'speedup': playSnakeSpeedUp(); break;
      case 'death': playSnakeDeath(); break;
      case 'newbest': playSnakeNewBest(); break;
    }
  }, []);

  // ── Spawn Death Particles ────────────────────────────────────────────────

  const spawnDeathParticles = useCallback((snake: Position[], cellSize: number) => {
    const particles: Particle[] = [];
    const colors = ['#10b981', '#059669', '#047857', '#fbbf24', '#ef4444'];
    for (const seg of snake) {
      const cx = seg.x * cellSize + cellSize / 2;
      const cy = seg.y * cellSize + cellSize / 2;
      for (let i = 0; i < 4; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 3;
        particles.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          maxLife: 0.5 + Math.random() * 0.5,
          radius: 2 + Math.random() * 3,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }
    }
    particlesRef.current = particles;
  }, []);

  // ── Save Best Score ──────────────────────────────────────────────────────

  const maybeSaveBestScore = useCallback((diff: SnakeDifficulty, newScore: number): boolean => {
    const current = bestScores[diff] || 0;
    if (newScore > current) {
      const updated = { ...bestScores, [diff]: newScore };
      setBestScores(updated);
      saveBestScores(updated);
      return true;
    }
    return false;
  }, [bestScores]);

  // ── Reset Game ───────────────────────────────────────────────────────────

  const resetGame = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setStatus('idle');
    setScore(0);
    setIsNewBest(false);
    snakeRef.current = [];
    foodRef.current = { x: 0, y: 0 };
    dirRef.current = 'right';
    dirQueueRef.current = [];
    obstaclesRef.current = [];
    scoreRef.current = 0;
    speedRef.current = DIFFICULTY_CONFIG[difficulty].baseSpeed;
    particlesRef.current = [];
    trailsRef.current = [];
    tickAccumRef.current = 0;
  }, [difficulty]);

  // ── Start Game ───────────────────────────────────────────────────────────

  const startGame = useCallback((diff: SnakeDifficulty) => {
    const config = DIFFICULTY_CONFIG[diff];
    const mid = Math.floor(config.gridSize / 2);
    const initialSnake = [
      { x: mid, y: mid },
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
    ];

    setDifficulty(diff);
    setScore(0);
    setIsNewBest(false);
    snakeRef.current = initialSnake;
    dirRef.current = 'right';
    dirQueueRef.current = [];
    scoreRef.current = 0;
    speedRef.current = config.baseSpeed;
    particlesRef.current = [];
    trailsRef.current = [];
    tickAccumRef.current = 0;

    let obs: Position[] = [];
    if (config.hasObstacles) {
      obs = generateObstacles(5, config.gridSize, initialSnake, [], { x: -1, y: -1 });
    }
    obstaclesRef.current = obs;

    foodRef.current = randomFreeCell(config.gridSize, initialSnake, obs);
    foodSpawnTimeRef.current = performance.now();

    lastTimeRef.current = performance.now();
    setStatus('playing');
  }, []);

  // ── Direction Handling ───────────────────────────────────────────────────

  const queueDirection = useCallback((newDir: Direction) => {
    const queue = dirQueueRef.current;
    const lastQueued = queue.length > 0 ? queue[queue.length - 1] : dirRef.current;
    if (newDir === OPPOSITE[lastQueued]) return; // can't reverse
    if (newDir === lastQueued) return; // same direction
    if (queue.length < 2) {
      queue.push(newDir);
      playSound('turn');
    }
  }, [playSound]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (gameStatusRef.current !== 'playing') return;

    const keyMap: Record<string, Direction> = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', W: 'up', s: 'down', S: 'down', a: 'left', A: 'left', d: 'right', D: 'right',
    };

    const dir = keyMap[e.key];
    if (dir) {
      e.preventDefault();
      queueDirection(dir);
    }

    if (e.key === 'Escape') {
      setStatus(prev => prev === 'playing' ? 'paused' : prev);
    }
  }, [queueDirection]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ── Touch / Swipe ────────────────────────────────────────────────────────

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (gameStatusRef.current !== 'playing') return;
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (gameStatusRef.current !== 'playing' || !touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    if (Math.abs(dx) < 30 && Math.abs(dy) < 30) return;

    if (Math.abs(dx) > Math.abs(dy)) {
      queueDirection(dx > 0 ? 'right' : 'left');
    } else {
      queueDirection(dy > 0 ? 'down' : 'up');
    }
  }, [queueDirection]);

  // ── D-pad Handler ────────────────────────────────────────────────────────

  const handleDpad = useCallback((dir: Direction) => {
    if (gameStatusRef.current !== 'playing') return;
    queueDirection(dir);
  }, [queueDirection]);

  // ── Game Loop ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (status !== 'playing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const config = DIFFICULTY_CONFIG[difficulty];
    const size = config.gridSize * config.cellSize;

    let running = true;

    const gameLoop = (timestamp: number) => {
      if (!running) return;

      const dt = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      // Tick accumulator for game logic
      tickAccumRef.current += dt;
      while (tickAccumRef.current >= speedRef.current) {
        tickAccumRef.current -= speedRef.current;
        // Advance game state
        if (dirQueueRef.current.length > 0) {
          const next = dirQueueRef.current.shift()!;
          if (next !== OPPOSITE[dirRef.current]) {
            dirRef.current = next;
          }
        }

        const head = snakeRef.current[0];
        const delta = DELTA[dirRef.current];
        let newHead = { x: head.x + delta.x, y: head.y + delta.y };

        // Wall handling
        if (config.wallsKill) {
          if (newHead.x < 0 || newHead.x >= config.gridSize || newHead.y < 0 || newHead.y >= config.gridSize) {
            // Death
            playSound('death');
            spawnDeathParticles(snakeRef.current, config.cellSize);
            const finalScore = scoreRef.current;
            const wasNewBest = maybeSaveBestScore(difficulty, finalScore);
            setIsNewBest(wasNewBest);
            if (wasNewBest) playSound('newbest');
            setStatus('dead');
            return;
          }
        } else {
          // Wrap
          newHead.x = ((newHead.x % config.gridSize) + config.gridSize) % config.gridSize;
          newHead.y = ((newHead.y % config.gridSize) + config.gridSize) % config.gridSize;
        }

        // Self collision
        if (isOnSnake(newHead, snakeRef.current)) {
          playSound('death');
          spawnDeathParticles(snakeRef.current, config.cellSize);
          const finalScore = scoreRef.current;
          const wasNewBest = maybeSaveBestScore(difficulty, finalScore);
          setIsNewBest(wasNewBest);
          if (wasNewBest) playSound('newbest');
          setStatus('dead');
          return;
        }

        // Obstacle collision
        if (isOnObstacle(newHead, obstaclesRef.current)) {
          playSound('death');
          spawnDeathParticles(snakeRef.current, config.cellSize);
          const finalScore = scoreRef.current;
          const wasNewBest = maybeSaveBestScore(difficulty, finalScore);
          setIsNewBest(wasNewBest);
          if (wasNewBest) playSound('newbest');
          setStatus('dead');
          return;
        }

        // Add trail for tail before moving
        const tail = snakeRef.current[snakeRef.current.length - 1];
        trailsRef.current.push({ x: tail.x, y: tail.y, createdAt: timestamp });

        // Move snake
        snakeRef.current = [newHead, ...snakeRef.current];

        // Check food
        if (newHead.x === foodRef.current.x && newHead.y === foodRef.current.y) {
          // Eat — don't remove tail
          scoreRef.current += 1;
          setScore(scoreRef.current);
          playSound('eat');

          // Speed up
          const newSpeed = Math.max(config.minSpeed, speedRef.current - config.speedIncrement);
          if (newSpeed < speedRef.current && scoreRef.current % 5 === 0) {
            playSound('speedup');
          }
          speedRef.current = newSpeed;

          // Spawn new food
          foodRef.current = randomFreeCell(config.gridSize, snakeRef.current, obstaclesRef.current);
          foodSpawnTimeRef.current = timestamp;

          // Challenge mode: add obstacles every 5 points
          if (config.hasObstacles && scoreRef.current % 5 === 0 && obstaclesRef.current.length < 15) {
            const newObs = generateObstacles(
              Math.min(2, 15 - obstaclesRef.current.length),
              config.gridSize,
              snakeRef.current,
              obstaclesRef.current,
              foodRef.current,
            );
            obstaclesRef.current = [...obstaclesRef.current, ...newObs];
          }
        } else {
          snakeRef.current.pop();
        }
      }

      // ── Render ───────────────────────────────────────────────────────────

      // Clear
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, size, size);

      // Subtle grid lines
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= config.gridSize; i++) {
        const p = i * config.cellSize;
        ctx.beginPath();
        ctx.moveTo(p, 0);
        ctx.lineTo(p, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, p);
        ctx.lineTo(size, p);
        ctx.stroke();
      }

      // Draw trails (fading afterglow)
      const trailDuration = 300; // ms
      trailsRef.current = trailsRef.current.filter(t => timestamp - t.createdAt < trailDuration);
      for (const trail of trailsRef.current) {
        const age = (timestamp - trail.createdAt) / trailDuration;
        const alpha = (1 - age) * 0.3;
        ctx.fillStyle = `rgba(16, 185, 129, ${alpha})`;
        const pad = 2;
        ctx.beginPath();
        ctx.roundRect(
          trail.x * config.cellSize + pad,
          trail.y * config.cellSize + pad,
          config.cellSize - pad * 2,
          config.cellSize - pad * 2,
          3,
        );
        ctx.fill();
      }

      // Draw obstacles
      for (const obs of obstaclesRef.current) {
        ctx.fillStyle = '#7f1d1d';
        ctx.fillRect(obs.x * config.cellSize + 1, obs.y * config.cellSize + 1, config.cellSize - 2, config.cellSize - 2);
        ctx.strokeStyle = '#991b1b';
        ctx.lineWidth = 1;
        ctx.strokeRect(obs.x * config.cellSize + 1, obs.y * config.cellSize + 1, config.cellSize - 2, config.cellSize - 2);
      }

      // Draw snake
      const snake = snakeRef.current;
      for (let i = snake.length - 1; i >= 0; i--) {
        const seg = snake[i];
        const t = snake.length > 1 ? i / (snake.length - 1) : 0;

        if (i === 0) {
          // Head — bright emerald with glow
          ctx.save();
          ctx.shadowColor = '#10b981';
          ctx.shadowBlur = 12;
          ctx.fillStyle = '#10b981';
          ctx.beginPath();
          ctx.roundRect(
            seg.x * config.cellSize + 1,
            seg.y * config.cellSize + 1,
            config.cellSize - 2,
            config.cellSize - 2,
            4,
          );
          ctx.fill();
          ctx.restore();

          // Eyes
          const dir = dirRef.current;
          const cx = seg.x * config.cellSize + config.cellSize / 2;
          const cy = seg.y * config.cellSize + config.cellSize / 2;
          const eyeOffset = 4;
          const eyeRadius = 2.5;
          let eye1x: number, eye1y: number, eye2x: number, eye2y: number;

          switch (dir) {
            case 'right':
              eye1x = cx + 4; eye1y = cy - eyeOffset; eye2x = cx + 4; eye2y = cy + eyeOffset;
              break;
            case 'left':
              eye1x = cx - 4; eye1y = cy - eyeOffset; eye2x = cx - 4; eye2y = cy + eyeOffset;
              break;
            case 'up':
              eye1x = cx - eyeOffset; eye1y = cy - 4; eye2x = cx + eyeOffset; eye2y = cy - 4;
              break;
            case 'down':
              eye1x = cx - eyeOffset; eye1y = cy + 4; eye2x = cx + eyeOffset; eye2y = cy + 4;
              break;
          }

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(eye1x, eye1y, eyeRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(eye2x, eye2y, eyeRadius, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Body — gradient from emerald to darker
          const r = Math.round(16 + (4 - 16) * t);
          const g = Math.round(185 + (120 - 185) * t);
          const b = Math.round(129 + (80 - 129) * t);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          const pad = 2;
          ctx.beginPath();
          ctx.roundRect(
            seg.x * config.cellSize + pad,
            seg.y * config.cellSize + pad,
            config.cellSize - pad * 2,
            config.cellSize - pad * 2,
            3,
          );
          ctx.fill();
        }
      }

      // Draw food with pulsing glow
      const food = foodRef.current;
      const pulsePhase = ((timestamp - foodSpawnTimeRef.current) % 1000) / 1000;
      const glow = 8 + Math.sin(pulsePhase * Math.PI * 2) * 8;

      // Food spawn scale animation (0-200ms)
      const spawnAge = timestamp - foodSpawnTimeRef.current;
      let foodScale = 1;
      if (spawnAge < 200) {
        const t = spawnAge / 200;
        // Overshoot easing
        foodScale = t < 1 ? 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2) : 1;
      }

      ctx.save();
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = glow;
      const foodCx = food.x * config.cellSize + config.cellSize / 2;
      const foodCy = food.y * config.cellSize + config.cellSize / 2;
      const foodRadius = (config.cellSize / 2 - 3) * foodScale;
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(foodCx, foodCy, foodRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Draw particles
      const dtSec = dt / 1000;
      particlesRef.current = particlesRef.current.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= dtSec / p.maxLife;
        p.vx *= 0.98;
        p.vy *= 0.98;
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

      animFrameRef.current = requestAnimationFrame(gameLoop);
    };

    lastTimeRef.current = performance.now();
    animFrameRef.current = requestAnimationFrame(gameLoop);

    return () => {
      running = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [status, difficulty, playSound, spawnDeathParticles, maybeSaveBestScore]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────

  const config = DIFFICULTY_CONFIG[difficulty];

  return (
    <div className="minesweeper-container">
      {/* Difficulty Selector */}
      {status === 'idle' && (
        <div className="snake-difficulty">
          {(Object.keys(DIFFICULTY_CONFIG) as SnakeDifficulty[]).map(diff => (
            <button
              key={diff}
              className="difficulty-tile"
              onClick={() => startGame(diff)}
            >
              <span className="diff-icon">{DIFFICULTY_CONFIG[diff].icon}</span>
              <span className="diff-label">{DIFFICULTY_CONFIG[diff].label}</span>
              <span className="diff-meta">{DIFFICULTY_CONFIG[diff].meta}</span>
            </button>
          ))}
        </div>
      )}

      {/* HUD + Canvas */}
      {status !== 'idle' && (
        <>
          <div className="snake-hud">
            <span className="snake-hud-score">🍎 {score}</span>
            <span className="snake-hud-label">{config.label}</span>
            <span className="snake-hud-best">🏆 {bestScores[difficulty] || 0}</span>
          </div>

          <div className="snake-canvas-wrapper"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <canvas
              ref={canvasRef}
              className="snake-canvas"
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              style={{ width: '100%', maxWidth: CANVAS_SIZE, aspectRatio: '1' }}
            />

            {/* Game Over Overlay */}
            {status === 'dead' && (
              <div className="snake-game-over">
                <div className="snake-go-title">Game Over</div>
                <div className="snake-go-score">{score}</div>
                {isNewBest && <div className="snake-go-newbest">🎉 New Best!</div>}
                <div className="snake-go-actions">
                  <button className="difficulty-tile" onClick={() => startGame(difficulty)}>
                    <span className="diff-label">Play Again</span>
                  </button>
                  <button className="difficulty-tile" onClick={resetGame}>
                    <span className="diff-label">Back to Modes</span>
                  </button>
                </div>
              </div>
            )}

            {/* Paused Overlay */}
            {status === 'paused' && (
              <div className="snake-game-over">
                <div className="snake-go-title">Paused</div>
                <div className="snake-go-actions">
                  <button className="difficulty-tile" onClick={() => setStatus('playing')}>
                    <span className="diff-label">Resume</span>
                  </button>
                  <button className="difficulty-tile" onClick={resetGame}>
                    <span className="diff-label">Quit</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Controls Hint */}
          <div className="snake-controls">
            Arrow keys / WASD / Swipe
          </div>

          {/* D-pad for mobile */}
          <div className="snake-dpad">
            <button className="snake-dpad-btn snake-dpad-up" onClick={() => handleDpad('up')}>▲</button>
            <button className="snake-dpad-btn snake-dpad-left" onClick={() => handleDpad('left')}>◀</button>
            <button className="snake-dpad-btn snake-dpad-right" onClick={() => handleDpad('right')}>▶</button>
            <button className="snake-dpad-btn snake-dpad-down" onClick={() => handleDpad('down')}>▼</button>
          </div>
        </>
      )}

      <button className="back-to-hub" onClick={onBack}>← Back to Games</button>
    </div>
  );
}
