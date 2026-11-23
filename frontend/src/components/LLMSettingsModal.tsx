import { useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import {
  useOfficeStore,
  type LLMProviderType,
} from '../store/useOfficeStore.js';

const DEFAULT_MODELS: Record<LLMProviderType, string> = {
  gemini: 'gemini-3.8-flash',
  anthropic: 'claude-sonnet-4-5',
  openai: 'gpt-4o-mini',
  ollama: 'llama3.1',
};

const SUGGESTED_MODELS: Record<LLMProviderType, string[]> = {
  gemini: ['gemini-3.8-flash', 'gemini-4-argon', 'gemini-3.1-pro-preview'],
  anthropic: ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-1'],
  openai: ['gpt-4o-mini', 'gpt-4o'],
  ollama: ['llama3.1', 'qwen2.5-coder'],
};

export function LLMSettingsModal() {
  const isOpen = useOfficeStore((s) => s.isSettingsModalOpen);
  const setOpen = useOfficeStore((s) => s.setSettingsModalOpen);
  const llmStatus = useOfficeStore((s) => s.llmStatus);
  const saveLLMSettings = useOfficeStore((s) => s.saveLLMSettings);

  const [provider, setProvider] = useState<LLMProviderType>(
    llmStatus?.provider ?? 'gemini'
  );
  const [model, setModel] = useState(
    llmStatus?.model ?? DEFAULT_MODELS[llmStatus?.provider ?? 'gemini']
  );
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleProviderChange = (next: LLMProviderType) => {
    setProvider(next);
    setModel(DEFAULT_MODELS[next]);
    setError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await saveLLMSettings({
        provider,
        model,
        apiKey: provider === 'ollama' ? undefined : apiKey,
        baseUrl: provider === 'ollama' ? baseUrl : undefined,
      });
      setApiKey('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

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
        zIndex: 80,
        padding: '16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          background: '#0d131f',
          border: '1px solid #1e293b',
          borderRadius: '14px',
          padding: '22px',
          color: '#f8fafc',
          boxShadow: '0 24px 60px rgba(0,0,0,0.65)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <KeyRound size={17} color="#38bdf8" />
            <h3 style={{ fontSize: '16px', fontWeight: 700 }}>
              Configurar Modelo de IA Real
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

        <p
          style={{
            fontSize: '12.5px',
            color: '#94a3b8',
            lineHeight: 1.5,
            marginBottom: '16px',
          }}
        >
          Conecte um provedor real para que os agentes pesquisem, arquitetem e
          construam interfaces sem simulações. A chave é salva apenas localmente
          em <code>backend/.env.local</code>.
        </p>

        <form
          onSubmit={handleSave}
          style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
        >
          <div>
            <label style={labelStyle}>Provedor</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              {(['gemini', 'anthropic', 'openai', 'ollama'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleProviderChange(p)}
                  style={{
                    padding: '8px',
                    borderRadius: '8px',
                    border:
                      provider === p
                        ? '1px solid #38bdf8'
                        : '1px solid #1e293b',
                    background: provider === p ? '#17253b' : '#070a10',
                    color: provider === p ? '#f8fafc' : '#94a3b8',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {p === 'gemini'
                    ? 'Google Gemini'
                    : p === 'anthropic'
                      ? 'Anthropic (Claude)'
                      : p === 'openai'
                        ? 'OpenAI'
                        : 'Ollama Local'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Modelo</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              required
              style={inputStyle}
            />
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
              {SUGGESTED_MODELS[provider].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModel(m)}
                  style={{
                    background: model === m ? '#1e293b' : '#070a10',
                    border: `1px solid ${model === m ? '#38bdf8' : '#1e293b'}`,
                    color: model === m ? '#f8fafc' : '#94a3b8',
                    borderRadius: '6px',
                    padding: '3px 8px',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {provider !== 'ollama' ? (
            <div>
              <label style={labelStyle}>
                API Key (
                {provider === 'gemini'
                  ? 'GEMINI_API_KEY'
                  : provider === 'anthropic'
                    ? 'ANTHROPIC_API_KEY'
                    : 'OPENAI_API_KEY'}
                )
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  llmStatus?.maskedKey
                    ? `Atual: ${llmStatus.maskedKey} (digite para substituir)`
                    : 'Cole sua API Key aqui...'
                }
                required
                style={inputStyle}
              />
            </div>
          ) : (
            <div>
              <label style={labelStyle}>URL do Servidor Ollama</label>
              <input
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                required
                style={inputStyle}
              />
            </div>
          )}

          {error && (
            <div style={{ fontSize: '12px', color: '#fca5a5' }}>{error}</div>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '8px',
              marginTop: '6px',
            }}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                background: '#1e293b',
                color: '#cbd5e1',
                border: 'none',
                borderRadius: '8px',
                padding: '9px 14px',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                background: '#38bdf8',
                color: '#07131e',
                border: 'none',
                borderRadius: '8px',
                padding: '9px 16px',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Salvando...' : 'Salvar e Conectar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 600,
  color: '#94a3b8',
  marginBottom: '6px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#070a10',
  border: '1px solid #334155',
  borderRadius: '8px',
  padding: '9px 12px',
  color: '#f8fafc',
  fontSize: '12.5px',
  outline: 'none',
};
