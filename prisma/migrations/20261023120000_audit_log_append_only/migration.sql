-- AuditLog is append-only for the application role.
-- UPDATE, DELETE, and TRUNCATE raise until a maintenance role deletes aged rows.
-- Reverse with prisma/migrations/20261023120000_audit_log_append_only/down.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'openflow_audit_maintenance') THEN
    CREATE ROLE openflow_audit_maintenance NOLOGIN;
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'openflow_audit_maintenance role was not created';
END $$;

CREATE OR REPLACE FUNCTION openflow_audit_logs_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  maintenance boolean := false;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'openflow_audit_maintenance') THEN
    maintenance := pg_has_role(current_user, 'openflow_audit_maintenance', 'MEMBER');
  END IF;

  -- Maintenance may delete aged rows. Updates and truncates stay forbidden.
  IF TG_OP = 'DELETE' AND maintenance THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'audit_logs is append-only (op=%)', TG_OP
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_append_only_row ON audit_logs;
CREATE TRIGGER audit_logs_append_only_row
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION openflow_audit_logs_append_only();

DROP TRIGGER IF EXISTS audit_logs_append_only_truncate ON audit_logs;
CREATE TRIGGER audit_logs_append_only_truncate
BEFORE TRUNCATE ON audit_logs
FOR EACH STATEMENT
EXECUTE FUNCTION openflow_audit_logs_append_only();
