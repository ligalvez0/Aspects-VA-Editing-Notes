const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'app.db');
let db;

function initDb() {
  const fs = require('fs');
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS shoots (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      address TEXT NOT NULL,
      photographer TEXT DEFAULT '',
      time TEXT DEFAULT '',
      raw_data TEXT DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_shoots_date ON shoots(date);

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shoot_id TEXT NOT NULL REFERENCES shoots(id),
      content TEXT NOT NULL,
      author TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notes_shoot ON notes(shoot_id);

    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shoot_id TEXT NOT NULL REFERENCES shoots(id),
      filename TEXT NOT NULL,
      original_name TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_images_shoot ON images(shoot_id);
  `);

  return db;
}

function getDb() {
  return db;
}

function upsertShoots(shootsArray) {
  const stmt = db.prepare(`
    INSERT INTO shoots (id, date, address, photographer, time, raw_data)
    VALUES (@id, @date, @address, @photographer, @time, @raw_data)
    ON CONFLICT(id) DO UPDATE SET
      address = @address,
      photographer = @photographer,
      time = @time,
      raw_data = @raw_data
  `);
  const tx = db.transaction((shoots) => {
    for (const s of shoots) stmt.run(s);
  });
  tx(shootsArray);
}

function getShootsByDate(date) {
  const shoots = db.prepare('SELECT * FROM shoots WHERE date = ? ORDER BY time').all(date);
  const noteStmt = db.prepare('SELECT * FROM notes WHERE shoot_id = ? ORDER BY created_at');
  const imageStmt = db.prepare('SELECT * FROM images WHERE shoot_id = ? ORDER BY created_at');
  return shoots.map((s) => ({
    ...s,
    notes: noteStmt.all(s.id),
    images: imageStmt.all(s.id),
  }));
}

function addNote(shootId, content, author) {
  const result = db.prepare(
    'INSERT INTO notes (shoot_id, content, author) VALUES (?, ?, ?)'
  ).run(shootId, content, author || '');
  return result.lastInsertRowid;
}

function updateNote(noteId, content) {
  db.prepare(
    "UPDATE notes SET content = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(content, noteId);
}

function deleteNote(noteId) {
  db.prepare('DELETE FROM notes WHERE id = ?').run(noteId);
}

function addImage(shootId, filename, originalName) {
  const result = db.prepare(
    'INSERT INTO images (shoot_id, filename, original_name) VALUES (?, ?, ?)'
  ).run(shootId, filename, originalName || '');
  return db.prepare('SELECT * FROM images WHERE id = ?').get(result.lastInsertRowid);
}

function getImage(imageId) {
  return db.prepare('SELECT * FROM images WHERE id = ?').get(imageId);
}

function getImagesByShoot(shootId) {
  return db.prepare('SELECT * FROM images WHERE shoot_id = ? ORDER BY created_at').all(shootId);
}

function deleteImage(imageId) {
  db.prepare('DELETE FROM images WHERE id = ?').run(imageId);
}

function deleteShoot(shootId) {
  db.prepare('DELETE FROM notes WHERE shoot_id = ?').run(shootId);
  db.prepare('DELETE FROM images WHERE shoot_id = ?').run(shootId);
  db.prepare('DELETE FROM shoots WHERE id = ?').run(shootId);
}

module.exports = { initDb, getDb, upsertShoots, getShootsByDate, addNote, updateNote, deleteNote, addImage, getImage, getImagesByShoot, deleteImage, deleteShoot };
