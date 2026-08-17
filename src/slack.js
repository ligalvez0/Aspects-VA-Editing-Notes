const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const SLACK_VA_ID = process.env.SLACK_VA_ID || 'U0AQEU7HSKH';
const SLACK_EDITOR_ID = process.env.SLACK_EDITOR_ID || 'U0B4LFFNFLN';
const APP_URL = process.env.APP_URL || 'https://aspects-va-editing-notes-production.up.railway.app';

function formatSlackMessage(date, shootsWithNotes) {
  const d = new Date(date + 'T12:00:00');
  const dayName = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // Mention the VA and the editor by Slack user ID (falls back to a name if unset)
  const mentions = [
    SLACK_VA_ID ? `<@${SLACK_VA_ID}>` : '@Stephen Cruz',
    SLACK_EDITOR_ID ? `<@${SLACK_EDITOR_ID}>` : null,
  ].filter(Boolean).join(' ');

  // Deep link back to the site for this date so they can view notes & images
  const link = APP_URL ? `${APP_URL.replace(/\/$/, '')}/?date=${date}` : '';

  let text = `:camera_with_flash: *Editing Notes for ${dayName}*\n${mentions}\n`;
  if (link) text += `:link: <${link}|View notes & images on the site>\n`;
  text += '\n';

  if (shootsWithNotes.length === 0) {
    text += '_No shoots scheduled for today._';
    return text;
  }

  for (const shoot of shootsWithNotes) {
    const meta = [shoot.time, shoot.photographer].filter(Boolean).join(' — ');
    text += `*${shoot.address}*${meta ? ` (${meta})` : ''}\n`;

    if (shoot.notes && shoot.notes.length > 0) {
      for (const note of shoot.notes) {
        const author = note.author ? ` _(${note.author})_` : '';
        text += `  • ${note.content}${author}\n`;
      }
    } else {
      text += `  • _No special notes_\n`;
    }
    text += '\n';
  }

  return text.trim();
}

async function sendToSlack(message) {
  if (!SLACK_WEBHOOK_URL) {
    console.log('[Slack] No webhook URL configured. Message preview:');
    console.log(message);
    return { ok: false, error: 'No SLACK_WEBHOOK_URL configured' };
  }

  const res = await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[Slack] Webhook failed ${res.status}: ${body}`);
    return { ok: false, error: body };
  }

  console.log('[Slack] Message sent successfully');
  return { ok: true };
}

module.exports = { formatSlackMessage, sendToSlack };
