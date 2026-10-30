CREATE TABLE saved_payroll_schema(id integer PRIMARY KEY CHECK(id=1),version integer NOT NULL CHECK(version=1));
INSERT INTO saved_payroll_schema VALUES(1,1);
CREATE TABLE payroll_setting(id uuid PRIMARY KEY,employee_id uuid REFERENCES employee(id),effective_month text NOT NULL,input jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX payroll_setting_effective ON payroll_setting(employee_id,effective_month,created_at);
CREATE TABLE payroll_draft_revision(id uuid PRIMARY KEY,run_id uuid NOT NULL REFERENCES payroll_run(id),revision integer NOT NULL,roster jsonb NOT NULL,capture jsonb NOT NULL,entries jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(run_id,revision));
CREATE FUNCTION preserve_payroll_setting() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Saved setting and draft revision history is append-only'; END $$;
CREATE TRIGGER immutable_payroll_setting BEFORE UPDATE OR DELETE ON payroll_setting FOR EACH ROW EXECUTE FUNCTION preserve_payroll_setting();
CREATE TRIGGER immutable_payroll_draft_revision BEFORE UPDATE OR DELETE ON payroll_draft_revision FOR EACH ROW EXECUTE FUNCTION preserve_payroll_setting();
