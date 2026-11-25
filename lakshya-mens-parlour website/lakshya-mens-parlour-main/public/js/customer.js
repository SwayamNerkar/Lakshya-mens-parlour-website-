// ============================================================
// LAKSHYA MENS PARLOUR - CUSTOMER CLIENT PORTAL
// Handles /c/:token personal link, slots, bookings, loyalty
// ============================================================

let currentToken = '';
let customerData = null;
let allServices = [];
let selectedDate = '';
let selectedSlot = '';
let selectedServices = [];
let rescheduleBookingId = null;
let rescheduleSelectedDate = '';
let rescheduleSelectedSlot = '';

// Extract token from URL /c/<token>
function getTokenFromUrl() {
  const path = window.location.pathname;
  const match = path.match(/\/c\/([^/?#]+)/);
  if (match && match[1]) {
    return match[1];
  }
  // Fallback to query param or demo token
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('token') || 'rahul_m8x2';
}

// Simple Toast Notification
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

// Initial Boot
document.addEventListener('DOMContentLoaded', async () => {
  currentToken = getTokenFromUrl();
  await loadCustomerPortal();
  setupDateSelector();
  if (window.lucide) {
    window.lucide.createIcons();
  }
});

// Load full customer portal data
async function loadCustomerPortal() {
  try {
    const res = await fetch(`/api/c/${currentToken}`);
    if (!res.ok) {
      document.getElementById('loading-screen').innerHTML = `
        <div class="text-center p-6 glass-panel max-w-sm">
          <div class="text-3xl mb-2">⚠️</div>
          <h2 class="text-base font-bold text-red-400 mb-1">Grahak Link Nahi Mila</h2>
          <p class="text-xs text-slate-400 mb-4">Ye secret link galat hai ya expire ho chuka hai. Kripya salon owner se naya link mangein.</p>
          <a href="/" class="btn-gold px-4 py-2 rounded-xl text-xs font-bold inline-block">Go to Owner Login</a>
        </div>
      `;
      return;
    }

    customerData = await res.json();
    renderCustomerInfo(customerData);
    renderActiveBooking(customerData.activeBookings);
    renderLoyaltyCard(customerData.customer.total_visits, customerData.customer.loyalty);
    renderRateList(customerData.services);
    renderServicesChecklist(customerData.services);

    // Fade out loader and show app
    document.getElementById('loading-screen').classList.add('hidden');
    document.getElementById('customer-app').classList.remove('hidden');

  } catch (err) {
    console.error('Error loading customer portal:', err);
    showToast('Internet connection check karein', 'error');
  }
}

// Render Header & Personalized Customer details
function renderCustomerInfo(data) {
  const { customer, shop } = data;

  // Shop details
  if (shop.address) document.getElementById('shop-address-text').textContent = shop.address;
  if (shop.phone) document.getElementById('btn-call-shop').href = `tel:+91${shop.phone.replace(/[^0-9]/g, '')}`;
  if (shop.maps_url) document.getElementById('btn-maps-shop').href = shop.maps_url;
  if (shop.active_offer) {
    document.getElementById('salon-offer-text').textContent = shop.active_offer;
    document.getElementById('salon-offer-card').classList.remove('hidden');
  } else {
    document.getElementById('salon-offer-card').classList.add('hidden');
  }

  // Customer profile
  const firstName = customer.name.split(' ')[0] || customer.name;
  document.getElementById('cust-name-text').textContent = `${firstName} bhai! 🙏`;
  document.getElementById('cust-phone-text').textContent = `+91 ${customer.phone}`;
  document.getElementById('cust-total-visits').textContent = customer.total_visits;
  if (customer.photo_url) {
    document.getElementById('cust-avatar-img').src = customer.photo_url;
  }
}

// Render active booking ticket pass
function renderActiveBooking(activeBookings) {
  const section = document.getElementById('active-booking-section');
  if (!activeBookings || activeBookings.length === 0) {
    section.classList.add('hidden');
    return;
  }

  const latest = activeBookings[0];
  section.classList.remove('hidden');

  document.getElementById('booking-ticket-code').textContent = latest.booking_code;

  // Format date display
  const d = new Date(latest.booking_date + 'T00:00:00');
  const dateFormatted = d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
  document.getElementById('booking-ticket-time').textContent = `${dateFormatted} at ${formatTime12h(latest.slot_time)}`;

  // Services
  const svcsText = Array.isArray(latest.services) ? latest.services.join(', ') : 'Salon Services';
  document.getElementById('booking-ticket-services').textContent = svcsText;

  rescheduleBookingId = latest.id;
}

// Render Loyalty Stamp Card
function renderLoyaltyCard(totalVisits, loyalty) {
  const currentInCycle = totalVisits % 5;
  document.getElementById('loyalty-status-msg').textContent = loyalty.progressText || `${currentInCycle} of 5 visits completed`;

  // Update stamps 1 to 5
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById(`stamp-${i}`);
    if (!el) continue;

    if (i <= currentInCycle) {
      el.className = 'stamp-slot completed text-xs';
      el.innerHTML = '✓';
    } else {
      if (i === 3) {
        el.className = 'stamp-slot reward text-xs font-bold';
        el.innerHTML = 'FREE';
      } else if (i === 5) {
        el.className = 'stamp-slot reward text-xs font-bold';
        el.innerHTML = '50%';
      } else {
        el.className = 'stamp-slot pending text-xs';
        el.innerHTML = i;
      }
    }
  }

  // Check if reward is due right now
  const rewardAlert = document.getElementById('reward-banner-alert');
  const rewardText = document.getElementById('reward-banner-text');

  if (loyalty.isRewardDue) {
    rewardAlert.classList.remove('hidden');
    if (loyalty.reward === 'FREE_CUT') {
      rewardText.textContent = 'MUBARAK! Aapka agla haircut bilkul FREE hai! 🎁';
    } else if (loyalty.reward === 'HALF_PRICE') {
      rewardText.textContent = 'MUBARAK! Agli visit par flat 50% discount milega! 🏷️';
    }
  } else {
    rewardAlert.classList.add('hidden');
  }
}

// Setup 7-Day Date Selector
function setupDateSelector() {
  const container = document.getElementById('date-selector');
  container.innerHTML = '';

  const today = new Date();
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    let labelDay = i === 0 ? 'Aaj (Today)' : i === 1 ? 'Kal (Tomorrow)' : dayLabels[d.getDay()];
    let dateNum = `${d.getDate()} ${monthLabels[d.getMonth()]}`;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `date-btn shrink-0 px-3.5 py-2 rounded-xl text-center border transition ${
      i === 0 
        ? 'bg-amber-500 text-black border-amber-400 font-bold shadow-md shadow-amber-500/30' 
        : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
    }`;
    btn.dataset.date = dateStr;
    btn.innerHTML = `
      <div class="text-[10px] uppercase font-bold tracking-wider">${labelDay}</div>
      <div class="text-xs font-extrabold mt-0.5">${dateNum}</div>
    `;

    btn.onclick = () => {
      document.querySelectorAll('#date-selector .date-btn').forEach(b => {
        b.className = 'date-btn shrink-0 px-3.5 py-2 rounded-xl text-center border transition bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700';
      });
      btn.className = 'date-btn shrink-0 px-3.5 py-2 rounded-xl text-center border transition bg-amber-500 text-black border-amber-400 font-bold shadow-md shadow-amber-500/30';
      selectedDate = dateStr;
      fetchSlotsForDate(selectedDate);
    };

    container.appendChild(btn);

    if (i === 0) {
      selectedDate = dateStr;
    }
  }

  fetchSlotsForDate(selectedDate);
}

// Fetch Slots for selected Date
async function fetchSlotsForDate(dateStr) {
  const grid = document.getElementById('slots-grid');
  const countInfo = document.getElementById('slot-count-info');
  const closedNotice = document.getElementById('slot-closed-notice');

  grid.innerHTML = '<div class="col-span-3 text-center py-4 text-xs text-slate-400">Slots load ho rahe hain...</div>';
  closedNotice.classList.add('hidden');
  grid.classList.remove('hidden');

  try {
    const res = await fetch(`/api/c/${currentToken}/slots?date=${dateStr}`);
    const data = await res.json();

    if (data.isClosed) {
      grid.classList.add('hidden');
      closedNotice.textContent = data.reason || 'Shop is closed on this day';
      closedNotice.classList.remove('hidden');
      countInfo.textContent = 'Closed';
      return;
    }

    grid.innerHTML = '';
    const availableSlots = data.slots.filter(s => s.isAvailable);
    countInfo.textContent = `${availableSlots.length} slots open (Capacity: ${data.capacity} Barbers)`;

    if (data.slots.length === 0) {
      grid.innerHTML = '<div class="col-span-3 text-center py-4 text-xs text-slate-400">Koi slot uplabdh nahi hai</div>';
      return;
    }

    selectedSlot = '';

    data.slots.forEach(slot => {
      const pill = document.createElement('div');
      pill.dataset.time = slot.time;

      if (!slot.isAvailable) {
        pill.className = 'slot-pill slot-full p-2 rounded-xl border text-center';
        pill.innerHTML = `
          <div class="text-xs font-semibold text-slate-500">${slot.displayTime}</div>
          <div class="text-[9px] text-red-400/80 mt-0.5">${slot.status === 'full' ? 'Full (2/2)' : slot.status === 'past' ? 'Passed' : 'Blocked'}</div>
        `;
      } else {
        const spotsText = slot.availableSpots === 1 ? '1 slot left' : 'Available';
        pill.className = 'slot-pill p-2 rounded-xl border border-slate-800 bg-slate-900/90 text-center hover:bg-slate-800 text-slate-200';
        pill.innerHTML = `
          <div class="text-xs font-bold text-white">${slot.displayTime}</div>
          <div class="text-[9px] ${slot.availableSpots === 1 ? 'text-amber-400 font-bold' : 'text-emerald-400'} mt-0.5">${spotsText}</div>
        `;

        pill.onclick = () => {
          document.querySelectorAll('#slots-grid .slot-pill').forEach(p => {
            if (!p.classList.contains('slot-full')) {
              p.className = 'slot-pill p-2 rounded-xl border border-slate-800 bg-slate-900/90 text-center hover:bg-slate-800 text-slate-200';
            }
          });
          pill.className = 'slot-pill slot-selected p-2 rounded-xl border text-center';
          selectedSlot = slot.time;
        };
      }

      grid.appendChild(pill);
    });

  } catch (err) {
    console.error('Error fetching slots:', err);
    countInfo.textContent = 'Error loading slots';
  }
}

// Render Services Checklist for Booking (WITH HIGH-RES SALON PHOTOS)
function renderServicesChecklist(services) {
  allServices = services || [];
  const container = document.getElementById('services-checklist');
  container.innerHTML = '';

  services.forEach((s, idx) => {
    const item = document.createElement('label');
    const isChecked = idx === 0;
    if (isChecked) selectedServices.push(s.name);

    const defaultImg = s.category === 'Beard' ? '/images/beard.jpg' :
                       s.category === 'Spa' ? '/images/massage.jpg' :
                       s.category === 'Facial' ? '/images/facial.jpg' :
                       s.category === 'Combo' ? '/images/interior-chairs.jpg' : '/images/haircut.jpg';
    const imgUrl = s.image_url || defaultImg;

    item.className = `flex items-center justify-between p-2.5 rounded-2xl border cursor-pointer transition-all duration-200 ${
      isChecked 
        ? 'bg-amber-500/10 border-amber-500 shadow-md shadow-amber-500/10' 
        : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
    }`;

    item.innerHTML = `
      <div class="flex items-center gap-3">
        <input type="checkbox" name="booking-service" value="${s.name}" data-price="${s.price}" ${isChecked ? 'checked' : ''} class="w-4 h-4 rounded text-amber-500 focus:ring-0 bg-slate-800 border-slate-700 shrink-0">
        <div class="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-slate-700/80 shadow">
          <img src="${imgUrl}" alt="${s.name}" class="w-full h-full object-cover">
        </div>
        <div>
          <div class="text-xs font-bold text-white flex items-center gap-1.5 flex-wrap">
            <span>${s.name}</span>
            ${s.name_hi ? `<span class="text-[10px] text-amber-400 font-semibold">(${s.name_hi})</span>` : ''}
          </div>
          <div class="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1.5">
            <span class="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-medium">${s.category}</span>
            <span>•</span>
            <span>${s.duration_mins} mins</span>
          </div>
        </div>
      </div>
      <div class="text-right shrink-0">
        <div class="text-sm font-black text-amber-400 font-display">₹${s.price}</div>
      </div>
    `;

    const checkbox = item.querySelector('input');
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        item.className = 'flex items-center justify-between p-2.5 rounded-2xl border cursor-pointer transition-all duration-200 bg-amber-500/10 border-amber-500 shadow-md shadow-amber-500/10';
      } else {
        item.className = 'flex items-center justify-between p-2.5 rounded-2xl border cursor-pointer transition-all duration-200 bg-slate-900/80 border-slate-800 hover:border-slate-700';
      }
      calculateTotal();
    });

    container.appendChild(item);
  });

  calculateTotal();
}

// Calculate total estimated amount for selected services
function calculateTotal() {
  const checkboxes = document.querySelectorAll('#services-checklist input[type="checkbox"]:checked');
  selectedServices = [];
  let total = 0;

  checkboxes.forEach(cb => {
    selectedServices.push(cb.value);
    total += parseFloat(cb.dataset.price || '0');
  });

  document.getElementById('estimated-price').textContent = `₹${total}`;
}

// Render Full Services Menu / Rate List with Luxury Photo Cards
function renderRateList(services) {
  const container = document.getElementById('rate-list-container');
  container.innerHTML = '';

  services.forEach(s => {
    const card = document.createElement('div');
    const defaultImg = s.category === 'Beard' ? '/images/beard.jpg' :
                       s.category === 'Spa' ? '/images/massage.jpg' :
                       s.category === 'Facial' ? '/images/facial.jpg' :
                       s.category === 'Combo' ? '/images/interior-chairs.jpg' : '/images/haircut.jpg';
    const imgUrl = s.image_url || defaultImg;

    card.className = 'p-3 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-amber-500/40 transition flex items-center justify-between gap-3 shadow-md';
    card.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-amber-500/20 shadow">
          <img src="${imgUrl}" alt="${s.name}" class="w-full h-full object-cover">
        </div>
        <div>
          <div class="text-xs font-bold text-white flex items-center gap-1.5 flex-wrap">
            <span>${s.name}</span>
            ${s.name_hi ? `<span class="text-[11px] text-amber-400 font-semibold">(${s.name_hi})</span>` : ''}
          </div>
          <div class="text-[11px] text-slate-300 mt-0.5 leading-tight">${s.description || `${s.duration_mins} min grooming session`}</div>
          <div class="text-[10px] text-slate-400 mt-1 flex items-center gap-2">
            <span class="bg-slate-800 px-1.5 py-0.2 rounded text-[9px] font-bold text-slate-300">${s.category}</span>
            <span>•</span>
            <span>⏱️ ${s.duration_mins} min</span>
          </div>
        </div>
      </div>
      <div class="text-right shrink-0">
        <div class="text-base font-black text-amber-400 font-display">₹${s.price}</div>
        <button onclick="quickSelectService('${s.name}')" class="mt-1 text-[10px] font-bold text-amber-300 hover:underline block text-right">
          Book Slot →
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

function quickSelectService(serviceName) {
  const cb = document.querySelector(`#services-checklist input[value="${serviceName}"]`);
  if (cb) {
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));
  }
  document.getElementById('services-checklist').scrollIntoView({ behavior: 'smooth' });
  showToast(`Selected: ${serviceName}`, 'info');
}

// Submit Booking Form
async function submitBooking() {
  if (!selectedDate) {
    showToast('Kripya tarikh chunein', 'error');
    return;
  }
  if (!selectedSlot) {
    showToast('Kripya samay (slot) chunein', 'error');
    return;
  }
  if (selectedServices.length === 0) {
    showToast('Kripya kam se kam ek service chunein', 'error');
    return;
  }

  const notes = document.getElementById('booking-notes').value.trim();
  const btn = document.getElementById('btn-confirm-booking');
  btn.disabled = true;
  btn.innerHTML = '<span>Booking ho rahi hai...</span>';

  try {
    const res = await fetch(`/api/c/${currentToken}/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: selectedDate,
        slot_time: selectedSlot,
        services: selectedServices,
        notes
      })
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Booking fail ho gayi', 'error');
      btn.disabled = false;
      btn.innerHTML = '<span>Slot Confirm Karein</span> <i data-lucide="arrow-right" class="w-4 h-4"></i>';
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    // Play celebration confetti
    triggerCelebration();

    // Populate modal
    document.getElementById('modal-code').textContent = data.bookingCode;
    document.getElementById('modal-date').textContent = data.date;
    document.getElementById('modal-time').textContent = formatTime12h(data.slot_time);
    document.getElementById('modal-services').textContent = data.services.join(', ');

    document.getElementById('booking-success-modal').classList.remove('hidden');

    // Reload customer portal to show active booking ticket
    await loadCustomerPortal();
    fetchSlotsForDate(selectedDate);

  } catch (err) {
    console.error('Error booking slot:', err);
    showToast('Network error, kripya dubara try karein', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Slot Confirm Karein</span> <i data-lucide="arrow-right" class="w-4 h-4"></i>';
    if (window.lucide) window.lucide.createIcons();
  }
}

function closeSuccessModal() {
  document.getElementById('booking-success-modal').classList.add('hidden');
}

// Confetti celebration burst
function triggerCelebration() {
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#f59e0b', '#d4af37', '#10b981', '#3b82f6', '#ffffff']
    });
  }
}

// Cancel Active Booking
async function cancelActiveBooking() {
  if (!confirm('Kya aap sach me ye booking cancel karna chahte hain?')) return;

  try {
    const res = await fetch(`/api/c/${currentToken}/cancel-booking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: rescheduleBookingId })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Booking cancel ho gayi', 'info');
      await loadCustomerPortal();
      fetchSlotsForDate(selectedDate);
    } else {
      showToast(data.error || 'Cancel nahi ho saki', 'error');
    }
  } catch (err) {
    showToast('Network error', 'error');
  }
}

// Reschedule Modal Handlers
function openRescheduleModal() {
  const modal = document.getElementById('reschedule-modal');
  modal.classList.remove('hidden');

  const container = document.getElementById('reschedule-date-selector');
  container.innerHTML = '';
  const today = new Date();
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `px-2.5 py-1.5 rounded-lg text-xs font-bold border ${i === 0 ? 'bg-amber-500 text-black border-amber-400' : 'bg-slate-900 text-slate-300 border-slate-800'}`;
    btn.textContent = i === 0 ? 'Today' : `${dayLabels[d.getDay()]} ${d.getDate()}`;

    btn.onclick = () => {
      document.querySelectorAll('#reschedule-date-selector button').forEach(b => {
        b.className = 'px-2.5 py-1.5 rounded-lg text-xs font-bold border bg-slate-900 text-slate-300 border-slate-800';
      });
      btn.className = 'px-2.5 py-1.5 rounded-lg text-xs font-bold border bg-amber-500 text-black border-amber-400';
      rescheduleSelectedDate = dateStr;
      loadRescheduleSlots(dateStr);
    };

    container.appendChild(btn);
    if (i === 0) rescheduleSelectedDate = dateStr;
  }

  loadRescheduleSlots(rescheduleSelectedDate);
}

async function loadRescheduleSlots(dateStr) {
  const grid = document.getElementById('reschedule-slots-grid');
  grid.innerHTML = '<div class="col-span-3 text-center text-xs text-slate-400 py-2">Loading...</div>';

  try {
    const res = await fetch(`/api/c/${currentToken}/slots?date=${dateStr}`);
    const data = await res.json();
    grid.innerHTML = '';

    if (data.isClosed || !data.slots) {
      grid.innerHTML = '<div class="col-span-3 text-center text-xs text-red-400 py-2">Shop closed</div>';
      return;
    }

    rescheduleSelectedSlot = '';
    data.slots.forEach(slot => {
      const btn = document.createElement('button');
      btn.type = 'button';
      if (!slot.isAvailable) {
        btn.disabled = true;
        btn.className = 'p-1.5 rounded text-[11px] bg-slate-900 text-slate-600 border border-slate-800/50 cursor-not-allowed';
        btn.textContent = slot.displayTime;
      } else {
        btn.className = 'p-1.5 rounded text-[11px] font-bold bg-slate-800 text-slate-200 border border-slate-700 hover:border-amber-400';
        btn.textContent = slot.displayTime;
        btn.onclick = () => {
          document.querySelectorAll('#reschedule-slots-grid button:not(:disabled)').forEach(b => {
            b.className = 'p-1.5 rounded text-[11px] font-bold bg-slate-800 text-slate-200 border border-slate-700 hover:border-amber-400';
          });
          btn.className = 'p-1.5 rounded text-[11px] font-bold bg-amber-500 text-black border-amber-400';
          rescheduleSelectedSlot = slot.time;
        };
      }
      grid.appendChild(btn);
    });
  } catch (err) {
    grid.innerHTML = '<div class="col-span-3 text-xs text-red-400">Error</div>';
  }
}

async function submitReschedule() {
  if (!rescheduleSelectedDate || !rescheduleSelectedSlot) {
    showToast('Kripya naya slot chunein', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/c/${currentToken}/reschedule-booking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookingId: rescheduleBookingId,
        newDate: rescheduleSelectedDate,
        newSlotTime: rescheduleSelectedSlot
      })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Booking reschedule ho gayi!', 'success');
      closeRescheduleModal();
      await loadCustomerPortal();
      fetchSlotsForDate(selectedDate);
    } else {
      showToast(data.error || 'Reschedule fail ho gaya', 'error');
    }
  } catch(err) {
    showToast('Network error', 'error');
  }
}

function closeRescheduleModal() {
  document.getElementById('reschedule-modal').classList.add('hidden');
}

// Share personal link helper
function sharePersonalLink() {
  const url = window.location.href;
  const title = 'Lakshya Mens Parlour Booking';
  const text = 'Book your haircut slot at Lakshya Mens Parlour, Rajendra Nagar, Nagpur:';

  if (navigator.share) {
    navigator.share({ title, text, url }).catch(() => {});
  } else {
    navigator.clipboard.writeText(url);
    showToast('Shop link clipboard par copy ho gaya!', 'success');
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
