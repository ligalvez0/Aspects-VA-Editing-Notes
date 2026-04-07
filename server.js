require('dotenv').config({ override: false });

const express = require('express');
const path = require('path');
const { initDb } = require('./src/db');
const routes = require('./src/routes');
const { startScheduler } = require('./src/scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

initDb();

app.use('/api', routes);

startScheduler();

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
