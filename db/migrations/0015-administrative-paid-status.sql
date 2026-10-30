-- Administrative indication only. No transfer amount, payment date or issuance fact.
CREATE TABLE payroll_paid_status(entry_id uuid PRIMARY KEY REFERENCES payroll_entry(id) ON DELETE CASCADE,paid boolean NOT NULL,revision integer NOT NULL CHECK(revision>0));
-- Current status follows a disposable unpaid entry on void/reopen; immutable audit_event history remains.
