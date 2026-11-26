/**
 * =========================================================================
 * 🛒 محرك تتبع واسترداد السلات المتروكة (Abandoned Cart Tracker & Recovery)
 * =========================================================================
 * - يعمل أوتوماتيكياً مع المتجر الإلكتروني المعزول حسب ?shop=SHOP_...
 * - يحفظ السلة وبيانات العميل سحابياً في shops/{shopId}/meta/abandoned_{visitorId}
 *   عند كتابة الاسم/الموبايل أو مغادرة/إغلاق الصفحة قبل تأكيد الطلب
 * - يسجل حالة "تم الاسترداد ✅" تلقائياً عند إتمام الطلب، ويدعم رابط
 *   الاسترجاع المباشر عبر واتساب (?recover=<visitorId>&coupon=<CODE>)
 * =========================================================================
 */
(function (window) {
  'use strict';

  const TRACKER_VERSION = '1.0.0';
  let debounceTimer = null;
  let lastWrittenSignature = '';
  let cachedCreatedAt = '';
  let sessionCompletedOrder = false;
  let pendingRecoveryHandled = false;
  let pendingRecoverCoupon = '';

  function getShopId() {
    try {
      if (typeof window.getActiveShopId === 'function') return window.getActiveShopId();
    } catch (_) { }
    return 'SHOP_DEMO';
  }

  function getVisitorStorageKey() {
    return 'bayan_ac_visitor_id_' + getShopId();
  }

  function generateVisitorId() {
    return 'ac_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function getVisitorId(createIfMissing = true) {
    const key = getVisitorStorageKey();
    try {
      let id = localStorage.getItem(key) || '';
      if (!id && createIfMissing) {
        id = generateVisitorId();
        localStorage.setItem(key, id);
      }
      return id;
    } catch (_) {
      if (!window._bayanFallbackVisitorId && createIfMissing) {
        window._bayanFallbackVisitorId = generateVisitorId();
      }
      return window._bayanFallbackVisitorId || '';
    }
  }

  function rotateVisitorId() {
    const key = getVisitorStorageKey();
    const nextId = generateVisitorId();
    cachedCreatedAt = '';
    lastWrittenSignature = '';
    try {
      localStorage.setItem(key, nextId);
    } catch (_) {
      window._bayanFallbackVisitorId = nextId;
    }
    return nextId;
  }

  function getMetaCollection() {
    try {
      if (typeof window.getShopCollection === 'function') {
        return window.getShopCollection('meta');
      }
      if (typeof window.getRawBayanDb === 'function') {
        const raw = window.getRawBayanDb();
        if (raw) return raw.collection('shops').doc(getShopId()).collection('meta');
      }
    } catch (_) { }
    return null;
  }

  function cleanStr(v, max = 180) {
    return String(v || '').replace(/[<>]/g, '').trim().slice(0, max);
  }

  function digitsOnly(v) {
    return String(v || '').replace(/\D/g, '');
  }

  function readInputVal(id) {
    const el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  }

  function readSelectedOptionText(id) {
    const el = document.getElementById(id);
    if (!el || !el.options || el.selectedIndex < 0) return '';
    return String(el.options[el.selectedIndex].text || '').trim();
  }

  function getStoredCustomerProfile() {
    try {
      const bridge = window.BayanStorefrontBridge;
      if (bridge && typeof bridge.getCustomerProfile === 'function') {
        const p = bridge.getCustomerProfile();
        if (p) return p;
      }
    } catch (_) { }
    try {
      const raw = localStorage.getItem('bayan_customer_profile_' + getShopId());
      if (raw) return JSON.parse(raw);
    } catch (_) { }
    return null;
  }

  function gatherSnapshotPayload() {
    const bridge = window.BayanStorefrontBridge || {};
    const cartItems = typeof bridge.getCart === 'function' ? (bridge.getCart() || []) : [];
    const quickItem = typeof bridge.getQuickOrderDraftItem === 'function' ? bridge.getQuickOrderDraftItem() : null;

    const ccModal = document.getElementById('cart-checkout-modal');
    const pdModal = document.getElementById('product-detail-modal');
    const isCcOpen = ccModal && !ccModal.classList.contains('hidden');
    const isPdOpen = pdModal && !pdModal.classList.contains('hidden');

    const ccName = readInputVal('cc-name');
    const ccPhone = readInputVal('cc-phone');
    const ccAlt = readInputVal('cc-alt-phone');
    const ccAddr = readInputVal('cc-address');
    const ccGovId = readInputVal('cc-gov');
    const ccCity = readSelectedOptionText('cc-gov');
    const ccPay = readInputVal('cc-payment');
    const ccCoupon = readInputVal('cc-coupon-input').toUpperCase();

    const qoName = readInputVal('qo-name');
    const qoPhone = readInputVal('qo-phone');
    const qoAlt = readInputVal('qo-alt-phone');
    const qoAddr = readInputVal('qo-address');
    const qoGovId = readInputVal('qo-gov');
    const qoCity = readSelectedOptionText('qo-gov');
    const qoPay = readInputVal('qo-payment');
    const qoCoupon = readInputVal('qo-coupon-input').toUpperCase();

    const profile = getStoredCustomerProfile() || {};

    let items = [];
    let source = 'cart';

    if (Array.isArray(cartItems) && cartItems.length > 0) {
      items = cartItems.map(i => ({
        productId: String(i.productId || ''),
        code: String(i.code || ''),
        name: cleanStr(i.name || 'منتج', 120),
        image: String(i.image || ''),
        color: cleanStr(i.color || '', 40),
        size: cleanStr(i.size || '', 40),
        qty: Math.max(1, Number(i.qty) || 1),
        unitPrice: Math.max(0, Number(i.unitPrice) || 0)
      }));
      source = 'cart';
    } else if (quickItem && (isPdOpen || digitsOnly(qoPhone).length >= 6 || qoName.length >= 2)) {
      items = [{
        productId: String(quickItem.productId || ''),
        code: String(quickItem.code || ''),
        name: cleanStr(quickItem.name || 'منتج', 120),
        image: String(quickItem.image || ''),
        color: cleanStr(quickItem.color || '', 40),
        size: cleanStr(quickItem.size || '', 40),
        qty: Math.max(1, Number(quickItem.qty) || 1),
        unitPrice: Math.max(0, Number(quickItem.unitPrice) || 0)
      }];
      source = 'quick_order';
    }

    if (!items.length) return null;

    let customerName = '';
    let phone1 = '';
    let phone2 = '';
    let address = '';
    let govId = '';
    let city = '';
    let paymentMethod = '';
    let couponCode = '';

    if (source === 'quick_order' && (isPdOpen || qoPhone || qoName)) {
      customerName = cleanStr(qoName || ccName || profile.name || '', 80);
      phone1 = cleanStr(qoPhone || ccPhone || profile.phone1 || '', 20);
      phone2 = cleanStr(qoAlt || ccAlt || profile.phone2 || '', 20);
      address = cleanStr(qoAddr || ccAddr || profile.address || '', 220);
      govId = cleanStr(qoGovId || profile.govId || '', 40);
      city = cleanStr(qoCity || ccCity || '', 80);
      paymentMethod = cleanStr(qoPay || 'الدفع عند الاستلام', 60);
      couponCode = cleanStr(qoCoupon || ccCoupon || '', 40);
    } else if (isCcOpen || ccPhone || ccName) {
      customerName = cleanStr(ccName || qoName || profile.name || '', 80);
      phone1 = cleanStr(ccPhone || qoPhone || profile.phone1 || '', 20);
      phone2 = cleanStr(ccAlt || qoAlt || profile.phone2 || '', 20);
      address = cleanStr(ccAddr || qoAddr || profile.address || '', 220);
      govId = cleanStr(ccGovId || profile.govId || '', 40);
      city = cleanStr(ccCity || qoCity || '', 80);
      paymentMethod = cleanStr(ccPay || 'الدفع عند الاستلام', 60);
      couponCode = cleanStr(ccCoupon || '', 40);
    } else {
      customerName = cleanStr(profile.name || qoName || ccName || '', 80);
      phone1 = cleanStr(profile.phone1 || qoPhone || ccPhone || '', 20);
      phone2 = cleanStr(profile.phone2 || qoAlt || ccAlt || '', 20);
      address = cleanStr(profile.address || qoAddr || ccAddr || '', 220);
      govId = cleanStr(profile.govId || '', 40);
      city = cleanStr(ccCity || qoCity || '', 80);
      paymentMethod = 'الدفع عند الاستلام';
      couponCode = cleanStr(ccCoupon || qoCoupon || '', 40);
    }

    const phoneDigits = digitsOnly(phone1);
    const hasContact = phoneDigits.length >= 6 || customerName.length >= 2;
    if (!hasContact) return null;

    const itemsCount = items.reduce((s, it) => s + (Number(it.qty) || 1), 0);
    const subtotal = Math.round(items.reduce((s, it) => s + (Number(it.unitPrice) || 0) * (Number(it.qty) || 1), 0));

    return {
      source,
      customerName,
      phone1,
      phone2,
      city,
      govId,
      address,
      paymentMethod,
      couponCode,
      items,
      itemsCount,
      subtotal
    };
  }

  function buildSignature(payload) {
    if (!payload) return '';
    return JSON.stringify({
      s: payload.source,
      n: payload.customerName,
      p: digitsOnly(payload.phone1),
      a: payload.address,
      c: payload.city,
      k: payload.couponCode,
      i: payload.items.map(x => [x.productId, x.size, x.color, x.qty, x.unitPrice])
    });
  }

  async function flushSync(force = false) {
    if (sessionCompletedOrder) return false;
    const payload = gatherSnapshotPayload();
    if (!payload) return false;

    const sig = buildSignature(payload);
    if (!force && sig === lastWrittenSignature) return false;

    const col = getMetaCollection();
    if (!col) return false;

    const visitorId = getVisitorId(true);
    if (!visitorId) return false;

    const nowIso = new Date().toISOString();
    if (!cachedCreatedAt) cachedCreatedAt = nowIso;

    lastWrittenSignature = sig;

    const docData = {
      docType: 'abandoned_cart',
      id: visitorId,
      shop_id: getShopId(),
      source: payload.source,
      customerName: payload.customerName,
      phone1: payload.phone1,
      phone2: payload.phone2,
      city: payload.city,
      govId: payload.govId,
      address: payload.address,
      paymentMethod: payload.paymentMethod,
      couponCode: payload.couponCode,
      items: payload.items,
      itemsCount: payload.itemsCount,
      subtotal: payload.subtotal,
      status: 'abandoned',
      recovered: false,
      trackerVersion: TRACKER_VERSION,
      createdAt: cachedCreatedAt,
      updatedAt: nowIso
    };

    try {
      await col.doc('abandoned_' + visitorId).set(docData, { merge: true });
      return true;
    } catch (err) {
      lastWrittenSignature = '';
      console.warn('Abandoned cart sync note:', err && err.message ? err.message : err);
      return false;
    }
  }

  function scheduleSync(delayMs = 1100) {
    if (sessionCompletedOrder) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      flushSync(false);
    }, delayMs);
  }

  async function markOrderCompleted(order) {
    clearTimeout(debounceTimer);
    sessionCompletedOrder = true;
    const col = getMetaCollection();
    const visitorId = getVisitorId(false);
    const nowIso = new Date().toISOString();
    if (col && visitorId) {
      try {
        await col.doc('abandoned_' + visitorId).set({
          docType: 'abandoned_cart',
          status: 'recovered',
          recovered: true,
          recoveredOrderId: String((order && order.id) || ''),
          recoveredAt: nowIso,
          updatedAt: nowIso
        }, { merge: true });
      } catch (err) {
        console.warn('Abandoned cart recovery mark note:', err && err.message ? err.message : err);
      }
    }
    rotateVisitorId();
    setTimeout(() => { sessionCompletedOrder = false; }, 1500);
  }

  async function handleRecoveryDeepLink() {
    if (pendingRecoveryHandled) return;
    let recoverId = '';
    let couponCode = '';
    try {
      const sp = new URLSearchParams(window.location.search || '');
      recoverId = cleanStr(sp.get('recover') || '', 80);
      couponCode = cleanStr(sp.get('coupon') || '', 40).toUpperCase();
    } catch (_) { return; }

    if (!recoverId) return;
    pendingRecoveryHandled = true;
    pendingRecoverCoupon = couponCode;

    const col = getMetaCollection();
    if (!col) return;

    try {
      const docId = recoverId.startsWith('abandoned_') ? recoverId : ('abandoned_' + recoverId);
      const doc = await col.doc(docId).get();
      if (!doc.exists) return;
      const data = doc.data() || {};
      if (data.docType !== 'abandoned_cart') return;

      // حفظ كود الزائر للاستمرار في التتبع لو عدل السلة
      try {
        localStorage.setItem(getVisitorStorageKey(), data.id || recoverId.replace(/^abandoned_/, ''));
        cachedCreatedAt = data.createdAt || new Date().toISOString();
      } catch (_) { }

      const bridge = window.BayanStorefrontBridge;
      if (bridge && typeof bridge.restoreAbandonedCart === 'function') {
        await bridge.restoreAbandonedCart(data, couponCode);
      }

      // تنظيف رابط المتصفح مع الحفاظ على ?shop=...
      try {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('recover');
        cleanUrl.searchParams.delete('coupon');
        window.history.replaceState({}, '', cleanUrl.toString());
      } catch (_) { }
    } catch (err) {
      console.warn('Cart recover deep-link error:', err);
    }
  }

  function applyPendingRecoverCouponIfReady() {
    if (!pendingRecoverCoupon) return;
    const bridge = window.BayanStorefrontBridge;
    if (bridge && typeof bridge.applyRecoveryCoupon === 'function') {
      const applied = bridge.applyRecoveryCoupon(pendingRecoverCoupon);
      if (applied) pendingRecoverCoupon = '';
    }
  }

  function attachInputListeners() {
    const watchedIds = [
      'cc-name', 'cc-phone', 'cc-alt-phone', 'cc-gov', 'cc-address', 'cc-payment', 'cc-coupon-input',
      'qo-name', 'qo-phone', 'qo-alt-phone', 'qo-gov', 'qo-address', 'qo-payment', 'qo-coupon-input'
    ];
    watchedIds.forEach(id => {
      const el = document.getElementById(id);
      if (!el || el._bayanAcHooked) return;
      el._bayanAcHooked = true;
      el.addEventListener('input', () => {
        const v = String(el.value || '').trim();
        // إرسال أسرع فور اكتمال رقم الهاتف
        if ((id === 'cc-phone' || id === 'qo-phone') && digitsOnly(v).length >= 11) {
          scheduleSync(450);
        } else {
          scheduleSync(1100);
        }
      });
      el.addEventListener('change', () => scheduleSync(500));
      el.addEventListener('blur', () => flushSync(false));
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flushSync(false);
      }
    });
    window.addEventListener('pagehide', () => flushSync(false));
    window.addEventListener('beforeunload', () => flushSync(false));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachInputListeners);
  } else {
    attachInputListeners();
  }

  window.BayanAbandonedCartTracker = {
    version: TRACKER_VERSION,
    onCartUpdated() {
      sessionCompletedOrder = false;
      scheduleSync(850);
    },
    onModalClosed() {
      flushSync(false);
    },
    onStorefrontReady() {
      handleRecoveryDeepLink();
    },
    onCouponsReady() {
      applyPendingRecoverCouponIfReady();
    },
    markOrderCompleted,
    flushSync
  };
})(window);
