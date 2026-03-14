// Инициализация Telegram Web App
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const CONFIG = {
    BOT_USERNAME: 'AuroraWhisperBot',
    FREE_DAILY_LIMIT: 5,
    STARS_DAY: 80,
    STARS_MONTH: 250,
    STARS_HALFYEAR: 1500
};

const state = {
    user: null,
    currentPage: 'home',
    compatibility: { myDate: '', partnerDate: '' },
    pendingAction: null
};

const splashScreen   = document.getElementById('splash-screen');
const mainApp        = document.getElementById('main-app');
const sidebar        = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const content        = document.getElementById('content');
const modal          = document.getElementById('modal');
const modalBody      = document.getElementById('modalBody');
const toast          = document.getElementById('toast');
const userName       = document.getElementById('userName');
const userStatus     = document.getElementById('userStatus');

// ─────────────────────────────────────────────────────────────────────────────
// СВЯЗЬ С БОТОМ через tg.sendData / answerWebAppQuery
// ─────────────────────────────────────────────────────────────────────────────

function sendToBotAndWait(payload, btnId, resultId, contentId) {
    state.pendingAction = { btnId, resultId, contentId };
    setButtonLoading(btnId, true);
    showTypingAnimation(contentId, resultId);
    tg.sendData(JSON.stringify(payload));
}

// Бот вернул ответ через answerWebAppQuery
tg.onEvent('web_app_data', (eventData) => {
    const pending = state.pendingAction;
    if (!pending) return;
    const text = (eventData && eventData.data) ? eventData.data : 'Ошибка получения ответа';
    showResultCard(pending.resultId, pending.contentId, text);
    setButtonLoading(pending.btnId, false);
    incrementUsage();
    showToast('Готово! 🔮', 'success');
    state.pendingAction = null;
});

// ─────────────────────────────────────────────────────────────────────────────
// Инициализация
// ─────────────────────────────────────────────────────────────────────────────

function initApp() {
    const initData = tg.initDataUnsafe;
    state.user = (initData && initData.user) ? initData.user : {
        id: 0, first_name: 'Гость', username: 'guest'
    };
    loadUserData();
    updateUserInfo();
    setTimeout(() => {
        splashScreen.classList.add('hidden');
        mainApp.classList.remove('hidden');
        loadPage('home');
    }, 1500);
}

function loadUserData() {
    const key = 'today_usage_' + new Date().toDateString();
    state.userData = {
        is_premium:    false,
        premium_until: null,
        points:        parseInt(localStorage.getItem('points') || '0'),
        ref_code:      localStorage.getItem('ref_code') || ('REF' + Math.random().toString(36).substring(7).toUpperCase()),
        today_usage:   parseInt(localStorage.getItem(key) || '0')
    };
    localStorage.setItem('ref_code', state.userData.ref_code);
}

function updateUserInfo() {
    userName.textContent  = state.user.first_name;
    userStatus.textContent = state.userData.is_premium ? '⭐ Премиум' : '🆓 Бесплатный';
}

// ─────────────────────────────────────────────────────────────────────────────
// Навигация
// ─────────────────────────────────────────────────────────────────────────────

function navigateTo(page) {
    state.currentPage = page;
    loadPage(page);
    document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });
    closeSidebar();
}

function loadPage(page) {
    const pages = {
        home: renderHomePage, oracle: renderOraclePage,
        compatibility: renderCompatibilityPage, chat: renderChatPage,
        flirt: renderFlirtPage, premium: renderPremiumPage,
        profile: renderProfilePage, referral: renderReferralPage
    };
    content.innerHTML = pages[page] ? pages[page]() : '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Страницы
// ─────────────────────────────────────────────────────────────────────────────

function renderHomePage() {
    const today = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
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
        ${!state.userData.is_premium ? `<div class="card premium-card"><h3 class="card-title">⭐ Премиум</h3><p>Безлимитные запросы и эксклюзивные функции</p><button class="btn btn-small mt-20" onclick="navigateTo('premium')">Подробнее</button></div>` : ''}
        <div class="card"><h3 class="card-title">🔮 Сегодняшний совет</h3><p>Доверяй своей интуиции, но не забывай проверять факты. Звёзды благосклонны к смелым!</p></div>
    `;
}

function renderOraclePage() {
    return `
        <div class="card">
            <h2 class="card-title">🌙 Оракул дня</h2>
            <p class="card-subtitle">Узнай, что звёзды приготовили для тебя сегодня</p>
            <button class="btn btn-icon" id="oracleBtn" onclick="getOracle()"><span>🔮 Получить расклад</span></button>
        </div>
        <div id="oracleResult" class="card hidden"><div id="oracleContent"></div></div>
    `;
}

function renderCompatibilityPage() {
    return `
        <div class="card">
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
        <div id="compatResult" class="card hidden"><div id="compatContent"></div></div>
    `;
}

function renderChatPage() {
    return `
        <div class="card">
            <h2 class="card-title">💬 Разбор переписки</h2>
            <p class="card-subtitle">Вставь текст переписки для анализа</p>
            <div class="input-group"><textarea class="input-field textarea" id="chatText" placeholder="Вставь сюда переписку..."></textarea></div>
            <button class="btn" id="chatBtn" onclick="analyzeChat()">Проанализировать</button>
        </div>
        <div id="chatResult" class="card hidden"><div id="chatContent"></div></div>
    `;
}

function renderFlirtPage() {
    return `
        <div class="card">
            <h2 class="card-title">✨ Флирт-генератор</h2>
            <p class="card-subtitle">Напиши, что тебе написал парень, и получи варианты ответов</p>
            <div class="input-group"><textarea class="input-field textarea" id="flirtMessage" placeholder="Сообщение от парня..."></textarea></div>
            <button class="btn" id="flirtBtn" onclick="generateFlirt()">Сгенерировать ответы</button>
        </div>
        <div id="flirtResult" class="card hidden"><div id="flirtContent"></div></div>
    `;
}

function renderPremiumPage() {
    return `
        <div class="card">
            <h2 class="card-title">⭐ Премиум подписка</h2>
            <p class="card-subtitle">Получи безлимитный доступ ко всем функциям</p>
            <div class="premium-price">от ${CONFIG.STARS_DAY} ⭐<span class="price-period">/день</span></div>
            <div class="feature-grid">
                <div class="feature-item"><span class="feature-icon">✨</span><span class="feature-title">Безлимит</span></div>
                <div class="feature-item"><span class="feature-icon">🔮</span><span class="feature-title">Эксклюзив</span></div>
                <div class="feature-item"><span class="feature-icon">💫</span><span class="feature-title">Приоритет</span></div>
                <div class="feature-item"><span class="feature-icon">🎁</span><span class="feature-title">Бонусы</span></div>
            </div>
            <button class="btn" onclick="showPremiumPlans()">Выбрать тариф</button>
        </div>
    `;
}

function renderProfilePage() {
    return `
        <div class="card">
            <h2 class="card-title">👤 Профиль</h2>
            <div class="stats-container">
                <div class="stat-item"><span class="stat-value">${state.userData.points}</span><span class="stat-label">Очков</span></div>
                <div class="stat-item"><span class="stat-value">${state.userData.today_usage}</span><span class="stat-label">Использовано</span></div>
            </div>
            <div style="margin:10px 0;padding:10px 0;border-bottom:1px solid var(--border-color)"><strong>Имя:</strong> ${state.user.first_name}</div>
            <div style="margin:10px 0;padding:10px 0;border-bottom:1px solid var(--border-color)"><strong>Username:</strong> @${state.user.username || 'не указан'}</div>
            <div style="margin:10px 0;padding:10px 0;border-bottom:1px solid var(--border-color)"><strong>ID:</strong> ${state.user.id}</div>
            <div style="margin:10px 0;padding:10px 0"><strong>Премиум:</strong> ${state.userData.is_premium ? '⭐ Да' : '🆓 Нет'}</div>
            ${state.user.id === 5914838626 ? '<button class="btn btn-outline mt-20" onclick="generateAdminLink()">👑 Создать ссылку на 14 дней</button>' : ''}
        </div>
    `;
}

function renderReferralPage() {
    const botLink = `https://t.me/${CONFIG.BOT_USERNAME}?start=ref=${state.userData.ref_code}`;
    return `
        <div class="card">
            <h2 class="card-title">🔗 Реферальная программа</h2>
            <p class="card-subtitle">Приглашай друзей и получай бонусы</p>
            <div class="referral-link">
                <span class="referral-code">${state.userData.ref_code}</span>
                <button class="copy-btn" onclick="copyReferral('${state.userData.ref_code}')">📋</button>
            </div>
            <p class="text-center">Отправь другу эту ссылку:</p>
            <div class="referral-link">
                <span class="referral-code">${botLink.substring(0,30)}...</span>
                <button class="copy-btn" onclick="copyReferral('${botLink}')">📋</button>
            </div>
            <button class="btn btn-small mt-20" onclick="shareReferral()">Поделиться ссылкой</button>
            <div class="card mt-20"><h3>Как это работает?</h3><p>Пригласи друга — вы оба получите 3 дня Премиума!</p></div>
        </div>
    `;
}

// ─────────────────────────────────────────────────────────────────────────────
// AI функции
// ─────────────────────────────────────────────────────────────────────────────

function getOracle() {
    if (!checkLimit()) return;
    const today = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
    sendToBotAndWait(
        { action: 'oracle', message: 'Расклад на ' + today + ' для ' + state.user.first_name },
        'oracleBtn', 'oracleResult', 'oracleContent'
    );
}

function calculateCompatibility() {
    const myDate      = document.getElementById('myDate') ? document.getElementById('myDate').value : '';
    const partnerDate = document.getElementById('partnerDate') ? document.getElementById('partnerDate').value : '';
    if (!myDate || !partnerDate)                          { showToast('Введите обе даты', 'warning'); return; }
    if (!validateDate(myDate) || !validateDate(partnerDate)) { showToast('Формат: ДД.ММ.ГГГГ', 'error'); return; }
    state.compatibility.myDate      = myDate;
    state.compatibility.partnerDate = partnerDate;
    if (!checkLimit()) return;
    sendToBotAndWait(
        { action: 'compatibility', my_date: myDate, partner_date: partnerDate },
        'compatBtn', 'compatResult', 'compatContent'
    );
}

function analyzeChat() {
    const el = document.getElementById('chatText');
    const chatText = el ? el.value : '';
    if (!chatText || chatText.length < 10) { showToast('Минимум 10 символов', 'warning'); return; }
    if (!checkLimit()) return;
    sendToBotAndWait(
        { action: 'chat', message: chatText },
        'chatBtn', 'chatResult', 'chatContent'
    );
}

function generateFlirt() {
    const el = document.getElementById('flirtMessage');
    const message = el ? el.value.trim() : '';
    if (!message || message.length < 2) { showToast('Введите сообщение', 'warning'); return; }
    if (!checkLimit()) return;
    sendToBotAndWait(
        { action: 'flirt', message: message },
        'flirtBtn', 'flirtResult', 'flirtContent'
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// UI утилиты
// ─────────────────────────────────────────────────────────────────────────────

function setButtonLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (loading) {
        btn.disabled = true;
        btn.dataset.originalText = btn.innerHTML;
        btn.innerHTML = '⏳ Думаю...';
    } else {
        btn.disabled = false;
        btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
    }
}

function showTypingAnimation(contentId, resultId) {
    const card = document.getElementById(resultId);
    const el   = document.getElementById(contentId);
    if (card) card.classList.remove('hidden');
    if (el) el.innerHTML = '<div style="display:flex;align-items:center;gap:8px;color:var(--text-secondary);"><span>✨</span><span>Оракул думает...</span></div>';
}

function showResultCard(resultId, contentId, text) {
    const card = document.getElementById(resultId);
    const el   = document.getElementById(contentId);
    if (!card || !el) return;
    el.innerHTML = text.split('\n').filter(function(l){ return l.trim(); }).map(function(l){ return '<p style="margin-bottom:10px;">' + l + '</p>'; }).join('');
    card.classList.remove('hidden');
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function incrementUsage() {
    state.userData.today_usage = (state.userData.today_usage || 0) + 1;
    state.userData.points      = (state.userData.points || 0) + 1;
    localStorage.setItem('today_usage_' + new Date().toDateString(), state.userData.today_usage);
    localStorage.setItem('points', state.userData.points);
    updateUserInfo();
}

function checkLimit() {
    if (state.userData.is_premium) return true;
    if (state.userData.today_usage >= CONFIG.FREE_DAILY_LIMIT) {
        showModal('<h2 class="card-title">🔒 Лимит исчерпан</h2><p>Ты использовала все ' + CONFIG.FREE_DAILY_LIMIT + ' бесплатных запросов на сегодня.</p><button class="btn mt-20" onclick="navigateTo(\'premium\');closeModal();">⭐ Оформить Премиум</button>');
        return false;
    }
    return true;
}

function validateDate(d) { return /^\d{2}\.\d{2}\.\d{4}$/.test(d); }

function showPremiumPlans() {
    const plans = [
        { name: '1 день',   stars: CONFIG.STARS_DAY,      days: 1 },
        { name: '30 дней',  stars: CONFIG.STARS_MONTH,    days: 30 },
        { name: '180 дней', stars: CONFIG.STARS_HALFYEAR, days: 180 }
    ];
    showModal('<h2 class="card-title text-center">Выбери тариф</h2>' + plans.map(function(p){
        return '<div class="card premium-card" style="cursor:pointer;margin-bottom:12px;" onclick="buyPremium(' + p.days + ')"><h3>⭐ ' + p.name + '</h3><div class="premium-price">' + p.stars + ' Stars</div><button class="btn btn-small">Выбрать</button></div>';
    }).join(''));
}

function buyPremium(days) {
    tg.openTelegramLink('https://t.me/' + CONFIG.BOT_USERNAME + '?start=premium_' + days);
    closeModal();
    showToast('Открываю оплату в боте...', 'success');
}

function generateAdminLink() {
    tg.openTelegramLink('https://t.me/' + CONFIG.BOT_USERNAME + '?start=adminref');
    showToast('Создаю ссылку...', 'success');
}

function copyReferral(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function(){ showToast('Скопировано!', 'success'); });
    } else {
        var ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('Скопировано!', 'success');
    }
}

function shareReferral() {
    var text = '🔮 Присоединяйся к AI Dating Oracle! https://t.me/' + CONFIG.BOT_USERNAME + '?start=ref=' + state.userData.ref_code;
    if (tg.shareToStory) tg.shareToStory(text);
    else { copyReferral(text); showToast('Ссылка скопирована!', 'success'); }
}

function showToast(message, type) {
    type = type || 'info';
    toast.textContent = message;
    toast.className   = 'toast ' + type;
    toast.classList.remove('hidden');
    setTimeout(function(){ toast.classList.add('hidden'); }, 3000);
}

function showModal(html)  { modalBody.innerHTML = html; modal.classList.remove('hidden'); }
function closeModal()     { modal.classList.add('hidden'); }
function openSidebar()    { sidebar.classList.add('open'); sidebarOverlay.classList.add('active'); }
function closeSidebar()   { sidebar.classList.remove('open'); sidebarOverlay.classList.remove('active'); }

document.addEventListener('DOMContentLoaded', function() {
    initApp();
    document.getElementById('menuBtn').addEventListener('click', openSidebar);
    document.getElementById('closeSidebarBtn').addEventListener('click', closeSidebar);
    sidebarOverlay.addEventListener('click', closeSidebar);
    document.getElementById('profileBtn').addEventListener('click', function(){ navigateTo('profile'); });
    document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(function(item) {
        item.addEventListener('click', function(e) {
            var page = e.currentTarget.dataset.page;
            if (page) navigateTo(page);
        });
    });
    document.getElementById('modalClose').addEventListener('click', closeModal);
    modal.addEventListener('click', function(e){ if (e.target === modal) closeModal(); });
});

tg.onEvent('mainButtonClicked', function(){ tg.close(); });

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
