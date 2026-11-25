# 💈 Lakshya Mens Parlour (लक्ष्य मेन्स पार्लर)
### Customer & Booking Manager — Mobile-First Web App for Men's Salons
**Rajendra Nagar, Nagpur, Maharashtra, India**

![Node.js](https://img.shields.io/badge/Node.js-v18+-68A063?style=flat&logo=node.js)
![Express](https://img.shields.io/badge/Express-5.x-000000?style=flat&logo=express)
![SQLite](https://img.shields.io/badge/SQLite-WAL%20Mode-003B57?style=flat&logo=sqlite)
![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-Dark%20Luxury-06B6D4?style=flat&logo=tailwind-css)
![Cost](https://img.shields.io/badge/Running%20Cost-100%25%20FREE-brightgreen?style=flat)
![Capacity](https://img.shields.io/badge/Barber%20Capacity-2%20Barbers%20(1%20Calendar)-F59E0B?style=flat)

---

## 📌 Project Overview

**Lakshya Mens Parlour – Customer & Booking Manager** is a complete, mobile-first, full-stack web application built specifically for neighborhood Indian men's salons and barbershops.

Designed with a **dark luxury carbon & amber gold theme**, the app serves a **dual purpose**:
1. **Public Salon Website (`/`)**: A consumer-facing showcase featuring high-res photos, dynamic rate list, haircut styles, loyalty rewards stamp club, customer reviews, and direct 30-minute online slot booking.
2. **Owner Management Portal (`/#owner`)**: A PIN-protected manager for the shop owner/barbers to manage due lists (*"Aaj aane wale"* & *"Late ho gaye"*), real-time booking alerts with audio chimes, customer khata directory, daily hisaab (income/expenses), and 1-click database backups.

> [!IMPORTANT]
> **100% Free to Run**: Zero paid WhatsApp API fees, zero SMS gateway costs, and no paid cloud databases. All reminders use pre-composed `wa.me` links and browser sharing; audio alerts use the in-browser Web Audio API; data is persisted locally in high-performance SQLite in WAL mode.

---

## 🌟 Key Features

### 1. 🌐 Public Luxury Salon Website
- **Grand Salon Branding**: Prominent bilingual typography: **LAKSHYA MENS PARLOUR (लक्ष्य मेन्स पार्लर)**.
- **Visual Rate Card with Photos**: 10 distinct grooming services with photos, duration, and prices in ₹ (Haircuts, Beard Styling, Ayurvedic Head Massage, Facials, Combos).
- **Haircut Style Gallery**: Showcase of skin fades, beard lineups, hot towel shaves, hydraulic salon chairs, and grooming tools.
- **VIP Loyalty Stamp Club**: Explains the *"Har 3rd Cut FREE, 5th Cut 50% OFF"* policy with an interactive **Grahak Phone Lookup** where customers enter their 10-digit number to inspect their loyalty stamps and personal link.
- **Direct 30-min Slot Booking**: Customers pick a date (today + next 7 days), choose an open 30-minute slot, select services, enter their name & phone, and receive an instant digital ticket pass with a booking code (`LAK-XXXX`).
- **Nagpur Reviews & Testimonials**: 5-star customer ratings from Rajendra Nagar & Nagpur locals.
- **Location & Google Maps**: One-tap directions and direct phone call triggers.

### 2. 💈 2 Barbers, 1 Common Calendar
- The salon employs 2 barbers who share a single appointment schedule.
- Each 30-minute time slot strictly enforces a **maximum capacity of 2 bookings**.
- Slots display real-time availability: `2 Open`, `1 Left`, or `Full` (greyed out to prevent overbooking).

### 3. 🎁 Automatic Loyalty Rewards
- By default, every **3rd visit earns a 100% FREE Haircut**, and every **5th visit earns 50% HALF PRICE DISCOUNT**.
- Big celebratory badges appear on the customer profile and booking ticket when a reward is due.
- Fully configurable in owner settings.

### 4. 📲 Customer Secret Personal Links (`/c/:token`)
- Customers **never need to create accounts or remember passwords**.
- Every customer receives a unique secret link (e.g. `http://localhost:3000/c/rahul_m8x2`).
- Greeting, loyalty stamps progress, price list, upcoming appointments, and 1-click cancellation/rescheduling.

### 5. 🔔 Real-Time Sound & Visual Alerts
- The owner dashboard polls the backend every 10 seconds.
- When an online booking arrives, a **Web Audio synthesizer chime** plays, the notification bell pulses with an unread badge, and an animated alert banner appears.

### 6. 📋 Due List & Khata (Home Screen)
- **Aaj Aane Wale (Due Today)**: Automatically detects customers whose `last_visit_date + cycle_days <= today`.
- **Late Ho Gaye (Overdue)**: Sorted by days overdue.
- **1-Click WhatsApp Reminder**: Opens pre-composed WhatsApp message via `https://wa.me/91...` containing their personal booking link (100% Free!).
- **Customer Khata Directory**: Search by name or phone, view total visits, haircut style notes, photo upload, and record visits with payment modes (Cash / UPI / Free Reward).

### 7. 💰 Daily Hisaab & Expenses Tracker
- Real-time income calculation from completed visits.
- Monthly revenue aggregation.
- Daily expense logging (Blades, Chai & Nashta, Creams, Electricity).
- **Busiest Hours Analytics**: Highlights peak salon hours.

### 8. 💾 1-Click Database Backup & CSV Exports
- Download **Grahak List CSV**, **Bookings CSV**, and **Kamai (Income) CSV**.
- Download complete **SQLite Database Backup (`.db`)** file anytime.

---

## 🛠️ Tech Stack

- **Runtime**: Node.js (v18+ / v24+)
- **Backend Framework**: Express 5
- **Database**: SQLite with `better-sqlite3` (WAL mode enabled for ultra-fast concurrent queries)
- **File Uploads**: Multer (customer photo uploads)
- **Frontend**: Vanilla HTML5, JavaScript (ES6+), Tailwind CSS (CDN), Lucide Icons, Canvas Confetti
- **Audio Alerts**: Browser Web Audio API (Synthesizer chime)
- **Testing**: Native Node.js HTTP End-to-End Test Suite (`test-e2e.js`)

---

## 🚀 Quick Start Guide

### 1. Clone the Repository
```bash
git clone https://github.com/PrajwalGhagre/lakshya-mens-parlour.git
cd lakshya-mens-parlour
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Start the Server
```bash
npm start
```
The server will start on **`http://localhost:3000`** and automatically initialize and seed the SQLite database with 10 services and sample Nagpur customers!

---

## 🔑 Accessing Portals

| Portal | URL | Credentials |
| :--- | :--- | :--- |
| **Public Website** | `http://localhost:3000` | No login required |
| **Owner Manager** | `http://localhost:3000/#owner` | **PIN:** `1234` (Changeable in Settings) |
| **Customer Secret Link (Demo 1)** | `http://localhost:3000/c/rahul_m8x2` | Rahul Sharma (3rd Visit FREE!) |
| **Customer Secret Link (Demo 2)** | `http://localhost:3000/c/amit_p4q9` | Amit Verma (5th Visit 50% OFF!) |

---

## 🧪 Running Tests

A complete automated end-to-end test suite is included, verifying 34 core features:
```bash
npm test
```

Test coverage includes:
- Owner PIN authentication & protection
- Due list calculations (*"Aaj aane wale"* & *"Late ho gaye"*)
- 10-digit Indian phone number cleaning and duplicate rejection
- 2 Barbers slot capacity checking (3rd booking blocked)
- Secret customer portal resolution
- Real-time 10-second polling status
- Loyalty rewards calculation (3rd Cut Free, 5th Cut 50% Off)
- Daily expenses logging and CSV/DB export downloads

---

## 📁 Project Structure

```
lakshya-mens-parlour/
├── data/                  # SQLite database (auto-generated in WAL mode)
├── db/
│   ├── index.js           # Database connection, schema & loyalty helpers
│   └── seed.js            # Initial seed data (services, customers, visits)
├── public/
│   ├── css/
│   │   └── custom.css     # Dark luxury theme styling & glassmorphism
│   ├── images/            # High-res salon & hairstyle photography
│   │   ├── shop-front.jpg
│   │   ├── interior-chairs.jpg
│   │   ├── haircut.jpg
│   │   ├── beard.jpg
│   │   ├── massage.jpg
│   │   ├── facial.jpg
│   │   ├── tools.jpg
│   │   └── avatars...
│   ├── js/
│   │   ├── app.js         # Public website & Owner dashboard controllers
│   │   └── customer.js    # Customer secret token (/c/:token) controller
│   ├── uploads/           # Uploaded customer photos (.gitkeep)
│   ├── customer.html      # Customer personal secret portal template
│   └── index.html         # Main public salon website & owner dashboard
├── .gitignore
├── package.json
├── README.md
├── server.js              # Express 5 server & REST API routes
└── test-e2e.js            # 34-point End-to-End Test Suite
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

**Developed with ❤️ for Lakshya Mens Parlour, Rajendra Nagar, Nagpur, India.**
