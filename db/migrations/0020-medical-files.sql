CREATE TABLE medical_file(
 id uuid PRIMARY KEY, employee_id uuid NOT NULL REFERENCES employee(id), actor_id text NOT NULL REFERENCES "user"(id), request_key uuid NOT NULL,
 mime text NOT NULL CHECK(mime IN ('image/png','image/heic','application/pdf')), checksum text NOT NULL CHECK(checksum ~ '^[a-f0-9]{64}$'),
 body bytea NOT NULL CHECK(octet_length(body) BETWEEN 1 AND 5242880), preview bytea CHECK(octet_length(preview) BETWEEN 1 AND 4194304), created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(actor_id,request_key));
CREATE TRIGGER immutable_medical_file BEFORE UPDATE OR DELETE ON medical_file FOR EACH ROW EXECUTE FUNCTION protect_simulated_document();
CREATE TABLE medical_file_schema(id integer PRIMARY KEY CHECK(id=1),version integer NOT NULL CHECK(version=1));
INSERT INTO medical_file_schema VALUES(1,1);
