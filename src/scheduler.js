const cron = require('node-cron');
const { getShootsByDate } = require('./db');
const { formatSlackMessage, sendToSlack } = require('./slack');

function todayDatePacific() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

function startScheduler() {
  const slackCron = process.env.SLACK_CRON || '5 20 * * 1-5';

  // End-of-day Slack delivery at 8:05 PM Pacific
  cron.schedule(slackCron, async () => {
    const date = todayDatePacific();
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
