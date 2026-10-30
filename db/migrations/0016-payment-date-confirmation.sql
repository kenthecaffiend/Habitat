ALTER TABLE payroll_paid_status ADD COLUMN payment_date text CHECK(payment_date ~ '^\d{4}-\d{2}-\d{2}$');
-- A prior checkbox supplied no date; never manufacture one during upgrade.
UPDATE payroll_paid_status SET paid=false,revision=revision+1 WHERE paid;
ALTER TABLE payroll_paid_status ADD CONSTRAINT date_confirms_paid CHECK(paid=(payment_date IS NOT NULL));
CREATE TABLE payroll_date_payslip(entry_id uuid NOT NULL REFERENCES payroll_entry(id),payment_date text NOT NULL,obligation_id uuid NOT NULL UNIQUE REFERENCES payslip_obligation(id),PRIMARY KEY(entry_id,payment_date));
CREATE TRIGGER immutable_date_payslip BEFORE UPDATE OR DELETE ON payroll_date_payslip FOR EACH ROW EXECUTE FUNCTION protect_simulated_document();
