/**
 * =========================================================================
 * 📲 مدير تثبيت التطبيق PWA المتعدد المتاجر (Storefront & Merchant Admin)
 * =========================================================================
 * - يسجل Service Worker (./sw.js)
 * - يولّد Manifest ديناميكي يحفظ ?shop=SHOP_... واسم المتجر في أيقونة التثبيت
 * - يتيح التثبيت المباشر على أندرويد/الكمبيوتر + إرشادات iOS Safari الواضحة
 * =========================================================================
 */
(function (window) {
    'use strict';

    let deferredPrompt = null;
    let activeBlobManifestUrl = '';
    let customStoreTitle = '';

    function isAdminPage() {
        return /admin\.html/i.test(window.location.pathname || '') || Boolean(document.getElementById('cloudLiveStatus'));
    }

    function isRunningStandalone() {
        try {
            return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
                || window.navigator.standalone === true;
        } catch (_) {
            return false;
        }
    }

    function isIOSDevice() {
        try {
            const ua = window.navigator.userAgent || '';
            return /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
        } catch (_) {
            return false;
        }
    }

    function getActiveShopSafe() {
        try {
            if (typeof window.getActiveShopId === 'function') return window.getActiveShopId();
            const sp = new URLSearchParams(window.location.search || '');
            return (sp.get('shop') || sp.get('shop_id') || 'SHOP_DEMO').trim();
        } catch (_) {
            return 'SHOP_DEMO';
        }
    }

    function absUrl(relPath) {
        try {
            return new URL(relPath, window.location.href).toString();
        } catch (_) {
            return relPath;
        }
    }

    function buildTenantStartUrl() {
        try {
            const u = new URL(window.location.href);
            // الحفاظ على ?shop=... وإزالة المعاملات المؤقتة مثل recover/coupon/prod
            const keepShop = u.searchParams.get('shop') || u.searchParams.get('shop_id') || '';
            u.search = '';
            u.hash = '';
            if (keepShop) u.searchParams.set('shop', keepShop);
            return u.toString();
        } catch (_) {
            return window.location.href;
        }
    }

    function updateDynamicManifest(storeName) {
        if (storeName) customStoreTitle = String(storeName).trim();
        const admin = isAdminPage();
        const shopId = getActiveShopSafe();
        const baseName = customStoreTitle || (admin ? 'لوحة تحكم التاجر' : 'المتجر الإلكتروني');
        const fullName = admin ? `إدارة ${baseName}` : baseName;
        const shortName = (admin ? `إدارة ${baseName}` : baseName).slice(0, 18);

        const icon192 = absUrl(admin ? './icons/admin-192.png' : './icons/icon-192.png');
        const icon512 = absUrl(admin ? './icons/admin-512.png' : './icons/icon-512.png');

        const manifestObj = {
            id: `bayan-${admin ? 'admin' : 'store'}-${shopId}`,
            name: fullName,
            short_name: shortName,
            description: admin
                ? `لوحة إدارة ${baseName} — الطلبات، الأصناف، والعملاء`
                : `تطبيق ${baseName} للتسوق أونلاين وتتبّع الطلبات`,
            start_url: buildTenantStartUrl(),
            scope: absUrl('./'),
            display: 'standalone',
            orientation: admin ? 'any' : 'portrait-primary',
            background_color: '#f8fafc',
            theme_color: '#059669',
            dir: 'rtl',
            lang: 'ar',
            icons: [
                { src: icon192, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
                { src: icon512, sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
            ]
        };

        try {
            const linkEl = document.getElementById('bayanPwaManifest') || document.querySelector('link[rel="manifest"]');
            if (!linkEl) return;
            const blob = new Blob([JSON.stringify(manifestObj)], { type: 'application/manifest+json' });
            const nextUrl = URL.createObjectURL(blob);
            const prevUrl = activeBlobManifestUrl;
            activeBlobManifestUrl = nextUrl;
            linkEl.setAttribute('href', nextUrl);
            if (prevUrl) {
                setTimeout(() => URL.revokeObjectURL(prevUrl), 2500);
            }
            const iosTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
            if (iosTitle) iosTitle.setAttribute('content', shortName);
        } catch (_) { }
    }

    function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        const isLocalhost = /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname || '');
        if (window.location.protocol !== 'https:' && !isLocalhost) return;
        navigator.serviceWorker.register('./sw.js', { scope: './' })
            .then(() => {
                console.log('⚡ Service Worker جاهز لدعم التثبيت والعمل السريع (PWA)');
            })
            .catch((err) => {
                console.warn('SW registration note:', err && err.message ? err.message : err);
            });
    }

    function ensureInstallButtonsVisibility() {
        const standalone = isRunningStandalone();
        const canOffer = !standalone && (Boolean(deferredPrompt) || isIOSDevice());

        const adminBtn = document.getElementById('bayanAdminPwaBtn');
        if (adminBtn) {
            adminBtn.style.display = canOffer ? 'inline-flex' : 'none';
        }

        const storeBtn = document.getElementById('bayanStorePwaBtn');
        if (storeBtn) {
            storeBtn.classList.toggle('hidden', !canOffer);
            storeBtn.classList.toggle('flex', canOffer);
        }

        const drawerBtn = document.getElementById('bayanDrawerPwaBtn');
        if (drawerBtn) {
            drawerBtn.style.display = canOffer ? 'flex' : 'none';
        }
    }

    function injectInstallUI() {
        if (isRunningStandalone()) return;

        if (isAdminPage()) {
            const tools = document.querySelector('.header-tools');
            if (tools && !document.getElementById('bayanAdminPwaBtn')) {
                const btn = document.createElement('button');
                btn.id = 'bayanAdminPwaBtn';
                btn.type = 'button';
                btn.title = 'تثبيت لوحة التحكم كتطبيق على الهاتف أو الكمبيوتر';
                btn.onclick = () => triggerInstall();
                btn.style.cssText = 'display:none; align-items:center; justify-content:center; gap:7px; min-height:40px; padding:8px 14px; border-radius:12px; border:1px solid #047857; background:linear-gradient(135deg,#10b981,#059669); color:#ffffff; font-weight:800; font-size:0.84rem; white-space:nowrap; box-shadow:0 3px 10px rgba(5,150,105,0.28); cursor:pointer;';
                btn.innerHTML = '<span>📲</span><span>تثبيت التطبيق</span>';
                tools.insertBefore(btn, tools.lastElementChild || null);
            }
        } else {
            const actionBar = document.querySelector('header button[onclick="openCartDrawer()"]')?.parentElement || document.querySelector('header .flex.items-center.gap-1\\.5');
            if (actionBar && !document.getElementById('bayanStorePwaBtn')) {
                const btn = document.createElement('button');
                btn.id = 'bayanStorePwaBtn';
                btn.type = 'button';
                btn.title = 'تثبيت تطبيق المتجر على الموبايل';
                btn.onclick = () => triggerInstall();
                btn.className = 'hidden h-10 px-2.5 sm:px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white items-center justify-center gap-1.5 text-xs font-extrabold transition shadow-xs shrink-0';
                btn.innerHTML = '<i class="fa-solid fa-mobile-screen-button"></i><span class="hidden md:inline">تثبيت التطبيق</span>';
                actionBar.insertBefore(btn, actionBar.firstChild);
            }
        }
        ensureInstallButtonsVisibility();
    }

    function showIOSInstallGuideModal() {
        let modal = document.getElementById('bayanIosPwaModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'bayanIosPwaModal';
            modal.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(15,23,42,0.72);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px;direction:rtl;';
            modal.innerHTML = `
                <div style="background:#ffffff;border-radius:22px;max-width:410px;width:100%;padding:22px;box-shadow:0 20px 45px rgba(0,0,0,0.28);text-align:right;font-family:Cairo,sans-serif;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                        <h3 style="margin:0;font-weight:900;font-size:1.08rem;color:#0f172a;">📲 تثبيت التطبيق على الآيفون (iOS)</h3>
                        <button type="button" onclick="document.getElementById('bayanIosPwaModal').remove()" style="width:32px;height:32px;border-radius:999px;border:1px solid #e2e8f0;background:#f8fafc;cursor:pointer;font-weight:900;">✕</button>
                    </div>
                    <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:14px;padding:14px;font-size:0.88rem;line-height:1.8;color:#065f46;font-weight:700;">
                        <div>1️⃣ اضغط على أيقونة <b>المشاركة (Share ⬆️)</b> في شريط متصفح Safari بالأسفل.</div>
                        <div>2️⃣ مرّر لأسفل واختر <b>«إضافة إلى الشاشة الرئيسية» (Add to Home Screen ➕)</b>.</div>
                        <div>3️⃣ اضغط <b>إضافة (Add)</b> ليظهر التطبيق بأيقونته المستقلة على شاشتك!</div>
                    </div>
                    <button type="button" onclick="document.getElementById('bayanIosPwaModal').remove()" style="margin-top:14px;width:100%;padding:11px;border-radius:12px;border:none;background:#059669;color:#fff;font-weight:900;cursor:pointer;">حسناً، فهمت ✅</button>
                </div>`;
            modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
            document.body.appendChild(modal);
        }
    }

    async function triggerInstall() {
        if (isRunningStandalone()) return false;
        if (deferredPrompt) {
            try {
                deferredPrompt.prompt();
                const choice = await deferredPrompt.userChoice;
                if (choice && choice.outcome === 'accepted') {
                    deferredPrompt = null;
                    ensureInstallButtonsVisibility();
                    return true;
                }
            } catch (err) {
                console.warn('PWA prompt warning:', err);
            }
            return false;
        }
        if (isIOSDevice()) {
            showIOSInstallGuideModal();
            return true;
        }
        alert('لتثبيت التطبيق: افتح قائمة المتصفح (⋮) واختر "تثبيت التطبيق" أو "إضافة إلى الشاشة الرئيسية".');
        return false;
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        injectInstallUI();
        ensureInstallButtonsVisibility();
    });

    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        ensureInstallButtonsVisibility();
    });

    function initPwaManager() {
        updateDynamicManifest();
        registerServiceWorker();
        injectInstallUI();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPwaManager);
    } else {
        initPwaManager();
    }

    window.BayanPWA = {
        setStoreMeta(meta) {
            if (meta && meta.name) updateDynamicManifest(meta.name);
        },
        triggerInstall,
        canInstall: () => !isRunningStandalone() && (Boolean(deferredPrompt) || isIOSDevice()),
        isStandalone: isRunningStandalone,
        refreshButtons: ensureInstallButtonsVisibility
    };
})(window);
