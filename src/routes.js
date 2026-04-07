const express = require('express');
const router = express.Router();
const { upsertShoots, getShootsByDate, addNote, updateNote, deleteNote } = require('./db');
const { fetchShootsForDate, searchShootByAddress } = require('./aspects-api');
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

// Search for a shoot by address and add it
router.post('/search-shoot', async (req, res) => {
  const { address, date } = req.body;
  if (!address) return res.status(400).json({ error: 'address is required' });
  const targetDate = date || todayDate();
  try {
    const result = await searchShootByAddress(address, targetDate);
    if (result.shoot) {
      upsertShoots([result.shoot]);
      const updated = getShootsByDate(targetDate);
      res.json({ found: true, shoot: result.shoot, shoots: updated });
    } else {
      res.json({ found: false, error: result.error || 'No matching shoot found' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a shoot manually (no API needed)
router.post('/shoots', (req, res) => {
  const { date, address, photographer, time } = req.body;
  if (!address) return res.status(400).json({ error: 'address is required' });
  const targetDate = date || todayDate();
  const id = `manual-${Date.now()}`;
  upsertShoots([{ id, date: targetDate, address, photographer: photographer || '', time: time || '', raw_data: '{}' }]);
  const updated = getShootsByDate(targetDate);
  res.json({ shoots: updated });
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

    // Try fetching sites with address search for known shoot
    const r2 = await fetch(`${ASPECTS_API_URL}/api/v1/sites?address=Nuthatch`, { headers, signal: AbortSignal.timeout(30000) });
    const b2 = await r2.text();
    results.sites_search = { status: r2.status, length: b2.length, preview: b2.slice(0, 1500) };

    // Try /orders with sid of known today's shoot
    const r3 = await fetch(`${ASPECTS_API_URL}/api/v1/orders?sid=2914195`, { headers, signal: AbortSignal.timeout(15000) });
    const b3 = await r3.text();
    results.known_site_orders = { status: r3.status, preview: b3.slice(0, 1500) };

    // Try getting all users to find client user IDs
    const r4 = await fetch(`${ASPECTS_API_URL}/api/v1/users?type=client`, { headers, signal: AbortSignal.timeout(30000) });
    const b4 = await r4.text();
    results.client_users = { status: r4.status, length: b4.length, preview: b4.slice(0, 500) };

    // Try orders without uid (all brand orders)
    const r5 = await fetch(`${ASPECTS_API_URL}/api/v1/orders`, { headers, signal: AbortSignal.timeout(30000) });
    const b5 = await r5.text();
    results.all_orders = { status: r5.status, length: b5.length, preview: b5.slice(0, 500) };
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
