const cron = require('node-cron');
const { upsertShoots, getShootsByDate } = require('./db');
const { fetchShootsForDate } = require('./aspects-api');
const { formatSlackMessage, sendToSlack } = require('./slack');

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function startScheduler() {
  const syncCron = process.env.SYNC_CRON || '0 6 * * 1-5';
  const slackCron = process.env.SLACK_CRON || '0 21 * * 1-5';

  // Morning sync — pull today's shoots from Aspects
  cron.schedule(syncCron, async () => {
    const date = todayDate();
    console.log(`[Scheduler] Running morning sync for ${date}`);
    try {
      const result = await fetchShootsForDate(date);
      if (result.shoots && result.shoots.length > 0) upsertShoots(result.shoots);
      console.log(`[Scheduler] Synced ${result.shoots ? result.shoots.length : 0} shoots`);
    } catch (err) {
      console.error('[Scheduler] Sync failed:', err.message);
    }
  });

  // End-of-day Slack delivery
  cron.schedule(slackCron, async () => {
    const date = todayDate();
    console.log(`[Scheduler] Sending Slack message for ${date}`);
    try {
      const shoots = getShootsByDate(date);
      const message = formatSlackMessage(date, shoots);
      await sendToSlack(message);
    } catch (err) {
      console.error('[Scheduler] Slack send failed:', err.message);
    }
  });

  console.log(`[Scheduler] Morning sync: ${syncCron}`);
  console.log(`[Scheduler] Slack delivery: ${slackCron}`);
}

module.exports = { startScheduler };
