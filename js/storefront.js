/**
 * =========================================================================
 * BAYAN FASHION STORE — MULTI-TENANT STOREFRONT ENGINE (Firebase Firestore)
 * =========================================================================
 * - يقرأ كود المحل الفعلي عبر getActiveShopId() (?shop=SHOP_...)
 * - يعزل كافة البيانات تحت shops/{shopId}/(settings|products|coupons|orders)
 * - يرسل الطلبات بنفس هيكل BAYAN_POS_FASHION/js/online_orders.js
 * - خالٍ تماماً من أي بيانات تجريبية أو براندات ثابتة
 * =========================================================================
 */

(function (window) {
  'use strict';

  const DEFAULT_SHIPPING_RATES = [
    { id: 'cairo', name: 'القاهرة', fee: 55 },
    { id: 'giza', name: 'الجيزة', fee: 55 },
    { id: 'alex', name: 'الإسكندرية', fee: 65 },
    { id: 'delta', name: 'محافظات الدلتا (المنصورة، طنطا، الزقازيق...)', fee: 70 },
    { id: 'canal', name: 'مدن القناة (الإسماعيلية، بورسعيد، السويس)', fee: 75 },
    { id: 'upper', name: 'محافظات الصعيد (المنيا، أسيوط، سوهاج، قنا، أسوان)', fee: 85 },
    { id: 'redsea', name: 'البحر الأحمر وشرم الشيخ ومطروح', fee: 95 }
  ];

  const STATUS_MAP = {
    new:        { label: 'جديد — قيد المراجعة', idx: 0, cls: 'bg-amber-100 text-amber-800' },
    pending:    { label: 'جديد — قيد المراجعة', idx: 0, cls: 'bg-amber-100 text-amber-800' },
    processing: { label: 'قيد التجهيز',         idx: 1, cls: 'bg-sky-100 text-sky-800' },
    confirmed:  { label: 'تم التأكيد والتجهيز', idx: 1, cls: 'bg-emerald-100 text-emerald-800' },
    shipped:    { label: 'تم الشحن مع المندوب', idx: 2, cls: 'bg-violet-100 text-violet-800' },
    delivered:  { label: 'تم التسليم بنجاح',    idx: 3, cls: 'bg-emerald-100 text-emerald-800' },
    cancelled:  { label: 'ملغي',                idx: -1, cls: 'bg-rose-100 text-rose-800' }
  };

  const state = {
    shopId: 'SHOP_DEMO',
    settings: {
      storeName: 'المتجر الإلكتروني',
      tagline: 'أزياء عصرية وشحن لجميع المحافظات',
      announcement: 'شحن سريع لجميع المحافظات • معاينة قبل الاستلام • الدفع عند الاستلام',
      accentColor: '#e11d48',
      logoUrl: '',
      whatsappNumber: '',
      vodafoneCashNumber: '',
      instapayAddress: '',
      freeShippingThreshold: 1500,
      heroBadge: '',
      heroTitle: '',
      heroSubtitle: '',
      showTrustBadges: true,
      trustBadges: [],
      facebookUrl: '',
      instagramUrl: '',
      tiktokUrl: '',
      whatsappChannelUrl: ''
    },
    shippingRates: [...DEFAULT_SHIPPING_RATES],
    products: [],
    _searchIndex: new Map(),
    _searchTimer: null,
    testimonials: [],
    activeTestimonialsTab: 'text',
    customerProfile: null,
    productsLoaded: false,
    coupons: [],
    cart: [],
    wishlist: [],
    activeCategory: 'الكل',
    searchQuery: '',
    sortBy: 'featured',
    currentProduct: null,
    pdSelectedColor: '',
    pdSelectedSize: '',
    pdSelectedTier: 1,
    pdActiveTab: 'desc',
    pdAppliedCoupon: null,
    ccAppliedCoupon: null,
    submittingOrder: false
  };

  /* =========================================================================
   * 1. HELPERS & UI UTILITIES
   * ========================================================================= */
  function escapeHTML(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatEGP(num) {
    const n = Number(num || 0);
    return `${n.toLocaleString('en-US')} ج.م`;
  }

  function generateOrderId() {
    return `ORD-${Date.now().toString().slice(-6)}`;
  }

  function handleImgError(img, label = '') {
    img.onerror = null;
    const text = (label || state.settings.storeName || 'منتج').slice(0, 18);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">
      <rect width="500" height="500" fill="#f1f5f9"/>
      <circle cx="250" cy="215" r="54" fill="#e2e8f0"/>
      <text x="50%" y="62%" dominant-baseline="middle" text-anchor="middle" fill="#64748b" font-family="Cairo,sans-serif" font-size="22" font-weight="700">${escapeHTML(text)}</text>
    </svg>`;
    img.src = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const colors = {
      success: 'bg-slate-900 text-white border-emerald-500',
      error: 'bg-rose-600 text-white border-rose-300',
      info: 'bg-slate-800 text-white border-sky-400'
    };
    const icons = {
      success: 'fa-circle-check text-emerald-400',
      error: 'fa-circle-exclamation text-white',
      info: 'fa-circle-info text-sky-400'
    };
    const toast = document.createElement('div');
    toast.className = `pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl border-r-4 text-xs sm:text-sm font-bold animate-slideUp ${colors[type] || colors.success}`;
    toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.success} text-base"></i><span class="flex-1">${escapeHTML(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.25s';
      setTimeout(() => toast.remove(), 260);
    }, 3200);
  }

  let confirmResolver = null;
  function showConfirm(title, message) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-msg').textContent = message;
    document.getElementById('confirm-modal').classList.remove('hidden');
    return new Promise((resolve) => { confirmResolver = resolve; });
  }

  function resolveConfirm(result) {
    document.getElementById('confirm-modal').classList.add('hidden');
    if (confirmResolver) {
      confirmResolver(result);
      confirmResolver = null;
    }
  }

  function copyText(text, successMsg = 'تم النسخ') {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showToast(successMsg, 'success');
    } catch (_) {
      showToast('تعذر النسخ التلقائي', 'error');
    }
  }

  function isValidEgyptPhone(phone) {
    return /^01[0125][0-9]{8}$/.test(String(phone || '').trim());
  }

  function validateEgyptPhoneInput(input, hintId) {
    input.value = input.value.replace(/[^0-9]/g, '').slice(0, 11);
    const hint = document.getElementById(hintId);
    if (!hint) return;
    if (!input.value) {
      hint.classList.add('hidden');
      return;
    }
    hint.classList.remove('hidden');
    if (isValidEgyptPhone(input.value)) {
      hint.className = 'text-[11px] mt-0.5 font-bold text-emerald-600';
      hint.innerHTML = '<i class="fa-solid fa-check ml-1"></i>رقم مصري صحيح';
    } else {
      hint.className = 'text-[11px] mt-0.5 font-bold text-rose-600';
      hint.innerHTML = '<i class="fa-solid fa-circle-info ml-1"></i>أدخل 11 رقم يبدأ بـ 010 أو 011 أو 012 أو 015';
    }
  }

  function renderPaymentHint(selectId, hintId) {
    const sel = document.getElementById(selectId);
    const hint = document.getElementById(hintId);
    if (!sel || !hint) return;
    const val = sel.value;
    if (val === 'فودافون كاش') {
      const num = state.settings.vodafoneCashNumber;
      if (!num) {
        hint.classList.remove('hidden');
        hint.innerHTML = '<div class="text-xs font-bold">سيتم تزويدك برقم محفظة فودافون كاش عند تأكيد الطلب.</div>';
        return;
      }
      hint.classList.remove('hidden');
      hint.innerHTML = `
        <div class="flex items-center justify-between gap-2">
          <div>
            <strong>التحويل على محفظة فودافون كاش:</strong> <span class="font-mono font-black">${escapeHTML(num)}</span>
            <div class="text-[11px] opacity-80 mt-0.5">أرسل صورة إيصال التحويل على واتساب بعد تأكيد الطلب</div>
          </div>
          <button type="button" onclick="copyText('${escapeHTML(num)}', 'تم نسخ رقم فودافون كاش')" class="px-2.5 py-1 rounded-lg bg-amber-200 hover:bg-amber-300 font-bold text-amber-950 shrink-0">نسخ</button>
        </div>`;
    } else if (val === 'إنستا باي') {
      const ipa = state.settings.instapayAddress;
      if (!ipa) {
        hint.classList.remove('hidden');
        hint.innerHTML = '<div class="text-xs font-bold">سيتم تزويدك بعنوان إنستا باي عند تأكيد الطلب.</div>';
        return;
      }
      hint.classList.remove('hidden');
      hint.innerHTML = `
        <div class="flex items-center justify-between gap-2">
          <div>
            <strong>عنوان الدفع (InstaPay):</strong> <span class="font-mono font-black">${escapeHTML(ipa)}</span>
            <div class="text-[11px] opacity-80 mt-0.5">التحويل فوري مع أولوية تجهيز الشحنة</div>
          </div>
          <button type="button" onclick="copyText('${escapeHTML(ipa)}', 'تم نسخ عنوان إنستا باي')" class="px-2.5 py-1 rounded-lg bg-amber-200 hover:bg-amber-300 font-bold text-amber-950 shrink-0">نسخ</button>
        </div>`;
    } else {
      hint.classList.add('hidden');
      hint.innerHTML = '';
    }
  }

  function normalizeColors(rawColors) {
    if (!Array.isArray(rawColors)) return [];
    return rawColors
      .map(c => {
        if (!c) return null;
        if (typeof c === 'string') return { name: c.trim(), hex: '#111827' };
        if (typeof c === 'object' && c.name) return { name: String(c.name).trim(), hex: c.hex || '#111827' };
        return null;
      })
      .filter(c => c && c.name);
  }

  function normalizeSizes(rawSizes) {
    if (!Array.isArray(rawSizes)) return [];
    return rawSizes.map(s => String(s || '').trim()).filter(Boolean);
  }

  function normalizeImages(doc) {
    if (Array.isArray(doc.images) && doc.images.length) return doc.images.filter(Boolean);
    if (doc.image) return [doc.image];
    if (doc.img) return [doc.img];
    return [];
  }

  function normalizeProduct(docId, data) {
    const stock = Number(data.stock ?? data.stockQty ?? data.qty ?? 0);
    return {
      id: docId,
      pos_id: data.pos_id ?? data.posId ?? '',
      code: data.code ?? '',
      barcode: data.barcode ?? '',
      name: data.name || 'منتج بدون اسم',
      category: data.categoryName || data.category || 'عام',
      description: data.description || '',
      price: Number(data.price || 0),
      oldPrice: Number(data.oldPrice || 0),
      stock: Number.isFinite(stock) ? stock : 0,
      inStock: data.inStock !== undefined ? Boolean(data.inStock) : stock > 0,
      active: data.active !== false,
      isFrozen: data.isFrozen === true,
      featured: Boolean(data.featured),
      enableOffers: data.enableOffers !== false,
      images: normalizeImages(data),
      colors: normalizeColors(data.colors),
      sizes: normalizeSizes(data.sizes),
      variantsStock: data.variantsStock || null,
      reviews: Array.isArray(data.reviews) ? data.reviews : [],
      createdAt: Number(data.createdAt || data.updatedAt || 0)
    };
  }

  /* =========================================================================
   * 2. PERSISTENCE (CART & WISHLIST IN BAYAN IDB)
   * ========================================================================= */
  async function loadLocalState() {
    try {
      if (typeof BayanIDB !== 'undefined') {
        await BayanIDB.open();
        const savedCart = await BayanIDB.getSetting('storefront_cart');
        const savedWish = await BayanIDB.getSetting('storefront_wishlist');
        if (Array.isArray(savedCart)) state.cart = savedCart;
        if (Array.isArray(savedWish)) state.wishlist = savedWish;
      }
    } catch (_) { }
  }

  async function saveCart() {
    try {
      if (typeof BayanIDB !== 'undefined') {
        await BayanIDB.setSetting('storefront_cart', state.cart);
      }
    } catch (_) { }
    updateBadges();
  }

  async function saveWishlist() {
    try {
      if (typeof BayanIDB !== 'undefined') {
        await BayanIDB.setSetting('storefront_wishlist', state.wishlist);
      }
    } catch (_) { }
    updateBadges();
  }

  /* =========================================================================
   * 3. APPLY DYNAMIC BRANDING FROM FIRESTORE SETTINGS
   * ========================================================================= */
  function applyBranding() {
    const s = state.settings;
    const name = (s.storeName || 'المتجر الإلكتروني').trim();
    const initial = name.charAt(0) || 'م';

    document.documentElement.style.setProperty('--brand-color', s.accentColor || '#e11d48');
    document.title = `${name} | المتجر الإلكتروني`;

    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setText('header-brand-name', name);
    setText('footer-brand-name', name);
    setText('footer-copy-name', name);
    setText('header-brand-tagline', s.tagline || 'أزياء عصرية وشحن لجميع المحافظات');
    setText('announcement-text', s.announcement || 'شحن سريع لجميع المحافظات • معاينة قبل الاستلام • الدفع عند الاستلام');
    setText('footer-year', String(new Date().getFullYear()));

    // Dynamic Logo (image if configured, otherwise first letter of storeName)
    const headerLogoWrap = document.getElementById('header-brand-logo-wrap');
    const footerLogoWrap = document.getElementById('footer-brand-logo-wrap');
    if (s.logoUrl) {
      if (headerLogoWrap) headerLogoWrap.innerHTML = `<img src="${escapeHTML(s.logoUrl)}" alt="${escapeHTML(name)}" class="w-full h-full object-cover" />`;
      if (footerLogoWrap) footerLogoWrap.innerHTML = `<img src="${escapeHTML(s.logoUrl)}" alt="${escapeHTML(name)}" class="w-full h-full object-cover" />`;
    } else {
      if (headerLogoWrap) headerLogoWrap.innerHTML = `<span id="header-brand-initial">${escapeHTML(initial)}</span>`;
      if (footerLogoWrap) footerLogoWrap.innerHTML = `<span id="footer-brand-initial">${escapeHTML(initial)}</span>`;
    }

    // Dynamic Hero & Trust Badges from Admin
    if (s.heroBadge) setText('hero-badge-text', s.heroBadge);
    if (s.heroTitle) setText('hero-title', s.heroTitle);
    if (s.heroSubtitle) setText('hero-subtitle', s.heroSubtitle);
    const trustGrid = document.getElementById('hero-trust-grid');
    if (trustGrid) {
      trustGrid.classList.toggle('hidden', s.showTrustBadges === false);
      if (Array.isArray(s.trustBadges)) {
        s.trustBadges.forEach((tb, idx) => {
          if (tb && tb.title) setText(`trust-${idx + 1}-title`, tb.title);
          if (tb && tb.desc) setText(`trust-${idx + 1}-desc`, tb.desc);
        });
      }
    }

    // Dynamic Social Links in Footer
    const socialWrap = document.getElementById('footer-social-links');
    if (socialWrap) {
      const socials = [
        { url: s.facebookUrl, icon: 'fa-brands fa-facebook-f', label: 'فيسبوك', cls: 'bg-blue-600 text-white' },
        { url: s.instagramUrl, icon: 'fa-brands fa-instagram', label: 'إنستجرام', cls: 'bg-pink-600 text-white' },
        { url: s.tiktokUrl, icon: 'fa-brands fa-tiktok', label: 'تيك توك', cls: 'bg-slate-900 text-white' },
        { url: s.whatsappChannelUrl, icon: 'fa-brands fa-whatsapp', label: 'قناة واتساب', cls: 'bg-emerald-600 text-white' }
      ].filter(x => x.url && /^https?:\/\//i.test(x.url));
      socialWrap.innerHTML = socials.map(x =>
        `<a href="${escapeHTML(x.url)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs hover:opacity-90 transition ${x.cls}">
          <i class="${x.icon}"></i><span>${x.label}</span>
        </a>`
      ).join('');
    }

    // Contact rows (only show when configured in Firestore settings)
    const waClean = String(s.whatsappNumber || '').replace(/\D/g, '');
    const waBtn = document.getElementById('floating-whatsapp-btn');
    const waRow = document.getElementById('footer-whatsapp-row');
    if (waClean) {
      if (waBtn) {
        waBtn.href = `https://wa.me/${waClean}`;
        waBtn.classList.remove('hidden');
      }
      if (waRow) {
        waRow.classList.remove('hidden');
        setText('footer-whatsapp', `+${waClean}`);
      }
    } else {
      if (waBtn) waBtn.classList.add('hidden');
      if (waRow) waRow.classList.add('hidden');
    }

    const vfRow = document.getElementById('footer-vodafone-row');
    if (s.vodafoneCashNumber && vfRow) {
      vfRow.classList.remove('hidden');
      setText('footer-vodafone', s.vodafoneCashNumber);
    } else if (vfRow) {
      vfRow.classList.add('hidden');
    }

    const ipaRow = document.getElementById('footer-instapay-row');
    if (s.instapayAddress && ipaRow) {
      ipaRow.classList.remove('hidden');
      setText('footer-instapay', s.instapayAddress);
    } else if (ipaRow) {
      ipaRow.classList.add('hidden');
    }
  }

  /* =========================================================================
   * 4. FIRESTORE MULTI-TENANT LIVE SUBSCRIPTIONS
   * ========================================================================= */
  function initFirestoreListeners() {
    const db = typeof getBayanDb === 'function' ? getBayanDb() : null;
    if (!db) {
      state.productsLoaded = true;
      renderStorefront();
      return;
    }

    // 1) Settings -> general
    db.collection('settings').doc('general').onSnapshot(
      (doc) => {
        if (doc.exists) {
          const d = doc.data() || {};
          state.settings = {
            ...state.settings,
            storeName: d.storeName || d.shopName || d.name || state.settings.storeName,
            tagline: d.storeSubName || d.tagline || d.subtitle || state.settings.tagline,
            announcement: d.announcement || d.announcementBar || state.settings.announcement,
            accentColor: d.accentColor || d.primaryColor || state.settings.accentColor,
            logoUrl: d.storeLogo || d.logoUrl || d.logo || '',
            whatsappNumber: d.whatsappNumber || d.whatsapp || d.phone || '',
            vodafoneCashNumber: d.vodafoneCashNumber || d.vodafoneCash || '',
            instapayAddress: d.instapayAddress || d.instapay || '',
            freeShippingThreshold: Number(d.freeShippingThreshold ?? state.settings.freeShippingThreshold),
            heroBadge: d.heroBadge || '',
            heroTitle: d.heroTitle || '',
            heroSubtitle: d.heroSubtitle || '',
            showTrustBadges: d.showTrustBadges !== false,
            trustBadges: Array.isArray(d.trustBadges) ? d.trustBadges : [],
            facebookUrl: d.facebookUrl || '',
            instagramUrl: d.instagramUrl || '',
            tiktokUrl: d.tiktokUrl || '',
            whatsappChannelUrl: d.whatsappChannelUrl || ''
          };
          applyBranding();
        }
      },
      (err) => console.warn('Settings listener warning:', err)
    );

    // 2) Settings -> shipping
    db.collection('settings').doc('shipping').onSnapshot(
      (doc) => {
        if (doc.exists) {
          const d = doc.data() || {};
          if (Array.isArray(d.rates) && d.rates.length) {
            state.shippingRates = d.rates.map((r, i) => ({
              id: r.id || `gov_${i}`,
              name: r.name || r.city || 'محافظة',
              fee: Number(r.fee ?? r.price ?? 60)
            }));
          } else if (d.governorates && typeof d.governorates === 'object') {
            const entries = Object.entries(d.governorates);
            if (entries.length) {
              state.shippingRates = entries.map(([name, fee], i) => ({
                id: `gov_${i}`,
                name,
                fee: Number(fee || 60)
              }));
            }
          } else if (d.cairoGiza !== undefined || d.alex !== undefined || d.delta !== undefined) {
            state.shippingRates = [
              { id: 'cairo', name: 'القاهرة', fee: Number(d.cairoGiza ?? 55) },
              { id: 'giza', name: 'الجيزة', fee: Number(d.cairoGiza ?? 55) },
              { id: 'alex', name: 'الإسكندرية', fee: Number(d.alex ?? 65) },
              { id: 'delta', name: 'محافظات الدلتا (المنصورة، طنطا، الزقازيق...)', fee: Number(d.delta ?? 70) },
              { id: 'canal', name: 'مدن القناة (الإسماعيلية، بورسعيد، السويس)', fee: Number(d.canal ?? 75) },
              { id: 'upper', name: 'محافظات الصعيد (المنيا، أسيوط، سوهاج، قنا، أسوان)', fee: Number(d.upperEgypt ?? 85) },
              { id: 'redsea', name: 'البحر الأحمر وشرم الشيخ ومطروح', fee: Number(d.remote ?? 95) }
            ];
          }
          if (d.freeShippingThreshold !== undefined) {
            state.settings.freeShippingThreshold = Number(d.freeShippingThreshold);
          }
        }
      },
      (err) => console.warn('Shipping listener warning:', err)
    );

    // 3) Products (live sync, filtered: active !== false && isFrozen !== true)
    db.collection('products').onSnapshot(
      (snap) => {
        const list = [];
        snap.forEach((doc) => {
          const prod = normalizeProduct(doc.id, doc.data() || {});
          if (prod.active !== false && prod.isFrozen !== true) {
            list.push(prod);
          }
        });
        state.products = list;
        state.productsLoaded = true;
        renderStorefront();
      },
      (err) => {
        console.warn('Products listener warning:', err);
        state.productsLoaded = true;
        renderStorefront();
      }
    );

    // 4) Coupons
    db.collection('coupons').onSnapshot(
      (snap) => {
        const list = [];
        snap.forEach((doc) => {
          const c = doc.data() || {};
          if (c.code) {
            list.push({
              id: doc.id,
              code: String(c.code).trim().toUpperCase(),
              type: c.type || 'percent',
              value: Number(c.value || c.discount || 0),
              minOrder: Number(c.minOrder || 0),
              expireAt: c.expireAt || null,
              active: c.active !== false
            });
          }
        });
        state.coupons = list;
      },
      (err) => console.warn('Coupons listener warning:', err)
    );

    // 5) Testimonials (Separate Text & Framed Images)
    db.collection('testimonials').onSnapshot(
      (snap) => {
        const list = [];
        snap.forEach(doc => list.push({ id: doc.id, ...(doc.data() || {}) }));
        list.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
        state.testimonials = list;
        renderTestimonials();
      },
      (err) => console.warn('Testimonials listener warning:', err)
    );
  }

  /* =========================================================================
   * 5. STOREFRONT RENDERING (DYNAMIC CATEGORIES, SEARCH, SORT, GRID)
   * ========================================================================= */
  function renderStorefront() {
    renderCategoryPills();
    renderProductsGrid();
    updateBadges();
  }

  function renderCategoryPills() {
    const wrap = document.getElementById('category-pills');
    if (!wrap) return;
    const uniqueCats = Array.from(new Set(state.products.map(p => (p.category || '').trim()).filter(Boolean)));
    const categories = ['الكل', ...uniqueCats];

    if (!categories.includes(state.activeCategory)) {
      state.activeCategory = 'الكل';
    }

    wrap.innerHTML = categories.map(cat => {
      const active = state.activeCategory === cat;
      return `
        <button onclick="filterByCategory('${escapeHTML(cat)}')" class="px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition shrink-0 ${
          active
            ? 'bg-slate-900 text-white shadow-sm'
            : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-400'
        }">
          ${escapeHTML(cat)}
        </button>`;
    }).join('');
  }

  function filterByCategory(cat) {
    state.activeCategory = cat;
    renderCategoryPills();
    renderProductsGrid();
  }

  function handleSearch(val) {
    state.searchQuery = val.trim().toLowerCase();
    const d = document.getElementById('desktop-search');
    const m = document.getElementById('mobile-search');
    if (d && d.value !== val) d.value = val;
    if (m && m.value !== val) m.value = val;
    clearTimeout(state._searchTimer);
    state._searchTimer = setTimeout(() => renderProductsGrid(), 120);
  }

  function switchTestimonialsTab(tab) {
    state.activeTestimonialsTab = tab;
    const tBtn = document.getElementById('testi-tab-text');
    const iBtn = document.getElementById('testi-tab-images');
    if (tBtn) tBtn.className = `px-4 py-2 rounded-xl text-xs sm:text-sm transition ${tab === 'text' ? 'font-extrabold bg-emerald-600 text-white' : 'font-bold text-slate-600 hover:text-slate-900'}`;
    if (iBtn) iBtn.className = `px-4 py-2 rounded-xl text-xs sm:text-sm transition ${tab === 'image' ? 'font-extrabold bg-emerald-600 text-white' : 'font-bold text-slate-600 hover:text-slate-900'}`;
    renderTestimonials();
  }

  function renderTestimonials() {
    const grid = document.getElementById('testimonials-grid');
    if (!grid) return;
    const texts = state.testimonials.filter(t => t.type !== 'image');
    const images = state.testimonials.filter(t => t.type === 'image');
    const tc = document.getElementById('testi-text-count');
    const ic = document.getElementById('testi-img-count');
    if (tc) tc.textContent = texts.length;
    if (ic) ic.textContent = images.length;

    const list = state.activeTestimonialsTab === 'image' ? images : texts;
    if (!list.length) {
      grid.innerHTML = `<div class="col-span-full text-center py-8 text-xs sm:text-sm text-slate-400 font-bold">${state.activeTestimonialsTab === 'image' ? 'لا توجد صور آراء عملاء مضافة حالياً' : 'لا توجد آراء نصية مضافة حالياً'}</div>`;
      return;
    }

    if (state.activeTestimonialsTab === 'image') {
      grid.innerHTML = list.map((item, idx) => `
        <div class="relative rounded-2xl border-2 border-emerald-200 bg-emerald-50/40 p-2.5 shadow-xs flex flex-col gap-2">
          <span class="absolute top-4 right-4 z-10 px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-xs font-black shadow">#${idx + 1}</span>
          <div class="aspect-[4/3] rounded-xl overflow-hidden bg-white border border-slate-200">
            <img src="${escapeHTML(item.imageUrl || '')}" onerror="handleImgError(this, 'رأي عميل #${idx + 1}')" class="w-full h-full object-cover" loading="lazy" />
          </div>
          ${item.caption ? `<div class="text-xs font-bold text-slate-700 text-center px-1">${escapeHTML(item.caption)}</div>` : ''}
        </div>`).join('');
    } else {
      grid.innerHTML = list.map((item, idx) => `
        <div class="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-black">#${idx + 1}</span>
            <span class="text-amber-400 text-xs">${'★'.repeat(Number(item.rating || 5))}${'☆'.repeat(5 - Number(item.rating || 5))}</span>
          </div>
          <p class="text-xs sm:text-sm text-slate-700 leading-relaxed flex-1">"${escapeHTML(item.text || '')}"</p>
          <div class="text-xs font-extrabold text-slate-900 pt-2 border-t border-slate-200/80">— ${escapeHTML(item.name || 'عميل')}</div>
        </div>`).join('');
    }
  }

  function loadCustomerProfile() {
    try {
      const raw = localStorage.getItem('bayan_customer_profile_' + state.shopId);
      if (raw) state.customerProfile = JSON.parse(raw);
    } catch (_) { }
  }

  function saveCustomerProfile(profile) {
    state.customerProfile = profile;
    try {
      localStorage.setItem('bayan_customer_profile_' + state.shopId, JSON.stringify(profile));
      if (typeof BayanIDB !== 'undefined') BayanIDB.setSetting('customer_profile', profile);
    } catch (_) { }
  }

  function autofillCustomerForm(prefix) {
    const p = state.customerProfile;
    if (!p) return;
    const setVal = (id, v) => { const el = document.getElementById(id); if (el && v && !el.value) el.value = v; };
    setVal(`${prefix}-name`, p.name);
    setVal(`${prefix}-phone`, p.phone1);
    setVal(`${prefix}-alt-phone`, p.phone2);
    setVal(`${prefix}-address`, p.address);
    const govEl = document.getElementById(`${prefix}-gov`);
    if (govEl && p.govId && state.shippingRates.some(r => r.id === p.govId)) govEl.value = p.govId;
  }

  function handleSort(val) {
    state.sortBy = val;
    renderProductsGrid();
  }

  function resetStoreFilters() {
    state.activeCategory = 'الكل';
    state.searchQuery = '';
    state.sortBy = 'featured';
    const d = document.getElementById('desktop-search');
    const m = document.getElementById('mobile-search');
    const s = document.getElementById('sort-select');
    if (d) d.value = '';
    if (m) m.value = '';
    if (s) s.value = 'featured';
    renderStorefront();
  }

  function getProductAvgRating(prod) {
    const revs = prod.reviews || [];
    if (!revs.length) return { avg: '4.9', count: 0 };
    const sum = revs.reduce((acc, r) => acc + Number(r.rating || 5), 0);
    return { avg: (sum / revs.length).toFixed(1), count: revs.length };
  }

  function renderProductsGrid() {
    const loader = document.getElementById('products-loading-state');
    const grid = document.getElementById('products-grid');
    const empty = document.getElementById('empty-products-state');
    const countLabel = document.getElementById('products-count-label');

    if (!state.productsLoaded) {
      if (loader) loader.classList.remove('hidden');
      if (grid) grid.classList.add('hidden');
      if (empty) empty.classList.add('hidden');
      return;
    }

    if (loader) loader.classList.add('hidden');

    let list = [...state.products];

    if (state.activeCategory !== 'الكل') {
      list = list.filter(p => p.category === state.activeCategory);
    }

    if (state.searchQuery) {
      list = list.filter(p =>
        (p.name || '').toLowerCase().includes(state.searchQuery) ||
        (p.category || '').toLowerCase().includes(state.searchQuery) ||
        (p.code || '').toLowerCase().includes(state.searchQuery) ||
        (p.description || '').toLowerCase().includes(state.searchQuery)
      );
    }

    if (state.sortBy === 'price-asc') list.sort((a, b) => a.price - b.price);
    else if (state.sortBy === 'price-desc') list.sort((a, b) => b.price - a.price);
    else if (state.sortBy === 'newest') list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    else list.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));

    if (countLabel) countLabel.textContent = `${list.length} منتج`;

    if (!list.length) {
      grid.innerHTML = '';
      grid.classList.add('hidden');
      empty.classList.remove('hidden');
      const isFiltered = state.products.length > 0 && (state.activeCategory !== 'الكل' || state.searchQuery);
      document.getElementById('empty-products-title').textContent = isFiltered ? 'لا توجد منتجات مطابقة للبحث' : 'لا توجد منتجات منشورة حالياً';
      document.getElementById('empty-products-subtitle').textContent = isFiltered ? 'جرب تغيير الفلتر أو البحث بكلمة أخرى' : 'تابعنا قريباً لتصفح أحدث الموديلات والعروض';
      document.getElementById('empty-reset-btn').classList.toggle('hidden', !isFiltered);
      return;
    }

    empty.classList.add('hidden');
    grid.classList.remove('hidden');

    const wishSet = new Set(state.wishlist.map(w => w.id));

    grid.innerHTML = list.map(prod => {
      const discount = prod.oldPrice && prod.oldPrice > prod.price
        ? Math.round(((prod.oldPrice - prod.price) / prod.oldPrice) * 100)
        : 0;
      const img1 = (prod.images && prod.images[0]) || '';
      const img2 = (prod.images && prod.images[1]) || img1;
      const rating = getProductAvgRating(prod);
      const isWished = wishSet.has(prod.id);
      const outOfStock = (prod.stock || 0) <= 0 || prod.inStock === false;

      return `
        <article class="product-card group bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 overflow-hidden shadow-xs hover:shadow-xl hover:border-slate-300 transition-all duration-300 flex flex-col">
          <div onclick="openProductDetail('${escapeHTML(prod.id)}')" class="relative aspect-square bg-slate-100 overflow-hidden cursor-pointer">
            <img src="${escapeHTML(img1)}" onerror="handleImgError(this, '${escapeHTML(prod.name)}')" alt="${escapeHTML(prod.name)}" class="img-primary w-full h-full object-cover" loading="lazy" />
            ${img2 !== img1 ? `<img src="${escapeHTML(img2)}" onerror="handleImgError(this, '${escapeHTML(prod.name)}')" alt="${escapeHTML(prod.name)}" class="img-secondary absolute inset-0 w-full h-full object-cover" loading="lazy" />` : ''}

            <div class="absolute top-2.5 right-2.5 flex flex-col gap-1.5 z-10">
              ${discount > 0 ? `<span class="px-2 py-0.5 rounded-lg bg-brand text-white text-[11px] font-black shadow">خصم ${discount}%</span>` : ''}
              ${prod.featured ? `<span class="px-2 py-0.5 rounded-lg bg-slate-900/90 text-white text-[10px] font-bold">الأكثر مبيعاً</span>` : ''}
              ${outOfStock ? `<span class="px-2 py-0.5 rounded-lg bg-rose-700 text-white text-[10px] font-bold">نفذت الكمية</span>` : ''}
            </div>

            <button onclick="event.stopPropagation(); toggleWishlist('${escapeHTML(prod.id)}')" class="absolute top-2.5 left-2.5 z-10 w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white/90 hover:bg-white shadow-sm flex items-center justify-center transition ${isWished ? 'text-brand' : 'text-slate-500'}" title="المفضلة">
              <i class="${isWished ? 'fa-solid' : 'fa-regular'} fa-heart text-sm"></i>
            </button>
          </div>

          <div class="p-3 sm:p-4 flex-1 flex flex-col">
            <div class="flex items-center justify-between text-[11px] text-slate-500 mb-1">
              <span class="truncate">${escapeHTML(prod.category)}</span>
              <span class="flex items-center gap-0.5 text-amber-500 font-bold shrink-0">
                <i class="fa-solid fa-star text-[10px]"></i> ${rating.avg}
              </span>
            </div>

            <h3 onclick="openProductDetail('${escapeHTML(prod.id)}')" class="text-xs sm:text-sm font-extrabold text-slate-900 line-clamp-2 leading-snug cursor-pointer hover:text-brand transition mb-2 min-h-[36px] sm:min-h-[40px]">
              ${escapeHTML(prod.name)}
            </h3>

            <div class="flex items-baseline gap-2 mt-auto mb-3">
              <span class="text-sm sm:text-lg font-black text-brand">${formatEGP(prod.price)}</span>
              ${prod.oldPrice > prod.price ? `<span class="text-[11px] sm:text-xs text-slate-400 line-through font-bold">${formatEGP(prod.oldPrice)}</span>` : ''}
            </div>

            <div class="flex items-center gap-1.5">
              <button onclick="openProductDetail('${escapeHTML(prod.id)}')" ${outOfStock ? 'disabled' : ''} class="flex-1 btn-brand py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1 disabled:opacity-50">
                <i class="fa-solid fa-bolt text-[11px]"></i>
                <span>اطلب الآن</span>
              </button>
              <button onclick="quickAddToCart('${escapeHTML(prod.id)}')" ${outOfStock ? 'disabled' : ''} class="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-100 hover:bg-slate-900 hover:text-white text-slate-700 flex items-center justify-center transition shrink-0 disabled:opacity-50" title="أضف للسلة">
                <i class="fa-solid fa-cart-plus text-sm"></i>
              </button>
            </div>
          </div>
        </article>`;
    }).join('');
  }

  function updateBadges() {
    const cartCount = state.cart.reduce((s, item) => s + Number(item.qty || 0), 0);
    const cb = document.getElementById('cart-badge');
    if (cb) cb.textContent = cartCount;
    const pdCartBadge = document.getElementById('pd-cart-badge');
    if (pdCartBadge) pdCartBadge.textContent = cartCount;
    const mobCartBadge = document.getElementById('mobile-nav-cart-badge');
    if (mobCartBadge) {
      mobCartBadge.textContent = cartCount;
      mobCartBadge.classList.toggle('hidden', cartCount === 0);
    }

    const wishCount = state.wishlist.length;
    const wb = document.getElementById('wishlist-badge');
    if (wb) {
      wb.textContent = wishCount;
      wb.classList.toggle('hidden', wishCount === 0);
    }
  }

  /* =========================================================================
   * 6. PRODUCT DETAIL MODAL & DIRECT COD ORDERING
   * ========================================================================= */
  function openProductDetail(productId) {
    const prod = state.products.find(p => p.id === productId);
    if (!prod) return;

    state.currentProduct = prod;
    state.pdSelectedColor = (prod.colors && prod.colors[0]?.name) || '';
    state.pdSelectedSize = (prod.sizes && prod.sizes[0]) || '';
    state.pdSelectedTier = 1;
    state.pdActiveTab = 'desc';
    state.pdAppliedCoupon = null;

    document.getElementById('qo-coupon-input').value = '';
    document.getElementById('qo-coupon-msg').classList.add('hidden');
    document.getElementById('pd-size-guide').classList.add('hidden');
    document.getElementById('qo-payment').value = 'الدفع عند الاستلام';
    renderPaymentHint('qo-payment', 'qo-payment-hint');

    // Populate Governorates & Auto-fill saved customer data
    populateGovSelect('qo-gov');
    autofillCustomerForm('qo');

    document.getElementById('pd-topbar-title').textContent = prod.name;
    document.getElementById('pd-category').textContent = prod.category;
    document.getElementById('pd-title').textContent = prod.name;
    document.getElementById('pd-price').textContent = formatEGP(prod.price);

    const oldEl = document.getElementById('pd-old-price');
    const discBadge = document.getElementById('pd-discount-badge');
    if (prod.oldPrice && prod.oldPrice > prod.price) {
      oldEl.textContent = formatEGP(prod.oldPrice);
      oldEl.classList.remove('hidden');
      const pct = Math.round(((prod.oldPrice - prod.price) / prod.oldPrice) * 100);
      discBadge.textContent = `وفر ${pct}%`;
      discBadge.classList.remove('hidden');
    } else {
      oldEl.classList.add('hidden');
      discBadge.classList.add('hidden');
    }

    const stockPill = document.getElementById('pd-stock-pill');
    if (prod.stock > 5) {
      stockPill.className = 'mr-auto px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-700';
      stockPill.innerHTML = `<i class="fa-solid fa-check ml-1"></i>متوفر (${prod.stock} قطعة)`;
    } else if (prod.stock > 0) {
      stockPill.className = 'mr-auto px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-50 text-amber-700';
      stockPill.innerHTML = `<i class="fa-solid fa-fire ml-1"></i>باقي ${prod.stock} قطع فقط!`;
    } else {
      stockPill.className = 'mr-auto px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-50 text-rose-700';
      stockPill.innerHTML = 'نفذت الكمية';
    }

    const r = getProductAvgRating(prod);
    document.getElementById('pd-rating-summary').innerHTML = `
      <i class="fa-solid fa-star"></i>
      <span>${r.avg}</span>
      <span class="text-slate-400 font-semibold">(${r.count} تقييم)</span>`;

    const imgs = (prod.images && prod.images.length) ? prod.images : [''];
    const mainImg = document.getElementById('pd-main-img');
    mainImg.src = imgs[0];
    mainImg.onerror = () => handleImgError(mainImg, prod.name);

    const thumbsWrap = document.getElementById('pd-thumbnails');
    thumbsWrap.innerHTML = imgs.map((url, idx) => `
      <button type="button" onclick="selectPdImage('${escapeHTML(url)}', this)" class="pd-thumb w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden border-2 shrink-0 transition ${idx === 0 ? 'border-brand' : 'border-slate-200 opacity-75 hover:opacity-100'}">
        <img src="${escapeHTML(url)}" onerror="handleImgError(this, '${escapeHTML(prod.name)}')" class="w-full h-full object-cover" />
      </button>`).join('');

    const waClean = String(state.settings.whatsappNumber || '').replace(/\D/g, '');
    const qoWaBtn = document.getElementById('qo-whatsapp-btn');
    if (qoWaBtn) qoWaBtn.classList.toggle('hidden', !waClean);

    renderPdVariants();
    renderPdOfferTiers();
    renderPdWishlistBtn();
    renderPdTabContent();
    recalcQuickOrderSummary();

    const modal = document.getElementById('product-detail-modal');
    modal.classList.remove('hidden');
    modal.scrollTop = 0;
    document.body.style.overflow = 'hidden';
  }

  function closeProductDetail() {
    document.getElementById('product-detail-modal').classList.add('hidden');
    document.body.style.overflow = '';
  }

  function selectPdImage(url, btn) {
    const mainImg = document.getElementById('pd-main-img');
    mainImg.src = url;
    mainImg.onerror = () => handleImgError(mainImg, state.currentProduct?.name);
    document.querySelectorAll('.pd-thumb').forEach(b => {
      b.classList.remove('border-brand');
      b.classList.add('border-slate-200', 'opacity-75');
    });
    btn.classList.add('border-brand');
    btn.classList.remove('border-slate-200', 'opacity-75');
  }

  function renderPdVariants() {
    const prod = state.currentProduct;
    if (!prod) return;

    const colorsWrap = document.getElementById('pd-colors-wrap');
    const colors = prod.colors || [];
    if (!colors.length) {
      colorsWrap.classList.add('hidden');
    } else {
      colorsWrap.classList.remove('hidden');
      document.getElementById('pd-selected-color-name').textContent = state.pdSelectedColor;
      document.getElementById('pd-colors-list').innerHTML = colors.map(c => {
        const active = state.pdSelectedColor === c.name;
        return `
          <button type="button" onclick="selectPdColor('${escapeHTML(c.name)}')" class="flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 text-xs font-bold transition ${
            active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
          }">
            <span class="w-4 h-4 rounded-full border border-slate-300 shadow-inner" style="background:${escapeHTML(c.hex || '#111827')}"></span>
            <span>${escapeHTML(c.name)}</span>
          </button>`;
      }).join('');
    }

    const sizesWrap = document.getElementById('pd-sizes-wrap');
    const sizes = prod.sizes || [];
    if (!sizes.length) {
      sizesWrap.classList.add('hidden');
    } else {
      sizesWrap.classList.remove('hidden');
      document.getElementById('pd-selected-size-name').textContent = state.pdSelectedSize;
      document.getElementById('pd-sizes-list').innerHTML = sizes.map(sz => {
        const active = state.pdSelectedSize === sz;
        return `
          <button type="button" onclick="selectPdSize('${escapeHTML(sz)}')" class="min-w-[46px] px-3 py-2 rounded-xl border-2 text-xs sm:text-sm font-extrabold transition ${
            active ? 'border-brand bg-rose-50 text-brand' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
          }">
            ${escapeHTML(sz)}
          </button>`;
      }).join('');
    }
  }

  function selectPdColor(name) {
    state.pdSelectedColor = name;
    renderPdVariants();
  }

  function selectPdSize(sz) {
    state.pdSelectedSize = sz;
    renderPdVariants();
  }

  function toggleSizeGuide() {
    document.getElementById('pd-size-guide').classList.toggle('hidden');
  }

  function getOfferTiers(prod) {
    if (prod.enableOffers === false) {
      return [{ qty: 1, title: 'قطعة واحدة', badge: '', discPct: 0, freeShip: false }];
    }
    return [
      { qty: 1, title: 'قطعة واحدة', badge: '', discPct: 0, freeShip: false },
      { qty: 2, title: 'قطعتين (خصم إضافي 10%)', badge: 'الأكثر طلباً 🔥', discPct: 10, freeShip: false },
      { qty: 3, title: '3 قطع (خصم 15% + شحن مجاني!)', badge: 'أعلى توفير 🎁', discPct: 15, freeShip: true }
    ];
  }

  function renderPdOfferTiers() {
    const prod = state.currentProduct;
    if (!prod) return;
    const tiers = getOfferTiers(prod);
    const wrap = document.getElementById('pd-offer-tiers');

    wrap.innerHTML = tiers.map(t => {
      const rawTotal = prod.price * t.qty;
      const disc = Math.round(rawTotal * (t.discPct / 100));
      const net = rawTotal - disc;
      const active = state.pdSelectedTier === t.qty;

      return `
        <div onclick="selectPdTier(${t.qty})" class="tier-card ${active ? 'active' : 'border-slate-200 bg-white hover:border-slate-300'} border-2 rounded-2xl p-3 cursor-pointer transition flex items-center justify-between gap-2">
          <div class="flex items-center gap-2.5">
            <div class="w-5 h-5 rounded-full border-2 flex items-center justify-center ${active ? 'border-brand' : 'border-slate-300'}">
              ${active ? '<div class="w-2.5 h-2.5 rounded-full bg-brand"></div>' : ''}
            </div>
            <div>
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="text-xs sm:text-sm font-extrabold text-slate-900">${t.title}</span>
                ${t.badge ? `<span class="px-2 py-0.5 rounded-md bg-brand text-white text-[10px] font-black">${t.badge}</span>` : ''}
              </div>
              ${t.freeShip ? '<div class="text-[11px] font-bold text-emerald-600 mt-0.5"><i class="fa-solid fa-truck-fast ml-1"></i>شحن مجاني لجميع المحافظات</div>' : ''}
            </div>
          </div>
          <div class="text-left shrink-0">
            <div class="text-sm sm:text-base font-black text-slate-900">${formatEGP(net)}</div>
            ${disc > 0 ? `<div class="text-[11px] text-slate-400 line-through font-bold">${formatEGP(rawTotal)}</div>` : ''}
          </div>
        </div>`;
    }).join('');
  }

  function selectPdTier(qty) {
    state.pdSelectedTier = qty;
    renderPdOfferTiers();
    recalcQuickOrderSummary();
  }

  function populateGovSelect(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = state.shippingRates.map(r =>
      `<option value="${escapeHTML(r.id)}">${escapeHTML(r.name)} (${r.fee} ج.م)</option>`
    ).join('');
    if (currentVal && state.shippingRates.some(r => r.id === currentVal)) {
      sel.value = currentVal;
    }
  }

  function applyQuickOrderCoupon() {
    const code = document.getElementById('qo-coupon-input').value.trim().toUpperCase();
    const msg = document.getElementById('qo-coupon-msg');
    msg.classList.remove('hidden');

    if (!code) {
      state.pdAppliedCoupon = null;
      msg.className = 'text-xs font-bold mt-1 text-slate-500';
      msg.textContent = 'تم إلغاء الكوبون';
      recalcQuickOrderSummary();
      return;
    }

    const found = state.coupons.find(c => c.code.toUpperCase() === code && c.active);
    if (!found) {
      state.pdAppliedCoupon = null;
      msg.className = 'text-xs font-bold mt-1 text-rose-600';
      msg.textContent = 'كود الخصم غير صحيح أو منتهي الصلاحية';
    } else {
      state.pdAppliedCoupon = found;
      msg.className = 'text-xs font-bold mt-1 text-emerald-600';
      msg.textContent = `تم تطبيق الكوبون (${found.code}) بخصم ${found.type === 'percent' ? found.value + '%' : formatEGP(found.value)}`;
    }
    recalcQuickOrderSummary();
  }

  function getQuickOrderCalculation() {
    const prod = state.currentProduct;
    const tiers = getOfferTiers(prod);
    const tier = tiers.find(t => t.qty === state.pdSelectedTier) || tiers[0];

    const subtotal = prod.price * tier.qty;
    const tierDiscount = Math.round(subtotal * (tier.discPct / 100));
    const afterTier = subtotal - tierDiscount;

    let couponDiscount = 0;
    if (state.pdAppliedCoupon) {
      couponDiscount = state.pdAppliedCoupon.type === 'percent'
        ? Math.round(afterTier * (state.pdAppliedCoupon.value / 100))
        : Math.min(afterTier, state.pdAppliedCoupon.value);
    }

    const totalDiscount = tierDiscount + couponDiscount;
    const afterDiscounts = Math.max(0, subtotal - totalDiscount);
    const govId = document.getElementById('qo-gov').value;
    const gov = state.shippingRates.find(r => r.id === govId) || state.shippingRates[0] || { name: 'القاهرة', fee: 55 };
    const freeThreshold = Number(state.settings.freeShippingThreshold || 1500);
    const isFreeShipping = tier.freeShip || afterDiscounts >= freeThreshold;
    const shippingFee = isFreeShipping ? 0 : Number(gov.fee);
    const total = afterDiscounts + shippingFee;

    return { qty: tier.qty, subtotal, tierDiscount, couponDiscount, totalDiscount, shippingFee, total, govName: gov.name, isFreeShipping };
  }

  function recalcQuickOrderSummary() {
    if (!state.currentProduct) return;
    const calc = getQuickOrderCalculation();

    document.getElementById('qo-sum-qty').textContent = calc.qty;
    document.getElementById('qo-sum-subtotal').textContent = formatEGP(calc.subtotal);

    const tierRow = document.getElementById('qo-sum-tier-row');
    if (calc.tierDiscount > 0) {
      tierRow.classList.remove('hidden');
      tierRow.classList.add('flex');
      document.getElementById('qo-sum-tier-disc').textContent = `-${formatEGP(calc.tierDiscount)}`;
    } else {
      tierRow.classList.add('hidden');
      tierRow.classList.remove('flex');
    }

    const cRow = document.getElementById('qo-sum-coupon-row');
    if (calc.couponDiscount > 0 && state.pdAppliedCoupon) {
      cRow.classList.remove('hidden');
      cRow.classList.add('flex');
      document.getElementById('qo-sum-coupon-code').textContent = state.pdAppliedCoupon.code;
      document.getElementById('qo-sum-coupon-disc').textContent = `-${formatEGP(calc.couponDiscount)}`;
    } else {
      cRow.classList.add('hidden');
      cRow.classList.remove('flex');
    }

    document.getElementById('qo-sum-shipping').innerHTML = calc.isFreeShipping
      ? '<span class="text-emerald-600 font-black">مجاني 🎉</span>'
      : formatEGP(calc.shippingFee);

    document.getElementById('qo-sum-total').textContent = formatEGP(calc.total);
    document.getElementById('pd-sticky-total').textContent = formatEGP(calc.total);
  }

  function scrollToQuickForm() {
    document.getElementById('pd-cod-form-container').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function saveOrderToFirestore(orderPayload) {
    const db = typeof getBayanDb === 'function' ? getBayanDb() : null;
    if (!db) throw new Error('تعذر الاتصال بقاعدة البيانات السحابية');
    await db.collection('orders').doc(orderPayload.id).set(orderPayload);
    try {
      if (typeof BayanIDB !== 'undefined' && typeof BayanIDB.setOrder === 'function') {
        await BayanIDB.setOrder(orderPayload);
      }
    } catch (_) { }
  }

  async function submitQuickOrder(e) {
    e.preventDefault();
    if (state.submittingOrder) return;
    const prod = state.currentProduct;
    if (!prod) return;
    if (prod.stock <= 0 || prod.inStock === false) {
      showToast('عذراً، هذا المنتج غير متوفر حالياً بالمخزون', 'error');
      return;
    }

    const name = document.getElementById('qo-name').value.trim();
    const phone1 = document.getElementById('qo-phone').value.trim();
    const phone2 = document.getElementById('qo-alt-phone').value.trim();
    const address = document.getElementById('qo-address').value.trim();
    const paymentMethod = document.getElementById('qo-payment').value;

    if (!isValidEgyptPhone(phone1)) {
      showToast('يرجى إدخال رقم موبايل مصري صحيح (11 رقم يبدأ بـ 01)', 'error');
      document.getElementById('qo-phone').focus();
      return;
    }

    const calc = getQuickOrderCalculation();
    const orderId = generateOrderId();
    const nowIso = new Date().toISOString();

    const order = {
      shop_id: state.shopId,
      id: orderId,
      customerName: name,
      phone1,
      phone2,
      city: calc.govName,
      address,
      notes: '',
      date: nowIso,
      createdAt: nowIso,
      status: 'new',
      deliveryFee: calc.shippingFee,
      shippingFee: calc.shippingFee,
      discountAmount: calc.totalDiscount,
      couponCode: state.pdAppliedCoupon ? state.pdAppliedCoupon.code : '',
      subtotal: calc.subtotal,
      grandTotal: calc.total,
      paymentMethod,
      items: [{
        productId: prod.id,
        pos_id: prod.pos_id || '',
        code: prod.code || '',
        barcode: prod.barcode || '',
        name: prod.name,
        image: (prod.images && prod.images[0]) || '',
        size: state.pdSelectedSize || '',
        color: state.pdSelectedColor || '',
        qty: calc.qty,
        price: prod.price,
        unitPrice: prod.price,
        total: prod.price * calc.qty
      }]
    };

    const btn = document.getElementById('qo-submit-btn');
    state.submittingOrder = true;
    if (btn) btn.disabled = true;

    try {
      saveCustomerProfile({ name, phone1, phone2, address, govId: document.getElementById('qo-gov').value });
      await saveOrderToFirestore(order);
      closeProductDetail();
      document.getElementById('pd-quick-order-form').reset();
      showOrderSuccessModal(order);
    } catch (err) {
      console.error('Order submit error:', err);
      showToast('حدث خطأ أثناء إرسال الطلب، يرجى المحاولة مرة أخرى', 'error');
    } finally {
      state.submittingOrder = false;
      if (btn) btn.disabled = false;
    }
  }

  function orderViaWhatsApp() {
    const prod = state.currentProduct;
    const waNum = String(state.settings.whatsappNumber || '').replace(/\D/g, '');
    if (!prod || !waNum) return;
    const calc = getQuickOrderCalculation();
    const name = document.getElementById('qo-name').value.trim() || 'عميل جديد';
    const phone = document.getElementById('qo-phone').value.trim() || '-';
    const address = document.getElementById('qo-address').value.trim() || '-';
    const payment = document.getElementById('qo-payment').value;

    const msg = [
      `أهلاً ${state.settings.storeName} 👋`,
      `أرغب في طلب المنتج التالي:`,
      `• المنتج: ${prod.name}`,
      state.pdSelectedColor ? `• اللون: ${state.pdSelectedColor}` : null,
      state.pdSelectedSize ? `• المقاس: ${state.pdSelectedSize}` : null,
      `• الكمية: ${calc.qty}`,
      `• الإجمالي شامل الشحن: ${formatEGP(calc.total)}`,
      `• طريقة الدفع: ${payment}`,
      `--- بيانات العميل ---`,
      `الاسم: ${name}`,
      `الموبايل: ${phone}`,
      `المحافظة: ${calc.govName}`,
      `العنوان: ${address}`
    ].filter(Boolean).join('\n');

    window.open(`https://wa.me/${waNum}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  /* =========================================================================
   * 7. PRODUCT TABS & REVIEWS (SAVED TO FIRESTORE)
   * ========================================================================= */
  function switchPdTab(tab) {
    state.pdActiveTab = tab;
    document.querySelectorAll('.pd-tab-btn').forEach(btn => {
      const isActive = btn.dataset.pdtab === tab;
      btn.className = `pd-tab-btn px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm shrink-0 transition ${
        isActive ? 'font-extrabold bg-slate-900 text-white' : 'font-bold text-slate-600 hover:bg-slate-100'
      }`;
    });
    renderPdTabContent();
  }

  function renderPdTabContent() {
    const prod = state.currentProduct;
    if (!prod) return;
    const revs = prod.reviews || [];
    document.querySelectorAll('.pd-reviews-count').forEach(el => (el.textContent = revs.length));

    let html = '';
    if (state.pdActiveTab === 'desc') {
      html = `
        <div class="space-y-3 text-xs sm:text-sm text-slate-700 leading-relaxed">
          <p>${escapeHTML(prod.description || 'منتج عالي الجودة بخامات مختارة بعناية وتقفيل دقيق.')}</p>
          <ul class="space-y-1.5 pt-2 border-t border-slate-100 text-slate-600">
            <li><i class="fa-solid fa-circle-check text-emerald-500 ml-1.5"></i>خامات مختارة بعناية ومطابقة للصور 100%</li>
            <li><i class="fa-solid fa-circle-check text-emerald-500 ml-1.5"></i>إمكانية فتح الشحنة ومعاينة المنتج قبل الدفع</li>
            <li><i class="fa-solid fa-circle-check text-emerald-500 ml-1.5"></i>ضمان استبدال مجاني في حالة وجود أي عيب صناعة</li>
          </ul>
        </div>`;
    } else if (state.pdActiveTab === 'shipping') {
      html = `
        <div class="space-y-2.5 text-xs sm:text-sm text-slate-700 leading-relaxed">
          <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200">
            <strong class="text-slate-900 block mb-1"><i class="fa-solid fa-truck text-brand ml-1.5"></i>مدة التوصيل:</strong>
            القاهرة والجيزة خلال 24 - 48 ساعة عمل، وباقي المحافظات خلال 2 - 4 أيام عمل.
          </div>
          <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200">
            <strong class="text-slate-900 block mb-1"><i class="fa-solid fa-rotate-left text-emerald-600 ml-1.5"></i>سياسة الاستبدال والاسترجاع:</strong>
            يمكنك استبدال المقاس أو إرجاع المنتج خلال 14 يوم من تاريخ الاستلام بشرط وجود المنتج بحالته الأصلية.
          </div>
        </div>`;
    } else {
      html = `
        <div class="space-y-4">
          <div class="space-y-2.5 max-h-60 overflow-y-auto pl-1">
            ${revs.length ? revs.map(r => `
              <div class="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs font-extrabold text-slate-900">${escapeHTML(r.name)}</span>
                  <span class="text-amber-400 text-xs">${'★'.repeat(Number(r.rating || 5))}${'☆'.repeat(5 - Number(r.rating || 5))}</span>
                </div>
                <p class="text-xs text-slate-600">${escapeHTML(r.comment)}</p>
                <div class="text-[10px] text-slate-400 mt-1">${escapeHTML(r.date || '')}</div>
              </div>`).join('') : '<p class="text-xs text-slate-400 text-center py-4">لا توجد تقييمات بعد، كن أول من يقيّم هذا المنتج!</p>'}
          </div>

          <form onsubmit="submitProductReview(event)" class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div class="text-xs font-extrabold text-slate-800">أضف تقييمك للمنتج</div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input type="text" name="revName" required placeholder="اسمك" class="bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none" />
              <select name="revRating" class="bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold outline-none">
                <option value="5">★★★★★ ممتاز (5/5)</option>
                <option value="4">★★★★☆ جيد جداً (4/5)</option>
                <option value="3">★★★☆☆ جيد (3/5)</option>
                <option value="2">★★☆☆☆ مقبول (2/5)</option>
                <option value="1">★☆☆☆☆ ضعيف (1/5)</option>
              </select>
            </div>
            <textarea name="revComment" required rows="2" placeholder="اكتب تجربتك مع المنتج..." class="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none"></textarea>
            <button type="submit" class="btn-brand px-4 py-2 rounded-xl text-xs font-extrabold">إرسال التقييم</button>
          </form>
        </div>`;
    }

    document.getElementById('pd-tab-content-desktop').innerHTML = html;
    document.getElementById('pd-tab-content-mobile').innerHTML = html;
  }

  async function submitProductReview(e) {
    e.preventDefault();
    const form = e.target;
    const prod = state.currentProduct;
    if (!prod) return;

    const review = {
      id: 'rev-' + Date.now(),
      name: form.revName.value.trim(),
      rating: Number(form.revRating.value),
      comment: form.revComment.value.trim(),
      date: new Date().toISOString().slice(0, 10)
    };

    const updatedReviews = [review, ...(prod.reviews || [])];
    prod.reviews = updatedReviews;

    try {
      const db = typeof getBayanDb === 'function' ? getBayanDb() : null;
      if (db) {
        await db.collection('products').doc(prod.id).set({ reviews: updatedReviews }, { merge: true });
      }
      renderPdTabContent();
      const r = getProductAvgRating(prod);
      document.getElementById('pd-rating-summary').innerHTML = `
        <i class="fa-solid fa-star"></i><span>${r.avg}</span><span class="text-slate-400 font-semibold">(${r.count} تقييم)</span>`;
      showToast('شكراً لك! تم حفظ تقييمك بنجاح');
    } catch (_) {
      showToast('تعذر حفظ التقييم حالياً', 'error');
    }
  }

  /* =========================================================================
   * 8. CART DRAWER & MULTI-ITEM CHECKOUT
   * ========================================================================= */
  async function quickAddToCart(productId) {
    const prod = state.products.find(p => p.id === productId);
    if (!prod || prod.stock <= 0 || prod.inStock === false) return;
    const color = (prod.colors && prod.colors[0]?.name) || '';
    const size = (prod.sizes && prod.sizes[0]) || '';
    await addItemToCart(prod, color, size, 1);
    showToast(`تمت إضافة "${prod.name}" إلى السلة`);
  }

  async function addCurrentProductToCart() {
    const prod = state.currentProduct;
    if (!prod) return;
    if (prod.stock <= 0 || prod.inStock === false) {
      showToast('هذا المنتج غير متوفر حالياً', 'error');
      return;
    }
    await addItemToCart(prod, state.pdSelectedColor, state.pdSelectedSize, state.pdSelectedTier);
    showToast('تمت الإضافة إلى سلة المشتريات بنجاح');
    openCartDrawer();
  }

  async function addItemToCart(prod, color, size, qty) {
    const key = `${prod.id}__${color}__${size}`;
    const existing = state.cart.find(c => c.key === key);
    if (existing) {
      existing.qty += qty;
    } else {
      state.cart.push({
        key,
        productId: prod.id,
        pos_id: prod.pos_id || '',
        code: prod.code || '',
        barcode: prod.barcode || '',
        name: prod.name,
        image: (prod.images && prod.images[0]) || '',
        color: color || '',
        size: size || '',
        qty,
        unitPrice: prod.price
      });
    }
    await saveCart();
  }

  function openCartDrawer() {
    renderCartDrawer();
    document.getElementById('cart-drawer-overlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeCartDrawer() {
    document.getElementById('cart-drawer-overlay').classList.add('hidden');
    if (document.getElementById('product-detail-modal').classList.contains('hidden')) {
      document.body.style.overflow = '';
    }
  }

  function renderCartDrawer() {
    const listEl = document.getElementById('cart-items-list');
    const footerEl = document.getElementById('cart-drawer-footer');
    const freeBar = document.getElementById('free-shipping-bar');
    const totalQty = state.cart.reduce((s, i) => s + i.qty, 0);
    const subtotal = state.cart.reduce((s, i) => s + i.unitPrice * i.qty, 0);
    const threshold = Number(state.settings.freeShippingThreshold || 1500);

    document.getElementById('drawer-cart-count').textContent = totalQty;
    document.getElementById('cart-subtotal-label').textContent = formatEGP(subtotal);

    if (subtotal >= threshold) {
      freeBar.innerHTML = `<div class="text-emerald-600 flex items-center gap-1.5"><i class="fa-solid fa-circle-check"></i>مبروك! حصلت على شحن مجاني لطلبك 🎉</div>`;
    } else {
      const remain = threshold - subtotal;
      const pct = Math.min(100, Math.round((subtotal / threshold) * 100));
      freeBar.innerHTML = `
        <div class="mb-1.5">أضف منتجات بقيمة <strong class="text-brand">${formatEGP(remain)}</strong> للحصول على شحن مجاني!</div>
        <div class="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div class="h-full bg-brand rounded-full transition-all" style="width:${pct}%"></div>
        </div>`;
    }

    if (!state.cart.length) {
      listEl.innerHTML = `
        <div class="text-center py-14">
          <i class="fa-solid fa-bag-shopping text-4xl text-slate-300 mb-3"></i>
          <div class="font-extrabold text-slate-700">سلة المشتريات فارغة</div>
          <p class="text-xs text-slate-400 mt-1">تصفح المنتجات وأضف ما يعجبك هنا</p>
        </div>`;
      footerEl.classList.add('hidden');
      return;
    }

    footerEl.classList.remove('hidden');
    listEl.innerHTML = state.cart.map(item => `
      <div class="flex gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200">
        <img src="${escapeHTML(item.image)}" onerror="handleImgError(this, '${escapeHTML(item.name)}')" class="w-18 h-18 rounded-xl object-cover shrink-0 bg-white border border-slate-200" />
        <div class="flex-1 min-w-0">
          <div class="text-xs sm:text-sm font-extrabold text-slate-900 truncate">${escapeHTML(item.name)}</div>
          <div class="text-[11px] text-slate-500 font-semibold mt-0.5">
            ${[item.color, item.size].filter(Boolean).map(escapeHTML).join(' • ') || 'افتراضي'}
          </div>
          <div class="flex items-center justify-between mt-2">
            <span class="text-sm font-black text-brand">${formatEGP(item.unitPrice * item.qty)}</span>
            <div class="flex items-center gap-1.5">
              <button onclick="updateCartQty('${escapeHTML(item.key)}', -1)" class="w-7 h-7 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold hover:bg-slate-100">-</button>
              <span class="text-xs font-extrabold w-5 text-center">${item.qty}</span>
              <button onclick="updateCartQty('${escapeHTML(item.key)}', 1)" class="w-7 h-7 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold hover:bg-slate-100">+</button>
              <button onclick="removeCartItem('${escapeHTML(item.key)}')" class="w-7 h-7 rounded-lg text-rose-500 hover:bg-rose-50 mr-1"><i class="fa-solid fa-trash-can text-xs"></i></button>
            </div>
          </div>
        </div>
      </div>`).join('');
  }

  async function updateCartQty(key, delta) {
    const item = state.cart.find(c => c.key === key);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
      state.cart = state.cart.filter(c => c.key !== key);
    }
    await saveCart();
    renderCartDrawer();
  }

  async function removeCartItem(key) {
    state.cart = state.cart.filter(c => c.key !== key);
    await saveCart();
    renderCartDrawer();
  }

  function openCartCheckoutModal() {
    if (!state.cart.length) return;
    closeCartDrawer();
    state.ccAppliedCoupon = null;
    document.getElementById('cc-coupon-input').value = '';
    document.getElementById('cc-coupon-msg').classList.add('hidden');
    document.getElementById('cc-payment').value = 'الدفع عند الاستلام';
    renderPaymentHint('cc-payment', 'cc-payment-hint');
    populateGovSelect('cc-gov');
    autofillCustomerForm('cc');
    recalcCartCheckoutSummary();
    document.getElementById('cart-checkout-modal').classList.remove('hidden');
  }

  function closeCartCheckoutModal() {
    document.getElementById('cart-checkout-modal').classList.add('hidden');
  }

  function applyCartCoupon() {
    const code = document.getElementById('cc-coupon-input').value.trim().toUpperCase();
    const msg = document.getElementById('cc-coupon-msg');
    msg.classList.remove('hidden');
    if (!code) {
      state.ccAppliedCoupon = null;
      msg.className = 'text-[11px] font-bold mt-1 text-slate-500';
      msg.textContent = 'تم إلغاء الكوبون';
      recalcCartCheckoutSummary();
      return;
    }
    const found = state.coupons.find(c => c.code.toUpperCase() === code && c.active);
    if (!found) {
      state.ccAppliedCoupon = null;
      msg.className = 'text-[11px] font-bold mt-1 text-rose-600';
      msg.textContent = 'كود الخصم غير صالح';
    } else {
      state.ccAppliedCoupon = found;
      msg.className = 'text-[11px] font-bold mt-1 text-emerald-600';
      msg.textContent = `تم تطبيق (${found.code})`;
    }
    recalcCartCheckoutSummary();
  }

  function getCartCheckoutCalculation() {
    const subtotal = state.cart.reduce((s, i) => s + i.unitPrice * i.qty, 0);
    let couponDiscount = 0;
    if (state.ccAppliedCoupon) {
      couponDiscount = state.ccAppliedCoupon.type === 'percent'
        ? Math.round(subtotal * (state.ccAppliedCoupon.value / 100))
        : Math.min(subtotal, state.ccAppliedCoupon.value);
    }
    const afterDisc = Math.max(0, subtotal - couponDiscount);
    const govId = document.getElementById('cc-gov').value;
    const gov = state.shippingRates.find(r => r.id === govId) || state.shippingRates[0] || { name: 'القاهرة', fee: 55 };
    const threshold = Number(state.settings.freeShippingThreshold || 1500);
    const isFreeShipping = afterDisc >= threshold;
    const shippingFee = isFreeShipping ? 0 : Number(gov.fee);
    return { subtotal, couponDiscount, shippingFee, total: afterDisc + shippingFee, govName: gov.name, isFreeShipping };
  }

  function recalcCartCheckoutSummary() {
    const calc = getCartCheckoutCalculation();
    document.getElementById('cc-sum-subtotal').textContent = formatEGP(calc.subtotal);
    const cRow = document.getElementById('cc-sum-coupon-row');
    if (calc.couponDiscount > 0) {
      cRow.classList.remove('hidden');
      cRow.classList.add('flex');
      document.getElementById('cc-sum-coupon').textContent = `-${formatEGP(calc.couponDiscount)}`;
    } else {
      cRow.classList.add('hidden');
      cRow.classList.remove('flex');
    }
    document.getElementById('cc-sum-shipping').innerHTML = calc.isFreeShipping
      ? '<span class="text-emerald-600 font-black">مجاني 🎉</span>'
      : formatEGP(calc.shippingFee);
    document.getElementById('cc-sum-total').textContent = formatEGP(calc.total);
  }

  async function submitCartCheckout(e) {
    e.preventDefault();
    if (state.submittingOrder || !state.cart.length) return;

    const name = document.getElementById('cc-name').value.trim();
    const phone1 = document.getElementById('cc-phone').value.trim();
    const phone2 = document.getElementById('cc-alt-phone').value.trim();
    const address = document.getElementById('cc-address').value.trim();
    const paymentMethod = document.getElementById('cc-payment').value;

    if (!isValidEgyptPhone(phone1)) {
      showToast('يرجى إدخال رقم موبايل مصري صحيح (11 رقم يبدأ بـ 01)', 'error');
      document.getElementById('cc-phone').focus();
      return;
    }

    const calc = getCartCheckoutCalculation();
    const orderId = generateOrderId();
    const nowIso = new Date().toISOString();

    const order = {
      shop_id: state.shopId,
      id: orderId,
      customerName: name,
      phone1,
      phone2,
      city: calc.govName,
      address,
      notes: '',
      date: nowIso,
      createdAt: nowIso,
      status: 'new',
      deliveryFee: calc.shippingFee,
      shippingFee: calc.shippingFee,
      discountAmount: calc.couponDiscount,
      couponCode: state.ccAppliedCoupon ? state.ccAppliedCoupon.code : '',
      subtotal: calc.subtotal,
      grandTotal: calc.total,
      paymentMethod,
      items: state.cart.map(i => ({
        productId: i.productId,
        pos_id: i.pos_id || '',
        code: i.code || '',
        barcode: i.barcode || '',
        name: i.name,
        image: i.image || '',
        size: i.size || '',
        color: i.color || '',
        qty: i.qty,
        price: i.unitPrice,
        unitPrice: i.unitPrice,
        total: i.unitPrice * i.qty
      }))
    };

    const btn = document.getElementById('cc-submit-btn');
    state.submittingOrder = true;
    if (btn) btn.disabled = true;

    try {
      saveCustomerProfile({ name, phone1, phone2, address, govId: document.getElementById('qo-gov').value });
      await saveOrderToFirestore(order);
      state.cart = [];
      await saveCart();
      closeCartCheckoutModal();
      document.getElementById('cart-checkout-form').reset();
      showOrderSuccessModal(order);
    } catch (err) {
      console.error('Cart checkout error:', err);
      showToast('حدث خطأ أثناء إرسال الطلب، يرجى المحاولة مرة أخرى', 'error');
    } finally {
      state.submittingOrder = false;
      if (btn) btn.disabled = false;
    }
  }

  /* =========================================================================
   * 9. ORDER SUCCESS, TRACKING & WISHLIST MODALS
   * ========================================================================= */
  function showOrderSuccessModal(order) {
    document.getElementById('success-order-id').textContent = order.id;
    document.getElementById('success-order-name').textContent = order.customerName;
    document.getElementById('success-order-total').textContent = formatEGP(order.grandTotal);

    const waNum = String(state.settings.whatsappNumber || '').replace(/\D/g, '');
    const waLink = document.getElementById('success-wa-link');
    if (waNum && waLink) {
      const msg = `مرحباً ${state.settings.storeName}، قمت بعمل طلب جديد رقم: ${order.id}\nالاسم: ${order.customerName}\nالإجمالي: ${formatEGP(order.grandTotal)}`;
      waLink.href = `https://wa.me/${waNum}?text=${encodeURIComponent(msg)}`;
      waLink.classList.remove('hidden');
    } else if (waLink) {
      waLink.classList.add('hidden');
    }
    document.getElementById('order-success-modal').classList.remove('hidden');
  }

  function closeOrderSuccessModal() {
    document.getElementById('order-success-modal').classList.add('hidden');
  }

  function openTrackOrderModal() {
    document.getElementById('track-order-modal').classList.remove('hidden');
  }

  function closeTrackOrderModal() {
    document.getElementById('track-order-modal').classList.add('hidden');
  }

  async function searchTrackOrder(e) {
    e.preventDefault();
    const q = document.getElementById('track-query-input').value.trim();
    const area = document.getElementById('track-results-area');
    if (!q) return;

    area.innerHTML = '<div class="text-center py-6 text-xs text-slate-500 font-bold"><i class="fa-solid fa-spinner fa-spin ml-1"></i>جاري البحث عن طلبك...</div>';

    try {
      const db = typeof getBayanDb === 'function' ? getBayanDb() : null;
      if (!db) throw new Error('offline');

      const foundMap = new Map();
      const qUpper = q.toUpperCase();

      // Direct doc lookup by Order ID
      const byIdDoc = await db.collection('orders').doc(qUpper).get();
      if (byIdDoc.exists) {
        foundMap.set(byIdDoc.id, { id: byIdDoc.id, ...(byIdDoc.data() || {}) });
      }

      // Query by phone1
      if (foundMap.size === 0) {
        const byPhoneSnap = await db.collection('orders').where('phone1', '==', q).get();
        byPhoneSnap.forEach(doc => foundMap.set(doc.id, { id: doc.id, ...(doc.data() || {}) }));
      }

      const matches = Array.from(foundMap.values()).sort((a, b) =>
        String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || ''))
      );

      if (!matches.length) {
        area.innerHTML = `
          <div class="text-center py-8 bg-slate-50 rounded-2xl border border-slate-200">
            <i class="fa-solid fa-circle-xmark text-3xl text-rose-400 mb-2"></i>
            <div class="font-extrabold text-sm text-slate-800">لم يتم العثور على طلبات مطابقة</div>
            <div class="text-xs text-slate-500 mt-1">تأكد من رقم الطلب أو رقم الموبايل وحاول مرة أخرى</div>
          </div>`;
        return;
      }

      const steps = ['تم الاستلام', 'قيد التجهيز', 'تم الشحن', 'تم التسليم'];

      area.innerHTML = matches.map(ord => {
        const st = STATUS_MAP[ord.status] || STATUS_MAP.new;
        const itemsHtml = (ord.items || []).map(i =>
          `<div class="text-xs text-slate-600">• ${escapeHTML(i.name)} ${i.size ? `(${escapeHTML(i.size)})` : ''} ${i.color ? `- ${escapeHTML(i.color)}` : ''} × ${i.qty}</div>`
        ).join('');

        return `
          <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div class="flex items-center justify-between gap-2">
              <div>
                <div class="font-mono font-black text-sm text-slate-950">${escapeHTML(ord.id)}</div>
                <div class="text-[11px] text-slate-500">${escapeHTML(ord.customerName || '')} • ${escapeHTML(ord.city || '')}</div>
              </div>
              <span class="px-2.5 py-1 rounded-xl text-xs font-extrabold ${st.cls}">${st.label}</span>
            </div>

            ${st.idx >= 0 ? `
              <div class="grid grid-cols-4 gap-1 pt-1">
                ${steps.map((s, idx) => `
                  <div class="text-center">
                    <div class="h-1.5 rounded-full mb-1 ${idx <= st.idx ? 'bg-brand' : 'bg-slate-200'}"></div>
                    <div class="text-[10px] font-bold ${idx <= st.idx ? 'text-slate-900' : 'text-slate-400'}">${s}</div>
                  </div>`).join('')}
              </div>` : ''}

            <div class="pt-2 border-t border-slate-200 space-y-1">
              ${itemsHtml}
              <div class="flex justify-between pt-1.5 text-xs font-black text-slate-900">
                <span>الإجمالي:</span>
                <span class="text-brand">${formatEGP(ord.grandTotal ?? ord.total ?? 0)}</span>
              </div>
            </div>
          </div>`;
      }).join('');
    } catch (err) {
      console.error('Track order error:', err);
      area.innerHTML = '<div class="text-center py-6 text-xs text-rose-600 font-bold">تعذر الاتصال بالخادم حالياً، يرجى المحاولة لاحقاً</div>';
    }
  }

  async function toggleWishlist(productId) {
    const exists = state.wishlist.some(w => w.id === productId);
    if (exists) {
      state.wishlist = state.wishlist.filter(w => w.id !== productId);
      showToast('تمت الإزالة من المفضلة', 'info');
    } else {
      state.wishlist.push({ id: productId, addedAt: Date.now() });
      showToast('تمت الإضافة إلى المفضلة ❤️');
    }
    await saveWishlist();
    renderProductsGrid();
    renderPdWishlistBtn();
  }

  function toggleCurrentProductWishlist() {
    if (!state.currentProduct) return;
    toggleWishlist(state.currentProduct.id);
  }

  function renderPdWishlistBtn() {
    const btn = document.getElementById('pd-wishlist-btn');
    if (!btn || !state.currentProduct) return;
    const isWished = state.wishlist.some(w => w.id === state.currentProduct.id);
    btn.className = `w-9 h-9 rounded-xl border flex items-center justify-center transition ${
      isWished ? 'border-brand bg-rose-50 text-brand' : 'border-slate-200 hover:bg-rose-50 text-slate-600'
    }`;
    btn.innerHTML = `<i class="${isWished ? 'fa-solid' : 'fa-regular'} fa-heart"></i>`;
  }

  function openWishlistModal() {
    const area = document.getElementById('wishlist-items-area');
    const wishedProds = state.wishlist
      .map(w => state.products.find(p => p.id === w.id))
      .filter(Boolean);

    if (!wishedProds.length) {
      area.innerHTML = `
        <div class="text-center py-10">
          <i class="fa-regular fa-heart text-4xl text-slate-300 mb-2"></i>
          <div class="font-bold text-slate-700 text-sm">قائمة المفضلة فارغة</div>
        </div>`;
    } else {
      area.innerHTML = wishedProds.map(p => `
        <div class="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200">
          <img src="${escapeHTML((p.images && p.images[0]) || '')}" onerror="handleImgError(this, '${escapeHTML(p.name)}')" class="w-16 h-16 rounded-xl object-cover bg-white shrink-0" />
          <div class="flex-1 min-w-0">
            <div class="font-extrabold text-sm text-slate-900 truncate">${escapeHTML(p.name)}</div>
            <div class="text-brand font-black text-sm mt-0.5">${formatEGP(p.price)}</div>
          </div>
          <div class="flex items-center gap-1.5">
            <button onclick="closeWishlistModal(); openProductDetail('${escapeHTML(p.id)}')" class="btn-brand px-3 py-2 rounded-xl text-xs font-extrabold">اطلب</button>
            <button onclick="toggleWishlist('${escapeHTML(p.id)}'); openWishlistModal()" class="w-8 h-8 rounded-xl bg-white border border-slate-200 text-rose-500"><i class="fa-solid fa-trash-can text-xs"></i></button>
          </div>
        </div>`).join('');
    }
    document.getElementById('wishlist-modal').classList.remove('hidden');
  }

  function closeWishlistModal() {
    document.getElementById('wishlist-modal').classList.add('hidden');
  }

  /* =========================================================================
   * 10. BOOTSTRAP
   * ========================================================================= */
  async function initStorefront() {
    state.shopId = typeof getActiveShopId === 'function' ? getActiveShopId() : 'SHOP_DEMO';
    loadCustomerProfile();
    applyBranding();
    await loadLocalState();
    updateBadges();
    initFirestoreListeners();
  }

  // Expose handlers for inline HTML attributes
  Object.assign(window, {
    switchTestimonialsTab,
    handleImgError,
    resolveConfirm,
    copyText,
    validateEgyptPhoneInput,
    renderPaymentHint,
    filterByCategory,
    handleSearch,
    handleSort,
    resetStoreFilters,
    openProductDetail,
    closeProductDetail,
    selectPdImage,
    selectPdColor,
    selectPdSize,
    toggleSizeGuide,
    selectPdTier,
    applyQuickOrderCoupon,
    recalcQuickOrderSummary,
    scrollToQuickForm,
    submitQuickOrder,
    orderViaWhatsApp,
    switchPdTab,
    submitProductReview,
    quickAddToCart,
    addCurrentProductToCart,
    openCartDrawer,
    closeCartDrawer,
    updateCartQty,
    removeCartItem,
    openCartCheckoutModal,
    closeCartCheckoutModal,
    applyCartCoupon,
    recalcCartCheckoutSummary,
    submitCartCheckout,
    closeOrderSuccessModal,
    openTrackOrderModal,
    closeTrackOrderModal,
    searchTrackOrder,
    toggleWishlist,
    toggleCurrentProductWishlist,
    openWishlistModal,
    closeWishlistModal
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStorefront);
  } else {
    initStorefront();
  }
})(window);
