import { initializeApp } from "./firebase-sdk/firebase-app.js";
import { getDatabase, ref, onValue, set } from "./firebase-sdk/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAh1MTXW5oPCHFakzupQIXV83fCq_rlx0E",
  authDomain: "ogrenci-takip-b5435.firebaseapp.com",
  projectId: "ogrenci-takip-b5435",
  storageBucket: "ogrenci-takip-b5435.firebasestorage.app",
  messagingSenderId: "340586474446",
  appId: "1:340586474446:web:d2e15f33cb867c0636599f",
  databaseURL: "https://ogrenci-takip-b5435-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

/* ===== Constants ===== */
const PRAYERS = [
  { key: 'sabah', letter: 'S', label: 'Sabah' },
  { key: 'ogle', letter: 'Ö', label: 'Öğle' },
  { key: 'ikindi', letter: 'İ', label: 'İkindi' },
  { key: 'aksam', letter: 'A', label: 'Akşam' },
  { key: 'yatsi', letter: 'Y', label: 'Yatsı' },
  { key: 'yatak', letter: 'YY', label: 'Yatak Yoklaması' },
  { key: 'tesbih', letter: 'T', label: 'Tesbih Namazı' },
  { key: 'izinDonus', letter: 'İD', label: 'İzin Dönüş' },
  { key: 'takviye', letter: 'T', label: 'Takviye' }
];
const POINTS_PER_CHECK = 10;
const MAX_WEEKLY_POINTS = 450; // (5 hafta içi * 70) + 30 (Pazar) + 20 (Cmt) + 50 (Haftalık)
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const DAYS_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/* ===== State ===== */
let state = {
  students: [],
  records: {},
  currentWeekStart: getSunday(new Date()),
  selectedDayIndex: getTodayIndex(),
  currentPage: 'tracking'
};

let sortableInstance = null;
let renderLockUntil = 0;

/* ===== TV Mode Helpers ===== */
function isTVMode() {
  return new URLSearchParams(window.location.search).has('tv');
}

/* ===== Date Helpers ===== */
function getSunday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getTodayIndex() {
  return new Date().getDay();
}

function getWeekKey(weekStart) {
  const d = new Date(weekStart);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDayDate(weekStart, dayIndex) {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + dayIndex);
  return d;
}

function getDayKey(weekStart, dayIndex) {
  const d = getDayDate(weekStart, dayIndex);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatWeekRange(weekStart) {
  const start = new Date(weekStart);
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()} - ${end.getDate()} ${MONTHS[start.getMonth()]} ${start.getFullYear()}`;
  }
  return `${start.getDate()} ${MONTHS[start.getMonth()]} - ${end.getDate()} ${MONTHS[end.getMonth()]} ${start.getFullYear()}`;
}

function getWeekNumber(weekStart) {
  const d = new Date(weekStart);
  d.setHours(0, 0, 0, 0);
  // Haftayı Pazar'dan başlatacak şekilde ayarla
  d.setDate(d.getDate() + 3 - (d.getDay() % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() % 7)) / 7);
}

function isCurrentWeek(weekStart) {
  const now = getSunday(new Date());
  return getWeekKey(weekStart) === getWeekKey(now);
}

/* ===== Data Helpers ===== */
function ensureRecordStructure(weekKey, studentName) {
  if (!state.records[weekKey]) state.records[weekKey] = {};
  if (!state.records[weekKey][studentName]) {
    state.records[weekKey][studentName] = { days: {}, tesbih: false, izinDonus: false, deductions: {} };
  }
  if (state.records[weekKey][studentName].izinDonus === undefined) {
    state.records[weekKey][studentName].izinDonus = false;
  }
  if (!state.records[weekKey][studentName].days) {
    state.records[weekKey][studentName].days = {};
  }
  if (!state.records[weekKey][studentName].deductions) {
    state.records[weekKey][studentName].deductions = {};
  }
}

function getPrayerState(weekKey, studentName, dayKey, prayerKey) {
  ensureRecordStructure(weekKey, studentName);
  const record = state.records[weekKey][studentName];
  if (prayerKey === 'tesbih') return record.tesbih;
  if (prayerKey === 'izinDonus') return record.izinDonus;
  if (!record.days[dayKey]) return false;
  return !!record.days[dayKey][prayerKey];
}

function togglePrayer(studentName, dayIndex, prayerKey, btnElement) {
  if (isTVMode()) return;
  const weekKey = getWeekKey(state.currentWeekStart);
  const dayKey = getDayKey(state.currentWeekStart, dayIndex);
  ensureRecordStructure(weekKey, studentName);
  const record = state.records[weekKey][studentName];

  if (prayerKey === 'tesbih') {
    record.tesbih = !record.tesbih;
  } else if (prayerKey === 'izinDonus') {
    record.izinDonus = !record.izinDonus;
  } else if (prayerKey === 'takviye') {
    if (!record.days[dayKey]) record.days[dayKey] = {};
    const current = record.days[dayKey][prayerKey];
    record.days[dayKey][prayerKey] = current ? false : 10;
  } else {
    if (!record.days[dayKey]) record.days[dayKey] = {};
    record.days[dayKey][prayerKey] = !record.days[dayKey][prayerKey];
  }

  if (btnElement) {
    const isChecked = getPrayerState(weekKey, studentName, dayKey, prayerKey);
    btnElement.classList.toggle('checked', isChecked);
    
    // Update points on the card immediately
    const card = btnElement.closest('.student-card');
    if (card) {
      const pointsSpan = card.querySelector('.student-points');
      if (pointsSpan) {
        requestAnimationFrame(() => {
          const newWeekPoints = getStudentWeeklyPoints(weekKey, studentName);
          pointsSpan.textContent = `${newWeekPoints} puan`;
        });
      }
    }
    if (isPreviewVisible()) renderPreview();
  }
  
  renderLockUntil = Date.now() + 1000; // Lock rendering for 1 second
  saveState();
}

function getStudentDayPoints(weekKey, studentName, dayKey) {
  ensureRecordStructure(weekKey, studentName);
  const record = state.records[weekKey][studentName];
  let points = 0;
  if (record.days[dayKey]) {
    for (const key of ['sabah', 'ogle', 'ikindi', 'aksam', 'yatsi', 'yatak']) {
      if (record.days[dayKey][key]) points += POINTS_PER_CHECK;
    }
    // Takviye specifically
    if (record.days[dayKey]['takviye']) {
      const val = record.days[dayKey]['takviye'];
      points += (typeof val === 'number') ? val : POINTS_PER_CHECK;
    }
  }
  
  if (record.deductions) {
    for (const key of ['sabah', 'ogle', 'ikindi', 'aksam', 'yatsi', 'yatak', 'takviye']) {
      const dedKey = `${dayKey}_${key}`;
      if (record.deductions[dedKey]) {
        if (record.deductions[dedKey].takke) points -= 5;
        if (record.deductions[dedKey].pantolon) points -= 5;
      }
    }
  }
  return points;
}

function getStudentWeeklyPoints(weekKey, studentName) {
  ensureRecordStructure(weekKey, studentName);
  const record = state.records[weekKey][studentName];
  let points = 0;
  for (let i = 0; i < 7; i++) {
    const dayKey = getDayKey(state.currentWeekStart, i);
    points += getStudentDayPoints(weekKey, studentName, dayKey);
  }
  if (record.tesbih) points += 20;
  if (record.izinDonus) points += 30;
  
  if (record.deductions) {
    if (record.deductions['tesbih']) {
      if (record.deductions['tesbih'].takke) points -= 5;
      if (record.deductions['tesbih'].pantolon) points -= 5;
    }
    if (record.deductions['izinDonus']) {
      if (record.deductions['izinDonus'].takke) points -= 5;
      if (record.deductions['izinDonus'].pantolon) points -= 5;
    }
  }
  return points;
}

/* ===== Persistence & Offline-First Sync ===== */
const LOCAL_STORAGE_KEY = 'talebe_takip_local_state_v1';
const PENDING_CHANGES_KEY = 'talebe_takip_pending_sync';

let isOnline = navigator.onLine;
let hasPendingSync = false;
let syncTimeout = null;

function updateNetworkBadge(status) {
  const badge = document.getElementById('net-status-badge');
  if (!badge) return;
  badge.className = `net-status-badge ${status}`;
  const textEl = badge.querySelector('.status-text');
  if (!textEl) return;
  if (status === 'online') {
    textEl.textContent = 'Çevrimiçi';
    badge.title = 'İnternet bağlantısı var, veriler güncel';
  } else if (status === 'offline') {
    textEl.textContent = 'Çevrimdışı';
    badge.title = 'İnternet yok. Değişiklikler cihazda saklanıyor, internet gelince aktarılacak.';
  } else if (status === 'syncing') {
    textEl.textContent = 'Eşitleniyor...';
    badge.title = 'Bekleyen kayıtlar Firebase veritabanına aktarılıyor';
  }
}

function saveStateLocal() {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({
      students: state.students,
      records: state.records,
      updatedAt: Date.now()
    }));
  } catch (err) {
    console.warn('LocalStorage save failed:', err);
  }
}

function loadStateLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.students) {
        state.students = data.students || [];
        state.records = data.records || {};
        return true;
      }
    }
  } catch (err) {
    console.warn('LocalStorage load failed:', err);
  }
  return false;
}

function queuePendingSync() {
  hasPendingSync = true;
  try {
    localStorage.setItem(PENDING_CHANGES_KEY, '1');
  } catch (e) {}
  if (!navigator.onLine) {
    updateNetworkBadge('offline');
  }
}

function clearPendingSync() {
  hasPendingSync = false;
  try {
    localStorage.removeItem(PENDING_CHANGES_KEY);
  } catch (e) {}
}

function syncToServer() {
  if (!navigator.onLine) return;
  updateNetworkBadge('syncing');
  set(ref(db, 'puanlama_sistemi'), { students: state.students, records: state.records })
    .then(() => {
      clearPendingSync();
      updateNetworkBadge('online');
    })
    .catch((error) => {
      console.warn('Firebase Sync Error:', error);
      queuePendingSync();
      updateNetworkBadge('offline');
    });
}

function saveState() {
  // 1. Her zaman ve anında yerel hafızaya yaz (0 ms gecikme)
  saveStateLocal();
  queuePendingSync();

  // 2. Debounce ile Firebase'e aktar
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    syncToServer();
  }, 400);
}

function loadState() {
  // 1. Önce cihazdaki yerel veriyi yükle - sayfa anında dolsun
  const hasLocal = loadStateLocal();
  if (!hasLocal) {
    state.students = ['Ahmet', 'Mehmet', 'Yusuf', 'Ali', 'Ömer'];
    state.records = {};
  }
  
  // Bekleyen senkronizasyon var mı kontrol et
  if (localStorage.getItem(PENDING_CHANGES_KEY) === '1') {
    hasPendingSync = true;
  }

  // 2. Firebase bağlantısını dinle
  try {
    const dbRef = ref(db, 'puanlama_sistemi');
    onValue(dbRef, (snapshot) => {
      updateNetworkBadge(hasPendingSync ? 'syncing' : 'online');
      const data = snapshot.val();
      
      // Eğer cihazda henüz sunucuya gitmemiş yerel değişiklikler varsa, sunucu verisiyle ezme
      if (hasPendingSync) {
        syncToServer();
        return;
      }

      if (data) {
        state.students = data.students || [];
        state.records = data.records || {};
        saveStateLocal();
      } else {
        // Firebase boşsa yereldeki durumu oraya aktar
        saveState();
      }
      
      const previewVisible = isPreviewVisible();
      if (Date.now() < renderLockUntil) {
        if (state.currentPage === 'analysis') renderAnalysis();
        if (previewVisible) renderPreview();
        return;
      }
      
      renderStudentCards();
      if (state.currentPage === 'analysis') renderAnalysis();
      if (previewVisible) renderPreview();
    }, (error) => {
      console.warn('Firebase Listener offline / error:', error);
      updateNetworkBadge('offline');
    });
  } catch (e) {
    console.warn('Load failed:', e);
    updateNetworkBadge('offline');
  }

  // Ağ durumu dinleyicileri
  window.addEventListener('online', () => {
    updateNetworkBadge('syncing');
    showToast('İnternet bağlantısı sağlandı. Eşitleniyor...');
    syncToServer();
  });

  window.addEventListener('offline', () => {
    updateNetworkBadge('offline');
    showToast('İnternet bağlantısı kesildi. Çevrimdışı moddasınız.');
  });
}

/* ===== Toast ===== */
function showToast(message) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

/* ===== Render Functions ===== */
function updateNavIndicator() {
  const nav = document.getElementById('main-nav');
  const activeBtn = nav.querySelector('.nav-btn.active');
  const indicator = nav.querySelector('.nav-indicator');
  if (activeBtn && indicator) {
    indicator.style.left = activeBtn.offsetLeft + 'px';
    indicator.style.width = activeBtn.offsetWidth + 'px';
  }
}

function renderWeekNav() {
  document.getElementById('week-range').textContent = formatWeekRange(state.currentWeekStart);
  document.getElementById('week-label').textContent = `${getWeekNumber(state.currentWeekStart)}. Hafta`;
}

function renderDayTabs() {
  const container = document.getElementById('day-tabs');
  const todayIndex = getTodayIndex();
  const isCurrent = isCurrentWeek(state.currentWeekStart);

  container.innerHTML = '';
  DAYS_SHORT.forEach((dayName, i) => {
    const date = getDayDate(state.currentWeekStart, i);
    const tab = document.createElement('div');
    tab.role = 'button';
    tab.tabIndex = 0;
    tab.className = 'day-tab' +
      (i === state.selectedDayIndex ? ' active' : '') +
      (isCurrent && i === todayIndex ? ' today' : '');
    tab.innerHTML = `<span class="day-tab-name">${dayName}</span><span class="day-tab-date">${date.getDate()}</span>`;
    tab.addEventListener('click', (e) => { 
      e.preventDefault();
      state.selectedDayIndex = i; 
      renderDayTabs(); 
      renderStudentCards(); 
    });
    container.appendChild(tab);
  });
}

function renderStudentCards() {
  const container = document.getElementById('student-list');
  const weekKey = getWeekKey(state.currentWeekStart);
  const dayKey = getDayKey(state.currentWeekStart, state.selectedDayIndex);

  if (state.students.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👤</div><div class="empty-state-text">Henüz talebe eklenmedi.<br>Aşağıdaki butona tıklayarak başlayın.</div></div>';
    return;
  }

  container.innerHTML = '';
  state.students.forEach((name, idx) => {
    const card = document.createElement('div');
    card.className = 'student-card';
    card.dataset.id = name;
    card.style.animationDelay = `${idx * 0.05}s`;

    const dayPoints = getStudentDayPoints(weekKey, name, dayKey);
    const weekPoints = getStudentWeeklyPoints(weekKey, name);
    const initial = name.charAt(0).toUpperCase();

    // Header
    const header = document.createElement('div');
    header.className = 'student-card-header';
    header.innerHTML = `
      <div class="student-info">
        <div class="drag-handle" aria-label="Sürükle">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>
        </div>
        <span class="student-name">${name}</span>
      </div>
      <div class="student-meta">
        <span class="student-points">${weekPoints} puan</span>
        <div role="button" tabindex="0" class="student-edit-btn" data-student="${name}" aria-label="Düzenle">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </div>
        <div role="button" tabindex="0" class="student-delete-btn" data-student="${name}" aria-label="Sil">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </div>
      </div>`;

    // Prayer boxes
    const boxes = document.createElement('div');
    boxes.className = 'prayer-boxes';

    PRAYERS.forEach(prayer => {
      const isWeeklyTask = prayer.key === 'tesbih' || prayer.key === 'izinDonus';
      if (isWeeklyTask && state.selectedDayIndex !== 0) return; // Sadece Pazar günü göster
      
      // Pazar günü (index 0) sabah, ogle, ikindi olmasın
      if (state.selectedDayIndex === 0 && (prayer.key === 'sabah' || prayer.key === 'ogle' || prayer.key === 'ikindi')) return;

      // Cumartesi günü (index 6) ikindi, aksam, yatsi, yatak olmasın
      if (state.selectedDayIndex === 6 && (prayer.key === 'ikindi' || prayer.key === 'aksam' || prayer.key === 'yatsi' || prayer.key === 'yatak')) return;

      // Takviye butonu sadece hafta içi (Pazartesi-Cuma) olsun
      if (prayer.key === 'takviye' && (state.selectedDayIndex === 0 || state.selectedDayIndex === 6)) return;
      const checked = getPrayerState(weekKey, name, dayKey, prayer.key);
      const weeklyTaskChecked = isWeeklyTask && checked;
      const dedKey = isWeeklyTask ? prayer.key : `${dayKey}_${prayer.key}`;
      const record = state.records[weekKey][name];
      const hasDeductions = record.deductions && record.deductions[dedKey] && 
                           (record.deductions[dedKey].takke || record.deductions[dedKey].pantolon);

      const box = document.createElement('div');
      box.role = 'button';
      box.tabIndex = 0;
      box.className = 'prayer-box' +
        (checked ? ' checked' : '') +
        (isWeeklyTask ? ' tesbih' : '') +
        (hasDeductions ? ' has-deduction' : '');
      
      const score = (prayer.key === 'takviye' && typeof record.days[dayKey]?.['takviye'] === 'number') 
                    ? record.days[dayKey]['takviye'] 
                    : null;
      
      box.innerHTML = `<span class="prayer-letter">${score !== null ? score : prayer.letter}</span><span class="prayer-label">${prayer.label}</span>`;
      
      let pressTimer;
      let isLongPress = false;
      let startPos = { x: 0, y: 0 };

      box.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 && e.button !== undefined) return;
        startPos = { x: e.clientX, y: e.clientY };
        isLongPress = false;
        pressTimer = window.setTimeout(() => {
          isLongPress = true;
          if (prayer.key === 'takviye') {
            showTakviyeScoreModal(name, state.selectedDayIndex);
          } else {
            showOptionsModal(name, state.selectedDayIndex, prayer.key);
          }
        }, 500);
      });

      box.addEventListener('pointerup', (e) => {
        if (pressTimer) clearTimeout(pressTimer);
        
        const moveDist = Math.sqrt(Math.pow(e.clientX - startPos.x, 2) + Math.pow(e.clientY - startPos.y, 2));
        
        if (!isLongPress && moveDist < 10) {
          e.preventDefault();
          togglePrayer(name, state.selectedDayIndex, prayer.key, box);
          const newChecked = getPrayerState(weekKey, name, dayKey, prayer.key);
          if (newChecked) {
            box.classList.add('just-checked');
            setTimeout(() => box.classList.remove('just-checked'), 400);
          }
        }
      });

      box.addEventListener('pointerleave', () => {
        if (pressTimer) clearTimeout(pressTimer);
      });
      
      box.addEventListener('contextmenu', e => e.preventDefault());
      box.addEventListener('click', e => e.preventDefault());

      boxes.appendChild(box);
    });

    card.appendChild(header);
    card.appendChild(boxes);
    container.appendChild(card);
  });

  // Add delete event listeners
  container.querySelectorAll('.student-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showEditModal(btn.dataset.student);
    });
  });

  container.querySelectorAll('.student-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showDeleteModal(btn.dataset.student);
    });
  });

  // Initialize SortableJS
  if (sortableInstance) {
    sortableInstance.destroy();
  }
  if (typeof Sortable !== 'undefined') {
    sortableInstance = new Sortable(container, {
      animation: 150,
      handle: '.drag-handle',
      ghostClass: 'sortable-ghost',
      dragClass: 'sortable-drag',
      onEnd: function (evt) {
        const newOrder = Array.from(container.children)
          .filter(child => child.classList.contains('student-card'))
          .map(card => card.dataset.id);
        
        if (newOrder.length === state.students.length) {
          state.students = newOrder;
          renderLockUntil = Date.now() + 1000;
          saveState();
          // We do not call renderStudentCards here because DOM is already ordered and 
          // re-rendering would break the transition. But we might need to if other things depend on it.
          // Usually better to just leave it since DOM is correct.
        }
      }
    });
  }
}

function renderAnalysis() {
  const container = document.getElementById('analysis-content');
  const weekKey = getWeekKey(state.currentWeekStart);

  if (state.students.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-text">Analiz için öğrenci bulunmuyor.</div></div>';
    return;
  }

  // Calculate points and sort
  const data = state.students.map(name => ({
    name,
    points: getStudentWeeklyPoints(weekKey, name),
    initial: name.charAt(0).toUpperCase()
  })).sort((a, b) => b.points - a.points);

  let html = `<div class="analysis-header"><h2>📊 Haftalık Puan Tablosu</h2><p>${formatWeekRange(state.currentWeekStart)}</p><div class="analysis-max-info">Maksimum haftalık puan: ${MAX_WEEKLY_POINTS}</div></div>`;

  // Podium (top 3)
  if (data.length >= 3) {
    const medals = ['🥇', '🥈', '🥉'];
    const classes = ['gold', 'silver', 'bronze'];
    const order = [1, 0, 2]; // Display order: 2nd, 1st, 3rd
    html += '<div class="podium-section">';
    order.forEach(rank => {
      const d = data[rank];
      html += `<div class="podium-item" data-student="${d.name}">
        <div class="podium-name" title="${d.name}">${d.name}</div>
        <div class="podium-points">${d.points} pt</div>
        <div class="podium-bar ${classes[rank]}">${medals[rank]}</div>
      </div>`;
    });
    html += '</div>';
  }

  // Full leaderboard
  html += '<div class="leaderboard">';
  data.forEach((d, i) => {
    const pct = MAX_WEEKLY_POINTS > 0 ? (d.points / MAX_WEEKLY_POINTS * 100) : 0;
    html += `<div class="leaderboard-item" style="animation-delay:${i * 0.06}s" data-student="${d.name}">
      <div class="leaderboard-rank">${i + 1}</div>
      <div class="leaderboard-info">
        <div class="leaderboard-name">${d.name}</div>
        <div class="leaderboard-bar-container"><div class="leaderboard-bar-fill" style="width:0%;" data-width="${pct}%"></div></div>
      </div>
      <div style="text-align:right">
        <div class="leaderboard-points">${d.points}</div>
        <div class="leaderboard-max">/ ${MAX_WEEKLY_POINTS}</div>
      </div>
    </div>`;
  });
  html += '</div>';

  container.innerHTML = html;

  // Animate bars
  requestAnimationFrame(() => {
    container.querySelectorAll('.leaderboard-bar-fill').forEach(bar => {
      bar.style.width = bar.dataset.width;
    });
  });

  // Add click listeners for details
  container.querySelectorAll('.leaderboard-item, .podium-item').forEach(item => {
    item.addEventListener('click', () => {
      showStudentDetails(item.dataset.student);
    });
  });
}

/* ===== Modal Functions ===== */
function showStudentDetails(name) {
  const weekKey = getWeekKey(state.currentWeekStart);
  ensureRecordStructure(weekKey, name);
  const record = state.records[weekKey][name];
  const points = getStudentWeeklyPoints(weekKey, name);
  const initial = name.charAt(0).toUpperCase();

  // Calculate stats for the current week
  let takkeCount = 0;
  let pantolonCount = 0;
  let totalDeds = 0;

  if (record.deductions) {
    for (const key in record.deductions) {
      if (record.deductions[key].takke) { takkeCount++; totalDeds += 5; }
      if (record.deductions[key].pantolon) { pantolonCount++; totalDeds += 5; }
    }
  }

  // Calculate missing prayers
  let checkedPrayers = 0;
  for (let i = 0; i < 7; i++) {
    const dKey = getDayKey(state.currentWeekStart, i);
    if (record.days && record.days[dKey]) {
      for (const p of ['sabah', 'ogle', 'ikindi', 'aksam', 'yatsi', 'yatak']) {
        if (record.days[dKey][p]) checkedPrayers++;
      }
    }
  }
  const missingPrayers = (6 * 7) - checkedPrayers; // 42 total daily slots

  // Update Modal
  document.getElementById('detail-avatar').style.display = 'none';
  document.getElementById('detail-title').textContent = name;
  document.getElementById('stat-total-points').textContent = points;
  document.getElementById('stat-total-deductions').textContent = `-${totalDeds}`;
  document.getElementById('stat-missing-prayers').textContent = `${missingPrayers} vakit`;
  document.getElementById('stat-takke-count').textContent = `${takkeCount} kez`;
  document.getElementById('stat-pantolon-count').textContent = `${pantolonCount} kez`;
  
  const tesbihBadge = document.getElementById('stat-tesbih-status');
  if (record.tesbih) {
    tesbihBadge.textContent = 'Yapıldı';
    tesbihBadge.className = 'badge badge-success';
  } else {
    tesbihBadge.textContent = 'Yapılmadı';
    tesbihBadge.className = 'badge';
  }

  const izinBadge = document.getElementById('stat-izindonus-status');
  if (record.izinDonus) {
    izinBadge.textContent = 'Yapıldı';
    izinBadge.className = 'badge badge-success';
  } else {
    izinBadge.textContent = 'Yapılmadı';
    izinBadge.className = 'badge';
  }

  document.getElementById('details-modal-overlay').classList.add('visible');
}

function hideDetailsModal() {
  document.getElementById('details-modal-overlay').classList.remove('visible');
}

let currentOptionsContext = null;

function showOptionsModal(studentName, dayIndex, prayerKey) {
  const weekKey = getWeekKey(state.currentWeekStart);
  const dayKey = getDayKey(state.currentWeekStart, dayIndex);
  const isWeeklyTask = prayerKey === 'tesbih' || prayerKey === 'izinDonus';
  const dedKey = isWeeklyTask ? prayerKey : `${dayKey}_${prayerKey}`;

  ensureRecordStructure(weekKey, studentName);
  const record = state.records[weekKey][studentName];
  const currentDeds = record.deductions?.[dedKey] || { takke: false, pantolon: false };

  document.getElementById('option-takke').checked = currentDeds.takke;
  document.getElementById('option-pantolon').checked = currentDeds.pantolon;
  
  const prayerObj = PRAYERS.find(p => p.key === prayerKey);
  document.getElementById('options-modal-title').textContent = `${studentName} - ${prayerObj.label}`;

  currentOptionsContext = { studentName, weekKey, dedKey };
  document.getElementById('options-modal-overlay').classList.add('visible');
}

function hideOptionsModal() {
  document.getElementById('options-modal-overlay').classList.remove('visible');
  currentOptionsContext = null;
}

function saveOptions() {
  if (isTVMode() || !currentOptionsContext) return;
  const { studentName, weekKey, dedKey } = currentOptionsContext;
  
  const takke = document.getElementById('option-takke').checked;
  const pantolon = document.getElementById('option-pantolon').checked;

  const record = state.records[weekKey][studentName];
  if (!record.deductions) record.deductions = {};
  
  record.deductions[dedKey] = { takke, pantolon };
  renderLockUntil = Date.now() + 1000;
  saveState();
  hideOptionsModal();
  renderStudentCards();
  if (state.currentPage === 'analysis') renderAnalysis();
  showToast('Seçenekler kaydedildi ✓');
}

/* ===== Takviye Score Modal Functions ===== */
let currentTakviyeContext = null;

function showTakviyeScoreModal(studentName, dayIndex) {
  const weekKey = getWeekKey(state.currentWeekStart);
  const dayKey = getDayKey(state.currentWeekStart, dayIndex);
  
  ensureRecordStructure(weekKey, studentName);
  const currentScore = state.records[weekKey][studentName].days[dayKey]?.['takviye'];
  
  document.getElementById('takviye-modal-title').textContent = `${studentName} - Takviye Puanı`;
  
  // Highlight current score button
  document.querySelectorAll('.score-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.score) === currentScore);
  });
  
  currentTakviyeContext = { studentName, weekKey, dayKey };
  document.getElementById('takviye-modal-overlay').classList.add('visible');
}

function hideTakviyeScoreModal() {
  document.getElementById('takviye-modal-overlay').classList.remove('visible');
  currentTakviyeContext = null;
}

function setTakviyeScore(score) {
  if (isTVMode() || !currentTakviyeContext) return;
  const { studentName, weekKey, dayKey } = currentTakviyeContext;
  
  const record = state.records[weekKey][studentName];
  if (!record.days[dayKey]) record.days[dayKey] = {};
  
  record.days[dayKey]['takviye'] = score;
  
  renderLockUntil = Date.now() + 1000;
  saveState();
  hideTakviyeScoreModal();
  renderStudentCards();
  if (state.currentPage === 'analysis') renderAnalysis();
  showToast(`${studentName} için ${score} puan verildi ✓`);
}

function showAddModal() {
  const overlay = document.getElementById('modal-overlay');
  const input = document.getElementById('student-name-input');
  overlay.classList.add('visible');
  input.value = '';
  setTimeout(() => input.focus(), 350);
}

function hideAddModal() {
  document.getElementById('modal-overlay').classList.remove('visible');
}

function addStudent() {
  const input = document.getElementById('student-name-input');
  const name = input.value.trim();
  if (!name) { showToast('Lütfen bir isim girin'); return; }
  if (state.students.includes(name)) { showToast('Bu isim zaten mevcut'); return; }
  state.students.push(name);
  saveState();
  hideAddModal();
  renderStudentCards();
  if (state.currentPage === 'analysis') renderAnalysis();
  showToast(`${name} eklendi ✓`);
}

let currentEditStudent = null;
function showEditModal(name) {
  currentEditStudent = name;
  const overlay = document.getElementById('edit-modal-overlay');
  const input = document.getElementById('edit-student-name-input');
  overlay.classList.add('visible');
  input.value = name;
  setTimeout(() => input.focus(), 350);
}

function hideEditModal() {
  document.getElementById('edit-modal-overlay').classList.remove('visible');
  currentEditStudent = null;
}

function saveEditStudent() {
  if (!currentEditStudent) return;
  const input = document.getElementById('edit-student-name-input');
  const newName = input.value.trim();
  
  if (!newName) { showToast('Lütfen bir isim girin'); return; }
  if (newName === currentEditStudent) { hideEditModal(); return; }
  if (state.students.includes(newName)) { showToast('Bu isim zaten mevcut'); return; }
  
  const idx = state.students.indexOf(currentEditStudent);
  if (idx !== -1) {
    state.students[idx] = newName;
  }
  
  for (const weekKey in state.records) {
    if (state.records[weekKey][currentEditStudent]) {
      state.records[weekKey][newName] = state.records[weekKey][currentEditStudent];
      delete state.records[weekKey][currentEditStudent];
    }
  }
  
  saveState();
  hideEditModal();
  renderStudentCards();
  if (state.currentPage === 'analysis') renderAnalysis();
  showToast('Talebe güncellendi ✓');
}

let pendingDelete = null;
function showDeleteModal(name) {
  pendingDelete = name;
  document.getElementById('delete-confirm-text').textContent = `"${name}" adlı öğrenciyi silmek istediğinize emin misiniz? Tüm verileri silinecektir.`;
  document.getElementById('delete-modal-overlay').classList.add('visible');
}

function hideDeleteModal() {
  document.getElementById('delete-modal-overlay').classList.remove('visible');
  pendingDelete = null;
}

function confirmDelete() {
  if (!pendingDelete) return;
  const name = pendingDelete;
  state.students = state.students.filter(s => s !== name);
  // Remove all records for this student
  for (const weekKey in state.records) {
    delete state.records[weekKey][name];
  }
  saveState();
  hideDeleteModal();
  renderStudentCards();
  renderAnalysis();
  showToast(`${name} silindi`);
}

/* ===== Page Navigation ===== */
function switchPage(page) {
  state.currentPage = page;
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.page === page));
  document.getElementById('tracking-page').classList.toggle('active', page === 'tracking');
  document.getElementById('analysis-page').classList.toggle('active', page === 'analysis');
  updateNavIndicator();
  if (page === 'analysis') renderAnalysis();
}

function navigateWeek(direction) {
  const d = new Date(state.currentWeekStart);
  d.setDate(d.getDate() + direction * 7);
  state.currentWeekStart = d;
  renderWeekNav();
  renderDayTabs();
  renderStudentCards();
  if (state.currentPage === 'analysis') renderAnalysis();
}

/* ===== Preview Mode ===== */
function showPreview() {
  renderPreview();
  document.getElementById('preview-overlay').classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function hidePreview() {
  document.getElementById('preview-overlay').classList.remove('visible');
  document.body.style.overflow = '';
}

function isPreviewVisible() {
  const overlay = document.getElementById('preview-overlay');
  return overlay && overlay.classList.contains('visible');
}

function renderPreview() {
  const weekKey = getWeekKey(state.currentWeekStart);
  document.getElementById('preview-week-text').textContent = formatWeekRange(state.currentWeekStart) + ' • ' + getWeekNumber(state.currentWeekStart) + '. Hafta';

  const data = state.students.map(name => ({
    name,
    points: getStudentWeeklyPoints(weekKey, name),
    initial: name.charAt(0).toUpperCase()
  })).sort((a, b) => b.points - a.points);

  const body = document.getElementById('preview-body');
  const rowCount = Math.ceil(data.length / 2) || 1;
  body.style.gridTemplateRows = `repeat(${rowCount}, auto)`;
  
  let html = '';

  data.forEach((d, i) => {
    const pct = MAX_WEEKLY_POINTS > 0 ? (d.points / MAX_WEEKLY_POINTS * 100) : 0;
    const rankClass = i < 3 ? ` rank-${i + 1}` : '';
    html += `<div class="preview-row" style="animation-delay:${i * 0.06}s">
      <div class="preview-row-left">
        <div class="preview-rank${rankClass}">${i + 1}</div>
        <div class="preview-name">${d.name}</div>
      </div>
      <div class="preview-row-right">
        <div class="preview-bar-container"><div class="preview-bar-fill" style="width:0%;" data-width="${pct}%"></div></div>
        <div class="preview-points">${d.points} pt</div>
      </div>
    </div>`;
  });

  body.innerHTML = html;

  // Animate bars
  requestAnimationFrame(() => {
    body.querySelectorAll('.preview-bar-fill').forEach(bar => {
      bar.style.width = bar.dataset.width;
    });
  });
}

/* ===== Init ===== */
function init() {
  if (isTVMode()) {
    document.body.classList.add('tv-mode');
  }
  loadState();
  renderWeekNav();
  renderDayTabs();
  renderStudentCards();
  updateNavIndicator();

  // Event listeners
  document.getElementById('prev-week').addEventListener('click', (e) => { e.preventDefault(); navigateWeek(-1); });
  document.getElementById('next-week').addEventListener('click', (e) => { e.preventDefault(); navigateWeek(1); });
  document.getElementById('add-student-btn').addEventListener('click', (e) => { e.preventDefault(); showAddModal(); });
  document.getElementById('modal-cancel').addEventListener('click', (e) => { e.preventDefault(); hideAddModal(); });
  document.getElementById('modal-close').addEventListener('click', (e) => { e.preventDefault(); hideAddModal(); });
  document.getElementById('modal-add').addEventListener('click', (e) => { e.preventDefault(); addStudent(); });
  document.getElementById('modal-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) { e.preventDefault(); hideAddModal(); } });
  document.getElementById('student-name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addStudent(); } });
  document.getElementById('delete-cancel').addEventListener('click', (e) => { e.preventDefault(); hideDeleteModal(); });
  document.getElementById('delete-confirm').addEventListener('click', (e) => { e.preventDefault(); confirmDelete(); });
  document.getElementById('delete-modal-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) { e.preventDefault(); hideDeleteModal(); } });

  document.getElementById('edit-modal-cancel').addEventListener('click', (e) => { e.preventDefault(); hideEditModal(); });
  document.getElementById('edit-modal-close').addEventListener('click', (e) => { e.preventDefault(); hideEditModal(); });
  document.getElementById('edit-modal-save').addEventListener('click', (e) => { e.preventDefault(); saveEditStudent(); });
  document.getElementById('edit-modal-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) { e.preventDefault(); hideEditModal(); } });
  document.getElementById('edit-student-name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveEditStudent(); } });

  document.getElementById('options-modal-close').addEventListener('click', (e) => { e.preventDefault(); hideOptionsModal(); });
  document.getElementById('options-modal-save').addEventListener('click', (e) => { e.preventDefault(); saveOptions(); });
  document.getElementById('options-modal-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) { e.preventDefault(); hideOptionsModal(); } });

  document.getElementById('preview-btn').addEventListener('click', (e) => { e.preventDefault(); showPreview(); });
  document.getElementById('preview-close').addEventListener('click', (e) => { e.preventDefault(); hidePreview(); });

  document.getElementById('details-modal-close').addEventListener('click', (e) => { e.preventDefault(); hideDetailsModal(); });
  document.getElementById('details-modal-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) { e.preventDefault(); hideDetailsModal(); } });

  document.getElementById('takviye-modal-close').addEventListener('click', (e) => { e.preventDefault(); hideTakviyeScoreModal(); });
  document.getElementById('takviye-modal-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) { e.preventDefault(); hideTakviyeScoreModal(); } });
  document.getElementById('takviye-modal-clear').addEventListener('click', (e) => { e.preventDefault(); setTakviyeScore(false); });
  
  document.querySelectorAll('.score-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      setTakviyeScore(parseInt(btn.dataset.score));
    });
  });

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { 
      e.preventDefault();
      switchPage(btn.dataset.page);
    });
  });

  // Recalculate nav indicator on resize
  window.addEventListener('resize', updateNavIndicator);

  // ESC key to close preview
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hidePreview();
  });
  // Prevent all form submissions just in case
  window.addEventListener('submit', (e) => e.preventDefault(), true);
  
  // Service Worker kaydı (İnternetsiz tam çalışma desteği)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('Service worker registration failed:', err);
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
