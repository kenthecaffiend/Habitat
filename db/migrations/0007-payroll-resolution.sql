ALTER TABLE payroll_correction ADD COLUMN basis jsonb;
CREATE TABLE payroll_correction_resolution(sequence bigserial PRIMARY KEY,correction_id uuid UNIQUE NOT NULL REFERENCES payroll_correction(id),actor_id text NOT NULL REFERENCES "user"(id),input jsonb NOT NULL,settled_snapshot jsonb,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE payroll_claim_payment(payment_id uuid REFERENCES payroll_payment(id),claim_id uuid REFERENCES claim(id),amount_cents bigint NOT NULL CHECK(amount_cents>0),PRIMARY KEY(payment_id,claim_id));
CREATE TABLE payroll_scheduler_binding(id integer PRIMARY KEY CHECK(id=1),company_id uuid NOT NULL,actor_employee_id uuid NOT NULL REFERENCES employee(id));
CREATE TABLE draft_execution(intent_id uuid PRIMARY KEY REFERENCES draft_intent(id),run_id uuid REFERENCES payroll_run(id),last_error text);
ALTER TABLE draft_intent DROP CONSTRAINT draft_intent_status_check;
ALTER TABLE draft_intent ADD CONSTRAINT draft_intent_status_check CHECK(status IN ('pending','held','completed'));
