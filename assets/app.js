const clone = (value) => JSON.parse(JSON.stringify(value));
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function mergeDefaults(defaultValue, storedValue) {
  if (Array.isArray(defaultValue)) return Array.isArray(storedValue) ? clone(storedValue) : clone(defaultValue);
  if (defaultValue && typeof defaultValue === 'object') {
    const source = storedValue && typeof storedValue === 'object' && !Array.isArray(storedValue) ? storedValue : {};
    const result = {};
    Object.keys(defaultValue).forEach((key) => { result[key] = mergeDefaults(defaultValue[key], source[key]); });
    Object.keys(source).forEach((key) => { if (!(key in result)) result[key] = clone(source[key]); });
    return result;
  }
  return storedValue === undefined || storedValue === null ? defaultValue : storedValue;
}

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
  window.ym(id, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: true });
}

async function loadContent() {
  if (!db) return;
  const rowId = Number(window.SITE_CONFIG.CONTENT_ROW_ID || 1);
  const { data, error } = await db.from('site_content').select('content').eq('id', rowId).maybeSingle();
  if (error) {
    console.error('Не удалось загрузить контент из Supabase:', error.message);
    return;
  }
  if (data?.content) content = mergeDefaults(window.DEFAULT_CONTENT, data.content);
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
    }).then(({ error }) => { if (error) console.warn('Событие статистики не записано:', error.message); });
  }
  const metrikaId = Number(window.SITE_CONFIG?.YANDEX_METRIKA_ID || 0);
  if (metrikaId && window.ym && eventName !== 'pageview') {
    window.ym(metrikaId, 'reachGoal', eventName, albumId ? { album_id: albumId } : undefined);
  }
}

const numberValue = (value, fallback, min, max) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
};
const validColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : fallback;
const validChoice = (value, choices, fallback) => choices.includes(value) ? value : fallback;

function applyTheme() {
  const defaults = window.DEFAULT_CONTENT.design;
  const design = mergeDefaults(defaults, content.design || {});
  const root = document.documentElement;
  const set = (name, value) => root.style.setProperty(name, value);

  set('--font-body', design.fonts.body || defaults.fonts.body);
  set('--font-heading', design.fonts.heading || defaults.fonts.heading);
  set('--font-interface', design.fonts.interface || defaults.fonts.interface);
  set('--font-brand', design.fonts.brand || defaults.fonts.brand);

  const t = design.typography;
  set('--base-size', `${numberValue(t.baseSize, 16, 10, 28)}px`);
  set('--nav-size', `${numberValue(t.navSize, 13, 8, 30)}px`);
  set('--button-size', `${numberValue(t.buttonSize, 13, 8, 32)}px`);
  set('--eyebrow-size', `${numberValue(t.eyebrowSize, 11, 7, 28)}px`);
  set('--hero-title-size', `${numberValue(t.heroTitleSize, 104, 36, 180)}px`);
  set('--hero-text-size', `${numberValue(t.heroTextSize, 18, 12, 40)}px`);
  set('--section-title-size', `${numberValue(t.sectionTitleSize, 76, 30, 140)}px`);
  set('--album-title-size', `${numberValue(t.albumTitleSize, 31, 18, 70)}px`);
  set('--card-text-size', `${numberValue(t.cardTextSize, 16, 10, 32)}px`);
  set('--faq-size', `${numberValue(t.faqSize, 24, 14, 54)}px`);
  set('--price-size', `${numberValue(t.priceSize, 16, 10, 40)}px`);
  set('--brand-name-size', `${numberValue(t.brandNameSize, 14, 8, 34)}px`);
  set('--brand-tagline-size', `${numberValue(t.brandTaglineSize, 9, 6, 24)}px`);
  set('--process-title-size', `${numberValue(t.processTitleSize, 25, 14, 60)}px`);
  set('--review-text-size', `${numberValue(t.reviewTextSize, 21, 12, 48)}px`);
  set('--audience-title-size', `${numberValue(t.audienceTitleSize, 60, 24, 110)}px`);
  set('--footer-size', `${numberValue(t.footerSize, 12, 8, 28)}px`);
  set('--ticker-size', `${numberValue(t.tickerSize, 11, 7, 24)}px`);
  set('--hero-note-size', `${numberValue(t.heroNoteSize, 12, 8, 28)}px`);
  set('--floating-title-size', `${numberValue(t.floatingTitleSize, 22, 14, 46)}px`);
  set('--portfolio-label-size', `${numberValue(t.portfolioLabelSize, 12, 8, 28)}px`);
  set('--detail-size', `${numberValue(t.detailSize, 13, 9, 28)}px`);
  set('--body-line-height', numberValue(t.bodyLineHeight, 1.65, .8, 3));
  set('--heading-line-height', numberValue(t.headingLineHeight, 1.02, .7, 2));
  set('--body-letter-spacing', `${numberValue(t.bodyLetterSpacing, 0, -.2, .5)}em`);
  set('--heading-letter-spacing', `${numberValue(t.headingLetterSpacing, -.045, -.2, .5)}em`);
  set('--eyebrow-letter-spacing', `${numberValue(t.eyebrowLetterSpacing, .18, 0, .8)}em`);
  set('--body-weight', numberValue(t.bodyWeight, 400, 100, 900));
  set('--heading-weight', numberValue(t.headingWeight, 400, 100, 900));
  set('--interface-weight', numberValue(t.interfaceWeight, 650, 100, 900));
  set('--brand-weight', numberValue(t.brandWeight, 650, 100, 900));
  set('--heading-style', validChoice(t.headingStyle, ['normal', 'italic'], 'normal'));
  set('--heading-transform', validChoice(t.headingTransform, ['none', 'uppercase', 'lowercase', 'capitalize'], 'none'));

  const c = design.colors;
  set('--color-bg', validColor(c.background, defaults.colors.background));
  set('--color-text', validColor(c.text, defaults.colors.text));
  set('--color-muted', validColor(c.muted, defaults.colors.muted));
  set('--color-accent', validColor(c.accent, defaults.colors.accent));
  set('--color-accent-dark', validColor(c.accentDark, defaults.colors.accentDark));
  set('--color-dark', validColor(c.dark, defaults.colors.dark));
  set('--color-dark-text', validColor(c.darkText, defaults.colors.darkText));
  set('--color-surface', validColor(c.surface, defaults.colors.surface));
  set('--color-border', validColor(c.border, defaults.colors.border));
  set('--color-audience', validColor(c.audience, defaults.colors.audience));
  set('--color-logo-bg', validColor(c.logoBackground, defaults.colors.logoBackground));
  set('--color-logo-text', validColor(c.logoText, defaults.colors.logoText));

  const l = design.layout;
  set('--header-height', `${numberValue(l.headerHeight, 82, 56, 150)}px`);
  set('--section-spacing', `${numberValue(l.sectionSpacing, 120, 30, 240)}px`);
  set('--side-padding', `${numberValue(l.contentSidePadding, 92, 16, 180)}px`);
  set('--button-radius', `${numberValue(l.buttonRadius, 999, 0, 999)}px`);
  set('--card-radius', `${numberValue(l.cardRadius, 24, 0, 80)}px`);
  set('--image-radius', `${numberValue(l.imageRadius, 24, 0, 100)}px`);
  set('--logo-mark-size', `${numberValue(l.logoMarkSize, 42, 24, 100)}px`);
  set('--logo-image-width', `${numberValue(l.logoImageWidth, 170, 50, 420)}px`);
  set('--header-opacity-percent', `${numberValue(l.headerOpacity, .88, 0, 1) * 100}%`);
  set('--header-blur', `${numberValue(l.headerBlur, 18, 0, 50)}px`);

  const fontLink = $('#customFontStylesheet');
  const fontUrl = String(design.fonts.stylesheetUrl || '').trim();
  if (/^https:\/\//i.test(fontUrl)) {
    fontLink.href = fontUrl;
    fontLink.disabled = false;
  } else {
    fontLink.removeAttribute('href');
    fontLink.disabled = true;
  }
}

function configureLogo(imageId, markId, copyId, imageUrl, fallbackImage = '') {
  const logo = content.brand.logo || {};
  const image = document.getElementById(imageId);
  const mark = document.getElementById(markId);
  const copy = document.getElementById(copyId);
  const finalUrl = String(imageUrl || fallbackImage || '').trim();
  image.alt = logo.alt || content.brand.name;
  if (finalUrl) {
    image.src = finalUrl;
    image.hidden = false;
    mark.hidden = true;
  } else {
    image.removeAttribute('src');
    image.hidden = true;
    mark.hidden = false;
    mark.textContent = logo.mark || 'НГ';
  }
  copy.hidden = logo.showName === false && logo.showTagline === false;
}

function render() {
  applyTheme();
  const logo = content.brand.logo || {};
  document.title = `${content.brand.name} — школьные фотокниги`;
  $('#brandName').textContent = $('#footerBrand').textContent = content.brand.name;
  $('#brandTagline').textContent = content.brand.tagline;
  $('#footerCity').textContent = content.brand.city;
  $('#brandName').hidden = logo.showName === false;
  $('#footerBrand').hidden = logo.showName === false;
  $('#brandTagline').hidden = logo.showTagline === false;
  $('#footerCity').hidden = logo.showTagline === false;
  configureLogo('headerLogo', 'headerMark', 'headerBrandCopy', logo.header);
  configureLogo('footerLogo', 'footerMark', 'footerBrandCopy', logo.footer, logo.header);
  if (logo.favicon) $('#siteFavicon').href = logo.favicon;

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
  document.querySelectorAll('.album-order').forEach((element) => element.addEventListener('click', () => track('album_order', element.dataset.album)));

  const images = content.albums.flatMap((album) => album.gallery.map((src, index) => ({ src, label: `${album.name} · ${String(index + 1).padStart(2, '0')}` })));
  $('#portfolioRail').innerHTML = images.map((image) => `<figure class="portfolio-item"><img src="${esc(image.src)}" alt="${esc(image.label)}"><span>${esc(image.label)}</span></figure>`).join('');
  $('#processGrid').innerHTML = content.process.map((item, index) => `<article class="process-card"><span class="process-num">${String(index + 1).padStart(2, '0')}</span><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p></article>`).join('');
  $('#reviewsGrid').innerHTML = content.reviews.map((review) => `<article class="review-card"><span class="quote">“</span><p>${esc(review.text)}</p><small>${esc(review.name)}</small></article>`).join('');
  $('#faqList').innerHTML = content.faq.map((item) => `<div class="faq-item"><button class="faq-question" aria-expanded="false">${esc(item.q)}<span>+</span></button><div class="faq-answer">${esc(item.a)}</div></div>`).join('');

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
  lightbox.querySelector('button').onclick = () => { lightbox.classList.remove('show'); lightbox.setAttribute('aria-hidden', 'true'); };
  lightbox.onclick = (event) => { if (event.target === lightbox) lightbox.querySelector('button').click(); };

  const menuButton = $('.menu-btn');
  menuButton.onclick = () => document.querySelector('.site-header').classList.toggle('menu-open');
}

async function start() {
  db = initSupabase();
  initMetrika();
  await loadContent();
  render();
  track('pageview');
}

start().catch((error) => { console.error(error); render(); });
