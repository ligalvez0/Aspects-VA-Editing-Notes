const ASPECTS_API_URL = process.env.ASPECTS_API_URL;
const ASPECTS_API_KEY = process.env.ASPECTS_API_KEY;
const ASPECTS_UID = process.env.ASPECTS_UID || '168135';

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

// Parse Aspects date "M/D/YYYY h:mm:ss AM/PM" to YYYY-MM-DD in Pacific time
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

async function fetchShootsForDate(date) {
  if (!ASPECTS_API_URL || !ASPECTS_API_KEY) {
    console.log('[Aspects] No API configured — using mock data');
    return generateMockShoots(date);
  }

  try {
    // Step 1: Fetch all orders for our user
    const url = `${ASPECTS_API_URL}/api/v1/orders?uid=${ASPECTS_UID}`;
    console.log(`[Aspects] Fetching orders: ${url}`);
    const res = await fetch(url, {
      headers: apiHeaders(),
      signal: AbortSignal.timeout(60000),
    });

    const body = await res.text();
    if (!res.ok) {
      return { error: `API returned ${res.status}: ${body.slice(0, 200)}`, shoots: [] };
    }

    let orders;
    try { orders = JSON.parse(body); } catch {
      return { error: 'Non-JSON response from API', shoots: [] };
    }
    if (!Array.isArray(orders)) orders = [];
    console.log(`[Aspects] Got ${orders.length} total orders`);

    // Step 2: Filter orders that have tasks with apptdate matching today
    const matchingOrders = orders.filter((order) => {
      if (!order.tasks || order.tasks.length === 0) return false;
      return order.tasks.some((task) => toDateStr(task.apptdate) === date);
    });

    console.log(`[Aspects] ${matchingOrders.length} orders have tasks on ${date}`);
    if (matchingOrders.length === 0) {
      return { shoots: [] };
    }

    // Step 3: Fetch site details for each matching order to get addresses
    const shoots = await Promise.all(matchingOrders.map(async (order) => {
      // Get site address
      let address = `Order #${order.oid}`;
      try {
        const siteRes = await fetch(`${ASPECTS_API_URL}/api/v1/site?sid=${order.sid}`, {
          headers: apiHeaders(),
          signal: AbortSignal.timeout(10000),
        });
        if (siteRes.ok) {
          const site = await siteRes.json();
          const parts = [site.address, site.city, site.state, site.zip].filter(Boolean);
          if (parts.length > 0) address = parts.join(', ');
        }
      } catch (err) {
        console.error(`[Aspects] Failed to fetch site ${order.sid}:`, err.message);
      }

      // Get photographer and time from first task with matching apptdate
      let photographer = '';
      let time = '';
      for (const task of order.tasks) {
        if (toDateStr(task.apptdate) === date) {
          photographer = task.memberassigned || '';
          time = toTimeStr(task.apptdate);
          break;
        }
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
