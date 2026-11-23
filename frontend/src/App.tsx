import { useEffect, useState } from 'react';
import {
  Cpu,
  History,
  LogIn,
  LogOut,
  Pause,
  Play,
  Settings2,
  User,
  X,
} from 'lucide-react';
import type { DepartmentId } from '@ai-office/shared';
import { OfficeScene } from './components/OfficeScene.js';
import { AgentDrawer } from './components/AgentDrawer.js';
import { DEPARTMENT_DESKS } from './components/AgentDesk.js';
import { AuthModal } from './components/AuthModal.js';
import { LLMSettingsModal } from './components/LLMSettingsModal.js';
import { ProjectHistoryModal } from './components/ProjectHistoryModal.js';
import { useOfficeStore } from './store/useOfficeStore.js';

const PIPELINE_ORDER: DepartmentId[] = [
  'director',
  'research',
  'engineering',
  'design',
  'growth',
];

export function App() {
  const connected = useOfficeStore((s) => s.connected);
  const project = useOfficeStore((s) => s.project);
  const agents = useOfficeStore((s) => s.agents);
  const selectedDepartment = useOfficeStore((s) => s.selectedDepartment);
  const selectDepartment = useOfficeStore((s) => s.selectDepartment);
  const connectSocket = useOfficeStore((s) => s.connectSocket);
  const createProject = useOfficeStore((s) => s.createProject);
  const pauseProject = useOfficeStore((s) => s.pauseProject);
  const lastError = useOfficeStore((s) => s.lastError);
  const clearError = useOfficeStore((s) => s.clearError);
  const llmStatus = useOfficeStore((s) => s.llmStatus);
  const setSettingsModalOpen = useOfficeStore((s) => s.setSettingsModalOpen);
  const authUser = useOfficeStore((s) => s.authUser);
  const setAuthModalOpen = useOfficeStore((s) => s.setAuthModalOpen);
  const setHistoryModalOpen = useOfficeStore((s) => s.setHistoryModalOpen);
  const logout = useOfficeStore((s) => s.logout);

  const [scopeInput, setScopeInput] = useState(
    'Plataforma SaaS para gestão financeira e agendamento de clínicas odontológicas'
  );
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const projectIdFromUrl = params.get('projectId') ?? undefined;
    connectSocket(projectIdFromUrl);
  }, [connectSocket]);

  const handleLaunchProject = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!scopeInput.trim() || creating) return;
    setCreating(true);
    try {
      await createProject({
        title: scopeInput.trim().slice(0, 60),
        rawScope: scopeInput.trim(),
        tokenBudget: 80000,
      });
    } catch {
      // Erro já tratado no store e exibido no banner/modal
    } finally {
      setCreating(false);
    }
  };

  const budgetPercent = project
    ? Math.min(100, Math.round((project.tokensUsed / project.tokenBudget) * 100))
    : 0;

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        background: '#070a10',
      }}
    >
      {/* HUD Superior Compacto e Sóbrio */}
      <header
        style={{
          position: 'fixed',
          top: '14px',
          left: '16px',
          right: selectedDepartment ? 'min(92vw, 700px)' : '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          padding: '12px 16px',
          background: 'rgba(11, 16, 27, 0.9)',
          border: '1px solid #1e293b',
          borderRadius: '12px',
          backdropFilter: 'blur(12px)',
          zIndex: 20,
          transition: 'right 0.22s ease',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '14px',
            flexWrap: 'wrap',
          }}
        >
          {/* Marca + Status de Rede */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: connected ? '#10b981' : '#ef4444',
                boxShadow: connected ? '0 0 8px #10b981' : '0 0 8px #ef4444',
              }}
            />
            <div>
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#f8fafc',
                  letterSpacing: '0.02em',
                }}
              >
                AI Office Studio
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                {project
                  ? `${project.title} · ${project.status.toUpperCase()}`
                  : 'Orquestração Multiagente Determinística'}
              </div>
            </div>
          </div>

          {/* Formulário de Novo Escopo */}
          <form
            onSubmit={handleLaunchProject}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flex: 1,
              minWidth: '260px',
              maxWidth: '520px',
            }}
          >
            <input
              type="text"
              value={scopeInput}
              onChange={(e) => setScopeInput(e.target.value)}
              placeholder="Descreva o produto ou sistema que a equipe deve construir..."
              style={{
                flex: 1,
                background: '#070a10',
                border: '1px solid #334155',
                borderRadius: '8px',
                padding: '8px 12px',
                color: '#f8fafc',
                fontSize: '12px',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={creating}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: '#38bdf8',
                border: 'none',
                color: '#06131f',
                fontWeight: 700,
                fontSize: '12px',
                padding: '8px 14px',
                borderRadius: '8px',
                cursor: creating ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <Play size={13} fill="currentColor" />
              {creating ? 'Planejando...' : 'Iniciar'}
            </button>
            {project?.status === 'running' && (
              <button
                type="button"
                onClick={() => pauseProject('Pausado pelo usuário')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  color: '#e2e8f0',
                  fontWeight: 600,
                  fontSize: '12px',
                  padding: '8px 11px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                <Pause size={13} />
                Pausar
              </button>
            )}
          </form>

          {/* Conta, Histórico, Configurador de IA + Orçamento */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {authUser ? (
              <>
                <button
                  type="button"
                  onClick={() => setHistoryModalOpen(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: '#0f172a',
                    border: '1px solid #1e293b',
                    color: '#e2e8f0',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  title="Retomar projetos anteriores"
                >
                  <History size={13} color="#38bdf8" />
                  Histórico
                </button>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: '#070a10',
                    border: '1px solid #1e293b',
                    borderRadius: '8px',
                    padding: '5px 9px',
                    fontSize: '11.5px',
                    color: '#cbd5e1',
                  }}
                >
                  <User size={12} color="#38bdf8" />
                  <span>{authUser.name.split(' ')[0]}</span>
                  <button
                    type="button"
                    onClick={() => void logout()}
                    title="Sair da conta"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#64748b',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      padding: '2px',
                    }}
                  >
                    <LogOut size={12} />
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#17253b',
                  border: '1px solid rgba(56, 189, 248, 0.45)',
                  color: '#bae6fd',
                  borderRadius: '8px',
                  padding: '6px 10px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <LogIn size={13} />
                Entrar / Criar Conta
              </button>
            )}
            <button
              type="button"
              onClick={() => setSettingsModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: llmStatus?.configured
                  ? 'rgba(16, 185, 129, 0.12)'
                  : 'rgba(245, 158, 11, 0.14)',
                border: `1px solid ${
                  llmStatus?.configured
                    ? 'rgba(16, 185, 129, 0.35)'
                    : 'rgba(245, 158, 11, 0.45)'
                }`,
                color: llmStatus?.configured ? '#6ee7b7' : '#fcd34d',
                borderRadius: '8px',
                padding: '6px 10px',
                fontSize: '11.5px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Cpu size={13} />
              {llmStatus?.configured
                ? `${llmStatus.provider}/${llmStatus.model}`
                : 'Configurar IA'}
              <Settings2 size={12} />
            </button>

            <div style={{ minWidth: '140px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '10.5px',
                  color: '#94a3b8',
                  marginBottom: '4px',
                }}
              >
                <span>Tokens</span>
                <strong style={{ color: '#e2e8f0' }}>
                  {project
                    ? `${project.tokensUsed.toLocaleString()} / ${project.tokenBudget.toLocaleString()}`
                    : '0'}
                </strong>
              </div>
              <div
                style={{
                  width: '100%',
                  height: '5px',
                  background: '#1e293b',
                  borderRadius: '999px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${budgetPercent}%`,
                    height: '100%',
                    background:
                      budgetPercent > 85
                        ? '#ef4444'
                        : budgetPercent > 60
                          ? '#f59e0b'
                          : '#38bdf8',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Barra Rápida de Navegação pelos Agentes do Fluxo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap',
            paddingTop: '6px',
            borderTop: '1px solid #151e2e',
          }}
        >
          {PIPELINE_ORDER.map((dept) => {
            const desk = DEPARTMENT_DESKS[dept];
            const ag = agents[dept];
            const active = selectedDepartment === dept;
            const awaiting = ag.visualState === 'awaiting_approval';
            const working =
              ag.visualState === 'working' ||
              ag.visualState === 'thinking' ||
              ag.visualState === 'validating';

            return (
              <button
                key={dept}
                type="button"
                onClick={() => selectDepartment(active ? null : dept)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                  background: active ? '#1e293b' : '#070a10',
                  border: `1px solid ${
                    active
                      ? desk.accentColor
                      : awaiting
                        ? '#f59e0b'
                        : '#1e293b'
                  }`,
                  color: active ? '#f8fafc' : '#cbd5e1',
                  borderRadius: '8px',
                  padding: '5px 10px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <span
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: awaiting
                      ? '#f59e0b'
                      : working
                        ? '#22c55e'
                        : ag.visualState === 'error'
                          ? '#ef4444'
                          : desk.accentColor,
                  }}
                />
                {desk.label}
                {awaiting && (
                  <span
                    style={{
                      fontSize: '9.5px',
                      color: '#fbbf24',
                      fontWeight: 700,
                    }}
                  >
                    (Revisão)
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* Banner de Erro Limpo */}
      {lastError && (
        <div
          style={{
            position: 'fixed',
            bottom: '18px',
            left: '18px',
            maxWidth: '480px',
            background: '#1f1215',
            border: '1px solid #7f1d1d',
            color: '#fecaca',
            padding: '10px 14px',
            borderRadius: '10px',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            zIndex: 40,
          }}
        >
          <span>{lastError}</span>
          <button
            type="button"
            onClick={clearError}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fca5a5',
              cursor: 'pointer',
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <OfficeScene />
      <AgentDrawer />
      <LLMSettingsModal />
      <AuthModal />
      <ProjectHistoryModal />
    </div>
  );
}
