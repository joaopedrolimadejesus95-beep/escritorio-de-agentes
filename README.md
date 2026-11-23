# AI Office Studio

Escritório 3D multiagente: você envia o escopo de um produto e uma equipe de agentes de IA especializados (Diretor, Pesquisa, Arquitetura, Design e Growth) trabalha em sequência, passando o contexto entre si. Cada entrega pausa em um *quality gate* para você aprovar ou pedir ajustes.

## Como funciona

1. Você descreve o produto (ex.: "Plataforma SaaS para clínicas odontológicas").
2. O **Diretor Executivo** gera um plano em formato DAG (tarefas e dependências), validado com Zod.
3. Os departamentos executam suas tarefas chamando um LLM real e ferramentas de internet:

| Agente | Entrega |
|---|---|
| Pesquisa de Mercado | Concorrentes, modelos de preço, dores de usuários, posicionamento |
| Arquitetura & Dados | Decisões de stack, diagrama Mermaid, SQL (DDL), contratos de API |
| Design de Interface | Paleta, tipografia e telas HTML/Tailwind com preview Desktop/Mobile |
| Estratégia & Growth | Plano de lançamento e aquisição |

4. Cada entrega passa por validação determinística (schema Zod + regras de domínio, com auto-correção do LLM) e depois aguarda sua aprovação.
5. Tarefas que falham podem ser reexecutadas com **Tentar Novamente**, sem perder as entregas já aprovadas.

## Recursos

- **Escritório 3D** (React Three Fiber): estúdio estilo loft com 5 estações, hover, foco suave de câmera e cartões de status em tempo real via Socket.io.
- **Painel lateral de entregas**: cada resultado é renderizado no formato certo (cards e tabela comparativa, Mermaid, blocos de código com botão de copiar, preview em `iframe`), sem JSON cru.
- **Provedores de IA**: Google Gemini (com cadeia de fallback entre modelos), Anthropic (Claude), OpenAI e Ollama local.
- **Ferramentas dos agentes**: busca web, leitura de páginas, radar de repositórios do GitHub e de pacotes npm, escrita de arquivos no workspace.
- **Contas e histórico**: cadastro/login, projetos isolados por usuário e botão **Histórico** para retomar projetos.
- **Orçamento de tokens** por projeto, com barra de consumo.

## Segurança

- Senhas com `scrypt` (salt aleatório) e sessão em cookie `HttpOnly` (`SameSite=Lax`); só o hash SHA-256 do token fica no banco.
- API keys por usuário criptografadas com **AES-256-GCM** (AAD `userId:provedor`). A chave mestra `APP_ENCRYPTION_KEY` vem do ambiente ou é gerada em `backend/.env.local` (fora do Git). A chave nunca volta ao navegador, só uma máscara (`sk-a...7890`).
- **Modo Sessão Efêmera**: a chave fica só na memória do servidor, sem gravar no banco.
- Verificação de dono do projeto em todas as rotas REST, no workspace e nos eventos do Socket.io.
- Rate limiting (global por IP, login, cadastro, criação de projetos, ações do Socket.io, chamadas de LLM) e limite de 2 projetos simultâneos por conta.
- Proteção anti-SSRF nas ferramentas de busca (bloqueia localhost, redes privadas e metadata de nuvem).
- CORS restrito, headers de segurança, limite de 64 KB no corpo JSON, redação de chaves em logs/erros e `iframe sandbox="allow-scripts"` para as telas geradas.

> Observação: o isolamento acima foi pensado para uso local ou em um servidor sob seu controle. Antes de expor publicamente, defina `APP_ENCRYPTION_KEY` e `CORS_ORIGINS`, use HTTPS e faça uma revisão de segurança própria.

## Stack

| Camada | Tecnologias |
|---|---|
| Frontend | React, Vite, TypeScript, Three.js / React Three Fiber, Zustand, Mermaid |
| Backend | Node.js, TypeScript, Socket.io, Zod |
| Banco | PostgreSQL (via `DATABASE_URL`) ou PGlite embarcado como fallback automático |
| Compartilhado | Pacote `shared` com contratos de eventos e schemas |

## Estrutura

```
ai-office/
├── shared/     # Schemas Zod, DTOs e eventos Socket.io
├── backend/    # API HTTP, Socket.io, state machine do DAG, pods, ferramentas, LLM, segurança
│   └── src/
│       ├── auth/  db/  llm/  orchestrator/  pods/  security/  server/  tools/
└── frontend/   # Cena 3D, drawer de entregas, modais de login/histórico/IA
```

## Como rodar

Pré-requisito: Node.js 20+.

```bash
npm install
npm run dev:backend    # http://localhost:4000
npm run dev:frontend   # http://localhost:5173
```

1. Abra `http://localhost:5173`.
2. Clique em **Entrar / Criar Conta**.
3. Clique em **Configurar IA**, escolha o provedor, cole sua API key e salve.
4. Descreva o produto e clique em **Iniciar**.

Sem `DATABASE_URL`, o backend usa o PGlite em `backend/.pgdata/` automaticamente.

### Variáveis de ambiente (opcionais, `backend/.env.local`)

| Variável | Uso |
|---|---|
| `DATABASE_URL` | PostgreSQL próprio em vez do PGlite |
| `APP_ENCRYPTION_KEY` | Chave mestra AES-256 (64 hex ou 44 base64); gerada automaticamente se ausente |
| `CORS_ORIGINS` | Origens permitidas, separadas por vírgula |
| `PORT` | Porta do backend (padrão 4000) |
| `OLLAMA_BASE_URL` | URL do Ollama local |

Nunca commite `backend/.env.local`, `backend/.pgdata/` ou `workspace_outputs/` (já estão no `.gitignore`).

## Scripts

```bash
npm run typecheck                      # TypeScript em todos os workspaces
npx tsx --test backend/src/security/security.test.ts   # testes de segurança/criptografia
```

## Limitações conhecidas

- Planos gratuitos de API têm cota diária; ao estourar, o projeto falha com erro 429 e pode ser retomado com **Tentar Novamente** quando a cota voltar.
- O ambiente de testes automatizados cobre apenas os módulos de segurança; o restante foi validado manualmente no navegador.

## Licença

Distribuído sob a licença **MIT**. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.
