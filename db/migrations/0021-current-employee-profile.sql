CREATE TABLE employee_profile_schema(id integer PRIMARY KEY CHECK(id=1),version integer NOT NULL CHECK(version=1));
INSERT INTO employee_profile_schema VALUES(1,1);
CREATE TABLE employee_profile_revision(id uuid PRIMARY KEY,employee_id uuid NOT NULL REFERENCES employee(id),personal jsonb NOT NULL,employment jsonb NOT NULL,actor_id text NOT NULL REFERENCES "user"(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE employee_balance_change(id uuid PRIMARY KEY,employee_id uuid NOT NULL REFERENCES employee(id),kind text NOT NULL CHECK(kind IN ('annual','sick')),year integer NOT NULL CHECK(year BETWEEN 2000 AND 2100),effective_date text NOT NULL,previous_days numeric(6,1) NOT NULL,new_days numeric(6,1) NOT NULL CHECK(new_days>=0),note text NOT NULL,actor_id text NOT NULL REFERENCES "user"(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE employee_profile_command(actor_id text NOT NULL REFERENCES "user"(id),request_key uuid NOT NULL,fingerprint text NOT NULL,result jsonb NOT NULL,PRIMARY KEY(actor_id,request_key));
CREATE TRIGGER immutable_employee_profile BEFORE UPDATE OR DELETE ON employee_profile_revision FOR EACH ROW EXECUTE FUNCTION protect_simulated_document();
CREATE TRIGGER immutable_employee_balance_change BEFORE UPDATE OR DELETE ON employee_balance_change FOR EACH ROW EXECUTE FUNCTION protect_simulated_document();
CREATE TRIGGER immutable_employee_profile_command BEFORE UPDATE OR DELETE ON employee_profile_command FOR EACH ROW EXECUTE FUNCTION protect_simulated_document();
