"""
╔══════════════════════════════════════════════════════╗
║         AI Dating Oracle — Telegram Bot              ║
║  python-telegram-bot 21+, g4f, Stars payments        ║
╚══════════════════════════════════════════════════════╝
"""

import logging
import os
import random
import re
import sqlite3
import string
from datetime import date, datetime, timedelta

import g4f
from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    LabeledPrice,
    Update,WebAppInfo  
)
from telegram.constants import ParseMode
from telegram.ext import (
    ApplicationBuilder,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    ConversationHandler,
    MessageHandler,
    PreCheckoutQueryHandler,
    filters
)

# ─────────────────────────────────────────────────────────────────────────────
# КОНФИГ
# ─────────────────────────────────────────────────────────────────────────────
BOT_TOKEN: str  = "8671869643:AAEzMnIEzVYH4nEz3b6JoaIgnDRZNTnc_fM"
ADMIN_ID: int   = 5914838626
DB_PATH: str    = "oracle.db"
FREE_DAILY_LIMIT: int       = 5
BONUS_POINTS_THRESHOLD: int = 10

# Цены в Stars (1 Star ≈ 0.013$)
STARS_DAY      = 80    # 1 день
STARS_MONTH    = 250   # месяц
STARS_HALFYEAR = 1500  # полгода

(
    COMPAT_MY_DATE,
    COMPAT_PARTNER_DATE,
    CHAT_ANALYSIS_TEXT,
    FLIRT_CONTEXT,
) = range(4)

logging.basicConfig(
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# БАЗА ДАННЫХ
# ─────────────────────────────────────────────────────────────────────────────

def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with db() as c:
        c.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                user_id       INTEGER PRIMARY KEY,
                username      TEXT,
                first_name    TEXT,
                is_premium    INTEGER DEFAULT 0,
                premium_until TEXT,
                points        INTEGER DEFAULT 0,
                ref_code      TEXT UNIQUE,
                referred_by   INTEGER,
                created_at    TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS daily_usage (
                user_id    INTEGER,
                usage_date TEXT,
                count      INTEGER DEFAULT 0,
                PRIMARY KEY (user_id, usage_date)
            );
            CREATE TABLE IF NOT EXISTS admin_tokens (
                token      TEXT PRIMARY KEY,
                used       INTEGER DEFAULT 0,
                used_by    INTEGER,
                created_at TEXT DEFAULT (datetime('now'))
            );
        """)
    logger.info("БД инициализирована: %s", DB_PATH)


def get_or_create_user(user_id: int, username: str, first_name: str) -> sqlite3.Row:
    code = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    with db() as c:
        c.execute(
            "INSERT OR IGNORE INTO users (user_id, username, first_name, ref_code) VALUES (?,?,?,?)",
            (user_id, username or "", first_name or "Незнакомец", code),
        )
        return c.execute("SELECT * FROM users WHERE user_id=?", (user_id,)).fetchone()


def today_usage(user_id: int) -> int:
    with db() as c:
        row = c.execute(
            "SELECT count FROM daily_usage WHERE user_id=? AND usage_date=?",
            (user_id, date.today().isoformat()),
        ).fetchone()
        return row["count"] if row else 0


def inc_usage(user_id: int) -> None:
    with db() as c:
        c.execute(
            """INSERT INTO daily_usage (user_id, usage_date, count) VALUES (?,?,1)
               ON CONFLICT(user_id, usage_date) DO UPDATE SET count=count+1""",
            (user_id, date.today().isoformat()),
        )


def add_points(user_id: int, pts: int = 1) -> int:
    with db() as c:
        c.execute("UPDATE users SET points=points+? WHERE user_id=?", (pts, user_id))
        return c.execute("SELECT points FROM users WHERE user_id=?", (user_id,)).fetchone()["points"]


def grant_premium(user_id: int, days: int = 7) -> str:
    # Продлеваем от текущей даты или от конца текущей подписки
    with db() as c:
        row = c.execute("SELECT premium_until FROM users WHERE user_id=?", (user_id,)).fetchone()
    today = date.today().isoformat()
    base  = row["premium_until"] if row and row["premium_until"] and row["premium_until"] > today else today
    until = (datetime.fromisoformat(base) + timedelta(days=days)).date().isoformat()
    with db() as c:
        c.execute(
            "UPDATE users SET is_premium=1, premium_until=? WHERE user_id=?",
            (until, user_id),
        )
    return until

async def handle_web_app_data(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработка данных из Web App"""
    web_app_data = update.effective_message.web_app_data
    if web_app_data:
        data = web_app_data.data
        user = update.effective_user
        
        logger.info(f"Web App data from {user.id}: {data}")
        
        # Парсим данные (ожидаем JSON)
        try:
            import json
            data_dict = json.loads(data)
            
            action = data_dict.get('action')
            
            if action == 'oracle':
                await cmd_oracle(update, context)
            elif action == 'compatibility':
                context.user_data['my_date'] = data_dict.get('my_date')
                context.user_data['partner_date'] = data_dict.get('partner_date')
                await cmd_compatibility(update, context)
            elif action == 'chat':
                context.user_data['chat_text'] = data_dict.get('text')
                await cmd_chat_analysis(update, context)
            elif action == 'flirt':
                context.user_data['flirt_text'] = data_dict.get('text')
                await cmd_flirt(update, context)
                
        except Exception as e:
            logger.error(f"Error parsing web app data: {e}")
            await update.effective_message.reply_text(
                "❌ Ошибка обработки данных",
                reply_markup=main_keyboard()
            )
def check_premium(user_id: int) -> bool:
    with db() as c:
        row = c.execute(
            "SELECT is_premium, premium_until FROM users WHERE user_id=?", (user_id,)
        ).fetchone()
        if not row or not row["is_premium"]:
            return False
        if row["premium_until"] and row["premium_until"] < date.today().isoformat():
            c.execute("UPDATE users SET is_premium=0 WHERE user_id=?", (user_id,))
            return False
        return True


def get_ref_code(user_id: int) -> str:
    with db() as c:
        return c.execute(
            "SELECT ref_code FROM users WHERE user_id=?", (user_id,)
        ).fetchone()["ref_code"]


def create_admin_token() -> str:
    """Создаёт одноразовый токен для админской ссылки."""
    token = "ADM-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=10))
    with db() as c:
        c.execute("INSERT INTO admin_tokens (token) VALUES (?)", (token,))
    return token


def use_admin_token(token: str, user_id: int) -> bool:
    """Проверяет и использует токен. Возвращает True если токен валиден."""
    with db() as c:
        row = c.execute(
            "SELECT used FROM admin_tokens WHERE token=?", (token,)
        ).fetchone()
        if not row or row["used"]:
            return False
        c.execute(
            "UPDATE admin_tokens SET used=1, used_by=? WHERE token=?",
            (user_id, token)
        )
    return True


def apply_referral(new_user_id: int, ref_code: str):
    with db() as c:
        referrer = c.execute(
            "SELECT user_id FROM users WHERE ref_code=?", (ref_code,)
        ).fetchone()
        if not referrer or referrer["user_id"] == new_user_id:
            return None
        referrer_id = referrer["user_id"]
        c.execute(
            "UPDATE users SET referred_by=? WHERE user_id=?",
            (referrer_id, new_user_id)
        )
    # Если реферальная ссылка от админа — новый пользователь получает 14 дней
    if referrer_id == ADMIN_ID:
        grant_premium(new_user_id, days=14)
    else:
        grant_premium(new_user_id, days=3)
        grant_premium(referrer_id, days=3)
    return referrer_id


# ─────────────────────────────────────────────────────────────────────────────
# ЛИМИТЫ И ОЧКИ
# ─────────────────────────────────────────────────────────────────────────────

async def check_limit(update: Update, user_id: int) -> bool:
    if check_premium(user_id):
        return True
    used = today_usage(user_id)
    if used >= FREE_DAILY_LIMIT:
        await update.effective_message.reply_text(
            f"🔒 Использовано {FREE_DAILY_LIMIT}/{FREE_DAILY_LIMIT} запросов на сегодня.\n\n"
            "Оформи Премиум и получи безлимит:",
            reply_markup=premium_keyboard(),
        )
        return False
    return True


async def process_points(update: Update, user_id: int) -> None:
    pts = add_points(user_id)
    if pts % BONUS_POINTS_THRESHOLD == 0:
        await update.effective_message.reply_text(
            f"🎉 {pts} очков! Бонусный расклад активирован — жми /oracle!"
        )


# ─────────────────────────────────────────────────────────────────────────────
# ОЧИСТКА ТЕКСТА ОТ MARKDOWN
# ─────────────────────────────────────────────────────────────────────────────

def clean_markdown(text: str) -> str:
    """Убирает всю markdown-разметку из ответа AI."""
    t = str(text)
    t = re.sub(r'#{1,6}\s*', '', t)                    # ### заголовки
    t = re.sub(r'\*{1,3}(.*?)\*{1,3}', r'\1', t, flags=re.DOTALL)  # **жирный**
    t = re.sub(r'_{1,2}(.*?)_{1,2}', r'\1', t, flags=re.DOTALL)    # __курсив__
    t = re.sub(r'`{1,3}.*?`{1,3}', '', t, flags=re.DOTALL)         # `код`
    t = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', t)    # [текст](url)
    t = re.sub(r'[\[\]{}\\]', '', t)                   # остатки скобок
    t = re.sub(r'^[-–—]\s+', '', t, flags=re.MULTILINE) # маркеры списков
    t = re.sub(r'\n{3,}', '\n\n', t)                   # лишние пустые строки
    return t.strip()


# ─────────────────────────────────────────────────────────────────────────────
# G4F — ЗАПРОС К AI
# ─────────────────────────────────────────────────────────────────────────────

async def ask_ai(system_prompt: str, user_message: str) -> str:
    try:
        response = await g4f.ChatCompletion.create_async(
            model=g4f.models.gpt_4,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_message},
            ],
        )
        return clean_markdown(response)
    except Exception as e:
        logger.error("Ошибка g4f: %s", e)
        return None


# ─────────────────────────────────────────────────────────────────────────────
# ПРОМПТЫ И AI-ФУНКЦИИ
# ─────────────────────────────────────────────────────────────────────────────

FLIRT_SYSTEM = """Ты — 25-летняя московская/питерская подруга-сплетница, которая сидит в тг-чате с лучшей подругой и разбирает всех парней по косточкам. Ты злая, острая на язык, саркастичная, обожаешь подкалывать, ржёшь над кринжем, ненавидишь шаблоны и сразу видишь, когда парень врёт/манипулирует/пытается подкатить дешёво. Твои ответы звучат как голосовые от подруги в 2:47 ночи: мат, сленг, эмодзи, кринж-анализ, советы как его на место поставить и варианты ответов, от которых он либо растеряется, либо начнёт оправдываться.

Ключевые правила:
- Никогда не флиртуй от первого лица. Ты помогаешь ПОДРУГЕ.
- Говори "ты" к подруге: "Солнышко, это кринж", "Девочка, не ведись".
- Тон: язвительный, поддерживающий, чёрный юмор, мат если в тему, 2-4 эмодзи.
- Структура: 1-2 предложения разбора что за хуйня он написал, потом 5 нумерованных вариантов ответа.
- Ответы короткие: 1-3 предложения, живой язык 2025-2026, сленг.
- Никаких клише и никаких знаков разметки: не используй #, *, _, никаких заголовков. Только чистый текст."""

CHAT_SYSTEM = """Ты — 25-летняя московская подруга-сплетница. Разбираешь переписку с парнем по косточкам. Говоришь подруге "ты", язык живой — мат, сленг, эмодзи.

Структура:
1. Разбор (2-3 предложения): что происходит на самом деле, какой он тип, его мотивы.
2. Честный вывод одним словом: флиртует / не флиртует / манипулирует / влюблён.
3. Лучший ответ который стоит отправить — один вариант, короткий, с характером.

Никаких знаков разметки: не используй #, *, _, никаких заголовков. Только чистый текст."""

COMPAT_SYSTEM = """Ты — подруга-сплетница и астролог-самоучка. Считаешь совместимость по датам рождения — весело, саркастично, с реальными советами. Говоришь подруге "ты". Язык живой, эмодзи, без занудства.

Структура:
1. Знаки зодиака обоих и их стихии.
2. Процент совместимости — напиши цифрами (любовь X%, страсть X%, конфликты X%).
3. Главная фишка этого союза — кайф и засада в 1-2 предложениях.
4. Один конкретный совет подруге как держать этого парня в тонусе.

Никаких знаков разметки: не используй #, *, _, никаких заголовков. Только чистый текст."""

ORACLE_SYSTEM = """Ты — подруга-сплетница которая немного шарит в таро. Делаешь подруге любовный расклад на день — весело, с подколами, живо. Говоришь "ты". Язык 2025-2026, сленг, 2-3 эмодзи.

Структура:
1. Карта дня — назови её.
2. Что это значит для любовной жизни сегодня — 2-3 предложения.
3. Конкретное действие на сегодня — что сделать или не делать.

Никаких знаков разметки: не используй #, *, _, никаких заголовков. Только чистый текст как сообщение в телеграм."""


async def ai_flirt(context_msg: str) -> str:
    result = await ask_ai(FLIRT_SYSTEM, f"Парень написал подруге: «{context_msg}»")
    if result:
        return f"✨ На сообщение «{context_msg}»:\n\n{result}"
    return (
        f"✨ На «{context_msg}»:\n\n"
        "Ой бля, стандартный заход 😂 Давай покажем кто тут главный.\n\n"
        "1. «Интересно. Продолжение будет или ты только на это способен? 😏»\n"
        "2. «Хм. Засчитано за попытку. Попробуй ещё раз, но с огоньком»\n"
        "3. «Смело 😂 Ладно, удиви меня — у тебя 3 сообщения»\n"
        "4. «Ого, прямолинейный. Мне нравятся такие. Но сначала заслужи 😈»\n"
        "5. «Зачёт. А теперь скажи что-нибудь, что я не слышала 100 раз»"
    )


async def ai_chat_analysis(chat_text: str) -> str:
    result = await ask_ai(CHAT_SYSTEM, f"Вот переписка с парнем: «{chat_text}»")
    if result:
        return f"🔍 Разбор переписки:\n\n{result}"
    return (
        "🔍 Разбор:\n\n"
        "Солнышко, классика жанра 😂 Он пытается, но делает это топорно.\n\n"
        "Вывод: заинтересован, но хитрит.\n\n"
        "Лучший ответ: «Интересно. Продолжай, мне есть с чем сравнить 😏»"
    )


async def ai_compatibility(my_date: str, partner_date: str, my_name: str) -> str:
    result = await ask_ai(
        COMPAT_SYSTEM,
        f"{my_name} родилась {my_date}, её парень родился {partner_date}. Какая совместимость?"
    )
    if result:
        return f"💑 Расклад совместимости:\n\n{result}"
    return f"💑 Расклад для {my_name}:\n\nЗвёзды думают... попробуй ещё раз 🌙"


async def ai_daily_oracle(first_name: str) -> str:
    result = await ask_ai(
        ORACLE_SYSTEM,
        f"Сделай любовный расклад на сегодня для {first_name}. Дата: {datetime.now().strftime('%d.%m.%Y')}"
    )
    if result:
        return f"🌙 Оракул дня для {first_name}:\n\n{result}"
    cards  = ["Луна 🌙", "Звезда ⭐", "Влюблённые 💑", "Солнце ☀️", "Колесо Судьбы 🎡"]
    advice = [
        "Сегодня твоя харизма зашкаливает — напиши первой, не тупи.",
        "День для откровенных разговоров. Скажи что чувствуешь.",
        "Жди неожиданного сообщения. Отвечай не сразу — пусть помучается.",
    ]
    return (
        f"🌙 Оракул дня для {first_name}:\n\n"
        f"Карта дня: {random.choice(cards)}\n\n"
        f"{random.choice(advice)}"
    )


# ─────────────────────────────────────────────────────────────────────────────
# КЛАВИАТУРЫ
# ─────────────────────────────────────────────────────────────────────────────

def main_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("🔮 Оракул дня",      callback_data="oracle"),
            InlineKeyboardButton("💑 Совместимость",   callback_data="compat"),
        ],
        [
            InlineKeyboardButton("💬 Разбор чата",     callback_data="chat"),
            InlineKeyboardButton("✨ Флирт-генератор", callback_data="flirt"),
        ],
        [
            InlineKeyboardButton("⭐ Премиум",         callback_data="premium"),
            InlineKeyboardButton("👤 Профиль",          callback_data="profile"),
        ],
        [
            InlineKeyboardButton("🔗 Реферальная ссылка", callback_data="ref"),
        ],
    ])


def premium_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton(f"⭐ 1 день — {STARS_DAY} Stars",     callback_data="buy_day")],
        [InlineKeyboardButton(f"⭐ Месяц — {STARS_MONTH} Stars",  callback_data="buy_month")],
        [InlineKeyboardButton(f"⭐ Полгода — {STARS_HALFYEAR} Stars", callback_data="buy_halfyear")],
        [InlineKeyboardButton("◀️ Назад",                          callback_data="back_main")],
    ])


def cancel_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("❌ Отмена", callback_data="cancel_state")
    ]])


# ─────────────────────────────────────────────────────────────────────────────
# ОПЛАТА STARS
# ─────────────────────────────────────────────────────────────────────────────

async def send_invoice(update: Update, context: ContextTypes.DEFAULT_TYPE, plan: str) -> None:
    plans = {
        "day":      ("Премиум — 1 день",    "Безлимитные запросы на 1 день",   STARS_DAY,      1),
        "month":    ("Премиум — 30 дней",   "Безлимитные запросы на 30 дней",  STARS_MONTH,    30),
        "halfyear": ("Премиум — 180 дней",  "Безлимитные запросы на полгода",  STARS_HALFYEAR, 180),
    }
    title, desc, stars, _ = plans[plan]

    invoice_msg = await context.bot.send_invoice(
        chat_id=update.effective_chat.id,
        title=title,
        description=desc,
        payload=f"premium_{plan}_{update.effective_user.id}",
        currency="XTR",
        prices=[LabeledPrice(title, stars)],
        provider_token="",
    )
    # Сохраняем id инвойса чтобы удалить после оплаты
    context.user_data["invoice_msg_id"] = invoice_msg.message_id


async def pre_checkout_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Подтверждаем оплату."""
    await update.pre_checkout_query.answer(ok=True)


async def successful_payment_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Активируем премиум и удаляем инвойс после оплаты."""
    payment = update.message.successful_payment
    payload = payment.invoice_payload
    user_id = update.effective_user.id

    days_map = {"day": 1, "month": 30, "halfyear": 180}
    plan     = payload.split("_")[1]
    days     = days_map.get(plan, 1)
    until    = grant_premium(user_id, days=days)

    logger.info("Оплата Stars: user=%s plan=%s days=%s until=%s", user_id, plan, days, until)

    # Удаляем сообщение с инвойсом
    invoice_msg_id = context.user_data.pop("invoice_msg_id", None)
    if invoice_msg_id:
        try:
            await context.bot.delete_message(
                chat_id=update.effective_chat.id,
                message_id=invoice_msg_id,
            )
        except Exception:
            pass

    # Удаляем системное сообщение об успешной оплате
    try:
        await update.message.delete()
    except Exception:
        pass

    await context.bot.send_message(
        chat_id=update.effective_chat.id,
        text=f"🎉 Оплата прошла! Премиум активирован до {until}.\n\nТеперь у тебя безлимитные запросы. Поехали! 🔮",
        reply_markup=main_keyboard(),
    )


# ─────────────────────────────────────────────────────────────────────────────
# КОМАНДЫ
# ─────────────────────────────────────────────────────────────────────────────

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    get_or_create_user(user.id, user.username or "", user.first_name or "")
    ref_bonus = ""

    for arg in (context.args or []):
        if arg.startswith("ref="):
            raw = arg[4:]

            # Админская ссылка: ref=ADMINCODE_TOKEN
            if "_" in raw:
                parts    = raw.split("_", 1)
                ref_code = parts[0]
                token    = parts[1]

                with db() as c:
                    referrer_row = c.execute(
                        "SELECT user_id FROM users WHERE ref_code=?", (ref_code,)
                    ).fetchone()

                if referrer_row and referrer_row["user_id"] == ADMIN_ID:
                    if use_admin_token(token, user.id):
                        until = grant_premium(user.id, days=14)
                        ref_bonus = f"\n\n👑 Подарок активирован! 14 дней Премиума до {until}!"
                    else:
                        ref_bonus = "\n\n❌ Эта ссылка уже была использована — попроси новую."
                else:
                    ref_bonus = "\n\n❌ Неверная ссылка."

            else:
                # Обычная реферальная ссылка
                referrer_id = apply_referral(user.id, raw)
                if referrer_id:
                    ref_bonus = "\n\n🎁 Бонус активирован! Вам обоим +3 дня Премиума!"
                    try:
                        await context.bot.send_message(
                            referrer_id,
                            "🎉 По твоей ссылке пришёл новый пользователь! +3 дня Премиума!",
                        )
                    except Exception:
                        pass
    keyboard.inline_keyboard.append([
    InlineKeyboardButton(
    "🌐 Открыть Web App", 
    web_app=WebAppInfo(url="https://soundcloudtrip.github.io/AuroraBot/")  # Замените на реальный URL!
        )])
    prem_badge = "⭐ Премиум" if check_premium(user.id) else "🆓 Бесплатный"
    await update.message.reply_text(
        f"🔮 Привет, {user.first_name}! Я твой оракул по любви и флирту.\n\n"
        f"Статус: {prem_badge}{ref_bonus}\n\n"
        f"Что умею:\n"
        f"🌙 Расклад дня\n"
        f"💑 Совместимость по датам\n"
        f"💬 Разбор переписки\n"
        f"✨ Флирт-генератор\n\n"
        f"Бесплатно: {FREE_DAILY_LIMIT} запросов в день\n"
        f"⭐ Премиум: безлимит за Stars\n\n"
        f"Выбирай 👇",
        reply_markup=main_keyboard(),
    )


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.effective_message.reply_text(
        "❓ Справка\n\n"
        "/start — главное меню\n"
        "/oracle — расклад дня\n"
        "/compatibility — совместимость\n"
        "/chat_analysis — разбор переписки\n"
        "/flirt — флирт-генератор\n"
        "/premium — оформить подписку\n\n"
        f"Бесплатно: {FREE_DAILY_LIMIT} запросов в день\n"
        f"Очки: +1 за запрос, каждые {BONUS_POINTS_THRESHOLD} — бонус!",
        reply_markup=main_keyboard(),
    )


async def cmd_premium(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_id = update.effective_user.id
    get_or_create_user(user_id, update.effective_user.username or "", update.effective_user.first_name or "")
    if check_premium(user_id):
        with db() as c:
            row = c.execute("SELECT premium_until FROM users WHERE user_id=?", (user_id,)).fetchone()
        await update.effective_message.reply_text(
            f"⭐ Премиум уже активен до {row['premium_until']}!\n\n"
            "Хочешь продлить?",
            reply_markup=premium_keyboard(),
        )
    else:
        await update.effective_message.reply_text(
            "⭐ Премиум — безлимитные запросы\n\n"
            f"1 день — {STARS_DAY} Stars\n"
            f"Месяц — {STARS_MONTH} Stars\n"
            f"Полгода — {STARS_HALFYEAR} Stars\n\n"
            "Выбирай тариф 👇",
            reply_markup=premium_keyboard(),
        )


async def cmd_oracle(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    get_or_create_user(user.id, user.username or "", user.first_name or "")
    if not await check_limit(update, user.id):
        return
    msg = await update.effective_message.reply_text("🌙 Прислушиваюсь к звёздам...")
    result = await ai_daily_oracle(user.first_name)
    inc_usage(user.id)
    await msg.edit_text(result, reply_markup=main_keyboard())
    await process_points(update, user.id)


# ─────────────────────────────────────────────────────────────────────────────
# CONVERSATION: СОВМЕСТИМОСТЬ
# ─────────────────────────────────────────────────────────────────────────────

async def cmd_compatibility(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    user = update.effective_user
    get_or_create_user(user.id, user.username or "", user.first_name or "")
    if not await check_limit(update, user.id):
        return ConversationHandler.END
    await update.effective_message.reply_text(
        "💑 Расчёт совместимости\n\nШаг 1/2: Напиши свою дату рождения (ДД.ММ.ГГГГ):",
        reply_markup=cancel_keyboard(),
    )
    return COMPAT_MY_DATE


async def compat_my_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip()
    if not re.match(r"^\d{2}\.\d{2}\.\d{4}$", text):
        await update.message.reply_text("❌ Формат: ДД.ММ.ГГГГ", reply_markup=cancel_keyboard())
        return COMPAT_MY_DATE
    context.user_data["my_date"] = text
    await update.message.reply_text(
        "✅ Принято! Теперь дата рождения партнёра (ДД.ММ.ГГГГ):",
        reply_markup=cancel_keyboard(),
    )
    return COMPAT_PARTNER_DATE


async def compat_partner_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip()
    if not re.match(r"^\d{2}\.\d{2}\.\d{4}$", text):
        await update.message.reply_text("❌ Формат: ДД.ММ.ГГГГ", reply_markup=cancel_keyboard())
        return COMPAT_PARTNER_DATE
    msg = await update.message.reply_text("💑 Считаю совместимость...")
    user_id = update.effective_user.id
    result  = await ai_compatibility(context.user_data.get("my_date", ""), text, update.effective_user.first_name)
    inc_usage(user_id)
    await msg.edit_text(result, reply_markup=main_keyboard())
    await process_points(update, user_id)
    return ConversationHandler.END


# ─────────────────────────────────────────────────────────────────────────────
# CONVERSATION: РАЗБОР ЧАТА
# ─────────────────────────────────────────────────────────────────────────────

async def cmd_chat_analysis(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    user = update.effective_user
    get_or_create_user(user.id, user.username or "", user.first_name or "")
    if not await check_limit(update, user.id):
        return ConversationHandler.END
    await update.effective_message.reply_text(
        "💬 Разбор переписки\n\nСкопируй и вставь текст чата:",
        reply_markup=cancel_keyboard(),
    )
    return CHAT_ANALYSIS_TEXT


async def chat_analysis_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip()
    if len(text) < 10:
        await update.message.reply_text("❌ Слишком короткий текст.", reply_markup=cancel_keyboard())
        return CHAT_ANALYSIS_TEXT
    msg = await update.message.reply_text("🔍 Читаю между строк...")
    user_id = update.effective_user.id
    result  = await ai_chat_analysis(text)
    inc_usage(user_id)
    await msg.edit_text(result, reply_markup=main_keyboard())
    await process_points(update, user_id)
    return ConversationHandler.END


# ─────────────────────────────────────────────────────────────────────────────
# CONVERSATION: ФЛИРТ
# ─────────────────────────────────────────────────────────────────────────────

async def cmd_flirt(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    user = update.effective_user
    get_or_create_user(user.id, user.username or "", user.first_name or "")
    if not await check_limit(update, user.id):
        return ConversationHandler.END
    await update.effective_message.reply_text(
        "✨ Флирт-генератор\n\nНапиши что тебе написал парень — придумаем как ответить:",
        reply_markup=cancel_keyboard(),
    )
    return FLIRT_CONTEXT


async def flirt_context(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text    = update.message.text.strip()
    msg     = await update.message.reply_text("✨ Разбираю ситуацию...")
    user_id = update.effective_user.id
    result  = await ai_flirt(text)
    inc_usage(user_id)
    await msg.edit_text(result, reply_markup=main_keyboard())
    await process_points(update, user_id)
    return ConversationHandler.END


# ─────────────────────────────────────────────────────────────────────────────
# ОТМЕНА
# ─────────────────────────────────────────────────────────────────────────────

async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.clear()
    await update.effective_message.reply_text("❌ Отменено.", reply_markup=main_keyboard())
    return ConversationHandler.END


# ─────────────────────────────────────────────────────────────────────────────
# ГОЛОС И ФОТО
# ─────────────────────────────────────────────────────────────────────────────

async def handle_voice(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "🎤 Голосовое получила! Пока не умею их слушать — напиши текстом 😊",
        reply_markup=main_keyboard(),
    )


async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "📸 Фото получила! Анализ фото пока в разработке 🔮",
        reply_markup=main_keyboard(),
    )


# ─────────────────────────────────────────────────────────────────────────────
# CALLBACK КНОПКИ
# ─────────────────────────────────────────────────────────────────────────────

async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    data  = query.data
    user  = update.effective_user

    if data == "cancel_state":
        context.user_data.clear()
        await query.edit_message_text("❌ Отменено.", reply_markup=main_keyboard())

    elif data == "oracle":
        get_or_create_user(user.id, user.username or "", user.first_name or "")
        if not await check_limit(update, user.id):
            return
        await query.edit_message_text("🌙 Прислушиваюсь к звёздам...")
        result = await ai_daily_oracle(user.first_name)
        inc_usage(user.id)
        await query.edit_message_text(result, reply_markup=main_keyboard())
        await process_points(update, user.id)

    elif data == "compat":
        get_or_create_user(user.id, user.username or "", user.first_name or "")
        if not await check_limit(update, user.id):
            return
        context.user_data["state"] = "compat_my"
        await query.edit_message_text(
            "💑 Расчёт совместимости\n\nШаг 1/2: Напиши свою дату рождения (ДД.ММ.ГГГГ):",
            reply_markup=cancel_keyboard(),
        )

    elif data == "chat":
        get_or_create_user(user.id, user.username or "", user.first_name or "")
        if not await check_limit(update, user.id):
            return
        context.user_data["state"] = "chat_text"
        await query.edit_message_text(
            "💬 Разбор переписки\n\nСкопируй и вставь текст чата:",
            reply_markup=cancel_keyboard(),
        )

    elif data == "flirt":
        get_or_create_user(user.id, user.username or "", user.first_name or "")
        if not await check_limit(update, user.id):
            return
        context.user_data["state"] = "flirt_text"
        await query.edit_message_text(
            "✨ Флирт-генератор\n\nНапиши что тебе написал парень:",
            reply_markup=cancel_keyboard(),
        )

    elif data == "premium":
        await query.edit_message_text(
            "⭐ Премиум — безлимитные запросы\n\n"
            f"1 день — {STARS_DAY} Stars\n"
            f"Месяц — {STARS_MONTH} Stars\n"
            f"Полгода — {STARS_HALFYEAR} Stars\n\n"
            "Выбирай тариф 👇",
            reply_markup=premium_keyboard(),
        )

    elif data in ("buy_day", "buy_month", "buy_halfyear"):
        plan = data.replace("buy_", "")
        await send_invoice(update, context, plan)

    elif data == "ref":
        get_or_create_user(user.id, user.username or "", user.first_name or "")
        code     = get_ref_code(user.id)
        bot_info = await context.bot.get_me()
        link     = f"https://t.me/{bot_info.username}?start=ref={code}"
        await query.edit_message_text(
            f"🔗 Твоя реферальная ссылка:\n\n{link}\n\n"
            f"Пригласи друга — оба получите 3 дня Премиума!\n"
            f"Код: {code}",
            reply_markup=InlineKeyboardMarkup([[
                InlineKeyboardButton("◀️ Назад", callback_data="back_main")
            ]]),
        )

    elif data == "profile":
        get_or_create_user(user.id, user.username or "", user.first_name or "")
        with db() as c:
            row = c.execute("SELECT * FROM users WHERE user_id=?", (user.id,)).fetchone()
        prem       = "⭐ Да" if check_premium(user.id) else "🆓 Нет"
        prem_until = row["premium_until"] or "—"
        used       = today_usage(user.id)
        pts        = row["points"]
        # Для админа показываем дополнительную кнопку
        kb = [
            [InlineKeyboardButton("⭐ Купить Премиум", callback_data="premium")],
            [InlineKeyboardButton("◀️ Назад",          callback_data="back_main")],
        ]
        if user.id == ADMIN_ID:
            kb.insert(0, [InlineKeyboardButton("👑 Создать ссылку на 14 дней", callback_data="gen_adminlink")])

        await query.edit_message_text(
            f"👤 Профиль\n\n"
            f"Имя: {user.first_name}\n"
            f"Премиум: {prem} (до {prem_until})\n"
            f"Очки: {pts}\n"
            f"Использовано сегодня: {used}/{FREE_DAILY_LIMIT}\n"
            f"До бонуса: {BONUS_POINTS_THRESHOLD - (pts % BONUS_POINTS_THRESHOLD)} очков",
            reply_markup=InlineKeyboardMarkup(kb),
        )

    elif data == "gen_adminlink":
        if user.id != ADMIN_ID:
            await query.answer("❌ Нет доступа", show_alert=True)
            return
        admin_ref = get_ref_code(ADMIN_ID)
        token     = create_admin_token()
        bot_info  = await context.bot.get_me()
        link      = f"https://t.me/{bot_info.username}?start=ref={admin_ref}_{token}"
        await query.edit_message_text(
            f"👑 Одноразовая ссылка на 14 дней Премиума:\n\n{link}\n\n"
            f"⚠️ Работает только 1 раз — после использования сгорает.\n"
            f"Для новой ссылки зайди в Профиль снова.",
            reply_markup=InlineKeyboardMarkup([[
                InlineKeyboardButton("◀️ Назад", callback_data="profile")
            ]]),
        )

    elif data == "back_main":
        await query.edit_message_text(
            "🔮 Главное меню — выбирай:",
            reply_markup=main_keyboard(),
        )


# ─────────────────────────────────────────────────────────────────────────────
# ТЕКСТОВЫЕ СОСТОЯНИЯ (через inline-кнопки)
# ─────────────────────────────────────────────────────────────────────────────

async def handle_text_state(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    state   = context.user_data.get("state")
    user    = update.effective_user
    user_id = user.id
    text    = update.message.text.strip()

    if state == "compat_my":
        if not re.match(r"^\d{2}\.\d{2}\.\d{4}$", text):
            await update.message.reply_text("❌ Формат: ДД.ММ.ГГГГ", reply_markup=cancel_keyboard())
            return
        context.user_data["my_date"] = text
        context.user_data["state"]   = "compat_partner"
        await update.message.reply_text(
            "✅ Принято! Теперь дата рождения партнёра (ДД.ММ.ГГГГ):",
            reply_markup=cancel_keyboard(),
        )

    elif state == "compat_partner":
        if not re.match(r"^\d{2}\.\d{2}\.\d{4}$", text):
            await update.message.reply_text("❌ Формат: ДД.ММ.ГГГГ", reply_markup=cancel_keyboard())
            return
        msg = await update.message.reply_text("💑 Считаю совместимость...")
        result = await ai_compatibility(context.user_data.get("my_date", ""), text, user.first_name)
        inc_usage(user_id)
        context.user_data.clear()
        await msg.edit_text(result, reply_markup=main_keyboard())
        await process_points(update, user_id)

    elif state == "chat_text":
        if len(text) < 10:
            await update.message.reply_text("❌ Слишком короткий текст.", reply_markup=cancel_keyboard())
            return
        msg = await update.message.reply_text("🔍 Читаю между строк...")
        result = await ai_chat_analysis(text)
        inc_usage(user_id)
        context.user_data.clear()
        await msg.edit_text(result, reply_markup=main_keyboard())
        await process_points(update, user_id)

    elif state == "flirt_text":
        msg = await update.message.reply_text("✨ Разбираю ситуацию...")
        result = await ai_flirt(text)
        inc_usage(user_id)
        context.user_data.clear()
        await msg.edit_text(result, reply_markup=main_keyboard())
        await process_points(update, user_id)

    else:
        await update.message.reply_text("Выбирай что тебя интересует 👇", reply_markup=main_keyboard())


# ─────────────────────────────────────────────────────────────────────────────
# ADMIN
# ─────────────────────────────────────────────────────────────────────────────

async def cmd_adminref(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Генерирует одноразовую ссылку на 14 дней премиума."""
    if update.effective_user.id != ADMIN_ID:
        await update.message.reply_text("❌ Нет доступа.")
        return
    # Получаем ref_code админа и создаём одноразовый токен
    admin_ref = get_ref_code(ADMIN_ID)
    token = create_admin_token()
    bot_info = await context.bot.get_me()
    # Кодируем: ref=ADMINCODE_TOKEN
    link = f"https://t.me/{bot_info.username}?start=ref={admin_ref}_{token}"
    await update.message.reply_text(
        f"👑 Одноразовая ссылка на 14 дней Премиума:\n\n{link}\n\n"
        f"⚠️ Работает только 1 раз — после использования сгорает.\n"
        f"Для новой ссылки снова напиши /adminref"
    )


async def cmd_admin(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.effective_user.id != ADMIN_ID:
        await update.message.reply_text("❌ Нет доступа.")
        return

    args = context.args
    if not args:
        await update.message.reply_text(
            "/admin grant <id> — Премиум на 30 дней\n"
            "/admin revoke <id> — отозвать Премиум\n"
            "/admin stats — статистика"
        )
        return

    cmd = args[0]
    if cmd == "stats":
        with db() as c:
            total = c.execute("SELECT COUNT(*) FROM users").fetchone()[0]
            prem  = c.execute("SELECT COUNT(*) FROM users WHERE is_premium=1").fetchone()[0]
            reqs  = c.execute(
                "SELECT COALESCE(SUM(count),0) FROM daily_usage WHERE usage_date=?",
                (date.today().isoformat(),)
            ).fetchone()[0]
        await update.message.reply_text(
            f"📊 Статистика:\n"
            f"Пользователей: {total}\n"
            f"Премиум: {prem}\n"
            f"Запросов сегодня: {reqs}"
        )
        return

    if len(args) < 2:
        await update.message.reply_text("Укажи user_id.")
        return

    uid = int(args[1])
    if cmd == "grant":
        grant_premium(uid, days=30)
        await update.message.reply_text(f"✅ Премиум выдан {uid} на 30 дней.")
    elif cmd == "revoke":
        with db() as c:
            c.execute("UPDATE users SET is_premium=0 WHERE user_id=?", (uid,))
        await update.message.reply_text(f"✅ Премиум отозван у {uid}.")


# ─────────────────────────────────────────────────────────────────────────────
# ОШИБКИ
# ─────────────────────────────────────────────────────────────────────────────

async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    logger.error("Ошибка: %s", context.error, exc_info=context.error)
    if isinstance(update, Update) and update.effective_message:
        await update.effective_message.reply_text(
            "⚠️ Что-то пошло не так. Попробуй через минуту.",
            reply_markup=main_keyboard(),
        )

# В функции cmd_compatibility
async def cmd_compatibility(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    user = update.effective_user
    get_or_create_user(user.id, user.username or "", user.first_name or "")
    
    # Проверяем, пришли ли данные из Web App
    if "my_date" in context.user_data and "partner_date" in context.user_data:
        # Данные уже есть, сразу считаем совместимость
        if not await check_limit(update, user.id):
            return ConversationHandler.END
        
        msg = await update.effective_message.reply_text("💑 Считаю совместимость...")
        result = await ai_compatibility(
            context.user_data["my_date"], 
            context.user_data["partner_date"], 
            user.first_name
        )
        inc_usage(user.id)
        await msg.edit_text(result, reply_markup=main_keyboard())
        await process_points(update, user.id)
        return ConversationHandler.END
    
    # Обычный поток
    if not await check_limit(update, user.id):
        return ConversationHandler.END
    await update.effective_message.reply_text(
        "💑 Расчёт совместимости\n\nШаг 1/2: Напиши свою дату рождения (ДД.ММ.ГГГГ):",
        reply_markup=cancel_keyboard(),
    )
    return COMPAT_MY_DATE
# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────# Добавьте в функцию cmd_start обработку параметров:
# Добавьте в функцию cmd_start обработку параметров из Web App:
async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    get_or_create_user(user.id, user.username or "", user.first_name or "")
    
    # Обработка параметров из Web App
    args = context.args
    if args:
        param = args[0]
        
        # Прямой вызов функций из Web App
        if param == "oracle":
            await cmd_oracle(update, context)
            return
        elif param.startswith("compat_"):
            # Формат: compat_ДД.ММ.ГГГГ_ДД.ММ.ГГГГ
            parts = param.split("_")
            if len(parts) >= 3:
                context.user_data["my_date"] = parts[1]
                context.user_data["partner_date"] = parts[2]
                # Запускаем расчёт совместимости
                await cmd_compatibility(update, context)
            return
        elif param.startswith("chat_"):
            # Формат: chat_текст
            text = param[5:]
            context.user_data["chat_text"] = text
            await cmd_chat_analysis(update, context)
            return
        elif param.startswith("flirt_"):
            # Формат: flirt_текст
            text = param[6:]
            context.user_data["flirt_text"] = text
            await cmd_flirt(update, context)
            return
    
    # Обычный старт
    prem_badge = "⭐ Премиум" if check_premium(user.id) else "🆓 Бесплатный"
    
    # Добавляем кнопку для открытия Web App
    keyboard = main_keyboard()
    keyboard.inline_keyboard.append([
        InlineKeyboardButton(
            "🌐 Открыть Web App", 
            web_app=WebAppInfo(url="https://your-domain.com")  # Замените на реальный URL
        )
    ])
    
    await update.message.reply_text(
        f"🔮 Привет, {user.first_name}! Я твой оракул по любви и флирту.\n\n"
        f"Статус: {prem_badge}\n\n"
        f"Что умею:\n"
        f"🌙 Расклад дня\n"
        f"💑 Совместимость по датам\n"
        f"💬 Разбор переписки\n"
        f"✨ Флирт-генератор\n\n"
        f"Бесплатно: {FREE_DAILY_LIMIT} запросов в день\n"
        f"⭐ Премиум: безлимит за Stars\n\n"
        f"Выбирай 👇",
        reply_markup=keyboard,
    )


async def cmd_webapp(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Отправляет кнопку с Web App"""
    keyboard = [[
        InlineKeyboardButton(
            "🌐 Открыть Web App",
            web_app=WebAppInfo(url="https://your-domain.com")  # URL вашего сайта
        )
    ]]
    await update.message.reply_text(
        "Открой мобильную версию:",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )
def main() -> None:
    app.add_handler(MessageHandler(filters.StatusUpdate.WEB_APP_DATA, handle_web_app_data))
    init_db()
    logger.info("Запуск AI Dating Oracle Bot...")

    app = ApplicationBuilder().token(BOT_TOKEN).concurrent_updates(True).build()

    compat_conv = ConversationHandler(
        entry_points=[CommandHandler("compatibility", cmd_compatibility)],
        states={
            COMPAT_MY_DATE:      [MessageHandler(filters.TEXT & ~filters.COMMAND, compat_my_date)],
            COMPAT_PARTNER_DATE: [MessageHandler(filters.TEXT & ~filters.COMMAND, compat_partner_date)],
        },
        fallbacks=[CommandHandler("cancel", cancel), CallbackQueryHandler(cancel, pattern="^cancel_state$")],
        allow_reentry=True,
    )
    chat_conv = ConversationHandler(
        entry_points=[CommandHandler("chat_analysis", cmd_chat_analysis)],
        states={
            CHAT_ANALYSIS_TEXT: [MessageHandler(filters.TEXT & ~filters.COMMAND, chat_analysis_text)],
        },
        fallbacks=[CommandHandler("cancel", cancel), CallbackQueryHandler(cancel, pattern="^cancel_state$")],
        allow_reentry=True,
    )
    flirt_conv = ConversationHandler(
        entry_points=[CommandHandler("flirt", cmd_flirt)],
        states={
            FLIRT_CONTEXT: [MessageHandler(filters.TEXT & ~filters.COMMAND, flirt_context)],
        },
        fallbacks=[CommandHandler("cancel", cancel), CallbackQueryHandler(cancel, pattern="^cancel_state$")],
        allow_reentry=True,
    )

    app.add_handler(CommandHandler("start",   cmd_start))
    app.add_handler(CommandHandler("help",    cmd_help))
    app.add_handler(CommandHandler("oracle",  cmd_oracle))
    app.add_handler(CommandHandler("premium", cmd_premium))
    app.add_handler(CommandHandler("admin",   cmd_admin))
    app.add_handler(CommandHandler("adminref", cmd_adminref))
    app.add_handler(compat_conv)
    app.add_handler(chat_conv)
    app.add_handler(flirt_conv)
    app.add_handler(PreCheckoutQueryHandler(pre_checkout_handler))
    app.add_handler(MessageHandler(filters.SUCCESSFUL_PAYMENT, successful_payment_handler))
    app.add_handler(CallbackQueryHandler(button_handler))
    app.add_handler(MessageHandler(filters.VOICE, handle_voice))
    app.add_handler(MessageHandler(filters.PHOTO, handle_photo))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text_state))
    app.add_error_handler(error_handler)

    logger.info("✅ Бот запущен!")
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()