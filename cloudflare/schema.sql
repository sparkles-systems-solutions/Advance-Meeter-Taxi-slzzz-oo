-- Run once in taxi-db Console before deploying the Worker. Safe to rerun.
 CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','driver')), active INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS states(user_id INTEGER PRIMARY KEY REFERENCES users(id),version INTEGER NOT NULL DEFAULT 0,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,user_id INTEGER,event TEXT NOT NULL,time INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS shares(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL,expires INTEGER NOT NULL,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS ride_links(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),ride_id TEXT NOT NULL,expires INTEGER NOT NULL,payload TEXT NOT NULL,UNIQUE(user_id,ride_id));
 CREATE TABLE IF NOT EXISTS snapshots(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,data TEXT NOT NULL,time INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS shares_expiry ON shares(expires);
CREATE UNIQUE INDEX IF NOT EXISTS shares_user ON shares(user_id);
CREATE INDEX IF NOT EXISTS ride_links_expiry ON ride_links(expires);
CREATE INDEX IF NOT EXISTS ride_links_user ON ride_links(user_id,ride_id);
CREATE INDEX IF NOT EXISTS snapshots_user ON snapshots(user_id,id);
CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY, n INTEGER NOT NULL, reset INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS attempts_expiry ON attempts(reset);
CREATE TRIGGER IF NOT EXISTS user_initial_state AFTER INSERT ON users BEGIN
 INSERT INTO states(user_id,data) VALUES(NEW.id, '{"settings":"{\"base\":100,\"rate\":80,\"waitRate\":5,\"nightPercent\":10,\"appName\":\"ADVANCE MEETER TAXI\",\"receiptName\":\"AMT OFFICIAL RECEIPT\",\"logo\":null}","rides":"[]","fuel_logs":"[]","repair_logs":"[]","amt_schedules":"[]","system_logs":"[]","local_backups":"[]"}');
END;
CREATE TRIGGER IF NOT EXISTS state_snapshot AFTER UPDATE ON states BEGIN
 INSERT INTO snapshots(user_id,data,time) VALUES(OLD.user_id,OLD.data,unixepoch()*1000);
 DELETE FROM snapshots WHERE user_id=NEW.user_id AND id NOT IN
  (SELECT id FROM snapshots WHERE user_id=NEW.user_id ORDER BY id DESC LIMIT 3);
 INSERT INTO audit(user_id,event,time) VALUES(NEW.user_id,'state_saved',unixepoch()*1000);
END;
