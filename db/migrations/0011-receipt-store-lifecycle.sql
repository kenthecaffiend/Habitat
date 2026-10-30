CREATE TABLE private_receipt_store(
 id uuid PRIMARY KEY, environment text NOT NULL CHECK(environment IN ('dev','test')),
 root text NOT NULL UNIQUE, device text NOT NULL, inode text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
-- Pre-registry disposable stores are deliberately not adopted automatically.
