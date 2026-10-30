CREATE TABLE workflow_restoration_schema(id integer PRIMARY KEY CHECK(id=1),version integer NOT NULL CHECK(version=1));
INSERT INTO workflow_restoration_schema VALUES(1,1);
CREATE TABLE leave_opening(id uuid PRIMARY KEY,employee_id uuid NOT NULL REFERENCES employee(id),revision integer NOT NULL CHECK(revision>0),input jsonb NOT NULL,accepted_by text NOT NULL REFERENCES "user"(id),accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(employee_id,revision));
CREATE TABLE leave_opening_command(actor_id text NOT NULL REFERENCES "user"(id),request_key uuid NOT NULL,fingerprint text NOT NULL,result jsonb NOT NULL,PRIMARY KEY(actor_id,request_key));
CREATE TABLE leave_month_reconciliation(id uuid PRIMARY KEY,employee_id uuid NOT NULL REFERENCES employee(id),month text NOT NULL,through_date text NOT NULL,unpaid_units integer NOT NULL CHECK(unpaid_units BETWEEN 0 AND 46),actor_id text NOT NULL REFERENCES "user"(id),recorded_at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE leave_request ADD COLUMN origin text NOT NULL DEFAULT 'native' CHECK(origin IN ('native','opening-source'));
ALTER TABLE leave_request ADD COLUMN source_key text;
CREATE UNIQUE INDEX leave_source_booking_key ON leave_request(employee_id,source_key) WHERE source_key IS NOT NULL;
ALTER TABLE employee_balance_change DROP CONSTRAINT employee_balance_change_kind_check;
ALTER TABLE employee_balance_change ADD CONSTRAINT employee_balance_change_kind_check CHECK(kind IN ('annual','sick','hospitalisation'));
CREATE TRIGGER immutable_leave_opening BEFORE UPDATE OR DELETE ON leave_opening FOR EACH ROW EXECUTE FUNCTION protect_simulated_document();
CREATE TRIGGER immutable_leave_month_fact BEFORE UPDATE OR DELETE ON leave_month_reconciliation FOR EACH ROW EXECUTE FUNCTION protect_simulated_document();
CREATE TRIGGER immutable_leave_opening_command BEFORE UPDATE OR DELETE ON leave_opening_command FOR EACH ROW EXECUTE FUNCTION protect_simulated_document();

ALTER TABLE private_receipt_store DROP CONSTRAINT private_receipt_store_environment_check;
ALTER TABLE private_receipt_store ADD CONSTRAINT private_receipt_store_environment_check CHECK(environment IN ('dev','test','actual-test'));
