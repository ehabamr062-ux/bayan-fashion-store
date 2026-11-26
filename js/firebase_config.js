// ==============================================================================
// ☁️ إعدادات وتوصيل Firebase السحابية لمتجر وكاشير بيان للأزياء
// ==============================================================================

const BAYAN_FIREBASE_CONFIG = {
    apiKey: "AIzaSyDpj0lpvZ5zObBrsgCqX6Si8Gd5IHLA-Og",
    authDomain: "bayan-fashion-live.firebaseapp.com",
    projectId: "bayan-fashion-live",
    storageBucket: "bayan-fashion-live.firebasestorage.app",
    messagingSenderId: "459605231616",
    appId: "1:459605231616:web:6e720d9e1e969a3e7bf0e5",
    measurementId: "G-J9SH3PXS2S"
};

// ==============================================================================
// 🏪 نظام تعدد المتاجر وعزل البيانات (Multi-Tenant Shop Isolation)
// ==============================================================================
const DEFAULT_SHOP_ID = 'SHOP_DEMO';

function sanitizeShopId(rawId) {
    if (!rawId || typeof rawId !== 'string') return '';
    const clean = rawId.trim().replace(/[^A-Za-z0-9_-]/g, '');
    return clean.length >= 3 ? clean : '';
}

// 🌐 خريطة ربط الدومينات الخاصة بكود المحل (Custom Domains -> shopId)
// أضف هنا أي دومين خاص لعميل في سطر واحد ليفتح متجره ولوحة تحكمه بدون ?shop=...
const BAYAN_CUSTOM_DOMAINS = {
    'missshoes.store': 'SHOP_F5Y8E',
    'www.missshoes.store': 'SHOP_F5Y8E'
};

function getActiveShopId() {
    if (typeof window === 'undefined') return DEFAULT_SHOP_ID;
    if (window._bayanActiveShopId) return window._bayanActiveShopId;

    let shopId = '';
    try {
        const params = new URLSearchParams(window.location.search || '');
        const urlShop = sanitizeShopId(params.get('shop') || params.get('shop_id') || '');
        if (urlShop) {
            shopId = urlShop;
            try { sessionStorage.setItem('bayan_active_shop_id', shopId); } catch (_) { }
        }
    } catch (_) { }

    // التحقق التلقائي من الدومين الخاص (Custom Domain) إذا لم يُمرر ?shop= في الرابط
    if (!shopId) {
        try {
            const host = String(window.location.hostname || '').toLowerCase().trim();
            const mapped = BAYAN_CUSTOM_DOMAINS[host] || BAYAN_CUSTOM_DOMAINS[host.replace(/^www\./, '')] || '';
            const cleanMapped = sanitizeShopId(mapped);
            if (cleanMapped) {
                shopId = cleanMapped;
                try { sessionStorage.setItem('bayan_active_shop_id', shopId); } catch (_) { }
            }
        } catch (_) { }
    }

    if (!shopId) {
        try {
            const sessShop = sanitizeShopId(sessionStorage.getItem('bayan_active_shop_id') || '');
            if (sessShop) shopId = sessShop;
        } catch (_) { }
    }

    if (!shopId) {
        shopId = DEFAULT_SHOP_ID;
    }

    window._bayanActiveShopId = shopId;
    return shopId;
}

const TENANT_SCOPED_COLLECTIONS = new Set(['products', 'orders', 'coupons', 'settings', 'testimonials']);
let rawBayanDb = null;
let bayanDb = null;
let isFirebaseInitialized = false;

function getRawBayanDb() {
    if (rawBayanDb) return rawBayanDb;
    if (typeof firebase !== 'undefined') {
        try {
            if (!firebase.apps.length) {
                firebase.initializeApp(BAYAN_FIREBASE_CONFIG);
            }
            rawBayanDb = firebase.firestore();
            isFirebaseInitialized = true;
            console.log(`✅ تم الاتصال بقاعدة بيانات بيان السحابية بنجاح (Firestore Live | Shop: ${getActiveShopId()})`);

            // ⚡ تفعيل محرك IndexedDB المحلي التلقائي لفايربيس (Offline Persistence & Instant Speed)
            rawBayanDb.enablePersistence({ synchronizeTabs: true }).then(() => {
                console.log("⚡ تم تفعيل قاعدة بيانات IndexedDB المحلية لـ Firestore بنجاح فائق للسرعة والأوفلاين!");
            }).catch((err) => {
                if (err.code === 'failed-precondition') {
                    console.log("ℹ️ قاعدة بيانات IndexedDB تعمل بالفعل عبر تبويب آخر للمتجر.");
                } else if (err.code === 'unimplemented') {
                    console.warn("⚠️ المتصفح لا يدعم بعض خصائص التخزين الدائم لـ IndexedDB.");
                }
            });

            return rawBayanDb;
        } catch (e) {
            console.warn("⚠️ تعذر تفعيل فايربيس سحابياً، سيتم العمل في وضع الأوفلاين المحلي:", e);
        }
    }
    return null;
}

function getShopCollection(colName) {
    const raw = getRawBayanDb();
    if (!raw) return null;
    const shopId = getActiveShopId();
    return raw.collection('shops').doc(shopId).collection(colName);
}

function getBayanDb() {
    if (bayanDb) return bayanDb;
    const raw = getRawBayanDb();
    if (!raw) return null;

    // 🔒 تغليف ذكي يوجّه كافة مجموعات المتجر تلقائياً تحت shops/{shopId}/{collection}
    bayanDb = new Proxy(raw, {
        get(target, prop) {
            if (prop === 'collection') {
                return function (colName) {
                    if (TENANT_SCOPED_COLLECTIONS.has(colName)) {
                        return target.collection('shops').doc(getActiveShopId()).collection(colName);
                    }
                    return target.collection(colName);
                };
            }
            const val = target[prop];
            return typeof val === 'function' ? val.bind(target) : val;
        }
    });
    return bayanDb;
}

function isCustomDomainMapped() {
    try {
        const host = String(window.location.hostname || '').toLowerCase().trim();
        const mapped = BAYAN_CUSTOM_DOMAINS[host] || BAYAN_CUSTOM_DOMAINS[host.replace(/^www\./, '')] || '';
        return Boolean(sanitizeShopId(mapped));
    } catch (_) {
        return false;
    }
}

function getStorefrontUrl(extraParams) {
    const shopId = getActiveShopId();
    let basePath = 'index.html';
    try {
        const curUrl = new URL(window.location.href);
        curUrl.search = '';
        curUrl.hash = '';
        curUrl.pathname = curUrl.pathname.replace(/[^/]*$/, '') + 'index.html';
        basePath = curUrl.toString();
    } catch (_) { }

    const qs = new URLSearchParams();
    const hasExplicitShopInUrl = (() => {
        try {
            const sp = new URLSearchParams(window.location.search || '');
            return Boolean(sanitizeShopId(sp.get('shop') || sp.get('shop_id') || ''));
        } catch (_) { return false; }
    })();

    if (!isCustomDomainMapped() && (hasExplicitShopInUrl || shopId !== DEFAULT_SHOP_ID)) {
        qs.set('shop', shopId);
    }
    if (extraParams && typeof extraParams === 'object') {
        Object.keys(extraParams).forEach(k => {
            if (extraParams[k] !== undefined && extraParams[k] !== null && String(extraParams[k]) !== '') {
                qs.set(k, String(extraParams[k]));
            }
        });
    }
    const queryStr = qs.toString();
    return queryStr ? `${basePath}?${queryStr}` : basePath;
}

function openActiveShopStorefront(e) {
    const url = getStorefrontUrl();
    if (e && e.currentTarget && e.currentTarget.tagName === 'A') {
        e.currentTarget.href = url;
    }
    if (e && typeof e.preventDefault === 'function') {
        e.preventDefault();
    }
    window.open(url, '_blank', 'noopener');
    return false;
}

function syncAdminStorefrontLinks() {
    try {
        const isAdminPage = /admin\.html/i.test(window.location.pathname || '') || Boolean(document.getElementById('cloudLiveStatus'));
        if (!isAdminPage) return;
        const targetUrl = getStorefrontUrl();
        document.querySelectorAll('a[href="index.html"], a[href^="index.html?"], #adminPreviewStoreLink, #homeVisitStoreLink').forEach(a => {
            a.href = targetUrl;
            if (!a._bayanStoreLinkHooked) {
                a._bayanStoreLinkHooked = true;
                a.addEventListener('click', (ev) => openActiveShopStorefront(ev));
            }
        });
        const shopId = getActiveShopId();
        const badge = document.getElementById('cloudLiveStatus');
        if (badge && shopId && shopId !== DEFAULT_SHOP_ID) {
            const spans = badge.querySelectorAll('span');
            const labelSpan = spans[spans.length - 1];
            if (labelSpan && !labelSpan.textContent.includes(shopId)) {
                labelSpan.textContent = `متصل بـ Firebase • ${shopId}`;
            }
        }
    } catch (_) { }
}

if (typeof window !== 'undefined') {
    window.getActiveShopId = getActiveShopId;
    window.getShopCollection = getShopCollection;
    window.getRawBayanDb = getRawBayanDb;
    window.getStorefrontUrl = getStorefrontUrl;
    window.openActiveShopStorefront = openActiveShopStorefront;
    window.syncAdminStorefrontLinks = syncAdminStorefrontLinks;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', syncAdminStorefrontLinks);
    } else {
        syncAdminStorefrontLinks();
    }
}

// ==============================================================================
// ⚡ محرك التخزين المحلي فائق السرعة IndexedDB (Bayan High-Speed IDB Engine)
// ==============================================================================
// ⚡ محرك التخزين فائق السرعة IndexedDB الخالص (Bayan Pure IndexedDB Engine)
// إلغاء تام لـ localStorage والاعتماد بنسبة 100% على IndexedDB وذاكرة الكاش السريعة
// ==============================================================================
const BayanIDB = {
    get dbName() {
        return 'BayanFashionStoreDB_' + getActiveShopId();
    },
    version: 2,
    db: null,
    cache: {},
    isReady: false,
    _initPromise: null,

    async open() {
        if (this.db) return this.db;
        if (this._initPromise) return this._initPromise;

        this._initPromise = new Promise((resolve, reject) => {
            if (!('indexedDB' in window)) {
                console.warn("IndexedDB is not supported in this browser");
                return resolve(null);
            }
            const request = indexedDB.open(this.dbName, this.version);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('products')) {
                    db.createObjectStore('products', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('orders')) {
                    db.createObjectStore('orders', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
            request.onsuccess = async (e) => {
                this.db = e.target.result;
                await this._syncCacheFromIDB();
                this.isReady = true;
                resolve(this.db);
            };
            request.onerror = (e) => {
                console.error("IndexedDB Open Error:", e);
                resolve(null);
            };
        });

        return this._initPromise;
    },

    async _syncCacheFromIDB() {
        if (!this.db) return;
        try {
            // تحميل كافة الإعدادات والمفاتيح المخزنة في IndexedDB إلى الذاكرة الفورية
            if (this.db.objectStoreNames.contains('settings')) {
                await new Promise((res) => {
                    const tx = this.db.transaction('settings', 'readonly');
                    const store = tx.objectStore('settings');
                    const req = store.getAll();
                    req.onsuccess = () => {
                        (req.result || []).forEach(item => {
                            if (item && item.key) {
                                this.cache[item.key] = (typeof item.value !== 'undefined') ? item.value : item;
                            }
                        });
                        res();
                    };
                    req.onerror = () => res();
                });
            }

            // ترحيل أي بيانات قديمة متبقية من localStorage إلى IndexedDB لمرة واحدة ونهائية ثم تفريغ localStorage تماماً
            if (typeof window !== 'undefined' && window.localStorage && window.localStorage.length > 0) {
                console.log("🧹 جاري ترحيل أي بيانات قديمة من localStorage إلى IndexedDB وتصفير localStorage نهائياً...");
                for (let i = 0; i < window.localStorage.length; i++) {
                    const k = window.localStorage.key(i);
                    const v = window.localStorage.getItem(k);
                    if (k && this.cache[k] === undefined) {
                        this.cache[k] = v;
                        this.setItem(k, v);
                    }
                }
                // تم الاحتفاظ بـ localStorage لدعم كاش المنتجات الذكي (5 دقائق) وملف العميل في storefront.js
            }
        } catch (e) {
            console.warn("BayanIDB cache sync warning:", e);
        }
    },

    // دالة القراءة المتزامنة الفورية من الذاكرة المحملة من IndexedDB
    getItem(key) {
        if (this.cache.hasOwnProperty(key) && this.cache[key] !== null && this.cache[key] !== undefined) {
            return this.cache[key];
        }
        return null;
    },

    // دالة الكتابة: تحدث الذاكرة فوراً وتخزن في IndexedDB مباشرة دون لمس localStorage
    setItem(key, value) {
        const valStr = (typeof value === 'object' && value !== null) ? JSON.stringify(value) : String(value);
        this.cache[key] = valStr;

        this.open().then(db => {
            if (!db) return;
            try {
                const tx = db.transaction('settings', 'readwrite');
                const store = tx.objectStore('settings');
                store.put({ key: key, value: valStr, updatedAt: new Date().toISOString() });
            } catch (err) {
                console.warn("IndexedDB setItem write warning:", err);
            }
        }).catch(err => console.warn("IndexedDB write error:", err));
    },

    removeItem(key) {
        delete this.cache[key];
        this.open().then(db => {
            if (!db) return;
            try {
                const tx = db.transaction('settings', 'readwrite');
                tx.objectStore('settings').delete(key);
            } catch (e) { }
        }).catch(console.warn);
    },

    async setProduct(product) {
        try {
            const db = await this.open();
            if (!db) return;
            return new Promise((resolve, reject) => {
                const tx = db.transaction('products', 'readwrite');
                const store = tx.objectStore('products');
                store.put(product);
                tx.oncomplete = () => resolve(true);
                tx.onerror = (err) => reject(err);
            });
        } catch (e) {
            console.warn("BayanIDB setProduct error:", e);
        }
    },

    async saveAllProducts(productsArray) {
        if (!Array.isArray(productsArray) || productsArray.length === 0) return;
        try {
            const db = await this.open();
            if (!db) return;
            return new Promise((resolve, reject) => {
                const tx = db.transaction('products', 'readwrite');
                const store = tx.objectStore('products');
                store.clear();
                for (const p of productsArray) {
                    if (p && p.id) {
                        store.put(p);
                    }
                }
                tx.oncomplete = () => resolve(true);
                tx.onerror = (err) => reject(err);
            });
        } catch (e) {
            console.warn("BayanIDB saveAllProducts error:", e);
        }
    },

    async getAllProducts() {
        try {
            const db = await this.open();
            if (!db) return [];
            return new Promise((resolve, reject) => {
                const tx = db.transaction('products', 'readonly');
                const store = tx.objectStore('products');
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = (err) => reject(err);
            });
        } catch (e) {
            console.warn("BayanIDB getAllProducts error:", e);
            return [];
        }
    },

    async setSetting(key, value) {
        this.setItem(key, value);
    },

    async getSetting(key) {
        const cached = this.getItem(key);
        if (cached) {
            try { return JSON.parse(cached); } catch (e) { return cached; }
        }
        try {
            const db = await this.open();
            if (!db) return null;
            return new Promise((resolve, reject) => {
                const tx = db.transaction('settings', 'readonly');
                const store = tx.objectStore('settings');
                const request = store.get(key);
                request.onsuccess = () => {
                    const res = request.result ? request.result.value : null;
                    if (res) {
                        try { resolve(JSON.parse(res)); } catch (e) { resolve(res); }
                    } else {
                        resolve(null);
                    }
                };
                request.onerror = (err) => reject(err);
            });
        } catch (e) {
            console.warn("BayanIDB getSetting error:", e);
            return null;
        }
    },

    async setOrder(order) {
        try {
            const db = await this.open();
            if (!db) return;
            return new Promise((resolve, reject) => {
                const tx = db.transaction('orders', 'readwrite');
                const store = tx.objectStore('orders');
                store.put(order);
                tx.oncomplete = () => resolve(true);
                tx.onerror = (err) => reject(err);
            });
        } catch (e) {
            console.warn("BayanIDB setOrder error:", e);
        }
    },

    async getAllOrders() {
        try {
            const db = await this.open();
            if (!db) return [];
            return new Promise((resolve, reject) => {
                const tx = db.transaction('orders', 'readonly');
                const store = tx.objectStore('orders');
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = (err) => reject(err);
            });
        } catch (e) {
            console.warn("BayanIDB getAllOrders error:", e);
            return [];
        }
    }
};

// تشغيل وتهيئة فورية تلقائية لـ BayanIDB عند استدعاء السكريبت
if (typeof window !== 'undefined') {
    // فتح قاعدة بيانات IndexedDB فوراً مع الحفاظ على كاش storefront في localStorage
    BayanIDB.open().then(() => {
        console.log("🚀 تم تفعيل قاعدة بيانات IndexedDB (BayanIDB) بنجاح!");
    }).catch(console.warn);

    window.addEventListener('DOMContentLoaded', () => {
        getBayanDb();
    });
}

