// ─────────────────────────────────────────────────────────────────────────────
// AI Dating Oracle — Mini App
//
// СХЕМА:
// 1. Пользователь нажимает кнопку в апп
// 2. tg.sendData(json) — апп закрывается, бот получает запрос
// 3. Бот вызывает g4f, сохраняет результат в БД
// 4. Бот пишет в чат превью + кнопку "Открыть результат"
// 5. Пользователь нажимает — апп открывается
// 6. Апп читает результат из БД через GET /api/result
// 7. Результат показывается в апп
// ─────────────────────────────────────────────────────────────────────────────

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// ⬇️ IP твоего VPS где запущен bot.py (HTTP сервер на порту 8000)
const API = 'http://57.129.44.160:8000';

const BOT   = 'AuroraWhisperBot';
const STARS = { day: 80, month: 250, halfyear: 1500 };

// ─────────────────────────────────────────────────────────────────────────────
// СОСТОЯНИЕ
// ─────────────────────────────────────────────────────────────────────────────

const state = {
    user:   null,
    data:   null,   // { is_premium, today_usage, points, ref_code, limit, premium_until }
    compat: { myDate: '', partnerDate: '' },
    page:   'home',
};

// ─────────────────────────────────────────────────────────────────────────────
// ЭЛЕМЕНТЫ
// ─────────────────────────────────────────────────────────────────────────────

const $          = id => document.getElementById(id);
const splashEl   = $('splash-screen');
const mainEl     = $('main-app');
const sidebarEl  = $('sidebar');
const overlayEl  = $('sidebarOverlay');
const contentEl  = $('content');
const modalEl    = $('modal');
const modalBody  = $('modalBody');
const toastEl    = $('toast');
const userNameEl = $('userName');
const userStatEl = $('userStatus');

// ─────────────────────────────────────────────────────────────────────────────
// ИНИЦИАЛИЗАЦИЯ
// ─────────────────────────────────────────────────────────────────────────────

async function init() {
    const raw  = tg.initDataUnsafe;
    state.user = (raw && raw.user) ? raw.user : { id: 0, first_name: 'Гость', username: '' };

    // Читаем данные пользователя + возможный результат от бота
    let pending = null;
    try {
        const res  = await fetch(`${API}/api/result?user_id=${state.user.id}`);
        const data = await res.json();
        if (data.ok) {
            state.data = {
                is_premium:    data.is_premium,
                premium_until: data.premium_until,
                points:        data.points,
                today_usage:   data.today_usage,
                ref_code:      data.ref_code,
                limit:         data.limit,
            };
            if (data.result) {
                pending = { action: data.action, result: data.result };
            }
        }
    } catch (_) {}

    // Fallback если сервер недоступен
    if (!state.data) {
        const key  = 'u_' + new Date().toDateString();
        state.data = {
            is_premium:    false,
            premium_until: '',
            points:        +localStorage.getItem('pts') || 0,
            today_usage:   +localStorage.getItem(key)   || 0,
            ref_code:      localStorage.getItem('ref')  || ('REF' + Math.random().toString(36).slice(-5).toUpperCase()),
            limit:         5,
        };
        localStorage.setItem('ref', state.data.ref_code);
    }

    updateHeader();

    setTimeout(() => {
        splashEl.classList.add('hidden');
        mainEl.classList.remove('hidden');

        // Если есть ожидающий результат — показываем нужную страницу
        if (pending) {
            const pageMap = { oracle: 'oracle', compatibility: 'compat', chat: 'chat', flirt: 'flirt' };
            const page    = pageMap[pending.action] || 'oracle';
            navigate(page);
            // Ждём рендера страницы и показываем результат
            setTimeout(() => {
                const ids = {
                    oracle: ['oracleResult', 'oracleContent'],
                    compat: ['compatResult', 'compatContent'],
                    chat:   ['chatResult',   'chatContent'],
                    flirt:  ['flirtResult',  'flirtContent'],
                };
                const [rid, cid] = ids[page] || ids.oracle;
                showResult(rid, cid, pending.result);
                showToast('Результат готов! 🔮', 'success');
            }, 200);
        } else {
            navigate('home');
        }
    }, 1000);
}

function updateHeader() {
    userNameEl.textContent = state.user.first_name;
    userStatEl.textContent = state.data.is_premium ? '⭐ Премиум' : '🆓 Бесплатный';
}

// ─────────────────────────────────────────────────────────────────────────────
// ОТПРАВКА ЗАПРОСА БОТУ — апп закрывается, бот обрабатывает
// ─────────────────────────────────────────────────────────────────────────────

function sendToBotAndClose(payload) {
    tg.sendData(JSON.stringify(payload));
    // Апп автоматически закроется после sendData
}

// ─────────────────────────────────────────────────────────────────────────────
// ПОКАЗАТЬ РЕЗУЛЬТАТ
// ─────────────────────────────────────────────────────────────────────────────

function showResult(resultId, contentId, text) {
    const r = $(resultId);
    const c = $(contentId);
    if (!r || !c) return;
    c.innerHTML = text
        .split('\n')
        .filter(l => l.trim())
        .map(l => `<p style="margin-bottom:12px;line-height:1.65">${l}</p>`)
        .join('');
    r.classList.remove('hidden');
    setTimeout(() => r.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
}

// ─────────────────────────────────────────────────────────────────────────────
// ЛИМИТ
// ─────────────────────────────────────────────────────────────────────────────

function checkLimit() {
    if (state.data.is_premium) return true;
    if (state.data.today_usage >= state.data.limit) {
        showModal(
            `<h2 class="card-title">🔒 Лимит исчерпан</h2>
            <p>Все ${state.data.limit} бесплатных запросов использованы.</p>
            <p style="margin-top:10px;color:var(--text-secondary)">Лимит сбросится завтра.</p>
            <button class="btn mt-20" onclick="navigate('premium');closeModal()">⭐ Оформить Премиум</button>`
        );
        return false;
    }
    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// AI ФУНКЦИИ — отправляют данные боту и закрывают апп
// ─────────────────────────────────────────────────────────────────────────────

function getOracle() {
    if (!checkLimit()) return;
    showToast('Отправляю оракулу... 🔮', 'success');
    setTimeout(() => sendToBotAndClose({ action: 'oracle' }), 600);
}

function calcCompat() {
    const d1 = ($('myDate') || {}).value || '';
    const d2 = ($('partnerDate') || {}).value || '';
    if (!d1 || !d2) { showToast('Введите обе даты', 'warning'); return; }
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(d1) || !/^\d{2}\.\d{2}\.\d{4}$/.test(d2)) {
        showToast('Формат: ДД.ММ.ГГГГ', 'error'); return;
    }
    state.compat = { myDate: d1, partnerDate: d2 };
    if (!checkLimit()) return;
    showToast('Считаю совместимость... 💑', 'success');
    setTimeout(() => sendToBotAndClose({ action: 'compatibility', my_date: d1, partner_date: d2 }), 600);
}

function analyzeChat() {
    const txt = ($('chatText') || {}).value || '';
    if (txt.length < 10) { showToast('Минимум 10 символов', 'warning'); return; }
    if (!checkLimit()) return;
    showToast('Читаю переписку... 🔍', 'success');
    setTimeout(() => sendToBotAndClose({ action: 'chat', message: txt }), 600);
}

function genFlirt() {
    const msg = (($('flirtMsg') || {}).value || '').trim();
    if (msg.length < 2) { showToast('Введите сообщение', 'warning'); return; }
    if (!checkLimit()) return;
    showToast('Разбираю ситуацию... ✨', 'success');
    setTimeout(() => sendToBotAndClose({ action: 'flirt', message: msg }), 600);
}

// ─────────────────────────────────────────────────────────────────────────────
// НАВИГАЦИЯ
// ─────────────────────────────────────────────────────────────────────────────

function navigate(page) {
    state.page = page;
    const pages = { home, oracle, compat, chat, flirt, premium, profile, referral };
    contentEl.innerHTML = pages[page] ? pages[page]() : '';
    document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(el =>
        el.classList.toggle('active', el.dataset.page === page || el.dataset.page === (page === 'compat' ? 'compatibility' : page))
    );
    closeSidebar();
}

// ─────────────────────────────────────────────────────────────────────────────
// СТРАНИЦЫ
// ─────────────────────────────────────────────────────────────────────────────

function home() {
    const today = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
    const used  = state.data.today_usage;
    const lim   = state.data.limit;
    const rem   = Math.max(0, lim - used);
    const pct   = Math.min(100, (used / lim) * 100);
    return `
    <div class="card fade-in">
      <h2 class="card-title">Привет, ${state.user.first_name}! 👋</h2>
      <p class="card-subtitle">${today}</p>
      <div class="stats-container">
        <div class="stat-item">
          <span class="stat-value">${used}/${lim}</span>
          <span class="stat-label">Запросов сегодня</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${state.data.points}</span>
          <span class="stat-label">Очков</span>
        </div>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <p class="text-center">Осталось ${rem} бесплатных запросов</p>
    </div>
    <div class="feature-grid">
      <div class="feature-item" onclick="navigate('oracle')"><span class="feature-icon">🌙</span><span class="feature-title">Оракул дня</span></div>
      <div class="feature-item" onclick="navigate('compat')"><span class="feature-icon">💑</span><span class="feature-title">Совместимость</span></div>
      <div class="feature-item" onclick="navigate('chat')"><span class="feature-icon">💬</span><span class="feature-title">Разбор чата</span></div>
      <div class="feature-item" onclick="navigate('flirt')"><span class="feature-icon">✨</span><span class="feature-title">Флирт</span></div>
    </div>
    ${!state.data.is_premium ? `
    <div class="card premium-card">
      <h3 class="card-title">⭐ Премиум</h3>
      <p>Безлимитные запросы каждый день</p>
      <button class="btn btn-small mt-20" onclick="navigate('premium')">Подробнее</button>
    </div>` : ''}`;
}

function oracle() {
    return `
    <div class="card">
      <h2 class="card-title">🌙 Оракул дня</h2>
      <p class="card-subtitle">Узнай, что звёзды приготовили для тебя сегодня</p>
      <button class="btn btn-icon" id="oracleBtn" onclick="getOracle()">🔮 Получить расклад</button>
    </div>
    <div id="oracleResult" class="card hidden">
      <h3 class="card-title">🌙 Твой расклад</h3>
      <div id="oracleContent"></div>
    </div>`;
}

function compat() {
    return `
    <div class="card">
      <h2 class="card-title">💑 Совместимость</h2>
      <p class="card-subtitle">Введи даты рождения для расчёта совместимости</p>
      <div class="input-group">
        <label class="input-label">Твоя дата рождения (ДД.ММ.ГГГГ)</label>
        <input type="text" class="input-field" id="myDate" placeholder="15.05.1995" value="${state.compat.myDate}">
      </div>
      <div class="input-group">
        <label class="input-label">Дата рождения партнёра</label>
        <input type="text" class="input-field" id="partnerDate" placeholder="20.08.1994" value="${state.compat.partnerDate}">
      </div>
      <button class="btn" id="compatBtn" onclick="calcCompat()">Рассчитать совместимость</button>
    </div>
    <div id="compatResult" class="card hidden">
      <h3 class="card-title">💑 Расклад совместимости</h3>
      <div id="compatContent"></div>
    </div>`;
}

function chat() {
    return `
    <div class="card">
      <h2 class="card-title">💬 Разбор переписки</h2>
      <p class="card-subtitle">Вставь текст переписки — разберём по косточкам</p>
      <div class="input-group">
        <textarea class="input-field textarea" id="chatText" placeholder="Вставь сюда переписку..."></textarea>
      </div>
      <button class="btn" id="chatBtn" onclick="analyzeChat()">Проанализировать</button>
    </div>
    <div id="chatResult" class="card hidden">
      <h3 class="card-title">🔍 Разбор</h3>
      <div id="chatContent"></div>
    </div>`;
}

function flirt() {
    return `
    <div class="card">
      <h2 class="card-title">✨ Флирт-генератор</h2>
      <p class="card-subtitle">Напиши что тебе написал парень — придумаем как ответить</p>
      <div class="input-group">
        <textarea class="input-field textarea" id="flirtMsg" placeholder="Сообщение от парня..."></textarea>
      </div>
      <button class="btn" id="flirtBtn" onclick="genFlirt()">Сгенерировать ответы</button>
    </div>
    <div id="flirtResult" class="card hidden">
      <h3 class="card-title">✨ Варианты ответов</h3>
      <div id="flirtContent"></div>
    </div>`;
}

function premium() {
    return `
    <div class="card">
      <h2 class="card-title">⭐ Премиум подписка</h2>
      <p class="card-subtitle">Безлимитный доступ ко всем функциям</p>
      <div class="premium-price">от ${STARS.day} ⭐<span class="price-period">/день</span></div>
      <div class="feature-grid">
        <div class="feature-item"><span class="feature-icon">✨</span><span class="feature-title">Безлимит</span></div>
        <div class="feature-item"><span class="feature-icon">🔮</span><span class="feature-title">Эксклюзив</span></div>
        <div class="feature-item"><span class="feature-icon">💫</span><span class="feature-title">Приоритет</span></div>
        <div class="feature-item"><span class="feature-icon">🎁</span><span class="feature-title">Бонусы</span></div>
      </div>
      <button class="btn" onclick="showPlans()">Выбрать тариф</button>
    </div>`;
}

function profile() {
    const d = state.data;
    return `
    <div class="card">
      <h2 class="card-title">👤 Профиль</h2>
      <div class="stats-container">
        <div class="stat-item"><span class="stat-value">${d.points}</span><span class="stat-label">Очков</span></div>
        <div class="stat-item"><span class="stat-value">${d.today_usage}/${d.limit}</span><span class="stat-label">Сегодня</span></div>
      </div>
      <div style="padding:10px 0;border-bottom:1px solid var(--border-color)"><strong>Имя:</strong> ${state.user.first_name}</div>
      <div style="padding:10px 0;border-bottom:1px solid var(--border-color)"><strong>Username:</strong> @${state.user.username || '—'}</div>
      <div style="padding:10px 0;border-bottom:1px solid var(--border-color)"><strong>ID:</strong> ${state.user.id}</div>
      <div style="padding:10px 0"><strong>Премиум:</strong> ${d.is_premium ? `⭐ Да (до ${d.premium_until})` : '🆓 Нет'}</div>
      ${state.user.id === 5914838626 ? '<button class="btn btn-outline mt-20" onclick="adminLink()">👑 Ссылка на 14 дней</button>' : ''}
    </div>`;
}

function referral() {
    const code = state.data.ref_code;
    const link = `https://t.me/${BOT}?start=ref=${code}`;
    return `
    <div class="card">
      <h2 class="card-title">🔗 Реферальная программа</h2>
      <p class="card-subtitle">Приглашай друзей и получай бонусы</p>
      <div class="referral-link">
        <span class="referral-code">${code}</span>
        <button class="copy-btn" onclick="copyText('${code}')">📋</button>
      </div>
      <div class="referral-link">
        <span class="referral-code">${link.slice(0, 38)}...</span>
        <button class="copy-btn" onclick="copyText('${link}')">📋</button>
      </div>
      <button class="btn btn-small mt-20" onclick="shareRef()">Поделиться ссылкой</button>
      <div class="card mt-20">
        <h3>Как это работает?</h3>
        <p>Пригласи друга — вы оба получите 3 дня Премиума!</p>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PREMIUM
// ─────────────────────────────────────────────────────────────────────────────

function showPlans() {
    showModal(
        `<h2 class="card-title text-center">Выбери тариф</h2>` +
        [
            { name: '1 день',   stars: STARS.day,      key: '1'   },
            { name: '30 дней',  stars: STARS.month,    key: '30'  },
            { name: '180 дней', stars: STARS.halfyear, key: '180' },
        ].map(p => `
        <div class="card premium-card" style="cursor:pointer;margin-bottom:12px" onclick="buyPremium(${p.key})">
            <h3>⭐ ${p.name}</h3>
            <div class="premium-price">${p.stars} Stars</div>
            <button class="btn btn-small">Выбрать</button>
        </div>`).join('')
    );
}

function buyPremium(days) {
    tg.openTelegramLink(`https://t.me/${BOT}?start=premium_${days}`);
    closeModal();
}

function adminLink() {
    tg.openTelegramLink(`https://t.me/${BOT}?start=adminref`);
}

// ─────────────────────────────────────────────────────────────────────────────
// УТИЛИТЫ
// ─────────────────────────────────────────────────────────────────────────────

function copyText(text) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
        .catch(() => {
            const t = document.createElement('textarea');
            t.value = text; document.body.appendChild(t); t.select();
            document.execCommand('copy'); document.body.removeChild(t);
        })
        .finally(() => showToast('Скопировано!', 'success'));
}

function shareRef() {
    const t = `🔮 Присоединяйся!\nhttps://t.me/${BOT}?start=ref=${state.data.ref_code}`;
    if (tg.shareToStory) tg.shareToStory(t);
    else { copyText(t); showToast('Ссылка скопирована!', 'success'); }
}

function showToast(msg, type = 'info') {
    toastEl.textContent = msg;
    toastEl.className   = 'toast ' + type;
    toastEl.classList.remove('hidden');
    setTimeout(() => toastEl.classList.add('hidden'), 3500);
}

function showModal(html)  { modalBody.innerHTML = html; modalEl.classList.remove('hidden'); }
function closeModal()     { modalEl.classList.add('hidden'); }
function openSidebar()    { sidebarEl.classList.add('open'); overlayEl.classList.add('active'); }
function closeSidebar()   { sidebarEl.classList.remove('open'); overlayEl.classList.remove('active'); }

// ─────────────────────────────────────────────────────────────────────────────
// СОБЫТИЯ
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    init();
    $('menuBtn').addEventListener('click', openSidebar);
    $('closeSidebarBtn').addEventListener('click', closeSidebar);
    $('sidebarOverlay').addEventListener('click', closeSidebar);
    $('profileBtn').addEventListener('click', () => navigate('profile'));
    document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(el => {
        el.addEventListener('click', e => {
            const p = e.currentTarget.dataset.page;
            if (p) navigate(p === 'compatibility' ? 'compat' : p);
        });
    });
    $('modalClose').addEventListener('click', closeModal);
    modalEl.addEventListener('click', e => { if (e.target === modalEl) closeModal(); });
});

tg.onEvent('mainButtonClicked', () => tg.close());

window.navigate    = navigate;
window.getOracle   = getOracle;
window.calcCompat  = calcCompat;
window.analyzeChat = analyzeChat;
window.genFlirt    = genFlirt;
window.showPlans   = showPlans;
window.buyPremium  = buyPremium;
window.adminLink   = adminLink;
window.copyText    = copyText;
window.shareRef    = shareRef;
window.closeModal  = closeModal;
