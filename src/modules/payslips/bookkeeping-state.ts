/** Original immutable payment anchors can also bind later document-only versions. */
export const bookkeepingStateSelect=`SELECT o.*,pr.state AS run_state,dp.payment_date,ps.payment_date AS current_date,pdf.state AS pdf_state,
 EXISTS(SELECT 1 FROM audit_event a WHERE a.action='payslip.voided' AND a.entity_id=o.id::text) AS voided,
 (SELECT n.id FROM payslip_obligation n JOIN payroll_date_payslip d ON d.obligation_id::text=coalesce(n.snapshot->>'paymentBindingId',n.id::text) AND d.entry_id=n.entry_id WHERE n.entry_id=o.entry_id AND d.payment_date=ps.payment_date AND n.snapshot->>'bookkeepingPublication'='true' ORDER BY n.version DESC LIMIT 1) AS latest_id
 FROM payslip_obligation o JOIN payroll_entry pe ON pe.id=o.entry_id JOIN payroll_run pr ON pr.id=pe.run_id JOIN payroll_date_payslip dp ON dp.obligation_id::text=coalesce(o.snapshot->>'paymentBindingId',o.id::text) AND dp.entry_id=o.entry_id LEFT JOIN payroll_paid_status ps ON ps.entry_id=o.entry_id LEFT JOIN payslip_pdf_attempt pdf ON pdf.obligation_id=o.id`;
export const isCurrentPayslip=(r:any)=>!!r&&r.run_state!=='void'&&!r.voided&&!!r.current_date&&r.payment_date===r.current_date&&r.latest_id===r.id;
export async function readPayslipState(tx:any,id:string){return(await tx.query(bookkeepingStateSelect+' WHERE o.id=$1',[id])).rows[0];}
