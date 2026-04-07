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
    // Step 1: Get all users
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

    // Step 2: Fetch orders for ALL clients in parallel batches of 10
    // Use 10s timeout (the 5s was too aggressive)
    const allMatches = [];
    const seenOids = new Set();
    const batchSize = 10;

    for (let i = 0; i < clients.length; i += batchSize) {
      const batch = clients.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (client) => {
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
        })
      );

      for (const matches of results) {
        for (const match of matches) allMatches.push(match);
      }

      console.log(`[Aspects] Checked ${Math.min(i + batchSize, clients.length)}/${clients.length} clients, found ${allMatches.length} shoots`);
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

    shoots.sort((a, b) => a.time.localeCompare(b.time));
    return { shoots };
  } catch (err) {
    console.error('[Aspects] API fetch failed:', err.message);
    return { error: `Fetch failed: ${err.message}`, shoots: [] };
  }
}

// Search for a specific shoot by address — fast single lookup
async function searchShootByAddress(addressQuery, date) {
  if (!ASPECTS_API_URL || !ASPECTS_API_KEY) {
    return { error: 'No API configured' };
  }

  try {
    // Search sites by address
    const res = await fetch(`${ASPECTS_API_URL}/api/v1/sites?address=${encodeURIComponent(addressQuery)}`, {
      headers: apiHeaders(), signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { error: `Sites search failed: ${res.status}` };
    const sites = await res.json();
    if (!Array.isArray(sites) || sites.length === 0) return { error: 'No sites found for that address' };

    // Check each matching site's orders for today's appointment
    for (const site of sites) {
      try {
        const ordersRes = await fetch(`${ASPECTS_API_URL}/api/v1/orders?sid=${site.sid}`, {
          headers: apiHeaders(), signal: AbortSignal.timeout(10000),
        });
        if (!ordersRes.ok) continue;
        const orders = await ordersRes.json();
        if (!Array.isArray(orders)) continue;

        for (const order of orders) {
          if (!order.tasks) continue;
          for (const task of order.tasks) {
            if (toDateStr(task.apptdate) === date) {
              const address = [site.address, site.city, site.state, site.zip].filter(Boolean).join(', ');
              return {
                shoot: {
                  id: String(order.oid),
                  date,
                  address,
                  photographer: task.memberassigned || '',
                  time: toTimeStr(task.apptdate),
                  raw_data: JSON.stringify(order),
                },
              };
            }
          }
        }
      } catch { continue; }
    }

    return { error: 'No orders with today\'s appointment found for that address' };
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = { fetchShootsForDate, searchShootByAddress };
