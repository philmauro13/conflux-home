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

export type NeuralGraph = {
  positions: Float32Array;
  nodeCount: number;
  edges: Uint16Array;
  edgeCount: number;
  nodeLobes: LobeName[];
  lobeNodeIndices: Record<LobeName, number[]>;
  edgeLobes: LobeName[][];
  adjacency: number[][];
  edgeIndexByPair: Record<string, number>;
  lobeAnchors: Record<LobeName, number>;
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
      node: "#7af0ff",
      hot: "#f5ffff",
      line: "#164f69",
      glow: "#9bfaff",
      aura: "#2c7f7c"
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
    glowBoost: 1.25,
    pulseRate: 1.5,
    scale: 0.95,
    turbulence: 0.06,
    palette: {
      node: "#69b4ff",
      hot: "#ffffff",
      line: "#1f437b",
      glow: "#7ab7ff",
      aura: "#1b2f7c"
    },
    driftAxis: [0.08, -0.12, 0.03],
    wobble: 0.05,
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

export const DEFAULT_COMMAND = COMMANDS[0];

export const LOBE_CENTERS: LobeCenter = {
  speech: [0.05, -0.12, 0.58],
  memory: [-0.38, 0.16, -0.15],
  reasoning: [0.18, 0.24, 0.1],
  tools: [0.46, -0.06, -0.1],
  perception: [-0.12, -0.18, 0.28]
};

const lobeNames = Object.keys(LOBE_CENTERS) as LobeName[];

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
  seed = 7
): NeuralGraph => {
  const random = rand(seed);
  const positions = new Float32Array(nodeCount * 3);
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

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
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
        const dx = positions[offset] - cx;
        const dy = positions[offset + 1] - cy;
        const dz = positions[offset + 2] - cz;
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

  return {
    positions,
    nodeCount,
    edges: Uint16Array.from(edgePairs),
    edgeCount: edgePairs.length / 2,
    nodeLobes,
    lobeNodeIndices,
    edgeLobes,
    adjacency,
    edgeIndexByPair,
    lobeAnchors
  };
};

export const lerp = (from: number, to: number, alpha: number) =>
  from + (to - from) * alpha;

export const ease = (value: number) => 1 - Math.pow(1 - value, 3);
