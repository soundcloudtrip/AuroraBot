const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const CONFIG = {
    BOT_USERNAME: 'AuroraWhisperBot',
    FREE_DAILY_LIMIT: 5,
    STARS_DAY: 80,
    STARS_MONTH: 250,
    STARS_HALFYEAR: 1500,
    // ⚠️ ЗАМЕНИ на IP или домен сервера где запущен bot.py
    // Например: 'http://185.123.45.67:8000'
    API: 'https://dating-similar-carolina-luke.trycloudflare.com'
};

const state = {
    user: null,
    currentPage: 'home',
    compatibility: { myDate: '', partnerDate: '' }
};

const $ = id => document.getElementById(id);
const splashScreen   = $('splash-screen');
const mainApp        = $('main-app');
const sidebar        = $('sidebar');
const sidebarOverlay = $('sidebarOverlay');
const content        = $('content');
const modal          = $('modal');
const modalBody      = $('modalBody');
const toast          = $('toast');
const userName       = $('userName');
const userStatus     = $('userStatus');

// ─── AI запрос ───────────────────────────────────────────────────────────────

async function askBot(payload) {
    const res = await fetch(CONFIG.API + '/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ...payload,
            first_name: state.user ? state.user.first_name : 'подруга'
        })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Ошибка сервера');
    return data.result;
}

// ─── Инициализация ───────────────────────────────────────────────────────────

function initApp() {
    const d = tg.initDataUnsafe;
    state.user = (d && d.user) ? d.user : { id: 0, first_name: 'Гость', username: '' };
    const key = 'u_' + new Date().toDateString();
    state.userData = {
        is_premium:   false,
        points:       +localStorage.getItem('pts') || 0,
        today_usage:  +localStorage.getItem(key)   || 0,
        ref_code:     localStorage.getItem('ref')  || ('REF' + Math.random().toString(36).slice(-5).toUpperCase())
    };
    localStorage.setItem('ref', state.userData.ref_code);
    updateUserInfo();
    setTimeout(() => {
        splashScreen.classList.add('hidden');
        mainApp.classList.remove('hidden');
        loadPage('home');
    }, 1200);
}

function updateUserInfo() {
    userName.textContent  = state.user.first_name;
    userStatus.textContent = state.userData.is_premium ? '⭐ Премиум' : '🆓 Бесплатный';
}

// ─── Навигация ────────────────────────────────────────────────────────────────

function navigateTo(page) {
    state.currentPage = page;
    loadPage(page);
    document.querySelectorAll('.nav-item,.bottom-nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.page === page);
    });
    closeSidebar();
}

function loadPage(page) {
    const map = { home: renderHome, oracle: renderOracle, compatibility: renderCompat,
                  chat: renderChat, flirt: renderFlirt, premium: renderPremium,
                  profile: renderProfile, referral: renderReferral };
    content.innerHTML = map[page] ? map[page]() : '';
}

// ─── Страницы ─────────────────────────────────────────────────────────────────

function renderHome() {
    const today = new Date().toLocaleDateString('ru-RU', {weekday:'long', day:'numeric', month:'long'});
    const used  = state.userData.today_usage;
    const rem   = Math.max(0, CONFIG.FREE_DAILY_LIMIT - used);
    return `
      <div class="card fade-in">
        <h2 class="card-title">Привет, ${state.user.first_name}! 👋</h2>
        <p class="card-subtitle">${today}</p>
        <div class="stats-container">
          <div class="stat-item"><span class="stat-value">${used}/${CONFIG.FREE_DAILY_LIMIT}</span><span class="stat-label">Запросов сегодня</span></div>
          <div class="stat-item"><span class="stat-value">${state.userData.points}</span><span class="stat-label">Очков</span></div>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${(used/CONFIG.FREE_DAILY_LIMIT)*100}%"></div></div>
        <p class="text-center">Осталось ${rem} бесплатных запросов</p>
      </div>
      <div class="feature-grid">
        <div class="feature-item" onclick="navigateTo('oracle')"><span class="feature-icon">🌙</span><span class="feature-title">Оракул дня</span></div>
        <div class="feature-item" onclick="navigateTo('compatibility')"><span class="feature-icon">💑</span><span class="feature-title">Совместимость</span></div>
        <div class="feature-item" onclick="navigateTo('chat')"><span class="feature-icon">💬</span><span class="feature-title">Разбор чата</span></div>
        <div class="feature-item" onclick="navigateTo('flirt')"><span class="feature-icon">✨</span><span class="feature-title">Флирт</span></div>
      </div>
      ${!state.userData.is_premium ? '<div class="card premium-card"><h3 class="card-title">⭐ Премиум</h3><p>Безлимитные запросы</p><button class="btn btn-small mt-20" onclick="navigateTo(\'premium\')">Подробнее</button></div>' : ''}
      <div class="card"><h3 class="card-title">🔮 Сегодняшний совет</h3><p>Доверяй своей интуиции. Звёзды благосклонны к смелым!</p></div>`;
}

function renderOracle() {
    return `<div class="card">
      <h2 class="card-title">🌙 Оракул дня</h2>
      <p class="card-subtitle">Узнай, что звёзды приготовили для тебя сегодня</p>
      <button class="btn btn-icon" id="oracleBtn" onclick="getOracle()"><span>🔮 Получить расклад</span></button>
    </div>
    <div id="oracleResult" class="card hidden"><div id="oracleContent"></div></div>`;
}

function renderCompat() {
    return `<div class="card">
      <h2 class="card-title">💑 Совместимость</h2>
      <p class="card-subtitle">Введи даты рождения для расчёта совместимости</p>
      <div class="input-group">
        <label class="input-label">Твоя дата рождения (ДД.ММ.ГГГГ)</label>
        <input type="text" class="input-field" id="myDate" placeholder="15.05.1995" value="${state.compatibility.myDate}">
      </div>
      <div class="input-group">
        <label class="input-label">Дата рождения партнёра</label>
        <input type="text" class="input-field" id="partnerDate" placeholder="20.08.1994" value="${state.compatibility.partnerDate}">
      </div>
      <button class="btn" id="compatBtn" onclick="calculateCompatibility()">Рассчитать совместимость</button>
    </div>
    <div id="compatResult" class="card hidden"><div id="compatContent"></div></div>`;
}

function renderChat() {
    return `<div class="card">
      <h2 class="card-title">💬 Разбор переписки</h2>
      <p class="card-subtitle">Вставь текст переписки для анализа</p>
      <div class="input-group"><textarea class="input-field textarea" id="chatText" placeholder="Вставь сюда переписку..."></textarea></div>
      <button class="btn" id="chatBtn" onclick="analyzeChat()">Проанализировать</button>
    </div>
    <div id="chatResult" class="card hidden"><div id="chatContent"></div></div>`;
}

function renderFlirt() {
    return `<div class="card">
      <h2 class="card-title">✨ Флирт-генератор</h2>
      <p class="card-subtitle">Напиши, что тебе написал парень, и получи варианты ответов</p>
      <div class="input-group"><textarea class="input-field textarea" id="flirtMessage" placeholder="Сообщение от парня..."></textarea></div>
      <button class="btn" id="flirtBtn" onclick="generateFlirt()">Сгенерировать ответы</button>
    </div>
    <div id="flirtResult" class="card hidden"><div id="flirtContent"></div></div>`;
}

function renderPremium() {
    return `<div class="card">
      <h2 class="card-title">⭐ Премиум подписка</h2>
      <p class="card-subtitle">Безлимитный доступ ко всем функциям</p>
      <div class="premium-price">от ${CONFIG.STARS_DAY} ⭐<span class="price-period">/день</span></div>
      <div class="feature-grid">
        <div class="feature-item"><span class="feature-icon">✨</span><span class="feature-title">Безлимит</span></div>
        <div class="feature-item"><span class="feature-icon">🔮</span><span class="feature-title">Эксклюзив</span></div>
        <div class="feature-item"><span class="feature-icon">💫</span><span class="feature-title">Приоритет</span></div>
        <div class="feature-item"><span class="feature-icon">🎁</span><span class="feature-title">Бонусы</span></div>
      </div>
      <button class="btn" onclick="showPremiumPlans()">Выбрать тариф</button>
    </div>`;
}

function renderProfile() {
    return `<div class="card">
      <h2 class="card-title">👤 Профиль</h2>
      <div class="stats-container">
        <div class="stat-item"><span class="stat-value">${state.userData.points}</span><span class="stat-label">Очков</span></div>
        <div class="stat-item"><span class="stat-value">${state.userData.today_usage}</span><span class="stat-label">Сегодня</span></div>
      </div>
      <div style="padding:10px 0;border-bottom:1px solid var(--border-color)"><strong>Имя:</strong> ${state.user.first_name}</div>
      <div style="padding:10px 0;border-bottom:1px solid var(--border-color)"><strong>Username:</strong> @${state.user.username || '—'}</div>
      <div style="padding:10px 0;border-bottom:1px solid var(--border-color)"><strong>ID:</strong> ${state.user.id}</div>
      <div style="padding:10px 0"><strong>Премиум:</strong> ${state.userData.is_premium ? '⭐ Да' : '🆓 Нет'}</div>
      ${state.user.id === 5914838626 ? '<button class="btn btn-outline mt-20" onclick="generateAdminLink()">👑 Ссылка на 14 дней</button>' : ''}
    </div>`;
}

function renderReferral() {
    const link = `https://t.me/${CONFIG.BOT_USERNAME}?start=ref=${state.userData.ref_code}`;
    return `<div class="card">
      <h2 class="card-title">🔗 Реферальная программа</h2>
      <p class="card-subtitle">Приглашай друзей и получай бонусы</p>
      <div class="referral-link">
        <span class="referral-code">${state.userData.ref_code}</span>
        <button class="copy-btn" onclick="copyReferral('${state.userData.ref_code}')">📋</button>
      </div>
      <div class="referral-link">
        <span class="referral-code">${link.slice(0,35)}...</span>
        <button class="copy-btn" onclick="copyReferral('${link}')">📋</button>
      </div>
      <button class="btn btn-small mt-20" onclick="shareReferral()">Поделиться ссылкой</button>
      <div class="card mt-20"><h3>Как это работает?</h3><p>Пригласи друга — вы оба получите 3 дня Премиума!</p></div>
    </div>`;
}

// ─── AI-функции ───────────────────────────────────────────────────────────────

async function getOracle() {
    if (!checkLimit()) return;
    const today = new Date().toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'});
    await doAiRequest('oracleBtn', 'oracleResult', 'oracleContent',
        { action: 'oracle', message: 'Расклад на ' + today });
}

async function calculateCompatibility() {
    const myDate = ($('myDate') || {}).value || '';
    const pd     = ($('partnerDate') || {}).value || '';
    if (!myDate || !pd)                    { showToast('Введите обе даты','warning'); return; }
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(myDate) || !/^\d{2}\.\d{2}\.\d{4}$/.test(pd))
                                           { showToast('Формат: ДД.ММ.ГГГГ','error'); return; }
    state.compatibility = { myDate, partnerDate: pd };
    if (!checkLimit()) return;
    await doAiRequest('compatBtn', 'compatResult', 'compatContent',
        { action: 'compatibility', my_date: myDate, partner_date: pd });
}

async function analyzeChat() {
    const txt = ($('chatText') || {}).value || '';
    if (txt.length < 10) { showToast('Минимум 10 символов','warning'); return; }
    if (!checkLimit()) return;
    await doAiRequest('chatBtn', 'chatResult', 'chatContent',
        { action: 'chat', message: txt });
}

async function generateFlirt() {
    const msg = (($('flirtMessage') || {}).value || '').trim();
    if (msg.length < 2) { showToast('Введите сообщение','warning'); return; }
    if (!checkLimit()) return;
    await doAiRequest('flirtBtn', 'flirtResult', 'flirtContent',
        { action: 'flirt', message: msg });
}

async function doAiRequest(btnId, resultId, contentId, payload) {
    setBtn(btnId, true);
    showThinking(resultId, contentId);
    try {
        const text = await askBot(payload);
        showResult(resultId, contentId, text);
        incrementUsage();
        showToast('Готово! 🔮','success');
    } catch(e) {
        showResult(resultId, contentId, '❌ Ошибка: ' + e.message + '\n\nПроверь подключение к серверу.');
        showToast('Ошибка запроса','error');
    } finally {
        setBtn(btnId, false);
    }
}

// ─── UI-утилиты ───────────────────────────────────────────────────────────────

function setBtn(id, loading) {
    const b = $(id); if (!b) return;
    if (loading) { b.disabled = true; b._orig = b.innerHTML; b.innerHTML = '⏳ Думаю...'; }
    else         { b.disabled = false; b.innerHTML = b._orig || b.innerHTML; }
}

function showThinking(resultId, contentId) {
    const c = $(resultId), d = $(contentId);
    if (c) c.classList.remove('hidden');
    if (d) d.innerHTML = '<div style="display:flex;align-items:center;gap:8px;color:var(--text-secondary)"><span>✨</span><span>Оракул думает...</span></div>';
}

function showResult(resultId, contentId, text) {
    const c = $(resultId), d = $(contentId);
    if (!c || !d) return;
    d.innerHTML = text.split('\n').filter(l => l.trim()).map(l => `<p style="margin-bottom:10px">${l}</p>`).join('');
    c.classList.remove('hidden');
    c.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function incrementUsage() {
    state.userData.today_usage++;
    state.userData.points++;
    localStorage.setItem('u_' + new Date().toDateString(), state.userData.today_usage);
    localStorage.setItem('pts', state.userData.points);
    updateUserInfo();
}

function checkLimit() {
    if (state.userData.is_premium) return true;
    if (state.userData.today_usage >= CONFIG.FREE_DAILY_LIMIT) {
        showModal(`<h2 class="card-title">🔒 Лимит исчерпан</h2>
            <p>Все ${CONFIG.FREE_DAILY_LIMIT} бесплатных запросов на сегодня использованы.</p>
            <p style="margin-top:10px;color:var(--text-secondary)">Лимит сбросится завтра или оформи Премиум.</p>
            <button class="btn mt-20" onclick="navigateTo('premium');closeModal()">⭐ Оформить Премиум</button>`);
        return false;
    }
    return true;
}

function showPremiumPlans() {
    const plans = [
        {name:'1 день',   stars:CONFIG.STARS_DAY,      days:1},
        {name:'30 дней',  stars:CONFIG.STARS_MONTH,    days:30},
        {name:'180 дней', stars:CONFIG.STARS_HALFYEAR, days:180}
    ];
    showModal('<h2 class="card-title text-center">Выбери тариф</h2>' +
        plans.map(p => `<div class="card premium-card" style="cursor:pointer;margin-bottom:12px" onclick="buyPremium(${p.days})">
            <h3>⭐ ${p.name}</h3><div class="premium-price">${p.stars} Stars</div>
            <button class="btn btn-small">Выбрать</button></div>`).join(''));
}

function buyPremium(days)    { tg.openTelegramLink(`https://t.me/${CONFIG.BOT_USERNAME}?start=premium_${days}`); closeModal(); showToast('Открываю оплату...','success'); }
function generateAdminLink() { tg.openTelegramLink(`https://t.me/${CONFIG.BOT_USERNAME}?start=adminref`); showToast('Создаю ссылку...','success'); }

function copyReferral(text) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
        .catch(() => { const t=document.createElement('textarea'); t.value=text; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); })
        .finally(() => showToast('Скопировано!','success'));
}

function shareReferral() {
    const t = `🔮 Присоединяйся к AI Dating Oracle!\nhttps://t.me/${CONFIG.BOT_USERNAME}?start=ref=${state.userData.ref_code}`;
    if (tg.shareToStory) tg.shareToStory(t); else { copyReferral(t); showToast('Ссылка скопирована!','success'); }
}

function showToast(msg, type='info') {
    toast.textContent = msg;
    toast.className = 'toast ' + type;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}
function showModal(html)  { modalBody.innerHTML = html; modal.classList.remove('hidden'); }
function closeModal()     { modal.classList.add('hidden'); }
function openSidebar()    { sidebar.classList.add('open'); sidebarOverlay.classList.add('active'); }
function closeSidebar()   { sidebar.classList.remove('open'); sidebarOverlay.classList.remove('active'); }

// ─── События ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    initApp();
    $('menuBtn').addEventListener('click', openSidebar);
    $('closeSidebarBtn').addEventListener('click', closeSidebar);
    sidebarOverlay.addEventListener('click', closeSidebar);
    $('profileBtn').addEventListener('click', () => navigateTo('profile'));
    document.querySelectorAll('.nav-item,.bottom-nav-item').forEach(el => {
        el.addEventListener('click', e => { const p = e.currentTarget.dataset.page; if (p) navigateTo(p); });
    });
    $('modalClose').addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
});

tg.onEvent('mainButtonClicked', () => tg.close());

window.navigateTo             = navigateTo;
window.getOracle              = getOracle;
window.calculateCompatibility = calculateCompatibility;
window.analyzeChat            = analyzeChat;
window.generateFlirt          = generateFlirt;
window.showPremiumPlans       = showPremiumPlans;
window.buyPremium             = buyPremium;
window.generateAdminLink      = generateAdminLink;
window.copyReferral           = copyReferral;
window.shareReferral          = shareReferral;
window.closeModal             = closeModal;
