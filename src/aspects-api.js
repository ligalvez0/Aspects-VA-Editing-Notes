const ASPECTS_API_URL = process.env.ASPECTS_API_URL;
const ASPECTS_API_KEY = process.env.ASPECTS_API_KEY;
const ASPECTS_UID = process.env.ASPECTS_UID || '168135';

const headers = () => ({
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

// Parse Aspects date format "M/D/YYYY h:mm:ss AM/PM" to YYYY-MM-DD
function parseAspectsDate(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    // Format as YYYY-MM-DD in Pacific time
    return d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  } catch {
    return null;
  }
}

// Format time from Aspects date
function parseAspectsTime(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles' });
  } catch {
    return '';
  }
}

// Fetch site address by sid (with simple cache)
const siteCache = {};
async function getSiteAddress(sid) {
  if (siteCache[sid]) return siteCache[sid];
  try {
    const res = await fetch(`${ASPECTS_API_URL}/api/v1/site?sid=${sid}`, {
      headers: headers(),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const site = await res.json();
      const parts = [site.address, site.city, site.state, site.zip].filter(Boolean);
      const addr = parts.length > 0 ? parts.join(', ') : `Site #${sid}`;
      siteCache[sid] = addr;
      return addr;
    }
  } catch (err) {
    console.error(`[Aspects] Failed to fetch site ${sid}:`, err.message);
  }
  return `Site #${sid}`;
}

async function fetchShootsForDate(date) {
  if (!ASPECTS_API_URL || !ASPECTS_API_KEY) {
    console.log('[Aspects] No API configured — using mock data');
    return generateMockShoots(date);
  }

  try {
    const url = `${ASPECTS_API_URL}/api/v1/orders?uid=${ASPECTS_UID}`;
    console.log(`[Aspects] Fetching: ${url}`);
    const res = await fetch(url, {
      headers: headers(),
      signal: AbortSignal.timeout(60000),
    });

    const body = await res.text();

    if (!res.ok) {
      console.error(`[Aspects] API returned ${res.status}: ${body.slice(0, 500)}`);
      return { error: `Aspects API returned ${res.status}: ${body.slice(0, 200)}`, shoots: [] };
    }

    let data;
    try {
      data = JSON.parse(body);
    } catch {
      console.error('[Aspects] Non-JSON response:', body.slice(0, 500));
      return { error: 'Aspects API returned non-JSON response', shoots: [] };
    }

    const orders = Array.isArray(data) ? data : [];
    console.log(`[Aspects] Got ${orders.length} total orders`);

    // Filter to orders matching the requested date
    const filtered = orders.filter((order) => {
      const orderDate = parseAspectsDate(order.date);
      return orderDate === date;
    });

    console.log(`[Aspects] ${filtered.length} orders match date ${date}`);

    // Map to our internal format, fetching site addresses
    const shoots = await Promise.all(filtered.map(async (order) => {
      const address = await getSiteAddress(order.sid);

      let photographer = '';
      if (order.tasks && order.tasks.length > 0) {
        photographer = order.tasks[0].memberassigned || '';
      }

      let time = '';
      if (order.tasks && order.tasks.length > 0 && order.tasks[0].apptdate) {
        time = parseAspectsTime(order.tasks[0].apptdate);
      }
      if (!time && order.date) {
        time = parseAspectsTime(order.date);
      }

      return {
        id: String(order.oid),
        date,
        address,
        photographer,
        time,
        raw_data: JSON.stringify(order),
      };
    }));

    return { shoots };
  } catch (err) {
    console.error('[Aspects] API fetch failed:', err.message);
    return { error: `Fetch failed: ${err.message}`, shoots: [] };
  }
}

module.exports = { fetchShootsForDate };
