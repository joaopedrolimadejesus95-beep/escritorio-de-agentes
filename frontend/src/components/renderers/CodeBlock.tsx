import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface CodeBlockProps {
  title: string;
  language: string;
  code: string;
  maxHeight?: string;
}

export function CodeBlock({
  title,
  language,
  code,
  maxHeight = '320px',
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      style={{
        background: '#070a10',
        border: '1px solid #1e293b',
        borderRadius: '10px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: '#0d131f',
          borderBottom: '1px solid #1e293b',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#cbd5e1',
            }}
          >
            {title}
          </span>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {language}
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            background: copied ? 'rgba(16, 185, 129, 0.16)' : '#1e293b',
            color: copied ? '#34d399' : '#cbd5e1',
            border: '1px solid #334155',
            borderRadius: '6px',
            padding: '4px 9px',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre
        style={{
          margin: 0,
          padding: '14px',
          fontSize: '12px',
          fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
          color: '#e2e8f0',
          lineHeight: 1.55,
          overflow: 'auto',
          maxHeight,
          whiteSpace: 'pre',
        }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}
