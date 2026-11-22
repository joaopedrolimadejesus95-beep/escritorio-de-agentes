import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { AgentVisualState, DepartmentId } from '@ai-office/shared';
import { useOfficeStore } from '../store/useOfficeStore.js';

export interface DepartmentDeskConfig {
  department: DepartmentId;
  label: string;
  position: [number, number, number];
  accentColor: string;
}

export const DEPARTMENT_DESKS: Record<DepartmentId, DepartmentDeskConfig> = {
  director: {
    department: 'director',
    label: 'DIRETOR (DAG PLANNER)',
    position: [0, 0, -5],
    accentColor: '#a855f7',
  },
  research: {
    department: 'research',
    label: 'POD RESEARCH',
    position: [-5, 0, -1],
    accentColor: '#38bdf8',
  },
  design: {
    department: 'design',
    label: 'POD DESIGN',
    position: [5, 0, -1],
    accentColor: '#ec4899',
  },
  engineering: {
    department: 'engineering',
    label: 'POD ENGINEERING',
    position: [-4, 0, 4],
    accentColor: '#10b981',
  },
  growth: {
    department: 'growth',
    label: 'POD GROWTH',
    position: [4, 0, 4],
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
  idle: 'IDLE',
  thinking: 'THINKING',
  working: 'WORKING',
  validating: 'VALIDATING',
  awaiting_approval: 'QUALITY GATE',
  error: 'ERROR',
};

interface AgentDeskProps {
  config: DepartmentDeskConfig;
}

export function AgentDesk({ config }: AgentDeskProps) {
  const agentGroupRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Mesh>(null);
  const leftArmRef = useRef<THREE.Mesh>(null);
  const rightArmRef = useRef<THREE.Mesh>(null);
  const monitorScreenMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const alertBeaconRef = useRef<THREE.Mesh>(null);

  // Seletores leves para o overlay HTML e seleção de Drawer
  const agentState = useOfficeStore((s) => s.agents[config.department]);
  const selectedDepartment = useOfficeStore((s) => s.selectedDepartment);
  const selectDepartment = useOfficeStore((s) => s.selectDepartment);
  const isSelected = selectedDepartment === config.department;

  // Animação 60fps via useFrame lendo Zustand diretamente sem re-renderizar o React
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const currentAgent = useOfficeStore.getState().agents[config.department];
    const vState = currentAgent?.visualState ?? 'idle';

    // 1. Animação do Corpo e Cabeça do Boneco Low-Poly
    if (agentGroupRef.current && headRef.current && leftArmRef.current && rightArmRef.current) {
      if (vState === 'idle') {
        agentGroupRef.current.position.y = 0.75 + Math.sin(t * 2) * 0.03;
        headRef.current.rotation.y = Math.sin(t * 0.8) * 0.15;
        leftArmRef.current.rotation.x = -0.3;
        rightArmRef.current.rotation.x = -0.3;
      } else if (vState === 'thinking') {
        agentGroupRef.current.position.y = 0.78 + Math.sin(t * 4) * 0.05;
        headRef.current.rotation.y = Math.sin(t * 3) * 0.35;
        leftArmRef.current.rotation.x = -0.7 + Math.sin(t * 4) * 0.15;
        rightArmRef.current.rotation.x = -1.1;
      } else if (vState === 'working') {
        // Digitando rápido no teclado
        agentGroupRef.current.position.y = 0.76 + Math.abs(Math.sin(t * 10)) * 0.04;
        headRef.current.rotation.y = Math.sin(t * 6) * 0.08;
        leftArmRef.current.rotation.x = -0.9 + Math.sin(t * 18) * 0.25;
        rightArmRef.current.rotation.x = -0.9 + Math.cos(t * 18) * 0.25;
      } else if (vState === 'validating') {
        // Inspecionando com precisão
        agentGroupRef.current.position.y = 0.8 + Math.sin(t * 6) * 0.04;
        headRef.current.rotation.y = Math.sin(t * 5) * 0.25;
        leftArmRef.current.rotation.x = -0.8;
        rightArmRef.current.rotation.x = -0.8;
      } else if (vState === 'awaiting_approval') {
        // Acenando / Alerta de Quality Gate
        agentGroupRef.current.position.y = 0.82 + Math.abs(Math.sin(t * 5)) * 0.12;
        headRef.current.rotation.y = 0;
        leftArmRef.current.rotation.x = -2.4 + Math.sin(t * 8) * 0.3;
        rightArmRef.current.rotation.x = -2.4 - Math.sin(t * 8) * 0.3;
      } else if (vState === 'error') {
        // Shake de erro
        agentGroupRef.current.position.y = 0.72;
        headRef.current.rotation.y = Math.sin(t * 25) * 0.2;
        leftArmRef.current.rotation.x = -0.2;
        rightArmRef.current.rotation.x = -0.2;
      }
    }

    // 2. Brilho Emissivo do Monitor conforme o AgentVisualState
    if (monitorScreenMatRef.current) {
      const targetHex = VISUAL_STATE_MONITOR_COLORS[vState];
      monitorScreenMatRef.current.color.set(targetHex);
      monitorScreenMatRef.current.emissive.set(targetHex);
      const pulse =
        vState === 'idle'
          ? 0.25
          : vState === 'awaiting_approval' || vState === 'error'
            ? 1.1 + Math.sin(t * 8) * 0.5
            : 0.85 + Math.sin(t * 5) * 0.25;
      monitorScreenMatRef.current.emissiveIntensity = pulse;
    }

    // 3. Giro do Beacon de Quality Gate / Erro acima do boneco
    if (alertBeaconRef.current) {
      alertBeaconRef.current.rotation.y = t * 3;
      alertBeaconRef.current.position.y = 2.45 + Math.sin(t * 5) * 0.08;
    }
  });

  const monitorColor = VISUAL_STATE_MONITOR_COLORS[agentState.visualState];

  return (
    <group
      position={config.position}
      onClick={(e) => {
        e.stopPropagation();
        selectDepartment(config.department);
      }}
      onPointerOver={() => {
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default';
      }}
    >
      {/* Tapete / Plataforma de Identificação do Departamento */}
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[3.4, 0.04, 2.8]} />
        <meshStandardMaterial
          color={isSelected ? config.accentColor : '#1e293b'}
          roughness={0.8}
        />
      </mesh>

      {/* Borda Luminosa do Pod */}
      <mesh position={[0, 0.045, 1.35]}>
        <boxGeometry args={[3.4, 0.03, 0.08]} />
        <meshStandardMaterial
          color={config.accentColor}
          emissive={config.accentColor}
          emissiveIntensity={isSelected ? 1.4 : 0.6}
        />
      </mesh>

      {/* Tampo da Mesa */}
      <RoundedBox
        args={[2.4, 0.12, 1.2]}
        radius={0.04}
        position={[0, 0.78, 0.25]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#334155" roughness={0.5} metalness={0.2} />
      </RoundedBox>

      {/* Pés da Mesa */}
      {[
        [-1.05, 0.39, -0.25],
        [1.05, 0.39, -0.25],
        [-1.05, 0.39, 0.75],
        [1.05, 0.39, 0.75],
      ].map((legPos, idx) => (
        <mesh
          key={idx}
          position={legPos as [number, number, number]}
          castShadow
        >
          <cylinderGeometry args={[0.05, 0.05, 0.76, 12]} />
          <meshStandardMaterial color="#0f172a" metalness={0.6} roughness={0.3} />
        </mesh>
      ))}

      {/* Monitor Emissivo (Voltado para o Agente + Visível na Câmera Isométrica) */}
      <group position={[0, 1.12, 0.45]}>
        {/* Base do Monitor */}
        <mesh position={[0, -0.22, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.14, 0.2, 12]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>

        {/* Chassi do Monitor */}
        <RoundedBox args={[1.05, 0.62, 0.08]} radius={0.03} castShadow>
          <meshStandardMaterial color="#0f172a" roughness={0.4} />
        </RoundedBox>

        {/* Tela Emissiva Dupla Face (Brilha conforme o AgentVisualState) */}
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

      {/* Boneco Geométrico Low-Poly do Agente */}
      <group ref={agentGroupRef} position={[0, 0.75, -0.55]}>
        {/* Torso */}
        <RoundedBox
          args={[0.55, 0.7, 0.35]}
          radius={0.12}
          position={[0, 0.2, 0]}
          castShadow
        >
          <meshStandardMaterial color={config.accentColor} roughness={0.35} />
        </RoundedBox>

        {/* Cabeça */}
        <mesh ref={headRef} position={[0, 0.82, 0]} castShadow>
          <sphereGeometry args={[0.26, 20, 20]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.3} />
          {/* Visor Digital do Agente */}
          <mesh position={[0, 0.03, 0.21]}>
            <boxGeometry args={[0.28, 0.1, 0.06]} />
            <meshStandardMaterial
              color={monitorColor}
              emissive={monitorColor}
              emissiveIntensity={1.1}
            />
          </mesh>
        </mesh>

        {/* Braço Esquerdo */}
        <mesh
          ref={leftArmRef}
          position={[-0.38, 0.32, 0.15]}
          rotation={[-0.3, 0, 0]}
          castShadow
        >
          <capsuleGeometry args={[0.08, 0.35, 8, 12]} />
          <meshStandardMaterial color={config.accentColor} />
        </mesh>

        {/* Braço Direito */}
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

      {/* Diamante 3D de Alerta em Quality Gate ou Erro */}
      {(agentState.visualState === 'awaiting_approval' ||
        agentState.visualState === 'error') && (
        <mesh ref={alertBeaconRef} position={[0, 2.45, -0.55]}>
          <octahedronGeometry args={[0.22, 0]} />
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
            emissiveIntensity={1.5}
          />
        </mesh>
      )}

      {/* Placa de Identificação na Borda da Estação */}
      <Html
        position={[0, 0.15, 1.35]}
        center
        zIndexRange={[5, 0]}
      >
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.9)',
            border: `1px solid ${config.accentColor}`,
            color: '#e2e8f0',
            fontSize: '10px',
            fontWeight: 800,
            letterSpacing: '0.06em',
            padding: '2px 8px',
            borderRadius: '4px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {config.label}
        </div>
      </Html>

      {/* Balão HTML Suspenso do Boneco */}
      <Html
        position={[0, 2.55, -0.35]}
        center
        zIndexRange={[10, 0]}
      >
        <div
          onClick={() => selectDepartment(config.department)}
          style={{
            cursor: 'pointer',
            background: 'rgba(15, 23, 42, 0.92)',
            border: `1.5px solid ${monitorColor}`,
            borderRadius: '10px',
            padding: '6px 10px',
            minWidth: '150px',
            maxWidth: '220px',
            boxShadow: '0 8px 20px rgba(0,0,0,0.45)',
            backdropFilter: 'blur(6px)',
            color: '#f8fafc',
            fontSize: '11px',
            userSelect: 'none',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '6px',
              marginBottom: agentState.statusBubble ? '4px' : '0',
            }}
          >
            <span
              style={{
                fontWeight: 700,
                color: config.accentColor,
                letterSpacing: '0.04em',
              }}
            >
              {config.department.toUpperCase()}
            </span>
            <span
              style={{
                background: monitorColor,
                color: '#090d16',
                fontWeight: 800,
                fontSize: '9px',
                padding: '2px 5px',
                borderRadius: '4px',
              }}
            >
              {VISUAL_STATE_BADGE_LABELS[agentState.visualState]}
            </span>
          </div>
          {agentState.statusBubble && (
            <div
              style={{
                color: '#cbd5e1',
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
