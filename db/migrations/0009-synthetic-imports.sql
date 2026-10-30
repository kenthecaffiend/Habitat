CREATE TABLE import_target_version(id integer PRIMARY KEY CHECK(id=1),version bigint NOT NULL DEFAULT 0);
INSERT INTO import_target_version VALUES(1,0);
CREATE FUNCTION advance_import_target() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE import_target_version SET version=version+1 WHERE id=1; RETURN NULL; END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['employee','leave_profile','leave_grant','leave_request','leave_allocation','leave_payroll_hold','claim','claim_attachment','private_attachment','payroll_profile','payroll_run','payroll_entry','payroll_payment','payroll_claim','payroll_claim_payment','payroll_correction','payroll_correction_resolution'] LOOP EXECUTE format('CREATE TRIGGER import_target_changed AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH STATEMENT EXECUTE FUNCTION advance_import_target()',t);END LOOP;END $$;
CREATE TRIGGER import_target_user_changed AFTER UPDATE OF name,email ON "user" FOR EACH STATEMENT EXECUTE FUNCTION advance_import_target();
CREATE TABLE import_source(source_system text PRIMARY KEY,watermark text NOT NULL,delta_checksum text NOT NULL,version integer NOT NULL DEFAULT 1);
CREATE TABLE import_batch(id uuid PRIMARY KEY,actor_employee_id uuid NOT NULL REFERENCES employee(id),source_system text NOT NULL REFERENCES import_source(source_system),checksum text UNIQUE NOT NULL,bundle jsonb NOT NULL,state text NOT NULL DEFAULT 'staged' CHECK(state IN ('staged','accepted','committed')),acceptance jsonb,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE imported_employee(source_system text NOT NULL REFERENCES import_source(source_system),source_id text NOT NULL,target_id uuid NOT NULL REFERENCES employee(id),name text NOT NULL,PRIMARY KEY(source_system,source_id),UNIQUE(source_system,target_id));
CREATE TABLE imported_row(source_system text NOT NULL REFERENCES import_source(source_system),entity text NOT NULL,source_id text NOT NULL,version text NOT NULL,row_hash text NOT NULL,natural_key text NOT NULL,employee_id uuid NOT NULL REFERENCES employee(id),batch_id uuid NOT NULL REFERENCES import_batch(id),data jsonb NOT NULL,PRIMARY KEY(source_system,entity,source_id),UNIQUE(source_system,natural_key));
CREATE TRIGGER imported_target_changed AFTER INSERT OR UPDATE OR DELETE ON imported_row FOR EACH STATEMENT EXECUTE FUNCTION advance_import_target();
CREATE TRIGGER imported_employee_changed AFTER INSERT OR UPDATE OR DELETE ON imported_employee FOR EACH STATEMENT EXECUTE FUNCTION advance_import_target();
CREATE FUNCTION immutable_import_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Accepted import history is immutable';END $$;
CREATE TRIGGER immutable_import_row BEFORE UPDATE OR DELETE ON imported_row FOR EACH ROW EXECUTE FUNCTION immutable_import_history();
CREATE TRIGGER immutable_import_employee BEFORE UPDATE OR DELETE ON imported_employee FOR EACH ROW EXECUTE FUNCTION immutable_import_history();

CREATE TABLE import_acceptance(id uuid PRIMARY KEY,batch_id uuid NOT NULL REFERENCES import_batch(id),actor_id text NOT NULL REFERENCES "user"(id),report jsonb NOT NULL,binding jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TRIGGER immutable_import_acceptance BEFORE UPDATE OR DELETE ON import_acceptance FOR EACH ROW EXECUTE FUNCTION immutable_import_history();
CREATE FUNCTION protect_import_bundle() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF (NEW.checksum,NEW.bundle,NEW.source_system,NEW.actor_employee_id) IS DISTINCT FROM (OLD.checksum,OLD.bundle,OLD.source_system,OLD.actor_employee_id) THEN RAISE EXCEPTION 'Immutable staged bundle';END IF;RETURN NEW;END $$;
CREATE TRIGGER immutable_import_bundle BEFORE UPDATE ON import_batch FOR EACH ROW EXECUTE FUNCTION protect_import_bundle();
