const ASPECTS_API_URL = process.env.ASPECTS_API_URL;
const ASPECTS_API_KEY = process.env.ASPECTS_API_KEY;

const apiHeaders = () => ({
  'api_key': ASPECTS_API_KEY,
  'Accept': 'application/json',
});

function generateMockShoots(date) {
  return {
    shoots: [
      { id: `mock-${date}-1`, date, address: '123 Main Street, Los Angeles, CA', photographer: 'John', time: '09:00 AM', raw_data: '{}' },
      { id: `mock-${date}-2`, date, address: '456 Oak Avenue, Pasadena, CA', photographer: 'Sarah', time: '11:30 AM', raw_data: '{}' },
      { id: `mock-${date}-3`, date, address: '789 Pine Road, Burbank, CA', photographer: 'John', time: '02:00 PM', raw_data: '{}' },
    ],
  };
}

function toDateStr(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  } catch { return null; }
}

function toTimeStr(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles' });
  } catch { return ''; }
}

const siteCache = {};
async function getSiteAddress(sid) {
  if (siteCache[sid]) return siteCache[sid];
  try {
    const res = await fetch(`${ASPECTS_API_URL}/api/v1/site?sid=${sid}`, {
      headers: apiHeaders(), signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const site = await res.json();
      const addr = [site.address, site.city, site.state, site.zip].filter(Boolean).join(', ');
      siteCache[sid] = addr || `Site #${sid}`;
      return siteCache[sid];
    }
  } catch {}
  return `Site #${sid}`;
}

// Fetch a single client's orders and return any matching today's date
async function checkClientOrders(uid, date) {
  try {
    const res = await fetch(`${ASPECTS_API_URL}/api/v1/orders?uid=${uid}`, {
      headers: apiHeaders(), signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const text = await res.text();
    if (!text || text === '[]' || text.length < 5) return [];
    const orders = JSON.parse(text);
    if (!Array.isArray(orders)) return [];

    const matches = [];
    for (const order of orders) {
      if (!order.tasks) continue;
      for (const task of order.tasks) {
        if (toDateStr(task.apptdate) === date) {
          matches.push({ order, task });
          break;
        }
      }
    }
    return matches;
  } catch { return []; }
}

async function fetchShootsForDate(date) {
  if (!ASPECTS_API_URL || !ASPECTS_API_KEY) {
    console.log('[Aspects] No API configured — using mock data');
    return generateMockShoots(date);
  }

  try {
    // Step 1: Get all users
    console.log('[Aspects] Fetching users...');
    const usersRes = await fetch(`${ASPECTS_API_URL}/api/v1/users`, {
      headers: apiHeaders(), signal: AbortSignal.timeout(30000),
    });
    if (!usersRes.ok) {
      return { error: `Failed to fetch users: ${usersRes.status}`, shoots: [] };
    }
    const allUsers = await usersRes.json();

    // Get all active clients AND team members (shoots might be under either)
    const relevantUsers = Array.isArray(allUsers)
      ? allUsers.filter(u => u.status === 'active')
      : [];
    console.log(`[Aspects] Found ${relevantUsers.length} active users`);

    // Step 2: Check all users' orders in parallel batches of 25
    const allMatches = [];
    const seenOids = new Set();
    const batchSize = 25;

    for (let i = 0; i < relevantUsers.length; i += batchSize) {
      const batch = relevantUsers.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(u => checkClientOrders(u.uid, date))
      );
      for (const matches of results) {
        for (const match of matches) {
          if (!seenOids.has(match.order.oid)) {
            seenOids.add(match.order.oid);
            allMatches.push(match);
          }
        }
      }
      console.log(`[Aspects] Checked ${Math.min(i + batchSize, relevantUsers.length)}/${relevantUsers.length} users, found ${allMatches.length} shoots`);
    }

    console.log(`[Aspects] Total: ${allMatches.length} shoots for ${date}`);

    // Step 3: Resolve site addresses in parallel
    const shoots = await Promise.all(allMatches.map(async ({ order, task }) => {
      const address = await getSiteAddress(order.sid);
      return {
        id: String(order.oid),
        date,
        address,
        photographer: task.memberassigned || '',
        time: toTimeStr(task.apptdate),
        raw_data: JSON.stringify(order),
      };
    }));

    // Sort by time
    shoots.sort((a, b) => a.time.localeCompare(b.time));

    return { shoots };
  } catch (err) {
    console.error('[Aspects] API fetch failed:', err.message);
    return { error: `Fetch failed: ${err.message}`, shoots: [] };
  }
}

module.exports = { fetchShootsForDate };
