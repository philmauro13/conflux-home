import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  BrainCommand,
  DEFAULT_COMMAND,
  LobeName,
  PulseEventDetail,
  createNeuralGraph,
  ease,
  lerp
} from "../lib/neuralBrain";

type Pulse = {
  pathEdges: number[];
  progress: number;
  speed: number;
  strength: number;
  lobes: LobeName[];
};

type NeuralBrainSceneProps = {
  command?: BrainCommand;
  pulseImpulse: number;
  pulseEvent?: PulseEventDetail & { id: number };
  transparent?: boolean;
};

const lobeTint: Record<LobeName, string> = {
  speech: "#ffb35f",
  memory: "#85a9ff",
  reasoning: "#8dfbff",
  tools: "#ff71d1",
  perception: "#75ffd2"
};

function SpeechRings({
  command,
  pulseImpulse
}: {
  command: BrainCommand;
  pulseImpulse: number;
}) {
  const ringRefs = useRef<(THREE.Mesh | null)[]>([]);

  useFrame((state) => {
    const elapsed = state.clock.elapsedTime;
    ringRefs.current.forEach((ring, index) => {
      if (!ring) return;
      const material = ring.material as THREE.MeshBasicMaterial;
      const phase =
        (elapsed * (0.45 + command.speechRingIntensity) + index * 0.22) % 1;
      const liveAmplitude =
        command.mode === "speak" ? 0.24 : 0.08 + command.speechRingIntensity * 0.16;
      const scale =
        0.5 + phase * (0.62 + liveAmplitude * 0.24) + Math.min(pulseImpulse, 36) * 0.0016;
      const opacity = Math.max(
        0,
        (1 - phase) * (0.012 + command.speechRingIntensity * 0.18)
      );

      ring.scale.setScalar(scale);
      ring.position.z = 0.35 + index * 0.05;
      material.opacity = opacity;
      material.color.set(command.palette.glow);
    });
  });

  return (
    <group position={[0.03, -0.04, 0.08]} rotation={[Math.PI / 2.95, 0, 0]}>
      {[0, 1, 2].map((index) => (
        <mesh
          key={index}
          ref={(element) => {
            ringRefs.current[index] = element;
          }}
        >
          <torusGeometry args={[0.48, 0.007, 8, 56]} />
          <meshBasicMaterial
            color={command.palette.glow}
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function NeuralBrain({ command: commandProp, pulseImpulse, pulseEvent }: NeuralBrainSceneProps) {
  const command = commandProp ?? DEFAULT_COMMAND;
  const groupRef = useRef<THREE.Group>(null);
  const nodeMeshRef = useRef<THREE.InstancedMesh>(null);
  const lineRef = useRef<THREE.LineSegments>(null);
  const glowRef = useRef<THREE.LineSegments>(null);
  const graph = useMemo(() => createNeuralGraph(), []);
  const pulsesRef = useRef<Pulse[]>([]);
  const linePositions = useMemo(
    () => new Float32Array(graph.edgeCount * 2 * 3),
    [graph.edgeCount]
  );
  const lineColors = useMemo(
    () => new Float32Array(graph.edgeCount * 2 * 3),
    [graph.edgeCount]
  );
  const glowPositions = useMemo(
    () => new Float32Array(graph.edgeCount * 2 * 3),
    [graph.edgeCount]
  );
  const glowColors = useMemo(
    () => new Float32Array(graph.edgeCount * 2 * 3),
    [graph.edgeCount]
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const [viewportScale, setViewportScale] = useState(1);

  const getEligibleEdges = (lobes?: LobeName[], edgeIndex?: number) => {
    if (typeof edgeIndex === "number" && edgeIndex >= 0 && edgeIndex < graph.edgeCount) {
      return [edgeIndex];
    }

    if (!lobes || lobes.length === 0) {
      return graph.edgeLobes.map((_, index) => index);
    }

    return graph.edgeLobes
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.some((lobe) => lobes.includes(lobe)))
      .map(({ index }) => index);
  };

  const getEdgeEndpoints = (edgeIndex: number) => [
    graph.edges[edgeIndex * 2],
    graph.edges[edgeIndex * 2 + 1]
  ];

  const findNodePath = (start: number, goal: number) => {
    if (start === goal) return [start];

    const queue = [start];
    const visited = new Set([start]);
    const previous = new Map<number, number>();

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      if (current === goal) break;

      for (const neighbor of graph.adjacency[current]) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        previous.set(neighbor, current);
        queue.push(neighbor);
      }
    }

    if (!visited.has(goal)) return [start, goal];

    const path: number[] = [goal];
    let cursor = goal;
    while (cursor !== start) {
      const prev = previous.get(cursor);
      if (prev === undefined) break;
      path.unshift(prev);
      cursor = prev;
    }
    return path;
  };

  const nodePathToEdgePath = (nodePath: number[]) => {
    const edgePath: number[] = [];
    for (let i = 0; i < nodePath.length - 1; i += 1) {
      const edgeIndex = graph.edgeIndexByPair[`${nodePath[i]}:${nodePath[i + 1]}`];
      if (edgeIndex !== undefined) {
        edgePath.push(edgeIndex);
      }
    }
    return edgePath;
  };

  const buildRouteEdgePath = (route: LobeName[]) => {
    const sanitizedRoute = route.length > 0 ? route : command.activeLobes;
    const combined: number[] = [];

    for (let i = 0; i < sanitizedRoute.length - 1; i += 1) {
      const startNode = graph.lobeAnchors[sanitizedRoute[i]];
      const endNode = graph.lobeAnchors[sanitizedRoute[i + 1]];
      const nodePath = findNodePath(startNode, endNode);
      const edgePath = nodePathToEdgePath(nodePath);

      if (
        combined.length > 0 &&
        edgePath.length > 0 &&
        combined[combined.length - 1] === edgePath[0]
      ) {
        combined.push(...edgePath.slice(1));
      } else {
        combined.push(...edgePath);
      }
    }

    if (combined.length > 0) return combined;
    return getEligibleEdges(sanitizedRoute).slice(0, Math.max(1, sanitizedRoute.length));
  };

  const injectPulseBurst = (
    lobes: LobeName[],
    strength: number,
    bursts: number,
    edgeIndex?: number
  ) => {
    const eligibleEdges = getEligibleEdges(lobes, edgeIndex);

    for (let i = 0; i < bursts; i += 1) {
      const selected =
        eligibleEdges[Math.floor(Math.random() * eligibleEdges.length)] ??
        Math.floor(Math.random() * graph.edgeCount);
      pulsesRef.current.push({
        pathEdges: [selected],
        progress: Math.random() * 0.08,
        speed: 0.42 + Math.random() * 0.78 * Math.max(1, command.pulseRate),
        strength,
        lobes
      });
    }
  };

  const injectRoutePulse = (route: LobeName[], strength: number, bursts = 3) => {
    const edgePath = buildRouteEdgePath(route);
    if (edgePath.length === 0) return;

    for (let i = 0; i < bursts; i += 1) {
      pulsesRef.current.push({
        pathEdges: edgePath,
        progress: -i * 0.22,
        speed: 0.55 + Math.random() * 0.45 * Math.max(1, command.pulseRate),
        strength: strength * (1 - i * 0.08),
        lobes: route
      });
    }
  };

  useEffect(() => {
    const updateScale = () => {
      setViewportScale(window.innerWidth < 720 ? 0.84 : 1);
    };
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  useEffect(() => {
    const geometry = lineRef.current?.geometry;
    if (!geometry) return;

    for (let edgeIndex = 0; edgeIndex < graph.edgeCount; edgeIndex += 1) {
      const a = graph.edges[edgeIndex * 2];
      const b = graph.edges[edgeIndex * 2 + 1];
      const sourceOffset = a * 3;
      const targetOffset = b * 3;
      const lineOffset = edgeIndex * 6;

      linePositions[lineOffset] = graph.positions[sourceOffset];
      linePositions[lineOffset + 1] = graph.positions[sourceOffset + 1];
      linePositions[lineOffset + 2] = graph.positions[sourceOffset + 2];
      linePositions[lineOffset + 3] = graph.positions[targetOffset];
      linePositions[lineOffset + 4] = graph.positions[targetOffset + 1];
      linePositions[lineOffset + 5] = graph.positions[targetOffset + 2];
      glowPositions[lineOffset] = linePositions[lineOffset];
      glowPositions[lineOffset + 1] = linePositions[lineOffset + 1];
      glowPositions[lineOffset + 2] = linePositions[lineOffset + 2];
      glowPositions[lineOffset + 3] = linePositions[lineOffset + 3];
      glowPositions[lineOffset + 4] = linePositions[lineOffset + 4];
      glowPositions[lineOffset + 5] = linePositions[lineOffset + 5];
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(lineColors, 3));

    const glowGeometry = glowRef.current?.geometry;
    glowGeometry?.setAttribute("position", new THREE.BufferAttribute(glowPositions, 3));
    glowGeometry?.setAttribute("color", new THREE.BufferAttribute(glowColors, 3));
  }, [glowColors, glowPositions, graph, lineColors, linePositions]);

  useEffect(() => {
    const pulseBurst = 3 + Math.round(command.glowBoost * 1.2 + pulseImpulse * 0.03);
    injectPulseBurst(
      command.activeLobes,
      0.75 + Math.random() * (command.glowBoost * 0.7 + pulseImpulse * 0.006),
      pulseBurst
    );
  }, [command, pulseImpulse]);

  useEffect(() => {
    if (!pulseEvent) return;

    if (pulseEvent.route && pulseEvent.route.length >= 2) {
      injectRoutePulse(
        pulseEvent.route,
        pulseEvent.strength ?? 2.1,
        pulseEvent.bursts ?? 4
      );
      return;
    }

    const lobes = pulseEvent.lobes ?? (pulseEvent.lobe ? [pulseEvent.lobe] : command.activeLobes);
    injectPulseBurst(
      lobes,
      pulseEvent.strength ?? 1.8,
      pulseEvent.bursts ?? 7,
      pulseEvent.edgeIndex
    );
  }, [pulseEvent, command.activeLobes]);

  useFrame((state, delta) => {
    const elapsed = state.clock.elapsedTime;
    const safeDelta = Math.min(delta, 0.033);
    const mesh = nodeMeshRef.current;
    const lines = lineRef.current;
    const glowLines = glowRef.current;
    const group = groupRef.current;
    if (!mesh || !lines || !glowLines || !group) return;

    // Cap target scale to prevent runaway growth from rapid mode switching.
    // command.scale is in range ~[0.76–1.34]; pulseImpulse adds ≤0.06 on top.
    // Upper bound of 2.0 gives plenty of headroom while preventing infinite blow-up.
    const MAX_SCALE = 2.0;
    const targetScale = Math.min(command.scale, MAX_SCALE) * viewportScale;
    const axis = command.driftAxis;

    group.rotation.y = lerp(
      group.rotation.y,
      Math.sin(elapsed * (0.28 + Math.abs(axis[1]))) * axis[0] * 0.72,
      0.035
    );
    group.rotation.x = lerp(
      group.rotation.x,
      Math.cos(elapsed * (0.24 + Math.abs(axis[0]))) * axis[1] * 0.62,
      0.035
    );
    group.rotation.z = lerp(
      group.rotation.z,
      Math.sin(elapsed * (0.18 + Math.abs(axis[2])) + 0.8) * axis[2] * 0.6,
      0.035
    );
    group.position.y = Math.sin(elapsed * 0.92) * (0.015 + command.wobble * 0.03);
    group.position.x = Math.cos(elapsed * 0.63) * axis[0] * 0.05;
    // Clamp lerp: only catch UP to target, never exceed it.
    // This prevents the fairy from growing unboundedly when mode targets keep changing
    // before the previous scale target was fully reached.
    group.scale.x = lerp(group.scale.x, Math.min(group.scale.x, targetScale), 0.07);
    group.scale.y = lerp(group.scale.y, Math.min(group.scale.y, targetScale), 0.07);
    group.scale.z = lerp(group.scale.z, Math.min(group.scale.z, targetScale), 0.07);

    if (Math.random() < 0.02 * command.pulseRate) {
      const route: LobeName[] =
        command.mode === "speak"
          ? ["memory", "reasoning", "speech"]
          : command.mode === "listen"
            ? ["perception", "reasoning", "speech"]
            : [
                command.activeLobes[0] ?? "reasoning",
                command.activeLobes[command.activeLobes.length - 1] ?? "speech"
              ];
      injectRoutePulse(route, 0.95 + Math.random() * command.glowBoost * 0.45, 1);
    }

    pulsesRef.current = pulsesRef.current
      .map((pulse) => ({
        ...pulse,
        progress: pulse.progress + safeDelta * pulse.speed
      }))
      .filter((pulse) => pulse.progress < pulse.pathEdges.length + 0.25);

    const pulseIntensity = new Float32Array(graph.edgeCount);
    const nodeIntensity = new Float32Array(graph.nodeCount);
    const edgeActivation = new Float32Array(graph.edgeCount);

    for (const pulse of pulsesRef.current) {
      pulse.pathEdges.forEach((edgeIndex, pathIndex) => {
        const distance = Math.abs(pulse.progress - pathIndex);
        const envelope = Math.max(0, 1 - distance / 0.9);
        if (envelope <= 0) return;
        const intensity = envelope * pulse.strength;
        pulseIntensity[edgeIndex] += intensity;
        edgeActivation[edgeIndex] += intensity;

        const [a, b] = getEdgeEndpoints(edgeIndex);
        nodeIntensity[a] += intensity * 1.1;
        nodeIntensity[b] += intensity * 1.1;
      });
    }

    const baseNodeColor = new THREE.Color(command.palette.node);
    const hotNodeColor = new THREE.Color(command.palette.hot);
    const lineBaseColor = new THREE.Color(command.palette.line);
    const lineGlowColor = new THREE.Color(command.palette.glow);
    const baseRadius = 0.011 + command.glowBoost * 0.0018;

    for (let i = 0; i < graph.nodeCount; i += 1) {
      const offset = i * 3;
      const x = graph.positions[offset];
      const y = graph.positions[offset + 1];
      const z = graph.positions[offset + 2];
      const lobe = graph.nodeLobes[i];
      const lobeActive = command.activeLobes.includes(lobe);
      const lobeBias = lobeActive ? 1.04 : 0.985;
      const pulseHeat = Math.min(1, nodeIntensity[i] * 0.38);
      const ripple =
        Math.sin(elapsed * (1 + command.pulseRate * 0.35) + i * 0.37) *
        command.turbulence *
        0.03;
      const flutter =
        command.mode === "excited"
          ? Math.cos(elapsed * 3 + i * 0.5) * 0.014
          : 0;
      const forwardBreath =
        command.mode === "speak" && lobe === "speech"
          ? Math.sin(elapsed * 4 + i * 0.18) * 0.026
          : 0;

      const anchoredX = x * command.lobeSpread * lobeBias;
      const anchoredY = y * (1 + command.wobble * 0.06);
      const anchoredZ = z;

      dummy.position.set(
        anchoredX + ripple * 0.65,
        anchoredY + ripple + flutter,
        anchoredZ +
          Math.cos(elapsed + x * 7) * command.turbulence * 0.015 +
          forwardBreath +
          pulseHeat * 0.015
      );

      const scaleJitter =
        1 +
        Math.sin(elapsed * (1.8 + command.pulseRate * 0.18) + i * 0.6) * 0.08 +
        (lobeActive ? 0.05 : 0) +
        pulseHeat * 0.42;
      dummy.scale.setScalar(baseRadius * scaleJitter);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const tint = new THREE.Color(lobeTint[lobe]);
      const nodeHeat =
        0.35 +
        0.65 * Math.sin(elapsed * (1.55 + command.pulseRate * 0.18) + i * 0.25);
      const nodeColor = baseNodeColor
        .clone()
        .lerp(tint, lobeActive ? 0.42 : 0.2)
        .lerp(lineGlowColor, pulseHeat * 0.92)
        .lerp(hotNodeColor, ease(Math.max(0, nodeHeat)) * (0.52 + pulseHeat * 0.44));
      mesh.setColorAt(i, nodeColor);
    }

    const colors = lines.geometry.getAttribute("color") as THREE.BufferAttribute;
    const glowAttrs = glowLines.geometry.getAttribute("color") as THREE.BufferAttribute;
    for (let edgeIndex = 0; edgeIndex < graph.edgeCount; edgeIndex += 1) {
      const edgeLobes = graph.edgeLobes[edgeIndex];
      const activeEdge = edgeLobes.some((lobe) => command.activeLobes.includes(lobe));
      const lobeTintColor = new THREE.Color(
        activeEdge ? lobeTint[edgeLobes[0]] : command.palette.glow
      );
      const pulseHeat = Math.min(1, pulseIntensity[edgeIndex] * 0.3);
      const intensity = Math.min(
        1,
        0.07 +
          (activeEdge ? 0.22 : 0.04) +
          pulseIntensity[edgeIndex] * 0.86 +
          command.glowBoost * 0.08 +
          (command.mode === "speak" ? 0.06 : 0)
      );
      const edgeColor = lineBaseColor
        .clone()
        .lerp(lobeTintColor, activeEdge ? 0.56 : 0.16)
        .lerp(lineGlowColor, intensity)
        .lerp(new THREE.Color("#ffffff"), pulseHeat * 0.2)
        .multiplyScalar(0.92 + intensity * 1.7);

      colors.setXYZ(edgeIndex * 2, edgeColor.r, edgeColor.g, edgeColor.b);
      colors.setXYZ(edgeIndex * 2 + 1, edgeColor.r, edgeColor.g, edgeColor.b);

      const glowStrength = Math.min(1, edgeActivation[edgeIndex] * 0.18);
      const glowColor = lobeTintColor
        .clone()
        .lerp(new THREE.Color("#ffffff"), glowStrength * 0.14)
        .multiplyScalar(glowStrength * 1.2);
      glowAttrs.setXYZ(edgeIndex * 2, glowColor.r, glowColor.g, glowColor.b);
      glowAttrs.setXYZ(edgeIndex * 2 + 1, glowColor.r, glowColor.g, glowColor.b);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    colors.needsUpdate = true;
    glowAttrs.needsUpdate = true;
  });

  return (
    <group ref={groupRef} scale={1}>
      <SpeechRings command={command} pulseImpulse={pulseImpulse} />
      <lineSegments ref={lineRef}>
        <bufferGeometry />
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={0.92}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>
      <lineSegments ref={glowRef}>
        <bufferGeometry />
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={0.22}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>
      <instancedMesh ref={nodeMeshRef} args={[undefined, undefined, graph.nodeCount]}>
        <sphereGeometry args={[1, 10, 10]} />
        <meshBasicMaterial
          toneMapped={false}
          transparent
          opacity={0.99}
          blending={THREE.AdditiveBlending}
        />
      </instancedMesh>
    </group>
  );
}

export function NeuralBrainScene({
  command,
  pulseImpulse,
  pulseEvent,
  transparent = true
}: NeuralBrainSceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 0.12, 3.15], fov: 38 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
    >
      {!transparent ? <color attach="background" args={["#020712"]} /> : null}
      <ambientLight intensity={0.16} />
      <pointLight position={[0, 0, 3]} intensity={12} color="#d7f9ff" />
      <pointLight position={[1.8, 1.4, 1.8]} intensity={6} color="#7cd6ff" />
      <pointLight position={[-2.2, -0.5, -1.2]} intensity={3} color="#4326a6" />
      <NeuralBrain
        command={command}
        pulseImpulse={pulseImpulse}
        pulseEvent={pulseEvent}
        transparent={transparent}
      />
    </Canvas>
  );
}
