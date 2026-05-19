const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.db');

let db;

function getDB() {
    if (!db) {
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        initSchema();
    }
    return db;
}

function initSchema() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS entries (
            id         TEXT PRIMARY KEY,
            timestamp  TEXT NOT NULL,
            title      TEXT NOT NULL,
            note       TEXT,
            created_at TEXT NOT NULL,
            sort_index INTEGER NOT NULL DEFAULT 0
        );
    `);
}

// --- CRUD ---

function getAllEntries() {
    const rows = getDB().prepare(
        'SELECT id, timestamp, title, note, created_at, sort_index FROM entries ORDER BY timestamp, sort_index'
    ).all();
    return rows.map(rowToEntry);
}

function addEntry(entry) {
    getDB().prepare(`
        INSERT INTO entries (id, timestamp, title, note, created_at, sort_index)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(entry.id, entry.timestamp, entry.title, entry.note, entry.createdAt, entry.sortIndex);
    return entry;
}

function updateEntry(entry) {
    getDB().prepare(`
        UPDATE entries SET timestamp = ?, title = ?, note = ?, sort_index = ?
        WHERE id = ?
    `).run(entry.timestamp, entry.title, entry.note || null, entry.sortIndex, entry.id);
    return entry;
}

function deleteEntry(id) {
    getDB().prepare('DELETE FROM entries WHERE id = ?').run(id);
}

// --- helper ---

function rowToEntry(row) {
    return {
        id: row.id,
        timestamp: row.timestamp,
        title: row.title,
        note: row.note || null,
        createdAt: row.created_at,
        sortIndex: row.sort_index
    };
}

module.exports = { getAllEntries, addEntry, updateEntry, deleteEntry };
