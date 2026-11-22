import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Grid, Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import {
  AgentDesk,
  DEPARTMENT_DESKS,
  type DepartmentDeskConfig,
} from './AgentDesk.js';
import {
  useOfficeStore,
  type ActiveHandoffAnimation,
} from '../store/useOfficeStore.js';

function HandoffCourierOrb({ handoff }: { handoff: ActiveHandoffAnimation }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const fromPos = DEPARTMENT_DESKS[handoff.fromDepartment].position;
  const toPos = DEPARTMENT_DESKS[handoff.toDepartment].position;

  useFrame(() => {
    if (!meshRef.current) return;
    const elapsed = performance.now() - handoff.startedAt;
    const progress = Math.min(1, Math.max(0, elapsed / handoff.durationMs));

    // Interpolação parabólica suave entre a mesa de origem e a mesa de destino
    const x = THREE.MathUtils.lerp(fromPos[0], toPos[0], progress);
    const z = THREE.MathUtils.lerp(fromPos[2], toPos[2], progress);
    const arcHeight = Math.sin(progress * Math.PI) * 2.4;
    const y = 1.2 + arcHeight;

    meshRef.current.position.set(x, y, z);
    meshRef.current.rotation.y += 0.08;
    meshRef.current.rotation.x += 0.05;
  });

  return (
    <mesh ref={meshRef} castShadow>
      <dodecahedronGeometry args={[0.28, 0]} />
      <meshStandardMaterial
        color="#38bdf8"
        emissive="#38bdf8"
        emissiveIntensity={1.6}
      />
      <Html center>
        <div
          style={{
            background: 'rgba(14, 165, 233, 0.92)',
            color: '#082f49',
            fontWeight: 800,
            fontSize: '10px',
            padding: '3px 7px',
            borderRadius: '999px',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(56, 189, 248, 0.5)',
          }}
        >
          📦 {handoff.artifactName}
        </div>
      </Html>
    </mesh>
  );
}

function HandoffManager() {
  const activeHandoffs = useOfficeStore((s) => s.activeHandoffs);
  const pruneExpiredHandoffs = useOfficeStore((s) => s.pruneExpiredHandoffs);

  useFrame(() => {
    pruneExpiredHandoffs(performance.now());
  });

  return (
    <group>
      {activeHandoffs.map((h) => (
        <HandoffCourierOrb key={h.id} handoff={h} />
      ))}
    </group>
  );
}

function DagFloorConnections() {
  const desks = Object.values(DEPARTMENT_DESKS);
  const directorPos = DEPARTMENT_DESKS.director.position;

  return (
    <group>
      {desks
        .filter((d) => d.department !== 'director')
        .map((desk) => {
          const dx = desk.position[0] - directorPos[0];
          const dz = desk.position[2] - directorPos[2];
          const length = Math.hypot(dx, dz);
          const midX = (directorPos[0] + desk.position[0]) / 2;
          const midZ = (directorPos[2] + desk.position[2]) / 2;
          const angleY = Math.atan2(dx, dz);

          return (
            <mesh
              key={desk.department}
              position={[midX, 0.015, midZ]}
              rotation={[0, angleY, 0]}
            >
              <boxGeometry args={[0.06, 0.01, length]} />
              <meshStandardMaterial color="#1e293b" />
            </mesh>
          );
        })}
    </group>
  );
}

export function OfficeScene() {
  const selectDepartment = useOfficeStore((s) => s.selectDepartment);
  const desks: DepartmentDeskConfig[] = Object.values(DEPARTMENT_DESKS);

  return (
    <Canvas
      orthographic
      shadows
      camera={{
        position: [16, 16, 16],
        zoom: 42,
        near: -100,
        far: 200,
      }}
      onPointerMissed={() => selectDepartment(null)}
    >
      <color attach="background" args={['#0b0f19']} />

      {/* Iluminação Isométrica */}
      <ambientLight intensity={0.65} />
      <directionalLight
        castShadow
        position={[12, 22, 10]}
        intensity={1.35}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
      />
      <pointLight position={[0, 6, 0]} intensity={0.4} color="#38bdf8" />

      {/* Piso do Escritório Virtual */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[26, 22]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} />
      </mesh>

      <Grid
        position={[0, 0.01, 0]}
        args={[26, 22]}
        cellSize={1}
        cellThickness={0.6}
        cellColor="#1e293b"
        sectionSize={4}
        sectionThickness={1.2}
        sectionColor="#334155"
        fadeDistance={35}
      />

      {/* Linhas de Conexão no Piso */}
      <DagFloorConnections />

      {/* Estações de Trabalho dos Departamentos */}
      {desks.map((config) => (
        <AgentDesk key={config.department} config={config} />
      ))}

      {/* Animação de Pacotes de Artefatos (ARTIFACT_HANDOFF) */}
      <HandoffManager />

      {/* Controles Isométricos Restritos */}
      <OrbitControls
        makeDefault
        enableRotate={true}
        enablePan={true}
        enableZoom={true}
        minZoom={24}
        maxZoom={85}
        minPolarAngle={Math.PI / 5}
        maxPolarAngle={Math.PI / 2.6}
        minAzimuthAngle={0}
        maxAzimuthAngle={Math.PI / 2}
      />
    </Canvas>
  );
}
