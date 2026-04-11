export type BrainMode =
  | "idle"
  | "listen"
  | "focus"
  | "speak"
  | "excited"
  | "compact"
  | "expanded";

export type LobeName = "speech" | "memory" | "reasoning" | "tools" | "perception";

export type PulseEventDetail = {
  lobe?: LobeName;
  lobes?: LobeName[];
  route?: LobeName[];
  strength?: number;
  bursts?: number;
  edgeIndex?: number;
};

export type TokenCadenceDetail = {
  tokens?: string[];
  route?: LobeName[];
  intervalMs?: number;
  strength?: number;
  burstsPerToken?: number;
  status?: string;
};

export type BrainCommand = {
  label: string;
  mode: BrainMode;
  glowBoost: number;
  pulseRate: number;
  scale: number;
  turbulence: number;
  palette: {
    node: string;
    hot: string;
    line: string;
    glow: string;
    aura: string;
  };
  driftAxis: [number, number, number];
  wobble: number;
  lobeSpread: number;
  speechRingIntensity: number;
  activeLobes: LobeName[];
};

export type PaletteName =
  | "budget"
  | "kitchen"
  | "life"
  | "dreams"
  | "idle"
  | "listen"
  | "focus"
  | "speak"
  | "excited"
  | "compact"
  | "expanded";

export type MorphTargetName = "heart" | "smile" | "neutral";

export type NeuralGraph = {
  positions: Float32Array;
  basePositions: Float32Array;
  targetPositions: Float32Array;
  nodeCount: number;
  edges: Uint16Array;
  edgeCount: number;
  nodeLobes: LobeName[];
  lobeNodeIndices: Record<LobeName, number[]>;
  edgeLobes: LobeName[][];
  adjacency: number[][];
  edgeIndexByPair: Record<string, number>;
  lobeAnchors: Record<LobeName, number>;
  morphFactor: number;
  currentMorphTarget: MorphTargetName | null;
};

type LobeCenter = Record<LobeName, [number, number, number]>;

const rand = (seed: number) => {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
};

export const COMMANDS: BrainCommand[] = [
  {
    label: "Idle Drift",
    mode: "idle",
    glowBoost: 0.9,
    pulseRate: 0.55,
    scale: 1,
    turbulence: 0.1,
    palette: {
      node: "#6fcbff",
      hot: "#e7fbff",
      line: "#10395e",
      glow: "#5be9ff",
      aura: "#154f83"
    },
    driftAxis: [0.18, 0.14, 0.08],
    wobble: 0.12,
    lobeSpread: 1,
    speechRingIntensity: 0.06,
    activeLobes: ["perception", "reasoning"]
  },
  {
    label: "Listening",
    mode: "listen",
    glowBoost: 1.55,
    pulseRate: 0.9,
    scale: 1.04,
    turbulence: 0.16,
    palette: {
      node: "#a855f7", // Indigo/Purple
      hot: "#e9d5ff",
      line: "#581c87",
      glow: "#c084fc",
      aura: "#7e22ce"
    },
    driftAxis: [-0.22, 0.2, 0.12],
    wobble: 0.2,
    lobeSpread: 0.9,
    speechRingIntensity: 0.08,
    activeLobes: ["perception", "speech"]
  },
  {
    label: "Focused Reply",
    mode: "focus",
    glowBoost: 2.0, // More vibrant glow
    pulseRate: 2.5, // Faster pulses
    scale: 0.95,
    turbulence: 0.12, // More dynamic movement
    palette: {
      node: "#4facfe", // Brighter blue
      hot: "#00f2ff", // Cyan hot spots
      line: "#0c3547",
      glow: "#00d2ff", // Vibrant cyan glow
      aura: "#0099cc" // Deep cyan aura
    },
    driftAxis: [0.08, -0.12, 0.03],
    wobble: 0.15, // More wobble for energy
    lobeSpread: 0.82,
    speechRingIntensity: 0.05,
    activeLobes: ["reasoning", "memory"]
  },
  {
    label: "Speaking",
    mode: "speak",
    glowBoost: 1.85,
    pulseRate: 1.7,
    scale: 1.12,
    turbulence: 0.14,
    palette: {
      node: "#87d0ff",
      hot: "#fff8e8",
      line: "#664d1e",
      glow: "#ffc46b",
      aura: "#7f4d00"
    },
    driftAxis: [0.14, 0.3, -0.18],
    wobble: 0.18,
    lobeSpread: 1.12,
    speechRingIntensity: 0.14,
    activeLobes: ["speech", "reasoning"]
  },
  {
    label: "Spark Burst",
    mode: "excited",
    glowBoost: 2.35,
    pulseRate: 2.3,
    scale: 1.16,
    turbulence: 0.24,
    palette: {
      node: "#ff8fd7",
      hot: "#fff0ff",
      line: "#5d2069",
      glow: "#ff65d0",
      aura: "#641b6e"
    },
    driftAxis: [-0.35, 0.15, 0.26],
    wobble: 0.32,
    lobeSpread: 1.18,
    speechRingIntensity: 0.09,
    activeLobes: ["tools", "speech", "reasoning"]
  },
  {
    label: "Compact",
    mode: "compact",
    glowBoost: 1.05,
    pulseRate: 0.75,
    scale: 0.76,
    turbulence: 0.04,
    palette: {
      node: "#89b8ff",
      hot: "#f0f6ff",
      line: "#213d66",
      glow: "#89b8ff",
      aura: "#17294d"
    },
    driftAxis: [0.03, 0.05, -0.02],
    wobble: 0.03,
    lobeSpread: 0.65,
    speechRingIntensity: 0.04,
    activeLobes: ["memory"]
  },
  {
    label: "Expanded",
    mode: "expanded",
    glowBoost: 1.6,
    pulseRate: 1.2,
    scale: 1.34,
    turbulence: 0.14,
    palette: {
      node: "#68ffe1",
      hot: "#f5fffb",
      line: "#146157",
      glow: "#66ffd5",
      aura: "#15695f"
    },
    driftAxis: [0.24, -0.18, 0.16],
    wobble: 0.16,
    lobeSpread: 1.28,
    speechRingIntensity: 0.06,
    activeLobes: ["memory", "tools", "perception"]
  }
];

// ============================================
// Palette Per App
// ============================================

export const APP_PALETTES: Record<string, {
  node: string;
  hot: string;
  line: string;
  glow: string;
  aura: string;
} | undefined> = {
  // Core apps with distinct colors
  budget: {
    node: "#10b981",
    hot: "#d1fae5",
    line: "#065f46",
    glow: "#34d399",
    aura: "#047857"
  },
  kitchen: {
    node: "#f59e0b",
    hot: "#fef3c7",
    line: "#92400e",
    glow: "#fbbf24",
    aura: "#d97706"
  },
  life: {
    node: "#8b5cf6",
    hot: "#ede9fe",
    line: "#5b21b6",
    glow: "#a78bfa",
    aura: "#7c3aed"
  },
  dreams: {
    node: "#3b82f6",
    hot: "#dbeafe",
    line: "#1e40af",
    glow: "#60a5fa",
    aura: "#2563eb"
  },
  // Additional apps with complementary palettes
  agents: {
    node: "#ec4899",
    hot: "#fce7f3",
    line: "#9d174d",
    glow: "#f472b6",
    aura: "#be185d"
  },
  feed: {
    node: "#06b6d4",
    hot: "#cffafe",
    line: "#164e63",
    glow: "#22d3ee",
    aura: "#0e7490"
  },
  games: {
    node: "#ef4444",
    hot: "#fee2e2",
    line: "#991b1b",
    glow: "#f87171",
    aura: "#dc2626"
  },
  marketplace: {
    node: "#f59e0b",
    hot: "#fef3c7",
    line: "#92400e",
    glow: "#fbbf24",
    aura: "#d97706"
  },
  settings: {
    node: "#6b7280",
    hot: "#f3f4f6",
    line: "#374151",
    glow: "#9ca3af",
    aura: "#4b5563"
  },
  studio: {
    node: "#a855f7",
    hot: "#f3e8ff",
    line: "#6b21a8",
    glow: "#c084fc",
    aura: "#9333ea"
  },
  vault: {
    node: "#78716c",
    hot: "#f5f5f4",
    line: "#44403c",
    glow: "#a8a29e",
    aura: "#57534e"
  },
  echo: {
    node: "#0ea5e9",
    hot: "#e0f2fe",
    line: "#0369a1",
    glow: "#38bdf8",
    aura: "#0284c7"
  },
  home: {
    node: "#84cc16",
    hot: "#ecfccb",
    line: "#3f6212",
    glow: "#a3e635",
    aura: "#65a30d"
  },
  dashboard: {
    node: "#3b82f6",
    hot: "#dbeafe",
    line: "#1e40af",
    glow: "#60a5fa",
    aura: "#2563eb"
  },
  google: {
    node: "#4285f4",
    hot: "#dbeafe",
    line: "#1d4ed8",
    glow: "#60a5fa",
    aura: "#1d4ed8"
  },
  'api-dashboard': {
    node: "#8b5cf6",
    hot: "#ede9fe",
    line: "#5b21b6",
    glow: "#a78bfa",
    aura: "#7c3aed"
  }
};

export const DEFAULT_COMMAND = COMMANDS[0];

export const LOBE_CENTERS: LobeCenter = {
  speech: [0.05, -0.12, 0.58],
  memory: [-0.38, 0.16, -0.15],
  reasoning: [0.18, 0.24, 0.1],
  tools: [0.46, -0.06, -0.1],
  perception: [-0.12, -0.18, 0.28]
};

const lobeNames = Object.keys(LOBE_CENTERS) as LobeName[];

// ============================================
// Polymorphic Shape Targets
// ============================================

const generateHeartPoints = (count: number): Float32Array => {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const t = (i / count) * 2 * Math.PI;
    const scale = 0.5;
    const x = scale * 16 * Math.pow(Math.sin(t), 3);
    const y = scale * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    const z = (Math.random() - 0.5) * 0.1;
    positions[i * 3] = x / 20;
    positions[i * 3 + 1] = y / 20;
    positions[i * 3 + 2] = z;
  }
  return positions;
};

const generateSmilePoints = (count: number): Float32Array => {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    const scale = 0.6;
    const x = scale * Math.cos(t) * 0.8;
    const y = scale * (Math.sin(t) * 0.6 + 0.3);
    const z = (Math.random() - 0.5) * 0.08;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }
  return positions;
};

const generateNeutralPoints = (count: number): Float32Array => {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = (i / count) * Math.PI * 2;
    const phi = Math.acos(2 * (i / count) - 1);
    const radius = 0.5;
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.sin(theta) * 0.7;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }
  return positions;
};

export const morphTargets: Record<MorphTargetName, (count: number) => Float32Array> = {
  heart: generateHeartPoints,
  smile: generateSmilePoints,
  neutral: generateNeutralPoints
};

const classifyNodeLobe = (x: number, y: number, z: number): LobeName => {
  let best: LobeName = "reasoning";
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const lobe of lobeNames) {
    const [cx, cy, cz] = LOBE_CENTERS[lobe];
    const dx = x - cx;
    const dy = y - cy;
    const dz = z - cz;
    const distance = dx * dx + dy * dy + dz * dz;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = lobe;
    }
  }

  return best;
};

export const createNeuralGraph = (
  nodeCount = 140,
  seed = 7,
  morphFactor = 0.0,
  morphTargetName: MorphTargetName | null = null,
  paletteName: PaletteName = "idle"
): NeuralGraph => {
  const random = rand(seed);
  const basePositions = new Float32Array(nodeCount * 3);
  const vectors: { x: number; y: number; z: number }[] = [];
  const nodeLobes: LobeName[] = [];
  const lobeNodeIndices: Record<LobeName, number[]> = {
    speech: [],
    memory: [],
    reasoning: [],
    tools: [],
    perception: []
  };

  for (let i = 0; i < nodeCount; i += 1) {
    const hemisphereBias = i % 2 === 0 ? -1 : 1;
    const u = random();
    const v = random();
    const theta = u * Math.PI * 2;
    const phi = Math.acos(2 * v - 1);
    const radius = 0.38 + random() * 0.48;

    const x =
      Math.sin(phi) * Math.cos(theta) * radius * 1.15 +
      hemisphereBias * 0.16 +
      (random() - 0.5) * 0.08;
    const y =
      Math.cos(phi) * radius * 0.9 +
      Math.sin(theta * 3) * 0.06 +
      (random() - 0.5) * 0.06;
    const z =
      Math.sin(phi) * Math.sin(theta) * radius * 0.8 +
      Math.cos(phi * 2) * 0.05;

    basePositions[i * 3] = x;
    basePositions[i * 3 + 1] = y;
    basePositions[i * 3 + 2] = z;
    vectors.push({ x, y, z });

    const lobe = classifyNodeLobe(x, y, z);
    nodeLobes.push(lobe);
    lobeNodeIndices[lobe].push(i);
  }

  const lobeAnchors = lobeNames.reduce(
    (accumulator, lobe) => {
      const [cx, cy, cz] = LOBE_CENTERS[lobe];
      let bestIndex = lobeNodeIndices[lobe][0] ?? 0;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const nodeIndex of lobeNodeIndices[lobe]) {
        const offset = nodeIndex * 3;
        const dx = basePositions[offset] - cx;
        const dy = basePositions[offset + 1] - cy;
        const dz = basePositions[offset + 2] - cz;
        const distance = dx * dx + dy * dy + dz * dz;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = nodeIndex;
        }
      }

      accumulator[lobe] = bestIndex;
      return accumulator;
    },
    {} as Record<LobeName, number>
  );

  const edgePairs: number[] = [];
  const edgeLobes: LobeName[][] = [];
  const adjacency = Array.from({ length: nodeCount }, () => [] as number[]);
  const edgeIndexByPair: Record<string, number> = {};

  for (let i = 0; i < vectors.length; i += 1) {
    const scored: { index: number; distance: number }[] = [];

    for (let j = 0; j < vectors.length; j += 1) {
      if (i === j) continue;
      const dx = vectors[i].x - vectors[j].x;
      const dy = vectors[i].y - vectors[j].y;
      const dz = vectors[i].z - vectors[j].z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (distance < 0.4) {
        scored.push({ index: j, distance });
      }
    }

    scored
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 4)
      .forEach(({ index }) => {
        if (i < index) {
          const edgeIndex = edgePairs.length / 2;
          edgePairs.push(i, index);
          const edgeNodes = [nodeLobes[i], nodeLobes[index]];
          const uniqueLobes = Array.from(new Set(edgeNodes));
          edgeLobes.push(uniqueLobes);
          adjacency[i].push(index);
          adjacency[index].push(i);
          edgeIndexByPair[`${i}:${index}`] = edgeIndex;
          edgeIndexByPair[`${index}:${i}`] = edgeIndex;
        }
      });
  }

  // Interpolate positions toward morph target if specified
  const positions = new Float32Array(basePositions);
  if (morphTargetName && morphFactor > 0) {
    const targetGen = morphTargets[morphTargetName];
    const targetPositions = targetGen(nodeCount);
    for (let i = 0; i < nodeCount * 3; i++) {
      positions[i] = lerp(basePositions[i], targetPositions[i], morphFactor);
    }
  }

  return {
    positions,
    basePositions,
    targetPositions: new Float32Array(nodeCount * 3),
    nodeCount,
    edges: Uint16Array.from(edgePairs),
    edgeCount: edgePairs.length / 2,
    nodeLobes,
    lobeNodeIndices,
    edgeLobes,
    adjacency,
    edgeIndexByPair,
    lobeAnchors,
    morphFactor,
    currentMorphTarget: morphTargetName
  };
};

// ============================================
// Signal Mapping: pulseEvent triggers shape shifts
// ============================================

export const getMorphTargetForMode = (mode: BrainMode): MorphTargetName | null => {
  switch (mode) {
    case "excited":
      return "heart";
    case "idle":
    case "compact":
      return "neutral";
    case "speak":
    case "expanded":
      return "smile";
    default:
      return null;
  }
};

export const getMorphFactorForMode = (mode: BrainMode): number => {
  switch (mode) {
    case "excited":
      return 1.0;
    case "idle":
      return 0.0;
    case "speak":
      return 0.7;
    case "compact":
      return 0.2;
    case "expanded":
      return 0.5;
    default:
      return 0.0;
  }
};

export const pulseEvent = (
  graph: NeuralGraph,
  mode: BrainMode,
  smoothFactor = 0.1
): NeuralGraph => {
  const targetMorphName = getMorphTargetForMode(mode);
  const targetMorphFactor = getMorphFactorForMode(mode);

  if (!targetMorphName) {
    return graph;
  }

  // Interpolate morph factor smoothly
  const newMorphFactor = lerp(graph.morphFactor, targetMorphFactor, smoothFactor);

  // Generate target positions
  const targetGen = morphTargets[targetMorphName];
  const targetPositions = targetGen(graph.nodeCount);

  // Interpolate each node position
  for (let i = 0; i < graph.nodeCount * 3; i++) {
    graph.positions[i] = lerp(graph.basePositions[i], targetPositions[i], newMorphFactor);
  }

  graph.morphFactor = newMorphFactor;
  graph.currentMorphTarget = targetMorphName;

  return graph;
};

export const lerp = (from: number, to: number, alpha: number) =>
  from + (to - from) * alpha;

export const ease = (value: number) => 1 - Math.pow(1 - value, 3);
