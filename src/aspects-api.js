const ASPECTS_API_URL = process.env.ASPECTS_API_URL;
const ASPECTS_API_KEY = process.env.ASPECTS_API_KEY;

function generateMockShoots(date) {
  return [
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
  ];
}

async function fetchShootsForDate(date) {
  if (!ASPECTS_API_URL || !ASPECTS_API_KEY) {
    console.log('[Aspects] No API configured — using mock data');
    return generateMockShoots(date);
  }

  try {
    // Aspects Dashboard API integration
    // Adjust the endpoint path once the exact API docs are confirmed
    const url = `${ASPECTS_API_URL}/api/orders?date=${date}&apiKey=${ASPECTS_API_KEY}`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${ASPECTS_API_KEY}`,
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      console.error(`[Aspects] API returned ${res.status}: ${res.statusText}`);
      return [];
    }

    const data = await res.json();

    // Normalize the API response into our internal format
    // Adjust field mappings based on actual API response shape
    const shoots = (data.orders || data.results || data || []).map((order) => ({
      id: String(order.id || order.orderId || order.Id),
      date,
      address: order.address || order.propertyAddress || order.Address || 'Unknown address',
      photographer: order.photographer || order.photographerName || order.Photographer || '',
      time: order.time || order.scheduledTime || order.Time || '',
      raw_data: JSON.stringify(order),
    }));

    console.log(`[Aspects] Fetched ${shoots.length} shoots for ${date}`);
    return shoots;
  } catch (err) {
    console.error('[Aspects] API fetch failed:', err.message);
    return [];
  }
}

module.exports = { fetchShootsForDate };
