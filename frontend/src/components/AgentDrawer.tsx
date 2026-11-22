import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Maximize2,
  Minimize2,
  RotateCcw,
  Terminal,
  X,
} from 'lucide-react';
import { useOfficeStore } from '../store/useOfficeStore.js';
import { DEPARTMENT_DESKS } from './AgentDesk.js';
import {
  DesignRenderer,
  EngineeringRenderer,
  GrowthRenderer,
  ResearchRenderer,
} from './renderers/DepartmentRenderers.js';

export function AgentDrawer() {
  const selectedDepartment = useOfficeStore((s) => s.selectedDepartment);
  const selectDepartment = useOfficeStore((s) => s.selectDepartment);
  const agents = useOfficeStore((s) => s.agents);
  const tasks = useOfficeStore((s) => s.tasks);
  const artifacts = useOfficeStore((s) => s.artifacts);
  const approveTask = useOfficeStore((s) => s.approveTask);
  const rejectTask = useOfficeStore((s) => s.rejectTask);
  const retryTask = useOfficeStore((s) => s.retryTask);

  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'deliverable' | 'tools' | 'tasks'>(
    'deliverable'
  );
  const [selectedArtifactIdx, setSelectedArtifactIdx] = useState(0);

  if (!selectedDepartment) {
    return null;
  }

  const deskConfig = DEPARTMENT_DESKS[selectedDepartment];
  const agent = agents[selectedDepartment];
  const departmentTasks = tasks.filter(
    (t) => t.department === selectedDepartment
  );
  const departmentArtifacts = artifacts.filter(
    (a) => a.department === selectedDepartment
  );
  const activeArtifact =
    departmentArtifacts[selectedArtifactIdx] ?? departmentArtifacts[0] ?? null;

  const awaitingTask = departmentTasks.find(
    (t) => t.status === 'awaiting_approval'
  );
  const failedTask = departmentTasks.find((t) => t.status === 'failed');

  const handleRetry = async (taskId: string) => {
    setSubmitting(true);
    setActionError(null);
    try {
      await retryTask(taskId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (taskId: string) => {
    setSubmitting(true);
    setActionError(null);
    try {
      await approveTask(taskId);
      setFeedback('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async (taskId: string) => {
    if (feedback.trim().length < 3) {
      setActionError(
        'Descreva objetivamente o ajuste desejado (mínimo 3 caracteres).'
      );
      return;
    }
    setSubmitting(true);
    setActionError(null);
    try {
      await rejectTask(taskId, feedback.trim());
      setFeedback('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <aside
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: expanded ? 'min(92vw, 960px)' : 'min(92vw, 680px)',
        height: '100vh',
        background: '#090d14',
        borderLeft: '1px solid #1e293b',
        boxShadow: '-20px 0 50px rgba(0, 0, 0, 0.7)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 60,
        color: '#f8fafc',
        transition: 'width 0.22s ease',
      }}
    >
      {/* Header Sóbrio */}
      <div
        style={{
          padding: '18px 24px',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#0b101b',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            style={{
              width: '10px',
              height: '28px',
              borderRadius: '4px',
              background: deskConfig.accentColor,
            }}
          />
          <div>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#94a3b8',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {deskConfig.roleSubtitle}
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>
              {deskConfig.label}
            </h2>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: '999px',
              background: '#111827',
              border: '1px solid #1e293b',
              color: deskConfig.accentColor,
            }}
          >
            {agent.visualState.replace('_', ' ').toUpperCase()}
          </span>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            title={expanded ? 'Largura padrão' : 'Expandir painel'}
            style={iconBtnStyle}
          >
            {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button
            type="button"
            onClick={() => selectDepartment(null)}
            title="Fechar painel"
            style={iconBtnStyle}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Sub-barra de Navegação do Drawer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          borderBottom: '1px solid #1e293b',
          background: '#090d14',
        }}
      >
        <div style={{ display: 'flex', gap: '20px' }}>
          {[
            { id: 'deliverable', label: 'Entrega & Análise' },
            {
              id: 'tools',
              label: `Atividade & Ferramentas (${agent.recentTools?.length ?? 0})`,
            },
            {
              id: 'tasks',
              label: `Tarefas DAG (${departmentTasks.length})`,
            },
          ].map((tab) => {
            const active = drawerTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDrawerTab(tab.id as any)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: active
                    ? `2px solid ${deskConfig.accentColor}`
                    : '2px solid transparent',
                  padding: '12px 2px',
                  fontSize: '12.5px',
                  fontWeight: active ? 600 : 500,
                  color: active ? '#f8fafc' : '#94a3b8',
                  cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Seletor de Versão do Artefato (v1, v2...) */}
        {departmentArtifacts.length > 1 && drawerTab === 'deliverable' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: '#64748b' }}>Versão:</span>
            {departmentArtifacts.map((art, idx) => (
              <button
                key={art.id}
                type="button"
                onClick={() => setSelectedArtifactIdx(idx)}
                style={{
                  background:
                    idx === selectedArtifactIdx ? '#1e293b' : 'transparent',
                  color: idx === selectedArtifactIdx ? '#f8fafc' : '#64748b',
                  border: '1px solid #1e293b',
                  borderRadius: '6px',
                  padding: '3px 8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                v{art.version}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Área Principal Rolável */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '22px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        {/* Recuperação de Falha sem Perder Etapas Anteriores */}
        {failedTask && (
          <section
            style={{
              background: '#191014',
              border: '1px solid rgba(239, 68, 68, 0.45)',
              borderRadius: '12px',
              padding: '16px 18px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#fca5a5',
                fontSize: '12.5px',
                fontWeight: 700,
                marginBottom: '6px',
              }}
            >
              <AlertCircle size={15} />
              Execução Interrompida ({failedTask.taskKey})
            </div>
            <p
              style={{
                fontSize: '12px',
                color: '#fecaca',
                marginBottom: '12px',
                lineHeight: 1.5,
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
              }}
            >
              {failedTask.lastError ??
                'Ocorreu uma falha na comunicação com o provedor de IA.'}
            </p>
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleRetry(failedTask.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: '#38bdf8',
                border: 'none',
                color: '#07131e',
                fontWeight: 700,
                fontSize: '12.5px',
                padding: '9px 14px',
                borderRadius: '8px',
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              <RotateCcw size={14} />
              {submitting ? 'Reiniciando...' : 'Tentar Novamente'}
            </button>
          </section>
        )}

        {/* Quality Gate Human-in-the-Loop */}
        {awaitingTask && (
          <section
            style={{
              background: '#111827',
              border: '1px solid rgba(245, 158, 11, 0.45)',
              borderRadius: '12px',
              padding: '16px 18px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '10px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#fbbf24',
                  fontSize: '12.5px',
                  fontWeight: 700,
                }}
              >
                <AlertCircle size={15} />
                Aprovação Humana Necessária
              </div>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                Tentativa {awaitingTask.attempts} de {awaitingTask.maxAttempts}
              </span>
            </div>

            <p
              style={{
                fontSize: '12.5px',
                color: '#cbd5e1',
                marginBottom: '12px',
                lineHeight: 1.5,
              }}
            >
              Revise a entrega abaixo. Você pode aprovar para liberar as
              próximas etapas do fluxo ou solicitar ajustes específicos.
            </p>

            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Se precisar de ajustes, descreva aqui o que o agente deve mudar na próxima versão..."
              rows={2}
              style={{
                width: '100%',
                background: '#070a10',
                border: '1px solid #334155',
                borderRadius: '8px',
                padding: '10px 12px',
                color: '#f8fafc',
                fontSize: '12.5px',
                marginBottom: '10px',
                resize: 'vertical',
                outline: 'none',
              }}
            />

            {actionError && (
              <div
                style={{
                  color: '#fca5a5',
                  fontSize: '12px',
                  marginBottom: '10px',
                }}
              >
                {actionError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleApprove(awaitingTask.id)}
                style={{
                  flex: 1.2,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  background: '#10b981',
                  border: 'none',
                  color: '#032016',
                  fontWeight: 700,
                  fontSize: '12.5px',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                <CheckCircle2 size={15} />
                Aprovar e Avançar
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleReject(awaitingTask.id)}
                style={{
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  background: '#1e293b',
                  border: '1px solid #475569',
                  color: '#f8fafc',
                  fontWeight: 600,
                  fontSize: '12.5px',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                <RotateCcw size={14} />
                Solicitar Ajuste
              </button>
            </div>
          </section>
        )}

        {/* TAB 1: ENTREGA ESPECIALIZADA (ZERO JSON CRU) */}
        {drawerTab === 'deliverable' && (
          <>
            {!activeArtifact ? (
              <div
                style={{
                  background: '#0d131f',
                  border: '1px solid #1e293b',
                  borderRadius: '10px',
                  padding: '28px',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#e2e8f0',
                    marginBottom: '6px',
                  }}
                >
                  {selectedDepartment === 'director'
                    ? 'Orquestrador Diretor (Planejamento DAG)'
                    : 'Nenhuma entrega produzida ainda'}
                </div>
                <p
                  style={{
                    fontSize: '12.5px',
                    color: '#94a3b8',
                    lineHeight: 1.5,
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-word',
                  }}
                >
                  {agent.statusBubble ??
                    'Inicie um projeto no painel superior para acompanhar o trabalho deste especialista.'}
                </p>
              </div>
            ) : (
              <>
                {typeof activeArtifact.content.incorporatedFeedbackNotes ===
                  'string' && (
                  <div
                    style={{
                      background: 'rgba(16, 185, 129, 0.1)',
                      border: '1px solid rgba(16, 185, 129, 0.35)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      fontSize: '12px',
                      color: '#6ee7b7',
                    }}
                  >
                    <strong>Revisão aplicada:</strong>{' '}
                    {activeArtifact.content.incorporatedFeedbackNotes}
                  </div>
                )}

                {selectedDepartment === 'research' && (
                  <ResearchRenderer content={activeArtifact.content} />
                )}
                {selectedDepartment === 'engineering' && (
                  <EngineeringRenderer content={activeArtifact.content} />
                )}
                {selectedDepartment === 'design' && (
                  <DesignRenderer content={activeArtifact.content} />
                )}
                {selectedDepartment === 'growth' && (
                  <GrowthRenderer content={activeArtifact.content} />
                )}
              </>
            )}
          </>
        )}

        {/* TAB 2: REGISTRO DE FERRAMENTAS & ACESSO WEB */}
        {drawerTab === 'tools' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {!agent.recentTools || agent.recentTools.length === 0 ? (
              <div
                style={{
                  background: '#0d131f',
                  border: '1px solid #1e293b',
                  borderRadius: '10px',
                  padding: '20px',
                  fontSize: '12.5px',
                  color: '#94a3b8',
                }}
              >
                Nenhuma chamada de ferramenta executada até o momento.
              </div>
            ) : (
              agent.recentTools.map((toolLog, idx) => (
                <div
                  key={`${toolLog.timestamp}-${idx}`}
                  style={{
                    background: '#0d131f',
                    border: `1px solid ${toolLog.success ? '#1e293b' : '#7f1d1d'}`,
                    borderRadius: '10px',
                    padding: '12px 14px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '6px',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#38bdf8',
                      }}
                    >
                      <Terminal size={13} />
                      {toolLog.toolName}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        color: toolLog.success ? '#34d399' : '#f87171',
                        fontWeight: 600,
                      }}
                    >
                      {toolLog.durationMs}ms
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.45 }}>
                    {toolLog.outputSummary}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 3: TAREFAS NO DAG */}
        {drawerTab === 'tasks' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {departmentTasks.length === 0 ? (
              <div
                style={{
                  background: '#0d131f',
                  border: '1px solid #1e293b',
                  borderRadius: '10px',
                  padding: '20px',
                  fontSize: '12.5px',
                  color: '#94a3b8',
                }}
              >
                Nenhuma tarefa atribuída a este departamento no plano atual.
              </div>
            ) : (
              departmentTasks.map((task) => (
                <div
                  key={task.id}
                  style={{
                    background: '#0d131f',
                    border: '1px solid #1e293b',
                    borderRadius: '10px',
                    padding: '14px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '8px',
                    }}
                  >
                    <code
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '12px',
                        fontWeight: 700,
                        color: deskConfig.accentColor,
                      }}
                    >
                      {task.taskKey}
                    </code>
                    <span
                      style={{
                        fontSize: '10.5px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background: '#1e293b',
                        color: '#e2e8f0',
                      }}
                    >
                      {task.status.toUpperCase()} · {task.attempts}/
                      {task.maxAttempts}
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: '12.5px',
                      color: '#cbd5e1',
                      lineHeight: 1.5,
                      marginBottom: '8px',
                    }}
                  >
                    {task.objective}
                  </p>
                  {task.dependsOn.length > 0 && (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        color: '#64748b',
                      }}
                    >
                      <ChevronRight size={12} />
                      Depende de: {task.dependsOn.join(', ')}
                    </div>
                  )}
                  {task.lastError && (
                    <div
                      style={{
                        marginTop: '8px',
                        fontSize: '11.5px',
                        color: '#fca5a5',
                        background: 'rgba(239, 68, 68, 0.1)',
                        padding: '8px 10px',
                        borderRadius: '6px',
                      }}
                    >
                      {task.lastError}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

const iconBtnStyle: React.CSSProperties = {
  background: '#111827',
  border: '1px solid #1e293b',
  color: '#cbd5e1',
  borderRadius: '8px',
  padding: '6px',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};
