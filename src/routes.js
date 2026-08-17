const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const router = express.Router();
const { upsertShoots, getShootsByDate, addNote, updateNote, deleteNote, addImage, getImage, getImagesByShoot, deleteImage, deleteShoot } = require('./db');
const { searchShootByAddress } = require('./aspects-api');
const { formatSlackMessage, sendToSlack } = require('./slack');

const UPLOAD_DIR = path.join(__dirname, '..', 'data', 'uploads');

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

// Multer storage: random filenames under data/uploads, images only, 10MB cap
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase().slice(0, 10);
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  },
});

function removeUploadFile(filename) {
  if (!filename) return;
  fs.unlink(path.join(UPLOAD_DIR, filename), () => {});
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

// Upload an image for a shoot
router.post('/shoots/:id/images', (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });
    const image = addImage(req.params.id, req.file.filename, req.file.originalname);
    res.json({ image: { ...image, url: `/uploads/${image.filename}` } });
  });
});

// Delete an image
router.delete('/images/:id', (req, res) => {
  const image = getImage(req.params.id);
  if (image) {
    deleteImage(image.id);
    removeUploadFile(image.filename);
  }
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
  for (const image of getImagesByShoot(req.params.id)) {
    removeUploadFile(image.filename);
  }
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
