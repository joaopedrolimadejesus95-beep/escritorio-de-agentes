import { useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls, RoundedBox } from '@react-three/drei';
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
    const y = 1.3 + arcHeight;

    meshRef.current.position.set(x, y, z);
    meshRef.current.rotation.y += 0.08;
    meshRef.current.rotation.x += 0.05;
  });

  return (
    <mesh ref={meshRef} castShadow>
      <dodecahedronGeometry args={[0.25, 0]} />
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
              <boxGeometry args={[0.06, 0.008, length]} />
              <meshStandardMaterial color="#2c5364" />
            </mesh>
          );
        })}
    </group>
  );
}

/**
 * Diorama de Escritório Aconchegante (Paredes em L azul-petróleo suave, estante com livros,
 * planta de canto e luminária morna) para dar sensação real de estúdio acolhedor.
 */
function CozyStudioEnvironment() {
  return (
    <group>
      {/* Piso principal aconchegante azul-petróleo suave */}
      <RoundedBox
        args={[25, 0.25, 22]}
        radius={0.05}
        position={[0, -0.125, 0]}
        receiveShadow
      >
        <meshStandardMaterial color="#234d5c" roughness={0.85} />
      </RoundedBox>

      {/* Tapete central acolhedor sob a área dos agentes */}
      <RoundedBox
        args={[18, 0.02, 15]}
        radius={0.02}
        position={[0, 0.005, 0.5]}
        receiveShadow
      >
        <meshStandardMaterial color="#1b3c48" roughness={0.92} />
      </RoundedBox>

      {/* Parede Fundo (Z = -10.8) */}
      <mesh position={[0, 2.2, -10.8]} receiveShadow>
        <boxGeometry args={[25, 4.4, 0.3]} />
        <meshStandardMaterial color="#193b47" roughness={0.88} />
      </mesh>
      {/* Rodapé da parede fundo */}
      <mesh position={[0, 0.14, -10.63]}>
        <boxGeometry args={[24.8, 0.28, 0.06]} />
        <meshStandardMaterial color="#112932" roughness={0.8} />
      </mesh>

      {/* Parede Esquerda (X = -12.3) */}
      <mesh position={[-12.3, 2.2, 0]} receiveShadow>
        <boxGeometry args={[0.3, 4.4, 22]} />
        <meshStandardMaterial color="#1f4756" roughness={0.88} />
      </mesh>
      {/* Rodapé da parede esquerda */}
      <mesh position={[-12.13, 0.14, 0]}>
        <boxGeometry args={[0.06, 0.28, 21.8]} />
        <meshStandardMaterial color="#112932" roughness={0.8} />
      </mesh>

      {/* Quadro Kanban / Roadmap na parede do fundo */}
      <group position={[-4.5, 2.5, -10.6]}>
        <RoundedBox args={[3.4, 1.8, 0.08]} radius={0.03} castShadow>
          <meshStandardMaterial color="#0f242e" roughness={0.7} />
        </RoundedBox>
        <mesh position={[0, 0, 0.045]}>
          <planeGeometry args={[3.1, 1.5]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.5} />
        </mesh>
        {/* Notas no quadro */}
        {[
          [-0.95, 0.35, '#38bdf8'],
          [-0.95, -0.05, '#38bdf8'],
          [0, 0.35, '#fbbf24'],
          [0, -0.05, '#a855f7'],
          [0.95, 0.35, '#22c55e'],
        ].map(([x, y, col], i) => (
          <mesh key={i} position={[x as number, y as number, 0.055]}>
            <boxGeometry args={[0.6, 0.28, 0.015]} />
            <meshStandardMaterial color={col as string} />
          </mesh>
        ))}
      </group>

      {/* Estante de madeira quente com livros na parede esquerda */}
      <group position={[-11.5, 0, -6.2]}>
        <RoundedBox args={[0.9, 2.6, 2.4]} radius={0.03} position={[0, 1.3, 0]} castShadow>
          <meshStandardMaterial color="#b24d28" roughness={0.65} />
        </RoundedBox>
        {/* Nichos escuros */}
        {[0.6, 1.4, 2.1].map((y, idx) => (
          <mesh key={idx} position={[0.08, y, 0]}>
            <boxGeometry args={[0.8, 0.56, 2.1]} />
            <meshStandardMaterial color="#132530" roughness={0.8} />
          </mesh>
        ))}
        {/* Livros coloridos */}
        {[
          [0.12, 1.35, -0.6, '#38bdf8'],
          [0.12, 1.35, -0.46, '#facc15'],
          [0.12, 1.35, -0.32, '#fb7185'],
          [0.12, 2.05, 0.2, '#22c55e'],
          [0.12, 2.05, 0.35, '#a855f7'],
        ].map(([x, y, z, col], i) => (
          <mesh key={i} position={[x as number, y as number, z as number]} castShadow>
            <boxGeometry args={[0.45, 0.36, 0.1]} />
            <meshStandardMaterial color={col as string} roughness={0.6} />
          </mesh>
        ))}
      </group>

      {/* Luminária de chão com luz quente perto do Diretor */}
      <group position={[5.8, 0, -8.5]}>
        <mesh position={[0, 0.04, 0]}>
          <cylinderGeometry args={[0.38, 0.4, 0.08, 18]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>
        <mesh position={[0, 1.6, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.04, 3.1, 10]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.3} />
        </mesh>
        <mesh position={[0, 3.1, 0]}>
          <cylinderGeometry args={[0.32, 0.48, 0.55, 20]} />
          <meshStandardMaterial
            color="#fef3c7"
            emissive="#fbbf24"
            emissiveIntensity={0.85}
          />
        </mesh>
        <pointLight position={[0, 2.8, 0]} intensity={1.8} distance={14} color="#fde68a" />
      </group>
    </group>
  );
}

/**
 * Controlador suave de câmera isométrica:
 * Desloca o foco suavemente ao selecionar um agente e libera o controle imediatamente ao arrastar.
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
      targetVecRef.current.set(pos[0] + 4.0, 0.5, pos[2] - 4.0);
    } else {
      // Desloca levemente o foco para cima (+Y) e esquerda (-X/-Z) para manter o estúdio inteiro
      // perfeitamente enquadrado abaixo do HUD superior
      targetVecRef.current.set(-1.0, 1.4, -1.0);
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

    if (camera instanceof THREE.OrthographicCamera) {
      const targetZoom = selectedDepartment ? 42 : 29;
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
      minAzimuthAngle={-Math.PI / 8}
      maxAzimuthAngle={Math.PI / 2}
      onStart={() => {
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
        position: [19, 16, 19],
        zoom: 29,
        near: -100,
        far: 200,
      }}
      onPointerMissed={() => selectDepartment(null)}
    >
      <color attach="background" args={['#0d1e27']} />

      {/* Iluminação quente e acolhedora de estúdio */}
      <ambientLight intensity={0.85} color="#e0f2fe" />
      <hemisphereLight args={['#bae6fd', '#334155', 0.45]} />
      <directionalLight
        castShadow
        position={[14, 24, 12]}
        intensity={1.35}
        color="#fffbeb"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
      />

      <CozyStudioEnvironment />
      <DagFloorConnections />

      {desks.map((config) => (
        <AgentDesk key={config.department} config={config} />
      ))}

      <HandoffManager />
      <SmoothCameraRig />
    </Canvas>
  );
}
