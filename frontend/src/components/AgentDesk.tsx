import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { AgentVisualState, DepartmentId } from '@ai-office/shared';
import { useOfficeStore } from '../store/useOfficeStore.js';

export interface DepartmentDeskConfig {
  department: DepartmentId;
  label: string;
  roleSubtitle: string;
  position: [number, number, number];
  rotationY?: number;
  accentColor: string;
  shirtColor: string;
  hairColor: string;
  hasPlant?: boolean;
  curvedMonitor?: boolean;
}

export const DEPARTMENT_DESKS: Record<DepartmentId, DepartmentDeskConfig> = {
  director: {
    department: 'director',
    label: 'Diretor Executivo',
    roleSubtitle: 'Orquestração & DAG Planner',
    position: [1.0, 0, -7.2],
    rotationY: 0,
    accentColor: '#a855f7',
    shirtColor: '#4c4f5c',
    hairColor: '#3b2820',
    hasPlant: true,
  },
  research: {
    department: 'research',
    label: 'Pesquisa de Mercado',
    roleSubtitle: 'Concorrentes, Preços & Dores',
    position: [-5.6, 0, -2.0],
    rotationY: 0.45,
    accentColor: '#38bdf8',
    shirtColor: '#2c5364',
    hairColor: '#5c3c28',
    hasPlant: true,
  },
  engineering: {
    department: 'engineering',
    label: 'Arquitetura & Dados',
    roleSubtitle: 'Stack, Mermaid, SQL & APIs',
    position: [6.8, 0, -4.0],
    rotationY: -0.35,
    accentColor: '#10b981',
    shirtColor: '#2d4a3e',
    hairColor: '#231f20',
    hasPlant: true,
  },
  design: {
    department: 'design',
    label: 'Design de Interface',
    roleSubtitle: 'Design System & Telas HTML',
    position: [0.8, 0, 3.6],
    rotationY: 0.25,
    accentColor: '#ec4899',
    shirtColor: '#7c4d3c',
    hairColor: '#6f422b',
    curvedMonitor: true,
  },
  growth: {
    department: 'growth',
    label: 'Estratégia & Growth',
    roleSubtitle: 'GTM, Preços & Aquisição',
    position: [7.2, 0, 2.8],
    rotationY: -0.25,
    accentColor: '#f59e0b',
    shirtColor: '#364152',
    hairColor: '#4a3222',
    hasPlant: true,
  },
};

const VISUAL_STATE_MONITOR_COLORS: Record<AgentVisualState, string> = {
  idle: '#60a5fa',
  thinking: '#38bdf8',
  working: '#22c55e',
  validating: '#a855f7',
  awaiting_approval: '#f59e0b',
  error: '#ef4444',
};

const VISUAL_STATE_BADGE_LABELS: Record<AgentVisualState, string> = {
  idle: 'Disponível',
  thinking: 'Analisando',
  working: 'Produzindo',
  validating: 'Validando',
  awaiting_approval: 'Revisão',
  error: 'Erro',
};

export function StudioPlanter({
  position,
  scale = 1,
}: {
  position: [number, number, number];
  scale?: number;
}) {
  return (
    <group position={position} scale={scale}>
      {/* Sombra de contato no piso claro */}
      <mesh position={[0, 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.42, 24]} />
        <meshBasicMaterial color="#1f2937" transparent opacity={0.18} />
      </mesh>
      {/* Vaso de cerâmica fosco areia/cinza claro */}
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.29, 0.22, 0.6, 20]} />
        <meshStandardMaterial color="#d4cec4" roughness={0.78} />
      </mesh>
      {/* Terra escura */}
      <mesh position={[0, 0.57, 0]}>
        <cylinderGeometry args={[0.25, 0.25, 0.05, 18]} />
        <meshStandardMaterial color="#4a3121" roughness={0.95} />
      </mesh>
      {/* Tronco e folhagem cheia em camadas */}
      <mesh position={[0, 0.78, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.04, 0.48, 8]} />
        <meshStandardMaterial color="#5c4033" roughness={0.9} />
      </mesh>
      {[
        { pos: [0, 1.12, 0], rot: [0.15, 0.2, 0.1], s: [0.28, 0.42, 0.06], c: '#48763d' },
        { pos: [-0.2, 0.98, 0.1], rot: [0.35, 0.5, 0.55], s: [0.24, 0.35, 0.06], c: '#3b6431' },
        { pos: [0.22, 1.02, -0.08], rot: [-0.25, -0.4, -0.5], s: [0.26, 0.38, 0.06], c: '#548746' },
        { pos: [0.05, 0.92, 0.22], rot: [0.55, 0.1, -0.2], s: [0.22, 0.34, 0.06], c: '#3e6a34' },
        { pos: [-0.08, 0.95, -0.2], rot: [-0.5, -0.2, 0.25], s: [0.22, 0.33, 0.06], c: '#4f7d42' },
      ].map((leaf, i) => (
        <mesh
          key={i}
          position={leaf.pos as [number, number, number]}
          rotation={leaf.rot as [number, number, number]}
          scale={leaf.s as [number, number, number]}
          castShadow
        >
          <sphereGeometry args={[1, 10, 10]} />
          <meshStandardMaterial color={leaf.c} roughness={0.62} />
        </mesh>
      ))}
    </group>
  );
}

interface AgentDeskProps {
  config: DepartmentDeskConfig;
}

export function AgentDesk({ config }: AgentDeskProps) {
  const rootGroupRef = useRef<THREE.Group>(null);
  const agentGroupRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Mesh>(null);
  const leftArmRef = useRef<THREE.Mesh>(null);
  const rightArmRef = useRef<THREE.Mesh>(null);
  const monitorScreenMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const alertBeaconRef = useRef<THREE.Mesh>(null);
  const hoverRingMatRef = useRef<THREE.MeshStandardMaterial>(null);

  const agentState = useOfficeStore((s) => s.agents[config.department]);
  const selectedDepartment = useOfficeStore((s) => s.selectedDepartment);
  const hoveredDepartment = useOfficeStore((s) => s.hoveredDepartment);
  const selectDepartment = useOfficeStore((s) => s.selectDepartment);
  const setHoveredDepartment = useOfficeStore((s) => s.setHoveredDepartment);

  const isSelected = selectedDepartment === config.department;
  const isHovered = hoveredDepartment === config.department;

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const state = useOfficeStore.getState();
    const currentAgent = state.agents[config.department];
    const vState = currentAgent?.visualState ?? 'idle';
    const activeHover = state.hoveredDepartment === config.department;
    const activeSel = state.selectedDepartment === config.department;

    if (rootGroupRef.current) {
      const targetScale = activeHover || activeSel ? 1.035 : 1.0;
      rootGroupRef.current.scale.lerp(
        new THREE.Vector3(targetScale, targetScale, targetScale),
        0.15
      );
    }

    if (hoverRingMatRef.current) {
      const targetOpacity = activeSel ? 0.92 : activeHover ? 0.65 : 0.08;
      hoverRingMatRef.current.opacity = THREE.MathUtils.lerp(
        hoverRingMatRef.current.opacity,
        targetOpacity,
        0.18
      );
    }

    if (
      agentGroupRef.current &&
      headRef.current &&
      leftArmRef.current &&
      rightArmRef.current
    ) {
      if (vState === 'idle') {
        agentGroupRef.current.position.y = 0.68 + Math.sin(t * 2) * 0.015;
        headRef.current.rotation.y = Math.sin(t * 0.7) * 0.14;
        leftArmRef.current.rotation.x = -0.52;
        rightArmRef.current.rotation.x = -0.52;
      } else if (vState === 'thinking') {
        agentGroupRef.current.position.y = 0.7 + Math.sin(t * 3.5) * 0.025;
        headRef.current.rotation.y = Math.sin(t * 2.4) * 0.28;
        leftArmRef.current.rotation.x = -0.75 + Math.sin(t * 4) * 0.1;
        rightArmRef.current.rotation.x = -1.1;
      } else if (vState === 'working') {
        agentGroupRef.current.position.y =
          0.69 + Math.abs(Math.sin(t * 8)) * 0.022;
        headRef.current.rotation.y = Math.sin(t * 5) * 0.08;
        leftArmRef.current.rotation.x = -0.95 + Math.sin(t * 16) * 0.2;
        rightArmRef.current.rotation.x = -0.95 + Math.cos(t * 16) * 0.2;
      } else if (vState === 'validating') {
        agentGroupRef.current.position.y = 0.71 + Math.sin(t * 5) * 0.022;
        headRef.current.rotation.y = Math.sin(t * 4) * 0.2;
        leftArmRef.current.rotation.x = -0.85;
        rightArmRef.current.rotation.x = -0.85;
      } else if (vState === 'awaiting_approval') {
        agentGroupRef.current.position.y =
          0.74 + Math.abs(Math.sin(t * 4.5)) * 0.07;
        headRef.current.rotation.y = 0;
        leftArmRef.current.rotation.x = -2.3 + Math.sin(t * 7) * 0.25;
        rightArmRef.current.rotation.x = -2.3 - Math.sin(t * 7) * 0.25;
      } else if (vState === 'error') {
        agentGroupRef.current.position.y = 0.66;
        headRef.current.rotation.y = Math.sin(t * 20) * 0.18;
        leftArmRef.current.rotation.x = -0.25;
        rightArmRef.current.rotation.x = -0.25;
      }
    }

    if (monitorScreenMatRef.current) {
      const targetHex = VISUAL_STATE_MONITOR_COLORS[vState];
      monitorScreenMatRef.current.color.set(targetHex);
      monitorScreenMatRef.current.emissive.set(targetHex);
      monitorScreenMatRef.current.emissiveIntensity =
        vState === 'idle'
          ? 0.45
          : vState === 'awaiting_approval' || vState === 'error'
            ? 1.15 + Math.sin(t * 7) * 0.4
            : 0.8 + Math.sin(t * 4.5) * 0.2;
    }

    if (alertBeaconRef.current) {
      alertBeaconRef.current.rotation.y = t * 2.5;
      alertBeaconRef.current.position.y = 2.42 + Math.sin(t * 4) * 0.07;
    }
  });

  const monitorColor = VISUAL_STATE_MONITOR_COLORS[agentState.visualState];

  return (
    <group
      ref={rootGroupRef}
      position={config.position}
      rotation={[0, config.rotationY ?? 0, 0]}
      onClick={(e) => {
        e.stopPropagation();
        selectDepartment(config.department);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHoveredDepartment(config.department);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        if (useOfficeStore.getState().hoveredDepartment === config.department) {
          setHoveredDepartment(null);
        }
        document.body.style.cursor = 'default';
      }}
    >
      {/* Anel discreto de seleção/hover no piso de concreto */}
      <mesh position={[0, 0.014, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.15, 2.3, 48]} />
        <meshStandardMaterial
          ref={hoverRingMatRef}
          color={config.accentColor}
          emissive={config.accentColor}
          emissiveIntensity={1.1}
          transparent
          opacity={0.08}
        />
      </mesh>

      {/* Tapete cinza quente minimalista sob a mesa */}
      <RoundedBox
        args={[3.35, 0.024, 2.95]}
        radius={0.015}
        position={[0, 0.012, 0]}
        receiveShadow
      >
        <meshStandardMaterial
          color={isSelected ? '#9e978b' : isHovered ? '#aba498' : '#b8b0a3'}
          roughness={0.92}
        />
      </RoundedBox>

      {/* Divisória acústica moderna translúcida (vidro fosco + moldura aço preto) */}
      <group position={[0, 1.12, 0.88]}>
        <mesh castShadow>
          <boxGeometry args={[2.55, 0.72, 0.04]} />
          <meshStandardMaterial
            color="#cbd5e1"
            transparent
            opacity={0.42}
            roughness={0.25}
          />
        </mesh>
        {/* Borda superior & suportes metálicos pretos */}
        <mesh position={[0, 0.37, 0]}>
          <boxGeometry args={[2.58, 0.04, 0.06]} />
          <meshStandardMaterial color="#181c24" roughness={0.5} />
        </mesh>
        {[-1.26, 1.26].map((px, idx) => (
          <mesh key={idx} position={[px, -0.18, 0]}>
            <boxGeometry args={[0.05, 1.12, 0.06]} />
            <meshStandardMaterial color="#181c24" roughness={0.5} />
          </mesh>
        ))}
      </group>

      {/* MESA DE CARVALHO CLARO COM ESTRUTURA DE AÇO PRETO */}
      <group position={[0, 0, 0.25]}>
        {/* Tampo de carvalho quente */}
        <RoundedBox
          args={[2.6, 0.08, 1.26]}
          radius={0.025}
          position={[0, 0.76, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#c99563" roughness={0.55} />
        </RoundedBox>

        {/* Estrutura metálica preta minimalista */}
        {[
          [-1.2, 0.37, -0.54],
          [-1.2, 0.37, 0.54],
          [1.2, 0.37, -0.54],
          [1.2, 0.37, 0.54],
        ].map((legPos, idx) => (
          <mesh key={idx} position={legPos as [number, number, number]} castShadow>
            <boxGeometry args={[0.06, 0.74, 0.06]} />
            <meshStandardMaterial color="#181c24" metalness={0.35} roughness={0.5} />
          </mesh>
        ))}

        {/* Gaveteiro compacto escuro sob o lado direito */}
        <group position={[0.84, 0.36, 0]}>
          <RoundedBox args={[0.66, 0.68, 1.02]} radius={0.02} castShadow receiveShadow>
            <meshStandardMaterial color="#272c36" roughness={0.65} />
          </RoundedBox>
          {[0.18, 0, -0.18].map((yOff, i) => (
            <mesh key={i} position={[0, yOff, -0.52]}>
              <boxGeometry args={[0.56, 0.14, 0.015]} />
              <meshStandardMaterial color="#343b48" roughness={0.55} />
            </mesh>
          ))}
        </group>

        {/* Desk mat preto + Teclado & Mouse */}
        <mesh position={[-0.18, 0.804, -0.14]} receiveShadow>
          <boxGeometry args={[1.05, 0.008, 0.52]} />
          <meshStandardMaterial color="#1e222a" roughness={0.85} />
        </mesh>
        <mesh position={[-0.24, 0.818, -0.16]} castShadow>
          <boxGeometry args={[0.52, 0.02, 0.18]} />
          <meshStandardMaterial color="#d1d5db" roughness={0.45} />
        </mesh>
        <RoundedBox args={[0.09, 0.025, 0.13]} radius={0.012} position={[0.16, 0.818, -0.16]} castShadow>
          <meshStandardMaterial color="#d1d5db" roughness={0.45} />
        </RoundedBox>

        {/* Monitor Widescreen ou Ultrawide Curvo */}
        <group position={[-0.14, 1.15, 0.25]}>
          <mesh position={[0, -0.26, 0.02]} castShadow>
            <boxGeometry args={[0.11, 0.24, 0.06]} />
            <meshStandardMaterial color="#1f242d" metalness={0.4} roughness={0.4} />
          </mesh>
          <mesh position={[0, -0.34, 0]} castShadow>
            <boxGeometry args={[0.38, 0.025, 0.22]} />
            <meshStandardMaterial color="#1f242d" metalness={0.4} roughness={0.4} />
          </mesh>
          <RoundedBox
            args={[config.curvedMonitor ? 1.48 : 1.2, 0.66, 0.05]}
            radius={0.02}
            castShadow
          >
            <meshStandardMaterial color="#181b22" roughness={0.35} />
          </RoundedBox>
          <mesh position={[0, 0, -0.028]}>
            <planeGeometry args={[config.curvedMonitor ? 1.38 : 1.1, 0.58]} />
            <meshStandardMaterial
              ref={monitorScreenMatRef}
              color={monitorColor}
              emissive={monitorColor}
              emissiveIntensity={0.65}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh position={[0, 0, 0.028]}>
            <planeGeometry args={[config.curvedMonitor ? 1.38 : 1.1, 0.58]} />
            <meshStandardMaterial
              color={monitorColor}
              emissive={monitorColor}
              emissiveIntensity={0.55}
            />
          </mesh>
        </group>

        {/* Caneca de café e caderno na mesa */}
        <group position={[0.78, 0.86, -0.12]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.065, 0.055, 0.14, 14]} />
            <meshStandardMaterial color="#f5f0e6" roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.065, 0]}>
            <cylinderGeometry args={[0.055, 0.055, 0.015, 14]} />
            <meshStandardMaterial color="#4a2c18" roughness={0.5} />
          </mesh>
        </group>
        <RoundedBox
          args={[0.28, 0.025, 0.36]}
          radius={0.008}
          position={[-0.92, 0.815, -0.18]}
          rotation={[0, 0.18, 0]}
          castShadow
        >
          <meshStandardMaterial color="#3b4252" roughness={0.7} />
        </RoundedBox>
      </group>

      {/* CADEIRA DE ESCRITÓRIO MODERNA + RODÍZIOS */}
      <group position={[-0.14, 0, -0.72]}>
        <mesh position={[0, 0.25, 0]} castShadow>
          <cylinderGeometry args={[0.042, 0.052, 0.36, 12]} />
          <meshStandardMaterial color="#1c2028" metalness={0.5} roughness={0.35} />
        </mesh>
        {[0, 1.256, 2.513, 3.77, 5.026].map((ang, i) => (
          <group key={i} rotation={[0, ang, 0]}>
            <mesh position={[0.18, 0.08, 0]} rotation={[0, 0, -0.12]}>
              <boxGeometry args={[0.35, 0.035, 0.045]} />
              <meshStandardMaterial color="#1c2028" metalness={0.45} roughness={0.4} />
            </mesh>
            <mesh position={[0.34, 0.045, 0]}>
              <sphereGeometry args={[0.045, 10, 10]} />
              <meshStandardMaterial color="#0b0d12" roughness={0.6} />
            </mesh>
          </group>
        ))}
        <RoundedBox args={[0.62, 0.09, 0.58]} radius={0.035} position={[0, 0.45, 0]} castShadow>
          <meshStandardMaterial color="#2a2f3a" roughness={0.8} />
        </RoundedBox>
        <mesh position={[0, 0.66, -0.26]}>
          <boxGeometry args={[0.12, 0.4, 0.04]} />
          <meshStandardMaterial color="#1c2028" metalness={0.4} />
        </mesh>
        <RoundedBox args={[0.58, 0.54, 0.09]} radius={0.04} position={[0, 0.84, -0.26]} castShadow>
          <meshStandardMaterial color="#2a2f3a" roughness={0.8} />
        </RoundedBox>
      </group>

      {/* PERSONAGEM ESTILIZADO SENTADO */}
      <group ref={agentGroupRef} position={[-0.14, 0.68, -0.68]}>
        <RoundedBox
          args={[0.46, 0.58, 0.3]}
          radius={0.1}
          position={[0, 0.2, 0]}
          castShadow
        >
          <meshStandardMaterial color={config.shirtColor} roughness={0.55} />
        </RoundedBox>

        <mesh ref={headRef} position={[0, 0.72, 0.02]} castShadow>
          <sphereGeometry args={[0.21, 20, 20]} />
          <meshStandardMaterial color="#f1d2b6" roughness={0.45} />
          {/* Cabelo estilizado no topo/nuca */}
          <mesh position={[0, 0.09, -0.04]}>
            <sphereGeometry args={[0.215, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
            <meshStandardMaterial color={config.hairColor} roughness={0.6} />
          </mesh>
        </mesh>

        <mesh
          ref={leftArmRef}
          position={[-0.3, 0.3, 0.14]}
          rotation={[-0.5, 0, 0]}
          castShadow
        >
          <capsuleGeometry args={[0.07, 0.3, 8, 12]} />
          <meshStandardMaterial color={config.shirtColor} roughness={0.55} />
        </mesh>

        <mesh
          ref={rightArmRef}
          position={[0.3, 0.3, 0.14]}
          rotation={[-0.5, 0, 0]}
          castShadow
        >
          <capsuleGeometry args={[0.07, 0.3, 8, 12]} />
          <meshStandardMaterial color={config.shirtColor} roughness={0.55} />
        </mesh>
      </group>

      {/* Planta verde opcional junto à estação */}
      {config.hasPlant && <StudioPlanter position={[1.7, 0, 0.45]} scale={0.8} />}

      {/* Beacon 3D de Revisão ou Erro */}
      {(agentState.visualState === 'awaiting_approval' ||
        agentState.visualState === 'error') && (
        <mesh ref={alertBeaconRef} position={[-0.14, 2.42, -0.68]}>
          <octahedronGeometry args={[0.18, 0]} />
          <meshStandardMaterial
            color={
              agentState.visualState === 'awaiting_approval'
                ? '#f59e0b'
                : '#ef4444'
            }
            emissive={
              agentState.visualState === 'awaiting_approval'
                ? '#f59e0b'
                : '#ef4444'
            }
            emissiveIntensity={1.35}
          />
        </mesh>
      )}

      {/* Card Sóbrio Suspenso */}
      <Html position={[0, 2.65, -0.15]} center zIndexRange={[10, 0]}>
        <div
          onClick={(e) => {
            e.stopPropagation();
            selectDepartment(config.department);
          }}
          onMouseEnter={() => setHoveredDepartment(config.department)}
          onMouseLeave={() => {
            if (
              useOfficeStore.getState().hoveredDepartment === config.department
            ) {
              setHoveredDepartment(null);
            }
          }}
          style={{
            cursor: 'pointer',
            background: isSelected
              ? 'rgba(13, 18, 28, 0.96)'
              : 'rgba(10, 14, 22, 0.9)',
            border: `1px solid ${
              isSelected || isHovered ? config.accentColor : 'rgba(255,255,255,0.12)'
            }`,
            borderRadius: '10px',
            padding: '6px 10px',
            minWidth: '170px',
            maxWidth: '215px',
            backdropFilter: 'blur(8px)',
            boxShadow:
              isSelected || isHovered
                ? `0 8px 24px rgba(0,0,0,0.55), 0 0 0 1px ${config.accentColor}40`
                : '0 6px 18px rgba(0,0,0,0.45)',
            color: '#f8fafc',
            fontSize: '11px',
            userSelect: 'none',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              marginBottom: agentState.statusBubble ? '3px' : '0',
            }}
          >
            <span
              style={{
                fontWeight: 700,
                color: '#f8fafc',
                fontSize: '11.5px',
                whiteSpace: 'nowrap',
              }}
            >
              {config.label}
            </span>
            <span
              style={{
                background: `${monitorColor}25`,
                border: `1px solid ${monitorColor}`,
                color:
                  agentState.visualState === 'idle' ? '#94a3b8' : monitorColor,
                fontWeight: 700,
                fontSize: '9.5px',
                padding: '1px 6px',
                borderRadius: '999px',
                whiteSpace: 'nowrap',
              }}
            >
              {VISUAL_STATE_BADGE_LABELS[agentState.visualState]}
            </span>
          </div>

          {agentState.activeTool && (
            <div
              style={{
                fontSize: '10px',
                color: '#7dd3fc',
                fontWeight: 600,
                marginBottom: '2px',
              }}
            >
              Ferramenta: {agentState.activeTool}
            </div>
          )}

          {agentState.statusBubble && (
            <div
              style={{
                color: '#94a3b8',
                fontSize: '10px',
                lineHeight: 1.35,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {agentState.statusBubble}
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}
