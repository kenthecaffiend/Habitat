-- Apply only as the owner of the existing isolated actual-test database.
DO $$ BEGIN IF current_database()<>'hr_actual_test' OR (SELECT environment FROM environment_identity WHERE id=1)<>'actual-test' THEN RAISE EXCEPTION 'Wrong monthly target'; END IF; END $$;
CREATE OR REPLACE FUNCTION actual_test_employee_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP<>'UPDATE' OR OLD.role='admin' OR NOT OLD.active OR NEW.active OR (to_jsonb(OLD)-'active')<>(to_jsonb(NEW)-'active') THEN RAISE EXCEPTION 'Only employee archive is permitted'; END IF; RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION actual_test_roster_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(7219310); IF NEW.role='admin' AND EXISTS(SELECT FROM employee WHERE role='admin') THEN RAISE EXCEPTION 'One owner only'; END IF; RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION actual_test_run_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP<>'UPDATE' OR OLD.state<>'draft' OR NEW.state<>'draft' OR NEW.revision<>OLD.revision+1 OR (to_jsonb(OLD)-ARRAY['revision','roster','capture'])<>(to_jsonb(NEW)-ARRAY['revision','roster','capture']) OR EXISTS(SELECT FROM payroll_entry e WHERE e.run_id=OLD.id AND (EXISTS(SELECT FROM payroll_payment p WHERE p.entry_id=e.id) OR EXISTS(SELECT FROM payslip_obligation p WHERE p.entry_id=e.id))) THEN RAISE EXCEPTION 'Only unissued draft revisions are permitted'; END IF; RETURN NEW; END $$;
CREATE FUNCTION actual_claim_capture_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (to_jsonb(OLD)-'state')<>(to_jsonb(NEW)-'state') OR NOT ((OLD.state='approved' AND NEW.state='allocated') OR (OLD.state='allocated' AND NEW.state='approved')) THEN RAISE EXCEPTION 'Only approved claim draft capture/release is permitted'; END IF; RETURN NEW; END $$;
CREATE TRIGGER actual_claim_capture_only BEFORE UPDATE ON claim FOR EACH ROW EXECUTE FUNCTION actual_claim_capture_only();
GRANT SELECT,INSERT ON payroll_setting,payroll_draft_revision TO hr_actual_test_app;
GRANT SELECT ON saved_payroll_schema TO hr_actual_test_app;
GRANT UPDATE(archived_on) ON employee_directory TO hr_actual_test_app;
GRANT UPDATE(roster,capture) ON payroll_run TO hr_actual_test_app;
GRANT DELETE ON payroll_entry TO hr_actual_test_app;
GRANT INSERT,DELETE ON payroll_claim TO hr_actual_test_app;
GRANT UPDATE(state) ON claim TO hr_actual_test_app;
