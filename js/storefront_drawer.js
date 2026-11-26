/**
 * =========================================================================
 * ☰ القائمة الجانبية الاحترافية (Side Drawer) المربوطة بلوحة التحكم - بَيَان ستور
 * =========================================================================
 * تعرض:
 * 1. شعار واسم المتجر الديناميكي من لوحة التحكم
 * 2. جميع الأقسام والتصنيفات الديناميكية من لوحة التحكم (للفلترة الفورية)
 * 3. قسم «اتصل بنا والتواصل والموقع الجغرافي» مربوطاً بإعدادات لوحة التحكم
 * =========================================================================
 */
(function initStoreSideDrawer() {
    if (typeof window === 'undefined') return;

    function esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function getDynamicCategories() {
        const cats = [];
        try {
            // 1. من أزرار التصنيفات الموجودة في الصفحة (مرتبة حسب لوحة التحكم)
            document.querySelectorAll('#category-pills button, [data-category-pill]').forEach(btn => {
                const txt = (btn.textContent || '').trim();
                const val = btn.getAttribute('data-cat') || txt;
                if (txt && txt !== 'الكل' && !cats.some(c => c.name === txt)) {
                    cats.push({ name: txt, value: val });
                }
            });
            // 2. احتياطي من المنتجات المحمّلة
            if (!cats.length && Array.isArray(window.allProducts)) {
                window.allProducts.forEach(p => {
                    const c = p && p.category ? String(p.category).trim() : '';
                    if (c && !cats.some(x => x.name === c)) cats.push({ name: c, value: c });
                });
            }
        } catch (e) { }
        return cats;
    }

    function getStoreMeta() {
        const s = window.storeSettings || window.shopSettings || {};
        const brandName = s.storeName || document.getElementById('header-brand-name')?.textContent?.trim() || 'المتجر';
        const phone = s.phone || s.whatsapp || s.storePhone || '';
        const whatsapp = s.whatsapp || s.phone || '';
        const address = s.address || s.location || s.storeAddress || '';
        const mapUrl = s.mapUrl || s.googleMapsUrl || s.locationUrl || (address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : '');
        const facebook = s.facebook || s.fbUrl || '';
        const instagram = s.instagram || s.igUrl || '';
        const tiktok = s.tiktok || s.ttUrl || '';
        return { brandName, phone, whatsapp, address, mapUrl, facebook, instagram, tiktok };
    }

    window.closeStoreSideDrawer = function () {
        const el = document.getElementById('bayan-store-side-drawer');
        if (el) el.remove();
        document.body.style.overflow = '';
    };

    window.selectCategoryFromDrawer = function (catName) {
        window.closeStoreSideDrawer();
        if (typeof window.selectCategory === 'function') {
            window.selectCategory(catName);
        } else if (typeof window.filterByCategory === 'function') {
            window.filterByCategory(catName);
        } else {
            const btn = Array.from(document.querySelectorAll('#category-pills button')).find(b => b.textContent.trim() === catName);
            if (btn) btn.click();
        }
        const grid = document.getElementById('products-grid') || document.getElementById('products-section');
        if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    window.openStoreSideDrawer = function () {
        window.closeStoreSideDrawer();
        const cats = getDynamicCategories();
        const meta = getStoreMeta();
        const cleanWa = String(meta.whatsapp || '').replace(/[^\d]/g, '');
        const waLink = cleanWa ? `https://wa.me/${cleanWa.startsWith('0') ? '2' + cleanWa : cleanWa}` : '';

        const catsHtml = cats.length === 0
            ? '<div style="padding:14px 20px; color:#64748b; font-size:0.86rem; font-weight:700;">جاري تحميل الأقسام...</div>'
            : cats.map(c => `
                <button type="button" onclick="selectCategoryFromDrawer('${esc(c.value).replace(/'/g, "\\'")}')"
                    style="width:100%; text-align:right; padding:14px 20px; background:#ffffff; border:none; border-bottom:1px solid #f1f5f9; font-size:0.96rem; font-weight:800; color:#0f172a; cursor:pointer; display:flex; align-items:center; justify-content:space-between; transition:background 0.15s;"
                    onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#ffffff'">
                    <span>${esc(c.name)}</span>
                    <i class="fa-solid fa-chevron-left" style="font-size:0.75rem; color:#94a3b8;"></i>
                </button>`).join('');

        const contactItems = [];
        if (waLink) {
            contactItems.push(`<a href="${waLink}" target="_blank" rel="noopener" style="display:flex; align-items:center; gap:10px; padding:11px 14px; background:#ecfdf5; color:#065f46; border-radius:12px; font-weight:800; font-size:0.86rem; text-decoration:none;"><i class="fa-brands fa-whatsapp" style="font-size:1.15rem; color:#16a34a;"></i><span>تواصل واتساب: ${esc(meta.whatsapp)}</span></a>`);
        }
        if (meta.phone) {
            contactItems.push(`<a href="tel:${esc(meta.phone)}" style="display:flex; align-items:center; gap:10px; padding:11px 14px; background:#eff6ff; color:#1e40af; border-radius:12px; font-weight:800; font-size:0.86rem; text-decoration:none;"><i class="fa-solid fa-phone" style="color:#2563eb;"></i><span>اتصل بنا: ${esc(meta.phone)}</span></a>`);
        }
        if (meta.address || meta.mapUrl) {
            contactItems.push(`<a href="${esc(meta.mapUrl || '#')}" target="_blank" rel="noopener" style="display:flex; align-items:center; gap:10px; padding:11px 14px; background:#fefce8; color:#854d0e; border-radius:12px; font-weight:800; font-size:0.86rem; text-decoration:none;"><i class="fa-solid fa-location-dot" style="color:#d97706;"></i><span>${esc(meta.address || 'الموقع الجغرافي على الخريطة')}</span></a>`);
        }

        const socialLinks = [
            meta.facebook ? `<a href="${esc(meta.facebook)}" target="_blank" rel="noopener" style="width:38px;height:38px;border-radius:10px;background:#eff6ff;color:#1d4ed8;display:inline-flex;align-items:center;justify-content:center;"><i class="fa-brands fa-facebook-f"></i></a>` : '',
            meta.instagram ? `<a href="${esc(meta.instagram)}" target="_blank" rel="noopener" style="width:38px;height:38px;border-radius:10px;background:#fdf2f8;color:#db2777;display:inline-flex;align-items:center;justify-content:center;"><i class="fa-brands fa-instagram"></i></a>` : '',
            meta.tiktok ? `<a href="${esc(meta.tiktok)}" target="_blank" rel="noopener" style="width:38px;height:38px;border-radius:10px;background:#f1f5f9;color:#0f172a;display:inline-flex;align-items:center;justify-content:center;"><i class="fa-brands fa-tiktok"></i></a>` : ''
        ].filter(Boolean).join('');

        const wrap = document.createElement('div');
        wrap.id = 'bayan-store-side-drawer';
        wrap.style.cssText = 'position:fixed; inset:0; z-index:99999; background:rgba(15,23,42,0.55); backdrop-filter:blur(4px); display:flex; justify-content:flex-start; direction:rtl;';

        wrap.innerHTML = `
            <div style="width:320px; max-width:86vw; height:100%; background:#ffffff; display:flex; flex-direction:column; box-shadow:-12px 0 35px rgba(0,0,0,0.22); overflow:hidden;">
                <div style="padding:16px 18px; border-bottom:1px solid #e2e8f0; display:flex; align-items:center; justify-content:space-between; background:#ffffff;">
                    <div style="font-weight:900; font-size:1.15rem; color:#0f172a;">${esc(meta.brandName)}</div>
                    <button type="button" onclick="closeStoreSideDrawer()" style="width:36px; height:36px; border-radius:50%; border:1px solid #e2e8f0; background:#f8fafc; color:#0f172a; font-weight:900; cursor:pointer;">✕</button>
                </div>

                <div style="flex:1; overflow-y:auto;">
                    <button type="button" onclick="closeStoreSideDrawer(); if(typeof resetStoreFilters==='function') resetStoreFilters();"
                        style="width:100%; text-align:right; padding:14px 20px; background:#f8fafc; border:none; border-bottom:1px solid #e2e8f0; font-size:0.95rem; font-weight:900; color:#059669; cursor:pointer; display:flex; align-items:center; justify-content:space-between;">
                        <span>🏠 جميع المنتجات</span>
                        <i class="fa-solid fa-chevron-left" style="font-size:0.75rem;"></i>
                    </button>

                    <div style="padding:10px 20px 6px; font-size:0.74rem; font-weight:900; color:#64748b; background:#ffffff;">الأقسام والتصنيفات</div>
                    ${catsHtml}

                    <div style="padding:16px 18px; border-top:6px solid #f1f5f9;">
                        <div style="font-size:0.84rem; font-weight:900; color:#0f172a; margin-bottom:10px;">📞 اتصل بنا والموقع الجغرافي</div>
                        <div style="display:flex; flex-direction:column; gap:8px;">
                            ${contactItems.length ? contactItems.join('') : '<div style="font-size:0.8rem; color:#64748b; font-weight:700;">يمكنك إضافة رقم الهاتف والعنوان من إعدادات لوحة التحكم</div>'}
                        </div>
                        ${socialLinks ? `<div style="display:flex; gap:10px; margin-top:12px;">${socialLinks}</div>` : ''}
                    </div>
                </div>

                <div style="padding:14px 18px; border-top:1px solid #e2e8f0; background:#f8fafc; display:flex; flex-direction:column; gap:8px;">
                    <button type="button" id="bayanDrawerPwaBtn" onclick="closeStoreSideDrawer(); if(window.BayanPWA) window.BayanPWA.triggerInstall();"
                        style="display:none; width:100%; padding:11px; border-radius:12px; border:none; background:linear-gradient(135deg,#059669,#047857); color:#ffffff; font-weight:900; font-size:0.88rem; cursor:pointer; align-items:center; justify-content:center; gap:8px;">
                        <i class="fa-solid fa-mobile-screen-button"></i>
                        <span>تثبيت تطبيق المتجر على الموبايل</span>
                    </button>
                    <button type="button" onclick="closeStoreSideDrawer(); if(typeof openTrackOrderModal==='function') openTrackOrderModal();"
                        style="width:100%; padding:11px; border-radius:12px; border:1.5px solid #cbd5e1; background:#ffffff; color:#0f172a; font-weight:900; font-size:0.88rem; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
                        <i class="fa-solid fa-box-open"></i>
                        <span>تتبع طلبك</span>
                    </button>
                </div>
            </div>`;

        wrap.addEventListener('click', (e) => { if (e.target === wrap) window.closeStoreSideDrawer(); });
        document.body.style.overflow = 'hidden';
        document.body.appendChild(wrap);
        if (window.BayanPWA && typeof window.BayanPWA.refreshButtons === 'function') {
            window.BayanPWA.refreshButtons();
        }
    };
})();
