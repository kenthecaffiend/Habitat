ALTER TABLE leave_request ADD COLUMN submitted_at timestamptz;
UPDATE leave_request r SET submitted_at=(SELECT min(a.created_at) FROM audit_event a WHERE a.entity_id=r.id::text AND a.action IN ('leave.submit','leave.exception-verified'));
ALTER TABLE leave_request ALTER COLUMN submitted_at SET DEFAULT clock_timestamp();
CREATE TRIGGER immutable_leave_submitted_at BEFORE UPDATE OF submitted_at ON leave_request FOR EACH ROW EXECUTE FUNCTION protect_simulated_document();
