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

  // Test /brand (simplest endpoint to verify auth)
  try {
    const r = await fetch(`${ASPECTS_API_URL}/api/v1/brand`, { headers });
    results.brand = { status: r.status, body: (await r.text()).slice(0, 500) };
  } catch (err) { results.brand = { error: err.message }; }

  // Test /orders (plural)
  try {
    const r = await fetch(`${ASPECTS_API_URL}/api/v1/orders`, { headers });
    results.orders_plural = { status: r.status, body: (await r.text()).slice(0, 2000) };
  } catch (err) { results.orders_plural = { error: err.message }; }

  // Test /order (singular)
  try {
    const r = await fetch(`${ASPECTS_API_URL}/api/v1/order`, { headers });
    results.order_singular = { status: r.status, body: (await r.text()).slice(0, 2000) };
  } catch (err) { results.order_singular = { error: err.message }; }

  // Test /site (list of sites)
  try {
    const r = await fetch(`${ASPECTS_API_URL}/api/v1/site`, { headers });
    results.sites = { status: r.status, body: (await r.text()).slice(0, 2000) };
  } catch (err) { results.sites = { error: err.message }; }

  // Also test the processed result
  const { fetchShootsForDate } = require('./aspects-api');
  results.processed = await fetchShootsForDate(date);

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
