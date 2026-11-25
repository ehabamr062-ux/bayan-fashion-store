// 📂 Bayan Store Admin — إدارة الأقسام والتصنيفات (إضافة / تعديل / حذف) ومزامنتها مع المتجر
(function () {
    window._adminCustomCategories = [];

    function esc(str) {
        if (typeof escapeAdminHtml === 'function') return escapeAdminHtml(str);
        return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    async function persistCustomStoreCategories() {
        const db = (typeof getBayanDb === 'function') ? getBayanDb() : null;
        if (!db) return;
        await db.collection('settings').doc('categories').set({
            list: window._adminCustomCategories,
            updatedAt: new Date().toISOString()
        }, { merge: true });
    }

    function renderCustomStoreCategoriesList() {
        const wrap = document.getElementById('bayanCatManagerList');
        const dl = document.getElementById('bvcQuickCatList');
        if (dl && window._adminCustomCategories.length) {
            dl.innerHTML = window._adminCustomCategories.map(c => `<option value="${esc(c)}">`).join('');
        }
        if (!wrap) return;
        if (!window._adminCustomCategories.length) {
            wrap.innerHTML = '<div style="text-align:center;color:#64748b;padding:20px;font-weight:700;">لا توجد أقسام مضافة بعد — أضف أول قسم بالأعلى.</div>';
            return;
        }
        wrap.innerHTML = window._adminCustomCategories.map((cat, idx) => `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:12px;background:#fff;">
                <span style="font-weight:900;color:#0f172a;font-size:0.92rem;">🏷️ ${esc(cat)}</span>
                <div style="display:flex;gap:6px;">
                    <button type="button" onclick="editCustomStoreCategory(${idx})" style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:8px;padding:5px 10px;font-weight:800;cursor:pointer;font-size:0.78rem;">✏️ تعديل</button>
                    <button type="button" onclick="deleteCustomStoreCategory(${idx})" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:8px;padding:5px 10px;font-weight:800;cursor:pointer;font-size:0.78rem;">🗑️ حذف</button>
                </div>
            </div>`).join('');
    }

    async function loadCustomStoreCategories() {
        const db = (typeof getBayanDb === 'function') ? getBayanDb() : null;
        const set = new Set();
        (typeof adminProductsList !== 'undefined' ? adminProductsList : []).forEach(p => {
            if (p && p.category && p.category !== 'general') set.add(String(p.category).trim());
        });
        if (db) {
            try {
                const doc = await db.collection('settings').doc('categories').get();
                if (doc.exists && Array.isArray(doc.data().list)) {
                    doc.data().list.forEach(c => { if (c && String(c).trim()) set.add(String(c).trim()); });
                }
            } catch (_) { }
        }
        window._adminCustomCategories = Array.from(set);
        renderCustomStoreCategoriesList();
    }

    window.openCategoriesManagerModal = async function () {
        let modal = document.getElementById('bayanCatManagerModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'bayanCatManagerModal';
            modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,0.82);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:14px;direction:rtl;';
            modal.innerHTML = `
                <div style="background:#fff;border-radius:20px;width:95vw;max-width:560px;max-height:86vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,0.45);">
                    <div style="padding:16px 20px;background:linear-gradient(135deg,#0284c7,#0369a1);color:#fff;display:flex;align-items:center;justify-content:space-between;">
                        <div style="font-size:1.1rem;font-weight:900;">📂 إدارة أقسام وتصنيفات المتجر</div>
                        <button type="button" onclick="document.getElementById('bayanCatManagerModal').style.display='none'"
                            style="background:rgba(255,255,255,0.2);border:none;color:#fff;width:34px;height:34px;border-radius:10px;font-size:18px;font-weight:900;cursor:pointer;">✕</button>
                    </div>
                    <div style="padding:14px 18px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;gap:8px;">
                        <input type="text" id="inpNewCustomCatName" class="form-control" placeholder="اكتب اسم القسم الجديد (مثال: شنط، أحذية، عبايات...)" style="flex:1;font-weight:800;">
                        <button type="button" onclick="addCustomStoreCategory()" class="btn-primary-action" style="background:#059669;border-color:#047857;font-weight:900;">➕ إضافة</button>
                    </div>
                    <div id="bayanCatManagerList" style="padding:14px 18px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;flex:1;"></div>
                </div>`;
            document.body.appendChild(modal);
        }
        modal.style.display = 'flex';
        await loadCustomStoreCategories();
    };

    window.addCustomStoreCategory = async function () {
        const inp = document.getElementById('inpNewCustomCatName');
        const name = (inp && inp.value ? inp.value : '').trim();
        if (!name) return;
        if (!window._adminCustomCategories.includes(name)) {
            window._adminCustomCategories.push(name);
            await persistCustomStoreCategories();
        }
        if (inp) inp.value = '';
        renderCustomStoreCategoriesList();
        if (typeof showFastSaveToast === 'function') showFastSaveToast(`✅ تمت إضافة قسم «${name}» وسيظهر في المتجر فوراً!`);
    };

    window.editCustomStoreCategory = async function (idx) {
        const oldName = window._adminCustomCategories[idx];
        if (!oldName) return;
        const newName = (prompt('✏️ اكتب الاسم الجديد للقسم:', oldName) || '').trim();
        if (!newName || newName === oldName) return;
        window._adminCustomCategories[idx] = newName;
        await persistCustomStoreCategories();
        const db = (typeof getBayanDb === 'function') ? getBayanDb() : null;
        if (db && typeof adminProductsList !== 'undefined') {
            const affected = adminProductsList.filter(p => String(p.category || '').trim() === oldName);
            for (let i = 0; i < affected.length; i += 20) {
                await Promise.all(affected.slice(i, i + 20).map(p =>
                    db.collection('products').doc(p.firestoreId || p.id).set({ category: newName, categoryName: newName, updatedAt: new Date().toISOString() }, { merge: true })
                ));
            }
        }
        renderCustomStoreCategoriesList();
        if (typeof showFastSaveToast === 'function') showFastSaveToast(`✅ تم تعديل القسم إلى «${newName}» وتحديث منتجاته!`);
    };

    window.deleteCustomStoreCategory = async function (idx) {
        const name = window._adminCustomCategories[idx];
        if (!name || !confirm(`هل أنت متأكد من حذف القسم «${name}»؟`)) return;
        window._adminCustomCategories.splice(idx, 1);
        await persistCustomStoreCategories();
        renderCustomStoreCategoriesList();
        if (typeof showFastSaveToast === 'function') showFastSaveToast(`🗑️ تم حذف القسم «${name}» بنجاح!`);
    };

    // حقن زر "📂 إدارة الأقسام" ديناميكياً بجانب زر "🗂️ تصنيف سريع بالصور" بدون تعديل admin.html
    document.addEventListener('DOMContentLoaded', () => {
        const bvcBtn = Array.from(document.querySelectorAll('button')).find(b => (b.getAttribute('onclick') || '').includes('openBulkVisualCategorizer'));
        if (bvcBtn && !document.getElementById('btnOpenCategoriesManager')) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.id = 'btnOpenCategoriesManager';
            btn.className = 'btn-primary-action';
            btn.style.cssText = 'background:linear-gradient(135deg,#0284c7,#0369a1);border-color:#075985;padding:8px 14px;font-weight:900;';
            btn.title = 'إضافة وتعديل وحذف أقسام وتصنيفات المتجر';
            btn.innerHTML = '<span>📂</span><span>إدارة الأقسام</span>';
            btn.onclick = () => window.openCategoriesManagerModal();
            bvcBtn.insertAdjacentElement('afterend', btn);
        }
    });
})();
