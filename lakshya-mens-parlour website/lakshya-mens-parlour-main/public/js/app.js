// ============================================================
// LAKSHYA MENS PARLOUR - OWNER PORTAL CONTROLLER
// Rajendra Nagar, Nagpur (2 Barbers Common Booking Calendar)
// ============================================================

let currentOwnerPin = localStorage.getItem('lakshya_owner_pin') || '';
let dashboardData = null;
let allCustomers = [];
let allServices = [];
let soundAlertEnabled = localStorage.getItem('lakshya_sound_enabled') !== 'false';
let pollerInterval = null;
let currentBookingFilter = 'today';
let currentDueSubView = 'due-today';
let activeVisitCustomerId = null;
let activeVisitBookingId = null;
let selectedVisitServices = [];
let activePayMode = 'Cash';

// Toast Notification
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const bg = type === 'success' ? 'bg-emerald-600 border-emerald-400' : 
             type === 'error' ? 'bg-red-600 border-red-400' : 
             'bg-slate-800 border-amber-500/40 text-amber-300';

  toast.className = `toast-msg px-4 py-2.5 rounded-xl border text-xs font-semibold text-white shadow-xl flex items-center gap-2 ${bg}`;
  toast.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// -------------------------------------------------------------
// 1. PIN AUTHENTICATION & PORTAL NAVIGATION CONTROLS
// -------------------------------------------------------------
function fillDemoPin() {
  document.getElementById('pin-input').value = '1234';
  loginWithOwnerPin();
}

function openOwnerLoginModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.remove('hidden');
  const errorMsg = document.getElementById('auth-error-msg');
  if (errorMsg) errorMsg.classList.add('hidden');
  setTimeout(() => {
    const input = document.getElementById('pin-input');
    if (input) {
      input.value = '';
      input.focus();
    }
  }, 100);
}

function closeOwnerLoginModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.add('hidden');
}

function handleOwnerNavClick() {
  if (currentOwnerPin) {
    showOwnerDashboard();
  } else {
    openOwnerLoginModal();
  }
}

function showPublicWebsite() {
  const ownerApp = document.getElementById('owner-app');
  const publicWeb = document.getElementById('public-website');
  if (ownerApp) ownerApp.classList.add('hidden');
  if (publicWeb) publicWeb.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function showOwnerDashboard() {
  const publicWeb = document.getElementById('public-website');
  const ownerApp = document.getElementById('owner-app');
  if (publicWeb) publicWeb.classList.add('hidden');
  if (ownerApp) ownerApp.classList.remove('hidden');

  closeOwnerLoginModal();
  await initOwnerApp();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loginWithOwnerPin() {
  const pinInput = document.getElementById('pin-input');
  const pin = pinInput.value.trim();
  const errorMsg = document.getElementById('auth-error-msg');

  if (!pin) {
    errorMsg.textContent = 'Kripya PIN darj karein!';
    errorMsg.classList.remove('hidden');
    return;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });

    const data = await res.json();
    if (!res.ok) {
      errorMsg.textContent = data.error || 'Galat PIN! Dubara koshish karein.';
      errorMsg.classList.remove('hidden');
      pinInput.value = '';
      return;
    }

    // Success
    currentOwnerPin = pin;
    localStorage.setItem('lakshya_owner_pin', pin);
    errorMsg.classList.add('hidden');
    closeOwnerLoginModal();

    // Update nav text
    const navText = document.getElementById('nav-owner-text');
    if (navText) navText.textContent = 'Owner Dashboard ⚡';

    await showOwnerDashboard();
    showToast('Swagatam! Lakshya Mens Parlour Manager khul gaya.', 'success');

  } catch (err) {
    console.error('Login error:', err);
    errorMsg.textContent = 'Network error. Server check karein.';
    errorMsg.classList.remove('hidden');
  }
}

function lockOwnerPortal() {
  currentOwnerPin = '';
  localStorage.removeItem('lakshya_owner_pin');
  if (pollerInterval) clearInterval(pollerInterval);
  showPublicWebsite();
  const navText = document.getElementById('nav-owner-text');
  if (navText) navText.textContent = 'Owner Login';
  showToast('Owner portal lock ho gaya.', 'info');
}

// Helper fetch with PIN header
async function ownerFetch(url, options = {}) {
  const headers = options.headers || {};
  headers['x-owner-pin'] = currentOwnerPin;
  options.headers = headers;

  const res = await fetch(url, options);
  if (res.status === 401) {
    lockOwnerPortal();
    showToast('Session expire ho gaya. Kripya PIN darj karein.', 'error');
    throw new Error('Unauthorized');
  }
  return res;
}

// -------------------------------------------------------------
// 2. INITIALIZATION & REAL-TIME 10-SECOND BACKGROUND POLLER
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) window.lucide.createIcons();

  // Load Public Website Data
  await loadPublicWebsiteData();

  // Check if PIN already saved
  if (currentOwnerPin) {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: currentOwnerPin })
      });
      if (res.ok) {
        const navText = document.getElementById('nav-owner-text');
        if (navText) navText.textContent = 'Owner Dashboard ⚡';
      } else {
        currentOwnerPin = '';
        localStorage.removeItem('lakshya_owner_pin');
      }
    } catch(e) {}
  }

  // If URL has #owner hash, open owner dashboard
  if (window.location.hash === '#owner') {
    if (currentOwnerPin) {
      await showOwnerDashboard();
    } else {
      openOwnerLoginModal();
    }
  }
});

async function initOwnerApp() {
  updateCurrentDateDisplay();
  await loadDashboard();
  await loadServicesList();
  await loadKhataReports();
  await loadSettings();
  setupRealtimePoller();
  updateSoundIcon();
  if (window.lucide) window.lucide.createIcons();
}

function updateCurrentDateDisplay() {
  const d = new Date();
  const options = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
  document.getElementById('header-date-text').textContent = d.toLocaleDateString('en-IN', options);
}

// 10-Second Real-Time Auto-Refresh Poller
function setupRealtimePoller() {
  if (pollerInterval) clearInterval(pollerInterval);

  pollerInterval = setInterval(async () => {
    try {
      const res = await ownerFetch('/api/owner/poll-status');
      if (!res.ok) return;
      const data = await res.json();

      const badge = document.getElementById('new-booking-badge');
      const alertBanner = document.getElementById('realtime-booking-alert');
      const alertMsg = document.getElementById('realtime-alert-msg');

      if (data.unreadBookingsCount > 0) {
        badge.textContent = data.unreadBookingsCount;
        badge.classList.remove('hidden');

        if (data.latestBooking) {
          alertMsg.textContent = `Naya Booking: ${data.latestBooking.customer_name} (${formatTime12h(data.latestBooking.slot_time)})`;
          alertBanner.classList.remove('hidden');
        }

        // Play audio chime if enabled and first time detected
        if (soundAlertEnabled && (!badge.dataset.lastCount || parseInt(badge.dataset.lastCount) < data.unreadBookingsCount)) {
          playBarberChime();
        }
        badge.dataset.lastCount = data.unreadBookingsCount;

        // Auto-refresh today's data so owner sees the updated state
        loadDashboard(false);
      } else {
        badge.classList.add('hidden');
        alertBanner.classList.add('hidden');
        badge.dataset.lastCount = '0';
      }
    } catch (err) {
      // Background poll fail silently
    }
  }, 10000); // exactly every 10 seconds
}

function dismissNewAlert() {
  document.getElementById('realtime-booking-alert').classList.add('hidden');
  switchTab('tab-bookings');
  ownerFetch('/api/owner/mark-booking-viewed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
  document.getElementById('new-booking-badge').classList.add('hidden');
}

// Web Audio API Barber Chime
function playBarberChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Note 1: 523.25 Hz (C5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, ctx.currentTime);
    gain1.gain.setValueAtTime(0.3, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.4);

    // Note 2: 783.99 Hz (G5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(783.99, ctx.currentTime + 0.15);
    gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.15);
    osc2.stop(ctx.currentTime + 0.6);

  } catch(e) {
    console.warn('Audio chime unsupported or blocked by browser');
  }
}

function toggleSoundAlert() {
  soundAlertEnabled = !soundAlertEnabled;
  localStorage.setItem('lakshya_sound_enabled', soundAlertEnabled);
  updateSoundIcon();
  showToast(`Booking sound chime ${soundAlertEnabled ? 'Chalu (ON)' : 'Band (OFF)'}`, 'info');
  if (soundAlertEnabled) playBarberChime();
}

function updateSoundIcon() {
  const icon = document.getElementById('sound-icon');
  if (!icon) return;
  if (soundAlertEnabled) {
    icon.setAttribute('data-lucide', 'volume-2');
    icon.classList.remove('text-red-400');
  } else {
    icon.setAttribute('data-lucide', 'volume-x');
    icon.classList.add('text-red-400');
  }
  if (window.lucide) window.lucide.createIcons();
}

// -------------------------------------------------------------
// 3. TAB NAVIGATION
// -------------------------------------------------------------
function switchTab(tabId, subView = null) {
  // Hide all contents
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.className = 'tab-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-300 hover:text-white whitespace-nowrap';
  });
  document.querySelectorAll('.nav-bottom-btn').forEach(b => {
    b.classList.remove('text-amber-400', 'font-bold');
  });

  // Show selected content
  const activeContent = document.getElementById(tabId);
  if (activeContent) activeContent.classList.remove('hidden');

  // Highlight top tab button
  const topBtn = document.getElementById(`nav-${tabId}`);
  if (topBtn) {
    topBtn.className = 'tab-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-black font-bold whitespace-nowrap';
  }

  // Highlight bottom nav button
  const bottomBtn = document.querySelector(`.nav-bottom-btn[data-tab="${tabId}"]`);
  if (bottomBtn) {
    bottomBtn.classList.add('text-amber-400', 'font-bold');
  }

  // Specific tab actions
  if (tabId === 'tab-due') {
    if (subView) toggleDueSubView(subView);
  } else if (tabId === 'tab-bookings') {
    loadBookings(currentBookingFilter);
    // Mark viewed
    ownerFetch('/api/owner/mark-booking-viewed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    document.getElementById('new-booking-badge').classList.add('hidden');
    document.getElementById('realtime-booking-alert').classList.add('hidden');
  } else if (tabId === 'tab-customers') {
    loadCustomersList();
  } else if (tabId === 'tab-services') {
    loadServicesManager();
  } else if (tabId === 'tab-khata') {
    loadKhataReports();
  } else if (tabId === 'tab-settings') {
    loadSettings();
  }

  if (window.lucide) window.lucide.createIcons();
}

// -------------------------------------------------------------
// 4. DUE LISTS (AAJ AANE WALE & LATE HO GAYE)
// -------------------------------------------------------------
async function loadDashboard(showLoader = true) {
  try {
    const res = await ownerFetch('/api/owner/dashboard');
    if (!res.ok) return;
    dashboardData = await res.json();

    // Update Quick Stats
    document.getElementById('stat-due-today').textContent = dashboardData.stats.dueTodayCount;
    document.getElementById('stat-overdue').textContent = dashboardData.stats.overdueCount;
    document.getElementById('stat-bookings').textContent = dashboardData.stats.todayBookingsCount;
    document.getElementById('stat-income').textContent = `₹${dashboardData.stats.todayIncome}`;

    // Sub-view count badges
    document.getElementById('badge-due-today-count').textContent = dashboardData.stats.dueTodayCount;
    document.getElementById('badge-overdue-count').textContent = dashboardData.stats.overdueCount;

    // Render Lists
    renderDueTodayList(dashboardData.dueTodayList);
    renderOverdueList(dashboardData.overdueList);

    if (window.lucide) window.lucide.createIcons();

  } catch(err) {
    console.error('Error loading dashboard:', err);
  }
}

function toggleDueSubView(subView) {
  currentDueSubView = subView;
  const btnToday = document.getElementById('btn-toggle-due-today');
  const btnOverdue = document.getElementById('btn-toggle-overdue');
  const containerToday = document.getElementById('due-today-container');
  const containerOverdue = document.getElementById('overdue-container');

  if (subView === 'due-today') {
    btnToday.className = 'px-3 py-1.5 rounded-lg bg-amber-500 text-black font-bold flex items-center gap-1.5 transition';
    btnOverdue.className = 'px-3 py-1.5 rounded-lg text-slate-400 hover:text-white font-semibold flex items-center gap-1.5 transition';
    containerToday.classList.remove('hidden');
    containerOverdue.classList.add('hidden');
  } else {
    btnToday.className = 'px-3 py-1.5 rounded-lg text-slate-400 hover:text-white font-semibold flex items-center gap-1.5 transition';
    btnOverdue.className = 'px-3 py-1.5 rounded-lg bg-red-600 text-white font-bold flex items-center gap-1.5 transition';
    containerToday.classList.add('hidden');
    containerOverdue.classList.remove('hidden');
  }
}

// Render "Aaj Aane Wale" List
function renderDueTodayList(customers) {
  const container = document.getElementById('due-today-container');
  container.innerHTML = '';

  if (!customers || customers.length === 0) {
    container.innerHTML = `
      <div class="glass-card p-6 text-center text-slate-400 text-xs">
        <div class="text-3xl mb-2">🎉</div>
        <p class="font-bold text-slate-300">Aaj koi grahak due nahi hai!</p>
        <p class="text-[11px] mt-1">Sabhi grahak time pe hain ya "Late Ho Gaye" tab check karein.</p>
      </div>
    `;
    return;
  }

  customers.forEach(c => {
    container.appendChild(createCustomerDueCard(c, false));
  });
}

// Render "Late Ho Gaye" List
function renderOverdueList(customers) {
  const container = document.getElementById('overdue-container');
  container.innerHTML = '';

  if (!customers || customers.length === 0) {
    container.innerHTML = `
      <div class="glass-card p-6 text-center text-slate-400 text-xs">
        <div class="text-3xl mb-2">✨</div>
        <p class="font-bold text-slate-300">Bahut badhiya! Koi bhi grahak late nahi hai.</p>
      </div>
    `;
    return;
  }

  customers.forEach(c => {
    container.appendChild(createCustomerDueCard(c, true));
  });
}

// Create Card for Due Customer
function createCustomerDueCard(c, isOverdue) {
  const card = document.createElement('div');
  card.className = `glass-card p-3.5 space-y-2.5 ${isOverdue ? 'border-red-500/30 hover:border-red-400' : 'border-amber-500/30 hover:border-amber-400'}`;

  // Badges
  const loyaltyBadge = c.loyalty.isRewardDue ? `
    <span class="text-[10px] font-black px-2 py-0.5 rounded-md ${c.loyalty.reward === 'FREE_CUT' ? 'bg-amber-500 text-black' : 'bg-purple-600 text-white'} pulse-badge">
      🎁 ${c.loyalty.badge} DUE!
    </span>
  ` : '';

  const overdueBadge = isOverdue ? `
    <span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-950/80 text-red-300 border border-red-800/40">
      ${c.dueInfo.daysOverdue} Din Late
    </span>
  ` : `
    <span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
      Aaj Due (${c.cycle_days} Din)
    </span>
  `;

  card.innerHTML = `
    <div class="flex items-start justify-between gap-2.5">
      <div class="flex items-center gap-3">
        <img src="${c.photo_url || '/images/avatar1.jpg'}" alt="${c.name}" class="w-12 h-12 rounded-full object-cover border border-amber-400/50 shadow-sm shrink-0">
        <div>
          <div class="flex items-center gap-1.5 flex-wrap">
            <h4 class="text-xs font-bold text-white">${c.name}</h4>
            ${loyaltyBadge}
          </div>
          <div class="text-[11px] text-slate-400 mt-0.5 font-mono flex items-center gap-2">
            <span>+91 ${c.phone}</span>
            <span>•</span>
            <span>${c.total_visits} Visits</span>
          </div>
        </div>
      </div>
      <div class="shrink-0 text-right">
        ${overdueBadge}
      </div>
    </div>

    <!-- Notes preview if available -->
    ${c.notes ? `<div class="text-[11px] text-slate-300 bg-slate-900/60 p-2 rounded-lg border border-slate-800/80 truncate">✂️ ${c.notes}</div>` : ''}

    <!-- Loyalty progress preview -->
    <div class="text-[10px] text-amber-300/90 font-medium">
      ${c.loyalty.progressText}
    </div>

    <!-- 1-Click Action Buttons -->
    <div class="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800/80">
      <!-- 1. Send WhatsApp Reminder (FREE wa.me link) -->
      <a href="${c.whatsapp_url}" target="_blank" class="btn-whatsapp py-2 px-2.5 rounded-xl text-[11px] flex items-center justify-center gap-1 text-center font-bold">
        <span>💬</span>
        <span>Remind</span>
      </a>

      <!-- 2. Copy Personal Booking Link -->
      <button onclick="copyCustomerLink('${c.personal_link}', '${c.name}')" class="py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-semibold flex items-center justify-center gap-1">
        <i data-lucide="copy" class="w-3.5 h-3.5 text-blue-400"></i>
        <span>Copy Link</span>
      </button>

      <!-- 3. Visit Done (Ho Gaya) -->
      <button onclick="openVisitModal(${c.id}, '${c.name.replace(/'/g, "\\'")}', null, ${JSON.stringify(c.loyalty).replace(/"/g, '&quot;')})" class="py-2 px-2.5 rounded-xl btn-gold text-[11px] font-bold flex items-center justify-center gap-1 text-center">
        <span>✓</span>
        <span>Ho Gaya</span>
      </button>
    </div>
  `;

  return card;
}

function copyCustomerLink(link, name) {
  navigator.clipboard.writeText(link);
  showToast(`${name} ka personal secret link copy ho gaya!`, 'success');
}

// -------------------------------------------------------------
// 5. VISIT MARKING & LOYALTY REWARDS CONFIRMATION MODAL
// -------------------------------------------------------------
function openVisitModal(customerId, customerName, bookingId = null, loyaltyInfo = null) {
  activeVisitCustomerId = customerId;
  activeVisitBookingId = bookingId;
  selectedVisitServices = [];
  activePayMode = 'Cash';

  document.getElementById('visit-modal-customer-name').textContent = customerName;
  document.getElementById('visit-total-amount').value = '';
  document.getElementById('visit-discount-amount').value = '0';
  document.getElementById('visit-notes').value = '';

  // Render services checkboxes in modal
  const container = document.getElementById('visit-services-list');
  container.innerHTML = '';

  allServices.forEach((s, idx) => {
    const item = document.createElement('label');
    item.className = 'flex items-center justify-between p-2 rounded-xl bg-slate-900 border border-slate-800 cursor-pointer text-xs';
    const isChecked = idx === 0;
    if (isChecked) selectedVisitServices.push(s.name);

    item.innerHTML = `
      <div class="flex items-center gap-2">
        <input type="checkbox" name="visit-svc" value="${s.name}" data-price="${s.price}" ${isChecked ? 'checked' : ''} class="w-4 h-4 rounded text-amber-500 bg-slate-800 border-slate-700">
        <span class="text-slate-200 font-semibold">${s.name}</span>
      </div>
      <span class="text-amber-400 font-bold font-display">₹${s.price}</span>
    `;

    item.querySelector('input').addEventListener('change', () => calculateVisitBill(loyaltyInfo));
    container.appendChild(item);
  });

  // Check loyalty reward alert
  const alertBox = document.getElementById('visit-loyalty-alert-box');
  const alertText = document.getElementById('visit-loyalty-alert-text');

  if (loyaltyInfo && loyaltyInfo.isRewardDue) {
    alertBox.classList.remove('hidden');
    if (loyaltyInfo.reward === 'FREE_CUT') {
      alertText.textContent = `🎁 3rd Visit Reward: Haircut is 100% FREE!`;
    } else if (loyaltyInfo.reward === 'HALF_PRICE') {
      alertText.textContent = `🏷️ 5th Visit Reward: 50% OFF applied!`;
    }
  } else {
    alertBox.classList.add('hidden');
  }

  calculateVisitBill(loyaltyInfo);
  setVisitPayMode('Cash');
  document.getElementById('modal-visit-done').classList.remove('hidden');
}

function calculateVisitBill(loyaltyInfo) {
  const checkboxes = document.querySelectorAll('#visit-services-list input[type="checkbox"]:checked');
  selectedVisitServices = [];
  let subtotal = 0;
  let haircutPrice = 0;

  checkboxes.forEach(cb => {
    selectedVisitServices.push(cb.value);
    const p = parseFloat(cb.dataset.price || '0');
    subtotal += p;
    if (cb.value.toLowerCase().includes('haircut') && haircutPrice === 0) {
      haircutPrice = p;
    }
  });

  let discount = 0;
  if (loyaltyInfo && loyaltyInfo.isRewardDue) {
    if (loyaltyInfo.reward === 'FREE_CUT') {
      discount = haircutPrice > 0 ? haircutPrice : 100;
    } else if (loyaltyInfo.reward === 'HALF_PRICE') {
      discount = Math.round(subtotal * 0.5);
    }
  }

  const finalAmount = Math.max(0, subtotal - discount);
  document.getElementById('visit-total-amount').value = finalAmount;
  document.getElementById('visit-discount-amount').value = discount;
}

function setVisitPayMode(mode) {
  activePayMode = mode;
  document.querySelectorAll('.paymode-btn').forEach(b => {
    b.className = 'paymode-btn py-1.5 rounded-lg text-xs font-bold border bg-slate-900 text-slate-300 border-slate-800';
  });
  const activeBtn = document.querySelector(`.paymode-btn[data-mode="${mode}"]`);
  if (activeBtn) {
    activeBtn.className = 'paymode-btn py-1.5 rounded-lg text-xs font-bold border bg-amber-500 text-black border-amber-400';
  }
}

async function submitVisitDone() {
  if (selectedVisitServices.length === 0) {
    showToast('Kam se kam ek service chunein', 'error');
    return;
  }

  const amount = parseFloat(document.getElementById('visit-total-amount').value) || 0;
  const discount = parseFloat(document.getElementById('visit-discount-amount').value) || 0;
  const notes = document.getElementById('visit-notes').value.trim();

  let loyaltyRewardApplied = 'NONE';
  if (discount > 0) {
    loyaltyRewardApplied = discount >= 100 ? 'FREE_CUT' : 'HALF_PRICE';
  }

  try {
    const res = await ownerFetch('/api/visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: activeVisitCustomerId,
        booking_id: activeVisitBookingId,
        services: selectedVisitServices,
        total_amount: amount,
        discount_applied: discount,
        loyalty_reward_applied: loyaltyRewardApplied,
        payment_mode: activePayMode,
        notes
      })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Visit save nahi ho saki', 'error');
      return;
    }

    closeVisitModal();
    showToast(`Visit done! Total ₹${amount} record ho gaya. (Visits: ${data.totalVisits})`, 'success');
    
    // Refresh all views
    await loadDashboard();
    if (!document.getElementById('tab-bookings').classList.contains('hidden')) {
      loadBookings(currentBookingFilter);
    }
    if (!document.getElementById('tab-khata').classList.contains('hidden')) {
      loadKhataReports();
    }

  } catch(err) {
    console.error('Submit visit error:', err);
    showToast('Network error', 'error');
  }
}

function closeVisitModal() {
  document.getElementById('modal-visit-done').classList.add('hidden');
}

// -------------------------------------------------------------
// 6. BOOKINGS MANAGEMENT (TODAY, UPCOMING, WALK-IN)
// -------------------------------------------------------------
async function loadBookings(filter = 'today') {
  currentBookingFilter = filter;

  // Toggle filter buttons styling
  document.getElementById('btn-booking-filter-today').className = filter === 'today' ? 'px-3 py-1 rounded-lg bg-amber-500 text-black font-bold' : 'px-3 py-1 rounded-lg text-slate-400 hover:text-white font-semibold';
  document.getElementById('btn-booking-filter-upcoming').className = filter === 'upcoming' ? 'px-3 py-1 rounded-lg bg-amber-500 text-black font-bold' : 'px-3 py-1 rounded-lg text-slate-400 hover:text-white font-semibold';
  document.getElementById('btn-booking-filter-all').className = filter === 'all' ? 'px-3 py-1 rounded-lg bg-amber-500 text-black font-bold' : 'px-3 py-1 rounded-lg text-slate-400 hover:text-white font-semibold';

  const container = document.getElementById('bookings-list-container');
  container.innerHTML = '<div class="text-center py-4 text-xs text-slate-400">Bookings load ho rahi hain...</div>';

  try {
    const res = await ownerFetch(`/api/bookings?filter=${filter}`);
    const bookings = await res.json();
    container.innerHTML = '';

    if (!bookings || bookings.length === 0) {
      container.innerHTML = `
        <div class="glass-card p-6 text-center text-slate-400 text-xs">
          <div class="text-3xl mb-2">📅</div>
          <p class="font-bold text-slate-300">Is category me koi booking nahi mili.</p>
          <p class="text-[11px] mt-1">Nayi booking jodne ke liye <strong>"Walk-in / Phone Book"</strong> dabayein.</p>
        </div>
      `;
      return;
    }

    bookings.forEach(b => {
      const card = document.createElement('div');
      const isUnread = b.is_viewed_by_owner === 0;
      card.className = `glass-card p-3.5 space-y-2.5 ${isUnread ? 'border-amber-400 shadow-md shadow-amber-500/10' : 'border-slate-800'}`;

      const statusBadge = b.status === 'booked' 
        ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">Booked</span>'
        : b.status === 'done'
        ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Done ✓</span>'
        : '<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30">Cancelled</span>';

      const newBadge = isUnread ? '<span class="bg-amber-500 text-black font-extrabold text-[9px] px-1.5 py-0.2 rounded pulse-badge">NEW</span>' : '';

      const svcs = Array.isArray(b.services) ? b.services.join(', ') : 'Salon Service';

      card.innerHTML = `
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-2.5">
            <img src="${b.customer_photo || '/images/avatar1.jpg'}" alt="${b.customer_name}" class="w-10 h-10 rounded-full object-cover border border-amber-400/40 shrink-0">
            <div>
              <div class="flex items-center gap-1.5">
                <h4 class="text-xs font-bold text-white">${b.customer_name}</h4>
                ${newBadge}
              </div>
              <div class="text-[11px] text-slate-400 font-mono">+91 ${b.customer_phone}</div>
            </div>
          </div>
          <div class="text-right">
            <div class="text-xs font-bold text-amber-400 font-mono">${formatTime12h(b.slot_time)}</div>
            <div class="text-[10px] text-slate-400">${b.booking_date}</div>
          </div>
        </div>

        <div class="flex items-center justify-between text-xs pt-1 border-t border-slate-800/80">
          <span class="text-slate-300 text-[11px] truncate max-w-[220px]">✂️ ${svcs}</span>
          ${statusBadge}
        </div>

        ${b.notes ? `<div class="text-[10px] text-slate-400 bg-slate-900/60 p-1.5 rounded border border-slate-800/60 truncate">Note: ${b.notes}</div>` : ''}

        <!-- Booking Actions -->
        ${b.status === 'booked' ? `
          <div class="flex gap-2 pt-1 border-t border-slate-800/80">
            <button onclick="openVisitModal(${b.customer_id}, '${b.customer_name.replace(/'/g, "\\'")}', ${b.id}, ${JSON.stringify(b.loyalty).replace(/"/g, '&quot;')})" class="flex-1 py-1.5 rounded-lg btn-gold text-xs font-bold">
              ✓ Visit Done
            </button>
            <button onclick="updateBookingStatus(${b.id}, 'cancelled')" class="py-1.5 px-3 rounded-lg bg-red-950/60 text-red-300 border border-red-800/40 text-xs font-semibold">
              Cancel
            </button>
          </div>
        ` : ''}
      `;

      container.appendChild(card);
    });

  } catch(err) {
    console.error('Error loading bookings:', err);
  }
}

async function updateBookingStatus(id, status) {
  if (status === 'cancelled' && !confirm('Kya aap is booking ko cancel karna chahte hain?')) return;

  try {
    const res = await ownerFetch(`/api/bookings/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (res.ok) {
      showToast(`Booking ${status} ho gayi`, 'info');
      loadBookings(currentBookingFilter);
      loadDashboard(false);
    }
  } catch(err) {
    showToast('Update fail ho gaya', 'error');
  }
}

// Walk-in booking modal
function openWalkinBookingModal() {
  const modal = document.getElementById('modal-walkin');
  const custSelect = document.getElementById('walkin-customer-select');
  const timeSelect = document.getElementById('walkin-time-select');
  const dateInput = document.getElementById('walkin-date');
  const servicesContainer = document.getElementById('walkin-services-container');

  // Populate date with today
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  dateInput.value = todayStr;

  // Populate customers
  custSelect.innerHTML = '<option value="">-- Grahak Chunein --</option>';
  allCustomers.forEach(c => {
    custSelect.innerHTML += `<option value="${c.id}">${c.name} (+91 ${c.phone})</option>`;
  });

  // Populate slot times (10:00 to 20:00, 30m)
  timeSelect.innerHTML = '';
  for (let h = 10; h < 20; h++) {
    ['00', '30'].forEach(m => {
      const timeStr = `${String(h).padStart(2, '0')}:${m}`;
      timeSelect.innerHTML += `<option value="${timeStr}">${formatTime12h(timeStr)}</option>`;
    });
  }

  // Populate services checkboxes
  servicesContainer.innerHTML = '';
  allServices.forEach((s, idx) => {
    servicesContainer.innerHTML += `
      <label class="flex items-center justify-between p-1.5 rounded bg-slate-900 border border-slate-800 text-xs">
        <div class="flex items-center gap-2">
          <input type="checkbox" name="walkin-svc" value="${s.name}" ${idx === 0 ? 'checked' : ''} class="w-3.5 h-3.5 text-amber-500">
          <span class="text-white">${s.name}</span>
        </div>
        <span class="text-amber-400 font-bold">₹${s.price}</span>
      </label>
    `;
  });

  modal.classList.remove('hidden');
}

function closeWalkinModal() {
  document.getElementById('modal-walkin').classList.add('hidden');
}

async function submitWalkinBooking(e) {
  e.preventDefault();
  const customerId = document.getElementById('walkin-customer-select').value;
  const date = document.getElementById('walkin-date').value;
  const time = document.getElementById('walkin-time-select').value;

  const svcs = [];
  document.querySelectorAll('#walkin-services-container input:checked').forEach(cb => svcs.push(cb.value));

  if (!customerId) {
    showToast('Kripya grahak chunein', 'error');
    return;
  }
  if (svcs.length === 0) {
    showToast('Kripya service chunein', 'error');
    return;
  }

  try {
    const res = await ownerFetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: customerId,
        booking_date: date,
        slot_time: time,
        services: svcs,
        source: 'walk_in'
      })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Booking add nahi ho saki', 'error');
      return;
    }

    closeWalkinModal();
    showToast(`Slot book ho gaya! Code: ${data.bookingCode}`, 'success');
    loadBookings(currentBookingFilter);
    loadDashboard(false);

  } catch(err) {
    showToast('Error booking walk-in', 'error');
  }
}

// -------------------------------------------------------------
// 7. CUSTOMER DATABASE (SEARCH, CRUD, PROFILES)
// -------------------------------------------------------------
async function loadCustomersList(query = '') {
  const container = document.getElementById('customer-list-container');
  container.innerHTML = '<div class="text-center py-4 text-xs text-slate-400">Grahak list load ho rahi hai...</div>';

  try {
    const url = query ? `/api/customers?q=${encodeURIComponent(query)}` : '/api/customers';
    const res = await ownerFetch(url);
    allCustomers = await res.json();
    container.innerHTML = '';

    if (allCustomers.length === 0) {
      container.innerHTML = '<div class="glass-card p-6 text-center text-xs text-slate-400">Koi grahak nahi mila. Naya grahak jodein.</div>';
      return;
    }

    allCustomers.forEach(c => {
      const card = document.createElement('div');
      card.className = 'glass-card p-3.5 space-y-2 hover:border-amber-400 transition';

      const loyaltyBadge = c.loyalty.isRewardDue ? `
        <span class="text-[9px] font-black px-1.5 py-0.2 rounded bg-amber-500 text-black">
          ${c.loyalty.badge} DUE
        </span>
      ` : '';

      card.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <img src="${c.photo_url || '/images/avatar1.jpg'}" alt="${c.name}" class="w-11 h-11 rounded-full object-cover border border-amber-400/40">
            <div>
              <div class="flex items-center gap-1.5">
                <h4 class="text-xs font-bold text-white">${c.name}</h4>
                ${loyaltyBadge}
              </div>
              <div class="text-[11px] text-slate-400 font-mono">+91 ${c.phone}</div>
              <div class="text-[10px] text-amber-300 mt-0.5">${c.total_visits} Visits • Cycle: ${c.cycle_days} Din</div>
            </div>
          </div>
          <div class="flex items-center gap-1">
            <button onclick="openCustomerProfile(${c.id})" class="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-bold" title="View Profile">
              <i data-lucide="eye" class="w-4 h-4"></i>
            </button>
            <button onclick="editCustomer(${c.id})" class="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold" title="Edit">
              <i data-lucide="edit" class="w-4 h-4"></i>
            </button>
            <button onclick="deleteCustomer(${c.id}, '${c.name.replace(/'/g, "\\'")}')" class="p-2 rounded-xl bg-slate-800 hover:bg-red-900/60 text-red-400 text-xs font-bold" title="Delete">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>

        <div class="flex items-center justify-between pt-1 border-t border-slate-800 text-[11px]">
          <span class="text-slate-400">Next due: <strong class="text-white">${c.dueInfo.dueDate}</strong></span>
          <a href="${c.whatsapp_url}" target="_blank" class="text-emerald-400 font-semibold hover:underline flex items-center gap-1">
            <span>💬 Send WhatsApp</span>
          </a>
        </div>
      `;

      container.appendChild(card);
    });

    if (window.lucide) window.lucide.createIcons();

  } catch(err) {
    console.error('Error loading customers:', err);
  }
}

let searchDebounce = null;
function searchCustomers(val) {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    loadCustomersList(val);
  }, 250);
}

// Add/Edit Customer Modal
function openAddCustomerModal() {
  document.getElementById('modal-customer-title').textContent = 'Naya Grahak Jodein';
  document.getElementById('cust-edit-id').value = '';
  document.getElementById('cust-input-name').value = '';
  document.getElementById('cust-input-phone').value = '';
  document.getElementById('cust-input-notes').value = '';
  document.getElementById('cust-form-preview').src = '/images/avatar1.jpg';
  document.getElementById('cust-input-photo').value = '';
  
  const firstVisitContainer = document.getElementById('first-visit-option-container');
  if (firstVisitContainer) {
    firstVisitContainer.classList.remove('hidden');
    document.getElementById('cust-check-first-visit').checked = true;
  }
  
  setCycleDays(25);
  selectAvatarPreset('/images/avatar1.jpg');
  document.getElementById('modal-customer').classList.remove('hidden');
}

function editCustomer(id) {
  const c = allCustomers.find(item => item.id === id);
  if (!c) return;

  document.getElementById('modal-customer-title').textContent = 'Grahak Ki Jankari Badlein';
  document.getElementById('cust-edit-id').value = c.id;
  document.getElementById('cust-input-name').value = c.name;
  document.getElementById('cust-input-phone').value = c.phone;
  document.getElementById('cust-input-notes').value = c.notes || '';
  document.getElementById('cust-form-preview').src = c.photo_url || '/images/avatar1.jpg';
  
  const firstVisitContainer = document.getElementById('first-visit-option-container');
  if (firstVisitContainer) firstVisitContainer.classList.add('hidden');
  
  setCycleDays(c.cycle_days || 25);
  selectAvatarPreset(c.photo_url || '/images/avatar1.jpg');
  document.getElementById('modal-customer').classList.remove('hidden');
}

function setCycleDays(days) {
  document.getElementById('cust-input-cycle').value = days;
  document.querySelectorAll('.cycle-pill').forEach(p => {
    if (parseInt(p.dataset.days) === days) {
      p.className = 'cycle-pill py-2 rounded-xl border border-amber-400 bg-amber-500 text-black font-extrabold';
    } else {
      p.className = 'cycle-pill py-2 rounded-xl border border-slate-800 bg-slate-900 text-slate-300';
    }
  });
}

function selectAvatarPreset(url) {
  document.getElementById('cust-form-preview').src = url;
  document.querySelectorAll('.avatar-preset-opt').forEach(img => {
    if (img.getAttribute('src') === url) {
      img.className = 'w-8 h-8 rounded-full border-2 border-amber-500 cursor-pointer avatar-preset-opt hover:scale-110 transition shadow';
    } else {
      img.className = 'w-8 h-8 rounded-full border border-slate-700 cursor-pointer avatar-preset-opt hover:scale-110 transition';
    }
  });
}

let latestAddedCustomer = null;

async function handleCustomerSubmit(e) {
  e.preventDefault();
  const editId = document.getElementById('cust-edit-id').value;
  const name = document.getElementById('cust-input-name').value.trim();
  const phone = document.getElementById('cust-input-phone').value.trim();
  const cycleDays = document.getElementById('cust-input-cycle').value;
  const notes = document.getElementById('cust-input-notes').value.trim();
  const photoFile = document.getElementById('cust-input-photo').files[0];
  const avatarPreset = document.getElementById('cust-form-preview').src;
  const markFirstVisit = document.getElementById('cust-check-first-visit') ? document.getElementById('cust-check-first-visit').checked : false;

  const btn = document.getElementById('btn-submit-customer');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  const formData = new FormData();
  formData.append('name', name);
  formData.append('phone', phone);
  formData.append('cycle_days', cycleDays);
  formData.append('notes', notes);
  formData.append('mark_first_visit_today', markFirstVisit);

  if (photoFile) {
    formData.append('photo', photoFile);
  } else {
    formData.append('avatar_preset', avatarPreset);
  }

  try {
    const url = editId ? `/api/customers/${editId}` : '/api/customers';
    const method = editId ? 'PUT' : 'POST';

    const res = await ownerFetch(url, {
      method,
      body: formData
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Grahak save nahi ho saka', 'error');
      btn.disabled = false;
      btn.textContent = 'Grahak Save Karein';
      return;
    }

    closeCustomerModal();
    btn.disabled = false;
    btn.textContent = 'Grahak Save Karein';

    await loadCustomersList();
    await loadDashboard();

    if (!editId) {
      // New Customer Success Popup
      latestAddedCustomer = data;
      document.getElementById('success-cust-name').textContent = `${data.name} (+91 ${data.phone})`;
      document.getElementById('success-cust-link').textContent = data.personalLink;

      const waMsg = `Hi ${data.name} bhai! Lakshya Mens Parlour, Rajendra Nagar me aapka khata jud gaya hai. Apna booking slot chunein ya loyalty points dekhein: ${data.personalLink}`;
      document.getElementById('btn-success-whatsapp').href = `https://wa.me/91${data.phone}?text=${encodeURIComponent(waMsg)}`;

      document.getElementById('modal-customer-success').classList.remove('hidden');
      if (typeof confetti === 'function') {
        confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
      }
      playBarberChime();
    } else {
      showToast('Grahak ki jankari update ho gayi!', 'success');
    }

  } catch(err) {
    console.error('Customer submit error:', err);
    showToast('Network error, kripya dubara try karein', 'error');
    btn.disabled = false;
    btn.textContent = 'Grahak Save Karein';
  }
}

function copySuccessLink() {
  if (latestAddedCustomer && latestAddedCustomer.personalLink) {
    navigator.clipboard.writeText(latestAddedCustomer.personalLink);
    showToast('Personal link copy ho gaya!', 'success');
  }
}

function viewCustomerInKhata() {
  document.getElementById('modal-customer-success').classList.add('hidden');
  switchTab('tab-customers');
}

function closeCustomerModal() {
  document.getElementById('modal-customer').classList.add('hidden');
}

async function deleteCustomer(id, name) {
  if (!confirm(`Kya aap ${name} ka record sach me delete karna chahte hain?`)) return;

  try {
    const res = await ownerFetch(`/api/customers/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Customer record hata diya gaya', 'info');
      await loadCustomersList();
      await loadDashboard();
    }
  } catch(err) {
    showToast('Delete fail ho gaya', 'error');
  }
}

// Full Customer Profile View
async function openCustomerProfile(id) {
  const modal = document.getElementById('modal-customer-profile');
  const body = document.getElementById('profile-content-body');
  body.innerHTML = '<div class="text-center py-6 text-xs text-slate-400">Profile load ho rahi hai...</div>';
  modal.classList.remove('hidden');

  try {
    const res = await ownerFetch(`/api/customers/${id}`);
    const data = await res.json();
    const { customer, visits, bookings } = data;

    body.innerHTML = `
      <div class="text-center pb-3 border-b border-slate-800">
        <img src="${customer.photo_url || '/images/avatar1.jpg'}" alt="${customer.name}" class="w-16 h-16 rounded-full mx-auto object-cover border-2 border-amber-400 mb-2">
        <h3 class="text-sm font-bold text-white">${customer.name}</h3>
        <p class="text-xs text-slate-400 font-mono">+91 ${customer.phone}</p>
        <div class="mt-2 flex justify-center gap-2">
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
            Total Visits: ${customer.total_visits}
          </span>
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
            Cycle: ${customer.cycle_days} Din
          </span>
        </div>
      </div>

      <!-- Secret Personal Link -->
      <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs space-y-1.5">
        <div class="flex justify-between items-center text-[11px] text-slate-400">
          <span>Personal Booking Link:</span>
          <button onclick="copyCustomerLink('${customer.personal_link}', '${customer.name}')" class="text-amber-400 font-bold hover:underline">Copy Link</button>
        </div>
        <div class="text-[10px] font-mono text-slate-300 break-all select-all bg-black/50 p-1.5 rounded border border-slate-800">${customer.personal_link}</div>
        <a href="${customer.personal_link}" target="_blank" class="block text-center py-1 text-[11px] text-amber-300 hover:underline font-semibold">Grahak Page Khol Kar Dekhein →</a>
      </div>

      <!-- Loyalty Reward Info -->
      <div class="p-2.5 rounded-xl bg-gradient-to-r from-amber-950/30 to-slate-900 border border-amber-500/30 text-xs">
        <div class="font-bold text-amber-400">Loyalty Status:</div>
        <div class="text-[11px] text-slate-200 mt-0.5">${customer.loyalty.progressText}</div>
      </div>

      <!-- Visit History List -->
      <div>
        <h4 class="text-xs font-bold text-white mb-1.5 uppercase tracking-wide">Visits History (${visits.length})</h4>
        <div class="space-y-1.5 max-h-40 overflow-y-auto pr-1">
          ${visits.length === 0 ? '<div class="text-[11px] text-slate-500">Koi visit record nahi hai</div>' : ''}
          ${visits.map(v => `
            <div class="p-2 rounded-lg bg-slate-900 border border-slate-800 text-[11px]">
              <div class="flex justify-between items-center font-bold">
                <span class="text-amber-400 font-display">₹${v.total_amount} <span class="text-[9px] text-slate-400 font-normal">(${v.payment_mode})</span></span>
                <span class="text-slate-400 text-[10px]">${v.visit_date.substring(0, 10)}</span>
              </div>
              <div class="text-slate-300 mt-0.5">${Array.isArray(v.services) ? v.services.join(', ') : v.services}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="pt-2">
        <a href="${customer.whatsapp_url}" target="_blank" class="w-full btn-whatsapp py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5">
          <span>💬 Send WhatsApp Reminder Now</span>
        </a>
      </div>
    `;

  } catch(err) {
    body.innerHTML = '<div class="text-xs text-red-400">Error loading customer profile</div>';
  }
}

function closeProfileModal() {
  document.getElementById('modal-customer-profile').classList.add('hidden');
}

// -------------------------------------------------------------
// 8. SERVICES & PRICE LIST MANAGER
// -------------------------------------------------------------
async function loadServicesList() {
  try {
    const res = await fetch('/api/services');
    allServices = await res.json();
  } catch(e) {}
}

async function loadServicesManager() {
  await loadServicesList();
  const container = document.getElementById('services-manager-list');
  container.innerHTML = '';

  allServices.forEach(s => {
    const item = document.createElement('div');
    item.className = 'glass-card p-3 flex items-center justify-between';
    item.innerHTML = `
      <div>
        <div class="text-xs font-bold text-white flex items-center gap-1.5">
          <span>${s.name}</span>
          ${s.name_hi ? `<span class="text-amber-400 font-normal">(${s.name_hi})</span>` : ''}
        </div>
        <div class="text-[10px] text-slate-400 mt-0.5">${s.duration_mins} min • ${s.category}</div>
      </div>
      <div class="flex items-center gap-3">
        <div class="text-sm font-bold text-amber-400 font-display">₹${s.price}</div>
        <button onclick="deleteService(${s.id})" class="p-1.5 rounded-lg bg-slate-800 text-red-400 hover:bg-red-900/60" title="Delete">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    `;
    container.appendChild(item);
  });

  if (window.lucide) window.lucide.createIcons();
}

function openAddServiceModal() {
  document.getElementById('modal-service').classList.remove('hidden');
}
function closeServiceModal() {
  document.getElementById('modal-service').classList.add('hidden');
}

async function submitServiceForm(e) {
  e.preventDefault();
  const name = document.getElementById('svc-name').value.trim();
  const nameHi = document.getElementById('svc-name-hi').value.trim();
  const price = document.getElementById('svc-price').value;
  const duration = document.getElementById('svc-duration').value;
  const category = document.getElementById('svc-category').value;
  const desc = document.getElementById('svc-desc').value.trim();

  try {
    const res = await ownerFetch('/api/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, name_hi: nameHi, price, duration_mins: duration, category, description: desc })
    });
    if (res.ok) {
      showToast('Nayi service jud gayi!', 'success');
      closeServiceModal();
      await loadServicesManager();
    }
  } catch(err) {
    showToast('Service add nahi ho saki', 'error');
  }
}

async function deleteService(id) {
  if (!confirm('Kya aap is service ko rate list se hatana chahte hain?')) return;
  try {
    const res = await ownerFetch(`/api/services/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Service hata di gayi', 'info');
      await loadServicesManager();
    }
  } catch(e) {}
}

// -------------------------------------------------------------
// 9. HISAAB / KHATA (INCOME, EXPENSES & ANALYTICS)
// -------------------------------------------------------------
async function loadKhataReports() {
  try {
    const res = await ownerFetch('/api/reports/summary');
    if (!res.ok) return;
    const data = await res.json();

    // Financial Cards
    document.getElementById('report-today-income').textContent = `₹${data.today.income}`;
    document.getElementById('report-today-cust').textContent = data.today.customers;
    document.getElementById('report-today-exp').textContent = `₹${data.today.expenses}`;
    document.getElementById('report-today-net').textContent = `₹${data.today.netProfit}`;

    document.getElementById('report-month-income').textContent = `₹${data.month.income}`;
    document.getElementById('report-month-cust').textContent = data.month.customers;
    document.getElementById('report-month-exp').textContent = `₹${data.month.expenses}`;
    document.getElementById('report-month-net').textContent = `₹${data.month.netProfit}`;

    // Render Busiest Hours
    renderBusiestHoursChart(data.hourlyDistribution);

    // Render Expenses List
    await loadExpenses();

  } catch(err) {
    console.error('Error loading reports:', err);
  }
}

function renderBusiestHoursChart(hours) {
  const chart = document.getElementById('busiest-hours-chart');
  chart.innerHTML = '';

  const hourMap = {};
  for (let h = 10; h <= 20; h++) {
    hourMap[String(h).padStart(2, '0')] = 0;
  }
  if (hours) {
    hours.forEach(r => {
      hourMap[r.hour] = r.count;
    });
  }

  const maxVal = Math.max(1, ...Object.values(hourMap));

  for (let h = 10; h <= 20; h++) {
    const key = String(h).padStart(2, '0');
    const val = hourMap[key] || 0;
    const heightPercent = Math.max(10, Math.round((val / maxVal) * 100));

    const col = document.createElement('div');
    col.className = 'flex-1 flex flex-col items-center gap-1 group relative';
    col.innerHTML = `
      <div class="text-[9px] font-mono text-amber-400">${val > 0 ? val : ''}</div>
      <div class="w-full bg-gradient-to-t from-amber-600 to-yellow-400 rounded-t transition-all duration-300 group-hover:brightness-125" style="height: ${heightPercent}%"></div>
      <div class="text-[9px] text-slate-500 font-mono">${h}</div>
    `;
    chart.appendChild(col);
  }
}

async function loadExpenses() {
  const container = document.getElementById('expenses-list-container');
  try {
    const res = await ownerFetch('/api/expenses');
    const expenses = await res.json();
    container.innerHTML = '';

    if (!expenses || expenses.length === 0) {
      container.innerHTML = '<div class="text-xs text-slate-500 py-2">Aaj koi kharcha darj nahi hai.</div>';
      return;
    }

    expenses.forEach(exp => {
      const row = document.createElement('div');
      row.className = 'p-2 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-xs';
      row.innerHTML = `
        <div>
          <span class="font-bold text-white">${exp.category}</span>
          ${exp.notes ? `<span class="text-slate-400 text-[10px] ml-1.5 font-normal">(${exp.notes})</span>` : ''}
        </div>
        <div class="flex items-center gap-2">
          <span class="font-bold text-red-400 font-display">₹${exp.amount}</span>
          <button onclick="deleteExpense(${exp.id})" class="text-slate-500 hover:text-red-400">&times;</button>
        </div>
      `;
      container.appendChild(row);
    });
  } catch(e) {}
}

function openAddExpenseModal() {
  document.getElementById('modal-expense').classList.remove('hidden');
}
function closeExpenseModal() {
  document.getElementById('modal-expense').classList.add('hidden');
}

async function submitExpenseForm(e) {
  e.preventDefault();
  const category = document.getElementById('exp-category').value;
  const amount = document.getElementById('exp-amount').value;
  const notes = document.getElementById('exp-notes').value.trim();

  try {
    const res = await ownerFetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, amount, notes })
    });
    if (res.ok) {
      showToast('Kharcha save ho gaya', 'success');
      closeExpenseModal();
      await loadKhataReports();
    }
  } catch(e) {
    showToast('Error saving expense', 'error');
  }
}

async function deleteExpense(id) {
  try {
    const res = await ownerFetch(`/api/expenses/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Kharcha hata diya gaya', 'info');
      await loadKhataReports();
    }
  } catch(e) {}
}

// -------------------------------------------------------------
// 10. SETTINGS, BACKUP & EXPORTS
// -------------------------------------------------------------
async function loadSettings() {
  try {
    const res = await ownerFetch('/api/settings');
    const settings = await res.json();

    if (settings.reminder_template) {
      document.getElementById('setting-reminder-template').value = settings.reminder_template;
    }
    if (settings.active_offer) {
      document.getElementById('setting-active-offer').value = settings.active_offer;
    }
    if (settings.opening_time) {
      document.getElementById('setting-open-time').value = settings.opening_time;
    }
    if (settings.closing_time) {
      document.getElementById('setting-close-time').value = settings.closing_time;
    }
    if (settings.capacity_per_slot) {
      document.getElementById('setting-capacity').value = settings.capacity_per_slot;
    }
    if (settings.weekly_off) {
      document.getElementById('setting-weekly-off').value = settings.weekly_off;
    }
  } catch(e) {}
}

async function saveReminderTemplate() {
  const val = document.getElementById('setting-reminder-template').value.trim();
  try {
    const res = await ownerFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reminder_template: val })
    });
    if (res.ok) showToast('Reminder template save ho gaya!', 'success');
  } catch(e) {}
}

async function saveActiveOffer() {
  const val = document.getElementById('setting-active-offer').value.trim();
  try {
    const res = await ownerFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active_offer: val })
    });
    if (res.ok) showToast('Active offer banner update ho gaya!', 'success');
  } catch(e) {}
}

async function saveOperatingSettings() {
  const openTime = document.getElementById('setting-open-time').value;
  const closeTime = document.getElementById('setting-close-time').value;
  const capacity = document.getElementById('setting-capacity').value;
  const weeklyOff = document.getElementById('setting-weekly-off').value;

  try {
    const res = await ownerFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        opening_time: openTime,
        closing_time: closeTime,
        capacity_per_slot: capacity,
        weekly_off: weeklyOff
      })
    });
    if (res.ok) showToast('Salon timing aur capacity save ho gayi!', 'success');
  } catch(e) {}
}

async function changeOwnerPin() {
  const currentPin = document.getElementById('input-old-pin').value.trim();
  const newPin = document.getElementById('input-new-pin').value.trim();

  if (!currentPin || !newPin) {
    showToast('Dono PIN field bharein', 'error');
    return;
  }

  try {
    const res = await ownerFetch('/api/auth/change-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPin, newPin })
    });
    const data = await res.json();
    if (res.ok) {
      currentOwnerPin = newPin;
      localStorage.setItem('lakshya_owner_pin', newPin);
      document.getElementById('input-old-pin').value = '';
      document.getElementById('input-new-pin').value = '';
      showToast('PIN badal diya gaya! Agli baar naya PIN use karein.', 'success');
    } else {
      showToast(data.error || 'PIN update fail', 'error');
    }
  } catch(e) {
    showToast('Network error', 'error');
  }
}

// Download CSV / DB Export with Owner Auth
async function downloadExport(endpoint) {
  try {
    const res = await ownerFetch(endpoint);
    if (!res.ok) {
      showToast('Export download fail', 'error');
      return;
    }
    const blob = await res.blob();
    const disposition = res.headers.get('content-disposition');
    let filename = endpoint.split('/').pop();
    if (disposition && disposition.indexOf('filename=') !== -1) {
      const match = disposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) filename = match[1];
    }

    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(downloadUrl);
    showToast(`File download shuru ho gayi: ${filename}`, 'success');

  } catch(e) {
    showToast('Export error', 'error');
  }
}

// Format 24h to 12h AM/PM
function formatTime12h(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 || 12;
  return `${displayH}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ============================================================
// ============================================================
// PUBLIC WEBSITE CONTROLLER (FRONT PAGE EXPERIENCE)
// ============================================================
// ============================================================

let publicServicesList = [];
let publicSelectedDate = '';
let publicSelectedSlot = '';

// 1. Load Public Salon Info & Services with Photos
async function loadPublicWebsiteData() {
  try {
    const res = await fetch('/api/public/info');
    if (!res.ok) return;
    const data = await res.json();
    publicServicesList = data.services || [];

    renderPublicServicesGrid();
    renderPublicServicesCheckboxes();
    initPublicDateSelector();

  } catch(err) {
    console.error('Error loading public website data:', err);
  }
}

// 2. Render Visual Service Cards with Photos
function renderPublicServicesGrid() {
  const container = document.getElementById('public-services-grid');
  if (!container) return;

  if (publicServicesList.length === 0) {
    container.innerHTML = '<div class="col-span-full text-center py-8 text-slate-500">No services listed currently.</div>';
    return;
  }

  container.innerHTML = '';
  publicServicesList.forEach(s => {
    const card = document.createElement('div');
    card.className = 'glass-card overflow-hidden border border-slate-800 hover:border-amber-500/50 transition duration-200 flex flex-col group';
    
    // Choose photo or fallback
    const imgUrl = s.image_url || '/images/haircut.jpg';

    card.innerHTML = `
      <div class="h-44 sm:h-48 w-full relative overflow-hidden bg-slate-900">
        <img src="${imgUrl}" alt="${s.name}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
        <div class="absolute top-3 right-3 bg-black/80 backdrop-blur-md px-2.5 py-1 rounded-full border border-amber-500/40 text-amber-300 font-black text-xs shadow-lg">
          ₹${s.price}
        </div>
        <div class="absolute bottom-3 left-3 bg-slate-950/80 backdrop-blur-md px-2.5 py-0.5 rounded-md text-[10px] text-slate-300 font-semibold border border-slate-800">
          ⏱️ ${s.duration_min || 25} Min
        </div>
      </div>
      <div class="p-4 flex-1 flex flex-col justify-between">
        <div>
          <h3 class="text-sm font-bold text-white group-hover:text-amber-300 transition">${s.name}</h3>
          <div class="text-xs text-amber-400 font-semibold mt-0.5">${s.name_hi || ''}</div>
          <p class="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">${s.description || 'Professional grooming service by expert barbers'}</p>
        </div>
        <div class="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
          <span class="text-xs font-black text-amber-400">₹${s.price}</span>
          <button onclick="bookThisService('${s.name}')" class="px-3.5 py-1.5 rounded-xl btn-gold text-xs font-bold flex items-center gap-1 shadow-md hover:scale-105 transition">
            <span>Book This</span>
            <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  if (window.lucide) window.lucide.createIcons();
}

// 3. Render Service Checkboxes in Online Booking Widget
function renderPublicServicesCheckboxes() {
  const container = document.getElementById('public-services-checkboxes');
  if (!container) return;

  container.innerHTML = '';
  publicServicesList.forEach((s, idx) => {
    const isFirst = idx === 0;
    const label = document.createElement('label');
    label.className = 'flex items-center justify-between p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-amber-500/40 cursor-pointer transition select-none';
    label.innerHTML = `
      <div class="flex items-center gap-2.5 truncate">
        <input type="checkbox" name="public-booking-svc" value="${s.name}" data-price="${s.price}" ${isFirst ? 'checked' : ''} onchange="updatePublicBookingTotal()" class="w-4 h-4 rounded text-amber-500 bg-slate-950 border-slate-700 focus:ring-amber-400">
        <div class="truncate">
          <div class="text-xs font-bold text-white truncate">${s.name}</div>
          <div class="text-[10px] text-slate-400">${s.name_hi ? s.name_hi + ' • ' : ''}${s.duration_min || 25} min</div>
        </div>
      </div>
      <span class="text-xs font-black text-amber-400 shrink-0 ml-2">₹${s.price}</span>
    `;
    container.appendChild(label);
  });

  updatePublicBookingTotal();
}

// Quick "Book This" Action from Service Card
function bookThisService(serviceName) {
  const checkboxes = document.querySelectorAll('input[name="public-booking-svc"]');
  let found = false;
  checkboxes.forEach(cb => {
    if (cb.value === serviceName) {
      cb.checked = true;
      found = true;
    }
  });

  updatePublicBookingTotal();

  // Scroll to booking section
  const bookingSec = document.getElementById('booking');
  if (bookingSec) {
    bookingSec.scrollIntoView({ behavior: 'smooth' });
  }

  showToast(`"${serviceName}" select ho gaya! Ab slot time chunein.`, 'info');
}

// Update Dynamic Total Price
function updatePublicBookingTotal() {
  const checkboxes = document.querySelectorAll('input[name="public-booking-svc"]:checked');
  let total = 0;
  checkboxes.forEach(cb => {
    total += parseInt(cb.dataset.price || '0', 10);
  });

  const totalEl = document.getElementById('public-total-price');
  if (totalEl) totalEl.textContent = `₹${total}`;
}

// 4. 7-Day Date Selector
function initPublicDateSelector() {
  const container = document.getElementById('public-date-selector');
  if (!container) return;

  container.innerHTML = '';
  const today = new Date();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const isToday = (i === 0);
    const dayLabel = isToday ? 'Aaj (Today)' : (i === 1 ? 'Kal (Tom)' : dayNames[d.getDay()]);
    const dateLabel = `${d.getDate()} ${monthNames[d.getMonth()]}`;

    const pill = document.createElement('button');
    pill.type = 'button';
    pill.id = `public-date-pill-${dateStr}`;
    pill.className = `flex-1 min-w-[76px] py-2 px-2 rounded-xl text-center border transition shrink-0 ${
      i === 0 
        ? 'border-amber-400 bg-amber-500 text-black font-extrabold shadow-md shadow-amber-500/20' 
        : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700 font-semibold'
    }`;
    pill.innerHTML = `
      <div class="text-[10px] uppercase font-bold tracking-tight">${dayLabel}</div>
      <div class="text-xs font-black mt-0.5">${dateLabel}</div>
    `;

    pill.onclick = () => selectPublicDate(dateStr);
    container.appendChild(pill);

    if (i === 0) {
      publicSelectedDate = dateStr;
    }
  }

  loadPublicSlots(publicSelectedDate);
}

// Select a Date
function selectPublicDate(dateStr) {
  publicSelectedDate = dateStr;
  publicSelectedSlot = '';
  const hiddenInput = document.getElementById('public-selected-slot');
  if (hiddenInput) hiddenInput.value = '';

  // Update styles
  document.querySelectorAll('#public-date-selector button').forEach(b => {
    b.className = 'flex-1 min-w-[76px] py-2 px-2 rounded-xl text-center border transition shrink-0 border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700 font-semibold';
  });

  const activePill = document.getElementById(`public-date-pill-${dateStr}`);
  if (activePill) {
    activePill.className = 'flex-1 min-w-[76px] py-2 px-2 rounded-xl text-center border transition shrink-0 border-amber-400 bg-amber-500 text-black font-extrabold shadow-md shadow-amber-500/20';
  }

  loadPublicSlots(dateStr);
}

// 5. Load Available 30-min Slots with 2-Barber Capacity Status
async function loadPublicSlots(dateStr) {
  const container = document.getElementById('public-slots-grid');
  if (!container) return;

  container.innerHTML = '<div class="col-span-full text-center py-6 text-slate-500 text-xs">Slots check ho rahe hain...</div>';

  try {
    const res = await fetch(`/api/public/slots?date=${dateStr}`);
    if (!res.ok) throw new Error('Failed to load slots');
    const data = await res.json();

    if (data.isClosed) {
      container.innerHTML = `
        <div class="col-span-full text-center py-6 p-4 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-xs font-bold">
          ⚠️ ${data.dayName} ko salon weekly off / band rehta hai. Kripya doosri tareekh chunein.
        </div>
      `;
      return;
    }

    renderPublicSlotsGrid(data.slots || [], data.capacity || 2);

  } catch(err) {
    console.error('Error loading slots:', err);
    container.innerHTML = '<div class="col-span-full text-center py-6 text-red-400 text-xs">Slots load nahi ho sake. Refresh karein.</div>';
  }
}

// Render Slot Buttons
function renderPublicSlotsGrid(slots, capacity) {
  const container = document.getElementById('public-slots-grid');
  if (!container) return;

  if (slots.length === 0) {
    container.innerHTML = '<div class="col-span-full text-center py-6 text-slate-500 text-xs">Koi slot uplabdh nahi hai.</div>';
    return;
  }

  container.innerHTML = '';
  slots.forEach(slot => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = `public-slot-${slot.time.replace(':', '-')}`;

    const isAvailable = slot.isAvailable;
    const isFull = slot.status === 'full';
    const isPast = slot.status === 'past';
    const isBlocked = slot.status === 'blocked';

    let statusText = `${slot.availableSpots} Open`;
    if (slot.availableSpots === 1) statusText = '1 Spot Left';
    if (isFull) statusText = 'Full';
    if (isPast) statusText = 'Passed';
    if (isBlocked) statusText = 'Reserved';

    let extraClass = 'border-slate-800 bg-slate-900 text-slate-200 hover:border-amber-400 hover:text-white';
    if (!isAvailable) {
      extraClass = 'slot-full opacity-40 bg-slate-950 border-slate-900 text-slate-500 cursor-not-allowed';
    }

    btn.className = `slot-pill p-2 rounded-xl border text-center transition flex flex-col items-center justify-center ${extraClass}`;
    btn.innerHTML = `
      <span class="text-xs font-bold">${slot.displayTime}</span>
      <span class="text-[9px] font-semibold mt-0.5 ${isFull ? 'text-red-400' : (isAvailable ? 'text-amber-400' : 'text-slate-500')}">${statusText}</span>
    `;

    if (isAvailable) {
      btn.onclick = () => selectPublicSlot(slot.time, slot.displayTime);
    } else {
      btn.disabled = true;
    }

    container.appendChild(btn);
  });
}

// Select a Slot
function selectPublicSlot(timeStr, displayTime) {
  publicSelectedSlot = timeStr;
  const hiddenInput = document.getElementById('public-selected-slot');
  if (hiddenInput) hiddenInput.value = timeStr;

  // Clear existing active selection
  document.querySelectorAll('#public-slots-grid .slot-pill').forEach(b => {
    if (!b.disabled) {
      b.classList.remove('slot-selected');
    }
  });

  const selectedBtn = document.getElementById(`public-slot-${timeStr.replace(':', '-')}`);
  if (selectedBtn) {
    selectedBtn.classList.add('slot-selected');
  }

  showToast(`Time slot selected: ${displayTime}`, 'info');
}

// 6. Handle Public Booking Form Submission
async function handlePublicBookingSubmit(e) {
  e.preventDefault();

  if (!publicSelectedSlot) {
    showToast('Kripya ek available Time Slot chunein!', 'error');
    const slotSec = document.getElementById('public-slots-grid');
    if (slotSec) slotSec.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  const checkedServices = [];
  document.querySelectorAll('input[name="public-booking-svc"]:checked').forEach(cb => {
    checkedServices.push(cb.value);
  });

  if (checkedServices.length === 0) {
    showToast('Kripya kam se kam ek service select karein!', 'error');
    return;
  }

  const name = document.getElementById('public-cust-name').value.trim();
  const phone = document.getElementById('public-cust-phone').value.trim();
  const notes = document.getElementById('public-cust-notes').value.trim();

  if (!name) {
    showToast('Kripya apna naam darj karein!', 'error');
    return;
  }

  // Clean phone
  let cleanPhone = phone.replace(/[^0-9]/g, '');
  if (cleanPhone.length > 10 && cleanPhone.startsWith('91')) cleanPhone = cleanPhone.slice(2);
  if (cleanPhone.length > 10 && cleanPhone.startsWith('0')) cleanPhone = cleanPhone.slice(1);

  if (cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone)) {
    showToast('Kripya 10-digit Indian mobile number darj karein (e.g. 9823012345)', 'error');
    return;
  }

  const btn = document.getElementById('btn-submit-public-book');
  btn.disabled = true;
  btn.innerHTML = '<span>Booking Confirm Ho Rahi Hai...</span>';

  try {
    const res = await fetch('/api/public/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        phone: cleanPhone,
        date: publicSelectedDate,
        slot_time: publicSelectedSlot,
        services: checkedServices,
        notes
      })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Booking nahi ho saki. Kripya doosra time slot chunein.', 'error');
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="check-circle" class="w-5 h-5"></i> <span>Confirm Appointment Slot (Free Booking)</span>';
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    // Success Confetti!
    if (typeof confetti === 'function') {
      confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
    }
    playBarberChime();

    // Fill Ticket Modal
    document.getElementById('ticket-booking-code').textContent = data.bookingCode || 'LAK-SUCCESS';
    document.getElementById('ticket-cust-name').textContent = data.customerName || name;
    document.getElementById('ticket-date').textContent = data.date;
    document.getElementById('ticket-time').textContent = formatTime12h(data.slot_time);
    document.getElementById('ticket-services').textContent = (data.services || []).join(', ');
    document.getElementById('ticket-amount').textContent = `₹${data.estimatedAmount || 0}`;

    const linkEl = document.getElementById('ticket-personal-link');
    if (linkEl && data.personalLink) {
      linkEl.href = data.personalLink;
      linkEl.textContent = 'Open My Personal Secret Link';
    }

    // Show Ticket Modal
    const modal = document.getElementById('modal-ticket');
    if (modal) modal.classList.remove('hidden');

    // Reset fields
    document.getElementById('public-cust-notes').value = '';
    publicSelectedSlot = '';
    const hiddenInput = document.getElementById('public-selected-slot');
    if (hiddenInput) hiddenInput.value = '';

    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="check-circle" class="w-5 h-5"></i> <span>Confirm Appointment Slot (Free Booking)</span>';
    if (window.lucide) window.lucide.createIcons();

    // Reload slots for that date
    await loadPublicSlots(publicSelectedDate);

  } catch(err) {
    console.error('Public booking error:', err);
    showToast('Network error. Kripya dubara try karein.', 'error');
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="check-circle" class="w-5 h-5"></i> <span>Confirm Appointment Slot (Free Booking)</span>';
    if (window.lucide) window.lucide.createIcons();
  }
}

function closeTicketModal() {
  const modal = document.getElementById('modal-ticket');
  if (modal) modal.classList.add('hidden');
}

// 7. Customer Loyalty Lookup by Phone
async function handleCustomerLoyaltyLookup(e) {
  e.preventDefault();
  const input = document.getElementById('lookup-phone-input');
  const resultBox = document.getElementById('lookup-result-box');
  if (!input || !resultBox) return;

  const phone = input.value.trim();
  let cleanPhone = phone.replace(/[^0-9]/g, '');
  if (cleanPhone.length > 10 && cleanPhone.startsWith('91')) cleanPhone = cleanPhone.slice(2);
  if (cleanPhone.length > 10 && cleanPhone.startsWith('0')) cleanPhone = cleanPhone.slice(1);

  if (cleanPhone.length !== 10) {
    showToast('Kripya 10-digit number dalein', 'error');
    return;
  }

  resultBox.classList.remove('hidden');
  resultBox.innerHTML = '<div class="text-xs text-slate-400 text-center py-2">Searching...</div>';

  try {
    const res = await fetch('/api/public/lookup-customer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: cleanPhone })
    });

    const data = await res.json();
    if (!res.ok || !data.found) {
      resultBox.innerHTML = `
        <div class="text-xs text-slate-300">
          <div class="font-bold text-amber-400">Ye mobile number abhi judaa nahi hai.</div>
          <p class="text-[11px] text-slate-400 mt-1">Koi baat nahi! Niche form bhariye, aapka 1st appointment book hote hi aapka VIP Loyalty Card shuru ho jayega!</p>
          <a href="#booking" class="inline-block mt-2 text-xs font-bold text-amber-300 underline">Niche Book Karein →</a>
        </div>
      `;
      return;
    }

    const c = data.customer;
    const loyalty = data.loyalty;

    let rewardBadge = '';
    if (loyalty.isRewardDue) {
      if (loyalty.reward === 'FREE_CUT') {
        rewardBadge = '<div class="mt-2 p-2 rounded-lg bg-pink-950/80 border border-pink-500 text-pink-300 text-xs font-black animate-pulse">🎉 Mubarak! Aapka agla haircut 100% FREE hai!</div>';
      } else if (loyalty.reward === 'HALF_PRICE') {
        rewardBadge = '<div class="mt-2 p-2 rounded-lg bg-amber-950/80 border border-amber-500 text-amber-300 text-xs font-black animate-pulse">🔥 Mubarak! Agle visit par 50% HALF PRICE DISCOUNT!</div>';
      }
    } else {
      rewardBadge = `<div class="mt-2 text-[11px] text-slate-400">${loyalty.visitsUntilNextReward} visit baki hai agle reward ke liye.</div>`;
    }

    resultBox.innerHTML = `
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <div class="text-sm font-bold text-white">Namaste, ${c.name}!</div>
          <span class="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-500/40">VIP Member</span>
        </div>
        <div class="text-xs text-slate-300">
          Kul Visits: <strong>${c.total_visits}</strong> | Loyalty Stamp Progress: <strong>${loyalty.progressText}</strong>
        </div>
        ${rewardBadge}
        <div class="pt-2 border-t border-slate-800 flex items-center justify-between">
          <a href="${data.personalLink}" class="text-xs font-bold text-amber-400 underline hover:text-amber-300 flex items-center gap-1">
            <span>Aapka Secret Personal Link Kholein</span>
            <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
          </a>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();

  } catch(err) {
    console.error('Loyalty lookup error:', err);
    resultBox.innerHTML = '<div class="text-xs text-red-400">Server error, dubara koshish karein.</div>';
  }
}
