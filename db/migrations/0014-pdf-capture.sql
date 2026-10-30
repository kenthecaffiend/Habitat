CREATE TABLE pdf_delivery_binding(outbox_id uuid PRIMARY KEY REFERENCES delivery_outbox(id), binding jsonb NOT NULL);
CREATE TABLE pdf_mail_capture(outbox_id uuid PRIMARY KEY REFERENCES delivery_outbox(id), attempt_id uuid NOT NULL UNIQUE REFERENCES delivery_attempt(id), captured_at timestamptz NOT NULL);
CREATE TRIGGER frozen_pdf_binding BEFORE UPDATE OR DELETE ON pdf_delivery_binding FOR EACH ROW EXECUTE FUNCTION protect_simulated_document();
CREATE TRIGGER frozen_pdf_capture BEFORE UPDATE OR DELETE ON pdf_mail_capture FOR EACH ROW EXECUTE FUNCTION protect_simulated_document();
