import { useState } from 'react';
import {
  Check,
  Code2,
  ExternalLink,
  Monitor,
  Smartphone,
} from 'lucide-react';
import { CodeBlock } from './CodeBlock.js';
import { MermaidDiagram } from './MermaidDiagram.js';

// ============================================================================
// 1. RESEARCH RENDERER (Cards, Tabela Comparativa de Concorrentes e Fontes)
// ============================================================================

export function ResearchRenderer({ content }: { content: Record<string, any> }) {
  const positioning = content.positioningRecommendation;
  const competitors = (content.competitors ?? []) as Array<Record<string, any>>;
  const pains = (content.userPainPoints ?? []) as Array<Record<string, any>>;
  const reqs = (content.functionalRequirements ?? []) as Array<Record<string, any>>;
  const risks = (content.technicalRisks ?? []) as Array<Record<string, any>>;
  const sources = (content.liveWebSources ?? []) as Array<Record<string, any>>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Resumo Executivo */}
      <div style={cardStyle}>
        <div style={sectionLabelStyle}>Resumo Executivo</div>
        <p style={bodyTextStyle}>{content.executiveSummary}</p>
      </div>

      {/* Posicionamento Recomendado */}
      {positioning && (
        <div style={cardStyle}>
          <div style={sectionLabelStyle}>Posicionamento Recomendado</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '10px',
              marginTop: '8px',
            }}
          >
            <div style={subCardStyle}>
              <div style={miniTitleStyle}>Proposta de Valor</div>
              <p style={miniTextStyle}>{positioning.valueProposition}</p>
            </div>
            <div style={subCardStyle}>
              <div style={miniTitleStyle}>Perfil de Cliente Ideal (ICP)</div>
              <p style={miniTextStyle}>{positioning.idealCustomerProfile}</p>
            </div>
            <div style={subCardStyle}>
              <div style={miniTitleStyle}>Estratégia de Preço</div>
              <p style={miniTextStyle}>
                {positioning.pricingStrategyRecommendation}
              </p>
            </div>
          </div>
          {Array.isArray(positioning.keyDifferentiators) && (
            <div style={{ marginTop: '12px' }}>
              <div style={miniTitleStyle}>Diferenciais Competitivos</div>
              <ul style={listStyle}>
                {positioning.keyDifferentiators.map((d: string, i: number) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Tabela Comparativa de Concorrentes */}
      {competitors.length > 0 && (
        <div style={cardStyle}>
          <div style={sectionLabelStyle}>
            Análise Competitiva ({competitors.length} concorrentes)
          </div>
          <div style={{ overflowX: 'auto', marginTop: '8px' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '12px',
                textAlign: 'left',
              }}
            >
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#94a3b8' }}>
                  <th style={thStyle}>Concorrente</th>
                  <th style={thStyle}>Modelo de Preço</th>
                  <th style={thStyle}>Forças & Fraquezas</th>
                  <th style={thStyle}>Nossa Oportunidade</th>
                </tr>
              </thead>
              <tbody>
                {competitors.map((comp, idx) => (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: '1px solid #151d2e',
                      verticalAlign: 'top',
                    }}
                  >
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 700, color: '#f8fafc' }}>
                        {comp.name}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>
                        {comp.targetSegment}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, color: '#38bdf8', fontWeight: 600 }}>
                      {comp.pricingModel}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ color: '#94a3b8', marginBottom: '4px' }}>
                        <strong style={{ color: '#34d399' }}>+</strong>{' '}
                        {(comp.strengths ?? []).slice(0, 2).join('; ')}
                      </div>
                      <div style={{ color: '#94a3b8' }}>
                        <strong style={{ color: '#f87171' }}>-</strong>{' '}
                        {(comp.weaknesses ?? []).slice(0, 2).join('; ')}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, color: '#e2e8f0' }}>{comp.ourEdge}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dores Reais de Usuários */}
      {pains.length > 0 && (
        <div style={cardStyle}>
          <div style={sectionLabelStyle}>Dores Reais & Oportunidades</div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              marginTop: '8px',
            }}
          >
            {pains.map((p, idx) => (
              <div key={idx} style={subCardStyle}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '6px',
                  }}
                >
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc' }}>
                    {p.persona}
                  </span>
                  <span style={severityBadge(p.severity)}>{p.severity}</span>
                </div>
                <p style={{ ...miniTextStyle, color: '#e2e8f0', marginBottom: '4px' }}>
                  {p.pain}
                </p>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                  Alternativa atual: {p.currentWorkaround}
                </div>
                <div
                  style={{
                    fontSize: '11.5px',
                    color: '#38bdf8',
                    marginTop: '4px',
                    fontWeight: 500,
                  }}
                >
                  Oportunidade: {p.productOpportunity}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Requisitos e Riscos */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '12px',
        }}
      >
        {reqs.length > 0 && (
          <div style={cardStyle}>
            <div style={sectionLabelStyle}>Requisitos Prioritários</div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                marginTop: '8px',
              }}
            >
              {reqs.map((r, i) => (
                <div key={i} style={subCardStyle}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      color: '#f8fafc',
                      marginBottom: '4px',
                    }}
                  >
                    <span>
                      {r.reqId} — {r.title}
                    </span>
                    <span style={{ color: '#38bdf8' }}>{r.priority}</span>
                  </div>
                  <ul style={listStyle}>
                    {(r.acceptanceCriteria ?? []).map((c: string, j: number) => (
                      <li key={j}>{c}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {risks.length > 0 && (
          <div style={cardStyle}>
            <div style={sectionLabelStyle}>Riscos Técnicos & Mitigações</div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                marginTop: '8px',
              }}
            >
              {risks.map((rk, i) => (
                <div key={i} style={subCardStyle}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '4px',
                    }}
                  >
                    <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#f8fafc' }}>
                      {rk.riskId}
                    </span>
                    <span style={severityBadge(rk.severity)}>{rk.severity}</span>
                  </div>
                  <p style={{ ...miniTextStyle, marginBottom: '4px' }}>
                    {rk.description}
                  </p>
                  <p style={{ fontSize: '11px', color: '#34d399', lineHeight: 1.4 }}>
                    Mitigação: {rk.mitigationStrategy}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Fontes Reais da Internet */}
      {sources.length > 0 && (
        <div style={cardStyle}>
          <div style={sectionLabelStyle}>
            Fontes Consultadas na Internet ({sources.length})
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              marginTop: '8px',
            }}
          >
            {sources.map((src, idx) => (
              <a
                key={idx}
                href={src.url}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '10px',
                  background: '#070a10',
                  border: '1px solid #1e293b',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  color: '#7dd3fc',
                  textDecoration: 'none',
                  fontSize: '12px',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {src.title}
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '10px',
                    color: '#64748b',
                    flexShrink: 0,
                  }}
                >
                  {src.source} <ExternalLink size={11} />
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 2. ENGINEERING / ARCHITECTURE RENDERER (ADRs, Mermaid, SQL, API Contracts)
// ============================================================================

export function EngineeringRenderer({
  content,
}: {
  content: Record<string, any>;
}) {
  const stackDecisions = (content.stackDecisions ?? []) as Array<
    Record<string, any>
  >;
  const dbModel = content.databaseModel as
    | {
        engine?: string;
        entities?: Array<{
          tableName: string;
          purpose: string;
          keyColumns: string[];
        }>;
        sqlSchema?: string;
      }
    | undefined;
  const apiContracts = (content.apiContracts ?? []) as Array<Record<string, any>>;
  const securityNotes = (content.securityAndScalabilityNotes ?? []) as string[];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={cardStyle}>
        <div style={sectionLabelStyle}>Visão Geral da Arquitetura</div>
        <p style={bodyTextStyle}>{content.architectureSummary}</p>
      </div>

      {/* Decisões de Stack Justificadas (ADRs) */}
      {stackDecisions.length > 0 && (
        <div style={cardStyle}>
          <div style={sectionLabelStyle}>Decisões de Stack (ADRs)</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '10px',
              marginTop: '8px',
            }}
          >
            {stackDecisions.map((sd, idx) => (
              <div key={idx} style={subCardStyle}>
                <div
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 700,
                    color: '#34d399',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {sd.layer}
                </div>
                <div
                  style={{
                    fontSize: '13.5px',
                    fontWeight: 700,
                    color: '#f8fafc',
                    margin: '4px 0 6px',
                  }}
                >
                  {sd.choice}
                </div>
                <p style={{ ...miniTextStyle, marginBottom: '6px' }}>
                  {sd.rationale}
                </p>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                  Trade-off: {sd.tradeOffs}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Diagrama Mermaid Renderizado Visualmente */}
      {typeof content.mermaidFlowDiagram === 'string' && (
        <MermaidDiagram chart={content.mermaidFlowDiagram} />
      )}

      {/* Modelagem SQL + Entidades */}
      {dbModel?.sqlSchema && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {Array.isArray(dbModel.entities) && dbModel.entities.length > 0 && (
            <div style={cardStyle}>
              <div style={sectionLabelStyle}>
                Entidades do Banco ({dbModel.engine ?? 'PostgreSQL'})
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                  gap: '8px',
                  marginTop: '8px',
                }}
              >
                {dbModel.entities.map((ent, idx) => (
                  <div key={idx} style={subCardStyle}>
                    <div
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#38bdf8',
                      }}
                    >
                      {ent.tableName}
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: '#94a3b8',
                        margin: '3px 0 6px',
                      }}
                    >
                      {ent.purpose}
                    </div>
                    <div style={{ fontSize: '11px', color: '#cbd5e1' }}>
                      {ent.keyColumns.join(' · ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <CodeBlock
            title="Modelagem de Banco de Dados (DDL)"
            language="sql"
            code={dbModel.sqlSchema}
          />
        </div>
      )}

      {/* Contratos de API */}
      {apiContracts.length > 0 && (
        <div style={cardStyle}>
          <div style={sectionLabelStyle}>
            Contratos de API ({apiContracts.length} endpoints)
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              marginTop: '8px',
            }}
          >
            {apiContracts.map((api, idx) => (
              <div key={idx} style={subCardStyle}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    marginBottom: '6px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={methodBadge(api.method)}>{api.method}</span>
                    <code
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '12px',
                        color: '#f8fafc',
                        fontWeight: 600,
                      }}
                    >
                      {api.path}
                    </code>
                  </div>
                  <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                    {api.authRequired ? 'Autenticado' : 'Público'}
                  </span>
                </div>
                <p style={{ ...miniTextStyle, marginBottom: '8px' }}>
                  {api.purpose}
                </p>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '8px',
                  }}
                >
                  <CodeBlock
                    title="Request"
                    language="json"
                    code={api.requestExample}
                    maxHeight="140px"
                  />
                  <CodeBlock
                    title="Response"
                    language="json"
                    code={api.responseExample}
                    maxHeight="140px"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {securityNotes.length > 0 && (
        <div style={cardStyle}>
          <div style={sectionLabelStyle}>Segurança & Escalabilidade</div>
          <ul style={listStyle}>
            {securityNotes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 3. DESIGN RENDERER (Paleta Copiável + Preview Real Multi-Tela Desktop/Mobile)
// ============================================================================

export function DesignRenderer({ content }: { content: Record<string, any> }) {
  const palette = (content.colorPalette ?? []) as Array<{
    name: string;
    role: string;
    hex: string;
    usage: string;
  }>;
  const typography = content.typography as
    | {
        headingFont?: string;
        bodyFont?: string;
        monoFont?: string;
        scaleRationale?: string;
      }
    | undefined;
  const builtScreens = (content.builtScreens ?? []) as Array<{
    screenKey: string;
    title: string;
    route: string;
    purpose: string;
    previewUrl: string;
  }>;
  const rawScreens = (content.screens ?? []) as Array<{
    screenKey: string;
    title: string;
    route: string;
    purpose: string;
    htmlCode: string;
  }>;

  const [selectedScreenIdx, setSelectedScreenIdx] = useState(0);
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [showCode, setShowCode] = useState(false);
  const [copiedHex, setCopiedHex] = useState<string | null>(null);

  const currentScreen = builtScreens[selectedScreenIdx];
  const currentRawScreen = rawScreens[selectedScreenIdx];

  const handleCopyHex = async (hex: string) => {
    await navigator.clipboard.writeText(hex);
    setCopiedHex(hex);
    setTimeout(() => setCopiedHex(null), 1500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={cardStyle}>
        <div style={sectionLabelStyle}>Direção de Interface & UX</div>
        <p style={bodyTextStyle}>{content.designSummary}</p>
      </div>

      {/* Paleta de Cores + Tipografia */}
      <div style={cardStyle}>
        <div style={sectionLabelStyle}>Sistema Visual (Cores & Tipografia)</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '8px',
            marginTop: '8px',
          }}
        >
          {palette.map((swatch, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleCopyHex(swatch.hex)}
              title="Clique para copiar HEX"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: '#070a10',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '9px 10px',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '6px',
                  background: swatch.hex,
                  border: '1px solid rgba(255,255,255,0.12)',
                  flexShrink: 0,
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#f8fafc' }}>
                  {swatch.name}
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    color: copiedHex === swatch.hex ? '#34d399' : '#94a3b8',
                    fontFamily: "'JetBrains Mono', monospace",
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  {copiedHex === swatch.hex ? (
                    <>
                      <Check size={10} /> Copiado
                    </>
                  ) : (
                    swatch.hex
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>

        {typography && (
          <div
            style={{
              marginTop: '12px',
              paddingTop: '12px',
              borderTop: '1px solid #1e293b',
              display: 'flex',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
              fontSize: '12px',
              color: '#cbd5e1',
            }}
          >
            <div>
              <span style={{ color: '#64748b' }}>Fontes: </span>
              <strong>{typography.headingFont}</strong> / {typography.monoFont}
            </div>
            <div style={{ color: '#94a3b8', fontSize: '11.5px' }}>
              {typography.scaleRationale}
            </div>
          </div>
        )}
      </div>

      {/* Preview Interativo Real Multi-Tela Desktop / Mobile */}
      {builtScreens.length > 0 && currentScreen && (
        <div
          style={{
            background: '#070a10',
            border: '1px solid #1e293b',
            borderRadius: '12px',
            overflow: 'hidden',
          }}
        >
          {/* Seletor de Telas */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              padding: '10px 14px',
              background: '#0d131f',
              borderBottom: '1px solid #1e293b',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {builtScreens.map((scr, idx) => {
                const active = idx === selectedScreenIdx;
                return (
                  <button
                    key={scr.screenKey}
                    type="button"
                    onClick={() => setSelectedScreenIdx(idx)}
                    style={{
                      background: active ? '#1e293b' : 'transparent',
                      color: active ? '#f8fafc' : '#94a3b8',
                      border: active
                        ? '1px solid #ec4899'
                        : '1px solid transparent',
                      borderRadius: '7px',
                      padding: '6px 11px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {scr.title}
                  </button>
                );
              })}
            </div>

            {/* Controles Desktop / Mobile / Código / Nova Aba */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                onClick={() => {
                  setViewport('desktop');
                  setShowCode(false);
                }}
                style={viewportBtnStyle(viewport === 'desktop' && !showCode)}
                title="Visualização Desktop"
              >
                <Monitor size={13} /> Desktop
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewport('mobile');
                  setShowCode(false);
                }}
                style={viewportBtnStyle(viewport === 'mobile' && !showCode)}
                title="Visualização Mobile (390px)"
              >
                <Smartphone size={13} /> Mobile
              </button>
              {currentRawScreen && (
                <button
                  type="button"
                  onClick={() => setShowCode(!showCode)}
                  style={viewportBtnStyle(showCode)}
                >
                  <Code2 size={13} /> HTML
                </button>
              )}
              <a
                href={currentScreen.previewUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: '#1e293b',
                  color: '#cbd5e1',
                  textDecoration: 'none',
                  borderRadius: '6px',
                  padding: '5px 9px',
                  fontSize: '11px',
                  fontWeight: 600,
                }}
              >
                <ExternalLink size={12} /> Abrir
              </a>
            </div>
          </div>

          <div
            style={{
              padding: '8px 14px',
              borderBottom: '1px solid #151d2e',
              fontSize: '11.5px',
              color: '#94a3b8',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>{currentScreen.purpose}</span>
            <code style={{ color: '#64748b' }}>{currentScreen.route}</code>
          </div>

          {showCode && currentRawScreen ? (
            <div style={{ padding: '12px' }}>
              <CodeBlock
                title={`${currentRawScreen.screenKey}.html`}
                language="html"
                code={currentRawScreen.htmlCode}
                maxHeight="460px"
              />
            </div>
          ) : (
            <div
              style={{
                padding: viewport === 'mobile' ? '18px' : '0',
                background: '#05070c',
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <iframe
                key={currentScreen.previewUrl}
                srcDoc={currentRawScreen?.htmlCode}
                src={currentRawScreen?.htmlCode ? undefined : currentScreen.previewUrl}
                sandbox="allow-scripts"
                title={currentScreen.title}
                style={{
                  width: viewport === 'mobile' ? '390px' : '100%',
                  height: '500px',
                  border:
                    viewport === 'mobile' ? '4px solid #334155' : 'none',
                  borderRadius: viewport === 'mobile' ? '20px' : '0',
                  background: '#090d16',
                  transition: 'width 0.25s ease',
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 4. GROWTH RENDERER (Pricing, Canais e Experimentos)
// ============================================================================

export function GrowthRenderer({ content }: { content: Record<string, any> }) {
  const tiers = (content.pricingTiers ?? []) as Array<Record<string, any>>;
  const channels = (content.acquisitionChannels ?? []) as Array<
    Record<string, any>
  >;
  const experiments = (content.experiments ?? []) as Array<Record<string, any>>;
  const checklist = (content.launchChecklist ?? []) as string[];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={cardStyle}>
        <div style={sectionLabelStyle}>Estratégia Go-To-Market</div>
        <p style={bodyTextStyle}>{content.gtmSummary}</p>
        <div
          style={{
            marginTop: '10px',
            padding: '10px 12px',
            background: '#070a10',
            borderRadius: '8px',
            borderLeft: '3px solid #f59e0b',
            fontSize: '12.5px',
            color: '#fde68a',
          }}
        >
          North Star Metric: <strong>{content.northStarMetric}</strong>
        </div>
      </div>

      {tiers.length > 0 && (
        <div style={cardStyle}>
          <div style={sectionLabelStyle}>Estrutura de Precificação</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '10px',
              marginTop: '8px',
            }}
          >
            {tiers.map((t, i) => (
              <div key={i} style={subCardStyle}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#f59e0b' }}>
                  {t.tierName}
                </div>
                <div
                  style={{
                    fontSize: '18px',
                    fontWeight: 800,
                    color: '#f8fafc',
                    margin: '4px 0',
                  }}
                >
                  {t.monthlyPrice}
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>
                  {t.targetCustomer}
                </div>
                <ul style={listStyle}>
                  {(t.includedLimits ?? []).map((lim: string, j: number) => (
                    <li key={j}>{lim}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {channels.length > 0 && (
        <div style={cardStyle}>
          <div style={sectionLabelStyle}>Canais de Aquisição</div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              marginTop: '8px',
            }}
          >
            {channels.map((ch, i) => (
              <div key={i} style={subCardStyle}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '4px',
                  }}
                >
                  <strong style={{ fontSize: '12.5px', color: '#f8fafc' }}>
                    {ch.channel}
                  </strong>
                  <span style={{ fontSize: '11px', color: '#38bdf8' }}>
                    {ch.targetMetric}
                  </span>
                </div>
                <p style={miniTextStyle}>{ch.tactic}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {experiments.length > 0 && (
        <div style={cardStyle}>
          <div style={sectionLabelStyle}>Experimentos & Checklist</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
            {experiments.map((ex, i) => (
              <div key={i} style={subCardStyle}>
                <div style={{ fontSize: '12px', color: '#e2e8f0', fontWeight: 600 }}>
                  {ex.hypothesis}
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                  Métrica: {ex.primaryMetric} · Janela: {ex.executionWindow}
                </div>
              </div>
            ))}
          </div>
          {checklist.length > 0 && (
            <ul style={{ ...listStyle, marginTop: '12px' }}>
              {checklist.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ESTILOS SOBRIOS COMPARTILHADOS
// ============================================================================

const cardStyle: React.CSSProperties = {
  background: '#0d131f',
  border: '1px solid #1e293b',
  borderRadius: '10px',
  padding: '16px',
};

const subCardStyle: React.CSSProperties = {
  background: '#070a10',
  border: '1px solid #1e293b',
  borderRadius: '8px',
  padding: '12px',
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '6px',
};

const bodyTextStyle: React.CSSProperties = {
  fontSize: '13.5px',
  color: '#e2e8f0',
  lineHeight: 1.6,
};

const miniTitleStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  color: '#cbd5e1',
  marginBottom: '4px',
};

const miniTextStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#94a3b8',
  lineHeight: 1.5,
};

const listStyle: React.CSSProperties = {
  paddingLeft: '16px',
  fontSize: '12px',
  color: '#cbd5e1',
  lineHeight: 1.5,
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const thStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontWeight: 600,
  fontSize: '11px',
};

const tdStyle: React.CSSProperties = {
  padding: '10px',
  lineHeight: 1.45,
};

function viewportBtnStyle(active: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    background: active ? '#1e293b' : 'transparent',
    color: active ? '#f8fafc' : '#94a3b8',
    border: active ? '1px solid #475569' : '1px solid transparent',
    borderRadius: '6px',
    padding: '5px 9px',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
  };
}

function severityBadge(sev: string): React.CSSProperties {
  const isCrit = sev === 'critical' || sev === 'high';
  return {
    fontSize: '10px',
    fontWeight: 700,
    textTransform: 'uppercase',
    padding: '2px 7px',
    borderRadius: '999px',
    background: isCrit
      ? 'rgba(239, 68, 68, 0.14)'
      : 'rgba(245, 158, 11, 0.14)',
    color: isCrit ? '#fca5a5' : '#fde68a',
  };
}

function methodBadge(method: string): React.CSSProperties {
  const colors: Record<string, { bg: string; fg: string }> = {
    GET: { bg: 'rgba(56, 189, 248, 0.15)', fg: '#7dd3fc' },
    POST: { bg: 'rgba(16, 185, 129, 0.15)', fg: '#6ee7b7' },
    PUT: { bg: 'rgba(245, 158, 11, 0.15)', fg: '#fcd34d' },
    PATCH: { bg: 'rgba(245, 158, 11, 0.15)', fg: '#fcd34d' },
    DELETE: { bg: 'rgba(239, 68, 68, 0.15)', fg: '#fca5a5' },
    WS: { bg: 'rgba(168, 85, 247, 0.15)', fg: '#d8b4fe' },
  };
  const c = colors[method] ?? { bg: '#1e293b', fg: '#cbd5e1' };
  return {
    fontSize: '10px',
    fontWeight: 800,
    padding: '2px 7px',
    borderRadius: '5px',
    background: c.bg,
    color: c.fg,
    fontFamily: "'JetBrains Mono', monospace",
  };
}
