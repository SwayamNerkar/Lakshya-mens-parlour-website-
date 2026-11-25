const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const {
  db,
  getSetting,
  getAllSettings,
  updateSetting,
  getTodayString,
  getDaysDiff,
  calculateDueInfo,
  getLoyaltyRewardInfo,
  generateBookingCode,
  generateCustomerToken
} = require('./db/index');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Upload setup
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `cust_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Auto-seed if database is fresh
try {
  const svcCount = db.prepare('SELECT COUNT(*) as count FROM services').get().count;
  if (svcCount === 0) {
    const { seedDatabase } = require('./db/seed');
    console.log('Fresh database detected. Seeding initial salon services & sample data...');
    seedDatabase();
  }
} catch(e) {
  console.error('Error during auto-seed check:', e);
}

// Simple Auth Check Middleware for Owner Routes
function checkAuth(req, res, next) {
  const authHeader = req.headers['x-owner-pin'] || req.headers['authorization'];
  const storedPin = getSetting('owner_pin', '1234');
  
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '').trim();
    if (token === storedPin) {
      return next();
    }
  }
  return res.status(401).json({ error: 'Unauthorized: Galat PIN ya session expire ho gaya' });
}

// -------------------------------------------------------------
// 1. AUTH API
// -------------------------------------------------------------
app.post('/api/auth/login', (req, res) => {
  const { pin } = req.body;
  const storedPin = getSetting('owner_pin', '1234');
  if (pin && String(pin).trim() === storedPin) {
    return res.json({ success: true, message: 'Welcome to Lakshya Mens Parlour!' });
  }
  return res.status(401).json({ success: false, error: 'Galat PIN darj kiya! Kripya sahi PIN dalein.' });
});

app.post('/api/auth/change-pin', checkAuth, (req, res) => {
  const { currentPin, newPin } = req.body;
  const storedPin = getSetting('owner_pin', '1234');
  if (String(currentPin).trim() !== storedPin) {
    return res.status(400).json({ error: 'Purana PIN galat hai' });
  }
  if (!newPin || String(newPin).trim().length < 4) {
    return res.status(400).json({ error: 'Naya PIN kam se kam 4 anko ka hona chahiye' });
  }
  updateSetting('owner_pin', String(newPin).trim());
  res.json({ success: true, message: 'PIN safaltapoorvak badal diya gaya!' });
});

// -------------------------------------------------------------
// 2. PUBLIC & CUSTOMER PERSONAL PORTAL APIS (/c/:token)
// -------------------------------------------------------------
app.get('/api/c/:token', (req, res) => {
  const { token } = req.params;
  const customer = db.prepare('SELECT * FROM customers WHERE secret_token = ?').get(token);
  if (!customer) {
    return res.status(404).json({ error: 'Customer personal link not found or invalid' });
  }

  const allSettings = getAllSettings();
  const todayStr = getTodayString();
  const loyalty = getLoyaltyRewardInfo(customer.total_visits, allSettings);
  const dueInfo = calculateDueInfo(customer, todayStr);

  // Active bookings for this customer
  const activeBookings = db.prepare(`
    SELECT * FROM bookings 
    WHERE customer_id = ? AND booking_date >= ? AND status = 'booked'
    ORDER BY booking_date ASC, slot_time ASC
  `).all(customer.id, todayStr);

  // Parse services JSON
  const parsedActiveBookings = activeBookings.map(b => ({
    ...b,
    services: JSON.parse(b.services || '[]')
  }));

  // Services list
  const services = db.prepare('SELECT * FROM services WHERE is_active = 1 ORDER BY sort_order ASC').all();

  res.json({
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      photo_url: customer.photo_url || '/images/avatar1.jpg',
      notes: customer.notes,
      total_visits: customer.total_visits,
      last_visit_date: customer.last_visit_date,
      loyalty,
      dueInfo,
      secret_token: customer.secret_token
    },
    shop: {
      name: allSettings.shop_name,
      name_hi: allSettings.shop_name_hi,
      tagline: allSettings.shop_tagline,
      address: allSettings.shop_address,
      phone: allSettings.shop_phone,
      maps_url: allSettings.shop_maps_url,
      opening_time: allSettings.opening_time,
      closing_time: allSettings.closing_time,
      slot_duration: allSettings.slot_duration,
      weekly_off: allSettings.weekly_off,
      active_offer: allSettings.active_offer
    },
    services,
    activeBookings: parsedActiveBookings
  });
});

// Helper for generating available slots
function getAvailableSlots(targetDate) {
  const allSettings = getAllSettings();
  const capacity = parseInt(allSettings.capacity_per_slot || '2', 10);
  const slotDuration = parseInt(allSettings.slot_duration || '30', 10);
  const openTime = allSettings.opening_time || '10:00';
  const closeTime = allSettings.closing_time || '20:00';
  const weeklyOff = allSettings.weekly_off || 'Tuesday';

  const targetObj = new Date(targetDate + 'T00:00:00');
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayNames[targetObj.getDay()];

  if (weeklyOff.toLowerCase() === dayName.toLowerCase()) {
    return {
      isClosed: true,
      reason: `Shop is closed on ${weeklyOff}s (Haftewaar Chhutti)`,
      slots: [],
      capacity,
      dayName,
      date: targetDate
    };
  }

  let blockedDates = [];
  try { blockedDates = JSON.parse(allSettings.blocked_dates || '[]'); } catch(e){}
  if (blockedDates.includes(targetDate)) {
    return {
      isClosed: true,
      reason: 'Shop is closed on this day for maintenance / holiday',
      slots: [],
      capacity,
      dayName,
      date: targetDate
    };
  }

  const slots = [];
  const [openHour, openMin] = openTime.split(':').map(Number);
  const [closeHour, closeMin] = closeTime.split(':').map(Number);

  let currentMin = openHour * 60 + openMin;
  const endMin = closeHour * 60 + closeMin;

  const bookedCounts = {};
  const rows = db.prepare(`
    SELECT slot_time, COUNT(*) as count 
    FROM bookings 
    WHERE booking_date = ? AND status = 'booked'
    GROUP BY slot_time
  `).all(targetDate);

  for (const r of rows) {
    bookedCounts[r.slot_time] = r.count;
  }

  let blockedSlots = {};
  try { blockedSlots = JSON.parse(allSettings.blocked_slots || '{}'); } catch(e){}
  const dateBlockedSlots = blockedSlots[targetDate] || [];

  const todayStr = getTodayString();
  const now = new Date();
  const currentTotalMin = now.getHours() * 60 + now.getMinutes();

  while (currentMin < endMin) {
    const h = Math.floor(currentMin / 60);
    const m = currentMin % 60;
    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 || 12;
    const displayTime = `${displayH}:${String(m).padStart(2, '0')} ${ampm}`;

    const bookedCount = bookedCounts[timeStr] || 0;
    const isPast = (targetDate === todayStr && currentMin <= currentTotalMin + 15);
    const isManuallyBlocked = dateBlockedSlots.includes(timeStr);
    const isFull = bookedCount >= capacity;
    const availableSpots = Math.max(0, capacity - bookedCount);

    slots.push({
      time: timeStr,
      displayTime,
      capacity,
      bookedCount,
      availableSpots,
      isAvailable: !isPast && !isManuallyBlocked && !isFull,
      status: isPast ? 'past' : (isManuallyBlocked ? 'blocked' : (isFull ? 'full' : 'available'))
    });

    currentMin += slotDuration;
  }

  return {
    date: targetDate,
    dayName,
    capacity,
    slots,
    isClosed: false
  };
}

// -------------------------------------------------------------
// PUBLIC WEBSITE APIS (FRONT PAGE)
// -------------------------------------------------------------
// 1. Public Salon Info (Banner, addresses, services with photos)
app.get('/api/public/info', (req, res) => {
  const allSettings = getAllSettings();
  const services = db.prepare('SELECT * FROM services WHERE is_active = 1 ORDER BY sort_order ASC').all();

  res.json({
    shop: {
      name: allSettings.shop_name,
      name_hi: allSettings.shop_name_hi,
      tagline: allSettings.shop_tagline,
      address: allSettings.shop_address,
      phone: allSettings.shop_phone,
      maps_url: allSettings.shop_maps_url,
      opening_time: allSettings.opening_time,
      closing_time: allSettings.closing_time,
      slot_duration: allSettings.slot_duration,
      weekly_off: allSettings.weekly_off,
      active_offer: allSettings.active_offer,
      capacity_per_slot: allSettings.capacity_per_slot || '2'
    },
    services
  });
});

// 2. Public Available Slots (for front page booking)
app.get('/api/public/slots', (req, res) => {
  const { date } = req.query;
  const targetDate = date || getTodayString();
  const result = getAvailableSlots(targetDate);
  res.json(result);
});

// 3. Public Customer Lookup by Phone
app.post('/api/public/lookup-customer', (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number required' });

  let cleanPhone = phone.replace(/[^0-9]/g, '');
  if (cleanPhone.length > 10 && cleanPhone.startsWith('91')) cleanPhone = cleanPhone.slice(2);
  if (cleanPhone.length > 10 && cleanPhone.startsWith('0')) cleanPhone = cleanPhone.slice(1);

  const customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(cleanPhone);
  if (!customer) {
    return res.json({ found: false });
  }

  const allSettings = getAllSettings();
  const loyalty = getLoyaltyRewardInfo(customer.total_visits, allSettings);
  const host = req.get('host');
  const baseUrl = `${req.protocol}://${host}`;
  const personalLink = `${baseUrl}/c/${customer.secret_token}`;

  res.json({
    found: true,
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      total_visits: customer.total_visits,
      photo_url: customer.photo_url || '/images/avatar1.jpg',
      loyalty,
      secret_token: customer.secret_token,
      personalLink
    },
    loyalty,
    personalLink
  });
});

// 4. Public Direct Slot Booking
app.post('/api/public/book', (req, res) => {
  const { name, phone, date, slot_time, services, notes } = req.body;

  if (!phone || !date || !slot_time) {
    return res.status(400).json({ error: 'Phone, date, and slot time are required' });
  }

  let cleanPhone = phone.replace(/[^0-9]/g, '');
  if (cleanPhone.length > 10 && cleanPhone.startsWith('91')) cleanPhone = cleanPhone.slice(2);
  if (cleanPhone.length > 10 && cleanPhone.startsWith('0')) cleanPhone = cleanPhone.slice(1);

  if (cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone)) {
    return res.status(400).json({ error: 'Kripya sahi 10-digit Indian mobile number dalein' });
  }

  // Find or create customer
  let customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(cleanPhone);
  if (!customer) {
    const custName = (name && name.trim()) || 'Gentleman';
    const secretToken = generateCustomerToken(custName);
    const insertCust = db.prepare(`
      INSERT INTO customers (name, phone, photo_url, notes, cycle_days, secret_token, last_visit_date, total_visits)
      VALUES (?, ?, '/images/avatar1.jpg', '', 25, ?, NULL, 0)
    `);
    const custResult = insertCust.run(custName, cleanPhone, secretToken);
    customer = {
      id: custResult.lastInsertRowid,
      name: custName,
      phone: cleanPhone,
      secret_token: secretToken,
      total_visits: 0
    };
  } else if (name && name.trim() && customer.name === 'Gentleman') {
    db.prepare('UPDATE customers SET name = ? WHERE id = ?').run(name.trim(), customer.id);
    customer.name = name.trim();
  }

  // Check slot capacity
  const allSettings = getAllSettings();
  const capacity = parseInt(allSettings.capacity_per_slot || '2', 10);
  const countRow = db.prepare(`
    SELECT COUNT(*) as count FROM bookings 
    WHERE booking_date = ? AND slot_time = ? AND status = 'booked'
  `).get(date, slot_time);

  if (countRow.count >= capacity) {
    return res.status(400).json({ error: 'Ye slot abhi-abhi full ho gaya! Kripya doosra time chunein.' });
  }

  let selectedServices = [];
  try {
    selectedServices = Array.isArray(services) ? services : JSON.parse(services || '[]');
  } catch(e) {
    selectedServices = [services];
  }

  let totalAmount = 0;
  if (selectedServices.length > 0) {
    const placeholders = selectedServices.map(() => '?').join(',');
    const svcRows = db.prepare(`SELECT price FROM services WHERE name IN (${placeholders})`).all(...selectedServices);
    totalAmount = svcRows.reduce((sum, s) => sum + s.price, 0);
  }

  const bookingCode = generateBookingCode();
  const insertBooking = db.prepare(`
    INSERT INTO bookings (
      booking_code, customer_id, booking_date, slot_time, services, estimated_amount, status, source, is_viewed_by_owner, notes
    ) VALUES (?, ?, ?, ?, ?, ?, 'booked', 'customer', 0, ?)
  `);

  const result = insertBooking.run(
    bookingCode,
    customer.id,
    date,
    slot_time,
    JSON.stringify(selectedServices),
    totalAmount,
    notes || 'Online booking via website'
  );

  const host = req.get('host');
  const baseUrl = `${req.protocol}://${host}`;
  const personalLink = `${baseUrl}/c/${customer.secret_token}`;

  res.json({
    success: true,
    bookingId: result.lastInsertRowid,
    bookingCode,
    date,
    slot_time,
    customerName: customer.name,
    customerPhone: customer.phone,
    personalLink,
    services: selectedServices,
    estimatedAmount: totalAmount,
    message: 'Aapka slot book ho chuka hai! Lakshya Mens Parlour me aapka intezar rahega.'
  });
});

// Slot endpoint for customer secret token
app.get('/api/c/:token/slots', (req, res) => {
  const { token } = req.params;
  const { date } = req.query;
  const customer = db.prepare('SELECT id FROM customers WHERE secret_token = ?').get(token);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const targetDate = date || getTodayString();
  const result = getAvailableSlots(targetDate);
  res.json(result);
});

// Customer creates booking
app.post('/api/c/:token/book', (req, res) => {
  const { token } = req.params;
  const { date, slot_time, services, notes } = req.body;
  const customer = db.prepare('SELECT * FROM customers WHERE secret_token = ?').get(token);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  if (!date || !slot_time) {
    return res.status(400).json({ error: 'Date and slot time are required' });
  }

  const allSettings = getAllSettings();
  const capacity = parseInt(allSettings.capacity_per_slot || '2', 10);

  // Check slot capacity
  const countRow = db.prepare(`
    SELECT COUNT(*) as count FROM bookings 
    WHERE booking_date = ? AND slot_time = ? AND status = 'booked'
  `).get(date, slot_time);

  if (countRow.count >= capacity) {
    return res.status(400).json({ error: 'Ye slot abhi-abhi full ho gaya! Kripya doosra time chunein.' });
  }

  // Calculate estimated amount
  let selectedServices = [];
  try {
    selectedServices = Array.isArray(services) ? services : JSON.parse(services || '[]');
  } catch(e) {
    selectedServices = [services];
  }

  let totalAmount = 0;
  if (selectedServices.length > 0) {
    const placeholders = selectedServices.map(() => '?').join(',');
    const svcRows = db.prepare(`SELECT price FROM services WHERE name IN (${placeholders})`).all(...selectedServices);
    totalAmount = svcRows.reduce((sum, s) => sum + s.price, 0);
  }

  const bookingCode = generateBookingCode();
  const insertBooking = db.prepare(`
    INSERT INTO bookings (
      booking_code, customer_id, booking_date, slot_time, services, estimated_amount, status, source, is_viewed_by_owner, notes
    ) VALUES (?, ?, ?, ?, ?, ?, 'booked', 'customer', 0, ?)
  `);

  const result = insertBooking.run(
    bookingCode,
    customer.id,
    date,
    slot_time,
    JSON.stringify(selectedServices),
    totalAmount,
    notes || 'Online booking via customer link'
  );

  res.json({
    success: true,
    bookingId: result.lastInsertRowid,
    bookingCode,
    date,
    slot_time,
    customerName: customer.name,
    services: selectedServices,
    estimatedAmount: totalAmount,
    message: 'Aapka slot book ho chuka hai! Dhanyawaad.'
  });
});

// Customer cancels booking
app.post('/api/c/:token/cancel-booking', (req, res) => {
  const { token } = req.params;
  const { bookingId, bookingCode } = req.body;
  const customer = db.prepare('SELECT id FROM customers WHERE secret_token = ?').get(token);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const query = bookingId 
    ? 'UPDATE bookings SET status = "cancelled" WHERE id = ? AND customer_id = ?'
    : 'UPDATE bookings SET status = "cancelled" WHERE booking_code = ? AND customer_id = ?';
  const param = bookingId || bookingCode;

  const result = db.prepare(query).run(param, customer.id);
  if (result.changes > 0) {
    res.json({ success: true, message: 'Booking cancel ho gayi hai.' });
  } else {
    res.status(400).json({ error: 'Booking nahi mili ya already cancel ho chuki hai.' });
  }
});

// Customer reschedules booking
app.post('/api/c/:token/reschedule-booking', (req, res) => {
  const { token } = req.params;
  const { bookingId, newDate, newSlotTime } = req.body;
  const customer = db.prepare('SELECT id FROM customers WHERE secret_token = ?').get(token);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const allSettings = getAllSettings();
  const capacity = parseInt(allSettings.capacity_per_slot || '2', 10);

  // Check capacity in new slot
  const countRow = db.prepare(`
    SELECT COUNT(*) as count FROM bookings 
    WHERE booking_date = ? AND slot_time = ? AND status = 'booked' AND id != ?
  `).get(newDate, newSlotTime, bookingId);

  if (countRow.count >= capacity) {
    return res.status(400).json({ error: 'Chuna gaya naya slot full hai. Kripya doosra time chunein.' });
  }

  const result = db.prepare(`
    UPDATE bookings 
    SET booking_date = ?, slot_time = ?, is_viewed_by_owner = 0 
    WHERE id = ? AND customer_id = ?
  `).run(newDate, newSlotTime, bookingId, customer.id);

  if (result.changes > 0) {
    res.json({ success: true, message: 'Booking safaltapoorvak reschedule ho gayi!' });
  } else {
    res.status(400).json({ error: 'Booking reschedule nahi ho saki.' });
  }
});

// -------------------------------------------------------------
// 3. OWNER DASHBOARD & REAL-TIME AUTO-REFRESH APIS
// -------------------------------------------------------------

// Real-time polling endpoint (called every 10s by owner screen)
app.get('/api/owner/poll-status', checkAuth, (req, res) => {
  const todayStr = getTodayString();

  // Count unviewed new bookings
  const unreadRow = db.prepare(`
    SELECT COUNT(*) as count FROM bookings WHERE is_viewed_by_owner = 0
  `).get();

  // Get latest unread booking if any
  const latestUnread = db.prepare(`
    SELECT b.id, b.booking_code, b.booking_date, b.slot_time, b.created_at, c.name as customer_name, c.phone as customer_phone
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    WHERE b.is_viewed_by_owner = 0
    ORDER BY b.id DESC
    LIMIT 1
  `).get();

  // Count bookings for today
  const todayBookingsCount = db.prepare(`
    SELECT COUNT(*) as count FROM bookings WHERE booking_date = ? AND status = 'booked'
  `).get(todayStr).count;

  res.json({
    unreadBookingsCount: unreadRow.count,
    hasNew: unreadRow.count > 0,
    latestBooking: latestUnread || null,
    todayBookingsCount,
    serverTime: new Date().toISOString()
  });
});

// Mark unviewed bookings as viewed
app.post('/api/owner/mark-booking-viewed', checkAuth, (req, res) => {
  const { bookingId } = req.body;
  if (bookingId) {
    db.prepare('UPDATE bookings SET is_viewed_by_owner = 1 WHERE id = ?').run(bookingId);
  } else {
    db.prepare('UPDATE bookings SET is_viewed_by_owner = 1 WHERE is_viewed_by_owner = 0').run();
  }
  res.json({ success: true });
});

// Owner main dashboard data (Due lists, quick stats)
app.get('/api/owner/dashboard', checkAuth, (req, res) => {
  const todayStr = getTodayString();
  const allSettings = getAllSettings();
  const host = req.get('host');
  const protocol = req.protocol;
  const baseUrl = `${protocol}://${host}`;

  const customers = db.prepare('SELECT * FROM customers ORDER BY name ASC').all();

  const dueTodayList = [];
  const overdueList = [];
  const upcomingList = [];

  for (const c of customers) {
    const dueInfo = calculateDueInfo(c, todayStr);
    const loyalty = getLoyaltyRewardInfo(c.total_visits, allSettings);
    const personalLink = `${baseUrl}/c/${c.secret_token}`;

    // Reminder message formatted with settings template
    const template = allSettings.reminder_template || "Hi {name} bhai! It's time for your next haircut at Lakshya Mens Parlour. Book your slot here: {link}";
    const reminderMsg = template
      .replace(/{name}/g, c.name)
      .replace(/{days}/g, c.cycle_days)
      .replace(/{link}/g, personalLink)
      .replace(/{shop}/g, allSettings.shop_name);

    // Free WhatsApp link
    const cleanPhone = c.phone.replace(/[^0-9]/g, '');
    const waUrl = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(reminderMsg)}`;

    const item = {
      id: c.id,
      name: c.name,
      phone: c.phone,
      photo_url: c.photo_url || '/images/avatar1.jpg',
      notes: c.notes,
      cycle_days: c.cycle_days,
      secret_token: c.secret_token,
      personal_link: personalLink,
      whatsapp_url: waUrl,
      reminder_msg: reminderMsg,
      last_visit_date: c.last_visit_date,
      total_visits: c.total_visits,
      dueInfo,
      loyalty
    };

    if (dueInfo.status === 'due_today') {
      dueTodayList.push(item);
    } else if (dueInfo.status === 'overdue') {
      overdueList.push(item);
    } else {
      upcomingList.push(item);
    }
  }

  // Sort overdue by highest overdue days first
  overdueList.sort((a, b) => b.dueInfo.daysOverdue - a.dueInfo.daysOverdue);

  // Today stats
  const todayBookings = db.prepare(`
    SELECT b.*, c.name as customer_name, c.phone as customer_phone, c.photo_url as customer_photo, c.secret_token
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    WHERE b.booking_date = ?
    ORDER BY b.slot_time ASC
  `).all(todayStr);

  const parsedTodayBookings = todayBookings.map(b => ({
    ...b,
    services: JSON.parse(b.services || '[]')
  }));

  // Today income from visits
  const todayIncomeRow = db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as visits_count 
    FROM visits 
    WHERE substr(visit_date, 1, 10) = ?
  `).get(todayStr);

  // Unread bookings count
  const unreadCount = db.prepare('SELECT COUNT(*) as count FROM bookings WHERE is_viewed_by_owner = 0').get().count;

  res.json({
    todayStr,
    stats: {
      dueTodayCount: dueTodayList.length,
      overdueCount: overdueList.length,
      todayBookingsCount: parsedTodayBookings.filter(b => b.status === 'booked').length,
      todayCompletedCount: parsedTodayBookings.filter(b => b.status === 'done').length,
      todayIncome: todayIncomeRow.total,
      todayVisitsCount: todayIncomeRow.visits_count,
      unreadBookingsCount: unreadCount,
      totalCustomers: customers.length
    },
    dueTodayList,
    overdueList,
    todayBookings: parsedTodayBookings,
    settings: {
      shop_name: allSettings.shop_name,
      shop_name_hi: allSettings.shop_name_hi,
      capacity_per_slot: allSettings.capacity_per_slot,
      active_offer: allSettings.active_offer
    }
  });
});

// -------------------------------------------------------------
// 4. CUSTOMER MANAGEMENT APIS (CRUD & SEARCH)
// -------------------------------------------------------------

// List customers with search
app.get('/api/customers', checkAuth, (req, res) => {
  const { q } = req.query;
  const todayStr = getTodayString();
  const allSettings = getAllSettings();
  const host = req.get('host');
  const baseUrl = `${req.protocol}://${host}`;

  let sql = 'SELECT * FROM customers';
  let params = [];

  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    sql += ' WHERE name LIKE ? OR phone LIKE ?';
    params.push(term, term);
  }
  sql += ' ORDER BY name ASC';

  const rows = db.prepare(sql).all(...params);
  const result = rows.map(c => {
    const dueInfo = calculateDueInfo(c, todayStr);
    const loyalty = getLoyaltyRewardInfo(c.total_visits, allSettings);
    const personalLink = `${baseUrl}/c/${c.secret_token}`;

    const template = allSettings.reminder_template || "Hi {name} bhai! It's time for your next haircut at Lakshya Mens Parlour. Book your slot here: {link}";
    const reminderMsg = template
      .replace(/{name}/g, c.name)
      .replace(/{days}/g, c.cycle_days)
      .replace(/{link}/g, personalLink)
      .replace(/{shop}/g, allSettings.shop_name);

    return {
      ...c,
      photo_url: c.photo_url || '/images/avatar1.jpg',
      personal_link: personalLink,
      whatsapp_url: `https://wa.me/91${c.phone}?text=${encodeURIComponent(reminderMsg)}`,
      dueInfo,
      loyalty
    };
  });

  res.json(result);
});

// Get single customer details with full history
app.get('/api/customers/:id', checkAuth, (req, res) => {
  const { id } = req.params;
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const todayStr = getTodayString();
  const allSettings = getAllSettings();
  const host = req.get('host');
  const baseUrl = `${req.protocol}://${host}`;
  const dueInfo = calculateDueInfo(customer, todayStr);
  const loyalty = getLoyaltyRewardInfo(customer.total_visits, allSettings);
  const personalLink = `${baseUrl}/c/${customer.secret_token}`;

  // Visits history
  const visits = db.prepare(`
    SELECT * FROM visits WHERE customer_id = ? ORDER BY visit_date DESC
  `).all(id).map(v => ({
    ...v,
    services: JSON.parse(v.services || '[]')
  }));

  // Bookings history
  const bookings = db.prepare(`
    SELECT * FROM bookings WHERE customer_id = ? ORDER BY booking_date DESC, slot_time DESC
  `).all(id).map(b => ({
    ...b,
    services: JSON.parse(b.services || '[]')
  }));

  res.json({
    customer: {
      ...customer,
      photo_url: customer.photo_url || '/images/avatar1.jpg',
      personal_link: personalLink,
      whatsapp_url: `https://wa.me/91${customer.phone}?text=${encodeURIComponent("Hi " + customer.name + ", book slot: " + personalLink)}`,
      dueInfo,
      loyalty
    },
    visits,
    bookings
  });
});

// Add new customer
app.post('/api/customers', checkAuth, upload.single('photo'), (req, res) => {
  const { name, phone, notes, cycle_days, avatar_preset, mark_first_visit_today, first_service_name } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ error: 'Grahak ka naam aur mobile number zaroori hai' });
  }

  // Validate & clean Indian phone number (allow +91, 0 prefix, spaces, dashes)
  let cleanPhone = phone.replace(/[^0-9]/g, '');
  if (cleanPhone.length > 10 && cleanPhone.startsWith('91')) {
    cleanPhone = cleanPhone.slice(2);
  }
  if (cleanPhone.length > 10 && cleanPhone.startsWith('0')) {
    cleanPhone = cleanPhone.slice(1);
  }

  if (cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone)) {
    return res.status(400).json({ error: 'Kripya sahi 10-digit Indian mobile number darj karein (e.g. 9823012345)' });
  }

  // Check duplicate phone
  const existing = db.prepare('SELECT id, name FROM customers WHERE phone = ?').get(cleanPhone);
  if (existing) {
    return res.status(400).json({ error: `Ye mobile number pehle se maujood hai! Grahak: ${existing.name}` });
  }

  let photoUrl = '/images/avatar1.jpg';
  if (req.file) {
    photoUrl = `/uploads/${req.file.filename}`;
  } else if (avatar_preset) {
    try {
      const u = new URL(avatar_preset);
      photoUrl = u.pathname;
    } catch(e) {
      photoUrl = avatar_preset;
    }
  }

  const cycle = parseInt(cycle_days || '25', 10);
  const secretToken = generateCustomerToken(name);
  const todayStr = getTodayString();
  const isFirstVisit = (mark_first_visit_today === 'true' || mark_first_visit_today === true);

  const insert = db.prepare(`
    INSERT INTO customers (name, phone, photo_url, notes, cycle_days, secret_token, last_visit_date, total_visits)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = insert.run(
    name.trim(),
    cleanPhone,
    photoUrl,
    notes ? notes.trim() : '',
    cycle,
    secretToken,
    isFirstVisit ? todayStr : null,
    isFirstVisit ? 1 : 0
  );

  const newCustomerId = result.lastInsertRowid;

  // If first visit done today, record it in visits table
  if (isFirstVisit) {
    const svcName = first_service_name || 'Regular Haircut';
    const svcRow = db.prepare('SELECT price FROM services WHERE name = ?').get(svcName);
    const amount = svcRow ? svcRow.price : 100;
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    db.prepare(`
      INSERT INTO visits (customer_id, visit_date, services, total_amount, discount_applied, loyalty_reward_applied, payment_mode, notes)
      VALUES (?, ?, ?, ?, 0, 'NONE', 'Cash', 'First visit on registration')
    `).run(
      newCustomerId,
      `${todayStr} ${timeStr}`,
      JSON.stringify([svcName]),
      amount
    );
  }

  const host = req.get('host');
  const baseUrl = `${req.protocol}://${host}`;
  const personalLink = `${baseUrl}/c/${secretToken}`;

  res.json({
    success: true,
    customerId: newCustomerId,
    secretToken,
    personalLink,
    name: name.trim(),
    phone: cleanPhone,
    message: isFirstVisit ? 'Naya grahak jud gaya aur pehla visit record ho gaya!' : 'Naya grahak safaltapoorvak jod diya gaya!'
  });
});

// Edit customer
app.put('/api/customers/:id', checkAuth, upload.single('photo'), (req, res) => {
  const { id } = req.params;
  const { name, phone, notes, cycle_days, avatar_preset } = req.body;

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  let cleanPhone = customer.phone;
  if (phone) {
    cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone)) {
      return res.status(400).json({ error: 'Kripya sahi 10-digit Indian mobile number darj karein' });
    }
    // Check duplicate if changed
    if (cleanPhone !== customer.phone) {
      const existing = db.prepare('SELECT id FROM customers WHERE phone = ? AND id != ?').get(cleanPhone, id);
      if (existing) {
        return res.status(400).json({ error: 'Ye mobile number doosre grahak ke paas hai' });
      }
    }
  }

  let photoUrl = customer.photo_url;
  if (req.file) {
    photoUrl = `/uploads/${req.file.filename}`;
  } else if (avatar_preset) {
    photoUrl = avatar_preset;
  }

  const cycle = cycle_days ? parseInt(cycle_days, 10) : customer.cycle_days;

  db.prepare(`
    UPDATE customers 
    SET name = ?, phone = ?, photo_url = ?, notes = ?, cycle_days = ?
    WHERE id = ?
  `).run(
    name ? name.trim() : customer.name,
    cleanPhone,
    photoUrl,
    notes !== undefined ? notes.trim() : customer.notes,
    cycle,
    id
  );

  res.json({ success: true, message: 'Grahak ki jankari update ho gayi!' });
});

// Delete customer
app.delete('/api/customers/:id', checkAuth, (req, res) => {
  const { id } = req.params;
  const result = db.prepare('DELETE FROM customers WHERE id = ?').run(id);
  if (result.changes > 0) {
    res.json({ success: true, message: 'Customer record hata diya gaya' });
  } else {
    res.status(404).json({ error: 'Customer not found' });
  }
});

// -------------------------------------------------------------
// 5. VISIT MARKING & LOYALTY REWARDS
// -------------------------------------------------------------
app.post('/api/visits', checkAuth, (req, res) => {
  const {
    customer_id,
    services,
    total_amount,
    discount_applied,
    loyalty_reward_applied,
    payment_mode,
    notes,
    booking_id
  } = req.body;

  if (!customer_id) return res.status(400).json({ error: 'Customer ID is required' });

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const now = new Date();
  const todayStr = getTodayString();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  const fullDateTime = `${todayStr} ${timeStr}`;

  let parsedServices = [];
  try {
    parsedServices = Array.isArray(services) ? services : JSON.parse(services || '[]');
  } catch(e) {
    parsedServices = [services];
  }

  const amount = parseFloat(total_amount) || 0;
  const discount = parseFloat(discount_applied) || 0;
  const rewardApplied = loyalty_reward_applied || 'NONE'; // FREE_CUT, HALF_PRICE, NONE
  const payMode = payment_mode || 'Cash';

  // Transaction: Record visit + Increment customer visits + Update last_visit_date + Mark booking done
  const recordVisitTx = db.transaction(() => {
    // 1. Insert visit
    const visitRes = db.prepare(`
      INSERT INTO visits (
        customer_id, visit_date, services, total_amount, discount_applied, loyalty_reward_applied, payment_mode, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      customer.id,
      fullDateTime,
      JSON.stringify(parsedServices),
      amount,
      discount,
      rewardApplied,
      payMode,
      notes || ''
    );

    // 2. Update customer visit count & last visit date
    const newTotalVisits = customer.total_visits + 1;
    db.prepare(`
      UPDATE customers 
      SET total_visits = ?, last_visit_date = ? 
      WHERE id = ?
    `).run(newTotalVisits, todayStr, customer.id);

    // 3. Mark booking done if provided
    if (booking_id) {
      db.prepare(`
        UPDATE bookings SET status = 'done', is_viewed_by_owner = 1 WHERE id = ?
      `).run(booking_id);
    }

    return { visitId: visitRes.lastInsertRowid, newTotalVisits };
  });

  const txResult = recordVisitTx();
  const allSettings = getAllSettings();
  const updatedLoyalty = getLoyaltyRewardInfo(txResult.newTotalVisits, allSettings);

  res.json({
    success: true,
    visitId: txResult.visitId,
    totalVisits: txResult.newTotalVisits,
    nextLoyaltyStatus: updatedLoyalty,
    message: 'Visit safaltapoorvak record ho gayi! Grahak ka hisaab update ho gaya.'
  });
});

// -------------------------------------------------------------
// 6. BOOKINGS MANAGEMENT APIS (OWNER)
// -------------------------------------------------------------

// List bookings with filter
app.get('/api/bookings', checkAuth, (req, res) => {
  const { date, filter } = req.query;
  const todayStr = getTodayString();
  const allSettings = getAllSettings();

  let sql = `
    SELECT b.*, c.name as customer_name, c.phone as customer_phone, c.photo_url as customer_photo, c.total_visits, c.secret_token
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
  `;
  const params = [];

  if (date) {
    sql += ' WHERE b.booking_date = ?';
    params.push(date);
  } else if (filter === 'today') {
    sql += ' WHERE b.booking_date = ?';
    params.push(todayStr);
  } else if (filter === 'upcoming') {
    sql += ' WHERE b.booking_date >= ? AND b.status = "booked"';
    params.push(todayStr);
  } else if (filter === 'past') {
    sql += ' WHERE b.booking_date < ? OR b.status != "booked"';
    params.push(todayStr);
  }

  sql += ' ORDER BY b.booking_date ASC, b.slot_time ASC';

  const rows = db.prepare(sql).all(...params);
  const bookings = rows.map(b => ({
    ...b,
    services: JSON.parse(b.services || '[]'),
    loyalty: getLoyaltyRewardInfo(b.total_visits, allSettings)
  }));

  res.json(bookings);
});

// Owner adds walk-in or phone booking
app.post('/api/bookings', checkAuth, (req, res) => {
  const { customer_id, booking_date, slot_time, services, source, notes } = req.body;

  if (!customer_id || !booking_date || !slot_time) {
    return res.status(400).json({ error: 'Customer, date, and slot time are required' });
  }

  const allSettings = getAllSettings();
  const capacity = parseInt(allSettings.capacity_per_slot || '2', 10);

  // Check capacity
  const countRow = db.prepare(`
    SELECT COUNT(*) as count FROM bookings 
    WHERE booking_date = ? AND slot_time = ? AND status = 'booked'
  `).get(booking_date, slot_time);

  if (countRow.count >= capacity) {
    return res.status(400).json({ error: `Ye slot full hai (Capacity: ${capacity} Barbers)` });
  }

  let selectedServices = [];
  try {
    selectedServices = Array.isArray(services) ? services : JSON.parse(services || '[]');
  } catch(e) {
    selectedServices = [services];
  }

  let totalAmount = 0;
  if (selectedServices.length > 0) {
    const placeholders = selectedServices.map(() => '?').join(',');
    const svcRows = db.prepare(`SELECT price FROM services WHERE name IN (${placeholders})`).all(...selectedServices);
    totalAmount = svcRows.reduce((sum, s) => sum + s.price, 0);
  }

  const bookingCode = generateBookingCode();
  const result = db.prepare(`
    INSERT INTO bookings (
      booking_code, customer_id, booking_date, slot_time, services, estimated_amount, status, source, is_viewed_by_owner, notes
    ) VALUES (?, ?, ?, ?, ?, ?, 'booked', ?, 1, ?)
  `).run(
    bookingCode,
    customer_id,
    booking_date,
    slot_time,
    JSON.stringify(selectedServices),
    totalAmount,
    source || 'owner_phone',
    notes || 'Owner booked'
  );

  res.json({
    success: true,
    bookingId: result.lastInsertRowid,
    bookingCode,
    message: 'Booking jod di gayi!'
  });
});

// Update booking status (done, cancelled, no_show)
app.put('/api/bookings/:id/status', checkAuth, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['booked', 'done', 'cancelled', 'no_show'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const result = db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, id);
  if (result.changes > 0) {
    res.json({ success: true, message: `Booking status '${status}' kar diya gaya` });
  } else {
    res.status(404).json({ error: 'Booking not found' });
  }
});

// Reschedule booking (Owner)
app.put('/api/bookings/:id/reschedule', checkAuth, (req, res) => {
  const { id } = req.params;
  const { newDate, newSlotTime } = req.body;
  const allSettings = getAllSettings();
  const capacity = parseInt(allSettings.capacity_per_slot || '2', 10);

  const countRow = db.prepare(`
    SELECT COUNT(*) as count FROM bookings 
    WHERE booking_date = ? AND slot_time = ? AND status = 'booked' AND id != ?
  `).get(newDate, newSlotTime, id);

  if (countRow.count >= capacity) {
    return res.status(400).json({ error: `Naya slot full hai (Capacity: ${capacity})` });
  }

  const result = db.prepare(`
    UPDATE bookings SET booking_date = ?, slot_time = ? WHERE id = ?
  `).run(newDate, newSlotTime, id);

  if (result.changes > 0) {
    res.json({ success: true, message: 'Booking reschedule ho gayi!' });
  } else {
    res.status(404).json({ error: 'Booking not found' });
  }
});

// -------------------------------------------------------------
// 7. SERVICES & PRICE LIST MANAGEMENT
// -------------------------------------------------------------
app.get('/api/services', (req, res) => {
  const rows = db.prepare('SELECT * FROM services ORDER BY sort_order ASC, id ASC').all();
  res.json(rows);
});

app.post('/api/services', checkAuth, (req, res) => {
  const { name, name_hi, category, price, duration_mins, description } = req.body;
  if (!name || price === undefined) {
    return res.status(400).json({ error: 'Name and price are required' });
  }

  const result = db.prepare(`
    INSERT INTO services (name, name_hi, category, price, duration_mins, description, is_active, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, 1, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM services))
  `).run(
    name.trim(),
    name_hi ? name_hi.trim() : '',
    category || 'Hair',
    parseFloat(price),
    parseInt(duration_mins || '30', 10),
    description || ''
  );

  res.json({ success: true, serviceId: result.lastInsertRowid, message: 'Service jod di gayi!' });
});

app.put('/api/services/:id', checkAuth, (req, res) => {
  const { id } = req.params;
  const { name, name_hi, category, price, duration_mins, description, is_active } = req.body;

  const result = db.prepare(`
    UPDATE services 
    SET name = ?, name_hi = ?, category = ?, price = ?, duration_mins = ?, description = ?, is_active = ?
    WHERE id = ?
  `).run(
    name,
    name_hi,
    category,
    parseFloat(price),
    parseInt(duration_mins, 10),
    description,
    is_active !== undefined ? is_active : 1,
    id
  );

  if (result.changes > 0) {
    res.json({ success: true, message: 'Service update ho gayi!' });
  } else {
    res.status(404).json({ error: 'Service not found' });
  }
});

app.delete('/api/services/:id', checkAuth, (req, res) => {
  const { id } = req.params;
  const result = db.prepare('DELETE FROM services WHERE id = ?').run(id);
  if (result.changes > 0) {
    res.json({ success: true, message: 'Service hata di gayi' });
  } else {
    res.status(404).json({ error: 'Service not found' });
  }
});

// -------------------------------------------------------------
// 8. HISAAB / KHATA: INCOME, EXPENSES, & ANALYTICS REPORTS
// -------------------------------------------------------------
app.get('/api/reports/summary', checkAuth, (req, res) => {
  const todayStr = getTodayString();
  const currentMonthPrefix = todayStr.substring(0, 7); // YYYY-MM

  // Today income & customers served
  const todayRow = db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) as income, COUNT(*) as customers_count 
    FROM visits 
    WHERE substr(visit_date, 1, 10) = ?
  `).get(todayStr);

  // Month income & customers served
  const monthRow = db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) as income, COUNT(*) as customers_count 
    FROM visits 
    WHERE substr(visit_date, 1, 7) = ?
  `).get(currentMonthPrefix);

  // Today expenses
  const todayExpRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE expense_date = ?
  `).get(todayStr);

  // Month expenses
  const monthExpRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE substr(expense_date, 1, 7) = ?
  `).get(currentMonthPrefix);

  // Payment mode breakdown this month
  const payModes = db.prepare(`
    SELECT payment_mode, COALESCE(SUM(total_amount), 0) as total, COUNT(*) as count 
    FROM visits 
    WHERE substr(visit_date, 1, 7) = ?
    GROUP BY payment_mode
  `).all(currentMonthPrefix);

  // Hourly distribution (busiest hours)
  const hourlyRows = db.prepare(`
    SELECT substr(slot_time, 1, 2) as hour, COUNT(*) as count 
    FROM bookings 
    WHERE status IN ('booked', 'done')
    GROUP BY hour 
    ORDER BY hour ASC
  `).all();

  // Top services performed
  const allVisits = db.prepare('SELECT services FROM visits').all();
  const serviceCounts = {};
  for (const v of allVisits) {
    try {
      const svcs = JSON.parse(v.services || '[]');
      for (const s of svcs) {
        serviceCounts[s] = (serviceCounts[s] || 0) + 1;
      }
    } catch(e) {}
  }
  const topServices = Object.entries(serviceCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  res.json({
    today: {
      date: todayStr,
      income: todayRow.income,
      customers: todayRow.customers_count,
      expenses: todayExpRow.total,
      netProfit: todayRow.income - todayExpRow.total
    },
    month: {
      monthStr: currentMonthPrefix,
      income: monthRow.income,
      customers: monthRow.customers_count,
      expenses: monthExpRow.total,
      netProfit: monthRow.income - monthExpRow.total
    },
    paymentModes: payModes,
    hourlyDistribution: hourlyRows,
    topServices
  });
});

// Expenses CRUD
app.get('/api/expenses', checkAuth, (req, res) => {
  const { date } = req.query;
  const targetDate = date || getTodayString();
  const rows = db.prepare('SELECT * FROM expenses WHERE expense_date = ? ORDER BY id DESC').all(targetDate);
  res.json(rows);
});

app.post('/api/expenses', checkAuth, (req, res) => {
  const { expense_date, category, amount, notes } = req.body;
  if (!category || !amount) {
    return res.status(400).json({ error: 'Category and amount are required' });
  }

  const date = expense_date || getTodayString();
  const result = db.prepare(`
    INSERT INTO expenses (expense_date, category, amount, notes) VALUES (?, ?, ?, ?)
  `).run(date, category, parseFloat(amount), notes || '');

  res.json({ success: true, expenseId: result.lastInsertRowid, message: 'Kharcha darj ho gaya!' });
});

app.delete('/api/expenses/:id', checkAuth, (req, res) => {
  const { id } = req.params;
  const result = db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
  if (result.changes > 0) {
    res.json({ success: true, message: 'Kharcha record hata diya gaya' });
  } else {
    res.status(404).json({ error: 'Expense not found' });
  }
});

// -------------------------------------------------------------
// 9. SETTINGS APIS
// -------------------------------------------------------------
app.get('/api/settings', checkAuth, (req, res) => {
  const settings = getAllSettings();
  delete settings.owner_pin; // Never expose pin in GET
  res.json(settings);
});

app.put('/api/settings', checkAuth, (req, res) => {
  const allowedKeys = [
    'shop_name', 'shop_name_hi', 'shop_tagline', 'shop_address', 'shop_phone',
    'shop_maps_url', 'opening_time', 'closing_time', 'slot_duration',
    'capacity_per_slot', 'weekly_off', 'loyalty_free_visit', 'loyalty_half_visit',
    'reminder_template', 'active_offer', 'blocked_dates', 'blocked_slots'
  ];

  for (const [key, val] of Object.entries(req.body)) {
    if (allowedKeys.includes(key)) {
      updateSetting(key, typeof val === 'object' ? JSON.stringify(val) : String(val));
    }
  }

  res.json({ success: true, message: 'Settings safaltapoorvak save ho gayi!' });
});

// -------------------------------------------------------------
// 10. EXPORT & BACKUP APIS (CSV & SQLITE DB)
// -------------------------------------------------------------
app.get('/api/export/customers.csv', checkAuth, (req, res) => {
  const customers = db.prepare('SELECT id, name, phone, cycle_days, total_visits, last_visit_date, notes, created_at FROM customers ORDER BY name ASC').all();
  
  let csv = 'ID,Name,Phone,Cycle Days,Total Visits,Last Visit Date,Notes,Created At\n';
  for (const c of customers) {
    const safeName = `"${(c.name || '').replace(/"/g, '""')}"`;
    const safeNotes = `"${(c.notes || '').replace(/"/g, '""')}"`;
    csv += `${c.id},${safeName},${c.phone},${c.cycle_days},${c.total_visits},${c.last_visit_date || ''},${safeNotes},${c.created_at}\n`;
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="lakshya_customers_${getTodayString()}.csv"`);
  res.send(csv);
});

app.get('/api/export/bookings.csv', checkAuth, (req, res) => {
  const bookings = db.prepare(`
    SELECT b.booking_code, c.name as customer_name, c.phone as customer_phone, b.booking_date, b.slot_time, b.services, b.estimated_amount, b.status, b.created_at
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    ORDER BY b.booking_date DESC, b.slot_time DESC
  `).all();

  let csv = 'Booking Code,Customer Name,Phone,Date,Time,Services,Amount,Status,Created At\n';
  for (const b of bookings) {
    const safeServices = `"${(b.services || '').replace(/"/g, '""')}"`;
    csv += `${b.booking_code},"${b.customer_name}",${b.customer_phone},${b.booking_date},${b.slot_time},${safeServices},${b.estimated_amount},${b.status},${b.created_at}\n`;
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="lakshya_bookings_${getTodayString()}.csv"`);
  res.send(csv);
});

app.get('/api/export/visits.csv', checkAuth, (req, res) => {
  const visits = db.prepare(`
    SELECT v.id, c.name as customer_name, c.phone, v.visit_date, v.services, v.total_amount, v.discount_applied, v.loyalty_reward_applied, v.payment_mode, v.notes
    FROM visits v
    JOIN customers c ON v.customer_id = c.id
    ORDER BY v.visit_date DESC
  `).all();

  let csv = 'Visit ID,Customer Name,Phone,Date & Time,Services,Total Amount,Discount,Loyalty Reward,Payment Mode,Notes\n';
  for (const v of visits) {
    const safeServices = `"${(v.services || '').replace(/"/g, '""')}"`;
    const safeNotes = `"${(v.notes || '').replace(/"/g, '""')}"`;
    csv += `${v.id},"${v.customer_name}",${v.phone},${v.visit_date},${safeServices},${v.total_amount},${v.discount_applied},${v.loyalty_reward_applied},${v.payment_mode},${safeNotes}\n`;
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="lakshya_visits_${getTodayString()}.csv"`);
  res.send(csv);
});

app.get('/api/export/backup.db', checkAuth, (req, res) => {
  const dbFile = path.join(__dirname, 'data', 'lakshya.db');
  if (fs.existsSync(dbFile)) {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="lakshya_salon_backup_${getTodayString()}.db"`);
    const stream = fs.createReadStream(dbFile);
    stream.pipe(res);
  } else {
    res.status(404).json({ error: 'Database file not found' });
  }
});

// -------------------------------------------------------------
// 11. FRONTEND PAGE ROUTING
// -------------------------------------------------------------
// Customer secret link route: /c/:token
app.get('/c/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'customer.html'), err => {
    if (err && !res.headersSent) res.status(500).send('Error loading page');
  });
});

// Owner portal fallback route for GET requests
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'), err => {
      if (err && !res.headersSent) next(err);
    });
  } else {
    res.status(404).json({ error: 'Endpoint not found' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  LAKSHYA MENS PARLOUR – CUSTOMER & BOOKING MANAGER  `);
  console.log(`  Rajendra Nagar, Nagpur (2 Barbers, 1 Calendar)      `);
  console.log(`  Server running on http://localhost:${PORT}          `);
  console.log(`  Owner Portal: http://localhost:${PORT}              `);
  console.log(`  Customer Link: http://localhost:${PORT}/c/rahul_m8x2`);
  console.log(`=======================================================`);
});
