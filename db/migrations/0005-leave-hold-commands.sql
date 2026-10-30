CREATE TABLE leave_hold_command(employee_id uuid NOT NULL REFERENCES employee(id),request_key text NOT NULL,fingerprint text NOT NULL,PRIMARY KEY(employee_id,request_key));
ALTER TABLE leave_payroll_hold ADD COLUMN source_snapshot jsonb;
