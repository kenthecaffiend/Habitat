-- Approved private claims/leave capability. No payroll approval/payment/document privileges.
DO $$ BEGIN IF current_database()<>'hr_actual_test' OR (SELECT environment FROM environment_identity WHERE id=1)<>'actual-test' OR (SELECT version FROM workflow_restoration_schema WHERE id=1)<>1 THEN RAISE EXCEPTION 'Wrong restoration target'; END IF; END $$;
DROP TRIGGER IF EXISTS actual_claim_capture_only ON claim;
-- Claim lifecycle uses existing row/ownership/revision and payroll-cutoff service guards.
GRANT INSERT ON claim,claim_attachment,claim_mutation,private_attachment,private_receipt_store,private_receipt_file,medical_file,leave_opening,leave_opening_command,leave_month_reconciliation,leave_request,leave_allocation,leave_grant,leave_profile,leave_payroll_hold,leave_hold_command,leave_review_receipt TO hr_actual_test_app;
GRANT SELECT ON medical_file,medical_file_schema,workflow_restoration_schema,leave_opening,leave_opening_command,leave_month_reconciliation TO hr_actual_test_app;
GRANT UPDATE(description,expense_date,amount_cents,state,approved_at,revision) ON claim TO hr_actual_test_app;
GRANT DELETE ON claim_attachment,leave_allocation TO hr_actual_test_app;
GRANT UPDATE(state) ON private_attachment TO hr_actual_test_app;
GRANT UPDATE(state,attempt,reason) ON synthetic_upload_gate TO hr_actual_test_app;
GRANT UPDATE(input,verified_by) ON leave_profile TO hr_actual_test_app;
GRANT UPDATE(status) ON leave_grant TO hr_actual_test_app;
GRANT UPDATE(input,kind,state,revision,slots) ON leave_request TO hr_actual_test_app;
GRANT UPDATE(resolved_at,reviewed_by,evidence,review_reason,revision) ON leave_payroll_hold TO hr_actual_test_app;
