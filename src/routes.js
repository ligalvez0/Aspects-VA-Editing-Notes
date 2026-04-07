const express = require('express');
const router = express.Router();
const { upsertShoots, getShootsByDate, addNote, updateNote, deleteNote } = require('./db');
const { fetchShootsForDate } = require('./aspects-api');
const { formatSlackMessage, sendToSlack } = require('./slack');

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

// Get shoots + notes for a date
router.get('/shoots', (req, res) => {
  const date = req.query.date || todayDate();
  const shoots = getShootsByDate(date);
  res.json({ date, shoots });
});

// Sync shoots from Aspects API
router.post('/sync', async (req, res) => {
  const date = req.body.date || todayDate();
  try {
    const result = await fetchShootsForDate(date);
    if (result.shoots && result.shoots.length > 0) {
      upsertShoots(result.shoots);
    }
    const updated = getShootsByDate(date);
    res.json({ date, synced: result.shoots ? result.shoots.length : 0, error: result.error || null, shoots: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a note
router.post('/notes', (req, res) => {
  const { shootId, content, author } = req.body;
  if (!shootId || !content) {
    return res.status(400).json({ error: 'shootId and content are required' });
  }
  const id = addNote(shootId, content, author);
  res.json({ id: Number(id) });
});

// Update a note
router.put('/notes/:id', (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'content is required' });
  updateNote(req.params.id, content);
  res.json({ ok: true });
});

// Delete a note
router.delete('/notes/:id', (req, res) => {
  deleteNote(req.params.id);
  res.json({ ok: true });
});

// Send Slack message for a date
router.post('/slack/send', async (req, res) => {
  const date = req.body.date || todayDate();
  try {
    const shoots = getShootsByDate(date);
    const message = formatSlackMessage(date, shoots);
    const result = await sendToSlack(message);
    res.json({ date, message, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Debug: show raw Aspects API response
router.get('/debug-sync', async (req, res) => {
  const date = req.query.date || todayDate();
  const ASPECTS_API_URL = process.env.ASPECTS_API_URL;
  const ASPECTS_API_KEY = process.env.ASPECTS_API_KEY;

  if (!ASPECTS_API_URL || !ASPECTS_API_KEY) {
    return res.json({ error: 'No API configured' });
  }

  const headers = { 'api_key': ASPECTS_API_KEY, 'Accept': 'application/json' };
  const results = {};

  try {
    // Test /brand
    const r1 = await fetch(`${ASPECTS_API_URL}/api/v1/brand`, { headers, signal: AbortSignal.timeout(10000) });
    results.brand = { status: r1.status, body: (await r1.text()).slice(0, 300) };

    // Test different ways to get orders
    // 1. orders?uid=168135 (owner - only gets orders we placed)
    const r2 = await fetch(`${ASPECTS_API_URL}/api/v1/orders?uid=168135`, { headers, signal: AbortSignal.timeout(30000) });
    const b2 = await r2.text();
    results.orders_by_uid = { status: r2.status, count: b2.length, preview: b2.slice(0, 500) };

    // 2. Try sites endpoint with uid to get active sites
    const r3 = await fetch(`${ASPECTS_API_URL}/api/v1/sites?uid=168135`, { headers, signal: AbortSignal.timeout(30000) });
    const b3 = await r3.text();
    results.sites_by_uid = { status: r3.status, length: b3.length, preview: b3.slice(0, 500) };

    // 3. Try groups endpoint
    const r4 = await fetch(`${ASPECTS_API_URL}/api/v1/groups`, { headers, signal: AbortSignal.timeout(15000) });
    const b4 = await r4.text();
    results.groups = { status: r4.status, body: b4.slice(0, 500) };

    // 4. Try users to find other user accounts
    const r5 = await fetch(`${ASPECTS_API_URL}/api/v1/users`, { headers, signal: AbortSignal.timeout(15000) });
    const b5 = await r5.text();
    results.users = { status: r5.status, length: b5.length, preview: b5.slice(0, 1000) };
  } catch (err) {
    results.error = err.message;
  }

  res.json({ date, results });
});

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    config: {
      slackConfigured: !!process.env.SLACK_WEBHOOK_URL,
      aspectsConfigured: !!process.env.ASPECTS_API_URL && !!process.env.ASPECTS_API_KEY,
      aspectsApiUrl: process.env.ASPECTS_API_URL || '(not set)',
      tz: process.env.TZ || '(not set)',
    },
  });
});

module.exports = router;
