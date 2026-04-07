const express = require('express');
const router = express.Router();
const { upsertShoots, getShootsByDate, addNote, updateNote, deleteNote, deleteShoot } = require('./db');
const { searchShootByAddress } = require('./aspects-api');
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

// Delete a shoot
router.delete('/shoots/:id', (req, res) => {
  deleteShoot(req.params.id);
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

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

module.exports = router;
