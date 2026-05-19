const express = require('express');
const cors = require('cors');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || '';

const app = express();

app.use(cors());
app.use(express.json());

// Simple API key check (skip if not configured)
function auth(req, res, next) {
    if (!API_KEY) return next();
    const key = req.headers['x-api-key'] || '';
    if (key !== API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// Health check
app.get('/', (_req, res) => {
    res.json({ ok: true, name: 'lovely-phoenix-server' });
});

// GET /api/entries
app.get('/api/entries', auth, (_req, res) => {
    try {
        const entries = db.getAllEntries();
        res.json(entries);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/entries
app.post('/api/entries', auth, (req, res) => {
    try {
        const { id, timestamp, title, note, createdAt, sortIndex } = req.body;
        if (!id || !timestamp || !title) {
            return res.status(400).json({ error: 'Missing required fields: id, timestamp, title' });
        }
        const entry = db.addEntry({
            id, timestamp, title, note: note || null, createdAt: createdAt || new Date().toISOString(), sortIndex: sortIndex || 0
        });
        res.status(201).json(entry);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/entries/:id
app.put('/api/entries/:id', auth, (req, res) => {
    try {
        const { timestamp, title, note, sortIndex } = req.body;
        const entry = db.updateEntry({
            id: req.params.id, timestamp, title, note: note || null, sortIndex: sortIndex || 0
        });
        res.json(entry);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/entries/:id
app.delete('/api/entries/:id', auth, (req, res) => {
    try {
        db.deleteEntry(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
