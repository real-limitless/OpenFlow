-- Reverse of 20261023120000_audit_log_append_only.
DROP TRIGGER IF EXISTS audit_logs_append_only_truncate ON audit_logs;
DROP TRIGGER IF EXISTS audit_logs_append_only_row ON audit_logs;
DROP FUNCTION IF EXISTS openflow_audit_logs_append_only();
