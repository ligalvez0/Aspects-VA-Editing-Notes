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

// Cache for site addresses
const siteCache = {};
async function getSiteAddress(sid) {
  if (siteCache[sid]) return siteCache[sid];
  try {
    const res = await fetch(`${ASPECTS_API_URL}/api/v1/site?sid=${sid}`, {
      headers: apiHeaders(), signal: AbortSignal.timeout(10000),
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

async function fetchShootsForDate(date) {
  if (!ASPECTS_API_URL || !ASPECTS_API_KEY) {
    console.log('[Aspects] No API configured — using mock data');
    return generateMockShoots(date);
  }

  try {
    // Step 1: Get all active client users
    console.log('[Aspects] Fetching users...');
    const usersRes = await fetch(`${ASPECTS_API_URL}/api/v1/users`, {
      headers: apiHeaders(), signal: AbortSignal.timeout(30000),
    });
    if (!usersRes.ok) {
      return { error: `Failed to fetch users: ${usersRes.status}`, shoots: [] };
    }
    const allUsers = await usersRes.json();
    const clients = Array.isArray(allUsers)
      ? allUsers.filter(u => u.type === 'client' && u.status === 'active')
      : [];
    console.log(`[Aspects] Found ${clients.length} active clients`);

    // Step 2: Fetch orders for each client in batches, look for today's apptdate
    const shoots = [];
    const seenOids = new Set();
    const batchSize = 10;

    for (let i = 0; i < clients.length; i += batchSize) {
      const batch = clients.slice(i, i + batchSize);
      const promises = batch.map(async (client) => {
        try {
          const res = await fetch(`${ASPECTS_API_URL}/api/v1/orders?uid=${client.uid}`, {
            headers: apiHeaders(), signal: AbortSignal.timeout(10000),
          });
          if (!res.ok) return [];
          const orders = await res.json();
          if (!Array.isArray(orders)) return [];

          const matches = [];
          for (const order of orders) {
            if (!order.tasks || seenOids.has(order.oid)) continue;
            for (const task of order.tasks) {
              if (toDateStr(task.apptdate) === date) {
                seenOids.add(order.oid);
                matches.push({ order, task });
                break;
              }
            }
          }
          return matches;
        } catch { return []; }
      });

      const batchResults = await Promise.all(promises);
      for (const matches of batchResults) {
        for (const { order, task } of matches) {
          const address = await getSiteAddress(order.sid);
          shoots.push({
            id: String(order.oid),
            date,
            address,
            photographer: task.memberassigned || '',
            time: toTimeStr(task.apptdate),
            raw_data: JSON.stringify(order),
          });
        }
      }

      // Log progress
      if ((i + batchSize) % 50 === 0) {
        console.log(`[Aspects] Processed ${i + batchSize}/${clients.length} clients, found ${shoots.length} shoots so far`);
      }
    }

    console.log(`[Aspects] Found ${shoots.length} shoots for ${date}`);
    return { shoots };
  } catch (err) {
    console.error('[Aspects] API fetch failed:', err.message);
    return { error: `Fetch failed: ${err.message}`, shoots: [] };
  }
}

module.exports = { fetchShootsForDate };
