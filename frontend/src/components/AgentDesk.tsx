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
}

export const DEPARTMENT_DESKS: Record<DepartmentId, DepartmentDeskConfig> = {
  director: {
    department: 'director',
    label: 'Diretor Executivo',
    roleSubtitle: 'Orquestração & DAG Planner',
    position: [0, 0, -6.2],
    accentColor: '#a855f7',
  },
  research: {
    department: 'research',
    label: 'Pesquisa de Mercado',
    roleSubtitle: 'Concorrentes, Preços & Dores',
    position: [-6.4, 0, -0.8],
    accentColor: '#38bdf8',
  },
  engineering: {
    department: 'engineering',
    label: 'Arquitetura & Dados',
    roleSubtitle: 'Stack, Mermaid, SQL & APIs',
    position: [6.4, 0, -0.8],
    accentColor: '#10b981',
  },
  design: {
    department: 'design',
    label: 'Design de Interface',
    roleSubtitle: 'Design System & Telas HTML',
    position: [-5.0, 0, 5.4],
    accentColor: '#ec4899',
  },
  growth: {
    department: 'growth',
    label: 'Estratégia & Growth',
    roleSubtitle: 'GTM, Preços & Aquisição',
    position: [5.0, 0, 5.4],
    accentColor: '#f59e0b',
  },
};

const VISUAL_STATE_MONITOR_COLORS: Record<AgentVisualState, string> = {
  idle: '#64b5b0',
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

function PottedPlant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Sombra suave no piso */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.34, 20]} />
        <meshBasicMaterial color="#0b1d26" transparent opacity={0.35} />
      </mesh>
      {/* Vaso de cerâmica claro */}
      <mesh position={[0, 0.24, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.24, 0.17, 0.48, 18]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.65} />
      </mesh>
      {/* Terra */}
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.21, 0.21, 0.05, 16]} />
        <meshStandardMaterial color="#78350f" roughness={0.95} />
      </mesh>
      {/* Folhas estilizadas */}
      {[
        { pos: [0, 0.72, 0], rot: [0.15, 0, 0.1], scale: [0.22, 0.34, 0.05], color: '#16a34a' },
        { pos: [-0.14, 0.65, 0.08], rot: [0.35, 0.5, 0.4], scale: [0.19, 0.28, 0.05], color: '#22c55e' },
        { pos: [0.15, 0.68, -0.05], rot: [-0.25, -0.4, -0.45], scale: [0.2, 0.3, 0.05], color: '#15803d' },
        { pos: [0.02, 0.64, 0.14], rot: [0.5, 0.1, -0.15], scale: [0.18, 0.26, 0.05], color: '#22c55e' },
      ].map((leaf, i) => (
        <mesh
          key={i}
          position={leaf.pos as [number, number, number]}
          rotation={leaf.rot as [number, number, number]}
          scale={leaf.scale as [number, number, number]}
          castShadow
        >
          <sphereGeometry args={[1, 10, 10]} />
          <meshStandardMaterial color={leaf.color} roughness={0.6} />
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
      const targetOpacity = activeSel ? 0.9 : activeHover ? 0.65 : 0.08;
      hoverRingMatRef.current.opacity = THREE.MathUtils.lerp(
        hoverRingMatRef.current.opacity,
        targetOpacity,
        0.18
      );
    }

    // Animação do Boneco sentado na cadeira ergonômica
    if (
      agentGroupRef.current &&
      headRef.current &&
      leftArmRef.current &&
      rightArmRef.current
    ) {
      if (vState === 'idle') {
        agentGroupRef.current.position.y = 0.68 + Math.sin(t * 2) * 0.02;
        headRef.current.rotation.y = Math.sin(t * 0.7) * 0.14;
        leftArmRef.current.rotation.x = -0.5;
        rightArmRef.current.rotation.x = -0.5;
      } else if (vState === 'thinking') {
        agentGroupRef.current.position.y = 0.7 + Math.sin(t * 3.5) * 0.03;
        headRef.current.rotation.y = Math.sin(t * 2.4) * 0.28;
        leftArmRef.current.rotation.x = -0.75 + Math.sin(t * 4) * 0.1;
        rightArmRef.current.rotation.x = -1.1;
      } else if (vState === 'working') {
        agentGroupRef.current.position.y =
          0.69 + Math.abs(Math.sin(t * 8)) * 0.025;
        headRef.current.rotation.y = Math.sin(t * 5) * 0.08;
        leftArmRef.current.rotation.x = -0.95 + Math.sin(t * 16) * 0.2;
        rightArmRef.current.rotation.x = -0.95 + Math.cos(t * 16) * 0.2;
      } else if (vState === 'validating') {
        agentGroupRef.current.position.y = 0.71 + Math.sin(t * 5) * 0.025;
        headRef.current.rotation.y = Math.sin(t * 4) * 0.2;
        leftArmRef.current.rotation.x = -0.85;
        rightArmRef.current.rotation.x = -0.85;
      } else if (vState === 'awaiting_approval') {
        agentGroupRef.current.position.y =
          0.74 + Math.abs(Math.sin(t * 4.5)) * 0.08;
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
          ? 0.35
          : vState === 'awaiting_approval' || vState === 'error'
            ? 1.1 + Math.sin(t * 7) * 0.4
            : 0.75 + Math.sin(t * 4.5) * 0.2;
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
      {/* Anel de Seleção/Hover Sutil no Piso */}
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.3, 2.46, 48]} />
        <meshStandardMaterial
          ref={hoverRingMatRef}
          color={config.accentColor}
          emissive={config.accentColor}
          emissiveIntensity={1.1}
          transparent
          opacity={0.08}
        />
      </mesh>

      {/* Tapete acolhedor da baia */}
      <RoundedBox
        args={[3.7, 0.04, 3.1]}
        radius={0.02}
        position={[0, 0.02, 0]}
        receiveShadow
      >
        <meshStandardMaterial
          color={isSelected ? '#233b4d' : isHovered ? '#1d3342' : '#172b38'}
          roughness={0.85}
        />
      </RoundedBox>

      {/* Friso frontal identificador da estação */}
      <mesh position={[0, 0.045, 1.5]}>
        <boxGeometry args={[3.4, 0.02, 0.06]} />
        <meshStandardMaterial
          color={config.accentColor}
          emissive={config.accentColor}
          emissiveIntensity={isSelected || isHovered ? 1.4 : 0.65}
        />
      </mesh>

      {/* Divisória / Painel Acústico lateral-traseiro com Post-its (inspirado na referência) */}
      <group position={[-1.45, 1.0, 0.15]}>
        <RoundedBox args={[0.1, 1.85, 2.0]} radius={0.03} castShadow receiveShadow>
          <meshStandardMaterial color="#2c7da0" roughness={0.75} />
        </RoundedBox>
        {/* Post-its coloridos no painel */}
        <mesh position={[0.056, 0.42, -0.35]}>
          <boxGeometry args={[0.01, 0.2, 0.2]} />
          <meshStandardMaterial color="#facc15" roughness={0.6} />
        </mesh>
        <mesh position={[0.056, 0.25, 0.05]}>
          <boxGeometry args={[0.01, 0.2, 0.2]} />
          <meshStandardMaterial color="#fb7185" roughness={0.6} />
        </mesh>
        <mesh position={[0.056, 0.5, 0.38]}>
          <boxGeometry args={[0.01, 0.18, 0.18]} />
          <meshStandardMaterial color="#fde047" roughness={0.6} />
        </mesh>
      </group>

      {/* MESA DE MADEIRA QUENTE + GAVETEIRO DE 3 GAVETAS */}
      <group position={[0, 0, 0.3]}>
        {/* Tampo de madeira quente */}
        <RoundedBox
          args={[2.5, 0.1, 1.25]}
          radius={0.04}
          position={[0, 0.78, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#c85a32" roughness={0.55} />
        </RoundedBox>

        {/* Pés esquerdos da mesa */}
        {[
          [-1.12, 0.39, -0.48],
          [-1.12, 0.39, 0.48],
        ].map((legPos, idx) => (
          <mesh key={idx} position={legPos as [number, number, number]} castShadow>
            <boxGeometry args={[0.08, 0.76, 0.08]} />
            <meshStandardMaterial color="#b24d28" roughness={0.6} />
          </mesh>
        ))}

        {/* Gaveteiro direito com 3 gavetas */}
        <group position={[0.82, 0.38, 0]}>
          <RoundedBox args={[0.74, 0.74, 1.06]} radius={0.02} castShadow receiveShadow>
            <meshStandardMaterial color="#b24d28" roughness={0.6} />
          </RoundedBox>
          {[0.21, 0, -0.21].map((yOff, i) => (
            <group key={i} position={[0, yOff, -0.535]}>
              <mesh>
                <boxGeometry args={[0.62, 0.18, 0.02]} />
                <meshStandardMaterial color="#d97043" roughness={0.55} />
              </mesh>
              {/* Puxador dourado */}
              <mesh position={[0, 0, -0.02]}>
                <boxGeometry args={[0.16, 0.025, 0.025]} />
                <meshStandardMaterial color="#fbbf24" metalness={0.3} roughness={0.4} />
              </mesh>
            </group>
          ))}
        </group>

        {/* OBJETOS ACIMA DA MESA */}
        {/* 1. Monitor Widescreen Prateado */}
        <group position={[-0.1, 1.18, 0.25]}>
          <mesh position={[0, -0.28, 0]} castShadow>
            <boxGeometry args={[0.14, 0.24, 0.08]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.3} roughness={0.4} />
          </mesh>
          <mesh position={[0, -0.34, -0.02]} castShadow>
            <boxGeometry args={[0.38, 0.03, 0.24]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.25} roughness={0.4} />
          </mesh>
          <RoundedBox args={[1.18, 0.68, 0.06]} radius={0.02} castShadow>
            <meshStandardMaterial color="#f1f5f9" roughness={0.35} />
          </RoundedBox>
          <mesh position={[0, 0, -0.035]}>
            <planeGeometry args={[1.08, 0.58]} />
            <meshStandardMaterial
              ref={monitorScreenMatRef}
              color={monitorColor}
              emissive={monitorColor}
              emissiveIntensity={0.6}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh position={[0, 0, 0.035]}>
            <planeGeometry args={[1.08, 0.58]} />
            <meshStandardMaterial
              color={monitorColor}
              emissive={monitorColor}
              emissiveIntensity={0.6}
            />
          </mesh>
        </group>

        {/* 2. Teclado & Mouse claros */}
        <mesh position={[-0.18, 0.84, -0.15]} castShadow>
          <boxGeometry args={[0.56, 0.025, 0.2]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.5} />
        </mesh>
        <RoundedBox args={[0.1, 0.03, 0.14]} radius={0.015} position={[0.22, 0.845, -0.15]} castShadow>
          <meshStandardMaterial color="#e2e8f0" roughness={0.45} />
        </RoundedBox>

        {/* 3. Caixinhas de som laterais */}
        <RoundedBox args={[0.14, 0.18, 0.14]} radius={0.02} position={[-0.84, 0.92, 0.2]} castShadow>
          <meshStandardMaterial color="#cbd5e1" roughness={0.5} />
        </RoundedBox>
        <RoundedBox args={[0.14, 0.18, 0.14]} radius={0.02} position={[0.64, 0.92, 0.2]} castShadow>
          <meshStandardMaterial color="#cbd5e1" roughness={0.5} />
        </RoundedBox>

        {/* 4. Caderno azul/accent e copo de café quente */}
        <RoundedBox
          args={[0.28, 0.04, 0.36]}
          radius={0.01}
          position={[0.62, 0.85, -0.22]}
          rotation={[0, 0.2, 0]}
          castShadow
        >
          <meshStandardMaterial color="#0284c7" roughness={0.6} />
        </RoundedBox>

        {/* Copo de café */}
        <group position={[0.98, 0.93, 0.12]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.075, 0.06, 0.18, 14]} />
            <meshStandardMaterial color="#fef3c7" roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.095, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 0.03, 14]} />
            <meshStandardMaterial color="#78350f" roughness={0.6} />
          </mesh>
        </group>

        {/* Lápis na mesa */}
        <mesh position={[-0.78, 0.84, -0.18]} rotation={[0, 0.4, Math.PI / 2]}>
          <cylinderGeometry args={[0.012, 0.012, 0.26, 8]} />
          <meshStandardMaterial color="#facc15" />
        </mesh>
        <mesh position={[-0.74, 0.84, -0.22]} rotation={[0, 0.55, Math.PI / 2]}>
          <cylinderGeometry args={[0.012, 0.012, 0.24, 8]} />
          <meshStandardMaterial color="#38bdf8" />
        </mesh>
      </group>

      {/* CADEIRA GIRATÓRIA ERGONÔMICA COM RODINHAS */}
      <group position={[-0.1, 0, -0.72]}>
        {/* Pistão central */}
        <mesh position={[0, 0.26, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.055, 0.38, 12]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.4} roughness={0.35} />
        </mesh>
        {/* Base estrela com 4 pés e rodízios */}
        {[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((ang, i) => (
          <group key={i} rotation={[0, ang, 0]}>
            <mesh position={[0.18, 0.09, 0]} rotation={[0, 0, -0.15]}>
              <boxGeometry args={[0.36, 0.04, 0.05]} />
              <meshStandardMaterial color="#cbd5e1" metalness={0.3} roughness={0.4} />
            </mesh>
            <mesh position={[0.34, 0.05, 0]}>
              <sphereGeometry args={[0.05, 10, 10]} />
              <meshStandardMaterial color="#0f172a" roughness={0.6} />
            </mesh>
          </group>
        ))}
        {/* Assento acolchoado */}
        <RoundedBox args={[0.64, 0.1, 0.6]} radius={0.04} position={[0, 0.46, 0]} castShadow>
          <meshStandardMaterial color="#182235" roughness={0.75} />
        </RoundedBox>
        {/* Suporte e encosto */}
        <mesh position={[0, 0.68, -0.28]}>
          <boxGeometry args={[0.12, 0.42, 0.04]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.3} />
        </mesh>
        <RoundedBox args={[0.6, 0.56, 0.1]} radius={0.04} position={[0, 0.85, -0.28]} castShadow>
          <meshStandardMaterial color="#182235" roughness={0.75} />
        </RoundedBox>
      </group>

      {/* BONECO LOW-POLY SENTADO NA CADEIRA */}
      <group ref={agentGroupRef} position={[-0.1, 0.68, -0.68]}>
        <RoundedBox
          args={[0.48, 0.62, 0.32]}
          radius={0.11}
          position={[0, 0.2, 0]}
          castShadow
        >
          <meshStandardMaterial color={config.accentColor} roughness={0.4} />
        </RoundedBox>

        <mesh ref={headRef} position={[0, 0.74, 0.02]} castShadow>
          <sphereGeometry args={[0.24, 20, 20]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.35} />
          <mesh position={[0, 0.02, 0.2]}>
            <boxGeometry args={[0.26, 0.08, 0.05]} />
            <meshStandardMaterial
              color={monitorColor}
              emissive={monitorColor}
              emissiveIntensity={1.0}
            />
          </mesh>
        </mesh>

        <mesh
          ref={leftArmRef}
          position={[-0.33, 0.3, 0.14]}
          rotation={[-0.5, 0, 0]}
          castShadow
        >
          <capsuleGeometry args={[0.075, 0.32, 8, 12]} />
          <meshStandardMaterial color={config.accentColor} />
        </mesh>

        <mesh
          ref={rightArmRef}
          position={[0.33, 0.3, 0.14]}
          rotation={[-0.5, 0, 0]}
          castShadow
        >
          <capsuleGeometry args={[0.075, 0.32, 8, 12]} />
          <meshStandardMaterial color={config.accentColor} />
        </mesh>
      </group>

      {/* Vaso de planta verde aconchegante ao lado da mesa */}
      <PottedPlant position={[1.58, 0, 0.35]} />

      {/* Beacon 3D de Revisão ou Erro */}
      {(agentState.visualState === 'awaiting_approval' ||
        agentState.visualState === 'error') && (
        <mesh ref={alertBeaconRef} position={[-0.1, 2.42, -0.68]}>
          <octahedronGeometry args={[0.19, 0]} />
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
      <Html position={[0, 2.75, -0.2]} center zIndexRange={[10, 0]}>
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
              ? 'rgba(15, 23, 42, 0.96)'
              : 'rgba(9, 13, 20, 0.92)',
            border: `1px solid ${
              isSelected || isHovered ? config.accentColor : '#1e293b'
            }`,
            borderRadius: '10px',
            padding: '7px 11px',
            minWidth: '175px',
            maxWidth: '220px',
            boxShadow:
              isSelected || isHovered
                ? `0 8px 24px rgba(0,0,0,0.55), 0 0 0 1px ${config.accentColor}40`
                : '0 6px 16px rgba(0,0,0,0.45)',
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
              marginBottom: agentState.statusBubble ? '4px' : '0',
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
                fontSize: '10.5px',
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
