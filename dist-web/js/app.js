/**
 * CargoOptimizer - Main Application Controller
 * Full feature set: Cargo CRUD, Balanced/Consolidated distribution,
 * DWT calculation, Overload warning, Stability check, Tank +/- adjustment,
 * Season detection, PDF/Excel export
 */

// ===== State =====
let cargoes = [];
let editingCargoId = null;
let tanks = [];
let ballastTanks = [];
let activePlanView = 'cargo';
let isCalculated = false;
let adjustUnit = 'MT';
let currentTheme = 'night';

/* =========================================================
   THEMES — her tema bir CSS değişken seti + bayrak taşır.
   glass:true  -> görünmez/şeffaf efekt (panel arka planı yarı saydam)
   ========================================================= */
const THEMES = {
    night: {
        label: '🌌 Night (Dark)',
        glass: false,
        tokens: {
            '--bg-deep': '#0a1628', '--bg-panel': '#0f1f35', '--bg-card': '#142640', '--bg-input': '#0c1a2e',
            '--accent': '#0ea5e9', '--accent-hover': '#38bdf8', '--accent-dim': 'rgba(14, 165, 233, 0.15)',
            '--amber': '#f59e0b', '--amber-dim': 'rgba(245, 158, 11, 0.15)',
            '--teal': '#14b8a6', '--teal-dim': 'rgba(20, 184, 166, 0.15)',
            '--danger': '#ef4444', '--danger-dim': 'rgba(239, 68, 68, 0.15)',
            '--success': '#22c55e', '--success-dim': 'rgba(34, 197, 94, 0.15)',
            '--text-primary': '#e2e8f0', '--text-secondary': '#64748b', '--text-muted': '#475569',
            '--border': 'rgba(148, 163, 184, 0.12)', '--border-active': 'rgba(14, 165, 233, 0.4)',
            '--glass': 'rgba(15, 31, 53, 0.7)', '--shadow': '0 4px 24px rgba(0, 0, 0, 0.3)'
        }
    },
    day: {
        label: '☀ Day (Light)',
        glass: false,
        tokens: {
            '--bg-deep': '#f7fbff', '--bg-panel': '#ffffff', '--bg-card': '#f2f7fc', '--bg-input': '#ffffff',
            '--accent': '#0369a1', '--accent-hover': '#0284c7', '--accent-dim': 'rgba(3, 105, 161, 0.12)',
            '--amber': '#b45309', '--amber-dim': 'rgba(180, 83, 9, 0.13)',
            '--teal': '#0f766e', '--teal-dim': 'rgba(15, 118, 110, 0.12)',
            '--danger': '#dc2626', '--danger-dim': 'rgba(220, 38, 38, 0.12)',
            '--success': '#15803d', '--success-dim': 'rgba(21, 128, 61, 0.12)',
            '--text-primary': '#0f172a', '--text-secondary': '#475569', '--text-muted': '#64748b',
            '--border': 'rgba(100, 116, 139, 0.2)', '--border-active': 'rgba(3, 105, 161, 0.35)',
            '--glass': 'rgba(255, 255, 255, 0.75)', '--shadow': '0 4px 20px rgba(2, 6, 23, 0.08)'
        }
    },
    glass: {
        label: '🔷 Glass (Transparent)',
        glass: true,
        tokens: {
            '--bg-deep': 'rgba(10, 22, 40, 0.55)', '--bg-panel': 'rgba(15, 31, 53, 0.45)', '--bg-card': 'rgba(20, 38, 64, 0.5)', '--bg-input': 'rgba(12, 26, 46, 0.6)',
            '--accent': '#38bdf8', '--accent-hover': '#7dd3fc', '--accent-dim': 'rgba(56, 189, 248, 0.18)',
            '--amber': '#fbbf24', '--amber-dim': 'rgba(251, 191, 36, 0.18)',
            '--teal': '#2dd4bf', '--teal-dim': 'rgba(45, 212, 191, 0.18)',
            '--danger': '#f87171', '--danger-dim': 'rgba(248, 113, 113, 0.18)',
            '--success': '#4ade80', '--success-dim': 'rgba(74, 222, 128, 0.18)',
            '--text-primary': '#e2e8f0', '--text-secondary': '#94a3b8', '--text-muted': '#64748b',
            '--border': 'rgba(148, 163, 184, 0.18)', '--border-active': 'rgba(56, 189, 248, 0.55)',
            '--glass': 'rgba(15, 31, 53, 0.35)', '--shadow': '0 8px 32px rgba(0, 0, 0, 0.45)'
        }
    },
    matrix: {
        label: '🟢 Matrix (Green)',
        glass: false,
        tokens: {
            '--bg-deep': '#000000', '--bg-panel': '#050a07', '--bg-card': '#0a140d', '--bg-input': '#030604',
            '--accent': '#22ff66', '--accent-hover': '#5cff95', '--accent-dim': 'rgba(34, 255, 102, 0.14)',
            '--amber': '#a3e635', '--amber-dim': 'rgba(163, 230, 53, 0.14)',
            '--teal': '#10b981', '--teal-dim': 'rgba(16, 185, 129, 0.14)',
            '--danger': '#ff4d4d', '--danger-dim': 'rgba(255, 77, 77, 0.14)',
            '--success': '#22ff66', '--success-dim': 'rgba(34, 255, 102, 0.14)',
            '--text-primary': '#c8ffd6', '--text-secondary': '#5fbf7f', '--text-muted': '#3f8f5f',
            '--border': 'rgba(34, 255, 102, 0.18)', '--border-active': 'rgba(34, 255, 102, 0.5)',
            '--glass': 'rgba(4, 25, 15, 0.7)', '--shadow': '0 4px 24px rgba(0, 0, 0, 0.5)'
        }
    },
    orange: {
        label: '🟠 Orange Focus',
        glass: false,
        tokens: {
            '--bg-deep': '#000000', '--bg-panel': '#0c0804', '--bg-card': '#140e07', '--bg-input': '#0a0603',
            '--accent': '#fb923c', '--accent-hover': '#fdba74', '--accent-dim': 'rgba(251, 146, 60, 0.16)',
            '--amber': '#f59e0b', '--amber-dim': 'rgba(245, 158, 11, 0.16)',
            '--teal': '#14b8a6', '--teal-dim': 'rgba(20, 184, 166, 0.16)',
            '--danger': '#ef4444', '--danger-dim': 'rgba(239, 68, 68, 0.16)',
            '--success': '#22c55e', '--success-dim': 'rgba(34, 197, 94, 0.16)',
            '--text-primary': '#fde7d3', '--text-secondary': '#c08a5a', '--text-muted': '#8a5a32',
            '--border': 'rgba(251, 146, 60, 0.2)', '--border-active': 'rgba(251, 146, 60, 0.5)',
            '--glass': 'rgba(36, 20, 5, 0.7)', '--shadow': '0 4px 24px rgba(0, 0, 0, 0.4)'
        }
    },
    navy: {
        label: '🔵 Steel Navy',
        glass: false,
        tokens: {
            '--bg-deep': '#000000', '--bg-panel': '#070d14', '--bg-card': '#0b141e', '--bg-input': '#04080d',
            '--accent': '#2f8fd6', '--accent-hover': '#5aa9e6', '--accent-dim': 'rgba(47, 143, 214, 0.16)',
            '--amber': '#e0a23b', '--amber-dim': 'rgba(224, 162, 59, 0.16)',
            '--teal': '#36b3a6', '--teal-dim': 'rgba(54, 179, 166, 0.16)',
            '--danger': '#d9573f', '--danger-dim': 'rgba(217, 87, 63, 0.16)',
            '--success': '#4caf72', '--success-dim': 'rgba(76, 175, 114, 0.16)',
            '--text-primary': '#e7eef6', '--text-secondary': '#9bb0c4', '--text-muted': '#6f879c',
            '--border': 'rgba(43, 64, 85, 0.4)', '--border-active': 'rgba(47, 143, 214, 0.5)',
            '--glass': 'rgba(16, 32, 47, 0.7)', '--shadow': '0 4px 22px rgba(0, 0, 0, 0.35)'
        }
    },
    crimson: {
        label: '🔴 Crimson',
        glass: false,
        tokens: {
            '--bg-deep': '#000000', '--bg-panel': '#0c0506', '--bg-card': '#140809', '--bg-input': '#090304',
            '--accent': '#f43f5e', '--accent-hover': '#fb7185', '--accent-dim': 'rgba(244, 63, 94, 0.16)',
            '--amber': '#f59e0b', '--amber-dim': 'rgba(245, 158, 11, 0.16)',
            '--teal': '#2dd4bf', '--teal-dim': 'rgba(45, 212, 191, 0.16)',
            '--danger': '#ef4444', '--danger-dim': 'rgba(239, 68, 68, 0.16)',
            '--success': '#22c55e', '--success-dim': 'rgba(34, 197, 94, 0.16)',
            '--text-primary': '#ffe4e6', '--text-secondary': '#c07a85', '--text-muted': '#8a4a52',
            '--border': 'rgba(244, 63, 94, 0.22)', '--border-active': 'rgba(244, 63, 94, 0.5)',
            '--glass': 'rgba(36, 10, 13, 0.7)', '--shadow': '0 4px 24px rgba(0, 0, 0, 0.45)'
        }
    },
    amber: {
        label: '🟡 Amber Gold',
        glass: false,
        tokens: {
            '--bg-deep': '#000000', '--bg-panel': '#0c0a06', '--bg-card': '#140f09', '--bg-input': '#090704',
            '--accent': '#fbbf24', '--accent-hover': '#fcd34d', '--accent-dim': 'rgba(251, 191, 36, 0.16)',
            '--amber': '#f59e0b', '--amber-dim': 'rgba(245, 158, 11, 0.16)',
            '--teal': '#14b8a6', '--teal-dim': 'rgba(20, 184, 166, 0.15)',
            '--danger': '#ef4444', '--danger-dim': 'rgba(239, 68, 68, 0.15)',
            '--success': '#22c55e', '--success-dim': 'rgba(34, 197, 94, 0.15)',
            '--text-primary': '#fdf3dd', '--text-secondary': '#c4a36a', '--text-muted': '#927443',
            '--border': 'rgba(251, 191, 36, 0.2)', '--border-active': 'rgba(251, 191, 36, 0.5)',
            '--glass': 'rgba(31, 24, 16, 0.7)', '--shadow': '0 4px 22px rgba(0, 0, 0, 0.4)'
        }
    },
    violet: {
        label: '🟣 Violet Night',
        glass: false,
        tokens: {
            '--bg-deep': '#000000', '--bg-panel': '#090612', '--bg-card': '#0e0a1a', '--bg-input': '#050309',
            '--accent': '#a855f7', '--accent-hover': '#c084fc', '--accent-dim': 'rgba(168, 85, 247, 0.16)',
            '--amber': '#f59e0b', '--amber-dim': 'rgba(245, 158, 11, 0.16)',
            '--teal': '#2dd4bf', '--teal-dim': 'rgba(45, 212, 191, 0.16)',
            '--danger': '#f43f5e', '--danger-dim': 'rgba(244, 63, 94, 0.16)',
            '--success': '#34d399', '--success-dim': 'rgba(52, 211, 153, 0.16)',
            '--text-primary': '#f3e8ff', '--text-secondary': '#b794d4', '--text-muted': '#8a5fb0',
            '--border': 'rgba(168, 85, 247, 0.2)', '--border-active': 'rgba(168, 85, 247, 0.5)',
            '--glass': 'rgba(26, 15, 44, 0.7)', '--shadow': '0 4px 24px rgba(0, 0, 0, 0.45)'
        }
    },
    mono: {
        label: '⚫ Mono Slate',
        glass: false,
        tokens: {
            '--bg-deep': '#000000', '--bg-panel': '#0a0a0c', '--bg-card': '#121214', '--bg-input': '#060608',
            '--accent': '#cbd5e1', '--accent-hover': '#f1f5f9', '--accent-dim': 'rgba(203, 213, 225, 0.12)',
            '--amber': '#eab308', '--amber-dim': 'rgba(234, 179, 8, 0.12)',
            '--teal': '#67e8f9', '--teal-dim': 'rgba(103, 232, 249, 0.12)',
            '--danger': '#f87171', '--danger-dim': 'rgba(248, 113, 113, 0.12)',
            '--success': '#86efac', '--success-dim': 'rgba(134, 239, 172, 0.12)',
            '--text-primary': '#f8fafc', '--text-secondary': '#94a3b8', '--text-muted': '#64748b',
            '--border': 'rgba(148, 163, 184, 0.14)', '--border-active': 'rgba(203, 213, 225, 0.4)',
            '--glass': 'rgba(22, 22, 24, 0.7)', '--shadow': '0 4px 24px rgba(0, 0, 0, 0.5)'
        }
    }
};

function getTheme(name) {
    return THEMES[name] || THEMES.night;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function isPositiveNumber(value) {
    return Number.isFinite(value) && value > 0;
}

function syncCargoWeightsFromTanks() {
    if (cargoes.length === 0) return;

    const assignedByCargo = new Map();
    tanks.forEach(t => {
        if (!t.assignedCargo) return;
        const prev = assignedByCargo.get(t.assignedCargo.id) || 0;
        assignedByCargo.set(t.assignedCargo.id, prev + t.assignedCargo.weight);
    });

    cargoes = cargoes.map(c => ({
        ...c,
        quantity: parseFloat((assignedByCargo.get(c.id) || 0).toFixed(3))
    }));
}

function classifyCargoGroup(cargo) {
    const name = String(cargo.name || '').toLowerCase();
    const matched = COMPATIBILITY_GROUPS.find(group =>
        group.keywords.some(keyword => name.includes(keyword))
    );
    return matched ? matched.name : 'GENERAL';
}

function isHeatingAdvised(cargo) {
    const name = String(cargo.name || '').toLowerCase();
    return HEATING_KEYWORDS.some(keyword => name.includes(keyword));
}

function isSolidifyingCargo(cargo) {
    const name = String(cargo.name || '').toLowerCase();
    return APP_SOLIDIFYING_CARGO_KEYWORDS.some(keyword => name.includes(keyword));
}

function checkCargoCompatibility() {
    const warningArea = document.getElementById('warningArea');
    const existing = document.getElementById('compatibilityWarning');
    const badge = document.getElementById('compatibilityBadge');
    if (existing) existing.remove();

    if (cargoes.length < 2) {
        if (badge) {
            badge.className = 'season-badge summer';
            badge.textContent = '✔ Compat: OK';
            badge.title = 'No incompatible cargo pair detected';
        }
        return;
    }

    const grouped = cargoes.map(c => ({ ...c, group: classifyCargoGroup(c) }));
    const conflicts = [];

    for (let i = 0; i < grouped.length; i++) {
        for (let j = i + 1; j < grouped.length; j++) {
            const g1 = grouped[i].group;
            const g2 = grouped[j].group;
            const isConflict = INCOMPATIBLE_GROUPS.some(([a, b]) =>
                (g1 === a && g2 === b) || (g1 === b && g2 === a)
            );
            if (isConflict) {
                conflicts.push(`${grouped[i].name} ↔ ${grouped[j].name}`);
            }
        }
    }

    const heatingList = cargoes.filter(isHeatingAdvised).map(c => c.name);
    const solidifyingList = cargoes.filter(isSolidifyingCargo).map(c => c.name);
    if (badge) {
        if (conflicts.length > 0) {
            badge.className = 'season-badge winter';
            badge.textContent = `⚠ Compat: ${conflicts.length} issue`;
            badge.title = 'Incompatible cargo combination detected';
        } else {
            badge.className = 'season-badge summer';
            badge.textContent = '✔ Compat: OK';
            badge.title = 'No incompatible cargo pair detected';
        }
    }
    if (conflicts.length === 0 && heatingList.length === 0 && solidifyingList.length === 0) return;

    const sections = [];
    if (conflicts.length > 0) {
        const conflictText = conflicts.slice(0, 4).map(escapeHtml).join(' | ');
        sections.push(`<strong>Segregation check:</strong> ${conflictText}${conflicts.length > 4 ? ' ...' : ''}`);
    }
    if (heatingList.length > 0) {
        const heatingText = heatingList.slice(0, 6).map(escapeHtml).join(', ');
        sections.push(`<strong>Heating advisory:</strong> ${heatingText}${heatingList.length > 6 ? ' ...' : ''}`);
    }
    if (solidifyingList.length > 0) {
        const solidifyingText = solidifyingList.slice(0, 6).map(escapeHtml).join(', ');
        sections.push(`<strong>Deck tank restriction:</strong> ${solidifyingText}${solidifyingList.length > 6 ? ' ...' : ''} cannot be loaded in deck tanks.`);
    }

    const el = document.createElement('div');
    el.id = 'compatibilityWarning';
    el.className = 'warning-banner warn';
    el.innerHTML = `⚠️ ${sections.join(' • ')}`;
    warningArea.appendChild(el);
}

const CARGO_COLORS = [
    '#0ea5e9', '#f59e0b', '#22c55e', '#ef4444', '#14b8a6',
    '#a855f7', '#ec4899', '#84cc16', '#06b6d4', '#f97316'
];
let colorIndex = 0;
const COMPATIBILITY_GROUPS = [
    { name: 'STRONG_ACID', keywords: ['sulfuric acid', 'hydrochloric acid', 'nitric acid', 'phosphoric acid', 'acid'] },
    { name: 'STRONG_ALKALI', keywords: ['caustic soda', 'sodium hydroxide', 'alkali'] },
    { name: 'CHLORINATED', keywords: ['dichloride', 'chloride', 'carbon tetrachloride', 'perchloroethylene'] },
    { name: 'ALCOHOL', keywords: ['methanol', 'ethanol', 'isopropanol', 'butanol', 'glycol'] },
    { name: 'AROMATIC', keywords: ['benzene', 'toluene', 'xylene', 'styrene', 'cumene'] },
    { name: 'VEGOIL', keywords: ['palm oil', 'olein', 'stearin', 'soybean oil', 'sunflower oil', 'rapeseed oil', 'fish oil', 'uco'] }
];

const INCOMPATIBLE_GROUPS = [
    ['STRONG_ACID', 'STRONG_ALKALI'],
    ['STRONG_ACID', 'CHLORINATED']
];

const HEATING_KEYWORDS = [
    'palm',
    'stearin',
    'molasses',
    'fuel oil',
    'vlsfo',
    'stearic acid',
    'phenol'
];

const APP_SOLIDIFYING_CARGO_KEYWORDS = [
    'palm',
    'stearin',
    'molasses',
    'fuel oil',
    'vlsfo',
    'stearic acid',
    'phenol'
];

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', () => {
    try {
        initTheme();
    } catch (err) {
        console.warn('Theme init failed, fallback to night:', err);
        currentTheme = 'night';
    }
    resetTanks();
    renderShipView();
    updateDWT();
    detectSeason();
    setupAutocompleteFallback();
    if (typeof CARGO_DB === 'undefined' || !Array.isArray(CARGO_DB) || typeof PORT_DB === 'undefined' || !Array.isArray(PORT_DB)) {
        notify('Autocomplete database could not be loaded. Please hard refresh.', 'warn');
    }
    try {
        checkCargoCompatibility();
    } catch (err) {
        console.warn('Compatibility check failed:', err);
    }
    try {
        safeRenderCompliance();
    } catch (err) {
        console.warn('Compliance render failed:', err);
    }
    try {
        autoBallast(); // no cargo yet -> ballast tanks full
    } catch (err) {
        console.warn('Auto ballast failed:', err);
    }
});

function initTheme() {
    const stored = localStorage.getItem('cargoOptimizerTheme');
    currentTheme = (stored && THEMES[stored]) ? stored : 'night';
    applyTheme();
}

function applyTheme() {
    const theme = getTheme(currentTheme);
    const isDay = currentTheme === 'day';
    document.documentElement.setAttribute('data-theme', currentTheme);
    document.documentElement.classList.toggle('theme-day', isDay);
    document.body.classList.toggle('theme-day', isDay);
    document.body.classList.toggle('theme-glass', !!theme.glass);
    document.documentElement.classList.toggle('theme-glass', !!theme.glass);
    const tokens = theme.tokens;
    Object.entries(tokens).forEach(([token, value]) => {
        document.documentElement.style.setProperty(token, value);
    });
    updateThemeToggleLabel();
    updateAppearanceActive();
}

function updateThemeToggleLabel() {
    const btn = document.getElementById('themeToggleBtn');
    if (!btn) return;
    btn.textContent = currentTheme === 'day' ? '🌙 Night' : '🌞 Day';
}

function toggleTheme() {
    currentTheme = currentTheme === 'day' ? 'night' : 'day';
    try {
        localStorage.setItem('cargoOptimizerTheme', currentTheme);
    } catch (err) {
        console.warn('Theme persistence unavailable:', err);
    }
    applyTheme();
    notify('Theme: ' + getTheme(currentTheme).label, 'info');
}

/* ===== Appearance (settings) menu ===== */
function openAppearance() {
    const modal = document.getElementById('appearanceModal');
    if (!modal) return;
    renderThemeOptions();
    modal.hidden = false;
}
function closeAppearance() {
    const modal = document.getElementById('appearanceModal');
    if (modal) modal.hidden = true;
}
function renderThemeOptions() {
    const wrap = document.getElementById('themeOptions');
    if (!wrap) return;
    wrap.innerHTML = Object.entries(THEMES).map(([key, t]) => {
        const active = key === currentTheme ? ' active' : '';
        const swatch = t.tokens['--bg-panel'] + '|' + t.tokens['--accent'] + '|' + t.tokens['--bg-card'];
        return `<button class="theme-swatch${active}" data-theme="${key}" onclick="setTheme('${key}')">
            <span class="theme-swatch-bar" style="background:${t.tokens['--accent']};"></span>
            <span class="theme-swatch-label">${t.label}</span>
        </button>`;
    }).join('');
}
function updateAppearanceActive() {
    document.querySelectorAll('#themeOptions .theme-swatch').forEach(b => {
        b.classList.toggle('active', b.dataset.theme === currentTheme);
    });
}
function setTheme(name) {
    if (!THEMES[name]) return;
    currentTheme = name;
    try {
        localStorage.setItem('cargoOptimizerTheme', name);
    } catch (err) {
        console.warn('Theme persistence unavailable:', err);
    }
    applyTheme();
    notify('Theme: ' + getTheme(name).label, 'info');
}

/* Close appearance modal on outside click / Escape */
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('appearanceModal');
    if (modal) {
        modal.addEventListener('click', (e) => { if (e.target === modal) closeAppearance(); });
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAppearance();
    });
});

function setupAutocompleteFallback() {
    const cargoInput = document.getElementById('fName');
    const loadPortInput = document.getElementById('fLoadPort');
    const dischPortInput = document.getElementById('fDischPort');
    const themeBtn = document.getElementById('themeToggleBtn');

    if (themeBtn) {
        themeBtn.onclick = toggleTheme;
    }

    if (cargoInput) {
        cargoInput.addEventListener('input', () => autocompleteCargo(cargoInput.value));
        cargoInput.addEventListener('focus', () => autocompleteCargo(cargoInput.value));
    }
    if (loadPortInput) {
        loadPortInput.addEventListener('input', () => autocompletePort(loadPortInput.value, 'acLoadPort'));
        loadPortInput.addEventListener('focus', () => autocompletePort(loadPortInput.value, 'acLoadPort'));
    }
    if (dischPortInput) {
        dischPortInput.addEventListener('input', () => autocompletePort(dischPortInput.value, 'acDischPort'));
        dischPortInput.addEventListener('focus', () => autocompletePort(dischPortInput.value, 'acDischPort'));
    }
}

function resetTanks() {
    tanks = TANKS.map(t => ({
        ...t,
        maxVolume: t.capacity100 * (t.name.includes('DECK') ? (DECK_MAX_FILL_PERCENTAGE / 100) : (MAX_FILL_PERCENTAGE / 100)),
        currentVolume: 0,
        assignedCargo: null
    }));
    if (typeof BALLAST_TANKS !== 'undefined') {
        ballastTanks = BALLAST_TANKS.map(t => ({
            ...t,
            maxVolume: t.capacity100,
            currentVolume: 0
        }));
    }
}

// ===== Season Detection =====
function detectSeason() {
    const zone = getCurrentZone();
    const badge = document.getElementById('seasonBadge');

    const limitEl   = document.getElementById('dwtSummer');
    const winterEl  = document.getElementById('dwtWinter');

    if (zone === 'winter') {
        if (badge) { badge.className = 'season-badge winter'; badge.innerHTML = '❄ Winter'; }
        if (limitEl) limitEl.textContent = `${DWT_SUMMER.toFixed(1)} MT`;
        if (winterEl) winterEl.textContent = `${DWT_WINTER.toFixed(1)} MT`;
    } else if (zone === 'tropical') {
        if (badge) { badge.className = 'season-badge summer'; badge.innerHTML = '🌴 Tropical'; }
        if (limitEl) limitEl.textContent = `${DWT_TROPICAL.toFixed(1)} MT`;
        if (winterEl) winterEl.textContent = `${DWT_WINTER.toFixed(1)} MT`;
    } else {
        if (badge) { badge.className = 'season-badge summer'; badge.innerHTML = '☀ Summer'; }
        if (limitEl) limitEl.textContent = `${DWT_SUMMER.toFixed(1)} MT`;
        if (winterEl) winterEl.textContent = `${DWT_WINTER.toFixed(1)} MT`;
    }
}

function getCurrentZone() {
    const month = new Date().getMonth(); // 0-11
    // Winter: Oct–Mar
    if (month >= 9 || month <= 2) return 'winter';
    // Tropical approximation: Apr–May, Sep (Mediterranean/Black Sea routes near tropics)
    // For M/T ADA (Black Sea/Med), Summer is the standard
    return 'summer';
}

function getCurrentDWTLimit() {
    const zone = getCurrentZone();
    if (zone === 'winter')   return typeof DWT_WINTER   !== 'undefined' ? DWT_WINTER   : 5510.7;
    if (zone === 'tropical') return typeof DWT_TROPICAL !== 'undefined' ? DWT_TROPICAL : 5904.6;
    return typeof DWT_SUMMER !== 'undefined' ? DWT_SUMMER : 5707.0;
}

// ===== Cargo Management =====
function handleSubmitCargo() {
    const name = document.getElementById('fName').value.trim();
    const sg = parseFloat(document.getElementById('fSG').value);
    const qty = parseFloat(document.getElementById('fQuantity').value);
    const parcelNo = document.getElementById('fParcelNo').value.trim();
    const loadPort = document.getElementById('fLoadPort').value.trim();
    const dischPort = document.getElementById('fDischPort').value.trim();
    const loadTempRaw = document.getElementById('fLoadTemp').value.trim();
    const loadTemp = loadTempRaw === '' ? null : parseFloat(loadTempRaw);

    if (!name || !isPositiveNumber(sg) || !isPositiveNumber(qty)) {
        notify('Please fill in Name, SG and Quantity', 'warn');
        return;
    }

    if (editingCargoId !== null) {
        // Update existing
        cargoes = cargoes.map(c => {
            if (c.id === editingCargoId) {
                return { ...c, name, sg, quantity: qty, parcelNo, loadPort, dischPort, loadTemp };
            }
            return c;
        });
        editingCargoId = null;
        isCalculated = false;
        document.getElementById('cargoPanel').classList.remove('editing');
        document.getElementById('formTitle').textContent = 'Add Cargo Parcel';
        document.getElementById('cancelEditBtn').style.display = 'none';
        document.getElementById('submitBtn').textContent = 'ADD PARCEL';
        notify(`Updated ${name}`, 'info');
    } else {
        // Add new
        const cargo = {
            id: Date.now(),
            parcelNo,
            name,
            sg,
            sgTemp: parseInt(document.getElementById('fSGTemp').value) || 15,
            cargoType: document.getElementById('fCargoType').value || 'P',
            quantity: qty,
            loadPort,
            dischPort,
            loadTemp,
            color: CARGO_COLORS[colorIndex % CARGO_COLORS.length],
            strategy: 'BALANCED'
        };
        colorIndex++;
        cargoes.push(cargo);
        isCalculated = false;
        notify(`Added ${name} (${qty} MT)`, 'success');
    }

    // Clear form
    document.getElementById('fParcelNo').value = '';
    document.getElementById('fName').value = '';
    document.getElementById('fSG').value = '';
    document.getElementById('fQuantity').value = '';
    document.getElementById('fLoadTemp').value = '';
    document.getElementById('fLoadPort').value = '';
    document.getElementById('fDischPort').value = '';

    renderCargoList();
    updateDWT();
    checkCargoCompatibility();
    safeRenderCompliance();
    try { autoBallast(); } catch (e) { console.warn('autoBallast:', e); }
}

function editCargo(id) {
    const c = cargoes.find(x => x.id === id);
    if (!c) return;
    editingCargoId = id;
    document.getElementById('fParcelNo').value = c.parcelNo || '';
    document.getElementById('fName').value = c.name;
    document.getElementById('fSG').value = c.sg;
    document.getElementById('fQuantity').value = c.quantity;
    document.getElementById('fLoadTemp').value = (c.loadTemp != null) ? c.loadTemp : '';
    document.getElementById('fLoadPort').value = c.loadPort || '';
    document.getElementById('fDischPort').value = c.dischPort || '';
    document.getElementById('cargoPanel').classList.add('editing');
    document.getElementById('formTitle').textContent = 'Edit Cargo Parcel';
    document.getElementById('cancelEditBtn').style.display = 'flex';
    document.getElementById('submitBtn').textContent = 'UPDATE PARCEL';
}

function cancelEdit() {
    editingCargoId = null;
    document.getElementById('cargoPanel').classList.remove('editing');
    document.getElementById('formTitle').textContent = 'Add Cargo Parcel';
    document.getElementById('cancelEditBtn').style.display = 'none';
    document.getElementById('submitBtn').textContent = 'ADD PARCEL';
    document.getElementById('fParcelNo').value = '';
    document.getElementById('fName').value = '';
    document.getElementById('fSG').value = '';
    document.getElementById('fQuantity').value = '';
    document.getElementById('fLoadPort').value = '';
    document.getElementById('fDischPort').value = '';
}

function removeCargo(id) {
    cargoes = cargoes.filter(c => c.id !== id);
    if (editingCargoId === id) cancelEdit();
    isCalculated = false;
    renderCargoList();
    updateDWT();
    checkCargoCompatibility();
    safeRenderCompliance();
    try { autoBallast(); } catch (e) { console.warn('autoBallast:', e); }
    notify('Cargo removed', 'info');
}

function maximizeCargo(id) {
    const c = cargoes.find(x => x.id === id);
    if (!c) return;

    // 1. Calculate Fixed Weights
    const constant = parseFloat(document.getElementById('cConstant').value) || 0;
    const mgo = parseFloat(document.getElementById('cMGO').value) || 0;
    const fw = parseFloat(document.getElementById('cFW').value) || 0;
    const ballast = parseFloat(document.getElementById('cBallast').value) || 0;
    const luboil = parseFloat(document.getElementById('cLuboil').value) || 0;
    const fixedWeights = constant + mgo + fw + ballast + luboil;

    // 2. Calculate Other Cargo Weights
    const otherCargoesWeight = cargoes.filter(x => x.id !== id).reduce((sum, x) => sum + x.quantity, 0);

    // 3. Available DWT
    const limit = getCurrentDWTLimit();
    const availableDWT = limit - (fixedWeights + otherCargoesWeight);

    // 4. Max Volume Weight (allowed fill % of tank capacity for this cargo's SG)
    const allowedPct = (typeof getAllowedFillPct === 'function') ? getAllowedFillPct(c.sg) : 98;
    const usableTanks = isSolidifyingCargo(c)
        ? TANKS.filter(t => !t.name.includes('DECK'))
        : TANKS;
    const totalVolumeAllowed = usableTanks.reduce((sum, t) => sum + (t.capacity100 * allowedPct / 100), 0);
    const weightByVolume = totalVolumeAllowed * c.sg;

    // 5. Final Qty (min of both)
    const maxQty = Math.max(0, Math.min(availableDWT, weightByVolume));
    
    // Update cargo
    cargoes = cargoes.map(x => {
        if (x.id === id) {
            x.quantity = parseFloat(maxQty.toFixed(3));
        }
        return x;
    });

    notify(`Maximized ${c.name} to ${maxQty.toFixed(3)} MT`, 'success');
    renderCargoList();
    handleCalculate(); // Trigger full refresh
}

function toggleStrategy(id) {
    cargoes = cargoes.map(c => {
        if (c.id === id) {
            c.strategy = c.strategy === 'CONSOLIDATED' ? 'BALANCED' : 'CONSOLIDATED';
        }
        return c;
    });
    renderCargoList();

    // Auto-recalculate
    if (cargoes.length > 0) {
        const result = optimizeCargoDistribution(cargoes);
        tanks = result.tanks;
        isCalculated = true;
        renderShipView();
        updateStats();
        checkStability();
        checkUnassigned();
        checkCargoCompatibility();
        safeRenderCompliance();
    }
}

// ===== Render Cargo List (multi-box: each parcel = its own detail card) =====
function renderCargoList() {
    const container = document.getElementById('cargoListContainer');
    document.getElementById('parcelCount').textContent = `${cargoes.length} parcels`;

    if (cargoes.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.8rem; font-style: italic;">No cargo added yet.</p>';
        return;
    }

    container.innerHTML = cargoes.map((c, idx) => {
        // Tank nos assigned to this parcel (after calculation)
        let tankNos = [];
        if (typeof tanks !== 'undefined' && tanks.length) {
            tankNos = tanks
                .filter(t => t.assignedCargo && t.assignedCargo.id === c.id)
                .map(t => t.name);
        }
        const tankNosHtml = tankNos.length
            ? `<div class="parcel-tanks"><span class="parcel-tanks-label">Loaded tanks:</span> ${tankNos.map(n => `<span class="tank-no-chip">${escapeHtml(n)}</span>`).join(' ')}</div>`
            : '<div class="parcel-tanks parcel-tanks-empty">Tanks: not calculated yet</div>';

        const tempTxt = (c.loadTemp != null)
            ? `<span class="parcel-temp-val">${c.loadTemp}°C</span>`
            : '<span class="parcel-temp-val muted">ambient (not set)</span>';

        return `
        <div class="parcel-box" style="border-left:4px solid ${c.color}">
            <div class="parcel-box-head">
                <div class="parcel-box-title" style="color:${c.color}">
                    ${escapeHtml(c.name)}
                    <span class="parcel-box-no">#${escapeHtml(c.parcelNo || '—')}</span>
                </div>
                <div class="parcel-box-actions">
                    <button class="btn-icon accent" onclick="maximizeCargo(${c.id})" title="Max 98%">Max 98%</button>
                    <button class="btn-icon" onclick="toggleStrategy(${c.id})" title="Toggle Strategy">⟳</button>
                    <button class="btn-icon danger" onclick="removeCargo(${c.id})" title="Remove">✕</button>
                </div>
            </div>
            <div class="parcel-box-body" onclick="editCargo(${c.id})" style="cursor:pointer;">
                <div class="parcel-row"><span class="parcel-k">Quantity</span><span class="parcel-v">${c.quantity} MT</span></div>
                <div class="parcel-row"><span class="parcel-k">SG</span><span class="parcel-v">${c.sg} @${c.sgTemp || 15}°C</span></div>
                <div class="parcel-row"><span class="parcel-k">Load → Disch</span><span class="parcel-v">${escapeHtml(c.loadPort || '—')} → ${escapeHtml(c.dischPort || '—')}</span></div>
                <div class="parcel-row"><span class="parcel-k">Load Temp</span><span class="parcel-v">${tempTxt}</span></div>
                <div class="parcel-row"><span class="parcel-k">Strategy</span><span class="parcel-v">${c.strategy || 'BALANCED'}</span></div>
                ${tankNosHtml}
            </div>
        </div>
    `;
    }).join('');
}

// ===== Calculate =====
function handleCalculate() {
    if (cargoes.length === 0) {
        notify('Please add cargoes first', 'warn');
        return;
    }
    const result = optimizeCargoDistribution(cargoes);
    tanks = result.tanks;
    isCalculated = true;
    renderShipView();
    updateStats();
    updateDWT();
    checkStability();
    checkUnassigned();
    checkCargoCompatibility();
    safeRenderCompliance();
    try { autoBallast(); } catch (e) { console.warn('autoBallast:', e); }
    notify('Calculation complete!', 'success');
}

// ===== Reset =====
function handleReset() {
    cargoes = [];
    editingCargoId = null;
    isCalculated = false;
    colorIndex = 0;
    resetTanks();
    cancelEdit();
    renderCargoList();
    renderShipView();
    updateStats();
    updateDWT();
    document.getElementById('warningArea').innerHTML = '';
    document.getElementById('stabilityInfo').innerHTML = '✔ Stability OK';
    document.getElementById('stabilityInfo').style.color = 'var(--success)';
    safeRenderCompliance();
    try { autoBallast(); } catch (e) { console.warn('autoBallast:', e); }
    notify('Plan reset', 'info');
}

// ===== Update Header Stats =====
function updateStats() {
    const totalCap = tanks.reduce((s, t) => s + t.maxVolume, 0);
    const used = tanks.reduce((s, t) => s + t.currentVolume, 0);
    const pct = totalCap > 0 ? (used / totalCap * 100) : 0;

    document.getElementById('headerUsed').textContent = `${used.toFixed(1)} / ${totalCap.toFixed(1)} m³`;
    document.getElementById('headerPct').textContent = `${pct.toFixed(1)}%`;
}

// ===== DWT Calculation =====
function updateDWT() {
    const totalCargoWeight = cargoes.reduce((s, c) => s + c.quantity, 0);
    const constant = parseFloat(document.getElementById('cConstant').value) || 0;
    const mgo = parseFloat(document.getElementById('cMGO').value) || 0;
    const fw = parseFloat(document.getElementById('cFW').value) || 0;
    const ballast = parseFloat(document.getElementById('cBallast').value) || 0;
    const luboil = parseFloat(document.getElementById('cLuboil').value) || 0;

    const actualDWT = totalCargoWeight + constant + mgo + fw + ballast + luboil;
    const limit = getCurrentDWTLimit();
    const isOverload = actualDWT > limit;

    document.getElementById('dwtActual').textContent = `${actualDWT.toFixed(1)} MT`;
    const box = document.getElementById('dwtActualBox');
    if (isOverload) {
        box.classList.add('dwt-overload');
    } else {
        box.classList.remove('dwt-overload');
    }

    // Overload warning
    const warningArea = document.getElementById('warningArea');
    const existingOverload = document.getElementById('overloadWarning');
    if (isOverload) {
        const diff = actualDWT - limit;
        if (!existingOverload) {
            const el = document.createElement('div');
            el.id = 'overloadWarning';
            el.className = 'warning-banner danger';
            el.innerHTML = `⚠️ <strong>OVERLOAD!</strong> Actual DWT (${actualDWT.toFixed(1)} MT) exceeds ${getCurrentDWTLimit() === DWT_WINTER ? 'Winter' : 'Summer'} limit (${limit.toFixed(1)} MT) by <strong>${diff.toFixed(1)} MT</strong>`;
            warningArea.prepend(el);
        } else {
            existingOverload.innerHTML = `⚠️ <strong>OVERLOAD!</strong> Actual DWT (${actualDWT.toFixed(1)} MT) exceeds ${getCurrentDWTLimit() === DWT_WINTER ? 'Winter' : 'Summer'} limit (${limit.toFixed(1)} MT) by <strong>${diff.toFixed(1)} MT</strong>`;
        }
    } else {
        if (existingOverload) existingOverload.remove();
    }
}

// ===== Stability Check =====
function checkStability() {
    let portWeight = tanks.filter(t => t.side === 'P').reduce((s, t) => s + (t.assignedCargo ? t.assignedCargo.weight : 0), 0);
    if (typeof ballastTanks !== 'undefined' && Array.isArray(ballastTanks)) {
        portWeight += ballastTanks.filter(t => t.side === 'P').reduce((s, t) => s + t.currentVolume * 1.0, 0);
    }

    let stbdWeight = tanks.filter(t => t.side === 'S').reduce((s, t) => s + (t.assignedCargo ? t.assignedCargo.weight : 0), 0);
    if (typeof ballastTanks !== 'undefined' && Array.isArray(ballastTanks)) {
        stbdWeight += ballastTanks.filter(t => t.side === 'S').reduce((s, t) => s + t.currentVolume * 1.0, 0);
    }

    const diff = Math.abs(portWeight - stbdWeight);
    const isUnstable = diff > STABILITY_THRESHOLD_MT;
    const heavier = portWeight > stbdWeight ? 'PORT' : 'STBD';

    const el = document.getElementById('stabilityInfo');
    if (isUnstable) {
        el.innerHTML = `⚠️ ${heavier} heavier by ${diff.toFixed(1)} MT`;
        el.style.color = 'var(--danger)';
    } else {
        el.innerHTML = `✔ Stability OK (Δ${diff.toFixed(1)} MT)`;
        el.style.color = 'var(--success)';
    }
}

// ===== Unassigned Cargo Check =====
function checkUnassigned() {
    const warningArea = document.getElementById('warningArea');
    const existing = document.getElementById('unassignedWarning');
    if (existing) existing.remove();

    if (!isCalculated) return;

    const unassigned = cargoes.filter(c => {
        const assigned = tanks
            .filter(t => t.assignedCargo && t.assignedCargo.id === c.id)
            .reduce((s, t) => s + t.assignedCargo.weight, 0);
        return (c.quantity - assigned) > 0.1;
    });

    if (unassigned.length > 0) {
        const el = document.createElement('div');
        el.id = 'unassignedWarning';
        el.className = 'warning-banner warn';
        el.innerHTML = `⚠️ <strong>Unassigned Cargo!</strong> ` +
            unassigned.map(c => {
                const assigned = tanks.filter(t => t.assignedCargo && t.assignedCargo.id === c.id).reduce((s, t) => s + t.assignedCargo.weight, 0);
                return `${c.name}: ${(c.quantity - assigned).toFixed(1)} MT remaining`;
            }).join(' | ');
        warningArea.appendChild(el);
    }
}

// ===== Tank Adjustment =====
function adjustTank(tankId, direction) {
    const tank = tanks.find(t => t.id === tankId);
    if (!tank || !tank.assignedCargo) return;

    let step = 10;
    if (adjustUnit === '%') step = 1;

    let newVolume = tank.currentVolume;
    if (adjustUnit === 'MT') {
        newVolume += (direction * step) / tank.assignedCargo.sg;
    } else if (adjustUnit === 'm3') {
        newVolume += direction * step;
    } else if (adjustUnit === '%') {
        newVolume += (direction * step / 100) * tank.capacity100;
    }

    if (newVolume < 0) newVolume = 0;
    if (newVolume > tank.maxVolume) newVolume = tank.maxVolume;

    tank.currentVolume = newVolume;
    tank.assignedCargo.volume = newVolume;
    tank.assignedCargo.weight = newVolume * tank.assignedCargo.sg;
    syncCargoWeightsFromTanks();

    renderShipView();
    renderCargoList();
    updateStats();
    updateDWT();
    checkStability();
    checkUnassigned();
    checkCargoCompatibility();
    safeRenderCompliance();
}

// ===== Tank slider UX helpers =====
// Keep the control panel open while dragging (even if cursor leaves the cell).
function tankSliderStart(sliderEl) {
    const wrap = sliderEl.closest('.tank-slider-wrap');
    if (wrap) wrap.classList.add('dragging');
}
function tankSliderEnd(sliderEl) {
    // Full refresh (DWT / stability / compliance) once drag finishes.
    // The control panel stays visible at all times (no hover dependency).
    if (typeof renderShipView === 'function') renderShipView();
    if (typeof updateDWT === 'function') updateDWT();
    if (typeof checkStability === 'function') checkStability();
    if (typeof safeRenderCompliance === 'function') safeRenderCompliance();
}

// Update the live readout (% / m3 / MT) without a full re-render (smooth drag).
function updateSliderReadout(tankId, pct, m3, mt) {
    const ro = document.getElementById('ro-' + tankId);
    if (!ro) return;
    const pctEl = ro.querySelector('.ro-pct');
    const m3El = ro.querySelector('.ro-m3');
    const mtEl = ro.querySelector('.ro-mt');
    if (pctEl) pctEl.textContent = pct.toFixed(1) + '%';
    if (m3El) m3El.textContent = m3.toFixed(1) + ' m³';
    if (mtEl) mtEl.textContent = mt.toFixed(1) + ' MT';
}

// Cargo tank slider (drag) — percent of tank's scoped max volume.
function tankSliderInput(tankId, value, sliderEl) {
    const tank = tanks.find(t => t.id === tankId);
    if (!tank || !tank.assignedCargo) return;
    const pct = parseFloat(value);
    const maxVol = (tank.maxVolume && tank.capacity100) ? tank.maxVolume : tank.capacity100;
    let newVolume = (pct / 100) * tank.capacity100;
    if (newVolume > maxVol) newVolume = maxVol;
    if (newVolume < 0) newVolume = 0;
    tank.currentVolume = newVolume;
    tank.assignedCargo.volume = newVolume;
    tank.assignedCargo.weight = newVolume * tank.assignedCargo.sg;
    syncCargoWeightsFromTanks();
    updateSliderReadout(tankId, pct, newVolume, tank.assignedCargo.weight);
}
window.tankSliderInput = tankSliderInput;

// Ballast tank slider (drag)
function tankSliderBallastInput(tankId, value, sliderEl) {
    const tank = ballastTanks.find(t => t.id === tankId);
    if (!tank) return;
    const pct = parseFloat(value);
    let newVolume = (pct / 100) * tank.capacity100;
    if (newVolume < 0) newVolume = 0;
    if (newVolume > tank.capacity100) newVolume = tank.capacity100;
    tank.currentVolume = newVolume;
    const totalBallast = ballastTanks.reduce((sum, t) => sum + t.currentVolume * 1.0, 0);
    const cB = document.getElementById('cBallast');
    if (cB) cB.value = Math.round(totalBallast);
    updateSliderReadout(tankId, pct, newVolume, newVolume);
}
window.tankSliderBallastInput = tankSliderBallastInput;

// ± step buttons — respect the active adjust unit (MT / m3 / %).
function tankStep(tankId, direction, btn) {
    adjustTank(tankId, direction);
    const tank = tanks.find(t => t.id === tankId);
    if (tank && tank.assignedCargo) {
        const pct = (tank.currentVolume / tank.capacity100) * 100;
        updateSliderReadout(tankId, pct, tank.currentVolume, tank.assignedCargo.weight);
    }
}
window.tankStep = tankStep;

function tankStepBallast(tankId, direction, btn) {
    adjustBallastTank(tankId, direction);
    const tank = ballastTanks.find(t => t.id === tankId);
    if (tank) {
        const pct = (tank.currentVolume / tank.capacity100) * 100;
        updateSliderReadout(tankId, pct, tank.currentVolume, tank.currentVolume);
    }
}
window.tankStepBallast = tankStepBallast;

// ===== Tank Adjustment (slider — percent of this tank's scoped max) =====
function adjustTankSlider(tankId, value, sliderEl) {
    const tank = tanks.find(t => t.id === tankId);
    if (!tank || !tank.assignedCargo) return;

    const pct = parseFloat(value);
    const maxVol = (tank.maxVolume && tank.capacity100)
        ? tank.maxVolume
        : tank.capacity100;
    let newVolume = (pct / 100) * tank.capacity100;
    if (newVolume > maxVol) newVolume = maxVol;
    if (newVolume < 0) newVolume = 0;

    tank.currentVolume = newVolume;
    tank.assignedCargo.volume = newVolume;
    tank.assignedCargo.weight = newVolume * tank.assignedCargo.sg;
    syncCargoWeightsFromTanks();

    if (sliderEl) {
        const sliderMax = (maxVol / tank.capacity100) * 100;
        sliderEl.max = sliderMax.toFixed(1);
    }
    renderShipView();
    renderCargoList();
    updateStats();
    updateDWT();
    checkStability();
    checkUnassigned();
    checkCargoCompatibility();
    safeRenderCompliance();
}
window.adjustTankSlider = adjustTankSlider;

function setAdjustUnit(unit, btn) {
    adjustUnit = unit;
    document.querySelectorAll('.unit-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderShipView(); // Refresh to update +/- button labels and tank highlights
}

// ===== View Mode Selection =====
function setViewMode(mode, btn) {
    activePlanView = mode;
    const viewCargoBtn = document.getElementById('viewCargoBtn');
    const viewBallastBtn = document.getElementById('viewBallastBtn');
    if (viewCargoBtn && viewBallastBtn) {
        viewCargoBtn.classList.toggle('active', mode === 'cargo');
        viewBallastBtn.classList.toggle('active', mode === 'ballast');
    }
    renderShipView();
}
window.setViewMode = setViewMode;

function renderBallastShipView(container) {
    const frames = [...new Set(ballastTanks.filter(t => t.id !== 'FPT').map(t => t.frame))];
    frames.sort((a, b) => {
        const startA = parseInt(a.split('-')[0]);
        const startB = parseInt(b.split('-')[0]);
        return startB - startA;
    });

    const fpt = ballastTanks.find(t => t.id === 'FPT');

    let html = `<div class="ship-bow ballast-bow" style="display:flex; flex-direction:column; justify-content:space-between; align-items:center; height:200px; padding: 10px 0;">
        <span style="font-weight:bold; color:var(--text-muted); font-size:0.7rem; writing-mode:vertical-rl; text-orientation:mixed;">BOW</span>
        ${renderBallastTankCell(fpt)}
    </div>`;

    html += '<div class="ship-tanks">';
    frames.forEach(frame => {
        const frameTanks = ballastTanks.filter(t => t.frame === frame);
        const portTank = frameTanks.find(t => t.side === 'P');
        const stbdTank = frameTanks.find(t => t.side === 'S');

        html += '<div class="tank-column">';
        html += renderBallastTankCell(portTank);
        html += `<div class="tank-frame-label">${frame}</div>`;
        html += renderBallastTankCell(stbdTank);
        html += '</div>';
    });
    html += '</div>';

    html += '<div class="ship-stern">S T E R N</div>';

    container.innerHTML = html;

    const existingDeck = document.getElementById('deckTanksRow');
    if (existingDeck) existingDeck.remove();
}

function renderBallastTankCell(tank) {
    if (!tank) return '<div class="tank-cell" style="visibility:hidden;"></div>';

    const fillPct = (tank.currentVolume / tank.capacity100) * 100;
    const isOver = fillPct > 100.01;
    const pctClass = isOver ? 'danger' : (fillPct > 98 ? 'warning' : 'ok');

    const bgColor = 'rgba(14, 165, 233, 0.4)';

    let bodyHtml = `
        <div class="tank-body">
            <div class="tank-cargo-name">Ballast Water</div>
            <div class="tank-cargo-weight" style="color:var(--accent); font-weight:800; font-size:0.75rem;">
                ${(tank.currentVolume * 1.0).toFixed(1)} MT
            </div>
            <div class="tank-cargo-volume">
                ${tank.currentVolume.toFixed(1)} m³
            </div>
        </div>
    `;

    let controlsHtml = `
        <div class="tank-slider-wrap" id="slw-${tank.id}">
            <div class="tank-cap-line">Cap: ${tank.capacity100.toFixed(0)} m³</div>
            <div class="tank-slider-readout" id="ro-${tank.id}">
                <span class="ro-pct">${fillPct.toFixed(1)}%</span> ·
                <span class="ro-m3">${tank.currentVolume.toFixed(1)} m³</span> ·
                <span class="ro-mt">${tank.currentVolume.toFixed(1)} MT</span>
            </div>
            <div class="tank-step-btns">
                <button class="tank-step-btn" title="Decrease ${adjustUnit}" data-dir="-1" onclick="tankStepBallast('${tank.id}', -1, this)">−</button>
            </div>
            <input type="range" class="tank-slider ballast" min="0" max="100" step="0.5"
                value="${fillPct.toFixed(1)}"
                oninput="tankSliderBallastInput('${tank.id}', this.value, this)"
                onmousedown="tankSliderStart(this)"
                onmouseup="tankSliderEnd(this)"
                onmouseleave="tankSliderEnd(this)"
                ontouchstart="tankSliderStart(this)"
                ontouchend="tankSliderEnd(this)" />
            <div class="tank-step-btns">
                <button class="tank-step-btn" title="Increase ${adjustUnit}" data-dir="1" onclick="tankStepBallast('${tank.id}', 1, this)">+</button>
            </div>
            <span class="tank-slider-val">${fillPct.toFixed(0)}%</span>
        </div>
    `;

    return `
        <div class="tank-cell ${isOver ? 'overfill' : ''}" style="border-color: rgba(14, 165, 233, 0.2); width: 100%; height: 128px;">
            <div class="tank-fill" style="height:${Math.min(fillPct, 100)}%; background:${bgColor};"></div>
            <div class="tank-content">
                <div class="tank-header">
                    <span>${tank.name}</span>
                    <span class="tank-fill-pct ${pctClass}">
                        ${fillPct.toFixed(1)}%
                    </span>
                </div>
                ${bodyHtml}
            </div>
            ${controlsHtml}
        </div>
    `;
}

function adjustBallastTank(tankId, direction) {
    const tank = ballastTanks.find(t => t.id === tankId);
    if (!tank) return;

    let step = 10;
    if (adjustUnit === '%') step = 1;

    let newVolume = tank.currentVolume;
    if (adjustUnit === 'MT' || adjustUnit === 'm3') {
        newVolume += direction * step;
    } else if (adjustUnit === '%') {
        newVolume += (direction * step / 100) * tank.capacity100;
    }

    if (newVolume < 0) newVolume = 0;
    if (newVolume > tank.capacity100) newVolume = tank.capacity100;

    tank.currentVolume = newVolume;

    // Recalculate total ballast weight and update input field
    const totalBallast = ballastTanks.reduce((sum, t) => sum + t.currentVolume * 1.0, 0);
    document.getElementById('cBallast').value = Math.round(totalBallast);

    // Refresh UI
    renderShipView();
    updateStats();
    updateDWT();
    checkStability();
}
window.adjustBallastTank = adjustBallastTank;

// ===== Ballast Tank Adjustment (slider — percent of tank capacity) =====
function adjustBallastTankSlider(tankId, value, sliderEl) {
    const tank = ballastTanks.find(t => t.id === tankId);
    if (!tank) return;

    const pct = parseFloat(value);
    let newVolume = (pct / 100) * tank.capacity100;
    if (newVolume < 0) newVolume = 0;
    if (newVolume > tank.capacity100) newVolume = tank.capacity100;

    tank.currentVolume = newVolume;

    const totalBallast = ballastTanks.reduce((sum, t) => sum + t.currentVolume * 1.0, 0);
    document.getElementById('cBallast').value = Math.round(totalBallast);

    renderShipView();
    updateStats();
    updateDWT();
    checkStability();
}
window.adjustBallastTankSlider = adjustBallastTankSlider;

// ===== Full Ballast / Auto Ballast =====
const BALLAST_FULL_PCT = 100;   // fully pressed up
const BALLAST_LADEN_PCT = 2;    // residual slop when fully laden

function setAllBallast(pct) {
    if (typeof ballastTanks === 'undefined') return;
    ballastTanks.forEach(t => {
        t.currentVolume = (pct / 100) * t.capacity100;
    });
    const totalBallast = ballastTanks.reduce((sum, t) => sum + t.currentVolume * 1.0, 0);
    if (document.getElementById('cBallast')) {
        document.getElementById('cBallast').value = Math.round(totalBallast);
    }
    renderShipView();
    updateStats();
    updateDWT();
    checkStability();
    notify(pct >= 100 ? 'All ballast tanks FULL' : `All ballast tanks set to ${pct}%`, 'info');
}
window.setAllBallast = setAllBallast;

// Auto ballast logic per loading condition:
//   - No cargo: ballast tanks FULL (pressed up for stability/trim in ballast voyage).
//   - As cargo is loaded, ballast decreases proportionally to the remaining DWT margin.
//   - Fully laden (cargo near DWT limit): ballast drops to residual BALLAST_LADEN_PCT (2%).
// Implemented as: target ballast tons = clamp(limit - cargo - constant - mgo - fw - luboil,
//   2% of total ballast capacity, 100% of total ballast capacity), distributed evenly.
function autoBallast() {
    if (typeof cargoes === 'undefined' || typeof ballastTanks === 'undefined') return;
    const totalCargo = cargoes.reduce((s, c) => s + (c.quantity || 0), 0);
    if (totalCargo <= 0.01) {
        setAllBallast(BALLAST_FULL_PCT);
        return;
    }
    const limit = (typeof getCurrentDWTLimit === 'function') ? getCurrentDWTLimit() : 5707;
    const constant = parseFloat(document.getElementById('cConstant')?.value) || 0;
    const mgo = parseFloat(document.getElementById('cMGO')?.value) || 0;
    const fw = parseFloat(document.getElementById('cFW')?.value) || 0;
    const luboil = parseFloat(document.getElementById('cLuboil')?.value) || 0;

    const totalBallastCap = ballastTanks.reduce((s, t) => s + t.capacity100, 0);
    const minBallast = totalBallastCap * (BALLAST_LADEN_PCT / 100);
    const maxBallast = totalBallastCap; // 100%

    // Remaining DWT margin for ballast (cargo already counts toward DWT)
    let targetBallast = limit - totalCargo - constant - mgo - fw - luboil;
    if (targetBallast > maxBallast) targetBallast = maxBallast;
    if (targetBallast < minBallast) targetBallast = minBallast;

    const pct = (targetBallast / totalBallastCap) * 100;
    setAllBallast(Math.max(BALLAST_LADEN_PCT, Math.min(BALLAST_FULL_PCT, pct)));
}
window.autoBallast = autoBallast;

function handleManualBallastChange(val) {
    const total = parseFloat(val) || 0;
    const totalCap = ballastTanks.reduce((s, t) => s + t.capacity100, 0);
    if (totalCap > 0) {
        ballastTanks.forEach(t => {
            t.currentVolume = (t.capacity100 / totalCap) * total;
        });
    }
    updateDWT();
    renderShipView();
    checkStability();
}
window.handleManualBallastChange = handleManualBallastChange;

// ===== Render Ship View =====
function renderShipView() {
    const container = document.getElementById('shipLayout');

    if (activePlanView === 'ballast') {
        renderBallastShipView(container);
        return;
    }

    // Group tanks by frame
    const frames = [...new Set(tanks.filter(t => t.frame !== 'DECK').map(t => t.frame))];
    frames.sort((a, b) => {
        const startA = parseInt(a.split('-')[0]);
        const startB = parseInt(b.split('-')[0]);
        return startB - startA;
    });

    let html = '<div class="ship-bow">B O W</div>';

    html += '<div class="ship-tanks">';
    frames.forEach(frame => {
        const frameTanks = tanks.filter(t => t.frame === frame);
        const portTank = frameTanks.find(t => t.side === 'P');
        const stbdTank = frameTanks.find(t => t.side === 'S');

        html += '<div class="tank-column">';
        html += renderTankCell(portTank);
        html += `<div class="tank-frame-label">${frame}</div>`;
        html += renderTankCell(stbdTank);
        html += '</div>';
    });
    html += '</div>';

    html += '<div class="ship-stern">S T E R N</div>';

    container.innerHTML = html;

    // Deck tanks
    const deckTanks = tanks.filter(t => t.frame === 'DECK');
    const existingDeck = document.getElementById('deckTanksRow');
    if (existingDeck) existingDeck.remove();

    if (deckTanks.length > 0) {
        const deckRow = document.createElement('div');
        deckRow.id = 'deckTanksRow';
        deckRow.className = 'deck-tanks-row';
        deckRow.innerHTML = deckTanks.map(dt => `
            <div>
                <div class="deck-tank-label">🔲 ${dt.name}</div>
                ${renderTankCell(dt)}
            </div>
        `).join('');
        container.parentElement.appendChild(deckRow);
    }
}

function renderTankCell(tank) {
    if (!tank) return '<div class="tank-cell" style="visibility:hidden;"></div>';

    const fillPct = (tank.currentVolume / tank.capacity100) * 100;
    // Allowed fill limit per this tank's scoped maxVolume (SG-aware). Empty tanks use the
    // base MAX_FILL_PERCENTAGE; assigned tanks use their cargo's interpolated limit.
    const limit = (tank.maxVolume && tank.capacity100)
        ? (tank.maxVolume / tank.capacity100) * 100
        : (tank.name.includes('DECK') ? DECK_MAX_FILL_PERCENTAGE : MAX_FILL_PERCENTAGE);
    const isOver = fillPct > (limit + 0.01);
    const pctClass = isOver ? 'danger' : (fillPct > limit - 12 ? 'warning' : 'ok');

    const bgColor = tank.assignedCargo ? tank.assignedCargo.color : 'transparent';

    let bodyHtml = '';
    if (tank.assignedCargo) {
        const isMT = adjustUnit === 'MT';
        const isM3 = adjustUnit === 'm3';
        bodyHtml = `
            <div class="tank-body">
                <div class="tank-cargo-name" title="${tank.assignedCargo.name}">${tank.assignedCargo.name}</div>
                <div class="tank-cargo-sub">
                    <span class="tank-cargo-weight ${isMT ? 'active' : ''}">${tank.assignedCargo.weight.toFixed(0)} MT</span>
                    <span class="tank-cargo-volume ${isM3 ? 'active' : ''}">${tank.assignedCargo.volume.toFixed(0)} m³</span>
                </div>
            </div>
        `;
    } else {
        bodyHtml = '<div class="tank-body"><div class="tank-empty">Empty</div></div>';
    }

    // Controls: horizontal slider at bottom + ± step buttons + capacity line.
    let controlsHtml = '';
    if (tank.assignedCargo) {
        const sliderMax = (tank.maxVolume && tank.capacity100)
            ? (tank.maxVolume / tank.capacity100) * 100
            : 100;
        const curPct = Math.min(fillPct, sliderMax);
        const stepLabel = (adjustUnit === 'MT') ? 'MT' : (adjustUnit === 'm3' ? 'm³' : '%');
        controlsHtml = `
            <div class="tank-slider-wrap" id="slw-${tank.id}">
                <div class="tank-cap-line">Cap: ${tank.capacity100.toFixed(0)} m³</div>
                <div class="tank-slider-readout" id="ro-${tank.id}">
                    <span class="ro-pct">${curPct.toFixed(1)}%</span> ·
                    <span class="ro-m3">${(tank.currentVolume).toFixed(1)} m³</span> ·
                    <span class="ro-mt">${(tank.assignedCargo.weight).toFixed(1)} MT</span>
                </div>
                <div class="tank-step-btns">
                    <button class="tank-step-btn" title="Decrease ${stepLabel}" data-dir="-1" onclick="tankStep('${tank.id}', -1, this)">−</button>
                </div>
                <input type="range" class="tank-slider" min="0" max="${sliderMax.toFixed(1)}" step="0.5"
                    value="${curPct.toFixed(1)}"
                    oninput="tankSliderInput('${tank.id}', this.value, this)"
                    onmousedown="tankSliderStart(this)"
                    onmouseup="tankSliderEnd(this)"
                    onmouseleave="tankSliderEnd(this)"
                    ontouchstart="tankSliderStart(this)"
                    ontouchend="tankSliderEnd(this)" />
                <div class="tank-step-btns">
                    <button class="tank-step-btn" title="Increase ${stepLabel}" data-dir="1" onclick="tankStep('${tank.id}', 1, this)">+</button>
                </div>
                <span class="tank-slider-val">${curPct.toFixed(0)}%</span>
            </div>
        `;
    }

    return `
        <div class="tank-cell ${isOver ? 'overfill' : ''}">
            <div class="tank-fill" style="height:${Math.min(fillPct, 100)}%; background:${bgColor};"></div>
            <div class="tank-content">
                <div class="tank-header">
                    <span class="tank-name">${tank.name}</span>
                    <span class="tank-fill-pct ${pctClass}" style="${adjustUnit === '%' ? 'border:1px solid var(--amber); border-radius:3px; padding:0 2px; color:var(--amber) !important;' : ''}">
                        ${fillPct.toFixed(1)}%
                    </span>
                </div>
                ${bodyHtml}
            </div>
            ${controlsHtml}
        </div>
    `;
}

// ===== Notifications =====
function notify(msg, type) {
    const container = document.getElementById('notifications');
    const el = document.createElement('div');
    el.className = `notification ${type}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), 4000);
}

// ===== Export Stubs =====
function exportPDF() {
    notify('PDF Export: Preparing report…', 'info');
    // Generate a printable version
    const w = window.open('', '_blank');
    const totalCargoWeight = cargoes.reduce((s, c) => s + c.quantity, 0);
    const constant = parseFloat(document.getElementById('cConstant').value) || 0;
    const mgo = parseFloat(document.getElementById('cMGO').value) || 0;
    const fw = parseFloat(document.getElementById('cFW').value) || 0;
    const ballast = parseFloat(document.getElementById('cBallast').value) || 0;
    const luboil = parseFloat(document.getElementById('cLuboil').value) || 0;
    const actualDWT = totalCargoWeight + constant + mgo + fw + ballast + luboil;

    let html = `<!DOCTYPE html><html><head><title>Cargo Plan - M/T ADA</title>
    <style>
        body{font-family:Arial,sans-serif;padding:2rem;color:#222;}
        h1{font-size:1.5rem;margin-bottom:0.5rem;}
        table{width:100%;border-collapse:collapse;margin:1rem 0;}
        th,td{border:1px solid #ddd;padding:6px 10px;font-size:0.8rem;text-align:left;}
        th{background:#f0f0f0;font-weight:700;}
        .total-row{font-weight:700;background:#e8e8e8;}
        @media print{body{padding:0.5rem;}}
    </style></head><body>
    <h1>⚓ Cargo Optimization Report — M/T ADA</h1>
    <p>Date: ${new Date().toLocaleString()} | Voy No: ${document.getElementById('cVoyNo').value || '—'}</p>
    <h2>DWT & Constants</h2>
    <table>
        <tr><th>Constant</th><th>MGO</th><th>FW</th><th>Ballast</th><th>Luboil</th><th>Total Cargo</th><th>Actual DWT</th></tr>
        <tr><td>${constant}</td><td>${mgo}</td><td>${fw}</td><td>${ballast}</td><td>${luboil}</td><td>${totalCargoWeight.toFixed(1)}</td><td><strong>${actualDWT.toFixed(3)}</strong></td></tr>
    </table>
    <h2>Cargo Manifest</h2>
    <table>
        <tr><th>Parcel</th><th>Cargo</th><th>Qty (MT)</th><th>SG</th><th>Load</th><th>Disch</th><th>Strategy</th></tr>
        ${cargoes.map(c => `<tr><td>${escapeHtml(c.parcelNo||'—')}</td><td>${escapeHtml(c.name)}</td><td>${c.quantity}</td><td>${c.sg}</td><td>${escapeHtml(c.loadPort||'—')}</td><td>${escapeHtml(c.dischPort||'—')}</td><td>${escapeHtml(c.strategy)}</td></tr>`).join('')}
    </table>
    <h2>Tank Distribution</h2>
    <table>
        <tr><th>Tank</th><th>Cap 100%</th><th>Volume m³</th><th>Weight MT</th><th>Cargo</th><th>Fill %</th></tr>
        ${tanks.map(t => `<tr><td>${escapeHtml(t.name)}</td><td>${t.capacity100.toFixed(1)}</td><td>${t.currentVolume.toFixed(1)}</td><td>${t.assignedCargo ? t.assignedCargo.weight.toFixed(1) : '0'}</td><td>${t.assignedCargo ? escapeHtml(t.assignedCargo.name) : 'Empty'}</td><td>${((t.currentVolume/t.capacity100)*100).toFixed(1)}%</td></tr>`).join('')}
        <tr class="total-row"><td>TOTAL</td><td></td><td>${tanks.reduce((s,t)=>s+t.currentVolume,0).toFixed(1)}</td><td>${tanks.reduce((s,t)=>s+(t.assignedCargo?t.assignedCargo.weight:0),0).toFixed(1)}</td><td></td><td></td></tr>
    </table>
    </body></html>`;
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 500);
}

function exportExcel() {
    notify('Excel Export: Generating CSV…', 'info');
    // Simple CSV export as fallback (no XLSX dependency needed)
    let csv = 'Tank,Capacity 100%,Volume m3,Weight MT,Cargo,Fill %\n';
    tanks.forEach(t => {
        const pct = ((t.currentVolume / t.capacity100) * 100).toFixed(1);
        const safeTankName = String(t.name).replace(/"/g, '""');
        const safeCargoName = String(t.assignedCargo ? t.assignedCargo.name : 'Empty').replace(/"/g, '""');
        csv += `"${safeTankName}",${t.capacity100.toFixed(3)},${t.currentVolume.toFixed(3)},${t.assignedCargo ? t.assignedCargo.weight.toFixed(3) : 0},"${safeCargoName}",${pct}\n`;
    });
    csv += `"TOTAL",,${tanks.reduce((s,t)=>s+t.currentVolume,0).toFixed(3)},${tanks.reduce((s,t)=>s+(t.assignedCargo?t.assignedCargo.weight:0),0).toFixed(3)},,\n`;

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cargo-plan.csv';
    a.click();
    URL.revokeObjectURL(url);
}

// ===== Autocomplete: Cargo Name + SG =====
function autocompleteCargo(val) {
    const dropdown = document.getElementById('acCargo');
    if (typeof CARGO_DB === 'undefined' || !Array.isArray(CARGO_DB)) {
        dropdown.classList.remove('show');
        return;
    }
    if (!val || val.length < 1) {
        dropdown.classList.remove('show');
        return;
    }

    const query = val.toLowerCase();
    const matches = CARGO_DB.filter(c => c.name.toLowerCase().includes(query)).slice(0, 10);

    if (matches.length === 0) {
        dropdown.classList.remove('show');
        return;
    }

    dropdown.innerHTML = matches.map(c => {
        const typeInfo = CARGO_TYPE_LABELS[c.type] || { label: '?', color: '#888' };
        return `<div class="ac-item" onmousedown="selectCargo('${c.name.replace(/'/g, "\\'")}', ${c.sg}, ${c.sgTemp}, '${c.type}')">
            <span class="ac-item-name">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${typeInfo.color};margin-right:6px;"></span>
                ${highlightMatch(c.name, query)}
            </span>
            <span class="ac-item-sg">${c.sg} @${c.sgTemp}°C</span>
        </div>`;
    }).join('');
    dropdown.classList.add('show');
}

function selectCargo(name, sg, sgTemp, cargoType) {
    document.getElementById('fName').value = name;
    document.getElementById('fSG').value = sg;
    document.getElementById('fSGTemp').value = sgTemp;
    document.getElementById('fCargoType').value = cargoType;
    document.getElementById('sgLabel').textContent = `SG (${sgTemp}°C)`;
    document.getElementById('acCargo').classList.remove('show');
    document.getElementById('fQuantity').focus();
}

// ===== Autocomplete: Port Names =====
function autocompletePort(val, dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (typeof PORT_DB === 'undefined' || !Array.isArray(PORT_DB)) {
        dropdown.classList.remove('show');
        return;
    }
    if (!val || val.length < 1) {
        dropdown.classList.remove('show');
        return;
    }

    const query = val.toLowerCase();
    const matches = PORT_DB.filter(p => p.toLowerCase().includes(query)).slice(0, 8);

    if (matches.length === 0) {
        dropdown.classList.remove('show');
        return;
    }

    // Determine which input field to fill
    const inputId = dropdownId === 'acLoadPort' ? 'fLoadPort' : 'fDischPort';

    dropdown.innerHTML = matches.map(p =>
        `<div class="ac-item" onmousedown="selectPort('${p.replace(/'/g, "\\'")}', '${inputId}', '${dropdownId}')">
            <span class="ac-item-port">${highlightMatch(p, query)}</span>
        </div>`
    ).join('');
    dropdown.classList.add('show');
}

function selectPort(name, inputId, dropdownId) {
    document.getElementById(inputId).value = name;
    document.getElementById(dropdownId).classList.remove('show');
}

// ===== Highlight matching text =====
function highlightMatch(text, query) {
    const idx = text.toLowerCase().indexOf(query);
    if (idx === -1) return text;
    return text.substring(0, idx) +
        '<strong style="color:var(--accent)">' + text.substring(idx, idx + query.length) + '</strong>' +
        text.substring(idx + query.length);
}

// ===== Close dropdowns on outside click =====
document.addEventListener('click', (e) => {
    if (!e.target.closest('.form-group')) {
        document.querySelectorAll('.ac-dropdown').forEach(d => d.classList.remove('show'));
    }
});

// Keep critical handlers reachable from inline HTML attributes
window.toggleTheme = toggleTheme;
window.autocompleteCargo = autocompleteCargo;
window.selectCargo = selectCargo;
window.autocompletePort = autocompletePort;
window.selectPort = selectPort;

// ===== IBC Code Compliance Rendering =====
// Defensive: only runs if checkChemicalCompliance is available. Never breaks the app.
function renderCompliance() {
    const panel = document.getElementById('compliancePanel');
    const badge = document.getElementById('complianceBadge');
    const catSum = document.getElementById('complianceCatSummary');
    if (!panel) return;
    if (typeof checkChemicalCompliance !== 'function') {
        panel.innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem;">Compliance module not loaded.</p>';
        return;
    }

    let result;
    try {
        result = checkChemicalCompliance();
    } catch (err) {
        console.warn('Compliance check failed:', err);
        return;
    }

    if (catSum) catSum.textContent = 'Categories: ' + (result.catSummary || '—');

    if (badge) {
        if (result.hardFail) {
            badge.className = 'season-badge winter';
            badge.textContent = '⚠ IBC: FAIL';
            badge.title = 'IBC Code compliance violations detected';
        } else if (result.warnings.length > 0) {
            badge.className = 'season-badge summer';
            badge.textContent = `⚠ IBC: ${result.warnings.length} adv`;
            badge.title = 'IBC Code advisories present';
        } else if (cargoes.length > 0) {
            badge.className = 'season-badge summer';
            badge.textContent = '✔ IBC: OK';
            badge.title = 'IBC Code compliance passed';
        } else {
            badge.className = 'season-badge summer';
            badge.textContent = '✔ IBC: OK';
        }
    }

    // Separate group control summary (flammable / corrosive / heated)
    const grpSummary = (() => {
        const groups = { flammable: [], corrosive: [], heated: [] };
        cargoes.forEach(c => {
            const f = (typeof getCargoFlags === 'function') ? getCargoFlags(c.name) : { flammable:false, corrosive:false, heated:false };
            if (f.flammable) groups.flammable.push(c.name);
            if (f.corrosive) groups.corrosive.push(c.name);
            if (f.heated)   groups.heated.push(c.name);
        });
        const parts = [];
        const mk = (label, cls, arr) => arr.length
            ? `<span class="comp-grp-sum ${cls}"><strong>${label}</strong> (${arr.length}): ${escapeHtml(arr.join(', '))}</span>`
            : '';
        const f = mk('🔥 Flammable', 'comp-grp-flam', groups.flammable);
        const crr = mk('🧪 Corrosive', 'comp-grp-corr', groups.corrosive);
        const h = mk('🌡 Heated', 'comp-grp-heat', groups.heated);
        if (f || crr || h) return `<div class="comp-groups">${f}${crr}${h}</div>`;
        return '';
    })();

    if (cargoes.length === 0) {
        panel.innerHTML = '<p style="color: var(--text-muted); font-size: 0.8rem; font-style: italic;">Add cargo and calculate to run IBC segregation, coating, SG & temperature checks.</p>';
        return;
    }

    // Build per-cargo cell data
    const cols = cargoes.map(c => {
        const pc = (result.perCargo && result.perCargo[c.id]) || { issues: [] };
        const cat = getCargoCategory(c.name) || '—';
        const reg = getCargoReg(c.name);
        const flags = (typeof getCargoFlags === 'function') ? getCargoFlags(c.name) : { flammable:false, corrosive:false, heated:false };
        const badges = [];
        if (flags.flammable) badges.push('<span class="comp-grp comp-grp-flam">FLAM</span>');
        if (flags.corrosive) badges.push('<span class="comp-grp comp-grp-corr">CORR</span>');
        if (flags.heated)   badges.push('<span class="comp-grp comp-grp-heat">HEAT</span>');
        const tempTxt = pc.temp
            ? `${(pc.temp.min != null ? '≥' + pc.temp.min + '°C' : '')}${(pc.temp.min != null && pc.temp.max != null) ? ' / ' : ''}${(pc.temp.max != null ? '≤' + pc.temp.max + '°C' : '')}`
            : 'ambient';
        const imdg = reg ? (reg.imdgClass && reg.imdgClass !== 'None' ? `Class ${reg.imdgClass}` : '—') : '—';
        const unNo = reg ? (reg.unNo && reg.unNo !== 'None' ? reg.unNo : '—') : '—';
        const a2 = reg ? (reg.a2cat || '—') : '—';
        const a2detail = [];
        if (reg) {
            if (reg.highVisc) a2detail.push('high visc');
            if (reg.solidify) a2detail.push('solidify');
        }
        const a2txt = a2 + (a2detail.length ? ' (' + a2detail.join(', ') + ')' : '');
        const coating = reg ? reg.reqCoating : '—';
        const coatingLabel = coating === 'MARINELINE' ? 'Marine-line' : coating;
        const issues = pc.issues.map(i =>
            `<span class="comp-issue comp-${i.level}">${escapeHtml(i.msg)}</span>`
        ).join('<br>');
        return {
            name: c.name, color: c.color, badges: badges.join(''),
            cells: {
                cat, coating: coatingLabel, temp: tempTxt, imdg, un: unNo, a2: a2txt,
                findings: issues || '<span class="comp-issue comp-ok">OK</span>'
            }
        };
    });

    // Table: first column = attribute labels, then one column per cargo
    const attrRows = [
        ['Cargo', c => `<span class="comp-cargo-h" style="border-left:3px solid ${c.color}">${escapeHtml(c.name)} ${c.badges}</span>`],
        ['IBC Category', c => escapeHtml(c.cells.cat)],
        ['Required Coating', c => escapeHtml(c.cells.coating)],
        ['Temperature Band', c => escapeHtml(c.cells.temp)],
        ['Annex 1 (IMDG)', c => escapeHtml(c.cells.imdg)],
        ['UN Number', c => escapeHtml(c.cells.un)],
        ['Annex 2 (IBC cat)', c => escapeHtml(c.cells.a2)],
        ['Findings', c => c.cells.findings],
    ];

    const headCells = '<th class="ibc-th-corner">Attribute</th>' + cols.map(c =>
        `<th class="ibc-th" style="border-top:3px solid ${c.color}">${escapeHtml(c.name)}</th>`
    ).join('');

    const bodyRows = attrRows.map(([label, fn]) =>
        `<tr><th class="ibc-row-head">${label}</th>${cols.map(c => `<td class="ibc-cell">${fn(c)}</td>`).join('')}</tr>`
    ).join('');

    const tableHtml = `<div class="ibc-table-wrap"><table class="ibc-table">
        <thead><tr>${headCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
    </table></div>`;

    let segHtml = '';
    if (result.warnings.length > 0) {
        segHtml = result.warnings.map(w =>
            `<div class="warning-banner ${w.level === 'danger' ? 'danger' : 'warn'}" style="margin-bottom:0.5rem;animation:none;">
                ${w.level === 'danger' ? '⛔' : '⚠️'} <strong>${escapeHtml(w.cat || 'Compliance')}:</strong> ${escapeHtml(w.msg)}
            </div>`
        ).join('');
    }

    panel.innerHTML = grpSummary + tableHtml + (segHtml ? `<div style="margin-top:0.75rem;">${segHtml}</div>` : '');
}
window.renderCompliance = renderCompliance;

// Safe wrapper to call from existing handlers without affecting them
function safeRenderCompliance() {
    try { renderCompliance(); } catch (e) { console.warn('safeRenderCompliance:', e); }
}

