-- ============================================================================
-- Migration 003: Suporte ao Departamento Builder no catálogo de tarefas DAG
-- ============================================================================

DO $$
DECLARE
  constraint_name_var TEXT;
BEGIN
  SELECT conname INTO constraint_name_var
  FROM pg_constraint
  WHERE conrelid = 'tasks'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%department%';

  IF constraint_name_var IS NOT NULL THEN
    EXECUTE format('ALTER TABLE tasks DROP CONSTRAINT %I', constraint_name_var);
  END IF;

  ALTER TABLE tasks
    ADD CONSTRAINT tasks_department_check
    CHECK (department IN ('research', 'design', 'engineering', 'growth', 'builder'));
END $$;
