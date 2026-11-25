const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'lakshya.db');
const db = new Database(dbPath);

// Enable WAL mode for high performance and concurrent reads
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      photo_url TEXT,
      notes TEXT,
      cycle_days INTEGER DEFAULT 25,
      secret_token TEXT UNIQUE NOT NULL,
      last_visit_date TEXT,
      total_visits INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      name_hi TEXT,
      category TEXT DEFAULT 'Hair',
      price REAL NOT NULL,
      duration_mins INTEGER DEFAULT 30,
      description TEXT,
      image_url TEXT,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      visit_date TEXT NOT NULL,
      services TEXT NOT NULL,
      total_amount REAL NOT NULL,
      discount_applied REAL DEFAULT 0,
      loyalty_reward_applied TEXT DEFAULT 'NONE',
      payment_mode TEXT DEFAULT 'Cash',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_code TEXT UNIQUE NOT NULL,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      booking_date TEXT NOT NULL,
      slot_time TEXT NOT NULL,
      services TEXT NOT NULL,
      estimated_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'booked', -- booked, done, cancelled, no_show
      source TEXT DEFAULT 'customer', -- customer, owner_phone, walk_in
      is_viewed_by_owner INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_date TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
    CREATE INDEX IF NOT EXISTS idx_customers_token ON customers(secret_token);
    CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(booking_date, slot_time);
    CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id);
    CREATE INDEX IF NOT EXISTS idx_visits_customer ON visits(customer_id);
  `);

  try {
    db.exec('ALTER TABLE services ADD COLUMN image_url TEXT');
  } catch(e) {}

  // Default settings
  const defaultSettings = {
    owner_pin: '1234',
    shop_name: 'Lakshya Mens Parlour',
    shop_name_hi: 'लक्ष्य मेन्स पार्लर',
    shop_tagline: 'Precision Barbering & Grooming for Nagpur Gentlemen',
    shop_address: 'Shop No. 4, Rajendra Nagar Main Road, Near Square, Nagpur, Maharashtra',
    shop_phone: '9823012345',
    shop_maps_url: 'https://maps.google.com/?q=Rajendra+Nagar+Nagpur',
    opening_time: '10:00',
    closing_time: '20:00',
    slot_duration: '30',
    capacity_per_slot: '2',
    weekly_off: 'Tuesday',
    loyalty_free_visit: '3',
    loyalty_half_visit: '5',
    reminder_template: "Hi {name} bhai! It's time for your regular haircut at Lakshya Mens Parlour, Rajendra Nagar. Book your favorite slot in 1-click here: {link}",
    active_offer: '🔥 Special Combo: Haircut + Beard Styling + Almond Head Massage @ only ₹220 (Save ₹40)!',
    blocked_dates: '[]',
    blocked_slots: '{}'
  };

  const getStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const setStmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');

  for (const [key, value] of Object.entries(defaultSettings)) {
    setStmt.run(key, value);
  }
}

// Helpers
function getSetting(key, defaultValue = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : defaultValue;
}

function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

function updateSetting(key, value) {
  return db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').run(key, value, value);
}

// Today date string in YYYY-MM-DD
function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Calculate days between two YYYY-MM-DD strings
function getDaysDiff(dateStr1, dateStr2) {
  const d1 = new Date(dateStr1);
  const d2 = new Date(dateStr2);
  const diffTime = d2.getTime() - d1.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

// Calculate due date & status for a customer
function calculateDueInfo(customer, todayStr = getTodayString()) {
  const baseDate = customer.last_visit_date || (customer.created_at ? customer.created_at.split(' ')[0] : todayStr);
  const cycleDays = customer.cycle_days || 25;

  const base = new Date(baseDate);
  const due = new Date(base);
  due.setDate(due.getDate() + cycleDays);

  const dueYear = due.getFullYear();
  const dueMonth = String(due.getMonth() + 1).padStart(2, '0');
  const dueDay = String(due.getDate()).padStart(2, '0');
  const dueDateStr = `${dueYear}-${dueMonth}-${dueDay}`;

  const diffDays = getDaysDiff(todayStr, dueDateStr);
  // diffDays > 0: due in future (diffDays remaining)
  // diffDays === 0: due today!
  // diffDays < 0: overdue by abs(diffDays)

  let status = 'upcoming';
  let daysOverdue = 0;
  let daysRemaining = diffDays;

  if (diffDays === 0) {
    status = 'due_today';
  } else if (diffDays < 0) {
    status = 'overdue';
    daysOverdue = Math.abs(diffDays);
    daysRemaining = 0;
  }

  return {
    baseDate,
    cycleDays,
    dueDate: dueDateStr,
    status,
    daysOverdue,
    daysRemaining
  };
}

// Loyalty rewards calculator
function getLoyaltyRewardInfo(totalVisits, settings = null) {
  const freeAt = parseInt((settings && settings.loyalty_free_visit) || getSetting('loyalty_free_visit', '3'), 10);
  const halfAt = parseInt((settings && settings.loyalty_half_visit) || getSetting('loyalty_half_visit', '5'), 10);
  const cycleSize = Math.max(freeAt, halfAt);

  // Next visit index within the current cycle (1 to cycleSize)
  const currentInCycle = (totalVisits % cycleSize);
  const nextVisitInCycle = currentInCycle + 1;

  let reward = null;
  let badge = null;
  let badgeColor = null;
  let description = '';
  let progressText = '';

  if (nextVisitInCycle === freeAt) {
    reward = 'FREE_CUT';
    badge = 'FREE CUT';
    badgeColor = 'gold';
    description = `Visit #${totalVisits + 1} (${freeAt}rd visit): Haircut is 100% FREE!`;
    progressText = `${currentInCycle} of ${freeAt} visits done – Your next haircut is FREE! 🎁`;
  } else if (nextVisitInCycle === halfAt) {
    reward = 'HALF_PRICE';
    badge = 'HALF PRICE';
    badgeColor = 'amber';
    description = `Visit #${totalVisits + 1} (${halfAt}th visit): 50% OFF on your grooming bill!`;
    progressText = `${currentInCycle} of ${halfAt} visits done – Your next haircut is 50% OFF! 🏷️`;
  } else if (nextVisitInCycle < freeAt) {
    progressText = `${currentInCycle} of ${freeAt} visits done towards your FREE Haircut ✂️`;
  } else {
    progressText = `${currentInCycle} of ${halfAt} visits done towards your 50% OFF Cut ✨`;
  }

  return {
    totalVisits,
    nextVisitInCycle,
    cycleSize,
    reward,
    badge,
    badgeColor,
    description,
    progressText,
    isRewardDue: reward !== null
  };
}

// Generate random booking code
function generateBookingCode() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = 'LAK-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Generate unique secret token for customer personal link
function generateCustomerToken(name = 'cust') {
  const clean = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'c';
  const rand = Math.random().toString(36).substring(2, 8);
  return `${clean}_${rand}`;
}

initSchema();

module.exports = {
  db,
  initSchema,
  getSetting,
  getAllSettings,
  updateSetting,
  getTodayString,
  getDaysDiff,
  calculateDueInfo,
  getLoyaltyRewardInfo,
  generateBookingCode,
  generateCustomerToken
};
