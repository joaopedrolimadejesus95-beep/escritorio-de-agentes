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
  accentColor: string;
}

export const DEPARTMENT_DESKS: Record<DepartmentId, DepartmentDeskConfig> = {
  director: {
    department: 'director',
    label: 'Diretor Executivo',
    roleSubtitle: 'Orquestração & DAG Planner',
    position: [0, 0, -6.5],
    accentColor: '#a855f7',
  },
  research: {
    department: 'research',
    label: 'Pesquisa de Mercado',
    roleSubtitle: 'Concorrentes, Preços & Dores',
    position: [-6.5, 0, -1.2],
    accentColor: '#38bdf8',
  },
  engineering: {
    department: 'engineering',
    label: 'Arquitetura & Dados',
    roleSubtitle: 'Stack, Mermaid, SQL & APIs',
    position: [6.5, 0, -1.2],
    accentColor: '#10b981',
  },
  design: {
    department: 'design',
    label: 'Design de Interface',
    roleSubtitle: 'Design System & Telas HTML',
    position: [-5, 0, 5.2],
    accentColor: '#ec4899',
  },
  growth: {
    department: 'growth',
    label: 'Estratégia & Growth',
    roleSubtitle: 'GTM, Preços & Aquisição',
    position: [5, 0, 5.2],
    accentColor: '#f59e0b',
  },
};

const VISUAL_STATE_MONITOR_COLORS: Record<AgentVisualState, string> = {
  idle: '#334155',
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

    // Elevação sutil no hover para feedback tátil imediato
    if (rootGroupRef.current) {
      const targetScale = activeHover || activeSel ? 1.035 : 1.0;
      rootGroupRef.current.scale.lerp(
        new THREE.Vector3(targetScale, targetScale, targetScale),
        0.15
      );
    }

    if (hoverRingMatRef.current) {
      const targetOpacity = activeSel ? 0.95 : activeHover ? 0.65 : 0.12;
      hoverRingMatRef.current.opacity = THREE.MathUtils.lerp(
        hoverRingMatRef.current.opacity,
        targetOpacity,
        0.18
      );
    }

    // Animação do Boneco Low-Poly
    if (
      agentGroupRef.current &&
      headRef.current &&
      leftArmRef.current &&
      rightArmRef.current
    ) {
      if (vState === 'idle') {
        agentGroupRef.current.position.y = 0.75 + Math.sin(t * 2) * 0.025;
        headRef.current.rotation.y = Math.sin(t * 0.7) * 0.12;
        leftArmRef.current.rotation.x = -0.3;
        rightArmRef.current.rotation.x = -0.3;
      } else if (vState === 'thinking') {
        agentGroupRef.current.position.y = 0.78 + Math.sin(t * 4) * 0.04;
        headRef.current.rotation.y = Math.sin(t * 2.5) * 0.3;
        leftArmRef.current.rotation.x = -0.7 + Math.sin(t * 4) * 0.12;
        rightArmRef.current.rotation.x = -1.05;
      } else if (vState === 'working') {
        agentGroupRef.current.position.y =
          0.76 + Math.abs(Math.sin(t * 9)) * 0.035;
        headRef.current.rotation.y = Math.sin(t * 5) * 0.08;
        leftArmRef.current.rotation.x = -0.9 + Math.sin(t * 16) * 0.22;
        rightArmRef.current.rotation.x = -0.9 + Math.cos(t * 16) * 0.22;
      } else if (vState === 'validating') {
        agentGroupRef.current.position.y = 0.8 + Math.sin(t * 5) * 0.035;
        headRef.current.rotation.y = Math.sin(t * 4) * 0.22;
        leftArmRef.current.rotation.x = -0.8;
        rightArmRef.current.rotation.x = -0.8;
      } else if (vState === 'awaiting_approval') {
        agentGroupRef.current.position.y =
          0.82 + Math.abs(Math.sin(t * 4.5)) * 0.1;
        headRef.current.rotation.y = 0;
        leftArmRef.current.rotation.x = -2.3 + Math.sin(t * 7) * 0.25;
        rightArmRef.current.rotation.x = -2.3 - Math.sin(t * 7) * 0.25;
      } else if (vState === 'error') {
        agentGroupRef.current.position.y = 0.72;
        headRef.current.rotation.y = Math.sin(t * 20) * 0.18;
        leftArmRef.current.rotation.x = -0.2;
        rightArmRef.current.rotation.x = -0.2;
      }
    }

    if (monitorScreenMatRef.current) {
      const targetHex = VISUAL_STATE_MONITOR_COLORS[vState];
      monitorScreenMatRef.current.color.set(targetHex);
      monitorScreenMatRef.current.emissive.set(targetHex);
      monitorScreenMatRef.current.emissiveIntensity =
        vState === 'idle'
          ? 0.25
          : vState === 'awaiting_approval' || vState === 'error'
            ? 1.15 + Math.sin(t * 7) * 0.45
            : 0.85 + Math.sin(t * 4.5) * 0.22;
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
      {/* Anel de Destaque no Piso (Hover / Seleção) */}
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.15, 2.32, 48]} />
        <meshStandardMaterial
          ref={hoverRingMatRef}
          color={config.accentColor}
          emissive={config.accentColor}
          emissiveIntensity={1.2}
          transparent
          opacity={0.12}
        />
      </mesh>

      {/* Plataforma da Estação */}
      <RoundedBox args={[3.5, 0.08, 2.9]} radius={0.04} position={[0, 0.04, 0]} receiveShadow>
        <meshStandardMaterial
          color={isSelected ? '#1e293b' : isHovered ? '#172033' : '#111827'}
          roughness={0.75}
        />
      </RoundedBox>

      {/* Friso de Identificação */}
      <mesh position={[0, 0.085, 1.4]}>
        <boxGeometry args={[3.3, 0.025, 0.06]} />
        <meshStandardMaterial
          color={config.accentColor}
          emissive={config.accentColor}
          emissiveIntensity={isSelected || isHovered ? 1.6 : 0.7}
        />
      </mesh>

      {/* Mesa */}
      <RoundedBox
        args={[2.4, 0.11, 1.15]}
        radius={0.04}
        position={[0, 0.78, 0.25]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#273244" roughness={0.55} metalness={0.18} />
      </RoundedBox>

      {/* Pés da Mesa */}
      {[
        [-1.05, 0.39, -0.22],
        [1.05, 0.39, -0.22],
        [-1.05, 0.39, 0.72],
        [1.05, 0.39, 0.72],
      ].map((legPos, idx) => (
        <mesh key={idx} position={legPos as [number, number, number]} castShadow>
          <cylinderGeometry args={[0.045, 0.045, 0.76, 12]} />
          <meshStandardMaterial color="#0f172a" metalness={0.6} roughness={0.35} />
        </mesh>
      ))}

      {/* Monitor */}
      <group position={[0, 1.12, 0.45]}>
        <mesh position={[0, -0.22, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.14, 0.2, 12]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>
        <RoundedBox args={[1.05, 0.62, 0.08]} radius={0.03} castShadow>
          <meshStandardMaterial color="#0f172a" roughness={0.4} />
        </RoundedBox>
        <mesh position={[0, 0, -0.045]}>
          <planeGeometry args={[0.95, 0.52]} />
          <meshStandardMaterial
            ref={monitorScreenMatRef}
            color={monitorColor}
            emissive={monitorColor}
            emissiveIntensity={0.8}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh position={[0, 0, 0.045]}>
          <planeGeometry args={[0.95, 0.52]} />
          <meshStandardMaterial
            color={monitorColor}
            emissive={monitorColor}
            emissiveIntensity={0.8}
          />
        </mesh>
      </group>

      {/* Boneco Geométrico Low-Poly */}
      <group ref={agentGroupRef} position={[0, 0.75, -0.55]}>
        <RoundedBox
          args={[0.55, 0.7, 0.35]}
          radius={0.12}
          position={[0, 0.2, 0]}
          castShadow
        >
          <meshStandardMaterial color={config.accentColor} roughness={0.35} />
        </RoundedBox>

        <mesh ref={headRef} position={[0, 0.82, 0]} castShadow>
          <sphereGeometry args={[0.26, 20, 20]} />
          <meshStandardMaterial color="#f1f5f9" roughness={0.35} />
          <mesh position={[0, 0.03, 0.21]}>
            <boxGeometry args={[0.28, 0.09, 0.06]} />
            <meshStandardMaterial
              color={monitorColor}
              emissive={monitorColor}
              emissiveIntensity={1.1}
            />
          </mesh>
        </mesh>

        <mesh
          ref={leftArmRef}
          position={[-0.38, 0.32, 0.15]}
          rotation={[-0.3, 0, 0]}
          castShadow
        >
          <capsuleGeometry args={[0.08, 0.35, 8, 12]} />
          <meshStandardMaterial color={config.accentColor} />
        </mesh>

        <mesh
          ref={rightArmRef}
          position={[0.38, 0.32, 0.15]}
          rotation={[-0.3, 0, 0]}
          castShadow
        >
          <capsuleGeometry args={[0.08, 0.35, 8, 12]} />
          <meshStandardMaterial color={config.accentColor} />
        </mesh>
      </group>

      {/* Beacon 3D de Revisão ou Erro */}
      {(agentState.visualState === 'awaiting_approval' ||
        agentState.visualState === 'error') && (
        <mesh ref={alertBeaconRef} position={[0, 2.42, -0.55]}>
          <octahedronGeometry args={[0.2, 0]} />
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
            emissiveIntensity={1.4}
          />
        </mesh>
      )}

      {/* Card Sóbrio Suspenso (Clicável e com Hover Sincronizado) */}
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
