import { useState } from 'react';
import { useOfficeStore } from '../store/useOfficeStore.js';
import { DEPARTMENT_DESKS } from './AgentDesk.js';

export function AgentDrawer() {
  const selectedDepartment = useOfficeStore((s) => s.selectedDepartment);
  const selectDepartment = useOfficeStore((s) => s.selectDepartment);
  const agents = useOfficeStore((s) => s.agents);
  const tasks = useOfficeStore((s) => s.tasks);
  const artifacts = useOfficeStore((s) => s.artifacts);
  const approveTask = useOfficeStore((s) => s.approveTask);
  const rejectTask = useOfficeStore((s) => s.rejectTask);

  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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

  const awaitingTask = departmentTasks.find(
    (t) => t.status === 'awaiting_approval'
  );

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
        'Informe um feedback claro (mínimo 3 caracteres) para orientar o retry do agente.'
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
        width: '440px',
        height: '100vh',
        background: 'rgba(15, 23, 42, 0.96)',
        borderLeft: `2px solid ${deskConfig.accentColor}`,
        boxShadow: '-12px 0 32px rgba(0,0,0,0.6)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 50,
        color: '#f8fafc',
      }}
    >
      {/* Header do Drawer */}
      <div
        style={{
          padding: '18px 20px',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 800,
              color: deskConfig.accentColor,
              letterSpacing: '0.08em',
            }}
          >
            INSPEÇÃO DE DEPARTAMENTO
          </span>
          <h2 style={{ fontSize: '18px', fontWeight: 700, marginTop: '2px' }}>
            {deskConfig.label}
          </h2>
        </div>

        <button
          onClick={() => selectDepartment(null)}
          style={{
            background: '#1e293b',
            border: '1px solid #334155',
            color: '#cbd5e1',
            borderRadius: '6px',
            padding: '6px 10px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          ✕ Fechar
        </button>
      </div>

      {/* Corpo Rolável */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
        }}
      >
        {/* Status Atual do Boneco */}
        <section
          style={{
            background: '#0f172a',
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
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
              Estado Visual (`AgentVisualState`)
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 800,
                padding: '3px 8px',
                borderRadius: '6px',
                background: '#1e293b',
                color: deskConfig.accentColor,
              }}
            >
              {agent.visualState.toUpperCase()}
            </span>
          </div>
          <p style={{ fontSize: '13px', color: '#e2e8f0', lineHeight: 1.45 }}>
            {agent.statusBubble ?? 'Sem atividade no momento.'}
          </p>
        </section>

        {/* Quality Gate Human-in-the-Loop (se houver tarefa aguardando aprovação) */}
        {awaitingTask && (
          <section
            style={{
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1.5px solid #f59e0b',
              borderRadius: '10px',
              padding: '16px',
            }}
          >
            <div
              style={{
                fontSize: '12px',
                fontWeight: 800,
                color: '#fbbf24',
                marginBottom: '6px',
                letterSpacing: '0.04em',
              }}
            >
              ⚠️ QUALITY GATE — APROVAÇÃO HUMANA REQUERIDA
            </div>
            <p
              style={{
                fontSize: '13px',
                color: '#fef3c7',
                marginBottom: '12px',
                lineHeight: 1.4,
              }}
            >
              Tarefa: <strong>{awaitingTask.taskKey}</strong> (Tentativa{' '}
              {awaitingTask.attempts}/{awaitingTask.maxAttempts})
            </p>

            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Feedback obrigatório caso deseje reprovar e solicitar correção ao Pod..."
              rows={3}
              style={{
                width: '100%',
                background: '#090d16',
                border: '1px solid #475569',
                borderRadius: '8px',
                padding: '10px',
                color: '#f8fafc',
                fontSize: '12px',
                marginBottom: '10px',
                resize: 'vertical',
              }}
            />

            {actionError && (
              <div
                style={{
                  color: '#f87171',
                  fontSize: '12px',
                  marginBottom: '10px',
                }}
              >
                {actionError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                disabled={submitting}
                onClick={() => handleApprove(awaitingTask.id)}
                style={{
                  flex: 1,
                  background: '#10b981',
                  border: 'none',
                  color: '#052e16',
                  fontWeight: 800,
                  padding: '10px',
                  borderRadius: '8px',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                ✓ Aprovar Artefato
              </button>
              <button
                disabled={submitting}
                onClick={() => handleReject(awaitingTask.id)}
                style={{
                  flex: 1,
                  background: '#ef4444',
                  border: 'none',
                  color: '#fff',
                  fontWeight: 700,
                  padding: '10px',
                  borderRadius: '8px',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                ✕ Reprovar c/ Feedback
              </button>
            </div>
          </section>
        )}

        {/* Ferramentas & Acesso à Internet Executados pelo Agente */}
        <section>
          <h3
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: '#94a3b8',
              letterSpacing: '0.06em',
              marginBottom: '10px',
            }}
          >
            FERRAMENTAS & ACESSO WEB ({agent.recentTools?.length ?? 0})
          </h3>

          {!agent.recentTools || agent.recentTools.length === 0 ? (
            <div
              style={{
                fontSize: '12px',
                color: '#64748b',
                background: '#0f172a',
                padding: '12px',
                borderRadius: '8px',
              }}
            >
              Nenhuma chamada de ferramenta registrada ainda para este Pod.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {agent.recentTools.map((toolLog, idx) => (
                <div
                  key={`${toolLog.timestamp}-${idx}`}
                  style={{
                    background: '#0f172a',
                    border: `1px solid ${toolLog.success ? '#1e293b' : '#ef4444'}`,
                    borderRadius: '8px',
                    padding: '10px 12px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '4px',
                    }}
                  >
                    <code
                      style={{
                        fontSize: '11px',
                        fontWeight: 800,
                        color: '#38bdf8',
                      }}
                    >
                      🔧 {toolLog.toolName}
                    </code>
                    <span
                      style={{
                        fontSize: '10px',
                        color: toolLog.success ? '#4ade80' : '#f87171',
                        fontWeight: 700,
                      }}
                    >
                      {toolLog.durationMs}ms
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      color: '#cbd5e1',
                      lineHeight: 1.35,
                    }}
                  >
                    {toolLog.outputSummary}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Tarefas do DAG atribuídas a este Departamento */}
        <section>
          <h3
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: '#94a3b8',
              letterSpacing: '0.06em',
              marginBottom: '10px',
            }}
          >
            TAREFAS NO DAG ({departmentTasks.length})
          </h3>

          {departmentTasks.length === 0 ? (
            <div
              style={{
                fontSize: '12px',
                color: '#64748b',
                background: '#0f172a',
                padding: '12px',
                borderRadius: '8px',
              }}
            >
              {selectedDepartment === 'director'
                ? 'O Diretor gera e valida o grafo acíclico dirigido (DAG) para os Pods Especialistas.'
                : 'Nenhuma tarefa atribuída a este Pod no plano atual.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {departmentTasks.map((task) => (
                <div
                  key={task.id}
                  style={{
                    background: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '8px',
                    padding: '12px',
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
                    <code
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: deskConfig.accentColor,
                      }}
                    >
                      {task.taskKey}
                    </code>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 800,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: '#1e293b',
                        color: '#e2e8f0',
                      }}
                    >
                      {task.status.toUpperCase()} • {task.attempts}/{task.maxAttempts}
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: '12px',
                      color: '#cbd5e1',
                      lineHeight: 1.4,
                      marginBottom: '6px',
                    }}
                  >
                    {task.objective}
                  </p>
                  {task.dependsOn.length > 0 && (
                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                      depends_on: [{task.dependsOn.join(', ')}]
                    </div>
                  )}
                  {task.lastError && (
                    <div
                      style={{
                        marginTop: '6px',
                        fontSize: '11px',
                        color: '#f87171',
                        background: 'rgba(239, 68, 68, 0.1)',
                        padding: '6px 8px',
                        borderRadius: '6px',
                      }}
                    >
                      {task.lastError}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Artefatos Versionados Produzidos pelo Pod */}
        <section>
          <h3
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: '#94a3b8',
              letterSpacing: '0.06em',
              marginBottom: '10px',
            }}
          >
            ARTEFATOS VERSIONADOS ({departmentArtifacts.length})
          </h3>

          {departmentArtifacts.length === 0 ? (
            <div
              style={{
                fontSize: '12px',
                color: '#64748b',
                background: '#0f172a',
                padding: '12px',
                borderRadius: '8px',
              }}
            >
              Nenhum artefato emitido ainda.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {departmentArtifacts.map((artifact) => (
                <div
                  key={artifact.id}
                  style={{
                    background: '#090d16',
                    border: '1px solid #1e293b',
                    borderRadius: '8px',
                    padding: '12px',
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
                    <strong style={{ fontSize: '13px', color: '#f8fafc' }}>
                      {artifact.name}
                    </strong>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 800,
                        background: deskConfig.accentColor,
                        color: '#090d16',
                        padding: '2px 7px',
                        borderRadius: '999px',
                      }}
                    >
                      v{artifact.version}
                    </span>
                  </div>
                  <pre
                    style={{
                      fontSize: '11px',
                      color: '#93c5fd',
                      overflowX: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      lineHeight: 1.45,
                      maxHeight: '280px',
                    }}
                  >
                    {JSON.stringify(artifact.content, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
