-- ============================================================================
-- Migration 001: Core Schema (Projects, Tasks DAG, Versioned Artifacts)
-- ============================================================================

-- 1. Tabela de Projetos
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  raw_scope TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planning', 'running', 'paused', 'completed', 'failed')) DEFAULT 'planning',
  token_budget INTEGER NOT NULL DEFAULT 100000 CHECK (token_budget > 0),
  tokens_used INTEGER NOT NULL DEFAULT 0 CHECK (tokens_used >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Tabela de Tarefas (Nós do DAG)
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_key TEXT NOT NULL,
  department TEXT NOT NULL CHECK (department IN ('research', 'design', 'engineering', 'growth')),
  objective TEXT NOT NULL,
  depends_on TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'running', 'awaiting_approval', 'done', 'failed')) DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
  last_error TEXT,
  human_feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, task_key)
);

CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status);

-- 3. Tabela de Artefatos Versionados (Handoffs imutáveis entre departamentos)
CREATE TABLE IF NOT EXISTS artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (task_id, version)
);

CREATE INDEX IF NOT EXISTS idx_artifacts_project_task ON artifacts(project_id, task_id, version DESC);
