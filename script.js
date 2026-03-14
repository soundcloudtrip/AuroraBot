// Инициализация Telegram Web App
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Конфигурация
const CONFIG = {
    BOT_USERNAME: 'AuroraWhisperBot',
    FREE_DAILY_LIMIT: 5,
    STARS_DAY: 80,
    STARS_MONTH: 250,
    STARS_HALFYEAR: 1500
};

// Состояние приложения
const state = {
    user: null,
    currentPage: 'home',
    sidebarOpen: false,
    loading: false,
    compatibility: {
        myDate: '',
        partnerDate: ''
    }
};

// DOM элементы
const splashScreen = document.getElementById('splash-screen');
const mainApp = document.getElementById('main-app');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const content = document.getElementById('content');
const modal = document.getElementById('modal');
const modalBody = document.getElementById('modalBody');
const toast = document.getElementById('toast');
const userName = document.getElementById('userName');
const userStatus = document.getElementById('userStatus');

// ─────────────────────────────────────────────────────────────────────────────
// AI API — вызов Anthropic прямо из мини-апп
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// AI API — запросы идут через прокси в bot.py (порт 8000)
// Замени YOUR_SERVER_IP на IP или домен своего сервера где запущен bot.py
// ─────────────────────────────────────────────────────────────────────────────

const API_URL = 'http://YOUR_SERVER_IP:8000/api/ai'; // ← ЗАМЕНИТЬ

async function callAI(action, userMessage) {
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action:      action,
            message:     userMessage,
            first_name:  state.user?.first_name || 'Гость'
        })
    });

    if (!response.ok) {
        throw new Error('Ошибка сервера: ' + response.status);
    }

    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data.result;
}


// ─────────────────────────────────────────────────────────────────────────────
// Инициализация
// ─────────────────────────────────────────────────────────────────────────────

async function initApp() {
    try {
        const initData = tg.initDataUnsafe;
        state.user = initData.user || {
            id: Math.floor(Math.random() * 1000000),
            first_name: 'Гость',
            username: 'guest'
        };

        await loadUserData();
        updateUserInfo();

        setTimeout(() => {
            splashScreen.classList.add('hidden');
            mainApp.classList.remove('hidden');
            loadPage('home');
        }, 2000);

    } catch (error) {
        console.error('Init error:', error);
        showToast('Ошибка инициализации', 'error');
    }
}

async function loadUserData() {
    state.userData = {
        is_premium: false,
        premium_until: null,
        points: 0,
        ref_code: 'REF' + Math.random().toString(36).substring(7).toUpperCase(),
        today_usage: parseInt(localStorage.getItem('today_usage_' + new Date().toDateString()) || '0')
    };
}

function updateUserInfo() {
    userName.textContent = state.user.first_name;
    userStatus.textContent = state.userData?.is_premium ? '⭐ Премиум' : '🆓 Бесплатный';
}

// ─────────────────────────────────────────────────────────────────────────────
// Навигация
// ─────────────────────────────────────────────────────────────────────────────

function navigateTo(page) {
    state.currentPage = page;
    loadPage(page);

    document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === page) item.classList.add('active');
    });

    closeSidebar();
}

async function loadPage(page) {
    try {
        let html = '';
        switch (page) {
            case 'home':          html = renderHomePage(); break;
            case 'oracle':        html = renderOraclePage(); break;
            case 'compatibility': html = renderCompatibilityPage(); break;
            case 'chat':          html = renderChatPage(); break;
            case 'flirt':         html = renderFlirtPage(); break;
            case 'premium':       html = renderPremiumPage(); break;
            case 'profile':       html = renderProfilePage(); break;
            case 'referral':      html = renderReferralPage(); break;
        }
        content.innerHTML = html;
    } catch (error) {
        console.error('Page load error:', error);
        showToast('Ошибка загрузки страницы', 'error');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Рендеринг страниц
// ─────────────────────────────────────────────────────────────────────────────

function renderHomePage() {
    const today = new Date().toLocaleDateString('ru-RU', {
        weekday: 'long', day: 'numeric', month: 'long'
    });
    const used = state.userData?.today_usage || 0;
    const remaining = Math.max(0, CONFIG.FREE_DAILY_LIMIT - used);

    return `
        <div class="card fade-in">
            <h2 class="card-title">Привет, ${state.user.first_name}! 👋</h2>
            <p class="card-subtitle">${today}</p>

            <div class="stats-container">
                <div class="stat-item">
                    <span class="stat-value">${used}/${CONFIG.FREE_DAILY_LIMIT}</span>
                    <span class="stat-label">Запросов сегодня</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${state.userData?.points || 0}</span>
                    <span class="stat-label">Очков</span>
                </div>
            </div>

            <div class="progress-bar">
                <div class="progress-fill" style="width: ${(used / CONFIG.FREE_DAILY_LIMIT) * 100}%"></div>
            </div>
            <p class="text-center">Осталось ${remaining} бесплатных запросов</p>
        </div>

        <div class="feature-grid">
            <div class="feature-item" onclick="navigateTo('oracle')">
                <span class="feature-icon">🌙</span>
                <span class="feature-title">Оракул дня</span>
            </div>
            <div class="feature-item" onclick="navigateTo('compatibility')">
                <span class="feature-icon">💑</span>
                <span class="feature-title">Совместимость</span>
            </div>
            <div class="feature-item" onclick="navigateTo('chat')">
                <span class="feature-icon">💬</span>
                <span class="feature-title">Разбор чата</span>
            </div>
            <div class="feature-item" onclick="navigateTo('flirt')">
                <span class="feature-icon">✨</span>
                <span class="feature-title">Флирт</span>
            </div>
        </div>

        ${!state.userData?.is_premium ? `
            <div class="card premium-card">
                <h3 class="card-title">⭐ Премиум</h3>
                <p>Безлимитные запросы и эксклюзивные функции</p>
                <button class="btn btn-small mt-20" onclick="navigateTo('premium')">Подробнее</button>
            </div>
        ` : ''}

        <div class="card">
            <h3 class="card-title">🔮 Сегодняшний совет</h3>
            <p>Доверяй своей интуиции, но не забывай проверять факты. Звёзды благосклонны к смелым!</p>
        </div>
    `;
}

function renderOraclePage() {
    return `
        <div class="card">
            <h2 class="card-title">🌙 Оракул дня</h2>
            <p class="card-subtitle">Узнай, что звёзды приготовили для тебя сегодня</p>
            <button class="btn btn-icon" id="oracleBtn" onclick="getOracle()">
                <span>🔮 Получить расклад</span>
            </button>
        </div>

        <div id="oracleResult" class="card hidden">
            <div id="oracleContent"></div>
        </div>
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

            <button class="btn" id="compatBtn" onclick="calculateCompatibility()">
                Рассчитать совместимость
            </button>
        </div>

        <div id="compatResult" class="card hidden">
            <div id="compatContent"></div>
        </div>
    `;
}

function renderChatPage() {
    return `
        <div class="card">
            <h2 class="card-title">💬 Разбор переписки</h2>
            <p class="card-subtitle">Вставь текст переписки для анализа</p>

            <div class="input-group">
                <textarea class="input-field textarea" id="chatText" placeholder="Вставь сюда переписку..."></textarea>
            </div>

            <button class="btn" id="chatBtn" onclick="analyzeChat()">
                Проанализировать
            </button>
        </div>

        <div id="chatResult" class="card hidden">
            <div id="chatContent"></div>
        </div>
    `;
}

function renderFlirtPage() {
    return `
        <div class="card">
            <h2 class="card-title">✨ Флирт-генератор</h2>
            <p class="card-subtitle">Напиши, что тебе написал парень, и получи варианты ответов</p>

            <div class="input-group">
                <textarea class="input-field textarea" id="flirtMessage" placeholder="Сообщение от парня..."></textarea>
            </div>

            <button class="btn" id="flirtBtn" onclick="generateFlirt()">
                Сгенерировать ответы
            </button>
        </div>

        <div id="flirtResult" class="card hidden">
            <div id="flirtContent"></div>
        </div>
    `;
}

function renderPremiumPage() {
    return `
        <div class="card">
            <h2 class="card-title">⭐ Премиум подписка</h2>
            <p class="card-subtitle">Получи безлимитный доступ ко всем функциям</p>

            <div class="premium-price">
                от ${CONFIG.STARS_DAY} ⭐
                <span class="price-period">/день</span>
            </div>

            <div class="feature-grid">
                <div class="feature-item">
                    <span class="feature-icon">✨</span>
                    <span class="feature-title">Безлимитные запросы</span>
                </div>
                <div class="feature-item">
                    <span class="feature-icon">🔮</span>
                    <span class="feature-title">Эксклюзивные расклады</span>
                </div>
                <div class="feature-item">
                    <span class="feature-icon">💫</span>
                    <span class="feature-title">Приоритет</span>
                </div>
                <div class="feature-item">
                    <span class="feature-icon">🎁</span>
                    <span class="feature-title">Бонусные очки</span>
                </div>
            </div>

            <button class="btn" onclick="showPremiumPlans()">
                Выбрать тариф
            </button>
        </div>
    `;
}

function renderProfilePage() {
    return `
        <div class="card">
            <h2 class="card-title">👤 Профиль</h2>

            <div class="stats-container">
                <div class="stat-item">
                    <span class="stat-value">${state.userData?.points || 0}</span>
                    <span class="stat-label">Очков</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${state.userData?.today_usage || 0}</span>
                    <span class="stat-label">Использовано</span>
                </div>
            </div>

            <div class="info-item" style="margin: 10px 0; padding: 10px 0; border-bottom: 1px solid var(--border-color);">
                <strong>Имя:</strong> ${state.user.first_name}
            </div>
            <div class="info-item" style="margin: 10px 0; padding: 10px 0; border-bottom: 1px solid var(--border-color);">
                <strong>Username:</strong> @${state.user.username || 'не указан'}
            </div>
            <div class="info-item" style="margin: 10px 0; padding: 10px 0; border-bottom: 1px solid var(--border-color);">
                <strong>ID:</strong> ${state.user.id}
            </div>
            <div class="info-item" style="margin: 10px 0; padding: 10px 0;">
                <strong>Премиум:</strong> ${state.userData?.is_premium ? '⭐ Да' : '🆓 Нет'}
                ${state.userData?.premium_until ? `<br>до ${state.userData.premium_until}` : ''}
            </div>

            ${state.user.id === 5914838626 ? `
                <button class="btn btn-outline mt-20" onclick="generateAdminLink()">
                    👑 Создать ссылку на 14 дней
                </button>
            ` : ''}
        </div>
    `;
}

function renderReferralPage() {
    const botLink = `https://t.me/${CONFIG.BOT_USERNAME}?start=ref=${state.userData?.ref_code}`;

    return `
        <div class="card">
            <h2 class="card-title">🔗 Реферальная программа</h2>
            <p class="card-subtitle">Приглашай друзей и получай бонусы</p>

            <div class="referral-link">
                <span class="referral-code">${state.userData?.ref_code}</span>
                <button class="copy-btn" onclick="copyReferral('${state.userData?.ref_code}')">📋</button>
            </div>

            <p class="text-center">Отправь другу эту ссылку:</p>

            <div class="referral-link">
                <span class="referral-code">${botLink.substring(0, 30)}...</span>
                <button class="copy-btn" onclick="copyReferral('${botLink}')">📋</button>
            </div>

            <button class="btn btn-small mt-20" onclick="shareReferral()">
                Поделиться ссылкой
            </button>

            <div class="card mt-20">
                <h3>Как это работает?</h3>
                <p>Пригласи друга — вы оба получите 3 дня Премиума!</p>
                <p style="margin-top: 10px;">А если друг пришёл по ссылке админа — ты получишь 14 дней Премиума</p>
            </div>
        </div>
    `;
}

// ─────────────────────────────────────────────────────────────────────────────
// Вспомогательные UI-функции для отображения результатов
// ─────────────────────────────────────────────────────────────────────────────

function setButtonLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (loading) {
        btn.disabled = true;
        btn.dataset.originalText = btn.innerHTML;
        btn.innerHTML = '<span class="btn-spinner">⏳ Думаю...</span>';
    } else {
        btn.disabled = false;
        btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
    }
}

function showResultCard(resultId, contentId, text) {
    const resultCard = document.getElementById(resultId);
    const contentDiv = document.getElementById(contentId);
    if (!resultCard || !contentDiv) return;
    // Форматируем текст: переносы строк → абзацы
    const formatted = text
        .split('\n')
        .filter(line => line.trim())
        .map(line => `<p style="margin-bottom: 10px;">${line}</p>`)
        .join('');
    contentDiv.innerHTML = formatted;
    resultCard.classList.remove('hidden');
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showTypingAnimation(contentId) {
    const el = document.getElementById(contentId);
    if (el) {
        el.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px; color:var(--text-secondary);">
                <span style="animation: pulse 1s infinite;">✨</span>
                <span>Оракул думает...</span>
            </div>`;
        const parent = el.closest('.card');
        if (parent) parent.classList.remove('hidden');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Основные функции с вызовом AI
// ─────────────────────────────────────────────────────────────────────────────

async function getOracle() {
    if (!await checkLimit()) return;

    setButtonLoading('oracleBtn', true);
    showTypingAnimation('oracleContent');

    try {
        const today = new Date().toLocaleDateString('ru-RU', {
            weekday: 'long', day: 'numeric', month: 'long'
        });
        const result = await callAI(
            'oracle',
            `Дай расклад на сегодня — ${today}. Имя пользователя: ${state.user.first_name}.`
        );
        showResultCard('oracleResult', 'oracleContent', result);
        incrementUsage();
        showToast('Расклад готов! 🔮', 'success');
    } catch (error) {
        console.error(error);
        showToast('Ошибка при обращении к оракулу', 'error');
        const el = document.getElementById('oracleResult');
        if (el) el.classList.add('hidden');
    } finally {
        setButtonLoading('oracleBtn', false);
    }
}

async function calculateCompatibility() {
    const myDate = document.getElementById('myDate')?.value;
    const partnerDate = document.getElementById('partnerDate')?.value;

    if (!myDate || !partnerDate) {
        showToast('Введите обе даты', 'warning');
        return;
    }
    if (!validateDate(myDate) || !validateDate(partnerDate)) {
        showToast('Неверный формат даты. Используйте ДД.ММ.ГГГГ', 'error');
        return;
    }

    state.compatibility.myDate = myDate;
    state.compatibility.partnerDate = partnerDate;

    if (!await checkLimit()) return;

    setButtonLoading('compatBtn', true);
    showTypingAnimation('compatContent');

    try {
        const result = await callAI(
            'compatibility',
            `Рассчитай совместимость. Моя дата рождения: ${myDate}. Дата рождения партнёра: ${partnerDate}. Имя: ${state.user.first_name}.`
        );
        showResultCard('compatResult', 'compatContent', result);
        incrementUsage();
        showToast('Совместимость рассчитана! 💑', 'success');
    } catch (error) {
        console.error(error);
        showToast('Ошибка расчёта совместимости', 'error');
        const el = document.getElementById('compatResult');
        if (el) el.classList.add('hidden');
    } finally {
        setButtonLoading('compatBtn', false);
    }
}

async function analyzeChat() {
    const chatText = document.getElementById('chatText')?.value;

    if (!chatText || chatText.length < 10) {
        showToast('Введите текст переписки (минимум 10 символов)', 'warning');
        return;
    }

    if (!await checkLimit()) return;

    setButtonLoading('chatBtn', true);
    showTypingAnimation('chatContent');

    try {
        const result = await callAI(
            'chat',
            `Проанализируй эту переписку:\n\n${chatText}`
        );
        showResultCard('chatResult', 'chatContent', result);
        incrementUsage();
        showToast('Анализ готов! 💬', 'success');
    } catch (error) {
        console.error(error);
        showToast('Ошибка анализа переписки', 'error');
        const el = document.getElementById('chatResult');
        if (el) el.classList.add('hidden');
    } finally {
        setButtonLoading('chatBtn', false);
    }
}

async function generateFlirt() {
    const message = document.getElementById('flirtMessage')?.value;

    if (!message || message.trim().length < 2) {
        showToast('Введите сообщение', 'warning');
        return;
    }

    if (!await checkLimit()) return;

    setButtonLoading('flirtBtn', true);
    showTypingAnimation('flirtContent');

    try {
        const result = await callAI(
            'flirt',
            `Придумай ответы на это сообщение от парня: "${message}"`
        );
        showResultCard('flirtResult', 'flirtContent', result);
        incrementUsage();
        showToast('Ответы готовы! ✨', 'success');
    } catch (error) {
        console.error(error);
        showToast('Ошибка генерации флирта', 'error');
        const el = document.getElementById('flirtResult');
        if (el) el.classList.add('hidden');
    } finally {
        setButtonLoading('flirtBtn', false);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Счётчик использования (localStorage)
// ─────────────────────────────────────────────────────────────────────────────

function incrementUsage() {
    state.userData.today_usage = (state.userData.today_usage || 0) + 1;
    state.userData.points = (state.userData.points || 0) + 1;
    localStorage.setItem('today_usage_' + new Date().toDateString(), state.userData.today_usage);
    // Обновляем статус в хедере
    updateUserInfo();
}

// ─────────────────────────────────────────────────────────────────────────────
// Премиум
// ─────────────────────────────────────────────────────────────────────────────

function showPremiumPlans() {
    const plans = [
        { name: '1 день', stars: CONFIG.STARS_DAY, days: 1 },
        { name: '30 дней', stars: CONFIG.STARS_MONTH, days: 30 },
        { name: '180 дней', stars: CONFIG.STARS_HALFYEAR, days: 180 }
    ];

    const modalHtml = `
        <h2 class="card-title text-center">Выбери тариф</h2>
        ${plans.map(plan => `
            <div class="card premium-card" style="cursor:pointer; margin-bottom:12px;" onclick="buyPremium('${plan.days}')">
                <h3>⭐ ${plan.name}</h3>
                <div class="premium-price">${plan.stars} Stars</div>
                <button class="btn btn-small">Выбрать</button>
            </div>
        `).join('')}
    `;
    showModal(modalHtml);
}

function buyPremium(days) {
    tg.openTelegramLink(`https://t.me/${CONFIG.BOT_USERNAME}?start=premium_${days}`);
    closeModal();
    showToast('Открываю оплату в боте...', 'success');
}

function generateAdminLink() {
    tg.openTelegramLink(`https://t.me/${CONFIG.BOT_USERNAME}?start=adminref`);
    showToast('Создаю ссылку...', 'success');
}

function copyReferral(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Скопировано!', 'success');
    }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('Скопировано!', 'success');
    });
}

function shareReferral() {
    const text = `🔮 Присоединяйся к AI Dating Oracle! Получи 3 дня Премиума по моей ссылке: https://t.me/${CONFIG.BOT_USERNAME}?start=ref=${state.userData?.ref_code}`;
    if (tg.shareToStory) {
        tg.shareToStory(text);
    } else {
        copyReferral(text);
        showToast('Ссылка скопирована!', 'success');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Лимиты
// ─────────────────────────────────────────────────────────────────────────────

async function checkLimit() {
    if (state.userData?.is_premium) return true;

    if ((state.userData?.today_usage || 0) >= CONFIG.FREE_DAILY_LIMIT) {
        showModal(`
            <h2 class="card-title">🔒 Лимит исчерпан</h2>
            <p>Ты использовал все ${CONFIG.FREE_DAILY_LIMIT} бесплатных запросов на сегодня.</p>
            <p style="margin-top:10px; color:var(--text-secondary);">Лимит сбросится завтра или оформи Премиум для безлимитного доступа.</p>
            <button class="btn mt-20" onclick="navigateTo('premium'); closeModal();">
                ⭐ Оформить Премиум
            </button>
        `);
        return false;
    }

    return true;
}

function validateDate(date) {
    return /^\d{2}\.\d{2}\.\d{4}$/.test(date);
}

// ─────────────────────────────────────────────────────────────────────────────
// UI-утилиты
// ─────────────────────────────────────────────────────────────────────────────

function showToast(message, type = 'info') {
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

function showModal(html) {
    modalBody.innerHTML = html;
    modal.classList.remove('hidden');
}

function closeModal() {
    modal.classList.add('hidden');
}

function openSidebar() {
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('active');
}

function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('active');
}

// ─────────────────────────────────────────────────────────────────────────────
// Обработчики событий
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    initApp();

    document.getElementById('menuBtn').addEventListener('click', openSidebar);
    document.getElementById('closeSidebarBtn').addEventListener('click', closeSidebar);
    sidebarOverlay.addEventListener('click', closeSidebar);

    document.getElementById('profileBtn').addEventListener('click', () => navigateTo('profile'));

    document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const page = e.currentTarget.dataset.page;
            if (page) navigateTo(page);
        });
    });

    document.getElementById('modalClose').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
});

tg.onEvent('mainButtonClicked', () => tg.close());

// Экспорт для глобального доступа (вызовы из onclick в HTML)
window.navigateTo = navigateTo;
window.getOracle = getOracle;
window.calculateCompatibility = calculateCompatibility;
window.analyzeChat = analyzeChat;
window.generateFlirt = generateFlirt;
window.showPremiumPlans = showPremiumPlans;
window.buyPremium = buyPremium;
window.generateAdminLink = generateAdminLink;
window.copyReferral = copyReferral;
window.shareReferral = shareReferral;
window.closeModal = closeModal;
