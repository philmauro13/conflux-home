import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { useStudio } from '../hooks/useStudio';
import { STUDIO_MODULES, StudioModule, StudioGeneration } from '../types';
import './studio-onboarding.css';

// ── Module starter prompts (curated, non-blank) ──
const STARTER_PROMPTS: Record<StudioModule, string> = {
  image: 'A serene landscape at sunset with mountains and a crystal-clear lake, digital art',
  video: 'A cinematic 10-second shot of a futuristic city skyline at night with neon lights and flying vehicles',
  music: 'A calm, uplifting lo-fi beat with soft piano melodies and gentle drums, 30 seconds',
  voice: 'Welcome to Conflux Studio. This is a sample voice message to demonstrate the voice cloning feature.',
  code: 'A responsive landing page with a hero section, feature cards grid, and a contact form, using Tailwind CSS',
  design: 'A modern minimalist logo for a tech startup, featuring abstract geometric shapes in electric purple and cyan',
};

// ── Particle Canvas Component ──
type ParticleCanvasProps = {
  module: StudioModule;
  phase: 'ambient' | 'active' | 'result';
};

function ParticleCanvas({ module, phase }: ParticleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | undefined>(undefined);
  const particlesRef = useRef<Array<Particle>>([]);

  // Particle class definitions per module
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize handling
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Initialize particles based on module
    const count = 60;
    const particles: Particle[] = [];

    for (let i = 0; i < count; i++) {
      switch (module) {
        case 'image': {
          // Floating color swatches (circles)
          const hue = Math.random() * 360;
          particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.8,
            vy: (Math.random() - 0.5) * 0.4,
            size: 15 + Math.random() * 35,
            color: `hsla(${hue}, 80%, 60%, 0.15)`,
            type: 'circle',
            rotation: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.02,
          });
          break;
        }
        case 'voice': {
          // Waveform bars (vertical)
          const col = Math.floor(Math.random() * 20);
          particles.push({
            x: (canvas.width / 20) * col + (Math.random() * (canvas.width / 20)),
            y: canvas.height * 0.5 + (Math.random() - 0.5) * 200,
            vx: 0,
            vy: (Math.random() - 0.5) * 1.5,
            size: 4 + Math.random() * 24, // width, height varies
            color: `hsla(${180 + Math.random() * 40}, 90%, 60%, 0.3)`,
            type: 'bar',
            rotation: 0,
            rotSpeed: 0,
            phase: Math.random() * Math.PI * 2,
            speed: 0.02 + Math.random() * 0.04,
          });
          break;
        }
        case 'code': {
          // Falling brackets / code symbols
          const chars = ['{', '}', '[', ']', '(', ')', ';', '<', '>', '/'];
          particles.push({
            x: Math.random() * canvas.width,
            y: -20 - Math.random() * 200,
            vx: (Math.random() - 0.5) * 0.3,
            vy: 1 + Math.random() * 2,
            size: 12 + Math.random() * 16,
            color: `hsla(${140 + Math.random() * 60}, 85%, 65%, 0.25)`,
            type: 'char',
            char: chars[Math.floor(Math.random() * chars.length)],
            rotation: (Math.random() - 0.5) * 0.2,
            rotSpeed: (Math.random() - 0.5) * 0.01,
          });
          break;
        }
        case 'video': {
          // Vertical film frames (rectangles)
          particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.6,
            vy: (Math.random() - 0.5) * 0.3,
            size: 20 + Math.random() * 40,
            color: 'rgba(6, 182, 212, 0.1)',
            type: 'rect',
            rotation: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.015,
          });
          break;
        }
        case 'music': {
          // Floating sound waves (rings)
          particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5,
            size: 10 + Math.random() * 50,
            color: `hsla(${280 + Math.random() * 40}, 80%, 65%, 0.15)`,
            type: 'ring',
            rotation: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.01,
            ringWidth: 2,
            expansion: 0,
          });
          break;
        }
        case 'design': {
          // Geometric shapes: triangles, squares, circles
          const types: Array<'circle' | 'rect' | 'triangle'> = ['circle', 'rect', 'triangle'];
          const t = types[Math.floor(Math.random() * types.length)];
          particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.7,
            vy: (Math.random() - 0.5) * 0.4,
            size: 15 + Math.random() * 30,
            color: `hsla(${Math.random() * 360}, 70%, 60%, 0.12)`,
            type: t,
            rotation: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.02,
          });
          break;
        }
      }
    }

    particlesRef.current = particles;

    // Animation loop
    let time = 0;
    const animate = () => {
      time += 0.016;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Special handling for voice: update bar heights as waveform
      const waveformTime = Date.now() * 0.002;

      particlesRef.current.forEach(p => {
        // Update position
        p.x += p.vx;
        p.y += p.vy;

        // Bounce off edges
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        // Rotate
        p.rotation += p.rotSpeed || 0;

        // Draw based on type
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;

        if (p.type === 'circle' || p.type === 'ring') {
          ctx.beginPath();
        if (p.type === 'ring') {
          ctx.arc(0, 0, p.size * (0.5 + Math.sin(time * 2 + (p.expansion ?? 0)) * 0.3), 0, Math.PI * 2);
            ctx.strokeStyle = p.color;
            ctx.lineWidth = p.ringWidth || 2;
            ctx.stroke();
          } else {
            ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (p.type === 'bar') {
          const height = p.size * (0.5 + 0.5 * Math.sin(waveformTime + (p.x / 50)));
          ctx.fillRect(-p.size / 2, -height / 2, p.size / 4, height);
        } else if (p.type === 'char') {
          ctx.font = `${p.size}px monospace`;
          ctx.fillText(p.char as string, -p.size / 2, p.size / 3);
        } else if (p.type === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.6);
        } else if (p.type === 'triangle') {
          ctx.beginPath();
          ctx.moveTo(0, -p.size / 2);
          ctx.lineTo(p.size / 2, p.size / 2);
          ctx.lineTo(-p.size / 2, p.size / 2);
          ctx.closePath();
          ctx.fill();
        }

        ctx.restore();
      });

      // Add glow for active phase (generating)
      if (phase === 'active') {
        ctx.save();
        const gradient = ctx.createRadialGradient(
          canvas.width / 2, canvas.height / 2, 0,
          canvas.width / 2, canvas.height / 2, canvas.width * 0.8
        );
        gradient.addColorStop(0, 'rgba(168, 85, 247, 0.1)');
        gradient.addColorStop(1, 'rgba(6, 182, 212, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }

      requestRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [module, phase]);

  return <canvas ref={canvasRef} className="particle-canvas" />;
}

// ── Main Onboarding Component ──
export default function StudioOnboarding({ onComplete }: { onComplete?: () => void }) {
  const {
    activeModule: studioActiveModule,
    setActiveModule: setStudioActiveModule,
    generate,
    saveToVault,
    remix,
    generations,
    selectGeneration,
    prompt: studioPrompt,
    setPrompt: setStudioPrompt,
    isGenerating,
  } = useStudio();

  const [phase, setPhase] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [selectedModule, setSelectedModule] = useState<StudioModule | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isPhase4Active, setIsPhase4Active] = useState(false);
  const [resultGen, setResultGen] = useState<StudioGeneration | null>(null);

  // Check completion on mount
  useEffect(() => {
    if (localStorage.getItem('studio-onboarding-completed') === 'true') {
      // Silently exit: parent should not render this component if flag is set
    }
  }, []);

  // Phase 2: Enter module selection
  const handleSelectModule = async (module: StudioModule) => {
    setSelectedModule(module);
    setStudioActiveModule(module);
    setPrompt(STARTER_PROMPTS[module]);
    setStudioPrompt(STARTER_PROMPTS[module]);
    setPhase(2);
  };

  // Phase 2 → Phase 3: after prompt edit
  const handleProceedToInterpretation = () => {
    if (prompt.trim()) {
      setPhase(3);
    }
  };

  // Phase 3 → Phase 4: start generation
  const handleGenerate = async () => {
    setPhase(4);
    setIsPhase4Active(true);
    setResultGen(null); // clear previous result
    try {
      await generate(); // this will set isGenerating and eventually complete
      setPhase(5);
    } catch (e) {
      console.error('Generation failed:', e);
      setPhase(5);
    } finally {
      setIsPhase4Active(false);
    }
  };

  // After generation completes, capture the latest generation from hook state
  useEffect(() => {
    if (phase === 5 && resultGen === null && generations.length > 0) {
      setResultGen(generations[0]);
    }
  }, [phase, generations, resultGen]);

  // Phase 5: Save to Vault
  const handleSaveToVault = async () => {
    if (resultGen) {
      await saveToVault(resultGen);
      completeOnboarding();
    }
  };

  // Phase 5: Remix
  const handleRemix = () => {
    if (resultGen) {
      remix(resultGen);
      setPrompt(resultGen.prompt);
      setStudioPrompt(resultGen.prompt);
      setPhase(2);
    }
  };

  // Mark onboarding as complete
  const completeOnboarding = () => {
    localStorage.setItem('studio-onboarding-completed', 'true');
    if (onComplete) onComplete();
  };

  // Skip (dismiss)
  const handleSkip = () => {
    completeOnboarding();
  };

  // Determine active particle module: during phase 4 we show the module particle system; during other phases, maybe subtle ambient?
  const particleModule = isPhase4Active && selectedModule ? selectedModule : 'image';
  const particlePhase = phase === 4 ? 'active' : (phase === 5 ? 'result' : 'ambient');

  return (
    <motion.div
      className="studio-onboarding-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Particle Canvas */}
      <ParticleCanvas module={particleModule} phase={particlePhase} />

      {/* Skip Button (hidden on Phase 1 since we have Enter Studio there) */}
      {phase !== 1 && (
        <button className="skip-btn" onClick={handleSkip}>
          Skip Onboarding
        </button>
      )}

      <AnimatePresence mode="wait">
        {/* ── Phase 1: Welcome ── */}
        {phase === 1 && (
          <motion.div
            key="phase1"
            className="phase-container"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <h1 className="onboarding-title">What do you want to create today?</h1>
            <p className="onboarding-subtitle">Choose a creative module to get started</p>

            <div className="orb-grid">
              {(Object.entries(STUDIO_MODULES) as [StudioModule, {icon: string; label: string}][]).map(([id, mod]) => (
                <motion.button
                  key={id}
                  className="module-orb"
                  whileHover={{ scale: 1.08, boxShadow: `0 0 32px var(--studio-accent-${id === 'image' || id === 'design' ? 'purple' : 'cyan'})` }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleSelectModule(id as StudioModule)}
                  data-module={id}
                  title={mod.label}
                >
                  <span className="orb-icon">{mod.icon}</span>
                  <span className="orb-label">{mod.label}</span>
                </motion.button>
              ))}
            </div>
            <button className="enter-studio-btn" onClick={handleSkip}>
              Enter Studio
            </button>
          </motion.div>
        )}

        {/* ── Phase 2: Intent (Prompt Entry) ── */}
        {phase === 2 && selectedModule && (
          <motion.div
            key="phase2"
            className="phase-container"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
          >
            <div className="module-badge">
              <span className="badge-icon">{STUDIO_MODULES[selectedModule].icon}</span>
              <span>{STUDIO_MODULES[selectedModule].label}</span>
            </div>

            <h2 className="step-title">Describe your creation</h2>
            <textarea
              className="prompt-textarea"
              value={prompt}
              onChange={(e) => { setPrompt(e.target.value); setStudioPrompt(e.target.value); }}
              placeholder="E.g., A futuristic city with neon lights..."
              rows={4}
            />

            <div className="button-row">
              <button className="btn-secondary" onClick={() => setPhase(1)}>
                Back
              </button>
              <button className="btn-primary" onClick={handleProceedToInterpretation} disabled={!prompt.trim()}>
                Continue
              </button>
            </div>
            <button className="enter-studio-btn" onClick={handleSkip}>
              Enter Studio
            </button>
          </motion.div>
        )}

        {/* ── Phase 3: Interpretation (Preview & Parameters) ── */}
        {phase === 3 && selectedModule && (
          <motion.div
            key="phase3"
            className="phase-container"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
          >
            <div className="preview-card">
              <h3>Here's what I heard:</h3>
              <p className="preview-prompt">"{prompt}"</p>

              {/* Simple parameter adjusters (example) */}
              {(selectedModule === 'image' || selectedModule === 'design') && (
                <div className="param-row">
                  <label>Style</label>
                  <div className="param-buttons">
                    {['Realistic', 'Artistic', 'Abstract'].map(style => (
                      <button key={style} className="param-btn">{style}</button>
                    ))}
                  </div>
                </div>
              )}
              {selectedModule === 'voice' && (
                <div className="param-row">
                  <label>Voice Style</label>
                  <div className="param-buttons">
                    {['Neutral', 'Warm', 'Energetic'].map(v => (
                      <button key={v} className="param-btn">{v}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="button-row">
              <button className="btn-secondary" onClick={() => setPhase(2)}>
                Edit
              </button>
              <button className="btn-primary" onClick={handleGenerate}>
                Generate
              </button>
            </div>
            <button className="enter-studio-btn" onClick={handleSkip}>
              Enter Studio
            </button>
          </motion.div>
        )}

        {/* ── Phase 4: First Generation (Immersive Animation) ── */}
        {phase === 4 && selectedModule && (
          <motion.div
            key="phase4"
            className="phase-container fullscreen-message"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              Creating your masterpiece...
            </motion.h2>
            {isGenerating && (
              <motion.div
                className="loading-dots"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <span></span><span></span><span></span>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* ── Phase 5: Save/Remix ── */}
        {phase === 5 && selectedModule && resultGen && (
          <motion.div
            key="phase5"
            className="phase-container"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <h2 className="step-title">Your creation is ready</h2>

            <div className="result-card">
              {/* Render output based on module */}
              {selectedModule === 'image' && (
                <div className="result-image-container">
                  <img
                    src={resultGen.output_url || resultGen.output_path || '/placeholder-image.png'}
                    alt="Generated"
                    className="result-image"
                    onError={(e) => { e.currentTarget.src = '/placeholder-image.png'; }}
                  />
                </div>
              )}
              {selectedModule === 'voice' && (
                <div className="result-audio">
                  <audio controls src={resultGen.output_url || resultGen.output_path || ''} />
                </div>
              )}
              {selectedModule === 'code' && (
                <pre className="result-code">
                  <code>{resultGen.metadata_json ? JSON.parse(resultGen.metadata_json).snippet || '// Code generation complete' : '// Code generation complete'}</code>
                </pre>
              )}
              {['video', 'music', 'design'].includes(selectedModule) && (
                <div className="result-placeholder">
                  <span className="placeholder-icon">{STUDIO_MODULES[selectedModule].icon}</span>
                  <p>{STUDIO_MODULES[selectedModule].label} generation complete</p>
                </div>
              )}
            </div>

            <div className="button-row two-buttons">
              <button className="btn-secondary" onClick={handleRemix}>
                🔄 Remix
              </button>
              <button className="btn-primary" onClick={handleSaveToVault}>
                💾 Save to Vault
              </button>
            </div>
            <button className="enter-studio-btn" onClick={handleSkip}>
              Enter Studio
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Particle Types ──
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  type: 'circle' | 'bar' | 'char' | 'rect' | 'ring' | 'triangle';
  rotation: number;
  rotSpeed: number;
  char?: string;
  phase?: number;
  speed?: number;
  ringWidth?: number;
  expansion?: number;
}
