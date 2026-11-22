import { useState } from 'react';
import { useOfficeStore } from '../store/useOfficeStore.js';
import { DEPARTMENT_DESKS } from './AgentDesk.js';

interface HumanReportSection {
  title: string;
  summary: string;
  items?: string[];
}

interface HumanSummaryData {
  headline?: string;
  keyDecisions?: string[];
  sections?: HumanReportSection[];
  approvalChecklist?: string[];
}

interface BuiltFileRef {
  label: string;
  relativePath: string;
  previewUrl: string;
  fileType: 'html' | 'markdown' | 'json' | 'code';
}

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
  const [activeTab, setActiveTab] = useState<'executive' | 'preview' | 'json'>(
    'executive'
  );

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
  const latestArtifact = departmentArtifacts[0] ?? null;

  const awaitingTask = departmentTasks.find(
    (t) => t.status === 'awaiting_approval'
  );

  const humanSummary = (latestArtifact?.content?.humanSummary ??
    null) as HumanSummaryData | null;
  const builtFiles = ((latestArtifact?.content?.builtFiles as
    | BuiltFileRef[]
    | undefined) ?? []);
  const htmlPreviewFile = builtFiles.find((f) => f.fileType === 'html');

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
        'Escreva o que você quer mudar (mínimo 3 caracteres) para o agente ajustar na nova versão.'
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
        width: '540px',
        maxWidth: '95vw',
        height: '100vh',
        background: 'rgba(11, 15, 25, 0.97)',
        borderLeft: `2px solid ${deskConfig.accentColor}`,
        boxShadow: '-16px 0 40px rgba(0,0,0,0.75)',
        backdropFilter: 'blur(14px)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 50,
        color: '#f8fafc',
      }}
    >
      {/* Header do Drawer */}
      <div
        style={{
          padding: '18px 22px',
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
            CENTRAL DE REVISÃO & ENTREGAS DO AGENTE
          </span>
          <h2 style={{ fontSize: '19px', fontWeight: 800, marginTop: '2px' }}>
            {deskConfig.label}
          </h2>
        </div>

        <button
          onClick={() => selectDepartment(null)}
          style={{
            background: '#1e293b',
            border: '1px solid #334155',
            color: '#cbd5e1',
            borderRadius: '8px',
            padding: '7px 12px',
            cursor: 'pointer',
            fontWeight: 700,
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
          padding: '18px 22px',
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
              marginBottom: '6px',
            }}
          >
            <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
              Status Atual do Agente
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 800,
                padding: '3px 9px',
                borderRadius: '999px',
                background: '#1e293b',
                color: deskConfig.accentColor,
              }}
            >
              {agent.visualState.toUpperCase()}
            </span>
          </div>
          <p style={{ fontSize: '13px', color: '#e2e8f0', lineHeight: 1.45 }}>
            {agent.statusBubble ?? 'Aguardando próxima tarefa do DAG.'}
          </p>
        </section>

        {/* Quality Gate Human-in-the-Loop (Aprovação Fácil para o Usuário) */}
        {awaitingTask && (
          <section
            style={{
              background:
                'linear-gradient(180deg, rgba(245, 158, 11, 0.14) 0%, rgba(15, 23, 42, 0.95) 100%)',
              border: '1.5px solid #f59e0b',
              borderRadius: '12px',
              padding: '16px',
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
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 800,
                  color: '#fbbf24',
                  letterSpacing: '0.04em',
                }}
              >
                ⚠️ SUA APROVAÇÃO É NECESSÁRIA
              </span>
              <span
                style={{
                  fontSize: '11px',
                  background: 'rgba(245, 158, 11, 0.2)',
                  color: '#fde68a',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  fontWeight: 700,
                }}
              >
                Tentativa {awaitingTask.attempts} de {awaitingTask.maxAttempts}
              </span>
            </div>

            {humanSummary?.approvalChecklist &&
              humanSummary.approvalChecklist.length > 0 && (
                <div
                  style={{
                    background: 'rgba(9, 13, 22, 0.7)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    marginBottom: '12px',
                  }}
                >
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 800,
                      color: '#fde68a',
                      marginBottom: '6px',
                    }}
                  >
                    O QUE AVALIAR ANTES DE APROVAR:
                  </div>
                  <ul
                    style={{
                      paddingLeft: '18px',
                      fontSize: '12px',
                      color: '#fef3c7',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      lineHeight: 1.4,
                    }}
                  >
                    {humanSummary.approvalChecklist.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Quer alterar alguma cor, funcionalidade ou detalhe? Escreva aqui e clique em 'Pedir Ajuste'..."
              rows={2}
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
                  flex: 1.2,
                  background: '#10b981',
                  border: 'none',
                  color: '#052e16',
                  fontWeight: 800,
                  fontSize: '13px',
                  padding: '11px',
                  borderRadius: '8px',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                ✓ Aprovar e Avançar
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
                  fontSize: '13px',
                  padding: '11px',
                  borderRadius: '8px',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                ↺ Pedir Ajuste
              </button>
            </div>
          </section>
        )}

        {/* ENTREGA DO AGENTE (Abas: Relatório Fácil / Preview Ao Vivo / JSON Técnico) */}
        {latestArtifact && (
          <section
            style={{
              background: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '12px',
              overflow: 'hidden',
            }}
          >
            {/* Barra de Abas */}
            <div
              style={{
                display: 'flex',
                borderBottom: '1px solid #1e293b',
                background: '#090d16',
              }}
            >
              <button
                onClick={() => setActiveTab('executive')}
                style={{
                  flex: 1,
                  padding: '11px 8px',
                  background:
                    activeTab === 'executive' ? '#0f172a' : 'transparent',
                  border: 'none',
                  borderBottom:
                    activeTab === 'executive'
                      ? `2px solid ${deskConfig.accentColor}`
                      : '2px solid transparent',
                  color: activeTab === 'executive' ? '#f8fafc' : '#94a3b8',
                  fontWeight: 800,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                📋 Relatório Fácil (v{latestArtifact.version})
              </button>

              {htmlPreviewFile && (
                <button
                  onClick={() => setActiveTab('preview')}
                  style={{
                    flex: 1,
                    padding: '11px 8px',
                    background:
                      activeTab === 'preview' ? '#0f172a' : 'transparent',
                    border: 'none',
                    borderBottom:
                      activeTab === 'preview'
                        ? `2px solid ${deskConfig.accentColor}`
                        : '2px solid transparent',
                    color: activeTab === 'preview' ? '#38bdf8' : '#94a3b8',
                    fontWeight: 800,
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  🖥️ Testar Entrega Ao Vivo
                </button>
              )}

              <button
                onClick={() => setActiveTab('json')}
                style={{
                  padding: '11px 14px',
                  background: activeTab === 'json' ? '#0f172a' : 'transparent',
                  border: 'none',
                  borderBottom:
                    activeTab === 'json'
                      ? `2px solid ${deskConfig.accentColor}`
                      : '2px solid transparent',
                  color: activeTab === 'json' ? '#f8fafc' : '#64748b',
                  fontWeight: 700,
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                {'{ }'} JSON
              </button>
            </div>

            {/* Conteúdo da Aba 1: RELATÓRIO EXECUTIVO FÁCIL DE ENTENDER */}
            {activeTab === 'executive' && (
              <div
                style={{
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                {/* Título executivo claro */}
                <div>
                  <div
                    style={{
                      fontSize: '11px',
                      color: deskConfig.accentColor,
                      fontWeight: 800,
                      marginBottom: '4px',
                    }}
                  >
                    RESUMO DA ENTREGA • VERSÃO {latestArtifact.version}
                  </div>
                  <h3
                    style={{
                      fontSize: '16px',
                      fontWeight: 800,
                      color: '#f8fafc',
                      lineHeight: 1.35,
                    }}
                  >
                    {humanSummary?.headline ??
                      (latestArtifact.content.executiveSummary as string) ??
                      latestArtifact.name}
                  </h3>
                </div>

                {/* Botão Rápido para Abrir o Produto Construído se houver HTML */}
                {htmlPreviewFile && (
                  <div
                    style={{
                      background: 'rgba(56, 189, 248, 0.1)',
                      border: '1px solid #38bdf8',
                      borderRadius: '10px',
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 800,
                          color: '#38bdf8',
                        }}
                      >
                        🚀 {htmlPreviewFile.label}
                      </div>
                      <div style={{ fontSize: '11px', color: '#cbd5e1' }}>
                        Arquivo construído em:{' '}
                        <code>{htmlPreviewFile.relativePath}</code>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => setActiveTab('preview')}
                        style={{
                          background: '#38bdf8',
                          color: '#090d16',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '7px 11px',
                          fontSize: '11px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        ▶ Ver Aqui
                      </button>
                      <a
                        href={htmlPreviewFile.previewUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          background: '#1e293b',
                          color: '#e2e8f0',
                          textDecoration: 'none',
                          borderRadius: '6px',
                          padding: '7px 10px',
                          fontSize: '11px',
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        ↗ Nova Aba
                      </a>
                    </div>
                  </div>
                )}

                {/* Principais Decisões Tomadas pelo Agente */}
                {humanSummary?.keyDecisions &&
                  humanSummary.keyDecisions.length > 0 && (
                    <div
                      style={{
                        background: '#090d16',
                        border: '1px solid #1e293b',
                        borderRadius: '10px',
                        padding: '12px 14px',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          color: '#94a3b8',
                          marginBottom: '8px',
                          letterSpacing: '0.04em',
                        }}
                      >
                        PRINCIPAIS DECISÕES & RESULTADOS
                      </div>
                      <ul
                        style={{
                          paddingLeft: '18px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          fontSize: '12.5px',
                          color: '#e2e8f0',
                          lineHeight: 1.45,
                        }}
                      >
                        {humanSummary.keyDecisions.map((decision, idx) => (
                          <li key={idx}>{decision}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                {/* Seções Detalhadas em Cartões Fáceis de Ler */}
                {humanSummary?.sections?.map((sec, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: '#090d16',
                      border: '1px solid #1e293b',
                      borderRadius: '10px',
                      padding: '12px 14px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '13px',
                        fontWeight: 800,
                        color: deskConfig.accentColor,
                        marginBottom: '4px',
                      }}
                    >
                      {sec.title}
                    </div>
                    <p
                      style={{
                        fontSize: '12px',
                        color: '#94a3b8',
                        marginBottom:
                          sec.items && sec.items.length > 0 ? '8px' : '0',
                        lineHeight: 1.4,
                      }}
                    >
                      {sec.summary}
                    </p>
                    {sec.items && sec.items.length > 0 && (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '5px',
                        }}
                      >
                        {sec.items.map((item, i) => (
                          <div
                            key={i}
                            style={{
                              fontSize: '12px',
                              color: '#e2e8f0',
                              background: '#0f172a',
                              padding: '6px 10px',
                              borderRadius: '6px',
                              borderLeft: `3px solid ${deskConfig.accentColor}`,
                            }}
                          >
                            {item}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {/* Lista de Todos os Arquivos Reais Gravados no Disco */}
                {builtFiles.length > 0 && (
                  <div
                    style={{
                      background: '#090d16',
                      border: '1px solid #1e293b',
                      borderRadius: '10px',
                      padding: '12px 14px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 800,
                        color: '#94a3b8',
                        marginBottom: '8px',
                      }}
                    >
                      ARQUIVOS REAIS CONSTRUÍDOS NO WORKSPACE ({builtFiles.length})
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      {builtFiles.map((bf, i) => (
                        <a
                          key={i}
                          href={bf.previewUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: '#0f172a',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            color: '#38bdf8',
                            textDecoration: 'none',
                            fontSize: '12px',
                            fontWeight: 600,
                          }}
                        >
                          <span>📄 {bf.label}</span>
                          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                            Abrir ↗
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Conteúdo da Aba 2: PREVIEW AO VIVO (Iframe Interativo da Aplicação/Protótipo Construído) */}
            {activeTab === 'preview' && htmlPreviewFile && (
              <div style={{ padding: '12px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '11px',
                      color: '#94a3b8',
                      fontWeight: 700,
                    }}
                  >
                    Executando ao vivo: <code>{htmlPreviewFile.relativePath}</code>
                  </span>
                  <a
                    href={htmlPreviewFile.previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: '11px',
                      color: '#38bdf8',
                      fontWeight: 700,
                      textDecoration: 'none',
                    }}
                  >
                    Abrir em Tela Cheia ↗
                  </a>
                </div>
                <iframe
                  src={htmlPreviewFile.previewUrl}
                  title={htmlPreviewFile.label}
                  style={{
                    width: '100%',
                    height: '430px',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    background: '#070a12',
                  }}
                />
              </div>
            )}

            {/* Conteúdo da Aba 3: JSON TÉCNICO COMPLETO */}
            {activeTab === 'json' && (
              <div style={{ padding: '14px' }}>
                <pre
                  style={{
                    fontSize: '11px',
                    color: '#93c5fd',
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    lineHeight: 1.45,
                    maxHeight: '380px',
                  }}
                >
                  {JSON.stringify(latestArtifact.content, null, 2)}
                </pre>
              </div>
            )}
          </section>
        )}

        {/* Ferramentas & Acesso à Internet Executados pelo Agente */}
        <section>
          <h3
            style={{
              fontSize: '11px',
              fontWeight: 800,
              color: '#94a3b8',
              letterSpacing: '0.06em',
              marginBottom: '8px',
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
      </div>
    </aside>
  );
}
