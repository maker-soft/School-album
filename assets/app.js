const clone = (value) => JSON.parse(JSON.stringify(value));
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

let content = clone(window.DEFAULT_CONTENT);
let db = null;

function isConfigured() {
  const cfg = window.SITE_CONFIG || {};
  return /^https:\/\/.+\.supabase\.co$/.test(cfg.SUPABASE_URL || '')
    && cfg.SUPABASE_PUBLISHABLE_KEY
    && !cfg.SUPABASE_PUBLISHABLE_KEY.includes('YOUR_');
}

function initSupabase() {
  if (!isConfigured() || !window.supabase) return null;
  return window.supabase.createClient(
    window.SITE_CONFIG.SUPABASE_URL,
    window.SITE_CONFIG.SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: true, autoRefreshToken: true } }
  );
}

function initMetrika() {
  const id = Number(window.SITE_CONFIG?.YANDEX_METRIKA_ID || 0);
  if (!id) return;
  window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
  window.ym.l = Date.now();
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://mc.yandex.ru/metrika/tag.js';
  document.head.appendChild(script);
  window.ym(id, 'init', {
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: true
  });
}

async function loadContent() {
  if (!db) return;
  const rowId = Number(window.SITE_CONFIG.CONTENT_ROW_ID || 1);
  const { data, error } = await db
    .from('site_content')
    .select('content')
    .eq('id', rowId)
    .maybeSingle();
  if (error) {
    console.error('Не удалось загрузить контент из Supabase:', error.message);
    return;
  }
  if (data?.content) content = data.content;
}

function track(eventName, albumId = null) {
  const allowed = ['pageview', 'vk_click', 'photo_open', 'faq_open', 'album_order'];
  if (!allowed.includes(eventName)) return;

  if (db) {
    db.from('site_events').insert({
      event_name: eventName,
      album_id: albumId,
      path: location.pathname.slice(0, 500),
      referrer: (document.referrer || '').slice(0, 1000)
    }).then(({ error }) => {
      if (error) console.warn('Событие статистики не записано:', error.message);
    });
  }

  const metrikaId = Number(window.SITE_CONFIG?.YANDEX_METRIKA_ID || 0);
  if (metrikaId && window.ym && eventName !== 'pageview') {
    window.ym(metrikaId, 'reachGoal', eventName, albumId ? { album_id: albumId } : undefined);
  }
}

function render() {
  document.title = `${content.brand.name} — школьные фотокниги`;
  $('#brandName').textContent = $('#footerBrand').textContent = content.brand.name;
  $('#footerCity').textContent = content.brand.city;

  ['headerVk', 'heroVk', 'footerVk', 'footerVk2'].forEach((id) => {
    const element = document.getElementById(id);
    element.href = content.brand.vk;
    element.onclick = () => track('vk_click');
  });

  $('#heroEyebrow').textContent = content.hero.eyebrow;
  $('#heroTitle').textContent = content.hero.title;
  $('#heroText').textContent = content.hero.text;
  $('#heroImage').src = content.hero.image;

  $('#albumGrid').innerHTML = content.albums.map((album) => `
    <article class="album-card">
      <div class="album-media"><img src="${esc(album.cover)}" alt="Альбом ${esc(album.name)}"><span class="badge">${esc(album.badge)}</span></div>
      <div class="album-body">
        <div class="album-title-row"><h3>${esc(album.name)}</h3><span class="price">${esc(album.price)}</span></div>
        <p>${esc(album.lead)}</p>
        <ul class="album-details">${album.details.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
        <a class="btn album-order" href="${esc(content.brand.vk)}" target="_blank" rel="noopener" data-album="${esc(album.id)}">Выбрать этот альбом</a>
      </div>
    </article>`).join('');

  document.querySelectorAll('.album-order').forEach((element) => {
    element.addEventListener('click', () => track('album_order', element.dataset.album));
  });

  const images = content.albums.flatMap((album) => album.gallery.map((src, index) => ({
    src,
    label: `${album.name} · ${String(index + 1).padStart(2, '0')}`
  })));
  $('#portfolioRail').innerHTML = images.map((image) => `
    <figure class="portfolio-item"><img src="${esc(image.src)}" alt="${esc(image.label)}"><span>${esc(image.label)}</span></figure>`).join('');

  $('#processGrid').innerHTML = content.process.map((item, index) => `
    <article class="process-card"><span class="process-num">${String(index + 1).padStart(2, '0')}</span><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p></article>`).join('');

  $('#reviewsGrid').innerHTML = content.reviews.map((review) => `
    <article class="review-card"><span class="quote">“</span><p>${esc(review.text)}</p><small>${esc(review.name)}</small></article>`).join('');

  $('#faqList').innerHTML = content.faq.map((item) => `
    <div class="faq-item"><button class="faq-question" aria-expanded="false">${esc(item.q)}<span>+</span></button><div class="faq-answer">${esc(item.a)}</div></div>`).join('');

  document.querySelectorAll('.faq-question').forEach((button) => {
    button.onclick = () => {
      const item = button.parentElement;
      item.classList.toggle('open');
      button.setAttribute('aria-expanded', String(item.classList.contains('open')));
      if (item.classList.contains('open')) track('faq_open');
    };
  });

  const lightbox = $('#lightbox');
  const lightboxImage = lightbox.querySelector('img');
  document.querySelectorAll('.portfolio-item img').forEach((image) => {
    image.onclick = () => {
      lightboxImage.src = image.src;
      lightbox.classList.add('show');
      lightbox.setAttribute('aria-hidden', 'false');
      track('photo_open');
    };
  });
  lightbox.querySelector('button').onclick = () => {
    lightbox.classList.remove('show');
    lightbox.setAttribute('aria-hidden', 'true');
  };
  lightbox.onclick = (event) => {
    if (event.target === lightbox) lightbox.querySelector('button').click();
  };
}

async function start() {
  db = initSupabase();
  initMetrika();
  await loadContent();
  render();
  track('pageview');
}

start().catch((error) => {
  console.error(error);
  render();
});
