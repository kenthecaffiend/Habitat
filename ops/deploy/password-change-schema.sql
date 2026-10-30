-- Apply only after explicit approval for own-password-change activation on working Habitat.
BEGIN;
DO $$ BEGIN IF current_database()<>'hr_actual_test' OR (SELECT environment FROM environment_identity WHERE id=1)<>'actual-test' THEN RAISE EXCEPTION 'Wrong password-change target'; END IF; END $$;
GRANT UPDATE(password,updated_at) ON TABLE public.account TO hr_actual_test_app;
COMMIT;
