const ASPECTS_API_URL = process.env.ASPECTS_API_URL;
const ASPECTS_API_KEY = process.env.ASPECTS_API_KEY;

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
    // HDPhotoHub API v1 - GET /orders
    // Returns all orders; we filter by date client-side
    const url = `${ASPECTS_API_URL}/api/v1/orders`;
    console.log(`[Aspects] Fetching: ${url}`);
    const res = await fetch(url, {
      headers: {
        'api_key': ASPECTS_API_KEY,
        'Accept': 'application/json',
      },
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
    const orders = Array.isArray(data) ? data : (data.orders || data.results || data.data || []);
    console.log(`[Aspects] Got ${orders.length} total orders`);

    // Filter to orders matching the requested date
    const filtered = orders.filter((order) => {
      if (!order.date) return false;
      // order.date is a date-time string; compare just the date portion
      const orderDate = order.date.slice(0, 10);
      return orderDate === date;
    });

    console.log(`[Aspects] ${filtered.length} orders match date ${date}`);

    // Map to our internal format
    const shoots = filtered.map((order) => {
      // Build address from site info if available
      const address = order.siteAddress || order.address || order.site_address || `Order #${order.oid}`;

      // Find photographer from tasks
      let photographer = '';
      if (order.tasks && order.tasks.length > 0) {
        photographer = order.tasks[0].memberassigned || '';
      }

      // Extract time from date or tasks
      let time = '';
      if (order.date) {
        const d = new Date(order.date);
        if (d.getHours() !== 0 || d.getMinutes() !== 0) {
          time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        }
      }
      if (!time && order.tasks && order.tasks.length > 0 && order.tasks[0].apptdate) {
        const d = new Date(order.tasks[0].apptdate);
        time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
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

// Fetch sites list (for debugging/setup)
async function fetchSites() {
  if (!ASPECTS_API_URL || !ASPECTS_API_KEY) {
    return { error: 'No API configured' };
  }
  try {
    const res = await fetch(`${ASPECTS_API_URL}/api/v1/site`, {
      headers: { 'api_key': ASPECTS_API_KEY, 'Accept': 'application/json' },
    });
    const body = await res.text();
    return { status: res.status, body: body.slice(0, 2000) };
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = { fetchShootsForDate, fetchSites };
