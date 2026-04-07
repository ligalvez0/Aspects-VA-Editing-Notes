const ASPECTS_API_URL = process.env.ASPECTS_API_URL;
const ASPECTS_API_KEY = process.env.ASPECTS_API_KEY;
const ASPECTS_UID = process.env.ASPECTS_UID || '168135';

function generateMockShoots(date) {
  return {
    shoots: [
      {
        id: `mock-${date}-1`,
        date,
        address: '123 Main Street, Los Angeles, CA',
        photographer: 'John',
        time: '09:00 AM',
        raw_data: '{}',
      },
      {
        id: `mock-${date}-2`,
        date,
        address: '456 Oak Avenue, Pasadena, CA',
        photographer: 'Sarah',
        time: '11:30 AM',
        raw_data: '{}',
      },
      {
        id: `mock-${date}-3`,
        date,
        address: '789 Pine Road, Burbank, CA',
        photographer: 'John',
        time: '02:00 PM',
        raw_data: '{}',
      },
    ],
  };
}

async function fetchShootsForDate(date) {
  if (!ASPECTS_API_URL || !ASPECTS_API_KEY) {
    console.log('[Aspects] No API configured — using mock data');
    return generateMockShoots(date);
  }

  try {
    // HDPhotoHub API v1 - GET /orders?uid=<UserID>
    const url = `${ASPECTS_API_URL}/api/v1/orders?uid=${ASPECTS_UID}`;
    console.log(`[Aspects] Fetching: ${url}`);
    const res = await fetch(url, {
      headers: {
        'api_key': ASPECTS_API_KEY,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
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

    // API returns an array of order objects
    const orders = Array.isArray(data) ? data : [];
    console.log(`[Aspects] Got ${orders.length} total orders`);

    // Filter to orders matching the requested date
    const filtered = orders.filter((order) => {
      if (!order.date) return false;
      const orderDate = order.date.slice(0, 10);
      return orderDate === date;
    });

    console.log(`[Aspects] ${filtered.length} orders match date ${date}`);

    // Map to our internal format using site address data
    const shoots = filtered.map((order) => {
      // Address from the order's site
      const address = order.address || order.siteAddress || `Order #${order.oid}`;

      // Photographer from first task's memberassigned
      let photographer = '';
      if (order.tasks && order.tasks.length > 0) {
        photographer = order.tasks[0].memberassigned || '';
      }

      // Time from task appointment date or order date
      let time = '';
      if (order.tasks && order.tasks.length > 0 && order.tasks[0].apptdate) {
        const d = new Date(order.tasks[0].apptdate);
        if (!isNaN(d.getTime())) {
          time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles' });
        }
      }
      if (!time && order.date) {
        const d = new Date(order.date);
        if (!isNaN(d.getTime()) && (d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0)) {
          time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles' });
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
    });

    return { shoots };
  } catch (err) {
    console.error('[Aspects] API fetch failed:', err.message);
    return { error: `Fetch failed: ${err.message}`, shoots: [] };
  }
}

module.exports = { fetchShootsForDate };
