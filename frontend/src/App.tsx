import { useEffect, useState } from 'react';
import { OfficeScene } from './components/OfficeScene.js';
import { AgentDrawer } from './components/AgentDrawer.js';
import { useOfficeStore } from './store/useOfficeStore.js';

export function App() {
  const connected = useOfficeStore((s) => s.connected);
  const project = useOfficeStore((s) => s.project);
  const connectSocket = useOfficeStore((s) => s.connectSocket);
  const createProject = useOfficeStore((s) => s.createProject);
  const pauseProject = useOfficeStore((s) => s.pauseProject);
  const lastError = useOfficeStore((s) => s.lastError);

  const [scopeInput, setScopeInput] = useState(
    'Plataforma SaaS B2B de Analytics Preditivo com Onboarding Self-Service'
  );
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const projectIdFromUrl = params.get('projectId') ?? undefined;
    connectSocket(projectIdFromUrl);
  }, [connectSocket]);

  const handleLaunchProject = async () => {
    if (!scopeInput.trim() || creating) return;
    setCreating(true);
    try {
      await createProject({
        title: scopeInput.trim().slice(0, 50),
        rawScope: scopeInput.trim(),
        tokenBudget: 50000,
      });
    } finally {
      setCreating(false);
    }
  };

  const budgetPercent = project
    ? Math.min(100, Math.round((project.tokensUsed / project.tokenBudget) * 100))
    : 0;

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      {/* HUD Superior (Orçamento de Tokens, Status do Projeto e Lançador de Escopo) */}
      <header
        style={{
          position: 'fixed',
          top: '16px',
          left: '16px',
          right: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          padding: '12px 18px',
          background: 'rgba(15, 23, 42, 0.88)',
          border: '1px solid #1e293b',
          borderRadius: '12px',
          backdropFilter: 'blur(10px)',
          zIndex: 20,
          pointerEvents: 'auto',
        }}
      >
        {/* Identidade + Conexão WebSocket */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: connected ? '#22c55e' : '#ef4444',
              boxShadow: connected
                ? '0 0 10px #22c55e'
                : '0 0 10px #ef4444',
            }}
          />
          <div>
            <div style={{ fontSize: '14px', fontWeight: 800 }}>
              AI OFFICE 3D • DAG ORCHESTRATOR
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
              {project
                ? `Projeto: ${project.title} (${project.status.toUpperCase()})`
                : 'Conectado — Crie ou selecione um projeto'}
            </div>
          </div>
        </div>

        {/* Input de Novo Projeto */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flex: 1,
            maxWidth: '520px',
          }}
        >
          <input
            type="text"
            value={scopeInput}
            onChange={(e) => setScopeInput(e.target.value)}
            placeholder="Descreva o escopo do projeto para o Agente Diretor planejar o DAG..."
            style={{
              flex: 1,
              background: '#090d16',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '8px 12px',
              color: '#f8fafc',
              fontSize: '12px',
            }}
          />
          <button
            onClick={handleLaunchProject}
            disabled={creating}
            style={{
              background: '#a855f7',
              border: 'none',
              color: '#fff',
              fontWeight: 700,
              fontSize: '12px',
              padding: '8px 14px',
              borderRadius: '8px',
              cursor: creating ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {creating ? 'Planejando DAG...' : '▶ Iniciar Projeto'}
          </button>
          {project?.status === 'running' && (
            <button
              onClick={() => pauseProject('Pausado via HUD')}
              style={{
                background: '#334155',
                border: '1px solid #475569',
                color: '#f8fafc',
                fontWeight: 600,
                fontSize: '12px',
                padding: '8px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              ⏸ Pausar
            </button>
          )}
        </div>

        {/* Medidor de Token Budget */}
        <div style={{ minWidth: '210px', textAlign: 'right' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '11px',
              color: '#cbd5e1',
              marginBottom: '4px',
            }}
          >
            <span>TOKEN BUDGET</span>
            <strong>
              {project
                ? `${project.tokensUsed.toLocaleString()} / ${project.tokenBudget.toLocaleString()}`
                : '0 / 0'}
            </strong>
          </div>
          <div
            style={{
              width: '100%',
              height: '7px',
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
      </header>

      {/* Banner de Erro (se houver) */}
      {lastError && (
        <div
          style={{
            position: 'fixed',
            bottom: '16px',
            left: '16px',
            background: 'rgba(239, 68, 68, 0.95)',
            color: '#fff',
            padding: '10px 16px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 600,
            zIndex: 30,
          }}
        >
          {lastError}
        </div>
      )}

      {/* Cena 3D Isométrica ("Espelho Burro") */}
      <OfficeScene />

      {/* Drawer Lateral de Inspeção & Quality Gate */}
      <AgentDrawer />
    </div>
  );
}
