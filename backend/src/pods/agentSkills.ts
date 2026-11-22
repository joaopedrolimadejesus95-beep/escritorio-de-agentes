import type { DepartmentId } from '@ai-office/shared';

export interface AgentDepartmentSkillPack {
  department: Exclude<DepartmentId, 'director'>;
  skillName: string;
  version: string;
  librariesAndStandards: string[];
  qualityRules: string[];
  systemPromptDirective: string;
}

/**
 * Catálogo de Skills Especialistas dos Pods do Escritório Virtual.
 * Cada departamento segue padrões estritos de engenharia web moderna, acessibilidade,
 * visualização de dados e bibliotecas reais da internet.
 */
export const DEPARTMENT_SKILL_PACKS: Record<
  Exclude<DepartmentId, 'director'>,
  AgentDepartmentSkillPack
> = {
  research: {
    department: 'research',
    skillName: 'deep-market-and-architecture-intelligence',
    version: '2.0.0',
    librariesAndStandards: [
      'HackerNews Algolia Technical Search API',
      'Wikipedia REST Domain Knowledge API',
      'GitHub Repositories Star-Ranked API',
      'NPM Official Package Registry API (registry.npmjs.org)',
      'Mermaid.js Architecture Diagramming Standard',
    ],
    qualityRules: [
      'Cruzar pelo menos 3 fontes reais da internet com pacotes verificados no NPM e repositórios no GitHub.',
      'Quantificar riscos técnicos com severidade e estratégia de mitigação acionável (>= 30 caracteres).',
      'Incluir diagrama de arquitetura Mermaid.js renderizável e matriz de requisitos rastreável.',
    ],
    systemPromptDirective:
      'Atue como Principal Staff Researcher & Solutions Architect. Fundamentar cada decisão em dados vivos coletados das APIs de busca web, GitHub e NPM.',
  },

  design: {
    department: 'design',
    skillName: 'modern-ui-ux-design-system-architect',
    version: '2.0.0',
    librariesAndStandards: [
      'Lucide Icons (https://unpkg.com/lucide@latest)',
      'CSS Container Queries (@container) & Logical Properties',
      'Modern Web Guidance: Responsive Tables (sticky headers + @container stacked cards)',
      'Modern Web Guidance: Accessible Tablist (aria-selected + border-block-end indicator)',
      'Inter & JetBrains Mono Typography System',
    ],
    qualityRules: [
      'Construir protótipo HTML5/CSS3 de alta fidelidade com ícones vetoriais Lucide, navegação por abas acessível e seletor de tema Dark/Light ao vivo.',
      'Aplicar Container Queries (@container) e cabeçalhos sticky em tabelas de dados para legibilidade em qualquer largura.',
      'Nunca indicar estado selecionado apenas por cor (WCAG 1.4.1): usar indicador geométrico (border-block-end).',
    ],
    systemPromptDirective:
      'Atue como Principal Design Systems Engineer. Entregue interfaces de nível de produção com micro-interações, tokens CSS variáveis e acessibilidade moderna.',
  },

  engineering: {
    department: 'engineering',
    skillName: 'fullstack-interactive-mvp-builder',
    version: '2.0.0',
    librariesAndStandards: [
      'Chart.js 4.4 (https://cdn.jsdelivr.net/npm/chart.js)',
      'Lucide Icons (https://unpkg.com/lucide@latest)',
      'Modern Web Guidance: Semantic Responsive Data Table (role="region", sticky headers, @container)',
      'LocalStorage Persistent State Engine + CSV/JSON Exporter',
      'Strict TypeScript Domain Contracts & SQL Schema',
    ],
    qualityRules: [
      'Construir aplicação web funcional com gráficos Chart.js em tempo real, busca/filtro instantâneo, ordenação de colunas, persistência local e exportação CSV.',
      'Consumir automaticamente os Design Tokens aprovados pelo Pod Design.',
      'Entregar código-fonte TypeScript limpo e testável no workspace do projeto.',
    ],
    systemPromptDirective:
      'Atue como Principal Full-Stack Engineer. Construa uma aplicação web rica, responsiva e 100% funcional que o usuário possa operar imediatamente no preview.',
  },

  growth: {
    department: 'growth',
    skillName: 'plg-conversion-and-roi-simulator-engineer',
    version: '2.0.0',
    librariesAndStandards: [
      'Chart.js 4.4 Funnel & Cohort Projection',
      'Lucide Icons (https://unpkg.com/lucide@latest)',
      'Interactive ROI & Pricing Tier Calculator',
      'Product-Led Growth (PLG) Activation Metrics Framework',
    ],
    qualityRules: [
      'Construir Landing Page comercial de alta conversão com Calculadora Interativa de ROI em tempo real e simulação de planos.',
      'Definir North Star Metric quantitativa e experimentos A/B com hipótese verificável.',
    ],
    systemPromptDirective:
      'Atue como Head of Growth Engineering. Construa uma página de lançamento persuasiva com calculadora financeira interativa e funil de ativação.',
  },
};
