CREATE TABLE employee_directory(employee_id uuid PRIMARY KEY REFERENCES employee(id),revision integer NOT NULL CHECK(revision>0),archived_on date,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE employee_command(actor_id text NOT NULL REFERENCES "user"(id),request_key uuid NOT NULL,fingerprint text NOT NULL,result jsonb NOT NULL,PRIMARY KEY(actor_id,request_key));
-- Serialize session creation with offboarding so a concurrent login cannot restore access.
CREATE FUNCTION refuse_archived_employee_session() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE enabled boolean;
BEGIN
 SELECT active INTO enabled FROM employee WHERE user_id=NEW.user_id FOR SHARE;
 IF enabled IS FALSE THEN RAISE EXCEPTION 'Employee account is archived' USING ERRCODE='28000'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER active_employee_session BEFORE INSERT ON session FOR EACH ROW EXECUTE FUNCTION refuse_archived_employee_session();
