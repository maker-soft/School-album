const clone = (value) => JSON.parse(JSON.stringify(value));
const $ = (selector) => document.querySelector(selector);
const ws = $('#workspace');
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

let data = clone(window.DEFAULT_CONTENT);
let tab = 'dashboard';
let db = null;
let currentUser = null;

function isConfigured() {
  const cfg = window.SITE_CONFIG || {};
  return /^https:\/\/.+\.supabase\.co$/.test(cfg.SUPABASE_URL || '')
    && cfg.SUPABASE_PUBLISHABLE_KEY
    && !cfg.SUPABASE_PUBLISHABLE_KEY.includes('YOUR_');
}

function showLoginMessage(message, isError = false) {
  const node = $('#loginStatus');
  node.textContent = message;
  node.style.color = isError ? '#a03f3f' : '';
}

function toast(text) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = text;
  document.body.append(node);
  setTimeout(() => node.remove(), 2800);
}

function setSavingState(text) {
  $('#saveStatus').textContent = text;
}

async function verifyAdmin(userId) {
  const { data: membership, error } = await db
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(membership);
}

async function loadContent() {
  const rowId = Number(window.SITE_CONFIG.CONTENT_ROW_ID || 1);
  const { data: row, error } = await db
    .from('site_content')
    .select('content')
    .eq('id', rowId)
    .maybeSingle();
  if (error) throw error;

  if (row?.content) {
    data = row.content;
    return;
  }

  const { error: insertError } = await db.from('site_content').upsert({
    id: rowId,
    content: data,
    updated_by: currentUser.id
  });
  if (insertError) throw insertError;
}

async function openPanel(user) {
  const isAdmin = await verifyAdmin(user.id);
  if (!isAdmin) {
    await db.auth.signOut();
    throw new Error('Учётная запись не включена в таблицу admin_users.');
  }
  currentUser = user;
  await loadContent();
  $('#login').classList.add('hidden');
  $('#panel').classList.remove('hidden');
  render();
}

async function initialize() {
  if (!isConfigured() || !window.supabase) {
    showLoginMessage('Сначала заполните SUPABASE_URL и SUPABASE_PUBLISHABLE_KEY в файле config.js.', true);
    $('#loginBtn').disabled = true;
    return;
  }

  db = window.supabase.createClient(
    window.SITE_CONFIG.SUPABASE_URL,
    window.SITE_CONFIG.SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: true, autoRefreshToken: true } }
  );

  const { data: { session } } = await db.auth.getSession();
  if (session?.user) {
    try {
      await openPanel(session.user);
    } catch (error) {
      showLoginMessage(error.message, true);
    }
  }
}

$('#loginForm').onsubmit = async (event) => {
  event.preventDefault();
  if (!db) return;
  const button = $('#loginBtn');
  button.disabled = true;
  showLoginMessage('Проверяем учётную запись…');
  try {
    const { data: authData, error } = await db.auth.signInWithPassword({
      email: $('#email').value.trim(),
      password: $('#password').value
    });
    if (error) throw error;
    await openPanel(authData.user);
  } catch (error) {
    showLoginMessage(error.message || 'Не удалось войти.', true);
  } finally {
    button.disabled = false;
  }
};

$('#logoutBtn').onclick = async () => {
  await db.auth.signOut();
  location.reload();
};

$('#saveBtn').onclick = save;

document.querySelectorAll('aside nav button').forEach((button) => {
  button.onclick = () => {
    document.querySelectorAll('aside nav button').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    tab = button.dataset.tab;
    render();
  };
});

async function save() {
  if (!db || !currentUser) return;
  setSavingState('Сохранение…');
  $('#saveBtn').disabled = true;
  const rowId = Number(window.SITE_CONFIG.CONTENT_ROW_ID || 1);
  try {
    const { error } = await db.from('site_content').upsert({
      id: rowId,
      content: data,
      updated_by: currentUser.id
    });
    if (error) throw error;
    setSavingState('Данные синхронизированы');
    toast('Изменения опубликованы для всех посетителей');
  } catch (error) {
    setSavingState('Ошибка сохранения');
    alert(`Не удалось сохранить: ${error.message}`);
  } finally {
    $('#saveBtn').disabled = false;
  }
}

function field(label, path, value, type = 'text') {
  return `<label>${label}${type === 'textarea'
    ? `<textarea data-path="${path}">${esc(value)}</textarea>`
    : `<input type="${type}" data-path="${path}" value="${esc(value)}">`}</label>`;
}

function bind() {
  ws.querySelectorAll('[data-path]').forEach((element) => {
    element.oninput = () => setPath(element.dataset.path, element.value);
  });
  ws.querySelectorAll('[data-upload]').forEach((input) => {
    input.onchange = () => uploadToPath(input);
  });
}

function setPath(path, value) {
  const parts = path.split('.');
  let object = data;
  for (let index = 0; index < parts.length - 1; index += 1) object = object[parts[index]];
  object[parts.at(-1)] = value;
  setSavingState('Есть несохранённые изменения');
}

async function uploadFile(file) {
  if (!file.type.startsWith('image/')) throw new Error('Разрешены только изображения.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Максимальный размер изображения — 10 МБ.');

  const extension = (file.name.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const unique = window.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const filePath = `uploads/${new Date().toISOString().slice(0, 10)}/${unique}.${extension}`;
  const bucket = window.SITE_CONFIG.STORAGE_BUCKET || 'site-images';

  const { error } = await db.storage.from(bucket).upload(filePath, file, {
    cacheControl: '31536000',
    upsert: false,
    contentType: file.type
  });
  if (error) throw error;

  const { data: publicData } = db.storage.from(bucket).getPublicUrl(filePath);
  return publicData.publicUrl;
}

async function uploadToPath(input) {
  const file = input.files?.[0];
  if (!file) return;
  input.disabled = true;
  setSavingState('Загрузка фотографии…');
  try {
    const url = await uploadFile(file);
    setPath(input.dataset.upload, url);
    render();
    toast('Фотография загружена. Нажмите «Сохранить».');
  } catch (error) {
    alert(`Не удалось загрузить изображение: ${error.message}`);
  } finally {
    input.disabled = false;
  }
}

function render() {
  const titles = {
    dashboard: 'Обзор',
    brand: 'Основные настройки',
    albums: 'Альбомы',
    process: 'Этапы работы',
    faq: 'Частые вопросы',
    reviews: 'Отзывы',
    data: 'Резервная копия'
  };
  $('#pageTitle').textContent = titles[tab];
  if (tab === 'dashboard') dashboard();
  if (tab === 'brand') brand();
  if (tab === 'albums') albums();
  if (tab === 'process') repeatEditor('process');
  if (tab === 'faq') repeatEditor('faq');
  if (tab === 'reviews') repeatEditor('reviews');
  if (tab === 'data') dataTools();
  bind();
}

async function dashboard() {
  ws.innerHTML = '<div class="notice">Загружаем общую статистику сайта…</div>';
  const { data: stats, error } = await db.rpc('get_site_stats');
  if (error) {
    ws.innerHTML = `<div class="notice">Не удалось получить статистику: ${esc(error.message)}</div>`;
    return;
  }
  const events = Object.entries(stats.by_event || {}).sort((a, b) => Number(b[1]) - Number(a[1]));
  ws.innerHTML = `
    <div class="notice">Это общая статистика, которая собирается со всех устройств. Для расширенных отчётов используйте Яндекс Метрику.</div>
    <div class="stats">
      <div class="stat"><b>${stats.pageviews || 0}</b><span>Просмотров сайта</span></div>
      <div class="stat"><b>${stats.events_total || 0}</b><span>Всего событий</span></div>
      <div class="stat"><b>${stats.vk_click || 0}</b><span>Переходов во VK</span></div>
      <div class="stat"><b>${stats.photo_open || 0}</b><span>Открытий фотографий</span></div>
    </div>
    <div class="card"><h3>События</h3><div class="event-list">${events.length
      ? events.map(([name, count]) => `<div class="event-row"><span>${esc(name)}</span><b>${count}</b></div>`).join('')
      : '<p>Пока нет данных.</p>'}</div></div>`;
}

function brand() {
  ws.innerHTML = `
    <div class="card"><h3>Бренд и контакты</h3><div class="grid">
      ${field('Название', 'brand.name', data.brand.name)}
      ${field('Город', 'brand.city', data.brand.city)}
      ${field('Ссылка VK', 'brand.vk', data.brand.vk)}
      ${field('Телефон', 'brand.phone', data.brand.phone)}
    </div></div>
    <div class="card"><h3>Первый экран</h3><div class="grid">
      ${field('Надзаголовок', 'hero.eyebrow', data.hero.eyebrow)}
      ${field('Заголовок', 'hero.title', data.hero.title)}
      ${field('Описание', 'hero.text', data.hero.text, 'textarea')}
      <label>Главное изображение<div class="preview"><img src="${esc(data.hero.image)}"></div><span class="upload-btn">Заменить<input type="file" accept="image/*" data-upload="hero.image"></span></label>
    </div></div>`;
}

function albums() {
  ws.innerHTML = data.albums.map((album, albumIndex) => `
    <div class="card"><h3>${esc(album.name)}</h3><div class="album-editor">
      <div><div class="preview"><img src="${esc(album.cover)}"></div><label class="upload-btn">Заменить обложку<input type="file" accept="image/*" data-upload="albums.${albumIndex}.cover"></label></div>
      <div><div class="grid">
        ${field('Название', `albums.${albumIndex}.name`, album.name)}
        ${field('Цена', `albums.${albumIndex}.price`, album.price)}
        ${field('Метка', `albums.${albumIndex}.badge`, album.badge)}
        ${field('Короткое описание', `albums.${albumIndex}.lead`, album.lead, 'textarea')}
      </div>
      <h4>Характеристики</h4>
      ${album.details.map((detail, detailIndex) => field(`Строка ${detailIndex + 1}`, `albums.${albumIndex}.details.${detailIndex}`, detail)).join('')}
      <h4>Галерея</h4>
      <div class="gallery-grid">${album.gallery.map((image, imageIndex) => `<div class="gallery-item"><img src="${esc(image)}"><button data-remove-gallery="${albumIndex}.${imageIndex}">×</button></div>`).join('')}</div>
      <label class="upload-btn">Добавить фото<input type="file" accept="image/*" data-gallery-add="${albumIndex}"></label>
      </div></div></div>`).join('');

  ws.querySelectorAll('[data-remove-gallery]').forEach((button) => {
    button.onclick = () => {
      const [albumIndex, imageIndex] = button.dataset.removeGallery.split('.').map(Number);
      data.albums[albumIndex].gallery.splice(imageIndex, 1);
      setSavingState('Есть несохранённые изменения');
      render();
    };
  });

  ws.querySelectorAll('[data-gallery-add]').forEach((input) => {
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      input.disabled = true;
      setSavingState('Загрузка фотографии…');
      try {
        const url = await uploadFile(file);
        data.albums[Number(input.dataset.galleryAdd)].gallery.push(url);
        setSavingState('Есть несохранённые изменения');
        render();
        toast('Фотография добавлена. Нажмите «Сохранить».');
      } catch (error) {
        alert(`Не удалось загрузить изображение: ${error.message}`);
      } finally {
        input.disabled = false;
      }
    };
  });
}

function repeatEditor(kind) {
  const config = {
    process: { title: 'Этапы', first: 'title', second: 'text' },
    faq: { title: 'Вопросы и ответы', first: 'q', second: 'a' },
    reviews: { title: 'Отзывы', first: 'name', second: 'text' }
  }[kind];

  ws.innerHTML = `<div class="card"><h3>${config.title}</h3>${data[kind].map((item, index) => `
    <div class="repeat"><div class="grid">
      ${field(kind === 'faq' ? 'Вопрос' : kind === 'reviews' ? 'Автор' : 'Название', `${kind}.${index}.${config.first}`, item[config.first])}
      ${field(kind === 'faq' ? 'Ответ' : kind === 'reviews' ? 'Текст отзыва' : 'Описание', `${kind}.${index}.${config.second}`, item[config.second], 'textarea')}
    </div><div class="row-actions"><button class="danger" data-remove="${index}">Удалить</button></div></div>`).join('')}
    <button id="addItem" class="secondary">Добавить</button></div>`;

  ws.querySelectorAll('[data-remove]').forEach((button) => {
    button.onclick = () => {
      data[kind].splice(Number(button.dataset.remove), 1);
      setSavingState('Есть несохранённые изменения');
      render();
    };
  });

  $('#addItem').onclick = () => {
    data[kind].push(kind === 'faq'
      ? { q: 'Новый вопрос', a: 'Ответ' }
      : kind === 'reviews'
        ? { name: 'Имя', text: 'Текст отзыва' }
        : { title: 'Новый этап', text: 'Описание' });
    setSavingState('Есть несохранённые изменения');
    render();
  };
}

function dataTools() {
  ws.innerHTML = `
    <div class="notice">Экспорт сохраняет тексты и ссылки на фотографии. Сами файлы продолжают храниться в Supabase Storage.</div>
    <div class="card"><h3>Управление данными</h3><div class="data-actions">
      <button id="exportBtn">Экспортировать JSON</button>
      <label class="secondary">Импортировать JSON<input id="importInput" type="file" accept="application/json" hidden></label>
      <button id="resetStats">Очистить базовую статистику</button>
      <button id="resetAll" class="danger">Вернуть тестовый контент</button>
    </div></div>`;

  $('#exportBtn').onclick = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = 'school-album-content.json';
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  };

  $('#importInput').onchange = (event) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        data = JSON.parse(reader.result);
        setSavingState('Импортирован контент — нажмите «Сохранить»');
        render();
      } catch {
        alert('Некорректный JSON-файл.');
      }
    };
    reader.readAsText(event.target.files[0]);
  };

  $('#resetStats').onclick = async () => {
    if (!confirm('Удалить всю базовую статистику сайта?')) return;
    const { error } = await db.from('site_events').delete().gte('id', 0);
    if (error) alert(`Не удалось очистить статистику: ${error.message}`);
    else { toast('Статистика очищена'); render(); }
  };

  $('#resetAll').onclick = () => {
    if (!confirm('Вернуть все тестовые тексты и тестовые изображения?')) return;
    data = clone(window.DEFAULT_CONTENT);
    setSavingState('Тестовый контент восстановлен — нажмите «Сохранить»');
    render();
  };
}

initialize().catch((error) => showLoginMessage(error.message || 'Ошибка инициализации.', true));
