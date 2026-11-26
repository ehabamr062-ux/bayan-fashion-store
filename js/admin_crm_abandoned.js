/**
 * =========================================================================
 * 👥🛒 إدارة عملاء المتجر (Customer CRM) + استرداد السلات المتروكة (Abandoned Carts)
 * =========================================================================
 * - يعمل أوتوماتيكياً مع عزل بيانات كل متجر عبر getShopCollection / getBayanDb
 * - يعرض السلات المتروكة لحظياً داخل تبويب الطلبات مع إرسال تذكير واتساب + رابط استرجاع
 *   مباشر + إرفاق كوبون تحفيزي بنقرة واحدة
 * - يبني تبويب "عملاء المتجر" (CRM) بتجميع العملاء من الطلبات حسب رقم الموبايل
 * =========================================================================
 */
(function (window) {
    'use strict';

    let adminAbandonedList = [];
    let activeAbandonedChip = 'abandoned'; // all | abandoned | reminded | recovered
    let activeOrdersSubView = 'orders'; // orders | abandoned
    let activeCrmChip = 'all'; // all | vip | repeat | new | risk | abandoned
    let crmAggregatedCustomers = [];
    let currentWaAbandonedItem = null;
    let currentWaCrmCustomer = null;

    function esc(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function normalizePhoneKey(raw) {
        let d = String(raw || '').replace(/\D/g, '');
        if (d.startsWith('201') && d.length === 12) d = d.slice(1);
        if (d.startsWith('00201') && d.length === 14) d = d.slice(3);
        return d;
    }

    function toWhatsAppPhone(raw) {
        let d = normalizePhoneKey(raw);
        if (!d) return '';
        if (d.startsWith('01') && d.length === 11) return '2' + d;
        if (d.startsWith('1') && d.length === 10) return '20' + d;
        return d;
    }

    function getOrdersArray() {
        try {
            if (typeof window.getBayanOrders === 'function') return window.getBayanOrders() || [];
            if (typeof adminOrdersList !== 'undefined' && Array.isArray(adminOrdersList)) return adminOrdersList;
        } catch (_) { }
        return [];
    }

    function getCouponsArray() {
        try {
            if (typeof window.getBayanCoupons === 'function') return window.getBayanCoupons() || [];
            if (typeof adminCouponsList !== 'undefined' && Array.isArray(adminCouponsList)) return adminCouponsList;
        } catch (_) { }
        return [];
    }

    function getActiveCoupons() {
        const now = new Date();
        return getCouponsArray().filter(c => {
            if (!c || c.active === false) return false;
            if (c.expireAt && new Date(c.expireAt) <= now) return false;
            return Boolean(c.code);
        });
    }

    function getStoreNameSafe() {
        return (document.getElementById('setStoreName')?.value || '').trim()
            || (document.getElementById('adminHeaderTitle')?.textContent || '').trim()
            || 'المتجر';
    }

    function getMetaColSafe() {
        try {
            if (typeof window.getShopCollection === 'function') {
                return window.getShopCollection('meta');
            }
            if (typeof window.getRawBayanDb === 'function') {
                const raw = window.getRawBayanDb();
                const sid = typeof window.getActiveShopId === 'function' ? window.getActiveShopId() : 'SHOP_DEMO';
                if (raw) return raw.collection('shops').doc(sid).collection('meta');
            }
        } catch (_) { }
        return null;
    }

    function formatRelativeAr(iso) {
        if (!iso) return 'غير محدد';
        const ts = new Date(iso).getTime();
        if (!ts) return 'غير محدد';
        const diffMin = Math.max(0, Math.floor((Date.now() - ts) / 60000));
        if (diffMin < 1) return 'الآن';
        if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return `منذ ${diffHr} ساعة`;
        const diffDays = Math.floor(diffHr / 24);
        return `منذ ${diffDays} يوم`;
    }

    function buildRecoveryLink(visitorId, couponCode) {
        const params = { recover: visitorId };
        if (couponCode) params.coupon = couponCode;
        if (typeof window.getStorefrontUrl === 'function') {
            return window.getStorefrontUrl(params);
        }
        return `index.html?recover=${encodeURIComponent(visitorId)}${couponCode ? '&coupon=' + encodeURIComponent(couponCode) : ''}`;
    }

    function showToastMsg(msg) {
        if (typeof window.showFastSaveToast === 'function') {
            window.showFastSaveToast(msg);
        } else {
            alert(msg);
        }
    }

    // =========================================================================
    // 1. حقن شريط السلات المتروكة داخل تبويب الطلبات + إنشاء تبويب عملاء المتجر
    // =========================================================================
    function injectOrdersAbandonedSwitcher() {
        const ordersPanel = document.getElementById('tabPanelOrders');
        if (!ordersPanel || document.getElementById('bayanOrdersSubSwitcher')) return;

        const bar = document.createElement('div');
        bar.id = 'bayanOrdersSubSwitcher';
        bar.style.cssText = 'display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px; background:#ffffff; border:1.5px solid #e2e8f0; border-radius:16px; padding:12px 16px; margin-bottom:16px; box-shadow:0 4px 14px rgba(15,23,42,0.04);';
        bar.innerHTML = `
            <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
                <button type="button" id="subViewBtnOrders" onclick="BayanCRM.switchOrdersSubView('orders')"
                    style="display:inline-flex; align-items:center; gap:8px; padding:10px 16px; border-radius:12px; font-weight:900; font-size:0.9rem; cursor:pointer; border:1.5px solid #047857; background:linear-gradient(135deg,#059669,#047857); color:#ffffff; transition:0.18s;">
                    <span>🛵 الطلبات الحية والمؤكدة</span>
                    <span id="subBadgeLiveOrders" style="background:rgba(255,255,255,0.24); color:#ffffff; padding:2px 8px; border-radius:999px; font-size:0.78rem;">0</span>
                </button>
                <button type="button" id="subViewBtnAbandoned" onclick="BayanCRM.switchOrdersSubView('abandoned')"
                    style="display:inline-flex; align-items:center; gap:8px; padding:10px 16px; border-radius:12px; font-weight:900; font-size:0.9rem; cursor:pointer; border:1.5px solid #fed7aa; background:#fff7ed; color:#c2410c; transition:0.18s;">
                    <span>🛒 السلات المتروكة للاسترداد</span>
                    <span id="subBadgeAbandonedCarts" style="background:#ea580c; color:#ffffff; padding:2px 8px; border-radius:999px; font-size:0.78rem;">0</span>
                </button>
            </div>
            <div style="font-size:0.8rem; font-weight:800; color:#64748b;">
                💡 يتم حفظ أي سلة غير مكتملة تلقائياً لتذكير العميل عبر واتساب واستعادة البيعة
            </div>
        `;

        const section = document.createElement('div');
        section.id = 'bayanAbandonedCartsSection';
        section.style.display = 'none';
        section.innerHTML = `
            <div class="admin-financial-grid" style="margin-bottom:16px;">
                <div class="financial-card">
                    <div>
                        <div class="financial-card-title">سلات متروكة نشطة الآن</div>
                        <div id="abStatActiveCount" class="financial-card-val" style="color:#ea580c;">0 سلة</div>
                    </div>
                    <div class="financial-card-icon" style="background:#ffedd5; color:#ea580c;">🛒</div>
                </div>
                <div class="financial-card">
                    <div>
                        <div class="financial-card-title">قيمة المبيعات المعلّقة</div>
                        <div id="abStatPendingValue" class="financial-card-val" style="color:#d97706;">0 ج.م</div>
                    </div>
                    <div class="financial-card-icon" style="background:#fef3c7; color:#d97706;">💸</div>
                </div>
                <div class="financial-card">
                    <div>
                        <div class="financial-card-title">سلات تم استردادها بنجاح</div>
                        <div id="abStatRecoveredCount" class="financial-card-val" style="color:#059669;">0 سلة</div>
                    </div>
                    <div class="financial-card-icon" style="background:#dcfce7; color:#059669;">✅</div>
                </div>
                <div class="financial-card">
                    <div>
                        <div class="financial-card-title">عائد الاسترداد المحقق</div>
                        <div id="abStatRecoveredValue" class="financial-card-val" style="color:#047857;">0 ج.م</div>
                    </div>
                    <div class="financial-card-icon" style="background:#ecfdf5; color:#059669;">💎</div>
                </div>
            </div>

            <div class="admin-filters-panel" style="margin-bottom:16px;">
                <div class="filters-top-row">
                    <div class="search-box" style="flex:1.5; min-width:250px;">
                        <span>🔍</span>
                        <input type="text" id="abandonedSearchInput" placeholder="ابحث باسم العميل، الموبايل، أو اسم المنتج..." oninput="BayanCRM.renderAbandonedCarts()">
                    </div>
                    <button type="button" class="btn-primary-action" onclick="BayanCRM.refreshAbandonedOnce()" style="background:#059669; border-color:#047857; padding:9px 16px; font-weight:900;">
                        <span>🔄 تحديث السلات الآن</span>
                    </button>
                </div>
                <div class="filters-chips-row">
                    <span style="font-size:0.82rem; font-weight:900; color:var(--text-muted);">الحالة:</span>
                    <button type="button" class="admin-chip-btn active" data-ab-chip="abandoned" onclick="BayanCRM.setAbandonedChip('abandoned', this)">
                        <span>🟠 بانتظار التذكير والاسترداد</span>
                        <span id="abChipCountAbandoned" class="filter-counter-badge">0</span>
                    </button>
                    <button type="button" class="admin-chip-btn" data-ab-chip="reminded" onclick="BayanCRM.setAbandonedChip('reminded', this)">
                        <span>📩 تم إرسال تذكير واتساب</span>
                        <span id="abChipCountReminded" class="filter-counter-badge">0</span>
                    </button>
                    <button type="button" class="admin-chip-btn" data-ab-chip="recovered" onclick="BayanCRM.setAbandonedChip('recovered', this)">
                        <span>✅ تم استرداد الطلب</span>
                        <span id="abChipCountRecovered" class="filter-counter-badge">0</span>
                    </button>
                    <button type="button" class="admin-chip-btn" data-ab-chip="all" onclick="BayanCRM.setAbandonedChip('all', this)">
                        <span>📦 الكل</span>
                        <span id="abChipCountAll" class="filter-counter-badge">0</span>
                    </button>
                </div>
            </div>

            <div id="bayanAbandonedCartsContainer"></div>
        `;

        ordersPanel.insertBefore(bar, ordersPanel.firstChild);
        ordersPanel.appendChild(section);
    }

    function ensureCustomersTabPanel() {
        const main = document.querySelector('main.admin-content');
        if (!main || document.getElementById('tabPanelCustomers')) return document.getElementById('tabPanelCustomers');

        const sec = document.createElement('section');
        sec.id = 'tabPanelCustomers';
        sec.className = 'tab-panel';
        sec.innerHTML = `
            <div style="background:linear-gradient(135deg,#065f46 0%,#059669 60%,#047857 100%); border-radius:20px; padding:20px 22px; color:#ffffff; margin-bottom:18px; display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:14px; box-shadow:0 10px 25px rgba(5,150,105,0.2);">
                <div>
                    <h2 style="font-size:1.35rem; font-weight:950; margin:0 0 4px 0;">👥 عملاء المتجر وعلاقات العملاء (Customer CRM)</h2>
                    <p style="margin:0; font-size:0.88rem; opacity:0.92; font-weight:700;">تجميع تلقائي لجميع العملاء حسب رقم الموبايل — حساب الإنفاق، الطلبات الناجحة مقابل الملغاة، وتصنيف عملاء VIP لإرسال العروض بنقرة.</p>
                </div>
                <button type="button" onclick="BayanCRM.exportCustomersCSV()"
                    style="background:#ffffff; color:#065f46; border:none; border-radius:12px; padding:10px 16px; font-weight:900; font-size:0.86rem; cursor:pointer; display:inline-flex; align-items:center; gap:8px; box-shadow:0 4px 12px rgba(0,0,0,0.12);">
                    <span>📊</span>
                    <span>تصدير قاعدة العملاء (CSV)</span>
                </button>
            </div>

            <div class="admin-financial-grid" style="margin-bottom:18px;">
                <div class="financial-card">
                    <div>
                        <div class="financial-card-title">إجمالي عملاء المتجر</div>
                        <div id="crmStatTotal" class="financial-card-val" style="color:#0f172a;">0 عميل</div>
                    </div>
                    <div class="financial-card-icon" style="background:#f1f5f9; color:#0f172a;">👥</div>
                </div>
                <div class="financial-card">
                    <div>
                        <div class="financial-card-title">عملاء VIP المميزون 👑</div>
                        <div id="crmStatVip" class="financial-card-val" style="color:#d97706;">0 عميل</div>
                    </div>
                    <div class="financial-card-icon" style="background:#fef3c7; color:#d97706;">👑</div>
                </div>
                <div class="financial-card">
                    <div>
                        <div class="financial-card-title">العملاء المتكررون ⭐</div>
                        <div id="crmStatRepeat" class="financial-card-val" style="color:#059669;">0 عميل</div>
                    </div>
                    <div class="financial-card-icon" style="background:#dcfce7; color:#059669;">⭐</div>
                </div>
                <div class="financial-card">
                    <div>
                        <div class="financial-card-title">إجمالي إنفاق العملاء</div>
                        <div id="crmStatSpend" class="financial-card-val" style="color:#0284c7;">0 ج.م</div>
                    </div>
                    <div class="financial-card-icon" style="background:#e0f2fe; color:#0284c7;">💳</div>
                </div>
                <div class="financial-card">
                    <div>
                        <div class="financial-card-title">تنبيهات إلغاء مرتفع ⚠️</div>
                        <div id="crmStatRisk" class="financial-card-val" style="color:#dc2626;">0 عميل</div>
                    </div>
                    <div class="financial-card-icon" style="background:#fee2e2; color:#dc2626;">⚠️</div>
                </div>
            </div>

            <div class="admin-filters-panel" style="margin-bottom:16px;">
                <div class="filters-top-row">
                    <div class="search-box" style="flex:1.5; min-width:250px;">
                        <span>🔍</span>
                        <input type="text" id="crmSearchInput" placeholder="ابحث باسم العميل، رقم الموبايل، أو المحافظة..." oninput="BayanCRM.renderCustomers()">
                    </div>
                    <select id="crmSortSelect" class="filter-select" onchange="BayanCRM.renderCustomers()">
                        <option value="spend_desc">💎 الأعلى إنفاقاً</option>
                        <option value="orders_desc">🛍️ الأكثر طلبات ناجحة</option>
                        <option value="recent_desc">⏱️ الأحدث طلباً</option>
                        <option value="cancelled_desc">⚠️ الأكثر إلغاءً</option>
                    </select>
                </div>
                <div class="filters-chips-row">
                    <span style="font-size:0.82rem; font-weight:900; color:var(--text-muted);">تصنيف العميل:</span>
                    <button type="button" class="admin-chip-btn active" data-crm-chip="all" onclick="BayanCRM.setCrmChip('all', this)">
                        <span>👥 كل العملاء</span>
                        <span id="crmChipAll" class="filter-counter-badge">0</span>
                    </button>
                    <button type="button" class="admin-chip-btn" data-crm-chip="vip" onclick="BayanCRM.setCrmChip('vip', this)">
                        <span>👑 VIP</span>
                        <span id="crmChipVip" class="filter-counter-badge">0</span>
                    </button>
                    <button type="button" class="admin-chip-btn" data-crm-chip="repeat" onclick="BayanCRM.setCrmChip('repeat', this)">
                        <span>⭐ متكرر</span>
                        <span id="crmChipRepeat" class="filter-counter-badge">0</span>
                    </button>
                    <button type="button" class="admin-chip-btn" data-crm-chip="new" onclick="BayanCRM.setCrmChip('new', this)">
                        <span>🌱 جديد</span>
                        <span id="crmChipNew" class="filter-counter-badge">0</span>
                    </button>
                    <button type="button" class="admin-chip-btn" data-crm-chip="risk" onclick="BayanCRM.setCrmChip('risk', this)">
                        <span>⚠️ إلغاء مرتفع</span>
                        <span id="crmChipRisk" class="filter-counter-badge">0</span>
                    </button>
                    <button type="button" class="admin-chip-btn" data-crm-chip="abandoned" onclick="BayanCRM.setCrmChip('abandoned', this)">
                        <span>🛒 لديهم سلة متروكة</span>
                        <span id="crmChipAbandoned" class="filter-counter-badge">0</span>
                    </button>
                </div>
            </div>

            <div id="bayanCrmCustomersContainer" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(340px, 1fr)); gap:14px;"></div>
        `;

        main.appendChild(sec);
        return sec;
    }

    function ensureModals() {
        if (!document.getElementById('bayanAbandonedWaModal')) {
            const modal = document.createElement('div');
            modal.id = 'bayanAbandonedWaModal';
            modal.className = 'modal-overlay';
            modal.style.zIndex = '99990';
            modal.innerHTML = `
                <div class="modal-card" style="max-width:580px; width:95%; border-radius:20px; overflow:hidden;">
                    <div class="modal-head" style="background:linear-gradient(135deg,#059669,#047857); color:#ffffff;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <span style="font-size:1.4rem;">🛒</span>
                            <div>
                                <div style="font-weight:950; font-size:1.05rem;">إرسال تذكير واتساب لاسترداد السلة</div>
                                <div id="abWaModalSub" style="font-size:0.78rem; opacity:0.9;"></div>
                            </div>
                        </div>
                        <button type="button" class="btn-modal-close" style="background:rgba(255,255,255,0.2); color:#fff;" onclick="BayanCRM.closeAbandonedWaModal()">✕</button>
                    </div>
                    <div class="modal-body" style="padding:18px; display:flex; flex-direction:column; gap:12px;">
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:12px;">
                            <label style="display:block; font-weight:900; font-size:0.84rem; color:#0f172a; margin-bottom:6px;">🎟️ إرفاق كوبون خصم تحفيزي سريع (اختياري):</label>
                            <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
                                <select id="abWaCouponSelect" class="filter-select" style="flex:1; min-width:200px;" onchange="BayanCRM.rebuildAbandonedWaMessage()"></select>
                                <button type="button" onclick="BayanCRM.quickCreateRecoveryCoupon()"
                                    style="background:#ecfdf5; color:#047857; border:1px solid #6ee7b7; border-radius:10px; padding:8px 12px; font-weight:900; font-size:0.8rem; cursor:pointer;">
                                    ⚡ إنشاء كوبون 10% فوري
                                </button>
                            </div>
                        </div>

                        <div>
                            <label style="display:flex; align-items:center; justify-content:space-between; font-weight:900; font-size:0.84rem; color:#0f172a; margin-bottom:6px;">
                                <span>💬 نص رسالة التذكير (مع رابط استرجاع السلة تلقائياً):</span>
                                <span style="font-size:0.74rem; color:#059669;">قابل للتعديل قبل الإرسال</span>
                            </label>
                            <textarea id="abWaMessageText" rows="8" style="width:100%; border:1.5px solid #cbd5e1; border-radius:12px; padding:12px; font-family:inherit; font-size:0.88rem; line-height:1.65; resize:vertical;"></textarea>
                        </div>

                        <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end;">
                            <button type="button" class="btn-card-action" onclick="BayanCRM.copyAbandonedWaMessage()">📋 نسخ الرسالة والرابط</button>
                            <button type="button" onclick="BayanCRM.sendAbandonedWaNow()"
                                style="background:linear-gradient(135deg,#059669,#047857); color:#fff; border:none; border-radius:12px; padding:10px 20px; font-weight:900; font-size:0.92rem; cursor:pointer; display:inline-flex; align-items:center; gap:8px;">
                                <span>📲</span>
                                <span>فتح واتساب وإرسال التذكير الآن</span>
                            </button>
                        </div>
                    </div>
                </div>
            `;
            modal.addEventListener('click', (e) => { if (e.target === modal) closeAbandonedWaModal(); });
            document.body.appendChild(modal);
        }

        if (!document.getElementById('bayanCrmOfferModal')) {
            const modal = document.createElement('div');
            modal.id = 'bayanCrmOfferModal';
            modal.className = 'modal-overlay';
            modal.style.zIndex = '99990';
            modal.innerHTML = `
                <div class="modal-card" style="max-width:560px; width:95%; border-radius:20px; overflow:hidden;">
                    <div class="modal-head" style="background:linear-gradient(135deg,#059669,#047857); color:#ffffff;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <span style="font-size:1.4rem;">🎁</span>
                            <div>
                                <div style="font-weight:950; font-size:1.05rem;">إرسال عرض أو كوبون خاص للعميل</div>
                                <div id="crmOfferModalSub" style="font-size:0.78rem; opacity:0.9;"></div>
                            </div>
                        </div>
                        <button type="button" class="btn-modal-close" style="background:rgba(255,255,255,0.2); color:#fff;" onclick="BayanCRM.closeCrmOfferModal()">✕</button>
                    </div>
                    <div class="modal-body" style="padding:18px; display:flex; flex-direction:column; gap:12px;">
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                            <div>
                                <label style="display:block; font-weight:900; font-size:0.82rem; margin-bottom:5px;">📝 نوع الرسالة:</label>
                                <select id="crmOfferTemplateType" class="filter-select" style="width:100%;" onchange="BayanCRM.rebuildCrmOfferMessage()">
                                    <option value="vip">👑 شكر وعرض VIP خاص</option>
                                    <option value="comeback">🌸 افتقدناك — كوبون عودة للشراء</option>
                                    <option value="new_arrival">🔥 وصلت تشكيلة جديدة تهمك</option>
                                </select>
                            </div>
                            <div>
                                <label style="display:block; font-weight:900; font-size:0.82rem; margin-bottom:5px;">🎟️ إرفاق كوبون خصم:</label>
                                <select id="crmOfferCouponSelect" class="filter-select" style="width:100%;" onchange="BayanCRM.rebuildCrmOfferMessage()"></select>
                            </div>
                        </div>
                        <div>
                            <label style="display:block; font-weight:900; font-size:0.84rem; margin-bottom:6px;">💬 نص الرسالة المخصصة للعميل:</label>
                            <textarea id="crmOfferMessageText" rows="7" style="width:100%; border:1.5px solid #cbd5e1; border-radius:12px; padding:12px; font-family:inherit; font-size:0.88rem; line-height:1.65; resize:vertical;"></textarea>
                        </div>
                        <div style="display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap;">
                            <button type="button" class="btn-card-action" onclick="BayanCRM.copyCrmOfferMessage()">📋 نسخ الرسالة</button>
                            <button type="button" onclick="BayanCRM.sendCrmOfferNow()"
                                style="background:linear-gradient(135deg,#059669,#047857); color:#fff; border:none; border-radius:12px; padding:10px 20px; font-weight:900; font-size:0.92rem; cursor:pointer; display:inline-flex; align-items:center; gap:8px;">
                                <span>💬</span>
                                <span>إرسال على واتساب بنقرة واحدة</span>
                            </button>
                        </div>
                    </div>
                </div>
            `;
            modal.addEventListener('click', (e) => { if (e.target === modal) closeCrmOfferModal(); });
            document.body.appendChild(modal);
        }

        if (!document.getElementById('bayanCrmHistoryModal')) {
            const modal = document.createElement('div');
            modal.id = 'bayanCrmHistoryModal';
            modal.className = 'modal-overlay';
            modal.style.zIndex = '99990';
            modal.innerHTML = `
                <div class="modal-card" style="max-width:680px; width:95%; max-height:86vh; display:flex; flex-direction:column; border-radius:20px; overflow:hidden;">
                    <div class="modal-head" style="background:#0f172a; color:#ffffff;">
                        <div>
                            <div id="crmHistoryTitle" style="font-weight:950; font-size:1.05rem;">سجل طلبات العميل</div>
                            <div id="crmHistorySub" style="font-size:0.78rem; color:#cbd5e1;"></div>
                        </div>
                        <button type="button" class="btn-modal-close" style="background:rgba(255,255,255,0.16); color:#fff;" onclick="document.getElementById('bayanCrmHistoryModal').classList.remove('open')">✕</button>
                    </div>
                    <div id="crmHistoryBody" style="padding:16px; overflow-y:auto; display:flex; flex-direction:column; gap:10px;"></div>
                </div>
            `;
            modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });
            document.body.appendChild(modal);
        }
    }

    // =========================================================================
    // 2. منطق السلات المتروكة (Abandoned Carts Live Sync & Recovery)
    // =========================================================================
    function switchOrdersSubView(view) {
        activeOrdersSubView = view === 'abandoned' ? 'abandoned' : 'orders';
        injectOrdersAbandonedSwitcher();
        const ordersPanel = document.getElementById('tabPanelOrders');
        const abandonedSec = document.getElementById('bayanAbandonedCartsSection');
        if (!ordersPanel || !abandonedSec) return;

        // إخفاء/إظهار عناصر الطلبات العادية داخل tabPanelOrders
        Array.from(ordersPanel.children).forEach(child => {
            if (child.id === 'bayanOrdersSubSwitcher' || child.id === 'bayanAbandonedCartsSection') return;
            child.style.display = activeOrdersSubView === 'orders' ? '' : 'none';
        });
        abandonedSec.style.display = activeOrdersSubView === 'abandoned' ? 'block' : 'none';

        const btnO = document.getElementById('subViewBtnOrders');
        const btnA = document.getElementById('subViewBtnAbandoned');
        if (btnO && btnA) {
            if (activeOrdersSubView === 'orders') {
                btnO.style.background = 'linear-gradient(135deg,#059669,#047857)';
                btnO.style.color = '#ffffff';
                btnO.style.borderColor = '#047857';
                btnA.style.background = '#fff7ed';
                btnA.style.color = '#c2410c';
                btnA.style.borderColor = '#fed7aa';
            } else {
                btnA.style.background = 'linear-gradient(135deg,#ea580c,#c2410c)';
                btnA.style.color = '#ffffff';
                btnA.style.borderColor = '#c2410c';
                btnO.style.background = '#f8fafc';
                btnO.style.color = '#334155';
                btnO.style.borderColor = '#cbd5e1';
                renderAbandonedCarts();
            }
        }
    }

    function setAbandonedChip(chip, btn) {
        activeAbandonedChip = chip;
        document.querySelectorAll('[data-ab-chip]').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        renderAbandonedCarts();
    }

    function listenToAbandonedCartsLive() {
        const col = getMetaColSafe();
        if (!col) {
            setTimeout(listenToAbandonedCartsLive, 2200);
            return;
        }
        col.onSnapshot(snap => {
            const list = [];
            snap.forEach(doc => {
                const d = doc.data() || {};
                if (doc.id.startsWith('abandoned_') || d.docType === 'abandoned_cart') {
                    list.push({
                        docId: doc.id,
                        ...d
                    });
                }
            });
            list.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
            adminAbandonedList = list;
            updateAbandonedBadgesAndStats();
            renderAbandonedCarts();
            if (document.getElementById('tabPanelCustomers')?.classList.contains('active')) {
                renderCustomers();
            }
        }, err => console.warn('Abandoned carts listener note:', err));
    }

    async function refreshAbandonedOnce() {
        const col = getMetaColSafe();
        if (!col) return;
        try {
            const snap = await col.get();
            const list = [];
            snap.forEach(doc => {
                const d = doc.data() || {};
                if (doc.id.startsWith('abandoned_') || d.docType === 'abandoned_cart') {
                    list.push({ docId: doc.id, ...d });
                }
            });
            list.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
            adminAbandonedList = list;
            updateAbandonedBadgesAndStats();
            renderAbandonedCarts();
            showToastMsg('🔄 تم تحديث قائمة السلات المتروكة!');
        } catch (err) {
            showToastMsg('⚠️ تعذر التحديث: ' + (err.message || err));
        }
    }

    function updateAbandonedBadgesAndStats() {
        const activeAb = adminAbandonedList.filter(c => !c.recovered && c.status !== 'recovered');
        const remindedAb = activeAb.filter(c => Number(c.reminderSentCount || 0) > 0);
        const recoveredAb = adminAbandonedList.filter(c => c.recovered || c.status === 'recovered');

        const pendingVal = activeAb.reduce((s, c) => s + (Number(c.subtotal) || 0), 0);
        const recoveredVal = recoveredAb.reduce((s, c) => s + (Number(c.subtotal) || 0), 0);

        const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        setTxt('subBadgeLiveOrders', getOrdersArray().length);
        setTxt('subBadgeAbandonedCarts', activeAb.length);
        setTxt('abStatActiveCount', `${activeAb.length} سلة`);
        setTxt('abStatPendingValue', `${Math.round(pendingVal).toLocaleString('ar-EG')} ج.م`);
        setTxt('abStatRecoveredCount', `${recoveredAb.length} سلة`);
        setTxt('abStatRecoveredValue', `${Math.round(recoveredVal).toLocaleString('ar-EG')} ج.م`);

        setTxt('abChipCountAbandoned', activeAb.length);
        setTxt('abChipCountReminded', remindedAb.length);
        setTxt('abChipCountRecovered', recoveredAb.length);
        setTxt('abChipCountAll', adminAbandonedList.length);
    }

    function renderAbandonedCarts() {
        const container = document.getElementById('bayanAbandonedCartsContainer');
        if (!container) return;

        const q = (document.getElementById('abandonedSearchInput')?.value || '').trim().toLowerCase();
        let list = [...adminAbandonedList];

        if (activeAbandonedChip === 'abandoned') {
            list = list.filter(c => !c.recovered && c.status !== 'recovered');
        } else if (activeAbandonedChip === 'reminded') {
            list = list.filter(c => !c.recovered && c.status !== 'recovered' && Number(c.reminderSentCount || 0) > 0);
        } else if (activeAbandonedChip === 'recovered') {
            list = list.filter(c => c.recovered || c.status === 'recovered');
        }

        if (q) {
            list = list.filter(c => {
                const itemsText = (c.items || []).map(i => `${i.name || ''} ${i.code || ''}`).join(' ').toLowerCase();
                return String(c.customerName || '').toLowerCase().includes(q)
                    || String(c.phone1 || '').includes(q)
                    || String(c.city || '').toLowerCase().includes(q)
                    || itemsText.includes(q);
            });
        }

        if (!list.length) {
            container.innerHTML = `
                <div style="text-align:center; padding:54px 20px; background:#ffffff; border-radius:16px; border:1.5px dashed #cbd5e1;">
                    <div style="font-size:2.8rem; margin-bottom:10px;">🛒✨</div>
                    <h3 style="font-weight:950; font-size:1.1rem; color:#0f172a; margin-bottom:6px;">لا توجد سلات متروكة مطابقة حالياً</h3>
                    <p style="font-size:0.88rem; color:#64748b; font-weight:700;">عند قيام أي زائر بإضافة منتجات أو كتابة رقمه ثم مغادرة المتجر قبل تأكيد الطلب، ستظهر سلتُه هنا فوراً للتواصل معه.</p>
                </div>`;
            return;
        }

        container.innerHTML = list.map(c => {
            const isRecovered = Boolean(c.recovered || c.status === 'recovered');
            const sentCnt = Number(c.reminderSentCount || 0);
            const waPhone = toWhatsAppPhone(c.phone1);
            const itemsRows = (c.items || []).map(it => `
                <tr>
                    <td style="font-weight:800; display:flex; align-items:center; gap:8px;">
                        ${it.image ? `<img src="${esc(it.image)}" style="width:34px;height:34px;border-radius:8px;object-fit:cover;border:1px solid #e2e8f0;" onerror="this.style.display='none'">` : ''}
                        <span>${esc(it.name || 'منتج')}</span>
                    </td>
                    <td style="text-align:center;"><span style="background:#f1f5f9;padding:2px 7px;border-radius:4px;font-weight:900;">${esc(it.size || 'حر')}</span></td>
                    <td style="text-align:center;"><span style="background:#f1f5f9;padding:2px 7px;border-radius:4px;">${esc(it.color || 'أساسي')}</span></td>
                    <td style="text-align:center;font-weight:900;">${Number(it.qty || 1)}</td>
                    <td style="text-align:left;font-weight:900;color:#059669;">${Math.round(Number(it.unitPrice || 0) * Number(it.qty || 1)).toLocaleString('ar-EG')} ج.م</td>
                </tr>
            `).join('');

            const badge = isRecovered
                ? `<span style="background:#dcfce7;color:#166534;padding:4px 12px;border-radius:999px;font-weight:900;font-size:0.8rem;">✅ تم الاسترداد ${c.recoveredOrderId ? '(طلب #' + esc(c.recoveredOrderId) + ')' : ''}</span>`
                : (sentCnt > 0
                    ? `<span style="background:#e0f2fe;color:#0369a1;padding:4px 12px;border-radius:999px;font-weight:900;font-size:0.8rem;">📩 تم التذكير (${sentCnt}×)</span>`
                    : `<span style="background:#ffedd5;color:#c2410c;padding:4px 12px;border-radius:999px;font-weight:900;font-size:0.8rem;">🟠 سلة متروكة</span>`);

            return `
                <div class="order-card-admin" style="border-right:4px solid ${isRecovered ? '#059669' : '#ea580c'} !important;">
                    <div class="order-head">
                        <div style="display:flex; align-items:center; gap:12px;">
                            <span style="font-size:1.5rem;">🛒</span>
                            <div>
                                <div style="font-weight:950; font-size:1.04rem; color:#0f172a;">
                                    ${esc(c.customerName || 'عميل لم يكمل الاسم')}
                                    <span style="font-size:0.78rem; color:#64748b; font-weight:800; margin-right:6px;">(${c.source === 'quick_order' ? 'نموذج طلب سريع' : 'سلة المشتريات'})</span>
                                </div>
                                <div style="font-size:0.83rem; color:#475569; margin-top:2px;">
                                    📱 <b dir="ltr">${esc(c.phone1 || 'لا يوجد رقم')}</b>
                                    ${c.city ? ` • 📍 ${esc(c.city)}` : ''}
                                    ${c.address ? ` - ${esc(c.address)}` : ''}
                                    • ⏱️ <span style="color:#ea580c;font-weight:800;">${formatRelativeAr(c.updatedAt || c.createdAt)}</span>
                                </div>
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                            ${badge}
                        </div>
                    </div>

                    <div class="order-body-admin">
                        <table class="order-items-table">
                            <thead>
                                <tr>
                                    <th>الصنف</th>
                                    <th style="text-align:center;">المقاس</th>
                                    <th style="text-align:center;">اللون</th>
                                    <th style="text-align:center;">الكمية</th>
                                    <th style="text-align:left;">الإجمالي</th>
                                </tr>
                            </thead>
                            <tbody>${itemsRows}</tbody>
                        </table>

                        <div style="margin-top:14px; padding-top:12px; border-top:1.5px dashed #e2e8f0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                                ${waPhone ? `
                                    <button type="button" class="btn-card-action" data-docid="${esc(c.docId)}" onclick="BayanCRM.openAbandonedWaModal(this.getAttribute('data-docid'))"
                                        style="background:linear-gradient(135deg,#059669,#047857); color:#ffffff; border-color:#047857; font-weight:900;">
                                        <span>📲 إرسال تذكير واتساب + كوبون</span>
                                    </button>
                                    <a href="tel:${esc(c.phone1)}" class="btn-card-action"><span>📞 اتصال</span></a>
                                ` : '<span style="font-size:0.8rem;color:#94a3b8;font-weight:700;">لا يوجد رقم هاتف للتواصل</span>'}
                                ${!isRecovered ? `
                                    <button type="button" class="btn-card-action" data-docid="${esc(c.docId)}" onclick="BayanCRM.markAbandonedRecoveredManually(this.getAttribute('data-docid'))" style="background:#ecfdf5;color:#047857;border-color:#6ee7b7;font-weight:800;">
                                        <span>✅ تعليم كمسترد</span>
                                    </button>
                                ` : ''}
                                <button type="button" class="btn-card-action" data-docid="${esc(c.docId)}" onclick="BayanCRM.deleteAbandonedCart(this.getAttribute('data-docid'))" style="background:#fef2f2;color:#dc2626;border-color:#fecaca;">
                                    <span>🗑️ حذف</span>
                                </button>
                            </div>
                            <div style="font-size:1.05rem; font-weight:950; color:#0f172a;">
                                قيمة السلة: <span style="color:#ea580c;">${Math.round(Number(c.subtotal || 0)).toLocaleString('ar-EG')} ج.م</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function openAbandonedWaModal(docId) {
        ensureModals();
        const item = adminAbandonedList.find(x => x.docId === docId);
        if (!item) return;
        currentWaAbandonedItem = item;

        document.getElementById('abWaModalSub').textContent = `${item.customerName || 'العميل'} • ${item.phone1 || ''} • ${Math.round(Number(item.subtotal || 0)).toLocaleString('ar-EG')} ج.م`;

        const sel = document.getElementById('abWaCouponSelect');
        const activeCoupons = getActiveCoupons();
        sel.innerHTML = `<option value="">بدون كوبون إضافي (تذكير لطيف فقط)</option>` + activeCoupons.map(c => {
            const label = c.type === 'percent' ? `خصم ${c.value}%` : `خصم ${c.value} ج.م`;
            return `<option value="${esc(c.code)}">🎟️ ${esc(c.code)} (${label})</option>`;
        }).join('');

        if (item.couponCode && activeCoupons.some(c => c.code === item.couponCode)) {
            sel.value = item.couponCode;
        }
        rebuildAbandonedWaMessage();
        document.getElementById('bayanAbandonedWaModal').classList.add('open');
    }

    function closeAbandonedWaModal() {
        const m = document.getElementById('bayanAbandonedWaModal');
        if (m) m.classList.remove('open');
    }

    function rebuildAbandonedWaMessage() {
        const item = currentWaAbandonedItem;
        if (!item) return;
        const code = (document.getElementById('abWaCouponSelect')?.value || '').trim().toUpperCase();
        const couponObj = code ? getActiveCoupons().find(c => c.code === code) : null;
        const storeName = getStoreNameSafe();
        const custName = item.customerName || 'عميلنا العزيز';
        const itemsText = (item.items || []).slice(0, 4).map(i => `• ${i.name}${i.size ? ` (${i.size})` : ''}${i.color ? ` - ${i.color}` : ''} × ${i.qty || 1}`).join('\n');
        const subtotal = Math.round(Number(item.subtotal || 0)).toLocaleString('ar-EG');
        const recoverUrl = buildRecoveryLink(item.id || item.docId.replace(/^abandoned_/, ''), code);

        let couponBlock = '';
        if (couponObj) {
            const discText = couponObj.type === 'percent' ? `${couponObj.value}%` : `${couponObj.value} ج.م`;
            couponBlock = `\n🎁 هدية خاصة لحضرتك لاستكمال طلبك الآن:\nاستخدم كود الخصم *${couponObj.code}* واحصل على خصم فوري *${discText}*! ✨\n`;
        }

        const msg = `أهلاً بحضرتك أ/ ${custName} 🌸\n` +
            `معاك متجر *${storeName}* 👗✨\n\n` +
            `لاحظنا إن حضرتك اخترت موديلات رائعة ونسيت تأكيد الطلب قبل إغلاق الصفحة:\n` +
            `${itemsText}\n\n` +
            `💰 إجمالي السلة: *${subtotal} ج.م*\n` +
            `${couponBlock}\n` +
            `🛒 عشان نوفرلك وقتك، جهزنا لك رابط مباشر يسترجع سلتك كما هي فوراً لتكملة الطلب في ثوانٍ:\n` +
            `${recoverUrl}\n\n` +
            `القطع محجوزة لحضرتك حالياً قبل نفاد المقاس 🤍 لو محتاج أي مساعدة رد علينا هنا فوراً!`;

        const ta = document.getElementById('abWaMessageText');
        if (ta) ta.value = msg;
    }

    async function quickCreateRecoveryCoupon() {
        const db = typeof getBayanDb === 'function' ? getBayanDb() : null;
        if (!db) { alert('⚠️ غير متصل بقاعدة البيانات حالياً'); return; }
        const code = 'BACK10';
        const existing = getCouponsArray().find(c => String(c.code || '').toUpperCase() === code);
        if (!existing) {
            try {
                await db.collection('coupons').add({
                    code,
                    type: 'percent',
                    value: 10,
                    minOrder: 0,
                    maxUses: 0,
                    usedCount: 0,
                    active: true,
                    createdAt: new Date().toISOString(),
                    note: 'كوبون استرداد السلات المتروكة السريع'
                });
                showToastMsg(`🎉 تم إنشاء وتفعيل كوبون الخصم ${code} (10%) بنجاح!`);
            } catch (err) {
                alert('❌ تعذر إنشاء الكوبون: ' + err.message);
                return;
            }
        }
        setTimeout(() => {
            const sel = document.getElementById('abWaCouponSelect');
            if (sel) {
                if (!Array.from(sel.options).some(o => o.value === code)) {
                    const opt = document.createElement('option');
                    opt.value = code;
                    opt.textContent = `🎟️ ${code} (خصم 10%)`;
                    sel.appendChild(opt);
                }
                sel.value = code;
                rebuildAbandonedWaMessage();
            }
        }, 350);
    }

    function copyAbandonedWaMessage() {
        const txt = document.getElementById('abWaMessageText')?.value || '';
        if (!txt) return;
        navigator.clipboard.writeText(txt).then(() => showToastMsg('📋 تم نسخ رسالة التذكير ورابط الاسترداد!'));
    }

    async function sendAbandonedWaNow() {
        const item = currentWaAbandonedItem;
        if (!item) return;
        const phone = toWhatsAppPhone(item.phone1);
        if (!phone) { alert('⚠️ لا يوجد رقم واتساب صالح لهذا العميل'); return; }
        const txt = document.getElementById('abWaMessageText')?.value || '';
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(txt)}`, '_blank', 'noopener');

        const col = getMetaColSafe();
        if (col && item.docId) {
            try {
                const nextCount = Number(item.reminderSentCount || 0) + 1;
                await col.doc(item.docId).set({
                    reminderSentCount: nextCount,
                    lastRemindedAt: new Date().toISOString(),
                    lastCouponOffered: (document.getElementById('abWaCouponSelect')?.value || '').trim().toUpperCase()
                }, { merge: true });
            } catch (_) { }
        }
        closeAbandonedWaModal();
    }

    async function markAbandonedRecoveredManually(docId) {
        const col = getMetaColSafe();
        if (!col) return;
        await col.doc(docId).set({
            status: 'recovered',
            recovered: true,
            recoveredAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }, { merge: true });
        showToastMsg('✅ تم تعليم السلة كمُستردة!');
    }

    async function deleteAbandonedCart(docId) {
        if (!confirm('هل تريد حذف هذه السلة المتروكة من القائمة؟')) return;
        const col = getMetaColSafe();
        if (!col) return;
        await col.doc(docId).delete();
        showToastMsg('🗑️ تم حذف السلة المتروكة');
    }

    // =========================================================================
    // 3. منطق تبويب «عملاء المتجر» (Customer CRM Engine)
    // =========================================================================
    function buildAggregatedCustomers() {
        const orders = getOrdersArray();
        const activeAbandonedPhones = new Set(
            adminAbandonedList
                .filter(a => !a.recovered && a.status !== 'recovered')
                .map(a => normalizePhoneKey(a.phone1))
                .filter(Boolean)
        );

        const map = new Map();
        for (const o of orders) {
            if (!o) continue;
            const phoneKey = normalizePhoneKey(o.phone1);
            const fallbackNameKey = String(o.customerName || '').trim().toLowerCase();
            const key = phoneKey || (fallbackNameKey ? 'name_' + fallbackNameKey : '');
            if (!key) continue;

            if (!map.has(key)) {
                map.set(key, {
                    key,
                    phoneKey,
                    phone1: String(o.phone1 || '').trim(),
                    phone2: String(o.phone2 || '').trim(),
                    name: String(o.customerName || 'عميل').trim(),
                    city: String(o.city || '').trim(),
                    address: String(o.address || '').trim(),
                    totalOrders: 0,
                    deliveredOrders: 0,
                    activeOrders: 0,
                    cancelledOrders: 0,
                    deliveredSpend: 0,
                    totalSpend: 0,
                    lastOrderTs: 0,
                    lastOrderDate: '',
                    productCounts: new Map(),
                    orders: []
                });
            }

            const rec = map.get(key);
            const ts = new Date(o.date || o.createdAt || 0).getTime() || 0;
            if (ts >= rec.lastOrderTs) {
                rec.lastOrderTs = ts;
                rec.lastOrderDate = o.date || o.createdAt || '';
                if (o.customerName) rec.name = String(o.customerName).trim();
                if (o.phone1) rec.phone1 = String(o.phone1).trim();
                if (o.phone2) rec.phone2 = String(o.phone2).trim();
                if (o.city) rec.city = String(o.city).trim();
                if (o.address) rec.address = String(o.address).trim();
            }

            const grand = Math.max(0, Number(o.grandTotal) || 0);
            rec.totalOrders++;
            if (o.status === 'cancelled') {
                rec.cancelledOrders++;
            } else if (o.status === 'delivered') {
                rec.deliveredOrders++;
                rec.deliveredSpend += grand;
                rec.totalSpend += grand;
            } else {
                rec.activeOrders++;
                rec.totalSpend += grand;
            }

            (o.items || []).forEach(it => {
                const nm = String(it.name || '').trim();
                if (nm) rec.productCounts.set(nm, (rec.productCounts.get(nm) || 0) + (Number(it.qty) || 1));
            });
            rec.orders.push(o);
        }

        const list = [];
        for (const rec of map.values()) {
            const successfulOrders = rec.deliveredOrders + rec.activeOrders;
            let tier = 'new';
            if (rec.cancelledOrders >= 2 && rec.cancelledOrders >= successfulOrders) {
                tier = 'risk';
            } else if (successfulOrders >= 3 || (rec.deliveredSpend >= 3000 && successfulOrders >= 2)) {
                tier = 'vip';
            } else if (successfulOrders === 2) {
                tier = 'repeat';
            }

            const topProducts = Array.from(rec.productCounts.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([n, qty]) => `${n} (${qty})`);

            rec.orders.sort((a, b) => (new Date(b.date || b.createdAt || 0).getTime() || 0) - (new Date(a.date || a.createdAt || 0).getTime() || 0));

            list.push({
                ...rec,
                successfulOrders,
                tier,
                hasAbandonedCart: Boolean(rec.phoneKey && activeAbandonedPhones.has(rec.phoneKey)),
                topProducts
            });
        }

        crmAggregatedCustomers = list;
        const badge = document.getElementById('tabBadgeCustomers');
        if (badge) badge.textContent = list.length;
        return list;
    }

    function setCrmChip(chip, btn) {
        activeCrmChip = chip;
        document.querySelectorAll('[data-crm-chip]').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        renderCustomers();
    }

    function renderCustomers() {
        ensureCustomersTabPanel();
        const customers = buildAggregatedCustomers();

        const vipList = customers.filter(c => c.tier === 'vip');
        const repeatList = customers.filter(c => c.tier === 'repeat');
        const newList = customers.filter(c => c.tier === 'new');
        const riskList = customers.filter(c => c.tier === 'risk');
        const abList = customers.filter(c => c.hasAbandonedCart);
        const totalSpendSum = customers.reduce((s, c) => s + c.totalSpend, 0);

        const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        setTxt('crmStatTotal', `${customers.length} عميل`);
        setTxt('crmStatVip', `${vipList.length} عميل`);
        setTxt('crmStatRepeat', `${repeatList.length} عميل`);
        setTxt('crmStatSpend', `${Math.round(totalSpendSum).toLocaleString('ar-EG')} ج.م`);
        setTxt('crmStatRisk', `${riskList.length} عميل`);

        setTxt('crmChipAll', customers.length);
        setTxt('crmChipVip', vipList.length);
        setTxt('crmChipRepeat', repeatList.length);
        setTxt('crmChipNew', newList.length);
        setTxt('crmChipRisk', riskList.length);
        setTxt('crmChipAbandoned', abList.length);

        const container = document.getElementById('bayanCrmCustomersContainer');
        if (!container) return;

        const q = (document.getElementById('crmSearchInput')?.value || '').trim().toLowerCase();
        const sortBy = document.getElementById('crmSortSelect')?.value || 'spend_desc';

        let filtered = [...customers];
        if (activeCrmChip !== 'all') {
            filtered = activeCrmChip === 'abandoned'
                ? filtered.filter(c => c.hasAbandonedCart)
                : filtered.filter(c => c.tier === activeCrmChip);
        }
        if (q) {
            filtered = filtered.filter(c =>
                c.name.toLowerCase().includes(q)
                || String(c.phone1 || '').includes(q)
                || String(c.city || '').toLowerCase().includes(q)
                || String(c.address || '').toLowerCase().includes(q)
            );
        }

        filtered.sort((a, b) => {
            if (sortBy === 'orders_desc') return b.successfulOrders - a.successfulOrders || b.totalSpend - a.totalSpend;
            if (sortBy === 'recent_desc') return b.lastOrderTs - a.lastOrderTs;
            if (sortBy === 'cancelled_desc') return b.cancelledOrders - a.cancelledOrders || b.totalOrders - a.totalOrders;
            return b.totalSpend - a.totalSpend || b.successfulOrders - a.successfulOrders;
        });

        if (!filtered.length) {
            container.innerHTML = `
                <div style="grid-column:1/-1; text-align:center; padding:54px 20px; background:#ffffff; border-radius:16px; border:1.5px dashed #cbd5e1;">
                    <div style="font-size:2.8rem; margin-bottom:8px;">👥</div>
                    <h3 style="font-weight:950; color:#0f172a; margin-bottom:6px;">لا يوجد عملاء مطابقون للبحث أو التصنيف</h3>
                    <p style="font-size:0.86rem; color:#64748b; font-weight:700;">يتم بناء سجل العملاء تلقائياً من الطلبات المسجلة حسب رقم الموبايل.</p>
                </div>`;
            return;
        }

        const tierMeta = {
            vip: { label: '👑 عميل VIP', bg: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#ffffff', border: '#f59e0b' },
            repeat: { label: '⭐ عميل متكرر', bg: '#dcfce7', color: '#166534', border: '#86efac' },
            new: { label: '🌱 عميل جديد', bg: '#f1f5f9', color: '#334155', border: '#cbd5e1' },
            risk: { label: '⚠️ كثير الإلغاء', bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' }
        };

        container.innerHTML = filtered.map(c => {
            const tm = tierMeta[c.tier] || tierMeta.new;
            const waPhone = toWhatsAppPhone(c.phone1);
            return `
                <div style="background:#ffffff; border:1.5px solid #e2e8f0; border-top:4px solid ${tm.border}; border-radius:16px; padding:16px; box-shadow:0 4px 14px rgba(15,23,42,0.045); display:flex; flex-direction:column; gap:12px;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                        <div>
                            <div style="font-weight:950; font-size:1.05rem; color:#0f172a;">${esc(c.name)}</div>
                            <div style="font-size:0.82rem; color:#64748b; font-weight:700; margin-top:2px;">
                                📱 <span dir="ltr">${esc(c.phone1 || 'غير متوفر')}</span>
                                ${c.city ? ` • 📍 ${esc(c.city)}` : ''}
                            </div>
                        </div>
                        <span style="background:${tm.bg}; color:${tm.color}; padding:4px 10px; border-radius:999px; font-size:0.75rem; font-weight:900; white-space:nowrap;">${tm.label}</span>
                    </div>

                    ${c.hasAbandonedCart ? `<div style="background:#fff7ed; color:#c2410c; border:1px solid #fed7aa; padding:6px 10px; border-radius:10px; font-size:0.78rem; font-weight:900;">🛒 لديه سلة متروكة حالياً بانتظار التذكير</div>` : ''}

                    <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:10px; text-align:center;">
                        <div>
                            <div style="font-size:0.72rem; color:#64748b; font-weight:800;">الطلبات الناجحة</div>
                            <div style="font-weight:950; font-size:1rem; color:#059669;">${c.successfulOrders}</div>
                        </div>
                        <div>
                            <div style="font-size:0.72rem; color:#64748b; font-weight:800;">الملغاة</div>
                            <div style="font-weight:950; font-size:1rem; color:${c.cancelledOrders > 0 ? '#dc2626' : '#64748b'};">${c.cancelledOrders}</div>
                        </div>
                        <div>
                            <div style="font-size:0.72rem; color:#64748b; font-weight:800;">إجمالي الإنفاق</div>
                            <div style="font-weight:950; font-size:0.95rem; color:#0284c7;">${Math.round(c.totalSpend).toLocaleString('ar-EG')} ج.م</div>
                        </div>
                    </div>

                    <div style="font-size:0.78rem; color:#475569; line-height:1.55;">
                        <div>🕒 <b>آخر طلب:</b> ${formatRelativeAr(c.lastOrderDate)} (محصّل فعلياً: <b style="color:#059669;">${Math.round(c.deliveredSpend).toLocaleString('ar-EG')} ج.م</b>)</div>
                        ${c.topProducts.length ? `<div style="margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">🛍️ <b>الأكثر طلباً:</b> ${esc(c.topProducts.join(' • '))}</div>` : ''}
                    </div>

                    <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:auto; padding-top:8px; border-top:1px dashed #e2e8f0;">
                        ${waPhone ? `
                            <button type="button" class="btn-card-action" data-key="${esc(c.key)}" onclick="BayanCRM.openCrmOfferModal(this.getAttribute('data-key'))"
                                style="flex:1; background:linear-gradient(135deg,#059669,#047857); color:#ffffff; border-color:#047857; font-weight:900; justify-content:center;">
                                <span>🎁 إرسال عرض / كوبون</span>
                            </button>
                            <a href="tel:${esc(c.phone1)}" class="btn-card-action" title="اتصال"><span>📞</span></a>
                        ` : ''}
                        <button type="button" class="btn-card-action" data-key="${esc(c.key)}" onclick="BayanCRM.openCustomerHistory(this.getAttribute('data-key'))" style="font-weight:800;">
                            <span>📋 الطلبات (${c.totalOrders})</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function openCrmOfferModal(custKey) {
        ensureModals();
        const cust = crmAggregatedCustomers.find(c => c.key === custKey);
        if (!cust) return;
        currentWaCrmCustomer = cust;

        document.getElementById('crmOfferModalSub').textContent = `${cust.name} • ${cust.phone1} • إنفاق: ${Math.round(cust.totalSpend).toLocaleString('ar-EG')} ج.م`;
        const typeSel = document.getElementById('crmOfferTemplateType');
        if (typeSel) typeSel.value = cust.tier === 'vip' ? 'vip' : 'comeback';

        const cSel = document.getElementById('crmOfferCouponSelect');
        const activeCoupons = getActiveCoupons();
        cSel.innerHTML = `<option value="">بدون كوبون (رسالة عرض فقط)</option>` + activeCoupons.map(c => {
            const label = c.type === 'percent' ? `خصم ${c.value}%` : `خصم ${c.value} ج.م`;
            return `<option value="${esc(c.code)}">🎟️ ${esc(c.code)} (${label})</option>`;
        }).join('');

        rebuildCrmOfferMessage();
        document.getElementById('bayanCrmOfferModal').classList.add('open');
    }

    function closeCrmOfferModal() {
        const m = document.getElementById('bayanCrmOfferModal');
        if (m) m.classList.remove('open');
    }

    function rebuildCrmOfferMessage() {
        const cust = currentWaCrmCustomer;
        if (!cust) return;
        const tplType = document.getElementById('crmOfferTemplateType')?.value || 'vip';
        const code = (document.getElementById('crmOfferCouponSelect')?.value || '').trim().toUpperCase();
        const couponObj = code ? getActiveCoupons().find(c => c.code === code) : null;
        const storeName = getStoreNameSafe();
        const storeUrl = typeof window.getStorefrontUrl === 'function' ? window.getStorefrontUrl() : 'index.html';

        let couponPart = '';
        if (couponObj) {
            const discText = couponObj.type === 'percent' ? `${couponObj.value}%` : `${couponObj.value} ج.م`;
            couponPart = `\n🎁 هديتنا لحضرتك كود خصم خاص: *${couponObj.code}* بقيمة خصم *${discText}* عند الطلب من المتجر! ✨\n`;
        }

        let body = '';
        if (tplType === 'vip') {
            body = `أهلاً بحضرتك أ/ ${cust.name} 👑🌸\nمن متجر *${storeName}* 👗✨\n\nلأنك من عملائنا المميزين (VIP) اللي بنعتز بثقتهم الدائمة فينا (${cust.successfulOrders} طلبات ناجحة 🤍)، حابين نهديك عرض خاص قبل أي حد!${couponPart}\n🛍️ تصفح أحدث تشكيلاتنا الآن:\n${storeUrl}`;
        } else if (tplType === 'comeback') {
            body = `أهلاً بحضرتك أ/ ${cust.name} 🌸\nوحشتنا في متجر *${storeName}*! 👗✨\n\nبقالنا فترة مش بنشوف طلباتك الجميلة وحابين نفكرك إننا جهزنا عروض قوية وقطع جديدة ممتازة.${couponPart}\n🛍️ شرفنا بالزيارة من هنا:\n${storeUrl}`;
        } else {
            body = `مساء الجمال أ/ ${cust.name} ✨🌸\nمن متجر *${storeName}* 👗\n\nوصل حديثاً موديلات وخامات جديدة ممتازة بمقاسات متوفرة دلوقتي قبل ما تخلص!${couponPart}\n🛒 اتفرج على التشكيلة الجديدة فوراً:\n${storeUrl}`;
        }

        const ta = document.getElementById('crmOfferMessageText');
        if (ta) ta.value = body;
    }

    function copyCrmOfferMessage() {
        const txt = document.getElementById('crmOfferMessageText')?.value || '';
        if (!txt) return;
        navigator.clipboard.writeText(txt).then(() => showToastMsg('📋 تم نسخ رسالة العرض بنجاح!'));
    }

    function sendCrmOfferNow() {
        const cust = currentWaCrmCustomer;
        if (!cust) return;
        const phone = toWhatsAppPhone(cust.phone1);
        if (!phone) { alert('⚠️ لا يوجد رقم واتساب صالح لهذا العميل'); return; }
        const txt = document.getElementById('crmOfferMessageText')?.value || '';
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(txt)}`, '_blank', 'noopener');
        closeCrmOfferModal();
    }

    function openCustomerHistory(custKey) {
        ensureModals();
        const cust = crmAggregatedCustomers.find(c => c.key === custKey);
        if (!cust) return;

        document.getElementById('crmHistoryTitle').textContent = `📋 سجل طلبات: ${cust.name}`;
        document.getElementById('crmHistorySub').textContent = `${cust.phone1} • إجمالي ${cust.totalOrders} طلبات (${cust.successfulOrders} ناجح / ${cust.cancelledOrders} ملغي)`;

        const body = document.getElementById('crmHistoryBody');
        body.innerHTML = cust.orders.map(o => {
            const dStr = o.date || o.createdAt ? new Date(o.date || o.createdAt).toLocaleString('ar-EG') : '';
            const itemsLine = (o.items || []).map(i => `${i.name} (${i.size || 'حر'}/${i.color || 'أساسي'}) × ${i.qty || 1}`).join(' + ');
            const isCan = o.status === 'cancelled';
            return `
                <div style="border:1.5px solid #e2e8f0; border-right:4px solid ${isCan ? '#dc2626' : '#059669'}; border-radius:12px; padding:12px; background:#f8fafc;">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:6px;">
                        <b style="color:#0f172a;">طلب #${esc(o.id)}</b>
                        <span style="font-size:0.78rem; font-weight:900; padding:2px 9px; border-radius:999px; background:${isCan ? '#fee2e2' : '#dcfce7'}; color:${isCan ? '#dc2626' : '#166534'};">${esc(o.status || 'new')}</span>
                    </div>
                    <div style="font-size:0.82rem; color:#334155; font-weight:700;">${esc(itemsLine || 'بدون أصناف')}</div>
                    <div style="display:flex; justify-content:space-between; margin-top:6px; font-size:0.78rem; color:#64748b;">
                        <span>📅 ${esc(dStr)}</span>
                        <b style="color:#059669;">${Math.round(Number(o.grandTotal || 0)).toLocaleString('ar-EG')} ج.م</b>
                    </div>
                </div>
            `;
        }).join('');

        document.getElementById('bayanCrmHistoryModal').classList.add('open');
    }

    function exportCustomersCSV() {
        if (!crmAggregatedCustomers.length) {
            alert('لا توجد بيانات عملاء للتصدير بعد');
            return;
        }
        const tierLabel = { vip: 'VIP', repeat: 'متكرر', new: 'جديد', risk: 'إلغاء مرتفع' };
        const headers = ['الاسم', 'رقم الموبايل', 'المحافظة', 'العنوان', 'التصنيف', 'الطلبات الناجحة', 'الطلبات الملغاة', 'إجمالي الإنفاق (ج.م)', 'المحصّل فعلياً (ج.م)', 'آخر طلب'];
        const rows = crmAggregatedCustomers.map(c => [
            c.name,
            c.phone1,
            c.city,
            c.address,
            tierLabel[c.tier] || c.tier,
            c.successfulOrders,
            c.cancelledOrders,
            Math.round(c.totalSpend),
            Math.round(c.deliveredSpend),
            c.lastOrderDate ? new Date(c.lastOrderDate).toLocaleDateString('ar-EG') : ''
        ]);
        const csv = '\uFEFF' + [headers, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bayan-customers-crm-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToastMsg('📊 تم تصدير قاعدة بيانات العملاء بنجاح!');
    }

    function hookTabSwitcher() {
        if (typeof window.switchAdminTab === 'function' && !window.switchAdminTab._bayanCrmWrapped) {
            const orig = window.switchAdminTab;
            const wrapped = function (tabName, btn) {
                if (tabName === 'customers') ensureCustomersTabPanel();
                orig.apply(this, arguments);
                if (tabName === 'customers') renderCustomers();
                if (tabName === 'orders') {
                    injectOrdersAbandonedSwitcher();
                    updateAbandonedBadgesAndStats();
                }
            };
            wrapped._bayanCrmWrapped = true;
            window.switchAdminTab = wrapped;
        }
    }

    function initAdminCrmAndAbandoned() {
        injectOrdersAbandonedSwitcher();
        ensureCustomersTabPanel();
        hookTabSwitcher();
        listenToAbandonedCartsLive();
        buildAggregatedCustomers();

        window.addEventListener('bayan:orders-updated', () => {
            updateAbandonedBadgesAndStats();
            buildAggregatedCustomers();
            if (document.getElementById('tabPanelCustomers')?.classList.contains('active')) {
                renderCustomers();
            }
        });
        window.addEventListener('bayan:coupons-updated', () => {
            if (document.getElementById('bayanAbandonedWaModal')?.classList.contains('open') && currentWaAbandonedItem) {
                openAbandonedWaModal(currentWaAbandonedItem.docId);
            }
        });
    }

    function onOrdersTabShown() {
        injectOrdersAbandonedSwitcher();
        updateAbandonedBadgesAndStats();
        if (activeOrdersSubView === 'abandoned') {
            renderAbandonedCarts();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAdminCrmAndAbandoned);
    } else {
        initAdminCrmAndAbandoned();
    }

    window.BayanCRM = {
        switchOrdersSubView,
        setAbandonedChip,
        refreshAbandonedOnce,
        renderAbandonedCarts,
        openAbandonedWaModal,
        closeAbandonedWaModal,
        rebuildAbandonedWaMessage,
        quickCreateRecoveryCoupon,
        copyAbandonedWaMessage,
        sendAbandonedWaNow,
        markAbandonedRecoveredManually,
        deleteAbandonedCart,
        setCrmChip,
        renderCustomers,
        openCrmOfferModal,
        closeCrmOfferModal,
        rebuildCrmOfferMessage,
        copyCrmOfferMessage,
        sendCrmOfferNow,
        openCustomerHistory,
        exportCustomersCSV,
        onOrdersTabShown,
        getAbandonedList: () => adminAbandonedList
    };
})(window);
