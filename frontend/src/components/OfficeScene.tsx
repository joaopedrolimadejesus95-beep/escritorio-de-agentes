import { useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  AgentDesk,
  DEPARTMENT_DESKS,
  StudioPlanter,
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
              position={[midX, 0.008, midZ]}
              rotation={[0, angleY, 0]}
            >
              <boxGeometry args={[0.04, 0.006, length]} />
              <meshStandardMaterial color="#b3ab9e" />
            </mesh>
          );
        })}
    </group>
  );
}

/**
 * Estúdio Arquitetônico Loft (inspirado na referência enviada):
 * - Janela industrial esquerda com luz dourada de fim de tarde
 * - Parede em ripado de madeira quente + nicho concreto com quadro + fita LED indireta
 * - Prateleiras flutuantes com livros e plantas
 * - Lounge aconchegante com 2 sofás, mesa de centro e cantinho de café/espresso
 */
function ArchitecturalLoftEnvironment() {
  return (
    <group>
      {/* Borda escura da maquete isométrica */}
      <RoundedBox
        args={[26.4, 0.48, 24.4]}
        radius={0.04}
        position={[0, -0.25, 0]}
        receiveShadow
      >
        <meshStandardMaterial color="#12161d" roughness={0.75} />
      </RoundedBox>

      {/* Piso principal em cimento queimado claro / areia quente */}
      <mesh position={[0, 0, 0]} receiveShadow>
        <boxGeometry args={[25.8, 0.04, 23.8]} />
        <meshStandardMaterial color="#d2c9bc" roughness={0.86} />
      </mesh>

      {/* Feixe sutil de sol dourado entrando pela janela esquerda */}
      <mesh position={[-5.2, 0.023, 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[12.5, 16.0]} />
        <meshBasicMaterial color="#ffe4b5" transparent opacity={0.14} />
      </mesh>

      {/* =================================================================== */}
      {/* PAREDE DO FUNDO (Z = -11.9): Ripado de Madeira + Nicho Concreto + LED */}
      {/* =================================================================== */}
      <group position={[0, 3.0, -11.9]}>
        {/* Casca externa escura da parede */}
        <mesh position={[0, 0, -0.2]} receiveShadow>
          <boxGeometry args={[26.2, 6.2, 0.35]} />
          <meshStandardMaterial color="#14181f" roughness={0.8} />
        </mesh>

        {/* Base madeira quente atrás dos ripados */}
        <mesh position={[0, 0, 0]} receiveShadow>
          <boxGeometry args={[25.6, 5.9, 0.08]} />
          <meshStandardMaterial color="#6e3f22" roughness={0.75} />
        </mesh>

        {/* Nicho central direito em concreto claro com arte emoldurada */}
        <mesh position={[6.2, -0.1, 0.08]} receiveShadow>
          <boxGeometry args={[4.4, 5.7, 0.08]} />
          <meshStandardMaterial color="#cfc6b8" roughness={0.82} />
        </mesh>
        {/* Quadro abstrato minimalista no nicho */}
        <group position={[6.2, 0.45, 0.16]}>
          <mesh castShadow>
            <boxGeometry args={[2.3, 2.7, 0.06]} />
            <meshStandardMaterial color="#1c2028" roughness={0.5} />
          </mesh>
          <mesh position={[0, 0, 0.04]}>
            <planeGeometry args={[2.0, 2.4]} />
            <meshStandardMaterial color="#e5ded3" roughness={0.7} />
          </mesh>
          <mesh position={[-0.25, 0.2, 0.05]}>
            <boxGeometry args={[0.9, 1.25, 0.01]} />
            <meshStandardMaterial color="#8c6244" roughness={0.6} />
          </mesh>
          <mesh position={[0.35, -0.35, 0.05]}>
            <boxGeometry args={[0.75, 0.85, 0.01]} />
            <meshStandardMaterial color="#3c434d" roughness={0.6} />
          </mesh>
        </group>

        {/* Ripas verticais de madeira (lado esquerdo e direito da parede de fundo) */}
        {Array.from({ length: 34 }, (_, idx) => {
          const x = -12.3 + idx * 0.46;
          return (
            <mesh key={`slatL-${idx}`} position={[x, 0, 0.07]} castShadow receiveShadow>
              <boxGeometry args={[0.2, 5.8, 0.1]} />
              <meshStandardMaterial color="#9c5c34" roughness={0.6} />
            </mesh>
          );
        })}
        {Array.from({ length: 8 }, (_, idx) => {
          const x = 9.0 + idx * 0.46;
          return (
            <mesh key={`slatR-${idx}`} position={[x, 0, 0.07]} castShadow receiveShadow>
              <boxGeometry args={[0.2, 5.8, 0.1]} />
              <meshStandardMaterial color="#9c5c34" roughness={0.6} />
            </mesh>
          );
        })}

        {/* Fita LED indireta quente no topo da parede */}
        <mesh position={[0, 2.86, 0.14]}>
          <boxGeometry args={[25.4, 0.08, 0.08]} />
          <meshStandardMaterial
            color="#fff0c2"
            emissive="#ffcf80"
            emissiveIntensity={2.2}
          />
        </mesh>
        <pointLight position={[-4, 2.2, 1.5]} intensity={1.4} distance={16} color="#ffd99b" />
        <pointLight position={[6.2, 2.2, 1.5]} intensity={1.4} distance={16} color="#ffd99b" />

        {/* Prateleiras flutuantes no ripado com livros e plantinhas */}
        {[-7.2, -1.8].map((shelfX, idx) => (
          <group key={idx} position={[shelfX, 1.0 - idx * 0.35, 0.34]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[3.2, 0.08, 0.5]} />
              <meshStandardMaterial color="#4a2c18" roughness={0.6} />
            </mesh>
            {/* Livros e decor */}
            <mesh position={[-0.95, 0.25, 0]} castShadow>
              <boxGeometry args={[0.16, 0.42, 0.3]} />
              <meshStandardMaterial color="#e5ded3" roughness={0.6} />
            </mesh>
            <mesh position={[-0.75, 0.22, 0]} castShadow>
              <boxGeometry args={[0.14, 0.36, 0.3]} />
              <meshStandardMaterial color="#3b4252" roughness={0.6} />
            </mesh>
            <mesh position={[0.75, 0.18, 0]} castShadow>
              <cylinderGeometry args={[0.15, 0.12, 0.28, 12]} />
              <meshStandardMaterial color="#d4cec4" roughness={0.7} />
            </mesh>
            <mesh position={[0.75, 0.38, 0]} castShadow>
              <sphereGeometry args={[0.2, 10, 10]} />
              <meshStandardMaterial color="#4c7a40" roughness={0.6} />
            </mesh>
          </group>
        ))}
      </group>

      {/* =================================================================== */}
      {/* PAREDE ESQUERDA (X = -12.9): JANELA INDUSTRIAL COM PÔR DO SOL       */}
      {/* =================================================================== */}
      <group position={[-12.9, 3.0, 0]}>
        {/* Casca preta externa da parede esquerda */}
        <mesh position={[-0.25, 0, 0]}>
          <boxGeometry args={[0.35, 6.2, 24.4]} />
          <meshStandardMaterial color="#14181f" roughness={0.8} />
        </mesh>

        {/* Fundo pôr-do-sol luminoso da janela (Z de -11 a +1) */}
        <mesh position={[-0.02, 0.2, -4.6]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[12.4, 5.2]} />
          <meshStandardMaterial
            color="#ffe5be"
            emissive="#ffd599"
            emissiveIntensity={1.15}
          />
        </mesh>
        {/* Faixa superior dourado-rosada suave do céu */}
        <mesh position={[-0.01, 2.0, -4.6]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[12.4, 1.8]} />
          <meshStandardMaterial
            color="#e7c7b5"
            emissive="#d6a58e"
            emissiveIntensity={0.7}
          />
        </mesh>

        {/* Vidro reflexivo sutil da janela */}
        <mesh position={[0.04, 0.2, -4.6]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[12.4, 5.2]} />
          <meshStandardMaterial
            color="#fff7ed"
            transparent
            opacity={0.18}
            roughness={0.1}
          />
        </mesh>

        {/* Molduras & Travessas pretas estilo loft industrial */}
        {[-10.8, -7.7, -4.6, -1.5, 1.6].map((mz, idx) => (
          <mesh key={`mullionV-${idx}`} position={[0.08, 0.1, mz]} castShadow>
            <boxGeometry args={[0.16, 5.8, 0.14]} />
            <meshStandardMaterial color="#14181f" roughness={0.5} />
          </mesh>
        ))}
        {[-1.5, 0.5, 2.75].map((my, idx) => (
          <mesh key={`mullionH-${idx}`} position={[0.08, my, -4.6]} castShadow>
            <boxGeometry args={[0.16, 0.12, 12.6]} />
            <meshStandardMaterial color="#14181f" roughness={0.5} />
          </mesh>
        ))}

        {/* Trecho ripado lateral perto da janela frontal */}
        <mesh position={[0.04, 0, 6.7]} receiveShadow>
          <boxGeometry args={[0.1, 5.9, 9.8]} />
          <meshStandardMaterial color="#8c4e28" roughness={0.7} />
        </mesh>
        <mesh position={[0.08, 2.86, 6.7]}>
          <boxGeometry args={[0.12, 0.08, 9.6]} />
          <meshStandardMaterial color="#fff0c2" emissive="#ffcf80" emissiveIntensity={1.8} />
        </mesh>
      </group>

      {/* =================================================================== */}
      {/* LOUNGE ACONCHEGANTE + CANTINHO DO CAFÉ (ESQUERDA FRONTAL)           */}
      {/* =================================================================== */}
      <group position={[-8.8, 0, 3.4]}>
        {/* Tapete tecido do lounge */}
        <RoundedBox args={[5.8, 0.025, 6.8]} radius={0.02} position={[0, 0.012, 0]} receiveShadow>
          <meshStandardMaterial color="#9e9688" roughness={0.94} />
        </RoundedBox>

        {/* Sofá Principal (verde oliva acinzentado escuro) */}
        <group position={[-1.9, 0, -0.4]}>
          <RoundedBox args={[1.35, 0.38, 3.3]} radius={0.06} position={[0, 0.3, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#585a47" roughness={0.82} />
          </RoundedBox>
          <RoundedBox args={[0.32, 0.85, 3.3]} radius={0.06} position={[-0.52, 0.68, 0]} castShadow>
            <meshStandardMaterial color="#4b4d3c" roughness={0.82} />
          </RoundedBox>
          {/* Braços */}
          <RoundedBox args={[1.28, 0.56, 0.24]} radius={0.05} position={[0, 0.48, -1.52]} castShadow>
            <meshStandardMaterial color="#4b4d3c" roughness={0.8} />
          </RoundedBox>
          <RoundedBox args={[1.28, 0.56, 0.24]} radius={0.05} position={[0, 0.48, 1.52]} castShadow>
            <meshStandardMaterial color="#4b4d3c" roughness={0.8} />
          </RoundedBox>
          {/* Almofada clara */}
          <RoundedBox
            args={[0.25, 0.36, 0.42]}
            radius={0.06}
            position={[-0.22, 0.64, -0.95]}
            rotation={[0, 0.2, 0.25]}
            castShadow
          >
            <meshStandardMaterial color="#dcd4c6" roughness={0.8} />
          </RoundedBox>
        </group>

        {/* Segundo Sofá em L */}
        <group position={[0.45, 0, 2.3]}>
          <RoundedBox args={[3.1, 0.38, 1.3]} radius={0.06} position={[0, 0.3, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#585a47" roughness={0.82} />
          </RoundedBox>
          <RoundedBox args={[3.1, 0.85, 0.32]} radius={0.06} position={[0, 0.68, 0.5]} castShadow>
            <meshStandardMaterial color="#4b4d3c" roughness={0.82} />
          </RoundedBox>
        </group>

        {/* Mesa de Centro em Carvalho */}
        <group position={[0.15, 0, -0.25]}>
          <RoundedBox args={[1.45, 0.08, 1.9]} radius={0.03} position={[0, 0.44, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#b98350" roughness={0.58} />
          </RoundedBox>
          {[
            [-0.58, 0.21, -0.8],
            [0.58, 0.21, -0.8],
            [-0.58, 0.21, 0.8],
            [0.58, 0.21, 0.8],
          ].map((lp, idx) => (
            <mesh key={idx} position={lp as [number, number, number]} castShadow>
              <boxGeometry args={[0.07, 0.42, 0.07]} />
              <meshStandardMaterial color="#181c24" />
            </mesh>
          ))}
          {/* Xícaras na mesa de centro */}
          <mesh position={[-0.25, 0.54, 0.2]} castShadow>
            <cylinderGeometry args={[0.07, 0.06, 0.12, 12]} />
            <meshStandardMaterial color="#f5f0e6" roughness={0.4} />
          </mesh>
          <mesh position={[0.22, 0.54, -0.35]} castShadow>
            <cylinderGeometry args={[0.07, 0.06, 0.12, 12]} />
            <meshStandardMaterial color="#f5f0e6" roughness={0.4} />
          </mesh>
        </group>

        {/* Balcão do Café & Máquina de Espresso */}
        <group position={[2.35, 0, -1.7]}>
          <RoundedBox args={[1.05, 0.96, 1.6]} radius={0.03} position={[0, 0.48, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#6e3f22" roughness={0.68} />
          </RoundedBox>
          <mesh position={[0, 0.98, 0]} castShadow>
            <boxGeometry args={[1.1, 0.06, 1.66]} />
            <meshStandardMaterial color="#1d222b" roughness={0.45} />
          </mesh>
          {/* Máquina de espresso */}
          <RoundedBox args={[0.52, 0.58, 0.48]} radius={0.03} position={[0, 1.3, -0.32]} castShadow>
            <meshStandardMaterial color="#181c24" metalness={0.35} roughness={0.4} />
          </RoundedBox>
          <mesh position={[-0.22, 1.24, -0.32]}>
            <boxGeometry args={[0.14, 0.2, 0.36]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.6} roughness={0.3} />
          </mesh>
          {/* Garrafa térmica / copos */}
          <mesh position={[0.05, 1.16, 0.38]} castShadow>
            <cylinderGeometry args={[0.12, 0.14, 0.3, 14]} />
            <meshStandardMaterial color="#272c36" metalness={0.3} roughness={0.4} />
          </mesh>
        </group>
      </group>

      {/* Vasos Grandes de Canto (Ficus / Plantas Esculturais) */}
      <StudioPlanter position={[-11.6, 0, -9.8]} scale={1.35} />
      <StudioPlanter position={[10.8, 0, -9.8]} scale={1.35} />
      <StudioPlanter position={[-11.2, 0, 8.8]} scale={1.25} />
      <StudioPlanter position={[10.6, 0, 5.2]} scale={1.15} />
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
      targetVecRef.current.set(pos[0] + 3.2, 0.7, pos[2] - 3.2);
    } else {
      targetVecRef.current.set(-0.6, 1.4, -0.6);
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
      const targetZoom = selectedDepartment ? 41 : 27.5;
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
      minZoom={20}
      maxZoom={75}
      minPolarAngle={Math.PI / 5}
      maxPolarAngle={Math.PI / 2.45}
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
        position: [20, 17, 20],
        zoom: 27.5,
        near: -100,
        far: 200,
      }}
      onPointerMissed={() => selectDepartment(null)}
    >
      <color attach="background" args={['#1a222d']} />

      {/* Iluminação quente estilo arquitetura + luz natural da janela */}
      <ambientLight intensity={0.72} color="#fff7ed" />
      <hemisphereLight args={['#fde6c4', '#475569', 0.55]} />
      <directionalLight
        castShadow
        position={[-14, 18, 8]}
        intensity={1.55}
        color="#ffe5bd"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      <directionalLight
        position={[14, 22, 14]}
        intensity={0.5}
        color="#e2e8f0"
      />

      <ArchitecturalLoftEnvironment />
      <DagFloorConnections />

      {desks.map((config) => (
        <AgentDesk key={config.department} config={config} />
      ))}

      <HandoffManager />
      <SmoothCameraRig />
    </Canvas>
  );
}
