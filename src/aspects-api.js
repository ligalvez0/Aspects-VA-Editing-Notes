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

async function fetchShootsForDate(date) {
  if (!ASPECTS_API_URL || !ASPECTS_API_KEY) {
    console.log('[Aspects] No API configured — using mock data');
    return generateMockShoots(date);
  }

  try {
    // Step 1: Get all "preparing" sites — these are active shoots
    // Fetch all sites and filter for "preparing" status
    console.log('[Aspects] Fetching all sites...');
    const sitesRes = await fetch(`${ASPECTS_API_URL}/api/v1/sites`, {
      headers: apiHeaders(),
      signal: AbortSignal.timeout(120000), // 2 min timeout for large list
    });

    if (!sitesRes.ok) {
      return { error: `Failed to fetch sites: ${sitesRes.status}`, shoots: [] };
    }

    const allSites = await sitesRes.json();
    const sites = Array.isArray(allSites) ? allSites : [];
    console.log(`[Aspects] Got ${sites.length} total sites`);

    // Filter for "preparing" status sites (active shoots awaiting photo/editing)
    const preparingSites = sites.filter(s => s.status === 'preparing');
    console.log(`[Aspects] ${preparingSites.length} sites in "preparing" status`);

    if (preparingSites.length === 0) {
      return { shoots: [] };
    }

    // Step 2: Fetch orders for each preparing site to check for today's apptdate
    const shoots = [];
    const batchSize = 5;

    for (let i = 0; i < preparingSites.length; i += batchSize) {
      const batch = preparingSites.slice(i, i + batchSize);
      const promises = batch.map(async (site) => {
        try {
          const ordersRes = await fetch(`${ASPECTS_API_URL}/api/v1/orders?sid=${site.sid}`, {
            headers: apiHeaders(),
            signal: AbortSignal.timeout(15000),
          });
          if (!ordersRes.ok) return null;
          const orders = await ordersRes.json();
          if (!Array.isArray(orders)) return null;

          // Find orders with tasks scheduled for today
          for (const order of orders) {
            if (!order.tasks) continue;
            for (const task of order.tasks) {
              if (toDateStr(task.apptdate) === date) {
                const address = [site.address, site.city, site.state, site.zip].filter(Boolean).join(', ');
                return {
                  id: String(order.oid),
                  date,
                  address: address || `Site #${site.sid}`,
                  photographer: task.memberassigned || '',
                  time: toTimeStr(task.apptdate),
                  raw_data: JSON.stringify({ order, site: { sid: site.sid, address: site.address, city: site.city } }),
                };
              }
            }
          }
          return null;
        } catch { return null; }
      });

      const results = await Promise.all(promises);
      for (const r of results) {
        if (r) shoots.push(r);
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
