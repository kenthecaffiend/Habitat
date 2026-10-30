CREATE TABLE branding_asset(id uuid PRIMARY KEY,sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),body bytea NOT NULL CHECK(octet_length(body) BETWEEN 1 AND 49152),width integer NOT NULL CHECK(width BETWEEN 1 AND 768),height integer NOT NULL CHECK(height BETWEEN 1 AND 384));
CREATE TRIGGER immutable_branding_asset BEFORE UPDATE OR DELETE ON branding_asset FOR EACH ROW EXECUTE FUNCTION protect_simulated_document();
CREATE TABLE branding_setting(id integer PRIMARY KEY CHECK(id=1),revision integer NOT NULL DEFAULT 0,light uuid REFERENCES branding_asset(id),dark uuid REFERENCES branding_asset(id));
INSERT INTO branding_setting(id) VALUES(1);
CREATE TABLE branding_command(request_id uuid PRIMARY KEY,actor_id text NOT NULL,fingerprint text NOT NULL,result jsonb NOT NULL);
