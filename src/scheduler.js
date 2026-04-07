const cron = require('node-cron');
const { getShootsByDate } = require('./db');
const { formatSlackMessage, sendToSlack } = require('./slack');

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function startScheduler() {
  const slackCron = process.env.SLACK_CRON || '0 21 * * 1-5';

  // End-of-day Slack delivery at 9 PM Pacific
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

  console.log(`[Scheduler] Slack delivery: ${slackCron}`);
}

module.exports = { startScheduler };
