import { useState } from 'react';
import { Lock, ShieldCheck, X } from 'lucide-react';
import { useOfficeStore } from '../store/useOfficeStore.js';

export function AuthModal() {
  const isOpen = useOfficeStore((s) => s.isAuthModalOpen);
  const setOpen = useOfficeStore((s) => s.setAuthModalOpen);
  const login = useOfficeStore((s) => s.login);
  const register = useOfficeStore((s) => s.register);

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'login') {
        await login({ email, password });
      } else {
        await register({ name, email, password });
      }
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(5, 7, 12, 0.8)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 85,
        padding: '16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          background: '#0d131f',
          border: '1px solid #1e293b',
          borderRadius: '14px',
          padding: '22px',
          color: '#f8fafc',
          boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
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
            <Lock size={16} color="#38bdf8" />
            <h3 style={{ fontSize: '16px', fontWeight: 700 }}>
              {mode === 'login' ? 'Entrar na Conta' : 'Criar Conta'}
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
            display: 'flex',
            gap: '6px',
            background: '#070a10',
            padding: '4px',
            borderRadius: '8px',
            marginBottom: '14px',
            border: '1px solid #1e293b',
          }}
        >
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              style={{
                flex: 1,
                padding: '7px',
                borderRadius: '6px',
                border: 'none',
                background: mode === m ? '#1e293b' : 'transparent',
                color: mode === m ? '#f8fafc' : '#94a3b8',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {m === 'login' ? 'Já tenho conta' : 'Cadastrar'}
            </button>
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.28)',
            borderRadius: '8px',
            padding: '10px 12px',
            fontSize: '11.5px',
            color: '#a7f3d0',
            lineHeight: 1.45,
            marginBottom: '14px',
          }}
        >
          <ShieldCheck size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>
            Seus projetos e API keys ficam isolados na sua conta. As chaves são
            criptografadas com AES-256-GCM ou mantidas apenas na sessão.
          </span>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
        >
          {mode === 'register' && (
            <div>
              <label style={labelStyle}>Nome completo</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                placeholder="Seu nome"
                style={inputStyle}
              />
            </div>
          )}

          <div>
            <label style={labelStyle}>E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="voce@empresa.com"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>
              Senha {mode === 'register' && '(mínimo 8 caracteres)'}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'register' ? 8 : 1}
              placeholder="••••••••"
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{ fontSize: '12px', color: '#fca5a5' }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              background: '#38bdf8',
              color: '#07131e',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: submitting ? 'not-allowed' : 'pointer',
              marginTop: '4px',
            }}
          >
            {submitting
              ? 'Processando...'
              : mode === 'login'
                ? 'Entrar'
                : 'Criar Conta e Entrar'}
          </button>
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
