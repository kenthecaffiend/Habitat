-- Explicitly approved isolated working-site bookkeeping extension. Never apply to production.
BEGIN;
DO $$ BEGIN IF current_database()<>'hr_actual_test' OR (SELECT environment FROM environment_identity WHERE id=1)<>'actual-test' THEN RAISE EXCEPTION 'Wrong bookkeeping target'; END IF; END $$;
CREATE TABLE bookkeeping_schema(id integer PRIMARY KEY CHECK(id=1),version integer NOT NULL CHECK(version=1));INSERT INTO bookkeeping_schema VALUES(1,1);
CREATE TABLE payroll_finalisation(run_id uuid PRIMARY KEY REFERENCES payroll_run(id),revision integer NOT NULL,snapshot jsonb NOT NULL,snapshot_hash text NOT NULL CHECK(snapshot_hash ~ '^[a-f0-9]{64}$'),actor_id text NOT NULL REFERENCES "user"(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TRIGGER immutable_finalisation BEFORE UPDATE OR DELETE ON payroll_finalisation FOR EACH ROW EXECUTE FUNCTION protect_simulated_document();
ALTER TABLE payroll_run DROP CONSTRAINT actual_draft_run;
ALTER TABLE payroll_run ADD CONSTRAINT actual_bookkeeping_run CHECK(state IN ('draft','approved') AND cpf_payment IS NULL AND acknowledgement IS NULL);
CREATE OR REPLACE FUNCTION actual_test_run_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' AND OLD.state='draft' AND NEW.state='approved' AND NEW.revision=OLD.revision+1 AND (to_jsonb(OLD)-ARRAY['state','revision'])=(to_jsonb(NEW)-ARRAY['state','revision']) AND EXISTS(SELECT FROM payroll_finalisation f WHERE f.run_id=OLD.id AND f.revision=NEW.revision) THEN RETURN NEW; END IF;
 IF TG_OP<>'UPDATE' OR OLD.state<>'draft' OR NEW.state<>'draft' OR NEW.revision<>OLD.revision+1 OR (to_jsonb(OLD)-ARRAY['revision','roster','capture'])<>(to_jsonb(NEW)-ARRAY['revision','roster','capture']) OR EXISTS(SELECT FROM payroll_finalisation f WHERE f.run_id=OLD.id) OR EXISTS(SELECT FROM payroll_entry e WHERE e.run_id=OLD.id AND EXISTS(SELECT FROM payslip_obligation p WHERE p.entry_id=e.id)) THEN RAISE EXCEPTION 'Finalised payroll is immutable'; END IF; RETURN NEW; END $$;
CREATE FUNCTION protect_finalised_entry() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT FROM payroll_finalisation f WHERE f.run_id=OLD.run_id) THEN RAISE EXCEPTION 'Finalised entry is immutable'; END IF;IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END $$;
CREATE TRIGGER finalised_entry_immutable BEFORE UPDATE OR DELETE ON payroll_entry FOR EACH ROW EXECUTE FUNCTION protect_finalised_entry();
GRANT SELECT ON bookkeeping_schema,payroll_finalisation TO hr_actual_test_app;GRANT INSERT ON payroll_finalisation,payroll_paid_status,payslip_obligation,payroll_date_payslip,payslip_pdf,payslip_pdf_attempt,leave_closed_period TO hr_actual_test_app;
GRANT UPDATE(state) ON payroll_run TO hr_actual_test_app;GRANT UPDATE(paid,payment_date,revision) ON payroll_paid_status TO hr_actual_test_app;GRANT UPDATE(paid) ON payroll_claim TO hr_actual_test_app;GRANT UPDATE(state,reason) ON payslip_pdf_attempt TO hr_actual_test_app;
COMMIT;
