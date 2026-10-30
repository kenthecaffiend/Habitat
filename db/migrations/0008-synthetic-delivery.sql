CREATE TABLE delivery_preference(employee_id uuid PRIMARY KEY REFERENCES employee(id),enabled boolean NOT NULL DEFAULT false);
CREATE TABLE payslip_obligation(
 id uuid PRIMARY KEY,entry_id uuid NOT NULL REFERENCES payroll_entry(id),employee_id uuid NOT NULL REFERENCES employee(id),
 event_kind text NOT NULL CHECK(event_kind IN ('payment','correction')),event_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0),snapshot jsonb NOT NULL,snapshot_hash text NOT NULL,
 due_at text,recipient text NOT NULL,render_state text NOT NULL DEFAULT 'planned' CHECK(render_state IN ('planned','render_failed','simulated_rendered')),
 UNIQUE(event_kind,event_id),UNIQUE(entry_id,version));
CREATE TABLE simulated_document(obligation_id uuid PRIMARY KEY REFERENCES payslip_obligation(id),body text NOT NULL,sha256 text NOT NULL);
CREATE TABLE delivery_outbox(
 id uuid PRIMARY KEY,obligation_id uuid UNIQUE NOT NULL REFERENCES payslip_obligation(id),message_id text UNIQUE NOT NULL,
 state text NOT NULL DEFAULT 'planned' CHECK(state IN ('planned','sending','definite_failure','unknown','simulated_accepted','held')),
 token uuid,lease_until timestamptz,next_attempt timestamptz NOT NULL DEFAULT '-infinity',provider_reference text);
CREATE TABLE delivery_attempt(id uuid PRIMARY KEY,outbox_id uuid NOT NULL REFERENCES delivery_outbox(id),started_at timestamptz NOT NULL,finished_at timestamptz,state text NOT NULL CHECK(state IN ('sending','definite_failure','unknown','simulated_accepted')),provider_reference text);
CREATE FUNCTION protect_payslip_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (NEW.id,NEW.entry_id,NEW.employee_id,NEW.event_kind,NEW.event_id,NEW.version,NEW.snapshot,NEW.snapshot_hash,NEW.due_at,NEW.recipient) IS DISTINCT FROM (OLD.id,OLD.entry_id,OLD.employee_id,OLD.event_kind,OLD.event_id,OLD.version,OLD.snapshot,OLD.snapshot_hash,OLD.due_at,OLD.recipient) THEN RAISE EXCEPTION 'Immutable payslip snapshot'; END IF;RETURN NEW;END $$;
CREATE TRIGGER immutable_payslip BEFORE UPDATE ON payslip_obligation FOR EACH ROW EXECUTE FUNCTION protect_payslip_snapshot();
CREATE FUNCTION protect_simulated_document() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable simulated document';END $$;
CREATE TRIGGER immutable_document BEFORE UPDATE ON simulated_document FOR EACH ROW EXECUTE FUNCTION protect_simulated_document();
