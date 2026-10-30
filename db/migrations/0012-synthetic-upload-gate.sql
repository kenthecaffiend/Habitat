CREATE TABLE synthetic_upload_gate(id integer PRIMARY KEY CHECK(id=1),state text NOT NULL CHECK(state IN ('ready','processing','held')),attempt uuid,reason text);
INSERT INTO synthetic_upload_gate VALUES(1,'ready',NULL,NULL);
