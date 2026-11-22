import { useEffect, useId, useState } from 'react';
import mermaid from 'mermaid';
import { Check, Copy } from 'lucide-react';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  themeVariables: {
    darkMode: true,
    background: '#070a10',
    primaryColor: '#1e293b',
    primaryTextColor: '#f8fafc',
    primaryBorderColor: '#38bdf8',
    lineColor: '#64748b',
    secondaryColor: '#0f172a',
    tertiaryColor: '#111827',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
});

interface MermaidDiagramProps {
  chart: string;
}

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const uniqueId = useId().replace(/:/g, '_');
  const [svg, setSvg] = useState<string>('');
  const [renderError, setRenderError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        setRenderError(null);
        const { svg: generatedSvg } = await mermaid.render(
          `mermaid_${uniqueId}`,
          chart
        );
        if (!cancelled) {
          setSvg(generatedSvg);
        }
      } catch (err) {
        if (!cancelled) {
          setRenderError(
            err instanceof Error ? err.message : 'Falha ao renderizar diagrama'
          );
        }
      }
    }
    void render();
    return () => {
      cancelled = true;
    };
  }, [chart, uniqueId]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(chart);
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
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#cbd5e1' }}>
          Fluxo da Arquitetura (Mermaid)
        </span>
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
          {copied ? 'Copiado' : 'Copiar Mermaid'}
        </button>
      </div>

      {renderError ? (
        <div style={{ padding: '14px', fontSize: '12px', color: '#f87171' }}>
          Não foi possível renderizar o SVG: {renderError}
          <pre
            style={{
              marginTop: '8px',
              color: '#94a3b8',
              fontSize: '11px',
              whiteSpace: 'pre-wrap',
            }}
          >
            {chart}
          </pre>
        </div>
      ) : (
        <div
          style={{
            padding: '16px',
            overflowX: 'auto',
            display: 'flex',
            justifyContent: 'center',
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
    </div>
  );
}
