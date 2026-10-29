// Генерує вбудовані стікер-паки: SVG-файли у client/public/stickers + сід-міграцію.
// Запуск: node tools/generate-stickers.mjs
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ANIMS, stickerSvg } from './sticker-art.mjs';

const OUT_ROOT = path.resolve('client/public/stickers');
const SEED_FILE = path.resolve('database/migrations/007_sticker_seed.sql');

const CATEGORY_NAMES = {
  emotions: 'Емоції',
  memes: 'Меми',
  animals: 'Тварини',
  games: 'Ігри',
  holidays: 'Свята',
  anime: 'Аніме',
  reactions: 'Реакції',
};

// [slug, label, eyes, mouth, brows, prop, flags]
// flags: blush | paws | sit | dance | shrug | tilt:<deg> | <animation>
const PACKS = [
  { slug: 'smiles', cat: 'emotions', name: 'Усмішки', desc: 'Базовий набір настроїв Містона.', hue: '#FDE68A', anim: 'bounce', items: [
    ['grin', 'Широка усмішка', 'happy', 'bigsmile', 'raised', '', 'blush'],
    ['hello', 'Привіт', 'wide', 'smile', 'none', '', ''],
    ['wink', 'Подмигування', 'wink', 'smile', 'raised', '', ''],
    ['content', 'Задоволення', 'closed', 'catw', 'none', '', 'blush'],
    ['cheer', 'Святкування', 'star', 'bigsmile', 'none', 'partyhat', 'blush'],
    ['delighted', 'В захваті', 'heart', 'grin', 'raised', 'heart', ''],
    ['shy', 'Збентеження', 'side', 'smile', 'worried', '', 'blush'],
    ['proud', 'Гордість', 'dots', 'smile', 'raised', 'crown', 'paws'],
  ] },
  { slug: 'tears', cat: 'emotions', name: 'Сльози', desc: 'Коли сумно, ображено або жалко.', hue: '#BFDBFE', anim: 'float', items: [
    ['cry', 'Сльози', 'closed', 'wavy', 'worried', 'tears', ''],
    ['sob', 'Ридання', 'swirl', 'scream', 'worried', 'waterfall', 'shake'],
    ['upset', 'Образа', 'side', 'pout', 'worried', '', 'blush'],
    ['hurt', 'Біль', 'closed', 'wavy', 'angry', 'brokenheart', ''],
    ['lonely', 'Самотність', 'dots', 'flat', 'worried', 'moon', 'sit'],
    ['whine', 'Ной', 'wide', 'scream', 'worried', 'sweat', ''],
    ['teary', 'Надрікання', 'happy', 'wavy', 'worried', 'tears', 'blush'],
    ['relief', 'Полегшення', 'closed', 'smile', 'none', 'sweat', ''],
  ] },
  { slug: 'angry', cat: 'emotions', name: 'Злість', desc: 'Роздратування та гнів без кулаків.', hue: '#FCA5A5', anim: 'shake', items: [
    ['mad', 'Злість', 'flat', 'flat', 'angry', '', ''],
    ['furious', 'Лютість', 'laser', 'fang', 'angry', 'fire', 'dance'],
    ['annoyed', 'Роздратування', 'dots', 'wavy', 'angry', 'sweat', ''],
    ['grumble', 'Бурчання', 'side', 'bite', 'angry', '', ''],
    ['explode', 'Скаження', 'swirl', 'scream', 'angry', 'bolt', 'shake'],
    ['disagree', 'Не згоден', 'flat', 'flat', 'angry', 'xmark', ''],
    ['glare', 'Погляд', 'wide', 'flat', 'angry', '', 'tilt:-6'],
    ['stubborn', 'Упертість', 'dots', 'pout', 'angry', '', 'paws'],
  ] },
  { slug: 'calm', cat: 'emotions', name: 'Спокій', desc: 'Тихий, рівний настрій.', hue: '#A7F3D0', anim: '', items: [
    ['ok', 'Добре', 'closed', 'smile', 'none', '', ''],
    ['zen', 'Дзен', 'closed', 'catw', 'none', 'sparkles', 'sit'],
    ['sleepy', 'Сонливість', 'sleepy', 'pout', 'none', 'zzz', ''],
    ['cozy', 'Затишок', 'happy', 'catw', 'none', 'cup', 'paws'],
    ['bored', 'Нудьга', 'flat', 'flat', 'none', '', 'sit'],
    ['thinking', 'Думаю', 'side', 'flat', 'raised', '', ''],
    ['hopeful', 'Сприйняття', 'sparkle', 'smile', 'none', 'star', ''],
    ['fine', 'Нормально', 'dots', 'smile', 'flat', '', ''],
  ] },
  { slug: 'lol', cat: 'memes', name: 'ЛоЛ', desc: 'Класичні меми сміху.', hue: '#FDBA74', anim: 'bounce', items: [
    ['rofl', 'Котиться від сміху', 'closed', 'bigsmile', 'none', '', 'tilt:24'],
    ['lmao', 'ЛМАО', 'wide', 'scream', 'raised', 'arrows', 'dance'],
    ['dead', 'Я помер', 'dots', 'flat', 'none', 'skull', 'tilt:90'],
    ['holdit', 'Тримаюсь', 'side', 'bite', 'flat', '', 'paws'],
    ['troll', 'Троль', 'sparkle', 'grin', 'raised', '', 'tilt:-10'],
    ['based', 'Базовано', 'flat', 'smile', 'flat', 'bolt'],
    ['cringe', 'Крінж', 'swirl', 'wavy', 'worried', '', 'tilt:14'],
    ['owned', 'Влучно', 'laser', 'fang', 'angry', 'check', ''],
  ] },
  { slug: 'sarcasm', cat: 'memes', name: 'Сарказм', desc: 'Іронія, сарказм та незворушність.', hue: '#C4B5FD', anim: '', items: [
    ['slowclap', 'Аплодисменти', 'flat', 'flat', 'raised', 'sparkles', 'dance'],
    ['unimpressed', 'Не вражено', 'flat', 'flat', 'flat', '', ''],
    ['sure', 'Звісно', 'side', 'catw', 'raised', '', 'tilt:8'],
    ['oops', 'Ой', 'wide', 'wavy', 'raised', 'arrows', 'shrug'],
    ['excuse', 'Перепрошую', 'dots', 'flat', 'angry', 'xmark', ''],
    ['sus', 'Підозріло', 'side', 'bite', 'worried', '', 'tilt:-12'],
    ['and-what', 'І що?', 'flat', 'pout', 'raised', '', 'sit'],
    ['brb', 'Зараз повернусь', 'closed', 'smile', 'none', 'ghost', 'float'],
  ] },
  { slug: 'derp', cat: 'memes', name: 'Дерп', desc: 'Дивні обличчя та абсурд.', hue: '#F9A8D4', anim: 'swing', items: [
    ['derp', 'Дерп', 'swirl', 'tongue', 'none', '', 'tilt:12'],
    ['boop', 'Бу', 'wide', 'pout', 'none', 'paw', ''],
    ['confused', 'Розгубленість', 'swirl', 'wavy', 'worried', 'arrows', ''],
    ['trance', 'Транс', 'laser', 'catw', 'none', 'sparkles', 'pulse'],
    ['meme', 'Мем', 'heart', 'tongue', 'raised', 'music', 'dance'],
    ['wowish', 'Ого', 'sparkle', 'open', 'raised'],
    ['nonsense', 'Абсурд', 'side', 'tongue', 'flat', 'zzz', 'wiggle'],
    ['silly', 'Дурнуватість', 'wink', 'tongue', 'none', '', 'tilt:-14'],
  ] },
  { slug: 'mood', cat: 'memes', name: 'Настрій', desc: 'Короткі реакції на життєві моменти.', hue: '#94A3B8', anim: '', items: [
    ['mood', 'Мій настрій', 'flat', 'flat', 'none', 'moon', 'sit'],
    ['monday', 'Понеділок', 'sleepy', 'pout', 'worried', 'zzz', ''],
    ['friday', 'Пʼятниця', 'happy', 'bigsmile', 'raised', 'music', 'dance'],
    ['tired', 'Втомлення', 'closed', 'flat', 'worried', '', 'sit'],
    ['busy', 'Завалений', 'swirl', 'wavy', 'angry', 'arrows', 'shake'],
    ['vibes', 'Вайб', 'sparkle', 'smile', 'none', 'sparkles', 'float'],
    ['nope', 'Ні чуток', 'flat', 'flat', 'angry', 'xmark'],
    ['yolo', 'Йоло', 'star', 'fang', 'raised', 'bolt', 'dance'],
  ] },
  { slug: 'kittens', cat: 'animals', name: 'Кошенята', desc: 'Милі мордочки та лапки.', hue: '#FCD34D', anim: 'wiggle', items: [
    ['kitten', 'Кошеня', 'wide', 'catw', 'none', '', 'blush'],
    ['pawsup', 'Лапки вгору', 'happy', 'open', 'raised', 'paw', 'dance'],
    ['curious', 'Цікавість', 'sparkle', 'pout', 'raised', '', 'tilt:-8'],
    ['purring', 'Мурчання', 'closed', 'catw', 'none', 'heart', 'pulse'],
    ['hiding', 'Сховки', 'side', 'flat', 'worried', 'ghost', 'sit'],
    ['zoomies', 'Зуміс', 'laser', 'grin', 'none', 'arrows', 'shake'],
    ['milk', 'Молоко', 'wide', 'tongue', 'none', 'cup', 'paws'],
    ['nap', 'Сон', 'sleepy', 'catw', 'none', 'zzz', 'float'],
  ] },
  { slug: 'wild', cat: 'animals', name: 'Хижак', desc: 'Кіготі, ікла та полювання.', hue: '#FDBA74', anim: '', items: [
    ['roar', 'Рик', 'wide', 'fang', 'angry', '', 'dance'],
    ['hunt', 'Полювання', 'side', 'fang', 'flat', 'sword', ''],
    ['claws', 'Кігті', 'dots', 'grin', 'angry', 'paw', 'paws'],
    ['stalker', 'Стеження', 'flat', 'flat', 'angry', 'moon', 'sit'],
    ['alpha', 'Ватак', 'star', 'fang', 'raised', 'crown', 'sit'],
    ['pounce', 'Стрибок', 'laser', 'open', 'none', 'bolt', 'tilt:-18'],
    ['territory', 'Територія', 'dots', 'flat', 'angry', 'xmark', ''],
    ['howl', 'Уіння', 'closed', 'open', 'worried', 'moon', 'tilt:-10'],
  ] },
  { slug: 'farm', cat: 'animals', name: 'Ферма', desc: 'Сільські будні та врожай.', hue: '#BEF264', anim: '', items: [
    ['morning', 'Ранок', 'sparkle', 'smile', 'none', 'star'],
    ['harvest', 'Урожай', 'happy', 'bigsmile', 'none', 'gift', 'paws'],
    ['moo', 'Муу', 'side', 'flat', 'flat', 'note', 'sit'],
    ['sleepbarn', 'Сарай', 'closed', 'pout', 'none', 'zzz', 'sit'],
    ['tractor', 'Трактор', 'wide', 'grin', 'none', 'arrows', 'shake'],
    ['chick', 'Курча', 'dots', 'open', 'none', '', 'tilt:10'],
    ['pitchfork', 'Вили', 'flat', 'wavy', 'angry', 'sword', ''],
    ['milkbucket', 'Молоко', 'wink', 'tongue', 'none', 'cup', 'paws'],
  ] },
  { slug: 'sea', cat: 'animals', name: 'Море', desc: 'Хвилі, вода та відпочинок.', hue: '#7DD3FC', anim: '', items: [
    ['dive', 'Ниряння', 'wide', 'open', 'none', 'arrows', 'tilt:40'],
    ['swim', 'Плавання', 'happy', 'smile', 'none', '', 'wiggle'],
    ['wave', 'Хвиля', 'side', 'smile', 'none', 'snowflake', 'swing'],
    ['beach', 'Пляж', 'sparkle', 'bigsmile', 'none', 'star', 'blush'],
    ['splash', 'Бризки', 'swirl', 'scream', 'none', 'sweat', 'shake'],
    ['deep', 'Глибінь', 'dots', 'flat', 'none', 'moon', 'float'],
    ['fish', 'Рибка', 'wink', 'pout', 'none', 'paw', ''],
    ['storm', 'Шторм', 'laser', 'wavy', 'angry', 'bolt', 'shake'],
  ] },
  { slug: 'play', cat: 'games', name: 'Гей', desc: 'Запуск ігор та ігровий настрій.', hue: '#C7D2FE', anim: 'pulse', items: [
    ['start', 'Старт', 'star', 'grin', 'raised', 'check', ''],
    ['ready', 'Готовий', 'wide', 'smile', 'flat', 'bolt', 'paws'],
    ['afk', 'АФК', 'sleepy', 'flat', 'none', 'zzz', 'sit'],
    ['lag', 'Лаг', 'swirl', 'wavy', 'worried', 'arrows', 'shake'],
    ['carry', 'Керрі', 'laser', 'fang', 'angry', 'sword', 'dance'],
    ['noob', 'Нуб', 'dots', 'pout', 'worried', '', ''],
    ['gg', 'ГГ', 'happy', 'smile', 'none', 'check', 'paws'],
    ['ranked', 'Рейтинг', 'side', 'bite', 'flat', 'trophy', ''],
  ] },
  { slug: 'win', cat: 'games', name: 'Перемога', desc: 'Тільки перше місце.', hue: '#FDE047', anim: 'bounce', items: [
    ['victory', 'Перемога', 'star', 'bigsmile', 'raised', 'trophy', 'dance'],
    ['number1', 'Перший', 'heart', 'grin', 'none', 'crown', 'paws'],
    ['clutch', 'Клатч', 'laser', 'fang', 'angry', 'bolt', ''],
    ['flex', 'Флекс', 'side', 'catw', 'raised', 'sparkles', 'sit'],
    ['record', 'Рекорд', 'wide', 'bigsmile', 'raised', 'check', ''],
    ['champ', 'Чемпіон', 'sparkle', 'grin', 'none', 'partyhat', 'blush'],
    ['unreal', 'Неймовірно', 'sparkle', 'open', 'raised', 'star', ''],
    ['ez', 'Ізі', 'flat', 'smile', 'flat', 'paw', 'tilt:6'],
  ] },
  { slug: 'lose', cat: 'games', name: 'Програш', desc: 'Поразки, тихі та гучні.', hue: '#CBD5E1', anim: 'float', items: [
    ['defeat', 'Поразка', 'closed', 'wavy', 'worried', '', 'sit'],
    ['ragequit', 'Регеквіт', 'laser', 'scream', 'angry', 'xmark', 'shake'],
    ['unlucky', 'Нещастя', 'dots', 'flat', 'worried', 'moon', ''],
    ['blame', 'Не я', 'side', 'wavy', 'angry', 'arrows', 'shrug'],
    ['sad', 'Сумно', 'closed', 'pout', 'worried', 'tears', ''],
    ['retry', 'Ще раз', 'wide', 'smile', 'raised', 'bolt', 'paws'],
    ['tilt', 'Тільт', 'swirl', 'fang', 'angry', 'fire', 'shake'],
    ['report', 'Репорт', 'flat', 'flat', 'angry', 'skull', ''],
  ] },
  { slug: 'sport', cat: 'games', name: 'Спорт', desc: 'Тренування, мʼяч і фініш.', hue: '#86EFAC', anim: 'swing', items: [
    ['goal', 'Гол', 'star', 'bigsmile', 'none', 'ball', 'dance'],
    ['run', 'Біг', 'wide', 'open', 'none', 'arrows', 'tilt:-10'],
    ['pass', 'Пас', 'side', 'smile', 'none', 'ball', 'paws'],
    ['foul', 'Фол', 'flat', 'flat', 'angry', 'xmark', ''],
    ['coach', 'Тренер', 'dots', 'bite', 'angry', 'note'],
    ['finish', 'Фініш', 'laser', 'grin', 'raised', 'trophy', 'shake'],
    ['warmup', 'Розминка', 'happy', 'catw', 'none', 'fire', 'sit'],
    ['gold', 'Золото', 'heart', 'grin', 'none', 'star', 'pulse'],
  ] },
  { slug: 'newyear', cat: 'holidays', name: 'Новий рік', desc: 'Ялинка, сніг і святкове небо.', hue: '#A5F3FC', anim: 'float', items: [
    ['tree', 'Ялинка', 'sparkle', 'smile', 'none', 'gift', 'sit'],
    ['snowman', 'Сніговик', 'dots', 'smile', 'none', 'snowflake', 'blush'],
    ['countdown', 'Відлік', 'wide', 'open', 'raised', 'star'],
    ['fireworks', 'Фейєрверки', 'star', 'bigsmile', 'none', 'sparkles', 'shake'],
    ['tangerines', 'Мандарини', 'happy', 'catw', 'none', 'candy', ''],
    ['gifts', 'Подарунки', 'heart', 'grin', 'none', 'gift', 'paws'],
    ['midnight', 'Північ', 'sleepy', 'smile', 'none', 'moon', 'float'],
    ['cheers', 'З привітом', 'sparkle', 'bigsmile', 'raised', 'cup'],
  ] },
  { slug: 'birthday', cat: 'holidays', name: 'День народження', desc: 'Торт, свічки та привітання.', hue: '#FBCFE8', anim: 'bounce', items: [
    ['cake', 'Торт', 'heart', 'bigsmile', 'none', 'candy', ''],
    ['candles', 'Свічки', 'wide', 'open', 'raised', 'fire', ''],
    ['party', 'Вечірка', 'star', 'grin', 'none', 'partyhat', 'dance'],
    ['gifted', 'Отримав', 'sparkle', 'catw', 'none', 'gift', 'blush'],
    ['age', 'Вік', 'side', 'wavy', 'worried', 'book', ''],
    ['balloons', 'Кулі', 'happy', 'smile', 'none', 'hearts', 'float'],
    ['hugs', 'Обійми', 'closed', 'catw', 'none', 'heart', 'pulse'],
    ['wish', 'Бажання', 'sparkle', 'smile', 'none', 'star', ''],
  ] },
  { slug: 'halloween', cat: 'holidays', name: 'Гелловін', desc: 'Страшно, але смішно.', hue: '#D8B4FE', anim: 'swing', items: [
    ['spooky', 'Жах', 'wide', 'scream', 'worried', 'ghost', 'float'],
    ['boo', 'Бу!', 'sparkle', 'open', 'none', 'ghost', 'shake'],
    ['pumpkin', 'Гарбуз', 'dots', 'grin', 'flat', 'fire', ''],
    ['skullface', 'Щелепа', 'flat', 'fang', 'angry', 'skull', ''],
    ['candytime', 'Цукерки', 'heart', 'tongue', 'none', 'candy', 'paws'],
    ['night', 'Ніч', 'sleepy', 'flat', 'none', 'moon', ''],
    ['costume', 'Костюм', 'wink', 'smile', 'none', 'partyhat', 'blush'],
    ['scared', 'Страх', 'swirl', 'scream', 'worried', 'bolt', 'shake'],
  ] },
  { slug: 'valentine', cat: 'holidays', name: 'День святого Валентина', desc: 'Сердечки та зізнання.', hue: '#FCA5A5', anim: 'heartbeat', items: [
    ['inlove', 'Закоханість', 'heart', 'smile', 'none', 'hearts', ''],
    ['date', 'Побачення', 'wink', 'grin', 'raised', 'candy', 'paws'],
    ['blush2', 'Рум\u2019янець', 'side', 'catw', 'none', 'heart', 'blush'],
    ['kiss', 'Поцілунок', 'closed', 'pout', 'none', 'heart', 'tilt:8'],
    ['ring', 'Кільце', 'sparkle', 'bigsmile', 'raised', 'gift', ''],
    ['cuddle', 'Кучерявість', 'closed', 'catw', 'none', '', 'sit'],
    ['sadheart', 'Розбито', 'swirl', 'wavy', 'worried', 'brokenheart', 'float'],
    ['forever', 'Назавжди', 'heart', 'grin', 'none', 'star', 'pulse'],
  ] },
  { slug: 'kawaii', cat: 'anime', name: 'Кавай', desc: 'Мила аніме-естетика.', hue: '#F5D0FE', anim: 'pulse', items: [
    ['cute', 'Куте', 'sparkle', 'catw', 'none', 'sparkles', 'blush'],
    ['uwu', 'Уву', 'happy', 'catw', 'none', 'heart', 'blush'],
    ['owo', 'Ово', 'wide', 'open', 'raised', '', 'tilt:-6'],
    ['baka', 'Бака', 'laser', 'fang', 'angry', 'xmark', 'shake'],
    ['senpai', 'Сенпай', 'side', 'smile', 'worried', 'heart', 'blush'],
    ['moe', 'Мілі', 'heart', 'bigsmile', 'none', 'hearts', 'bounce'],
    ['small', 'Малюк', 'dots', 'pout', 'none', '', 'tilt:12'],
    ['sparkly', 'Сяйво', 'sparkle', 'grin', 'raised', 'star', 'float'],
  ] },
  { slug: 'shonen', cat: 'anime', name: 'Сьонен', desc: 'Дух бою та перемоги.', hue: '#FDBA74', anim: 'shake', items: [
    ['power', 'Сила', 'laser', 'fang', 'angry', 'bolt', 'dance'],
    ['training', 'Тренування', 'flat', 'bite', 'angry', 'fire', 'paws'],
    ['friendship', 'Дружба', 'happy', 'smile', 'none', 'heart', 'sit'],
    ['transformation', 'Трансформація', 'star', 'scream', 'raised', 'sparkles', 'spin'],
    ['finalform', 'Фінальна форма', 'swirl', 'grin', 'angry', 'sword', ''],
    ['promise', 'Обіцянка', 'closed', 'smile', 'none', 'check', 'blush'],
    ['rival', 'Суперник', 'side', 'flat', 'angry', 'xmark', 'tilt:-10'],
    ['awakening', 'Пробудження', 'sparkle', 'open', 'raised', 'bolt', 'pulse'],
  ] },
  { slug: 'magical', cat: 'anime', name: 'Магія', desc: 'Зілля, палички та закляття.', hue: '#C4B5FD', anim: 'float', items: [
    ['cast', 'Закляття', 'star', 'smile', 'none', 'wand', ''],
    ['potion', 'Зілля', 'swirl', 'wavy', 'worried', 'pills', ''],
    ['spellbook', 'Книга', 'dots', 'flat', 'flat', 'book', 'sit'],
    ['familiar', 'Фаміліар', 'wide', 'catw', 'none', 'paw', ''],
    ['transformed', 'Перетворення', 'sparkle', 'open', 'none', 'sparkles', 'spin'],
    ['shield', 'Щит', 'flat', 'grin', 'none', 'check', 'paws'],
    ['mana', 'Мана', 'side', 'pout', 'worried', 'sweat'],
    ['stardust', 'Зоряний пил', 'heart', 'bigsmile', 'none', 'star', 'pulse'],
  ] },
  { slug: 'chibi', cat: 'anime', name: 'Чібі', desc: 'Маленькі емоції у великих очах.', hue: '#BAE6FD', anim: '', items: [
    ['tiny', 'Крихта', 'wide', 'pout', 'none'],
    ['shock', 'Шок', 'sparkle', 'scream', 'raised', 'bolt', 'shake'],
    ['panic', 'Паніка', 'swirl', 'scream', 'worried', 'arrows', 'shake'],
    ['happy2', 'Щастя', 'happy', 'bigsmile', 'none', 'heart', 'bounce'],
    ['sulk', 'Дується', 'side', 'pout', 'angry', '', 'sit'],
    ['excited', 'Збудження', 'star', 'open', 'raised', 'sparkles', 'dance'],
    ['aww', 'Ав', 'heart', 'catw', 'none', '', 'blush'],
    ['sleepy2', 'Хоче спати', 'sleepy', 'catw', 'none', 'zzz', 'float'],
  ] },
  { slug: 'yes', cat: 'reactions', name: 'Так', desc: 'Згода та підтримка.', hue: '#86EFAC', anim: '', items: [
    ['yes', 'Так', 'happy', 'smile', 'none', 'check', ''],
    ['ok2', 'Ок', 'dots', 'smile', 'flat', 'check', 'paws'],
    ['sure2', 'Звичайно', 'side', 'grin', 'raised', 'check', ''],
    ['support', 'Підтримую', 'heart', 'bigsmile', 'none', 'heart', 'pulse'],
    ['like', 'Лайк', 'sparkle', 'smile', 'none', 'paw', ''],
    ['agree', 'Згоден', 'wide', 'grin', 'flat', 'check', 'sit'],
    ['send', 'Кидай', 'laser', 'grin', 'none', 'arrows', 'dance'],
    ['deal', 'Угода', 'happy', 'catw', 'none', 'check', 'paws'],
  ] },
  { slug: 'no', cat: 'reactions', name: 'Ні', desc: 'Відмова та заперечення.', hue: '#FCA5A5', anim: '', items: [
    ['no', 'Ні', 'flat', 'flat', 'angry', 'xmark', ''],
    ['noreply', 'Без варіантів', 'dots', 'flat', 'angry', 'xmark', 'tilt:-8'],
    ['stop', 'Стій', 'laser', 'bite', 'angry', 'xmark', 'paws'],
    ['doubt', 'Сумнів', 'side', 'wavy', 'worried', '', 'tilt:6'],
    ['reject', 'Відхилено', 'flat', 'flat', 'flat', 'xmark', 'sit'],
    ['later', 'Потім', 'sleepy', 'flat', 'none', 'zzz', ''],
    ['notme', 'Не я', 'swirl', 'wavy', 'worried', 'arrows', 'shrug'],
    ['hard', 'Важко', 'dots', 'wavy', 'worried', 'sweat', ''],
  ] },
  { slug: 'wow', cat: 'reactions', name: 'Ом', desc: 'Здивування та захват.', hue: '#FDE68A', anim: 'pulse', items: [
    ['wow', 'Ом!', 'wide', 'open', 'raised', '', ''],
    ['shocked', 'Шокований', 'sparkle', 'scream', 'raised', 'bolt', 'shake'],
    ['impressive', 'Вражаюче', 'star', 'bigsmile', 'none', 'star', 'bounce'],
    ['what', 'Що?', 'swirl', 'open', 'raised', 'arrows', ''],
    ['speechless', 'Без слів', 'dots', 'flat', 'raised', '', 'tilt:10'],
    ['fire2', 'Вогонь', 'laser', 'fang', 'none', 'fire', 'pulse'],
    ['iconic', 'Іконічно', 'heart', 'grin', 'none', 'sparkles', 'float'],
    ['gasp', 'Ой', 'wide', 'scream', 'worried', 'heart'],
  ] },
  { slug: 'thanks', cat: 'reactions', name: 'Дякую', desc: 'Подяка та привітання.', hue: '#FBCFE8', anim: '', items: [
    ['thanks', 'Дякую', 'happy', 'smile', 'none', 'heart', 'paws'],
    ['tyvm', 'Велике дякую', 'heart', 'bigsmile', 'raised', 'hearts', 'bounce'],
    ['welcome', 'Завжди ласка', 'wink', 'catw', 'none', 'sparkles', ''],
    ['sorry', 'Перепрошую', 'closed', 'pout', 'worried', '', 'tilt:8'],
    ['np', 'Нема за що', 'dots', 'smile', 'flat', 'check', 'shrug'],
    ['hi', 'Привіт', 'sparkle', 'grin', 'raised', 'paw', 'dance'],
    ['bye', 'Бувай', 'side', 'smile', 'none', 'arrows', 'float'],
    ['hug', 'Обійми', 'closed', 'catw', 'none', 'heart', 'sit'],
  ] },
];

function parseFlags(flags) {
  const out = {};
  for (const token of String(flags || '').split(' ').filter(Boolean)) {
    if (token === 'blush') out.blush = true;
    else if (['paws', 'sit', 'dance', 'shrug'].includes(token)) out.body = token;
    else if (token.startsWith('tilt:')) out.tilt = Number(token.slice(5));
    else if (ANIMS[token]) out.anim = token;
    else throw new Error(`Невідомий флаг у наборі: ${token}`);
  }
  return out;
}

function validate() {
  const slugs = new Set();
  for (const pack of PACKS) {
    if (slugs.has(pack.slug)) throw new Error(`Дубль slug набору: ${pack.slug}`);
    slugs.add(pack.slug);
    if (!CATEGORY_NAMES[pack.cat]) throw new Error(`Невідома категорія: ${pack.cat}`);
    if (pack.items.length < 6) throw new Error(`Надто мало стікерів у ${pack.slug}`);
    const seen = new Set();
    for (const item of pack.items) {
      const [slug, label] = item;
      if (seen.has(slug)) throw new Error(`Дубль ${slug} у ${pack.slug}`);
      seen.add(slug);
      if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`Некоректний slug: ${slug}`);
      if (label !== label.trim() || /  /.test(label)) throw new Error(`Некоректне ім'я: ${label}`);
    }
  }
}

const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;

function keywordsFor(label, slug, pack) {
  return `${label.toLowerCase()} ${slug.replace(/-/g, ' ')} ${pack.name.toLowerCase()} ${CATEGORY_NAMES[pack.cat].toLowerCase()}`.replace(/\s+/g, ' ').trim();
}

async function emit() {
  validate();
  await rm(OUT_ROOT, { recursive: true, force: true });
  const packRows = [];
  const stickerRows = [];
  let packOrder = 0;
  for (const pack of PACKS) {
    packOrder += 1;
    const dir = path.join(OUT_ROOT, pack.cat, pack.slug);
    await mkdir(dir, { recursive: true });
    let cover = '';
    let animated = 0;
    for (const [index, item] of pack.items.entries()) {
      const [slug, label, eyes, mouth, brows, prop, flags] = item;
      const parsed = parseFlags(flags);
      const spec = {
        label,
        hue: pack.hue,
        bg: pack.bg,
        eyes,
        mouth,
        brows: brows || 'none',
        prop: prop || '',
        ...parsed,
        anim: parsed.anim || pack.anim || '',
      };
      const asset = `/stickers/${pack.cat}/${pack.slug}/${slug}.svg`;
      await writeFile(path.join(dir, `${slug}.svg`), stickerSvg(spec), 'utf8');
      if (!cover) cover = asset;
      stickerRows.push([pack.slug, slug, label, keywordsFor(label, slug, pack), asset, spec.anim || '', index]);
      if (spec.anim) animated += 1;
    }
    packRows.push([pack.slug, pack.name, pack.desc, pack.cat, cover, packOrder, animated > 0]);
  }

  const packValues = packRows.map(([slug, name, desc, cat, cover, order, animated]) =>
    `  (${quote(slug)}, ${quote(name)}, ${quote(desc)}, ${quote(cat)}, ${quote(cover)}, ${order}, ${animated ? 'true' : 'false'})`).join(',\n');
  const stickerValues = stickerRows.map(([pack, slug, label, kw, asset, anim, order]) =>
    `  (${quote(pack)}, ${quote(slug)}, ${quote(label)}, ${quote(kw)}, ${quote(asset)}, ${quote(anim)}, ${order})`).join(',\n');

  const sql = `-- Фаза 6: сід вбудованих стікер-паків.
-- Згенеровано tools/generate-stickers.mjs — не редагуйте вручну, оновіть скрипт і перезапустіть.

INSERT INTO sticker_packs (slug, name, description, category, cover_asset, sort_order, is_animated)
VALUES
${packValues}
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    cover_asset = EXCLUDED.cover_asset,
    sort_order = EXCLUDED.sort_order,
    is_animated = EXCLUDED.is_animated;

INSERT INTO stickers (pack_id, slug, label, keywords, asset, animation, sort_order)
SELECT pack.id, entry.slug, entry.label, entry.keywords, entry.asset, entry.animation, entry.ord
FROM (
  VALUES
${stickerValues}
) AS entry(pack_slug, slug, label, keywords, asset, animation, ord)
JOIN sticker_packs pack ON pack.slug = entry.pack_slug
ON CONFLICT (pack_id, slug) DO UPDATE
SET label = EXCLUDED.label,
    keywords = EXCLUDED.keywords,
    asset = EXCLUDED.asset,
    animation = EXCLUDED.animation,
    sort_order = EXCLUDED.sort_order;
`;
  await writeFile(SEED_FILE, sql, 'utf8');
  console.log(`Наборів: ${packRows.length} (анімованих ${packRows.filter((row) => row[6]).length}), стікерів: ${stickerRows.length} (анімованих ${stickerRows.filter((row) => row[5]).length})`);
}

await emit();
