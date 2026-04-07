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
    // Aspects Dashboard API v1
    const url = `${ASPECTS_API_URL}/api/v1/orders?date=${date}`;
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

    console.log('[Aspects] Raw response keys:', Object.keys(data));

    // Normalize the API response into our internal format
    const items = Array.isArray(data) ? data : (data.orders || data.results || data.data || data.Items || []);
    const shoots = items.map((order) => ({
      id: String(order.id || order.orderId || order.Id || order.OrderId || order.order_id),
      date,
      address: order.address || order.propertyAddress || order.Address || order.PropertyAddress || order.property_address || 'Unknown address',
      photographer: order.photographer || order.photographerName || order.Photographer || order.PhotographerName || order.photographer_name || '',
      time: order.time || order.scheduledTime || order.Time || order.ScheduledTime || order.scheduled_time || '',
      raw_data: JSON.stringify(order),
    }));

    console.log(`[Aspects] Fetched ${shoots.length} shoots for ${date}`);
    return { shoots };
  } catch (err) {
    console.error('[Aspects] API fetch failed:', err.message);
    return { error: `Fetch failed: ${err.message}`, shoots: [] };
  }
}

module.exports = { fetchShootsForDate };
