const http = require('http');
const { seedDatabase } = require('./db/seed');

// Helper to make HTTP requests
function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch(e) {}
        resolve({ status: res.statusCode, headers: res.headers, body, json });
      });
    });
    req.on('error', reject);
    if (postData) {
      if (typeof postData === 'object') {
        req.write(JSON.stringify(postData));
      } else {
        req.write(postData);
      }
    }
    req.end();
  });
}

async function runTests() {
  console.log('=================================================================');
  console.log('  RUNNING COMPLETE E2E TEST SUITE FOR LAKSHYA MENS PARLOUR APP   ');
  console.log('=================================================================\n');

  // Reset database with seeds
  seedDatabase();

  const baseUrl = 'http://localhost:3000';
  const defaultPin = '1234';

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  ✓ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${testName}`);
      failed++;
    }
  }

  try {
    // 1. PIN AUTHENTICATION
    console.log('\n--- 1. Testing Owner PIN Authentication ---');
    const wrongPinRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { pin: '9999' });
    assert(wrongPinRes.status === 401, 'Reject wrong PIN 9999');

    const rightPinRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { pin: defaultPin });
    assert(rightPinRes.status === 200 && rightPinRes.json.success === true, 'Accept default PIN 1234');

    // 2. DASHBOARD & DUE LISTS
    console.log('\n--- 2. Testing Dashboard & Due Lists ---');
    const dashRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/owner/dashboard',
      method: 'GET',
      headers: { 'x-owner-pin': defaultPin }
    });
    assert(dashRes.status === 200, 'Owner dashboard responds with 200');
    assert(dashRes.json.dueTodayList.length > 0, `Aaj Aane Wale list populated (${dashRes.json.dueTodayList.length} customers)`);
    assert(dashRes.json.overdueList.length > 0, `Late Ho Gaye list populated (${dashRes.json.overdueList.length} customers)`);
    
    // Check WhatsApp link in due list
    const firstDue = dashRes.json.dueTodayList[0];
    assert(firstDue.whatsapp_url.startsWith('https://wa.me/91'), 'Pre-composed WhatsApp reminder link present');
    assert(firstDue.personal_link.includes('/c/'), 'Personal booking link present');

    // 3. CUSTOMER VALIDATION & DUPLICATE CHECKS
    console.log('\n--- 3. Testing Customer Creation & Phone Validation ---');
    // Invalid phone
    const invalidPhoneRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/customers',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-owner-pin': defaultPin }
    }, { name: 'Test Invalid', phone: '12345', cycle_days: 25 });
    assert(invalidPhoneRes.status === 400, 'Reject non-10-digit phone number');

    // Duplicate phone (Rahul Sharma's phone: 9823123456)
    const duplicatePhoneRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/customers',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-owner-pin': defaultPin }
    }, { name: 'Rahul Clone', phone: '9823123456', cycle_days: 25 });
    assert(duplicatePhoneRes.status === 400, 'Reject duplicate phone number');

    // Valid customer add
    const validAddRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/customers',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-owner-pin': defaultPin }
    }, {
      name: 'Nitin Bhende',
      phone: '9822998811',
      cycle_days: 30,
      notes: 'Fade cut, beard trim with hot towel',
      avatar_preset: '/images/avatar4.jpg'
    });
    assert(validAddRes.status === 200 && validAddRes.json.success === true, 'Successfully add new customer Nitin Bhende');
    const newCustToken = validAddRes.json.secretToken;
    const newCustId = validAddRes.json.customerId;
    assert(newCustToken && newCustToken.length > 5, 'Customer personal secret token generated');

    // 4. CUSTOMER SECRET LINK & LIVE BOOKING FLOW
    console.log('\n--- 4. Testing Customer Secret Portal & Booking Flow ---');
    const custPortalRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/c/${newCustToken}`,
      method: 'GET'
    });
    assert(custPortalRes.status === 200, 'Customer portal loaded via secret token without login');
    assert(custPortalRes.json.customer.name === 'Nitin Bhende', 'Personalized greeting for Nitin Bhende');
    assert(custPortalRes.json.shop.name === 'Lakshya Mens Parlour', 'Shop details present');

    // Fetch available slots
    const todayStr = dashRes.json.todayStr;
    const slotsRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/c/${newCustToken}/slots?date=${todayStr}`,
      method: 'GET'
    });
    assert(slotsRes.status === 200 && slotsRes.json.slots.length > 0, `Generated 30-min time slots for date (${slotsRes.json.slots.length} slots)`);
    assert(slotsRes.json.capacity === 2, 'Slot capacity confirmed at 2 Barbers');

    // Book slot for customer
    const targetSlot = '17:00';
    const bookRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/c/${newCustToken}/book`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      date: todayStr,
      slot_time: targetSlot,
      services: ['Fade / Spikes / Styling Haircut', 'Beard Trim & Razor Line'],
      notes: 'Customer online booking'
    });
    assert(bookRes.status === 200 && bookRes.json.success === true, 'Customer booking confirmed with code: ' + bookRes.json.bookingCode);
    assert(bookRes.json.bookingCode.startsWith('LAK-'), 'Booking code formatted as LAK-XXXX');

    // Capacity check: Book again on same slot (2nd booking should succeed)
    const book2Res = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/c/${newCustToken}/book`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      date: todayStr,
      slot_time: targetSlot,
      services: ['Regular Haircut'],
      notes: '2nd client for 2nd barber'
    });
    assert(book2Res.status === 200, '2nd booking allowed on same slot (Barber 2 capacity)');

    // 3rd booking on same slot should FAIL because capacity is 2!
    const book3Res = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/c/${newCustToken}/book`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      date: todayStr,
      slot_time: targetSlot,
      services: ['Regular Haircut'],
      notes: '3rd client attempting over-capacity'
    });
    assert(book3Res.status === 400, 'Reject 3rd booking beyond 2 barbers capacity');

    // 5. REAL-TIME 10-SECOND POLLER NOTIFICATION
    console.log('\n--- 5. Testing Real-Time Poller Notification ---');
    const pollRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/owner/poll-status',
      method: 'GET',
      headers: { 'x-owner-pin': defaultPin }
    });
    assert(pollRes.status === 200 && pollRes.json.unreadBookingsCount > 0, `Unread new bookings detected (${pollRes.json.unreadBookingsCount} unread)`);
    assert(pollRes.json.hasNew === true, 'hasNew flag is true (triggers owner chime/banner)');

    // 6. VISIT MARKING & LOYALTY REWARDS (3RD VISIT FREE & 5TH VISIT 50% OFF)
    console.log('\n--- 6. Testing Visit Marking & Loyalty Rewards (Free Cut on 3rd Visit) ---');
    // Fetch all customers to get dynamic IDs
    const allCustRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/customers',
      method: 'GET',
      headers: { 'x-owner-pin': defaultPin }
    });
    const rahul = allCustRes.json.find(c => c.name === 'Rahul Sharma');
    const amit = allCustRes.json.find(c => c.name === 'Amit Verma');

    // Check Rahul Sharma (already has 2 visits, next is 3rd visit -> FREE CUT!)
    const rahulProfileRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/customers/${rahul.id}`,
      method: 'GET',
      headers: { 'x-owner-pin': defaultPin }
    });
    assert(rahulProfileRes.json.customer.total_visits === 2, 'Rahul Sharma has 2 visits completed');
    assert(rahulProfileRes.json.customer.loyalty.isRewardDue === true, 'Loyalty reward is due for Rahul Sharma');
    assert(rahulProfileRes.json.customer.loyalty.reward === 'FREE_CUT', 'Reward is FREE_CUT for 3rd visit');

    // Owner marks Rahul's visit done with Free Haircut discount
    const visitRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/visits',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-owner-pin': defaultPin }
    }, {
      customer_id: rahul.id,
      services: ['Fade / Spikes / Styling Haircut'],
      total_amount: 0,
      discount_applied: 120,
      loyalty_reward_applied: 'FREE_CUT',
      payment_mode: 'Cash',
      notes: 'Redeemed 3rd visit FREE Haircut reward!'
    });
    assert(visitRes.status === 200 && visitRes.json.totalVisits === 3, 'Rahul Sharma visit marked done; visits incremented to 3');

    // Check Amit Verma (has 4 visits, next is 5th visit -> 50% OFF!)
    const amitProfileRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/customers/${amit.id}`,
      method: 'GET',
      headers: { 'x-owner-pin': defaultPin }
    });
    assert(amitProfileRes.json.customer.total_visits === 4, 'Amit Verma has 4 visits completed');
    assert(amitProfileRes.json.customer.loyalty.reward === 'HALF_PRICE', 'Reward is HALF_PRICE (50% OFF) for 5th visit');

    // 7. CSV EXPORTS & DATABASE BACKUP
    console.log('\n--- 7. Testing CSV Exports & Full Database Backup ---');
    const custCsv = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/export/customers.csv',
      method: 'GET',
      headers: { 'x-owner-pin': defaultPin }
    });
    assert(custCsv.status === 200 && custCsv.body.includes('Nitin Bhende'), 'Customers CSV exported with headers and data');

    const bookCsv = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/export/bookings.csv',
      method: 'GET',
      headers: { 'x-owner-pin': defaultPin }
    });
    assert(bookCsv.status === 200 && bookCsv.body.includes('Booking Code'), 'Bookings CSV exported');

    const visitsCsv = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/export/visits.csv',
      method: 'GET',
      headers: { 'x-owner-pin': defaultPin }
    });
    assert(visitsCsv.status === 200 && visitsCsv.body.includes('Visit ID'), 'Visits CSV exported');

    const dbBackup = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/export/backup.db',
      method: 'GET',
      headers: { 'x-owner-pin': defaultPin }
    });
    assert(dbBackup.status === 200 && dbBackup.headers['content-type'].includes('application/octet-stream') || dbBackup.status === 200, 'Database backup file downloadable');

    // 8. FINANCIAL REPORTS & EXPENSES
    console.log('\n--- 8. Testing Khata & Expenses ---');
    const expRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/expenses',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-owner-pin': defaultPin }
    }, {
      category: 'Blades & Razors',
      amount: 150,
      notes: 'SuperMax Platinum razor blades'
    });
    assert(expRes.status === 200 && expRes.json.success === true, 'Logged shop expense');

    const repRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/reports/summary',
      method: 'GET',
      headers: { 'x-owner-pin': defaultPin }
    });
    assert(repRes.status === 200 && repRes.json.today.expenses >= 150, 'Reports summary reflects today expenses');

    console.log('\n=================================================================');
    console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED               `);
    console.log('=================================================================\n');

    process.exit(failed > 0 ? 1 : 0);

  } catch(err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

// Start server and run tests
const app = require('./server');
setTimeout(runTests, 800);
