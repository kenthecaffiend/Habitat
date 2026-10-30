-- Actual-test extension only. Caller owns the isolated database and wraps this in a transaction.
DO $$ BEGIN IF current_database()<>'hr_actual_test' OR (SELECT environment FROM environment_identity WHERE id=1)<>'actual-test' OR (SELECT count(*) FROM schema_migration)<>19 THEN RAISE EXCEPTION 'Wrong actual-source target'; END IF; END $$;
CREATE TABLE actual_source_schema(id integer PRIMARY KEY CHECK(id=1),version integer NOT NULL CHECK(version=1));
INSERT INTO actual_source_schema VALUES(1,1);
CREATE TABLE employee_source_binding(id uuid PRIMARY KEY,slot text NOT NULL UNIQUE CHECK(slot IN ('owner','colleague')),employee_id uuid NOT NULL UNIQUE REFERENCES employee(id),source_system text NOT NULL CHECK(source_system='AIMM'),source_key text NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE employee_source_snapshot(id uuid PRIMARY KEY,binding_id uuid NOT NULL REFERENCES employee_source_binding(id),section text NOT NULL CHECK(section IN ('personal','job','compensation','statutory','leave')),fields jsonb NOT NULL,missing jsonb NOT NULL,source_path text NOT NULL,observed_at timestamptz NOT NULL,received_at timestamptz NOT NULL DEFAULT clock_timestamp(),content_hash text NOT NULL CHECK(length(content_hash)=64),request_id uuid NOT NULL,UNIQUE(binding_id,section,content_hash));
CREATE FUNCTION actual_source_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Source evidence is immutable'; END $$;
CREATE TRIGGER source_binding_immutable BEFORE UPDATE OR DELETE ON employee_source_binding FOR EACH ROW EXECUTE FUNCTION actual_source_immutable();
CREATE TRIGGER source_snapshot_immutable BEFORE UPDATE OR DELETE ON employee_source_snapshot FOR EACH ROW EXECUTE FUNCTION actual_source_immutable();
GRANT SELECT ON actual_source_schema TO hr_actual_test_app;
GRANT SELECT,INSERT ON employee_source_binding,employee_source_snapshot TO hr_actual_test_app;
