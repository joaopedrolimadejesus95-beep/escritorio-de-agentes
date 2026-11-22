import { useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Grid, Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
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

    const x = THREE.MathUtils.lerp(fromPos[0], toPos[0], progress);
    const z = THREE.MathUtils.lerp(fromPos[2], toPos[2], progress);
    const arcHeight = Math.sin(progress * Math.PI) * 2.5;
    const y = 1.2 + arcHeight;

    meshRef.current.position.set(x, y, z);
    meshRef.current.rotation.y += 0.08;
    meshRef.current.rotation.x += 0.05;
  });

  return (
    <mesh ref={meshRef} castShadow>
      <dodecahedronGeometry args={[0.26, 0]} />
      <meshStandardMaterial
        color="#38bdf8"
        emissive="#38bdf8"
        emissiveIntensity={1.5}
      />
      <Html center>
        <div
          style={{
            background: 'rgba(9, 13, 20, 0.92)',
            border: '1px solid #38bdf8',
            color: '#e0f2fe',
            fontWeight: 600,
            fontSize: '10px',
            padding: '3px 8px',
            borderRadius: '999px',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 14px rgba(56, 189, 248, 0.35)',
          }}
        >
          Handoff: {handoff.artifactName}
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
              position={[midX, 0.012, midZ]}
              rotation={[0, angleY, 0]}
            >
              <boxGeometry args={[0.05, 0.008, length]} />
              <meshStandardMaterial color="#1e293b" />
            </mesh>
          );
        })}
    </group>
  );
}

/**
 * Controlador suave de câmera isométrica:
 * Ao clicar em um agente, desloca suavemente o foco do OrbitControls para a mesa selecionada,
 * sem travar o movimento manual do usuário.
 */
function SmoothCameraRig() {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const selectedDepartment = useOfficeStore((s) => s.selectedDepartment);
  const targetVecRef = useRef(new THREE.Vector3(0, 0, 0));
  const isTransitioningRef = useRef(false);
  const { camera } = useThree();

  useEffect(() => {
    if (selectedDepartment) {
      const pos = DEPARTMENT_DESKS[selectedDepartment].position;
      // No ângulo isométrico (+X, +Y, +Z), +X/-Z desloca o alvo para a direita da tela,
      // centralizando o agente selecionado na área livre à esquerda do Drawer lateral.
      targetVecRef.current.set(pos[0] + 4.0, 0.5, pos[2] - 4.0);
    } else {
      targetVecRef.current.set(0, 0, 0);
    }
    isTransitioningRef.current = true;
  }, [selectedDepartment]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls || !isTransitioningRef.current) return;

    const alpha = 1 - Math.exp(-delta * 6);
    controls.target.lerp(targetVecRef.current, alpha);
    controls.update();

    if (controls.target.distanceTo(targetVecRef.current) < 0.04) {
      isTransitioningRef.current = false;
    }

    // Garante que o zoom permaneça suave no foco
    if (camera instanceof THREE.OrthographicCamera) {
      const targetZoom = selectedDepartment ? 44 : 36;
      if (Math.abs(camera.zoom - targetZoom) > 0.1) {
        camera.zoom = THREE.MathUtils.lerp(camera.zoom, targetZoom, alpha * 0.7);
        camera.updateProjectionMatrix();
      }
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enableRotate
      enablePan
      enableZoom
      minZoom={22}
      maxZoom={75}
      minPolarAngle={Math.PI / 5}
      maxPolarAngle={Math.PI / 2.5}
      minAzimuthAngle={-Math.PI / 4}
      maxAzimuthAngle={Math.PI / 2}
      onStart={() => {
        // Se o usuário começar a arrastar/orbitar, cancela a transição automática imediatamente
        isTransitioningRef.current = false;
      }}
    />
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
        position: [18, 16, 18],
        zoom: 36,
        near: -100,
        far: 200,
      }}
      onPointerMissed={() => selectDepartment(null)}
    >
      <color attach="background" args={['#070a10']} />

      <ambientLight intensity={0.7} />
      <directionalLight
        castShadow
        position={[14, 24, 12]}
        intensity={1.3}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
      />
      <pointLight position={[0, 8, 0]} intensity={0.35} color="#38bdf8" />

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[32, 26]} />
        <meshStandardMaterial color="#0b101b" roughness={0.92} />
      </mesh>

      <Grid
        position={[0, 0.01, 0]}
        args={[32, 26]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#151e2e"
        sectionSize={4}
        sectionThickness={1}
        sectionColor="#1e293b"
        fadeDistance={40}
      />

      <DagFloorConnections />

      {desks.map((config) => (
        <AgentDesk key={config.department} config={config} />
      ))}

      <HandoffManager />
      <SmoothCameraRig />
    </Canvas>
  );
}
