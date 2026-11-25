const { db, getTodayString, generateBookingCode, generateCustomerToken } = require('./index');

function seedDatabase() {
  console.log('--- Seeding Lakshya Mens Parlour Database ---');

  // Clear existing data
  db.exec(`
    DELETE FROM bookings;
    DELETE FROM visits;
    DELETE FROM customers;
    DELETE FROM services;
    DELETE FROM expenses;
  `);

  // 1. Seed Services
  const insertService = db.prepare(`
    INSERT INTO services (name, name_hi, category, price, duration_mins, description, image_url, is_active, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const servicesList = [
    { name: 'Regular Haircut', name_hi: 'बाल कटिंग', category: 'Hair', price: 100, duration: 25, desc: 'Classic scissor & machine cut with wash and neck shave', image_url: '/images/haircut.jpg', order: 1 },
    { name: 'Fade / Spikes / Styling Haircut', name_hi: 'स्टाइलिश फेड कटिंग', category: 'Hair', price: 120, duration: 30, desc: 'Skin fade, taper fade, modern undercut with styling wax', image_url: '/images/haircut.jpg', order: 2 },
    { name: 'Beard Trim & Razor Line', name_hi: 'दाढ़ी सेटिंग', category: 'Beard', price: 50, duration: 15, desc: 'Precision machine trim and straight razor line sharpening with aftershave', image_url: '/images/beard.jpg', order: 3 },
    { name: 'Haircut + Beard Styling Combo', name_hi: 'कटिंग + दाढ़ी कॉम्बो', category: 'Combo', price: 130, duration: 35, desc: 'Complete hair cut and sharp beard grooming at special combo price', image_url: '/images/interior-chairs.jpg', order: 4 },
    { name: 'Almond Oil Head Massage', name_hi: 'बादाम तेल मालिश', category: 'Spa', price: 80, duration: 15, desc: 'Deep scalp tension release with pure warm almond oil & pressure points', image_url: '/images/massage.jpg', order: 5 },
    { name: 'Mint Cool Head Massage', name_hi: 'मिंट ठंडा मालिश', category: 'Spa', price: 100, duration: 20, desc: 'Refreshing icy menthol scalp massage, relieves heat and stress', image_url: '/images/massage.jpg', order: 6 },
    { name: 'D-Tan Face Pack & Cleanser', name_hi: 'डी-टैन फेस पैक', category: 'Facial', price: 150, duration: 25, desc: 'Removes Nagpur sun tan, dead skin, and refreshes face glow', image_url: '/images/facial.jpg', order: 7 },
    { name: 'Hair Colour / Dye Application', name_hi: 'हेयर कलर / डाई', category: 'Hair', price: 150, duration: 30, desc: 'Natural black or brown ammonia-free hair coloring with shampoo', image_url: '/images/tools.jpg', order: 8 },
    { name: 'Charcoal Black Face Mask', name_hi: 'चारकोल ब्लैक मास्क', category: 'Facial', price: 100, duration: 20, desc: 'Deep blackhead removal and instant skin brightening', image_url: '/images/facial.jpg', order: 9 },
    { name: 'Royal Grooming Package', name_hi: 'रॉयल ग्रूमिंग पैकेज', category: 'Combo', price: 350, duration: 60, desc: 'Haircut + Beard Styling + D-Tan Pack + 15 min Almond Head Massage', image_url: '/images/shop-front.jpg', order: 10 }
  ];

  for (const s of servicesList) {
    insertService.run(s.name, s.name_hi, s.category, s.price, s.duration, s.desc, s.image_url, 1, s.order);
  }
  console.log(`✓ Inserted ${servicesList.length} salon services with high-res photos`);

  // Helper date calculators relative to today
  const today = new Date();
  const getDateStr = (daysOffset) => {
    const d = new Date(today);
    d.setDate(d.getDate() + daysOffset);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // 2. Seed Customers
  // We want a mix:
  // - Due today (last visit + cycleDays == today)
  // - Overdue (last visit + cycleDays < today)
  // - Customers with 2 visits (ready for FREE cut on 3rd visit!)
  // - Customers with 4 visits (ready for 50% OFF on 5th visit!)
  const insertCustomer = db.prepare(`
    INSERT INTO customers (name, phone, photo_url, notes, cycle_days, secret_token, last_visit_date, total_visits, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const customersList = [
    {
      name: 'Rahul Sharma',
      phone: '9823123456',
      photo_url: '/images/avatar1.jpg',
      notes: 'Skin fade on sides, scissors on top, sharp razor beard, likes almond massage',
      cycle_days: 25,
      secret_token: 'rahul_m8x2',
      last_visit_offset: -25, // Exactly 25 days ago -> DUE TODAY!
      total_visits: 2, // 2 visits done -> 3rd visit is FREE CUT!
      created_offset: -75
    },
    {
      name: 'Amit Verma',
      phone: '9890456781',
      photo_url: '/images/avatar2.jpg',
      notes: 'Medium crop cut, neat mustache trim, no machine on top, sensitive skin',
      cycle_days: 25,
      secret_token: 'amit_p4q9',
      last_visit_offset: -29, // 29 days ago -> OVERDUE BY 4 DAYS!
      total_visits: 4, // 4 visits done -> 5th visit is HALF PRICE (50% OFF)!
      created_offset: -120
    },
    {
      name: 'Sachin Deshmukh',
      phone: '9764123890',
      photo_url: '/images/avatar3.jpg',
      notes: 'Crew cut, clean razor shave with hot towel, prefers evening slot',
      cycle_days: 30,
      secret_token: 'sachin_k2w7',
      last_visit_offset: -38, // 38 days ago (cycle 30) -> OVERDUE BY 8 DAYS!
      total_visits: 1,
      created_offset: -40
    },
    {
      name: 'Kunal Raut',
      phone: '9822789123',
      photo_url: '/images/avatar4.jpg',
      notes: 'Side part pompadour, light stubble trimming, quick styling',
      cycle_days: 30,
      secret_token: 'kunal_j5v1',
      last_visit_offset: -30, // Exactly 30 days ago -> DUE TODAY!
      total_visits: 3,
      created_offset: -100
    },
    {
      name: 'Pranay Meshram',
      phone: '9970554433',
      photo_url: '/images/avatar5.jpg',
      notes: 'Buzz cut 2-number, full thick beard shaping, uses aftershave balm',
      cycle_days: 25,
      secret_token: 'pranay_b9t3',
      last_visit_offset: -45, // 45 days ago -> OVERDUE BY 20 DAYS!
      total_visits: 2, // Next visit is 3rd -> FREE CUT!
      created_offset: -90
    },
    {
      name: 'Gaurav Patle',
      phone: '9850112233',
      photo_url: '/images/avatar1.jpg',
      notes: 'Textured quiff haircut, neat beard line, likes D-Tan pack once a month',
      cycle_days: 25,
      secret_token: 'gaurav_d1r4',
      last_visit_offset: -10, // 10 days ago -> UPCOMING in 15 days
      total_visits: 3,
      created_offset: -85
    },
    {
      name: 'Rohan Wankhede',
      phone: '9422334455',
      photo_url: '/images/avatar2.jpg',
      notes: 'College student, stylish taper fade, spike hair styling',
      cycle_days: 25,
      secret_token: 'rohan_z6m8',
      last_visit_offset: -20, // 20 days ago -> UPCOMING in 5 days
      total_visits: 0,
      created_offset: -20
    },
    {
      name: 'Vikas Joshi',
      phone: '9823998877',
      photo_url: '/images/avatar3.jpg',
      notes: 'Senior gentleman, gentle scissor haircut, mint head massage, gentle neck stretch',
      cycle_days: 25,
      secret_token: 'vikas_e7y5',
      last_visit_offset: -25, // Exactly 25 days ago -> DUE TODAY!
      total_visits: 4, // 4 visits done -> 5th visit is HALF PRICE!
      created_offset: -130
    }
  ];

  const customerIdMap = {};

  for (const c of customersList) {
    const lastVisitDate = getDateStr(c.last_visit_offset);
    const createdDate = `${getDateStr(c.created_offset)} 10:00:00`;
    const res = insertCustomer.run(
      c.name,
      c.phone,
      c.photo_url,
      c.notes,
      c.cycle_days,
      c.secret_token,
      lastVisitDate,
      c.total_visits,
      createdDate
    );
    customerIdMap[c.name] = res.lastInsertRowid;
  }
  console.log(`✓ Inserted ${customersList.length} customers with real due & loyalty states`);

  // 3. Seed Past Visits for realistic visit history
  const insertVisit = db.prepare(`
    INSERT INTO visits (customer_id, visit_date, services, total_amount, discount_applied, loyalty_reward_applied, payment_mode, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Rahul Sharma past visits
  insertVisit.run(
    customerIdMap['Rahul Sharma'],
    `${getDateStr(-50)} 11:30:00`,
    JSON.stringify(['Fade / Spikes / Styling Haircut', 'Beard Trim & Razor Line']),
    170,
    0,
    'NONE',
    'UPI',
    'Visit #1 - New customer, very happy with fade',
    `${getDateStr(-50)} 12:00:00`
  );
  insertVisit.run(
    customerIdMap['Rahul Sharma'],
    `${getDateStr(-25)} 12:00:00`,
    JSON.stringify(['Haircut + Beard Styling Combo', 'Almond Oil Head Massage']),
    210,
    0,
    'NONE',
    'Cash',
    'Visit #2 - Regular cut and massage',
    `${getDateStr(-25)} 12:35:00`
  );

  // Amit Verma past visits (4 visits)
  const amitOffsets = [-110, -85, -60, -29];
  for (let i = 0; i < amitOffsets.length; i++) {
    const isFree = (i === 2); // 3rd visit was Free cut!
    insertVisit.run(
      customerIdMap['Amit Verma'],
      `${getDateStr(amitOffsets[i])} 14:00:00`,
      JSON.stringify(['Regular Haircut', 'Beard Trim & Razor Line']),
      isFree ? 50 : 150,
      isFree ? 100 : 0,
      isFree ? 'FREE_CUT' : 'NONE',
      'UPI',
      isFree ? 'Visit #3: FREE Haircut loyalty reward redeemed!' : `Visit #${i + 1}`,
      `${getDateStr(amitOffsets[i])} 14:30:00`
    );
  }

  // Vikas Joshi past visits
  insertVisit.run(
    customerIdMap['Vikas Joshi'],
    `${getDateStr(-25)} 16:00:00`,
    JSON.stringify(['Regular Haircut', 'Mint Cool Head Massage']),
    200,
    0,
    'NONE',
    'Cash',
    'Visit #4',
    `${getDateStr(-25)} 16:30:00`
  );

  console.log('✓ Inserted past visits history');

  // 4. Seed Bookings
  const insertBooking = db.prepare(`
    INSERT INTO bookings (booking_code, customer_id, booking_date, slot_time, services, estimated_amount, status, source, is_viewed_by_owner, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const todayStr = getTodayString();
  const tomorrowStr = getDateStr(1);

  // Booking 1: Rahul Sharma booked for today 11:30 AM (NEW BOOKING notification!)
  insertBooking.run(
    'LAK-1024',
    customerIdMap['Rahul Sharma'],
    todayStr,
    '11:30',
    JSON.stringify(['Fade / Spikes / Styling Haircut', 'Beard Trim & Razor Line']),
    170,
    'booked',
    'customer',
    0, // Not viewed yet -> triggers "NEW" highlight and chime on owner screen!
    'Special note: 3rd visit Free Haircut due! Requested razor skin fade.',
    `${todayStr} 09:15:00`
  );

  // Booking 2: Kunal Raut booked for today 12:00 PM
  insertBooking.run(
    'LAK-4821',
    customerIdMap['Kunal Raut'],
    todayStr,
    '12:00',
    JSON.stringify(['Haircut + Beard Styling Combo']),
    130,
    'booked',
    'customer',
    1,
    'Customer booked online',
    `${todayStr} 08:30:00`
  );

  // Booking 3: Walk-in booked earlier today 10:00 AM (marked done)
  insertBooking.run(
    'LAK-9032',
    customerIdMap['Gaurav Patle'],
    todayStr,
    '10:00',
    JSON.stringify(['Regular Haircut']),
    100,
    'done',
    'walk_in',
    1,
    'Walk-in morning slot completed',
    `${todayStr} 10:00:00`
  );

  // Booking 4: Amit Verma booked for tomorrow 11:00 AM
  insertBooking.run(
    'LAK-6712',
    customerIdMap['Amit Verma'],
    tomorrowStr,
    '11:00',
    JSON.stringify(['Regular Haircut', 'Beard Trim & Razor Line']),
    150,
    'booked',
    'customer',
    0, // NEW!
    '5th visit 50% OFF due!',
    `${todayStr} 10:45:00`
  );

  console.log('✓ Inserted realistic bookings (including NEW unread booking)');

  // 5. Seed sample expenses for today
  const insertExpense = db.prepare(`
    INSERT INTO expenses (expense_date, category, amount, notes, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  insertExpense.run(todayStr, 'Blades & Razors', 120, 'Pack of 50 SuperMax Platinum blades', `${todayStr} 10:15:00`);
  insertExpense.run(todayStr, 'Tea & Refreshments', 50, 'Morning tea & biscuits for 2 barbers', `${todayStr} 11:00:00`);
  insertExpense.run(todayStr, 'D-Tan & Creams', 280, 'Raaga professional D-tan pack jar', `${todayStr} 13:00:00`);

  console.log('✓ Inserted daily expenses');
  console.log('--- Lakshya Mens Parlour database seeded successfully! ---');
}

if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };
