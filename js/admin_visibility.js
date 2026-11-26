/**
 * =========================================================================
 * 🎯 محرك التحكم في توفر المنتجات والمقاسات والألوان والأرصدة — لوحة التحكم
 * =========================================================================
 * - لوحة جانبية متكاملة بجانب الأصناف لفلترة اللوحة والتحكم الفوري بالموقع
 * - عرض تفصيلي لأرصدة الأصناف والمقاسات والألوان (الكل / المتوفر / غير المتوفر)
 * - مزامنة لحظية مع المتجر الإلكتروني عبر Firestore (settings/visibility)
 * - محرر سريع ومصفوفة أرصدة متوافقة 100% مع هيكل variantsStock في الكاشير POS
 * =========================================================================
 */
(function (window) {
    'use strict';

    const IGNORED_SIZES = new Set(['-', 'موحد', 'افتراضي', '']);
    const IGNORED_COLORS = new Set(['-', 'قياسي', 'أساسي', 'اساسي', 'افتراضي', '']);

    function esc(str) {
        if (typeof window.escapeAdminHtml === 'function') return window.escapeAdminHtml(str);
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function extractColorName(c) {
        if (!c) return '';
        if (typeof c === 'string') return c.trim();
        if (typeof c === 'object' && c.name) return String(c.name).trim();
        return '';
    }

    function extractSizeName(s) {
        if (s === null || s === undefined) return '';
        return String(s).trim();
    }

    /**
     * يحلل رصيد الصنف والمقاسات والألوان بشكل موحد ودقيق
     */
    function getProductInventorySnapshot(p) {
        if (!p || typeof p !== 'object') {
            return {
                totalStock: 0,
                isFrozen: true,
                isInStockFlag: false,
                isAvailable: false,
                hasVariantsStock: false,
                variantsStock: {},
                sizes: [],
                colors: [],
                availableSizesCount: 0,
                unavailableSizesCount: 0,
                availableColorsCount: 0,
                unavailableColorsCount: 0
            };
        }

        const isFrozen = p.isFrozen === true || p.status === 'frozen' || p.active === false;
        const isInStockFlag = p.inStock !== false;
        const vsRaw = (p.variantsStock && typeof p.variantsStock === 'object' && !Array.isArray(p.variantsStock))
            ? p.variantsStock
            : null;
        const vsKeys = vsRaw ? Object.keys(vsRaw) : [];
        const hasVariantsStock = vsKeys.length > 0;

        const cleanSizeList = [];
        const sizeSet = new Set();
        (Array.isArray(p.sizes) ? p.sizes : []).forEach(raw => {
            const s = extractSizeName(raw);
            if (s && !IGNORED_SIZES.has(s.toLowerCase()) && !sizeSet.has(s)) {
                sizeSet.add(s);
                cleanSizeList.push(s);
            }
        });

        const cleanColorList = [];
        const colorSet = new Set();
        (Array.isArray(p.colors) ? p.colors : []).forEach(raw => {
            const c = extractColorName(raw);
            if (c && !IGNORED_COLORS.has(c.toLowerCase()) && !colorSet.has(c)) {
                colorSet.add(c);
                cleanColorList.push(c);
            }
        });

        // ضمان تضمين أي مقاس أو لون مذكور في variantsStock
        if (hasVariantsStock) {
            vsKeys.forEach(k => {
                const parts = String(k).split('|');
                const sz = extractSizeName(parts[0]);
                const cl = extractSizeName(parts[1]);
                if (sz && !IGNORED_SIZES.has(sz.toLowerCase()) && !sizeSet.has(sz)) {
                    sizeSet.add(sz);
                    cleanSizeList.push(sz);
                }
                if (cl && !IGNORED_COLORS.has(cl.toLowerCase()) && !colorSet.has(cl)) {
                    colorSet.add(cl);
                    cleanColorList.push(cl);
                }
            });
        }

        let totalStock = 0;
        const variantsStockClean = {};
        if (hasVariantsStock) {
            vsKeys.forEach(k => {
                const qty = Math.max(0, Number(vsRaw[k]) || 0);
                variantsStockClean[k] = qty;
                totalStock += qty;
            });
        } else {
            const rawQty = p.stockQty !== undefined ? p.stockQty : (p.stock !== undefined ? p.stock : 0);
            totalStock = Math.max(0, Number(rawQty) || 0);
        }

        const isAvailable = !isFrozen && isInStockFlag && totalStock > 0;

        // حساب حالة كل مقاس
        const sizeEntries = cleanSizeList.map(sz => {
            let qty = 0;
            if (hasVariantsStock) {
                const matching = vsKeys.filter(k => String(k).split('|')[0].trim() === sz);
                qty = matching.reduce((sum, k) => sum + Math.max(0, Number(vsRaw[k]) || 0), 0);
            } else {
                qty = totalStock;
            }
            const available = isInStockFlag && !isFrozen && qty > 0;
            return { name: sz, qty, available };
        });

        // حساب حالة كل لون
        const colorEntries = cleanColorList.map(col => {
            let qty = 0;
            if (hasVariantsStock) {
                const matching = vsKeys.filter(k => (String(k).split('|')[1] || '').trim() === col);
                qty = matching.reduce((sum, k) => sum + Math.max(0, Number(vsRaw[k]) || 0), 0);
            } else {
                qty = totalStock;
            }
            const available = isInStockFlag && !isFrozen && qty > 0;
            return { name: col, qty, available };
        });

        return {
            totalStock,
            isFrozen,
            isInStockFlag,
            isAvailable,
            hasVariantsStock,
            variantsStock: variantsStockClean,
            sizes: sizeEntries,
            colors: colorEntries,
            availableSizesCount: sizeEntries.filter(s => s.available).length,
            unavailableSizesCount: sizeEntries.filter(s => !s.available).length,
            availableColorsCount: colorEntries.filter(c => c.available).length,
            unavailableColorsCount: colorEntries.filter(c => !c.available).length
        };
    }

    // حالة الفلاتر المحلية في لوحة التحكم
    window.adminVisibilityFilters = {
        variantsViewMode: 'all',     // 'all' | 'available' | 'unavailable' (عرض المقاسات والألوان داخل الكروت)
        variantsHealthFilter: 'all', // 'all' | 'partial_out' | 'full_in'
        selectedColor: 'all'
    };

    // إعدادات الظهور السحابية المتزامنة مع المتجر الإلكتروني
    window.storeVisibilityConfig = {
        productsMode: 'all',      // 'all' | 'available' | 'unavailable'
        sizesMode: 'all',         // 'all' | 'available' | 'unavailable'
        colorsMode: 'all',        // 'all' | 'available' | 'unavailable'
        showStockCounts: true,
        showCardVariants: true,
        catalogVersion: 0
    };

    function loadLocalVisibilityConfig() {
        try {
            if (typeof BayanIDB !== 'undefined') {
                const raw = BayanIDB.getItem('bayan_store_visibility');
                if (raw) {
                    const parsed = JSON.parse(raw);
                    Object.assign(window.storeVisibilityConfig, parsed);
                }
            }
        } catch (_) { }
    }

    let _catalogVersionBumpTimer = null;
    function bumpCatalogVersionInCloud(immediate = false) {
        const doBump = () => {
            const db = (typeof getBayanDb === 'function') ? getBayanDb() : null;
            const nowTs = Date.now();
            window.storeVisibilityConfig.catalogVersion = nowTs;
            if (typeof BayanIDB !== 'undefined') {
                BayanIDB.setItem('bayan_store_visibility', JSON.stringify(window.storeVisibilityConfig));
            }
            if (db) {
                db.collection('settings').doc('visibility').set({
                    catalogVersion: nowTs,
                    updatedAt: new Date().toISOString()
                }, { merge: true }).catch(() => { });
            }
        };
        if (immediate) {
            clearTimeout(_catalogVersionBumpTimer);
            doBump();
        } else {
            clearTimeout(_catalogVersionBumpTimer);
            _catalogVersionBumpTimer = setTimeout(doBump, 350);
        }
    }

    async function persistStoreVisibilityConfig(toastMsg) {
        const cfg = {
            ...window.storeVisibilityConfig,
            catalogVersion: Date.now(),
            updatedAt: new Date().toISOString()
        };
        window.storeVisibilityConfig = cfg;

        if (typeof BayanIDB !== 'undefined') {
            BayanIDB.setItem('bayan_store_visibility', JSON.stringify(cfg));
        }

        // مزامنة مربع إظهار أرقام المخزون في تبويب الإعدادات والشحن أيضاً
        const shipStockChk = document.getElementById('setShowStockCount');
        if (shipStockChk) {
            shipStockChk.checked = cfg.showStockCounts !== false;
        }

        const db = (typeof getBayanDb === 'function') ? getBayanDb() : null;
        if (db) {
            try {
                await Promise.all([
                    db.collection('settings').doc('visibility').set(cfg, { merge: true }),
                    db.collection('settings').doc('shipping').set({
                        showStockCountToCustomers: cfg.showStockCounts !== false,
                        updatedAt: cfg.updatedAt
                    }, { merge: true })
                ]);
            } catch (err) {
                console.warn('[Visibility] Cloud sync warning:', err);
            }
        }

        renderVisibilitySidebarState();
        if (typeof window.showFastSaveToast === 'function') {
            window.showFastSaveToast(toastMsg || '⚡ تم التحديث والمزامنة مع المتجر الإلكتروني فوراً!');
        }
    }

    function listenToStoreVisibilitySettings() {
        const db = (typeof getBayanDb === 'function') ? getBayanDb() : null;
        if (!db) {
            setTimeout(listenToStoreVisibilitySettings, 1500);
            return;
        }
        db.collection('settings').doc('visibility').onSnapshot((doc) => {
            if (doc.exists) {
                const d = doc.data() || {};
                window.storeVisibilityConfig = {
                    productsMode: ['all', 'available', 'unavailable'].includes(d.productsMode) ? d.productsMode : 'all',
                    sizesMode: ['all', 'available', 'unavailable'].includes(d.sizesMode) ? d.sizesMode : 'all',
                    colorsMode: ['all', 'available', 'unavailable'].includes(d.colorsMode) ? d.colorsMode : 'all',
                    showStockCounts: d.showStockCounts !== false,
                    showCardVariants: d.showCardVariants !== false,
                    catalogVersion: Number(d.catalogVersion || 0)
                };
                if (typeof BayanIDB !== 'undefined') {
                    BayanIDB.setItem('bayan_store_visibility', JSON.stringify(window.storeVisibilityConfig));
                }
                const shipStockChk = document.getElementById('setShowStockCount');
                if (shipStockChk) shipStockChk.checked = window.storeVisibilityConfig.showStockCounts !== false;
                renderVisibilitySidebarState();
            }
        }, () => { });
    }

    /* =========================================================================
     * 1. حقن زر التحكم المركزي والنافذة المنبثقة في المنتصف (Center Control Modal)
     * ========================================================================= */
    window.openVisibilityControlModal = function () {
        const modal = document.getElementById('bayanVisibilityControlModal');
        if (!modal) return;
        renderVisibilitySidebarState();
        refreshDynamicFilterDropdowns(window.adminProductsList || []);
        modal.style.display = 'flex';
    };

    window.closeVisibilityControlModal = function () {
        const modal = document.getElementById('bayanVisibilityControlModal');
        if (modal) modal.style.display = 'none';
    };

    function injectVisibilityModalAndTrigger() {
        if (!document.getElementById('adminVisibilityStyles')) {
            const style = document.createElement('style');
            style.id = 'adminVisibilityStyles';
            style.textContent = `
                .vis-modal-overlay {
                    position: fixed;
                    inset: 0;
                    z-index: 10040;
                    background: rgba(15, 23, 42, 0.72);
                    backdrop-filter: blur(5px);
                    display: none;
                    align-items: center;
                    justify-content: center;
                    padding: 14px;
                    direction: rtl;
                }
                .vis-modal-card {
                    background: #ffffff;
                    border-radius: 22px;
                    width: 96vw;
                    max-width: 820px;
                    max-height: 90vh;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    box-shadow: 0 25px 65px rgba(15, 23, 42, 0.42);
                    border: 1.5px solid #cbd5e1;
                }
                .vis-modal-head {
                    padding: 15px 20px;
                    background: linear-gradient(135deg, #065f46, #047857);
                    color: #ffffff;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 10px;
                }
                .vis-modal-body {
                    padding: 18px;
                    overflow-y: auto;
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: 16px;
                    background: #f8fafc;
                }
                .vis-modal-foot {
                    padding: 12px 20px;
                    background: #ffffff;
                    border-top: 1px solid #e2e8f0;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    flex-wrap: wrap;
                    gap: 10px;
                }
                .vis-side-card {
                    background: #ffffff;
                    border: 1.5px solid #e2e8f0;
                    border-radius: 16px;
                    padding: 15px;
                    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.05);
                }
                .vis-side-card.store-live-card {
                    border: 2px solid #10b981;
                    background: linear-gradient(180deg, #f0fdf4 0%, #ffffff 32%);
                }
                .vis-side-title {
                    font-size: 0.94rem;
                    font-weight: 950;
                    color: #0f172a;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 6px;
                    margin-bottom: 10px;
                    padding-bottom: 8px;
                    border-bottom: 1px dashed #cbd5e1;
                }
                .vis-group-label {
                    font-size: 0.78rem;
                    font-weight: 900;
                    color: #475569;
                    margin-bottom: 5px;
                    display: block;
                }
                .vis-seg-group {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 4px;
                    background: #f1f5f9;
                    padding: 3px;
                    border-radius: 10px;
                    border: 1px solid #e2e8f0;
                    margin-bottom: 10px;
                }
                .vis-seg-btn {
                    border: none;
                    background: transparent;
                    padding: 7px 5px;
                    border-radius: 8px;
                    font-family: inherit;
                    font-size: 0.76rem;
                    font-weight: 800;
                    color: #475569;
                    cursor: pointer;
                    transition: all 0.16s ease;
                    white-space: nowrap;
                    text-align: center;
                }
                .vis-seg-btn:hover {
                    color: #0f172a;
                    background: rgba(255,255,255,0.65);
                }
                .vis-seg-btn.active {
                    background: #0f172a;
                    color: #ffffff;
                    font-weight: 900;
                    box-shadow: 0 2px 6px rgba(15,23,42,0.2);
                }
                .vis-seg-btn.active-green {
                    background: #059669;
                    color: #ffffff;
                    font-weight: 900;
                    box-shadow: 0 2px 6px rgba(5,150,105,0.28);
                }
                .vis-seg-btn.active-red {
                    background: #dc2626;
                    color: #ffffff;
                    font-weight: 900;
                    box-shadow: 0 2px 6px rgba(220,38,38,0.28);
                }
                .vis-mini-stats {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 6px;
                    margin-top: 8px;
                }
                .vis-mini-stat {
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 10px;
                    padding: 7px 8px;
                    text-align: center;
                }
                .vis-mini-stat .num {
                    font-size: 0.98rem;
                    font-weight: 950;
                    color: #0f172a;
                    line-height: 1.2;
                }
                .vis-mini-stat .lbl {
                    font-size: 0.68rem;
                    font-weight: 800;
                    color: #64748b;
                }
                .vis-toggle-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 8px;
                    padding: 8px 10px;
                    border-radius: 10px;
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    margin-bottom: 8px;
                    cursor: pointer;
                    font-size: 0.78rem;
                    font-weight: 800;
                    color: #0f172a;
                }
                .vis-toggle-row input {
                    width: 18px;
                    height: 18px;
                    accent-color: #059669;
                    cursor: pointer;
                    flex-shrink: 0;
                }
                .card-variants-box {
                    margin-top: 8px;
                    padding: 8px 10px;
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 10px;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .card-variants-row {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 4px;
                    align-items: center;
                }
                .var-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 2px 7px;
                    border-radius: 6px;
                    font-size: 0.72rem;
                    font-weight: 800;
                    cursor: pointer;
                    border: 1px solid transparent;
                    transition: transform 0.12s;
                }
                .var-badge:hover {
                    transform: translateY(-1px);
                }
                .var-badge.in {
                    background: #dcfce7;
                    color: #166534;
                    border-color: #86efac;
                }
                .var-badge.out {
                    background: #fee2e2;
                    color: #b91c1c;
                    border-color: #fecaca;
                    text-decoration: line-through;
                    opacity: 0.88;
                }
                .var-qty-pill {
                    background: rgba(255,255,255,0.85);
                    padding: 0 4px;
                    border-radius: 4px;
                    font-size: 0.68rem;
                    font-weight: 950;
                }
            `;
            document.head.appendChild(style);
        }

        // 1. حقن مربع / زر التحكم داخل شريط الأدوات في تبويب الأصناف والملابس
        const topRow = document.querySelector('#tabPanelProducts .filters-top-row');
        if (topRow && !document.getElementById('btnOpenVisibilityControlModal')) {
            const triggerBtn = document.createElement('button');
            triggerBtn.type = 'button';
            triggerBtn.id = 'btnOpenVisibilityControlModal';
            triggerBtn.className = 'btn-primary-action';
            triggerBtn.style.cssText = 'background:linear-gradient(135deg,#0f766e,#059669); border-color:#047857; padding:8px 14px; font-weight:900; box-shadow:0 3px 10px rgba(5,150,105,0.25);';
            triggerBtn.title = 'فتح نافذة التحكم في الأرصدة وظهور وإخفاء المتوفر في المتجر واللوحة';
            triggerBtn.onclick = () => window.openVisibilityControlModal();
            triggerBtn.innerHTML = `
                <span>🎛️</span>
                <span>التحكم في الأرصدة وظهور المتوفر</span>
                <span id="visTriggerStatusPill" style="background:rgba(255,255,255,0.22); color:#fff; padding:2px 8px; border-radius:999px; font-size:0.72rem; font-weight:900;">الكل</span>
            `;
            topRow.appendChild(triggerBtn);
        }

        // 2. إنشاء النافذة المنبثقة في منتصف الشاشة
        if (!document.getElementById('bayanVisibilityControlModal')) {
            const modal = document.createElement('div');
            modal.id = 'bayanVisibilityControlModal';
            modal.className = 'vis-modal-overlay';
            modal.addEventListener('click', (ev) => {
                if (ev.target === modal) window.closeVisibilityControlModal();
            });
            modal.innerHTML = `
                <div class="vis-modal-card">
                    <div class="vis-modal-head">
                        <div>
                            <div style="font-size:1.1rem; font-weight:950;">🎛️ التحكم في الأرصدة وظهور وإخفاء المتوفر</div>
                            <div style="font-size:0.78rem; color:#d1fae5; font-weight:700;">إعدادات الظهور في المتجر الإلكتروني وفلترة الأرصدة والمقاسات والألوان بلوحة التحكم</div>
                        </div>
                        <button type="button" onclick="closeVisibilityControlModal()"
                            style="background:rgba(255,255,255,0.2); border:none; color:#fff; width:36px; height:36px; border-radius:10px; font-size:18px; font-weight:900; cursor:pointer;">✕</button>
                    </div>

                    <div class="vis-modal-body">
                        <!-- 1. التحكم المباشر في المتجر الإلكتروني -->
                        <div class="vis-side-card store-live-card">
                            <div class="vis-side-title">
                                <span>🌐 ظهور المتجر (يسمّع فوراً)</span>
                                <span style="font-size:0.68rem; background:#dcfce7; color:#166534; padding:2px 8px; border-radius:999px; font-weight:900;">● لايف ⚡</span>
                            </div>

                            <span class="vis-group-label">🛍️ عرض المنتجات في الموقع:</span>
                            <div class="vis-seg-group" id="storeVisProductsGroup">
                                <button type="button" class="vis-seg-btn" data-val="all" onclick="setStoreVisibilityField('productsMode', 'all')">الكل</button>
                                <button type="button" class="vis-seg-btn" data-val="available" onclick="setStoreVisibilityField('productsMode', 'available')">المتوفر فقط</button>
                                <button type="button" class="vis-seg-btn" data-val="unavailable" onclick="setStoreVisibilityField('productsMode', 'unavailable')">غير المتوفر</button>
                            </div>

                            <span class="vis-group-label">📏 عرض المقاسات في الموقع:</span>
                            <div class="vis-seg-group" id="storeVisSizesGroup">
                                <button type="button" class="vis-seg-btn" data-val="all" onclick="setStoreVisibilityField('sizesMode', 'all')">الكل</button>
                                <button type="button" class="vis-seg-btn" data-val="available" onclick="setStoreVisibilityField('sizesMode', 'available')">المتوفرة فقط</button>
                                <button type="button" class="vis-seg-btn" data-val="unavailable" onclick="setStoreVisibilityField('sizesMode', 'unavailable')">غير المتوفرة</button>
                            </div>

                            <span class="vis-group-label">🎨 عرض الألوان في الموقع:</span>
                            <div class="vis-seg-group" id="storeVisColorsGroup">
                                <button type="button" class="vis-seg-btn" data-val="all" onclick="setStoreVisibilityField('colorsMode', 'all')">الكل</button>
                                <button type="button" class="vis-seg-btn" data-val="available" onclick="setStoreVisibilityField('colorsMode', 'available')">المتوفرة فقط</button>
                                <button type="button" class="vis-seg-btn" data-val="unavailable" onclick="setStoreVisibilityField('colorsMode', 'unavailable')">غير المتوفرة</button>
                            </div>

                            <label class="vis-toggle-row">
                                <span>🔢 إظهار أرقام الأرصدة للعملاء</span>
                                <input type="checkbox" id="visToggleShowStockCounts" onchange="setStoreVisibilityField('showStockCounts', this.checked)">
                            </label>

                            <label class="vis-toggle-row" style="margin-bottom:0;">
                                <span>🏷️ إظهار المقاسات والألوان على كارت المتجر</span>
                                <input type="checkbox" id="visToggleShowCardVariants" onchange="setStoreVisibilityField('showCardVariants', this.checked)">
                            </label>
                        </div>

                        <!-- 2. فلترة كل الأصناف والأرصدة والمقاسات في اللوحة -->
                        <div class="vis-side-card">
                            <div class="vis-side-title">
                                <span>🎛️ فلترة كل الأصناف باللوحة</span>
                                <button type="button" onclick="resetProductFilters()" style="border:none; background:#f1f5f9; color:#334155; border-radius:6px; padding:3px 8px; font-size:0.7rem; font-weight:900; cursor:pointer;">إعادة ضبط</button>
                            </div>

                            <span class="vis-group-label">📦 فلتر حالة توفر الأصناف:</span>
                            <div class="vis-seg-group" id="adminSideStockGroup">
                                <button type="button" class="vis-seg-btn" data-val="all" onclick="setAdminSideStockMode('all')">الكل</button>
                                <button type="button" class="vis-seg-btn" data-val="instock" onclick="setAdminSideStockMode('instock')">متوفر فقط</button>
                                <button type="button" class="vis-seg-btn" data-val="outofstock" onclick="setAdminSideStockMode('outofstock')">غير متوفر</button>
                            </div>

                            <span class="vis-group-label">📏🎨 عرض المقاسات والألوان بالكروت:</span>
                            <div class="vis-seg-group" id="adminSideVariantsViewGroup">
                                <button type="button" class="vis-seg-btn" data-val="all" onclick="setAdminVariantsViewMode('all')">الكل</button>
                                <button type="button" class="vis-seg-btn" data-val="available" onclick="setAdminVariantsViewMode('available')">المتوفرة فقط</button>
                                <button type="button" class="vis-seg-btn" data-val="unavailable" onclick="setAdminVariantsViewMode('unavailable')">غير المتوفرة</button>
                            </div>

                            <span class="vis-group-label">⚠️ فلتر كفاءة أرصدة المقاسات:</span>
                            <select id="adminSideVariantsHealth" class="form-control" style="padding:7px 10px; font-size:0.8rem; margin-bottom:10px;" onchange="setAdminVariantsHealthFilter(this.value)">
                                <option value="all">كل الأصناف (بغض النظر عن النواقص)</option>
                                <option value="partial_out">⚠️ أصناف بها مقاسات أو ألوان نافذة (0)</option>
                                <option value="full_in">✅ أصناف مكتملة التوفر (كل المقاسات والألوان متاحة)</option>
                            </select>

                            <span class="vis-group-label">🎨 تصفية بلون معين:</span>
                            <select id="adminColorFilter" class="form-control" style="padding:7px 10px; font-size:0.8rem;" onchange="setAdminColorFilter(this.value)">
                                <option value="all">🎨 كل الألوان</option>
                            </select>

                            <div class="vis-mini-stats" id="adminSidebarStockStats">
                                <div class="vis-mini-stat">
                                    <div class="num" id="sideStatTotalPieces" style="color:#0284c7;">0</div>
                                    <div class="lbl">إجمالي القطع بالمخزون</div>
                                </div>
                                <div class="vis-mini-stat">
                                    <div class="num" id="sideStatAvailableProds" style="color:#059669;">0</div>
                                    <div class="lbl">أصناف متوفرة</div>
                                </div>
                                <div class="vis-mini-stat">
                                    <div class="num" id="sideStatAvailSizes" style="color:#16a34a;">0</div>
                                    <div class="lbl">مقاسات متوفرة</div>
                                </div>
                                <div class="vis-mini-stat">
                                    <div class="num" id="sideStatOutSizes" style="color:#dc2626;">0</div>
                                    <div class="lbl">مقاسات نافذة (0)</div>
                                </div>
                            </div>

                            <button type="button" onclick="exportVariantsStockReportCSV()"
                                style="width:100%; margin-top:10px; padding:8px 10px; border-radius:10px; border:1px solid #cbd5e1; background:#f8fafc; color:#0f172a; font-family:inherit; font-size:0.77rem; font-weight:900; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
                                <span>📥</span>
                                <span>تصدير كشف الأرصدة والنواقص (Excel)</span>
                            </button>
                        </div>
                    </div>

                    <div class="vis-modal-foot">
                        <span style="font-size:0.78rem; color:#047857; font-weight:800;">⚡ أي اختيار يتم حفظه ومزامنته مع المتجر الإلكتروني لحظياً دون إعادة تحميل</span>
                        <button type="button" onclick="closeVisibilityControlModal()" class="btn-primary-action" style="background:#059669; border-color:#047857; padding:8px 22px;">
                            <span>✅ تم وإغلاق</span>
                        </button>
                    </div>
                </div>`;
            document.body.appendChild(modal);

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && modal.style.display === 'flex') {
                    window.closeVisibilityControlModal();
                }
            });
        }

        renderVisibilitySidebarState();
    }

    function applySegActive(groupId, activeVal) {
        const group = document.getElementById(groupId);
        if (!group) return;
        group.querySelectorAll('.vis-seg-btn').forEach(btn => {
            const val = btn.getAttribute('data-val');
            btn.classList.remove('active', 'active-green', 'active-red');
            if (val === activeVal) {
                if (val === 'available' || val === 'instock') btn.classList.add('active-green');
                else if (val === 'unavailable' || val === 'outofstock') btn.classList.add('active-red');
                else btn.classList.add('active');
            }
        });
    }

    function renderVisibilitySidebarState() {
        const cfg = window.storeVisibilityConfig;
        applySegActive('storeVisProductsGroup', cfg.productsMode);
        applySegActive('storeVisSizesGroup', cfg.sizesMode);
        applySegActive('storeVisColorsGroup', cfg.colorsMode);

        const chkStock = document.getElementById('visToggleShowStockCounts');
        if (chkStock) chkStock.checked = cfg.showStockCounts !== false;

        const chkCards = document.getElementById('visToggleShowCardVariants');
        if (chkCards) chkCards.checked = cfg.showCardVariants !== false;

        const chipVal = typeof window.activeProductQuickChip !== 'undefined' ? window.activeProductQuickChip : 'all';
        applySegActive('adminSideStockGroup', chipVal);
        applySegActive('adminSideVariantsViewGroup', window.adminVisibilityFilters.variantsViewMode);

        const healthSel = document.getElementById('adminSideVariantsHealth');
        if (healthSel) healthSel.value = window.adminVisibilityFilters.variantsHealthFilter || 'all';

        const colorSel = document.getElementById('adminColorFilter');
        if (colorSel) colorSel.value = window.adminVisibilityFilters.selectedColor || 'all';

        const pill = document.getElementById('visTriggerStatusPill');
        if (pill) {
            const pLbl = cfg.productsMode === 'available' ? 'المتوفر 🟢' : (cfg.productsMode === 'unavailable' ? 'النافذ 🔴' : 'الكل');
            pill.textContent = pLbl;
        }
    }

    function refreshDynamicFilterDropdowns(productsList) {
        const list = Array.isArray(productsList) ? productsList : [];
        const allSizes = new Set();
        const allColors = new Set();
        let totalPieces = 0;
        let availableProds = 0;
        let availSizesTotal = 0;
        let outSizesTotal = 0;

        list.forEach(p => {
            const snap = getProductInventorySnapshot(p);
            totalPieces += snap.totalStock;
            if (snap.isAvailable) availableProds++;
            availSizesTotal += snap.availableSizesCount;
            outSizesTotal += snap.unavailableSizesCount;
            snap.sizes.forEach(s => allSizes.add(s.name));
            snap.colors.forEach(c => allColors.add(c.name));
        });

        const elPieces = document.getElementById('sideStatTotalPieces');
        const elAvailProds = document.getElementById('sideStatAvailableProds');
        const elAvailSizes = document.getElementById('sideStatAvailSizes');
        const elOutSizes = document.getElementById('sideStatOutSizes');
        if (elPieces) elPieces.textContent = totalPieces.toLocaleString('en-US');
        if (elAvailProds) elAvailProds.textContent = availableProds;
        if (elAvailSizes) elAvailSizes.textContent = availSizesTotal;
        if (elOutSizes) elOutSizes.textContent = outSizesTotal;

        // تحديث قائمة المقاسات ديناميكياً دون فقدان الاختيار الحالي
        const sizeSel = document.getElementById('adminSizeFilter');
        if (sizeSel) {
            const curSize = sizeSel.value || 'all';
            const sortedSizes = Array.from(allSizes).sort((a, b) => a.localeCompare(b, 'ar', { numeric: true }));
            const optsHtml = ['<option value="all">📏 كل المقاسات</option>']
                .concat(sortedSizes.map(sz => `<option value="${esc(sz)}">مقاس ${esc(sz)}</option>`))
                .join('');
            if (sizeSel.dataset.lastOpts !== optsHtml) {
                sizeSel.innerHTML = optsHtml;
                sizeSel.dataset.lastOpts = optsHtml;
                sizeSel.value = sortedSizes.includes(curSize) ? curSize : 'all';
            }
        }

        // تحديث قائمة الألوان ديناميكياً
        const colorSel = document.getElementById('adminColorFilter');
        if (colorSel) {
            const curCol = window.adminVisibilityFilters.selectedColor || 'all';
            const sortedColors = Array.from(allColors).sort((a, b) => a.localeCompare(b, 'ar'));
            const optsHtml = ['<option value="all">🎨 كل الألوان</option>']
                .concat(sortedColors.map(col => `<option value="${esc(col)}">لون ${esc(col)}</option>`))
                .join('');
            if (colorSel.dataset.lastOpts !== optsHtml) {
                colorSel.innerHTML = optsHtml;
                colorSel.dataset.lastOpts = optsHtml;
                colorSel.value = sortedColors.includes(curCol) ? curCol : 'all';
            }
        }
    }

    /* =========================================================================
     * 2. دوال التحكم التي تستدعيها أزرار الشريط الجانبي
     * ========================================================================= */
    window.setStoreVisibilityField = function (field, val) {
        window.storeVisibilityConfig[field] = val;
        const labels = {
            productsMode: val === 'available' ? 'المتوفرة فقط 🟢' : (val === 'unavailable' ? 'غير المتوفرة فقط 🔴' : 'كل المنتجات'),
            sizesMode: val === 'available' ? 'المتوفرة فقط 🟢' : (val === 'unavailable' ? 'غير المتوفرة فقط 🔴' : 'كل المقاسات'),
            colorsMode: val === 'available' ? 'المتوفرة فقط 🟢' : (val === 'unavailable' ? 'غير المتوفرة فقط 🔴' : 'كل الألوان'),
            showStockCounts: val ? 'إظهار أرقام الأرصدة للعملاء 👁️' : 'إخفاء أرقام الأرصدة 🙈',
            showCardVariants: val ? 'إظهار المقاسات والألوان على الكروت 🏷️' : 'إخفاء المقاسات والألوان من الكروت'
        };
        persistStoreVisibilityConfig(`🌐 تم التحديث للمتجر: ${labels[field] || 'تم الحفظ'} ⚡`);
    };

    window.setAdminSideStockMode = function (mode) {
        const chipBtn = document.querySelector(`[data-prod-chip="${mode}"]`);
        if (typeof window.setProductQuickChip === 'function') {
            window.setProductQuickChip(mode, chipBtn);
        }
        renderVisibilitySidebarState();
    };

    window.setAdminVariantsViewMode = function (mode) {
        window.adminVisibilityFilters.variantsViewMode = mode;
        renderVisibilitySidebarState();
        if (typeof window.filterAdminProducts === 'function') window.filterAdminProducts();
    };

    window.setAdminVariantsHealthFilter = function (val) {
        window.adminVisibilityFilters.variantsHealthFilter = val || 'all';
        if (typeof window.filterAdminProducts === 'function') window.filterAdminProducts();
    };

    window.setAdminColorFilter = function (val) {
        window.adminVisibilityFilters.selectedColor = val || 'all';
        if (typeof window.filterAdminProducts === 'function') window.filterAdminProducts();
    };

    window.exportVariantsStockReportCSV = function () {
        const list = Array.isArray(window.adminProductsList) ? window.adminProductsList : [];
        if (!list.length) {
            alert('⚠️ لا توجد أصناف لتصديرها حالياً');
            return;
        }
        const rows = [['اسم الصنف', 'الكود', 'القسم', 'السعر', 'الرصيد الإجمالي', 'حالة الصنف', 'المقاس', 'اللون', 'رصيد التركيبة', 'الحالة التفصيلية']];
        const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

        list.forEach(p => {
            const snap = getProductInventorySnapshot(p);
            const statusLbl = snap.isFrozen ? 'مجمد' : (snap.isAvailable ? 'متوفر' : 'غير متوفر');
            if (snap.hasVariantsStock) {
                Object.entries(snap.variantsStock).forEach(([k, qty]) => {
                    const parts = k.split('|');
                    const sz = parts[0] || 'موحد';
                    const col = parts[1] || 'قياسي';
                    const vStat = (!snap.isFrozen && snap.isInStockFlag && qty > 0) ? (qty <= 3 ? 'حرج' : 'متوفر') : 'نفذ (0)';
                    rows.push([p.name, p.code || p.id, p.categoryName || p.category, p.price, snap.totalStock, statusLbl, sz, col, qty, vStat]);
                });
            } else {
                const sizesTxt = snap.sizes.map(s => s.name).join(' - ') || 'موحد';
                const colorsTxt = snap.colors.map(c => c.name).join(' - ') || 'أساسي';
                rows.push([p.name, p.code || p.id, p.categoryName || p.category, p.price, snap.totalStock, statusLbl, sizesTxt, colorsTxt, snap.totalStock, statusLbl]);
            }
        });

        const csv = '\uFEFF' + rows.map(r => r.map(q).join(',')).join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bayan_stock_variants_report_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        if (typeof window.showFastSaveToast === 'function') {
            window.showFastSaveToast('📥 تم تصدير كشف الأرصدة والمقاسات والألوان بنجاح!');
        }
    };

    /* =========================================================================
     * 3. بناء تفاصيل الأرصدة والمقاسات والألوان داخل كارت الصنف في لوحة التحكم
     * ========================================================================= */
    function buildAdminCardInventoryHtml(p) {
        const snap = getProductInventorySnapshot(p);
        const mode = window.adminVisibilityFilters.variantsViewMode || 'all';
        const pid = esc(p.firestoreId || p.id || '');

        const filterList = (items) => {
            if (mode === 'available') return items.filter(x => x.available);
            if (mode === 'unavailable') return items.filter(x => !x.available);
            return items;
        };

        const shownSizes = filterList(snap.sizes);
        const shownColors = filterList(snap.colors);

        const sizesHtml = shownSizes.length
            ? shownSizes.map(s => `
                <span class="var-badge ${s.available ? 'in' : 'out'}"
                    onclick="openVariantStockQuickEditor('${pid}')"
                    title="${s.available ? 'متوفر — اضغط لتعديل الرصيد' : 'غير متوفر — اضغط لتعديل الرصيد'}">
                    <span>${esc(s.name)}</span>
                    <span class="var-qty-pill">${s.qty}</span>
                </span>`).join('')
            : `<span style="font-size:0.72rem; color:#64748b; font-weight:700;">${
                snap.sizes.length === 0
                    ? 'مقاس موحد'
                    : (mode === 'available' ? 'لا توجد مقاسات متوفرة' : 'كل المقاسات متوفرة ✅')
            }</span>`;

        const colorsHtml = shownColors.length
            ? shownColors.map(c => `
                <span class="var-badge ${c.available ? 'in' : 'out'}"
                    onclick="openVariantStockQuickEditor('${pid}')"
                    title="${c.available ? 'متوفر — اضغط لتعديل الرصيد' : 'غير متوفر — اضغط لتعديل الرصيد'}">
                    <span>${esc(c.name)}</span>
                    <span class="var-qty-pill">${c.qty}</span>
                </span>`).join('')
            : `<span style="font-size:0.72rem; color:#64748b; font-weight:700;">${
                snap.colors.length === 0
                    ? 'لون أساسي'
                    : (mode === 'available' ? 'لا توجد ألوان متوفرة' : 'كل الألوان متوفرة ✅')
            }</span>`;

        const statusSummary = snap.sizes.length > 0 || snap.colors.length > 0
            ? `<div style="display:flex; justify-content:space-between; align-items:center; gap:6px; flex-wrap:wrap; border-top:1px dashed #cbd5e1; padding-top:5px; margin-top:2px;">
                    <span style="font-size:0.7rem; font-weight:800; color:#475569;">
                        متاح: <b style="color:#059669;">${snap.availableSizesCount}</b> مقاس • <b style="color:#059669;">${snap.availableColorsCount}</b> لون
                        ${(snap.unavailableSizesCount + snap.unavailableColorsCount) > 0 ? ` | نافذ: <b style="color:#dc2626;">${snap.unavailableSizesCount + snap.unavailableColorsCount}</b>` : ''}
                    </span>
                    <button type="button" onclick="openVariantStockQuickEditor('${pid}')"
                        style="border:1px solid #bae6fd; background:#eff6ff; color:#0369a1; border-radius:6px; padding:2px 8px; font-size:0.7rem; font-weight:900; cursor:pointer; font-family:inherit;">
                        📊 تعديل أرصدة المقاسات والألوان
                    </button>
                </div>`
            : `<div style="display:flex; justify-content:flex-end; border-top:1px dashed #cbd5e1; padding-top:5px; margin-top:2px;">
                    <button type="button" onclick="openVariantStockQuickEditor('${pid}')"
                        style="border:1px solid #bae6fd; background:#eff6ff; color:#0369a1; border-radius:6px; padding:2px 8px; font-size:0.7rem; font-weight:900; cursor:pointer; font-family:inherit;">
                        📊 ضبط المقاسات والألوان والأرصدة
                    </button>
               </div>`;

        return `
            <div class="card-variants-box">
                <div class="card-variants-row">
                    <span style="font-size:0.72rem; font-weight:900; color:#334155;">📏 المقاسات:</span>
                    ${sizesHtml}
                </div>
                <div class="card-variants-row">
                    <span style="font-size:0.72rem; font-weight:900; color:#334155;">🎨 الألوان:</span>
                    ${colorsHtml}
                </div>
                ${statusSummary}
            </div>
        `;
    }

    /* =========================================================================
     * 4. المحرر السريع لأرصدة المقاسات والألوان (Quick Variant Stock Modal)
     * ========================================================================= */
    window.openVariantStockQuickEditor = function (docId) {
        const list = Array.isArray(window.adminProductsList) ? window.adminProductsList : [];
        const p = list.find(x => x.firestoreId === docId || String(x.id) === String(docId));
        if (!p) return;

        const snap = getProductInventorySnapshot(p);
        const sizes = snap.sizes.length ? snap.sizes.map(s => s.name) : ['موحد'];
        const colors = snap.colors.length ? snap.colors.map(c => c.name) : ['قياسي'];

        const workingVariants = {};
        const totalDefault = Math.max(0, snap.totalStock);
        const perCellDefault = snap.hasVariantsStock
            ? 0
            : Math.floor(totalDefault / Math.max(1, sizes.length * colors.length));
        let remainder = snap.hasVariantsStock ? 0 : (totalDefault - perCellDefault * sizes.length * colors.length);

        sizes.forEach(sz => {
            colors.forEach(col => {
                const key = `${sz}|${col}`;
                if (snap.hasVariantsStock) {
                    workingVariants[key] = snap.variantsStock[key] !== undefined ? Number(snap.variantsStock[key]) : 0;
                } else {
                    workingVariants[key] = perCellDefault + (remainder > 0 ? 1 : 0);
                    if (remainder > 0) remainder--;
                }
            });
        });

        let modal = document.getElementById('bayanVariantStockQuickModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'bayanVariantStockQuickModal';
            modal.style.cssText = 'position:fixed;inset:0;z-index:10050;background:rgba(15,23,42,0.78);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:14px;direction:rtl;';
            modal.addEventListener('click', (ev) => { if (ev.target === modal) modal.style.display = 'none'; });
            document.body.appendChild(modal);
        }

        const keys = Object.keys(workingVariants);
        const rowsHtml = keys.map((k, idx) => {
            const parts = k.split('|');
            const szLabel = parts[0] === 'موحد' ? 'مقاس موحد' : parts[0];
            const colLabel = parts[1] === 'قياسي' ? 'لون أساسي' : parts[1];
            const qty = workingVariants[k];
            return `
                <div data-vrow="${idx}" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border:1.5px solid ${qty > 0 ? '#bbf7d0' : '#fecaca'};background:${qty > 0 ? '#f0fdf4' : '#fef2f2'};border-radius:12px;">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        <span style="background:#ffffff;border:1px solid #cbd5e1;padding:3px 9px;border-radius:8px;font-weight:900;font-size:0.84rem;color:#0f172a;">📏 ${esc(szLabel)}</span>
                        <span style="background:#ffffff;border:1px solid #cbd5e1;padding:3px 9px;border-radius:8px;font-weight:900;font-size:0.84rem;color:#334155;">🎨 ${esc(colLabel)}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <button type="button" onclick="adjustQuickVariantRow(${idx}, -1)" style="width:30px;height:30px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;font-weight:950;cursor:pointer;">-</button>
                        <input type="number" min="0" data-vkey="${esc(k)}" id="qvInput_${idx}" value="${qty}" oninput="refreshQuickVariantModalSummary()"
                            style="width:68px;text-align:center;padding:5px;border-radius:8px;border:1.5px solid #94a3b8;font-weight:950;font-size:0.95rem;font-family:inherit;background:#fff;">
                        <button type="button" onclick="adjustQuickVariantRow(${idx}, 1)" style="width:30px;height:30px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;font-weight:950;cursor:pointer;">+</button>
                        <button type="button" onclick="toggleQuickVariantRowZero(${idx})" title="تبديل متوفر / غير متوفر"
                            style="padding:5px 9px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;font-size:0.76rem;font-weight:900;cursor:pointer;font-family:inherit;">
                            ${qty > 0 ? 'تصفير ✕' : 'توفير ✓'}
                        </button>
                    </div>
                </div>`;
        }).join('');

        modal.innerHTML = `
            <div style="background:#fff;border-radius:20px;width:96vw;max-width:600px;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,0.4);">
                <div style="padding:16px 20px;background:linear-gradient(135deg,#0f172a,#1e293b);color:#fff;display:flex;align-items:center;justify-content:space-between;gap:10px;">
                    <div>
                        <div style="font-size:1.06rem;font-weight:950;">📊 أرصدة المقاسات والألوان: ${esc(p.name)}</div>
                        <div style="font-size:0.76rem;color:#94a3b8;font-weight:700;">أي تعديل هنا يُحدّث الرصيد الإجمالي ويسمّع في المتجر فوراً</div>
                    </div>
                    <button type="button" onclick="document.getElementById('bayanVariantStockQuickModal').style.display='none'"
                        style="background:rgba(255,255,255,0.16);border:none;color:#fff;width:34px;height:34px;border-radius:10px;font-weight:900;cursor:pointer;">✕</button>
                </div>

                <div style="padding:10px 18px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                    <div id="qvTotalSummary" style="font-size:0.86rem;font-weight:900;color:#0f172a;"></div>
                    <div style="display:flex;gap:6px;">
                        <button type="button" onclick="fillAllQuickVariants(5)" class="btn-card-action" style="font-size:0.74rem;padding:4px 10px;">تعبئة الكل (5)</button>
                        <button type="button" onclick="fillAllQuickVariants(0)" class="btn-card-action" style="font-size:0.74rem;padding:4px 10px;color:#dc2626;border-color:#fecaca;">تصفير الكل</button>
                    </div>
                </div>

                <div id="qvRowsWrap" style="padding:14px 18px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;flex:1;">
                    ${rowsHtml}
                </div>

                <div style="padding:14px 18px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;gap:10px;">
                    <button type="button" onclick="document.getElementById('bayanVariantStockQuickModal').style.display='none'" class="btn-card-action">إلغاء</button>
                    <button type="button" onclick="saveVariantStockQuickEditor('${esc(p.firestoreId || p.id)}')" class="btn-primary-action" style="background:#059669;border-color:#047857;">
                        <span>💾 حفظ الأرصدة والمزامنة فوراً</span>
                    </button>
                </div>
            </div>`;
        modal.style.display = 'flex';
        refreshQuickVariantModalSummary();
    };

    window.adjustQuickVariantRow = function (idx, delta) {
        const inp = document.getElementById(`qvInput_${idx}`);
        if (!inp) return;
        inp.value = Math.max(0, (parseInt(inp.value, 10) || 0) + delta);
        refreshQuickVariantModalSummary();
    };

    window.toggleQuickVariantRowZero = function (idx) {
        const inp = document.getElementById(`qvInput_${idx}`);
        if (!inp) return;
        const cur = parseInt(inp.value, 10) || 0;
        inp.value = cur > 0 ? 0 : 5;
        refreshQuickVariantModalSummary();
    };

    window.fillAllQuickVariants = function (val) {
        document.querySelectorAll('#qvRowsWrap input[data-vkey]').forEach(inp => {
            inp.value = Math.max(0, Number(val) || 0);
        });
        refreshQuickVariantModalSummary();
    };

    window.refreshQuickVariantModalSummary = function () {
        const inputs = document.querySelectorAll('#qvRowsWrap input[data-vkey]');
        let sum = 0;
        let availCount = 0;
        inputs.forEach((inp, idx) => {
            const q = Math.max(0, parseInt(inp.value, 10) || 0);
            sum += q;
            if (q > 0) availCount++;
            const row = document.querySelector(`#qvRowsWrap [data-vrow="${idx}"]`);
            if (row) {
                row.style.borderColor = q > 0 ? '#bbf7d0' : '#fecaca';
                row.style.background = q > 0 ? '#f0fdf4' : '#fef2f2';
                const toggleBtn = row.querySelector('button[title]');
                if (toggleBtn) toggleBtn.textContent = q > 0 ? 'تصفير ✕' : 'توفير ✓';
            }
        });
        const sumEl = document.getElementById('qvTotalSummary');
        if (sumEl) {
            sumEl.innerHTML = `إجمالي القطع: <b style="color:${sum > 0 ? '#059669' : '#dc2626'};">${sum} قطعة</b> • المتاح: <b>${availCount}</b> من أصل <b>${inputs.length}</b>`;
        }
    };

    window.saveVariantStockQuickEditor = async function (docId) {
        const list = Array.isArray(window.adminProductsList) ? window.adminProductsList : [];
        const p = list.find(x => x.firestoreId === docId || String(x.id) === String(docId));
        if (!p) return;

        const variantsStock = {};
        let total = 0;
        document.querySelectorAll('#qvRowsWrap input[data-vkey]').forEach(inp => {
            const k = inp.getAttribute('data-vkey');
            const q = Math.max(0, parseInt(inp.value, 10) || 0);
            if (k) {
                variantsStock[k] = q;
                total += q;
            }
        });

        p.variantsStock = variantsStock;
        p.stock = total;
        p.stockQty = total;
        p.inStock = total > 0;
        p.updatedAt = new Date().toISOString();

        const modal = document.getElementById('bayanVariantStockQuickModal');
        if (modal) modal.style.display = 'none';

        if (typeof window.updateProductsStats === 'function') window.updateProductsStats();
        if (typeof window.filterAdminProducts === 'function') window.filterAdminProducts();

        const db = (typeof getBayanDb === 'function') ? getBayanDb() : null;
        if (db && docId && !String(docId).startsWith('temp_')) {
            try {
                await db.collection('products').doc(docId).set({
                    variantsStock,
                    stock: total,
                    stockQty: total,
                    inStock: total > 0,
                    updatedAt: p.updatedAt
                }, { merge: true });
                await db.collection('products').doc(docId).update({ variantsStock }).catch(() => { });
                bumpCatalogVersionInCloud(true);
            } catch (err) {
                alert('❌ حدث خطأ أثناء حفظ الأرصدة: ' + err.message);
                return;
            }
        }
        if (typeof window.showFastSaveToast === 'function') {
            window.showFastSaveToast(`✅ تم تحديث الأرصدة (${total} قطعة) والمزامنة مع الموقع!`);
        }
    };

    /* =========================================================================
     * 5. مصفوفة أرصدة المقاسات والألوان داخل مودال إضافة/تعديل الصنف
     * ========================================================================= */
    window._modalVariantsStock = {};

    function injectVariantStockMatrixIntoProductModal() {
        const colorPricing = document.getElementById('colorPricingWrapper');
        if (!colorPricing || document.getElementById('variantStockMatrixWrapper')) return;

        const box = document.createElement('div');
        box.id = 'variantStockMatrixWrapper';
        box.className = 'form-group';
        box.style.cssText = 'background:#ecfdf5; border:1.5px solid #86efac; border-radius:14px; padding:14px;';
        box.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
                <label style="margin:0; font-weight:950; color:#065f46; font-size:0.9rem;">📦 أرصدة المقاسات والألوان التفصيلية (تتزامن مع المتجر):</label>
                <div style="display:flex; align-items:center; gap:6px;">
                    <input type="checkbox" id="chkEnableModalVariantMatrix" onchange="renderModalVariantStockMatrix()" style="width:17px; height:17px; accent-color:#059669; cursor:pointer;">
                    <label for="chkEnableModalVariantMatrix" style="margin:0; font-size:0.78rem; font-weight:800; color:#047857; cursor:pointer;">تحديد رصيد مستقل لكل مقاس/لون</label>
                </div>
            </div>
            <div id="variantStockMatrixGrid" style="display:none; grid-template-columns:repeat(auto-fill, minmax(175px, 1fr)); gap:8px;"></div>
            <small id="variantStockMatrixHint" style="font-size:0.74rem; color:#047857; font-weight:700;">فعّل الخيار بالأعلى لتحديد رصيد كل مقاس ولون أو جعل أي مقاس/لون غير متوفر (0).</small>
        `;
        colorPricing.insertAdjacentElement('afterend', box);
    }

    function getSelectedModalSizesAndColors() {
        const selSizes = Array.from(document.querySelectorAll('#sizesPicker .chip-label-btn.selected')).map(b => b.textContent.trim());
        const custSizes = (document.getElementById('inpCustomSizes')?.value || '').split(/[,،]/).map(s => s.trim()).filter(Boolean);
        const sizes = Array.from(new Set([...selSizes, ...custSizes]));

        const selColors = Array.from(document.querySelectorAll('#colorsPicker .chip-label-btn.selected')).map(b => b.textContent.trim());
        const custColors = (document.getElementById('inpCustomColors')?.value || '').split(/[,،]/).map(c => c.trim()).filter(Boolean);
        const colors = Array.from(new Set([...selColors, ...custColors]));
        return { sizes, colors };
    }

    window.renderModalVariantStockMatrix = function () {
        const chk = document.getElementById('chkEnableModalVariantMatrix');
        const grid = document.getElementById('variantStockMatrixGrid');
        const hint = document.getElementById('variantStockMatrixHint');
        if (!chk || !grid) return;

        if (!chk.checked) {
            grid.style.display = 'none';
            if (hint) hint.textContent = 'فعّل الخيار بالأعلى لتحديد رصيد كل مقاس ولون أو جعل أي مقاس/لون غير متوفر (0).';
            return;
        }

        grid.style.display = 'grid';
        const { sizes, colors } = getSelectedModalSizesAndColors();
        const effSizes = sizes.length ? sizes : ['موحد'];
        const effColors = colors.length ? colors : ['قياسي'];
        const fallbackQty = Math.max(0, parseInt(document.getElementById('inpProdStockQty')?.value, 10) || 0);

        const cells = [];
        effSizes.forEach(sz => {
            effColors.forEach(col => {
                const key = `${sz}|${col}`;
                if (window._modalVariantsStock[key] === undefined) {
                    window._modalVariantsStock[key] = fallbackQty > 0 ? Math.max(1, Math.round(fallbackQty / (effSizes.length * effColors.length))) : 0;
                }
                const qty = Math.max(0, Number(window._modalVariantsStock[key]) || 0);
                const szLbl = sz === 'موحد' ? 'موحد' : sz;
                const colLbl = col === 'قياسي' ? 'أساسي' : col;
                cells.push(`
                    <div style="background:#fff; border:1.5px solid ${qty > 0 ? '#86efac' : '#fecaca'}; border-radius:10px; padding:8px; display:flex; flex-direction:column; gap:5px;">
                        <div style="font-size:0.75rem; font-weight:900; color:#0f172a; display:flex; justify-content:space-between; gap:4px;">
                            <span>📏 ${esc(szLbl)}</span>
                            <span style="color:#475569;">🎨 ${esc(colLbl)}</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:5px;">
                            <input type="number" min="0" value="${qty}"
                                oninput="window.updateModalVariantCell('${esc(key)}', this.value)"
                                style="flex:1; width:100%; padding:4px 6px; border:1px solid #cbd5e1; border-radius:6px; text-align:center; font-weight:900; font-family:inherit;">
                            <button type="button" onclick="window.toggleModalVariantCellZero('${esc(key)}')"
                                style="border:none; background:${qty > 0 ? '#dcfce7; color:#166534' : '#fee2e2; color:#dc2626'}; border-radius:6px; padding:4px 7px; font-size:0.7rem; font-weight:900; cursor:pointer; font-family:inherit;">
                                ${qty > 0 ? 'متاح' : 'نفذ'}
                            </button>
                        </div>
                    </div>`);
            });
        });

        grid.innerHTML = cells.join('');
        syncModalTotalStockFromMatrix();
    };

    window.updateModalVariantCell = function (key, val) {
        window._modalVariantsStock[key] = Math.max(0, parseInt(val, 10) || 0);
        syncModalTotalStockFromMatrix();
    };

    window.toggleModalVariantCellZero = function (key) {
        const cur = Math.max(0, Number(window._modalVariantsStock[key]) || 0);
        window._modalVariantsStock[key] = cur > 0 ? 0 : 5;
        window.renderModalVariantStockMatrix();
    };

    function syncModalTotalStockFromMatrix() {
        const chk = document.getElementById('chkEnableModalVariantMatrix');
        if (!chk || !chk.checked) return;
        const { sizes, colors } = getSelectedModalSizesAndColors();
        const effSizes = sizes.length ? sizes : ['موحد'];
        const effColors = colors.length ? colors : ['قياسي'];
        let sum = 0;
        effSizes.forEach(sz => {
            effColors.forEach(col => {
                sum += Math.max(0, Number(window._modalVariantsStock[`${sz}|${col}`]) || 0);
            });
        });
        const qtyInp = document.getElementById('inpProdStockQty');
        if (qtyInp) qtyInp.value = sum;
        const inStockSel = document.getElementById('inpProdInStock');
        if (inStockSel) inStockSel.value = sum > 0 ? 'true' : 'false';
        const hint = document.getElementById('variantStockMatrixHint');
        if (hint) hint.innerHTML = `إجمالي رصيد المقاسات والألوان المحدد: <b style="color:${sum > 0 ? '#059669' : '#dc2626'};">${sum} قطعة</b>`;
    }

    window.getModalCollectedVariantsStock = function (existingProduct) {
        const chk = document.getElementById('chkEnableModalVariantMatrix');
        if (!chk || !chk.checked) {
            return existingProduct && existingProduct.variantsStock ? existingProduct.variantsStock : null;
        }
        const { sizes, colors } = getSelectedModalSizesAndColors();
        const effSizes = sizes.length ? sizes : ['موحد'];
        const effColors = colors.length ? colors : ['قياسي'];
        const out = {};
        effSizes.forEach(sz => {
            effColors.forEach(col => {
                const key = `${sz}|${col}`;
                out[key] = Math.max(0, Number(window._modalVariantsStock[key]) || 0);
            });
        });
        return out;
    };

    window.hydrateModalVariantMatrixForProduct = function (target) {
        injectVariantStockMatrixIntoProductModal();
        const chk = document.getElementById('chkEnableModalVariantMatrix');
        if (!target) {
            window._modalVariantsStock = {};
            if (chk) chk.checked = false;
            window.renderModalVariantStockMatrix();
            return;
        }
        const snap = getProductInventorySnapshot(target);
        window._modalVariantsStock = snap.hasVariantsStock ? { ...snap.variantsStock } : {};
        if (chk) chk.checked = snap.hasVariantsStock;
        window.renderModalVariantStockMatrix();
    };

    // ربط التهيئة عند تحميل DOM
    loadLocalVisibilityConfig();
    document.addEventListener('DOMContentLoaded', () => {
        injectVisibilityModalAndTrigger();
        injectVariantStockMatrixIntoProductModal();
        listenToStoreVisibilitySettings();
        // إعادة تحديث المصفوفة عند تعديل المقاسات أو الألوان المخصصة في المودال
        const cs = document.getElementById('inpCustomSizes');
        const cc = document.getElementById('inpCustomColors');
        if (cs) cs.addEventListener('input', () => window.renderModalVariantStockMatrix());
        if (cc) cc.addEventListener('input', () => window.renderModalVariantStockMatrix());
    });

    window.BayanAdminVisibility = {
        extractColorName,
        extractSizeName,
        getProductInventorySnapshot,
        refreshDynamicFilterDropdowns,
        renderVisibilitySidebarState,
        buildAdminCardInventoryHtml,
        bumpCatalogVersionInCloud,
        syncFromShippingSetting(showCount) {
            window.storeVisibilityConfig.showStockCounts = showCount !== false;
            if (typeof BayanIDB !== 'undefined') {
                BayanIDB.setItem('bayan_store_visibility', JSON.stringify(window.storeVisibilityConfig));
            }
            const db = (typeof getBayanDb === 'function') ? getBayanDb() : null;
            if (db) {
                db.collection('settings').doc('visibility').set({
                    showStockCounts: showCount !== false,
                    updatedAt: new Date().toISOString()
                }, { merge: true }).catch(() => { });
            }
            renderVisibilitySidebarState();
        }
    };
})(window);
