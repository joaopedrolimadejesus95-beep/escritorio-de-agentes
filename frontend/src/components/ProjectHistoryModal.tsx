import { FolderOpen, History, X } from 'lucide-react';
import { useOfficeStore } from '../store/useOfficeStore.js';

export function ProjectHistoryModal() {
  const isOpen = useOfficeStore((s) => s.isHistoryModalOpen);
  const setOpen = useOfficeStore((s) => s.setHistoryModalOpen);
  const projectHistory = useOfficeStore((s) => s.projectHistory);
  const currentProjectId = useOfficeStore((s) => s.project?.id);
  const joinProject = useOfficeStore((s) => s.joinProject);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(5, 7, 12, 0.78)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 82,
        padding: '16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '580px',
          maxHeight: '80vh',
          background: '#0d131f',
          border: '1px solid #1e293b',
          borderRadius: '14px',
          padding: '22px',
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          boxShadow: '0 24px 60px rgba(0,0,0,0.68)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <History size={17} color="#38bdf8" />
            <h3 style={{ fontSize: '16px', fontWeight: 700 }}>
              Meus Projetos & Histórico
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div
          style={{
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            paddingRight: '4px',
          }}
        >
          {projectHistory.length === 0 ? (
            <div
              style={{
                background: '#070a10',
                border: '1px solid #1e293b',
                borderRadius: '10px',
                padding: '24px',
                textAlign: 'center',
                color: '#94a3b8',
                fontSize: '12.5px',
              }}
            >
              Nenhum projeto criado nesta conta ainda. Envie um escopo no painel
              superior para começar.
            </div>
          ) : (
            projectHistory.map((p) => {
              const isCurrent = p.id === currentProjectId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    joinProject(p.id);
                    setOpen(false);
                  }}
                  style={{
                    textAlign: 'left',
                    background: isCurrent ? '#17253b' : '#070a10',
                    border: `1px solid ${isCurrent ? '#38bdf8' : '#1e293b'}`,
                    borderRadius: '10px',
                    padding: '12px 14px',
                    color: '#f8fafc',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        marginBottom: '4px',
                      }}
                    >
                      {p.title}
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                      {new Date(p.createdAt).toLocaleString('pt-BR')} ·{' '}
                      {p.tokensUsed.toLocaleString()} /{' '}
                      {p.tokenBudget.toLocaleString()} tokens
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: '10.5px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background:
                          p.status === 'completed'
                            ? 'rgba(16, 185, 129, 0.16)'
                            : p.status === 'failed'
                              ? 'rgba(239, 68, 68, 0.16)'
                              : 'rgba(56, 189, 248, 0.14)',
                        color:
                          p.status === 'completed'
                            ? '#6ee7b7'
                            : p.status === 'failed'
                              ? '#fca5a5'
                              : '#7dd3fc',
                      }}
                    >
                      {p.status.toUpperCase()}
                    </span>
                    <FolderOpen size={14} color="#94a3b8" />
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
