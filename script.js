// Инициализация Telegram Web App
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Конфигурация
const CONFIG = {
    BOT_USERNAME: 'AuroraWhisperBot', // Замените на username вашего бота
    API_BASE: 'https://soundcloudtrip.github.io/AuroraBot/', // URL вашего бэкенда (если нужен)
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

// Инициализация приложения
async function initApp() {
    try {
        // Получаем данные пользователя из Telegram
        const initData = tg.initDataUnsafe;
        state.user = initData.user || {
            id: Math.floor(Math.random() * 1000000),
            first_name: 'Гость',
            username: 'guest'
        };
        
        // Загружаем данные пользователя из бота
        await loadUserData();
        
        // Обновляем UI
        updateUserInfo();
        
        // Показываем главную страницу
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

// Загрузка данных пользователя из бота
async function loadUserData() {
    // В реальном приложении здесь был бы запрос к вашему API
    // Сейчас используем заглушку
    state.userData = {
        is_premium: false,
        premium_until: null,
        points: 0,
        ref_code: 'REF' + Math.random().toString(36).substring(7).toUpperCase(),
        today_usage: 0
    };
}

// Обновление информации о пользователе
function updateUserInfo() {
    userName.textContent = state.user.first_name;
    userStatus.textContent = state.userData?.is_premium ? '⭐ Премиум' : '🆓 Бесплатный';
}

// Навигация
function navigateTo(page) {
    state.currentPage = page;
    loadPage(page);
    
    // Обновляем активные элементы навигации
    document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === page) {
            item.classList.add('active');
        }
    });
    
    // Закрываем sidebar на мобильных
    closeSidebar();
}

// Загрузка страницы
async function loadPage(page) {
    showLoading();
    
    try {
        let html = '';
        switch(page) {
            case 'home':
                html = renderHomePage();
                break;
            case 'oracle':
                html = renderOraclePage();
                break;
            case 'compatibility':
                html = renderCompatibilityPage();
                break;
            case 'chat':
                html = renderChatPage();
                break;
            case 'flirt':
                html = renderFlirtPage();
                break;
            case 'premium':
                html = renderPremiumPage();
                break;
            case 'profile':
                html = renderProfilePage();
                break;
            case 'referral':
                html = renderReferralPage();
                break;
        }
        
        content.innerHTML = html;
        attachPageEvents(page);
        
    } catch (error) {
        console.error('Page load error:', error);
        showToast('Ошибка загрузки страницы', 'error');
    } finally {
        hideLoading();
    }
}

// Рендеринг главной страницы
function renderHomePage() {
    const today = new Date().toLocaleDateString('ru-RU', { 
        weekday: 'long', 
        day: 'numeric', 
        month: 'long' 
    });
    
    const used = state.userData?.today_usage || 0;
    const remaining = CONFIG.FREE_DAILY_LIMIT - used;
    
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

// Рендеринг страницы оракула
function renderOraclePage() {
    return `
        <div class="card">
            <h2 class="card-title">🌙 Оракул дня</h2>
            <p class="card-subtitle">Узнай, что звёзды приготовили для тебя сегодня</p>
            
            <button class="btn btn-icon" onclick="getOracle()">
                <span>🔮 Получить расклад</span>
            </button>
        </div>
        
        <div id="oracleResult" class="card hidden">
            <div class="oracle-content"></div>
        </div>
    `;
}

// Рендеринг страницы совместимости
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
            
            <button class="btn" onclick="calculateCompatibility()">
                Рассчитать совместимость
            </button>
        </div>
        
        <div id="compatResult" class="card hidden">
            <div class="compat-content"></div>
        </div>
    `;
}

// Рендеринг страницы разбора чата
function renderChatPage() {
    return `
        <div class="card">
            <h2 class="card-title">💬 Разбор переписки</h2>
            <p class="card-subtitle">Вставь текст переписки для анализа</p>
            
            <div class="input-group">
                <textarea class="input-field textarea" id="chatText" placeholder="Вставь сюда переписку..."></textarea>
            </div>
            
            <button class="btn" onclick="analyzeChat()">
                Проанализировать
            </button>
        </div>
        
        <div id="chatResult" class="card hidden">
            <div class="chat-content"></div>
        </div>
    `;
}

// Рендеринг страницы флирта
function renderFlirtPage() {
    return `
        <div class="card">
            <h2 class="card-title">✨ Флирт-генератор</h2>
            <p class="card-subtitle">Напиши, что тебе написал парень, и получи варианты ответов</p>
            
            <div class="input-group">
                <textarea class="input-field textarea" id="flirtMessage" placeholder="Сообщение от парня..."></textarea>
            </div>
            
            <button class="btn" onclick="generateFlirt()">
                Сгенерировать ответы
            </button>
        </div>
        
        <div id="flirtResult" class="card hidden">
            <div class="flirt-content"></div>
        </div>
    `;
}

// Рендеринг страницы премиум
function renderPremiumPage() {
    return `
        <div class="card">
            <h2 class="card-title">⭐ Премиум подписка</h2>
            <p class="card-subtitle">Получи безлимитный доступ ко всем функциям</p>
            
            <div class="premium-price">
                от ${CONFIG.STARS_DAY} ⭐
                <span class="price-period">/день</span>
            </div>
            
            <div class="feature-list">
                <div class="feature-item">✨ Безлимитные запросы</div>
                <div class="feature-item">🔮 Эксклюзивные расклады</div>
                <div class="feature-item">💫 Приоритетная поддержка</div>
                <div class="feature-item">🎁 Бонусные очки</div>
            </div>
            
            <button class="btn" onclick="showPremiumPlans()">
                Выбрать тариф
            </button>
        </div>
    `;
}

// Рендеринг страницы профиля
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
            
            <div class="info-item">
                <strong>Имя:</strong> ${state.user.first_name}
            </div>
            <div class="info-item">
                <strong>Username:</strong> @${state.user.username || 'не указан'}
            </div>
            <div class="info-item">
                <strong>ID:</strong> ${state.user.id}
            </div>
            <div class="info-item">
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

// Рендеринг реферальной страницы
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
                <p>А если друг пришёл по ссылке админа — ты получишь 14 дней Премиума</p>
            </div>
        </div>
    `;
}

// Привязка событий к странице
function attachPageEvents(page) {
    // Здесь можно добавить специфичные для страницы события
}

// Функции взаимодействия с ботом
async function getOracle() {
    if (!await checkLimit()) return;
    
    showLoading();
    try {
        // Открываем бота с командой /oracle
        tg.openTelegramLink(`https://t.me/${CONFIG.BOT_USERNAME}?start=oracle`);
        showToast('Открываю бота...', 'success');
    } catch (error) {
        showToast('Ошибка', 'error');
    } finally {
        hideLoading();
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
    
    showLoading();
    try {
        // Кодируем даты для передачи в бота
        const params = new URLSearchParams({
            start: `compat_${myDate}_${partnerDate}`
        });
        
        tg.openTelegramLink(`https://t.me/${CONFIG.BOT_USERNAME}?${params}`);
        showToast('Открываю бота...', 'success');
    } catch (error) {
        showToast('Ошибка', 'error');
    } finally {
        hideLoading();
    }
}

async function analyzeChat() {
    const chatText = document.getElementById('chatText')?.value;
    
    if (!chatText || chatText.length < 10) {
        showToast('Введите текст переписки (минимум 10 символов)', 'warning');
        return;
    }
    
    if (!await checkLimit()) return;
    
    showLoading();
    try {
        // Кодируем текст для передачи в бота
        const encodedText = encodeURIComponent(chatText.substring(0, 100));
        tg.openTelegramLink(`https://t.me/${CONFIG.BOT_USERNAME}?start=chat_${encodedText}`);
        showToast('Открываю бота...', 'success');
    } catch (error) {
        showToast('Ошибка', 'error');
    } finally {
        hideLoading();
    }
}

async function generateFlirt() {
    const message = document.getElementById('flirtMessage')?.value;
    
    if (!message) {
        showToast('Введите сообщение', 'warning');
        return;
    }
    
    if (!await checkLimit()) return;
    
    showLoading();
    try {
        // Кодируем сообщение для передачи в бота
        const encodedMsg = encodeURIComponent(message.substring(0, 100));
        tg.openTelegramLink(`https://t.me/${CONFIG.BOT_USERNAME}?start=flirt_${encodedMsg}`);
        showToast('Открываю бота...', 'success');
    } catch (error) {
        showToast('Ошибка', 'error');
    } finally {
        hideLoading();
    }
}

function showPremiumPlans() {
    const plans = [
        { name: '1 день', stars: CONFIG.STARS_DAY, days: 1 },
        { name: '30 дней', stars: CONFIG.STARS_MONTH, days: 30 },
        { name: '180 дней', stars: CONFIG.STARS_HALFYEAR, days: 180 }
    ];
    
    const modalHtml = `
        <h2 class="card-title text-center">Выбери тариф</h2>
        ${plans.map(plan => `
            <div class="card premium-card" onclick="buyPremium('${plan.days}')">
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
        // Fallback для старых браузеров
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

// Проверка лимитов
async function checkLimit() {
    if (state.userData?.is_premium) return true;
    
    if (state.userData?.today_usage >= CONFIG.FREE_DAILY_LIMIT) {
        showModal(`
            <h2 class="card-title">🔒 Лимит исчерпан</h2>
            <p>Ты использовал все ${CONFIG.FREE_DAILY_LIMIT} бесплатных запросов на сегодня</p>
            <button class="btn" onclick="navigateTo('premium'); closeModal();">
                Оформить Премиум
            </button>
        `);
        return false;
    }
    
    return true;
}

// Валидация даты
function validateDate(date) {
    return /^\d{2}\.\d{2}\.\d{4}$/.test(date);
}

// UI функции
function showLoading() {
    state.loading = true;
}

function hideLoading() {
    state.loading = false;
}

function showToast(message, type = 'info') {
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
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

// Обработчики событий
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    
    // Меню
    document.getElementById('menuBtn').addEventListener('click', openSidebar);
    document.getElementById('closeSidebarBtn').addEventListener('click', closeSidebar);
    sidebarOverlay.addEventListener('click', closeSidebar);
    
    // Профиль
    document.getElementById('profileBtn').addEventListener('click', () => {
        navigateTo('profile');
    });
    
    // Навигация
    document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const page = e.currentTarget.dataset.page;
            if (page) navigateTo(page);
        });
    });
    
    // Модальное окно
    document.getElementById('modalClose').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
});

// Telegram Web App события
tg.onEvent('mainButtonClicked', () => {
    tg.close();
});

// Экспорт функций для глобального доступа
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