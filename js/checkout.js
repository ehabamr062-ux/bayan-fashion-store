// ==============================================================================
// 📋 محرك إتمام الطلب وإرسال البيانات لكاشير بيان والواتساب (Bayan Checkout)
// ==============================================================================

const BAYAN_POS_STORAGE_KEY = 'bayan_pos_online_orders';
let lastSubmittedOrder = null;

// رقم الواتساب الخاص بالمحل لاستلام إشعارات الطلبات المباشرة (يمكن تعديله)
const STORE_WHATSAPP_PHONE = '201012345678';

function openCheckoutModal() {
    if (cartItems.length === 0) return;

    closeCartDrawer();
    const modal = document.getElementById('checkoutModal');
    if (!modal) return;

    updateCheckoutTotals();
    modal.classList.add('open');
}

function closeCheckoutModal() {
    const modal = document.getElementById('checkoutModal');
    if (modal) modal.classList.remove('open');
}

// تحديث حساب الإجمالي ومصاريف الشحن في شاشة إنهاء الطلب
function updateCheckoutTotals() {
    const citySelect = document.getElementById('checkoutCity');
    const selectedCity = citySelect ? citySelect.value : 'القاهرة';

    const subtotal = cartItems.reduce((sum, it) => sum + (it.price * it.qty), 0);
    const fee = getCityDeliveryFee(selectedCity, subtotal);
    const shipCfg = (typeof getShippingConfig === 'function') ? getShippingConfig() : { estimatedTime: 'خلال 24 إلى 48 ساعة' };
    
    let discountVal = 0;
    if (typeof appliedCoupon !== 'undefined' && appliedCoupon) {
        if (appliedCoupon.type === 'percent') {
            discountVal = (subtotal * appliedCoupon.value) / 100;
        } else {
            discountVal = Math.min(appliedCoupon.value, subtotal);
        }
        appliedCoupon.discountAmount = discountVal;
    }

    const grandTotal = Math.max(0, subtotal - discountVal) + fee;

    const subEl = document.getElementById('chkSubtotal');
    if (subEl) subEl.textContent = `${subtotal.toFixed(0)} ج.م`;

    const discRow = document.getElementById('chkDiscountRow');
    const discValEl = document.getElementById('chkDiscountVal');
    if (discRow && discValEl) {
        if (discountVal > 0) {
            discRow.style.display = 'flex';
            discValEl.textContent = `-${discountVal.toFixed(0)} ج.م (${appliedCoupon.code})`;
        } else {
            discRow.style.display = 'none';
        }
    }

    const feeEl = document.getElementById('chkDeliveryFee');
    if (feeEl) {
        if (fee === 0) {
            feeEl.innerHTML = `<span style="color: #059669; font-weight: 950;">0 ج.م (شحن مجاني 🎁)</span>`;
        } else {
            feeEl.innerHTML = `<span style="font-weight: 900; color: #d97706;">+${fee.toFixed(0)} ج.م</span>`;
        }
    }

    const estRow = document.getElementById('chkDeliveryEstimateVal');
    if (estRow && shipCfg.estimatedTime) {
        estRow.textContent = shipCfg.estimatedTime;
    }

    const grandEl = document.getElementById('chkGrandTotal');
    if (grandEl) grandEl.textContent = `${grandTotal.toFixed(0)} ج.م`;
}

// تنفيذ وحفظ الطلب
function submitCustomerOrder() {
    const nameInput = document.getElementById('chkCustomerName');
    const phoneInput = document.getElementById('chkCustomerPhone');
    const phone2Input = document.getElementById('chkCustomerPhone2');
    const cityInput = document.getElementById('checkoutCity');
    const addressInput = document.getElementById('chkCustomerAddress');
    const notesInput = document.getElementById('chkCustomerNotes');

    const name = nameInput ? nameInput.value.trim() : '';
    const phone = phoneInput ? phoneInput.value.trim() : '';
    const phone2 = phone2Input ? phone2Input.value.trim() : '';
    const city = cityInput ? cityInput.value : 'القاهرة';
    const address = addressInput ? addressInput.value.trim() : '';
    const notes = notesInput ? notesInput.value.trim() : '';

    if (!name) {
        alert("⚠️ يرجى كتابة اسمك الكريم بالكامل");
        nameInput.focus();
        return;
    }

    if (!phone || phone.length < 10) {
        alert("⚠️ يرجى كتابة رقم هاتف أو واتساب صحيح للتواصل وتأكيد التسليم");
        phoneInput.focus();
        return;
    }

    if (!address) {
        alert("⚠️ يرجى كتابة عنوان التوصيل بالتفصيل (المنطقة والشارع والعمارة)");
        addressInput.focus();
        return;
    }

    const subtotal = cartItems.reduce((sum, it) => sum + (it.price * it.qty), 0);
    const fee = getCityDeliveryFee(city, subtotal);
    const shipCfg = (typeof getShippingConfig === 'function') ? getShippingConfig() : { estimatedTime: 'خلال 24 إلى 48 ساعة' };
    
    let discountAmount = 0;
    let couponCode = '';
    if (typeof appliedCoupon !== 'undefined' && appliedCoupon) {
        discountAmount = appliedCoupon.discountAmount || 0;
        couponCode = appliedCoupon.code || '';
    }
    const grandTotal = Math.max(0, subtotal - discountAmount) + fee;

    // استخراج رقم تسلسلي للطلب من قاعدة بيانات IndexedDB
    let existingOrders = [];
    try {
        const raw = (typeof BayanIDB !== 'undefined') ? BayanIDB.getItem(BAYAN_POS_STORAGE_KEY) : null;
        if (raw) existingOrders = JSON.parse(raw);
    } catch(e) {}

    const nextId = (existingOrders.length > 0 ? Math.max(...existingOrders.map(o => o.id || 0)) + 1 : 1);

    const activeShopId = (typeof getActiveShopId === 'function') ? getActiveShopId() : 'SHOP_DEMO';
    const newOrder = {
        id: nextId,
        shop_id: activeShopId,
        customerName: name,
        phone1: phone,
        phone2: phone2,
        city: city,
        address: address,
        notes: notes,
        date: new Date().toISOString(),
        status: 'new',
        deliveryFee: fee,
        shippingFee: fee,
        discountAmount: discountAmount,
        couponCode: couponCode,
        items: cartItems.map(it => ({
            pos_id: it.pos_id || it.id || '',
            code: it.code || '',
            name: it.name,
            barcode: it.barcode || ('ONL-' + it.id),
            size: it.size || '',
            color: it.color || '',
            qty: it.qty,
            price: it.price,
            total: it.price * it.qty,
            bundleBadge: it.bundleBadge || null
        })),
        subtotal: subtotal,
        grandTotal: grandTotal,
        source: 'متجر الويب أونلاين 🌐'
    };

    // 1. حفظ الطلب في قاعدة بيانات IndexedDB الخالصة
    try {
        existingOrders.unshift(newOrder);
        if (typeof BayanIDB !== 'undefined') {
            BayanIDB.setItem(BAYAN_POS_STORAGE_KEY, JSON.stringify(existingOrders));
            BayanIDB.setOrder(newOrder);
        }
    } catch(e) {
        console.error("Error pushing order to Bayan POS:", e);
    }

    // 2. حفظ نسخة في أرشيف متجر الويب بـ IndexedDB
    try {
        const rawWeb = (typeof BayanIDB !== 'undefined') ? BayanIDB.getItem('bayan_store_web_orders') : null;
        const webOrders = JSON.parse(rawWeb || '[]');
        webOrders.unshift(newOrder);
        if (typeof BayanIDB !== 'undefined') {
            BayanIDB.setItem('bayan_store_web_orders', JSON.stringify(webOrders));
        }
    } catch(e) {}

    // 3. ☁️ إرسال الطلب فوراً إلى قاعدة بيانات Firebase Firestore السحابية
    try {
        const db = (typeof getBayanDb === 'function') ? getBayanDb() : null;
        if (db) {
            db.collection('orders').add({
                ...newOrder,
                createdAt: (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue) ? firebase.firestore.FieldValue.serverTimestamp() : new Date().toISOString()
            }).then(docRef => {
                console.log("☁️ تم إرسال الطلب لفايربيس السحابية بنجاح:", docRef.id);
                newOrder.firestoreId = docRef.id;
            }).catch(err => {
                console.warn("⚠️ تعذر إرسال الطلب لفايربيس، تم الحفظ محلياً:", err);
            });
        }
    } catch(cloudErr) {
        console.warn("⚠️ خطأ في الاتصال السحابي:", cloudErr);
    }

    lastSubmittedOrder = newOrder;

    // 4. تفريغ السلة والكوبون
    cartItems = [];
    if (typeof removeAppliedCoupon === 'function') {
        removeAppliedCoupon();
    }
    saveCart();

    // حفظ رقم الطلب ورقم الهاتف في قاعدة بيانات IndexedDB
    try {
        const rawRecent = (typeof BayanIDB !== 'undefined') ? BayanIDB.getItem('bayan_customer_recent_orders') : null;
        let myOrderIds = JSON.parse(rawRecent || '[]');
        if (!myOrderIds.includes(newOrder.id)) {
            myOrderIds.unshift(newOrder.id);
            if (typeof BayanIDB !== 'undefined') {
                BayanIDB.setItem('bayan_customer_recent_orders', JSON.stringify(myOrderIds.slice(0, 20)));
            }
        }
        if (newOrder.phone1 && typeof BayanIDB !== 'undefined') {
            BayanIDB.setItem('bayan_customer_saved_phone', newOrder.phone1);
        }
    } catch(e) {}

    // 5. إغلاق المودال وفتح رسالة النجاح
    closeCheckoutModal();
    showOrderSuccessModal(newOrder);
}

// عرض رسالة نجاح الطلب
function showOrderSuccessModal(order) {
    const modal = document.getElementById('successModal');
    if (!modal) return;

    document.getElementById('successOrderId').textContent = `#${order.id}`;
    document.getElementById('successCustomerName').textContent = order.customerName;
    document.getElementById('successGrandTotal').textContent = `${order.grandTotal.toFixed(0)} ج.م`;
    document.getElementById('successAddress').textContent = `${order.city} - ${order.address}`;

    modal.classList.add('open');
}

function closeSuccessModal() {
    const modal = document.getElementById('successModal');
    if (modal) modal.classList.remove('open');
}

// إرسال تأكيد بالواتساب بنقرة واحدة
function sendOrderConfirmationViaWhatsApp() {
    if (!lastSubmittedOrder) return;
    const o = lastSubmittedOrder;

    const itemsText = (o.items || []).map((it, idx) => 
        `${idx + 1}. ${it.name} (مقاس: ${it.size} - لون: ${it.color}) [العدد: ${it.qty}] = ${it.total} ج.م`
    ).join('\n');

    const msg = `🛍️ *طلب شراء جديد من متجر بيان للأزياء*\n` +
        `-----------------------------------------\n` +
        `📌 *رقم الطلب:* #${o.id}\n` +
        `👤 *اسم العميل:* ${o.customerName}\n` +
        `📱 *الهاتف:* ${o.phone1} ${o.phone2 ? ' - ' + o.phone2 : ''}\n` +
        `📍 *العنوان:* [${o.city}] ${o.address}\n` +
        (o.notes ? `📝 *ملاحظات:* ${o.notes}\n` : '') +
        `-----------------------------------------\n` +
        `👕 *تفاصيل الأصناف المطلوبة:*\n${itemsText}\n` +
        `-----------------------------------------\n` +
        `💰 *قيمة البضاعة:* ${o.subtotal} ج.م\n` +
        `🚚 *مصاريف التوصيل:* ${o.deliveryFee} ج.م\n` +
        `💵 *الإجمالي المطلوب عند الاستلام:* *${o.grandTotal} ج.م*\n` +
        `-----------------------------------------\n` +
        `✅ شكراً لاختياركم متجر بيان!`;

    // استخراج رقم الواتساب المحفوظ للمحل إن وجد
    let targetPhone = STORE_WHATSAPP_PHONE;
    try {
        const rawSettings = (typeof BayanIDB !== 'undefined') ? BayanIDB.getItem('bayan_store_settings') : null;
        if (rawSettings) {
            const parsed = JSON.parse(rawSettings);
            if (parsed.whatsapp) {
                targetPhone = parsed.whatsapp.replace(/[^0-9]/g, '');
                if (targetPhone.startsWith('01')) targetPhone = '2' + targetPhone;
            }
        }
    } catch(e) {}

    const url = targetPhone ? `https://wa.me/${targetPhone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
}

// ==============================================================================
// 📦 بوابة متابعة وتتبع طلبات وفواتير العملاء (Customer Orders Portal)
// ==============================================================================
function openCustomerOrdersModal() {
    const modal = document.getElementById('customerOrdersModal');
    if (!modal) return;

    modal.classList.add('open');

    // تعبئة رقم الهاتف المسجل تلقائياً إن وجد
    const savedPhone = (typeof BayanIDB !== 'undefined' ? BayanIDB.getItem('bayan_customer_saved_phone') : null) || '';
    const searchInput = document.getElementById('trackSearchInput');
    if (searchInput && savedPhone && !searchInput.value) {
        searchInput.value = savedPhone;
    }

    loadInitialCustomerOrders();
}

function closeCustomerOrdersModal() {
    const modal = document.getElementById('customerOrdersModal');
    if (modal) modal.classList.remove('open');
}

function loadInitialCustomerOrders() {
    const rawOrders = (typeof BayanIDB !== 'undefined') ? BayanIDB.getItem('bayan_customer_recent_orders') : null;
    const myOrderIds = JSON.parse(rawOrders || '[]');
    const savedPhone = (typeof BayanIDB !== 'undefined' ? BayanIDB.getItem('bayan_customer_saved_phone') : null) || '';

    if (savedPhone) {
        searchCustomerOrders(savedPhone);
    } else if (myOrderIds.length > 0) {
        searchCustomerOrders(String(myOrderIds[0]));
    } else {
        const container = document.getElementById('customerOrdersListContainer');
        if (container) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px 15px; color: var(--text-muted);">
                    <div style="font-size: 3rem; margin-bottom: 8px;">📦✨</div>
                    <div style="font-weight: 900; font-size: 1.05rem; color: var(--primary);">تتبع طلباتك السابقة</div>
                    <p style="font-size: 0.85rem; margin-top: 6px;">أدخل رقم هاتفك أو رقم الطلب في الصندوق أعلاه للاستعلام الفوري.</p>
                </div>
            `;
        }
    }
}

function searchCustomerOrders(forceQuery) {
    const input = document.getElementById('trackSearchInput');
    const query = (forceQuery !== undefined ? String(forceQuery) : (input?.value || '')).trim();

    const container = document.getElementById('customerOrdersListContainer');
    if (!container) return;

    if (!query) {
        container.innerHTML = `
            <div style="text-align: center; padding: 30px; color: var(--text-muted); font-size: 0.9rem;">
                يرجى كتابة رقم الهاتف أو رقم الطلب للبحث.
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div style="text-align: center; padding: 30px; color: var(--text-muted); font-weight: 800;">
            ⏳ جاري الاستعلام وتتبع الشحنة...
        </div>
    `;

    // 1. فحص الطلبات المخزنة في IndexedDB
    let localMatches = [];
    try {
        const rawWeb = (typeof BayanIDB !== 'undefined') ? BayanIDB.getItem('bayan_store_web_orders') : null;
        const rawPos = (typeof BayanIDB !== 'undefined') ? BayanIDB.getItem(BAYAN_POS_STORAGE_KEY) : null;
        const webList = rawWeb ? JSON.parse(rawWeb) : [];
        const posList = rawPos ? JSON.parse(rawPos) : [];
        const combined = [...webList, ...posList];

        localMatches = combined.filter(o => 
            String(o.id) === query || 
            (o.phone1 && o.phone1.includes(query)) || 
            (o.phone2 && o.phone2.includes(query))
        );
    } catch(e) {}

    // 2. فحص الطلبات في Firebase السحابي إن وجد
    const db = (typeof getBayanDb === 'function') ? getBayanDb() : null;
    if (db) {
        db.collection('orders').get().then(snapshot => {
            let cloudMatches = [];
            snapshot.forEach(doc => {
                const o = { firestoreId: doc.id, ...doc.data() };
                if (String(o.id) === query || (o.phone1 && o.phone1.includes(query)) || (o.phone2 && o.phone2.includes(query))) {
                    cloudMatches.push(o);
                }
            });

            // دمج النتائج بدون تكرار
            const allMap = new Map();
            [...cloudMatches, ...localMatches].forEach(item => {
                allMap.set(String(item.id), item);
            });

            renderCustomerOrdersList(Array.from(allMap.values()));
        }).catch(() => {
            renderCustomerOrdersList(localMatches);
        });
    } else {
        renderCustomerOrdersList(localMatches);
    }
}

function renderCustomerOrdersList(orders) {
    const container = document.getElementById('customerOrdersListContainer');
    if (!container) return;

    if (!orders || orders.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 35px 20px; background: rgba(0,0,0,0.02); border-radius: 12px; border: 1.5px dashed var(--border-color);">
                <div style="font-size: 2.5rem; margin-bottom: 6px;">🔍</div>
                <div style="font-weight: 900; color: var(--primary);">لم يتم العثور على أي طلب بهذا الرقم</div>
                <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">تأكد من كتابة نفس رقم الهاتف المستخدم عند إرسال الطلب.</p>
            </div>
        `;
        return;
    }

    const statusMap = {
        'new': { label: '🟡 قيد المراجعة والتجهيز', bg: '#fef08a', color: '#854d0e' },
        'processing': { label: '🔵 جاري الشحن والتوصيل مع المندوب', bg: '#e0f2fe', color: '#0369a1' },
        'delivered': { label: '🟢 تم التسليم والتحصيل بنجاح', bg: '#dcfce7', color: '#166534' },
        'cancelled': { label: '🔴 ملغي', bg: '#fee2e2', color: '#991b1b' }
    };

    container.innerHTML = orders.map(o => {
        const st = statusMap[o.status] || statusMap['new'];
        const itemsStr = (o.items || []).map(it => `${it.name} (${it.size || 'حر'}) × ${it.qty}`).join(' ، ');

        return `
            <div class="customer-order-card">
                <div class="order-track-head">
                    <div>
                        <span style="font-weight: 950; font-size: 1.05rem; color: var(--primary);">طلب #${o.id}</span>
                        <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">
                            ${new Date(o.date || o.createdAt || Date.now()).toLocaleDateString('ar-EG')}
                        </div>
                    </div>
                    <span class="order-track-badge" style="background: ${st.bg}; color: ${st.color};">
                        ${st.label}
                    </span>
                </div>

                <div class="order-items-mini-list">
                    <b>الأصناف:</b> ${itemsStr || 'تشكيلة ملابس'}
                </div>

                <div style="font-size: 0.85rem; color: var(--text-muted);">
                    📍 <b>العنوان:</b> ${o.city} - ${o.address}
                </div>

                <div class="order-track-footer">
                    <div style="font-weight: 950; font-size: 1.1rem; color: #059669;">
                        الإجمالي المطلوب: ${Number(o.grandTotal || 0).toFixed(0)} ج.م
                    </div>

                    <div style="display: flex; gap: 8px;">
                        <button type="button" class="btn-card-action" onclick="printCustomerBill('${o.id}')" style="background: var(--primary); color: white; border-color: var(--primary);">
                            <span>🖨️ طباعة الفاتورة</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function printCustomerBill(orderId) {
    let order = null;
    if (lastSubmittedOrder && String(lastSubmittedOrder.id) === String(orderId)) {
        order = lastSubmittedOrder;
    }

    if (!order) {
        try {
            const rawWeb = (typeof BayanIDB !== 'undefined') ? BayanIDB.getItem('bayan_store_web_orders') : null;
            const rawPos = (typeof BayanIDB !== 'undefined') ? BayanIDB.getItem(BAYAN_POS_STORAGE_KEY) : null;
            const combined = [...(rawWeb ? JSON.parse(rawWeb) : []), ...(rawPos ? JSON.parse(rawPos) : [])];
            order = combined.find(o => String(o.id) === String(orderId));
        } catch(e) {}
    }

    if (!order) {
        alert("يرجى مراجعة تفاصيل الطلب مع إدارة المتجر أو إدخال رقم هاتف صحيح");
        return;
    }

    const printWin = window.open('', '_blank', 'width=880,height=950');
    if (!printWin) {
        alert("يرجى السماح بالنوافذ المنبثقة لإتمام عملية الطباعة");
        return;
    }

    let storeName = 'بيان فاشون ستور - BAYAN LUXURY FASHION';
    let storePhone = STORE_WHATSAPP_PHONE || '201012345678';
    try {
        const rawSettings = (typeof BayanIDB !== 'undefined') ? BayanIDB.getItem('bayan_store_settings') : null;
        if (rawSettings) {
            const parsed = JSON.parse(rawSettings);
            if (parsed.storeName) storeName = parsed.storeName;
            if (parsed.whatsapp) storePhone = parsed.whatsapp;
        }
    } catch(e) {}

    const orderDate = new Date(order.date || order.createdAt || Date.now()).toLocaleString('ar-EG', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    const itemsHtml = (order.items || []).map((it, idx) => `
        <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 1 ? 'background-color: #f8fafc;' : ''}">
            <td style="padding: 10px 12px; text-align: center; font-weight: 800; color: #64748b;">${idx + 1}</td>
            <td style="padding: 10px 12px; font-weight: 900; color: #0f172a;">
                <div style="font-size: 14px;">${it.name}</div>
                ${it.barcode ? `<div style="font-size: 10px; color: #94a3b8; font-family: monospace;">كود: ${it.barcode}</div>` : ''}
            </td>
            <td style="padding: 10px 12px; text-align: center;">
                <span style="background: #e2e8f0; color: #1e293b; padding: 2px 8px; border-radius: 6px; font-size: 12px; font-weight: 800;">${it.size || 'حر'}</span>
            </td>
            <td style="padding: 10px 12px; text-align: center;">
                <span style="background: #f1f5f9; color: #334155; padding: 2px 8px; border-radius: 6px; font-size: 12px; font-weight: 800;">${it.color || 'أساسي'}</span>
            </td>
            <td style="padding: 10px 12px; text-align: center; font-weight: 950; font-size: 14px; color: #0f172a;">${it.qty}</td>
            <td style="padding: 10px 12px; text-align: left; font-weight: 700; color: #475569;">${Number(it.price || 0).toFixed(0)} ج.م</td>
            <td style="padding: 10px 12px; text-align: left; font-weight: 950; color: #0f172a;">${Number(it.total || (it.price * it.qty)).toFixed(0)} ج.م</td>
        </tr>
    `).join('');

    const discountRow = (order.discountAmount && order.discountAmount > 0) ? `
        <tr style="border-bottom: 1px dashed #cbd5e1;">
            <td colspan="6" style="padding: 8px 14px; text-align: right; color: #7c3aed; font-weight: 900;">
                🎟️ خصم الكوبون الترويجي (${order.couponCode || 'كوبون معتمد'}):
            </td>
            <td style="padding: 8px 14px; text-align: left; color: #7c3aed; font-weight: 950;">
                -${Number(order.discountAmount).toFixed(0)} ج.م
            </td>
        </tr>
    ` : '';

    const isFreeShipping = Number(order.deliveryFee || 0) === 0;
    const shippingRow = `
        <tr style="border-bottom: 1px dashed #cbd5e1;">
            <td colspan="6" style="padding: 8px 14px; text-align: right; font-weight: 900; color: ${isFreeShipping ? '#059669' : '#b45309'};">
                🚚 مصاريف الشحن والتوصيل للمحافظة:
            </td>
            <td style="padding: 8px 14px; text-align: left; font-weight: 950; color: ${isFreeShipping ? '#059669' : '#b45309'};">
                ${isFreeShipping ? '0 ج.م (شحن مجاني 🎁)' : `+${Number(order.deliveryFee).toFixed(0)} ج.م`}
            </td>
        </tr>
    `;

    const html = `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="utf-8">
            <title>فاتورة شراء معتمدة - طلب #${order.id}</title>
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900;950&display=swap" rel="stylesheet">
            <style>
                * { box-sizing: border-box; }
                body { 
                    font-family: 'Cairo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                    margin: 0; 
                    padding: 24px; 
                    color: #0f172a; 
                    background: #f1f5f9; 
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                .invoice-wrapper { 
                    max-width: 820px; 
                    margin: 0 auto; 
                    background: #ffffff; 
                    border-radius: 18px; 
                    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); 
                    border: 2px solid #e2e8f0; 
                    overflow: hidden;
                    position: relative;
                }
                .royal-top-stripe {
                    height: 7px;
                    background: linear-gradient(90deg, #b45309 0%, #f59e0b 25%, #0f172a 50%, #f59e0b 75%, #b45309 100%);
                }
                .header-container {
                    padding: 24px 30px 18px 30px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 2px solid #0f172a;
                    background: #fafbfc;
                }
                .brand-emblem-wrap {
                    display: flex;
                    align-items: center;
                    gap: 14px;
                }
                .brand-icon-crown {
                    width: 52px;
                    height: 52px;
                    background: #0f172a;
                    border: 2px solid #d97706;
                    border-radius: 14px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 26px;
                    color: #f59e0b;
                    box-shadow: 0 4px 12px rgba(217, 119, 6, 0.25);
                }
                .brand-title {
                    font-size: 23px;
                    font-weight: 950;
                    color: #0f172a;
                    letter-spacing: -0.5px;
                    line-height: 1.2;
                }
                .brand-sub {
                    font-size: 12px;
                    color: #64748b;
                    font-weight: 800;
                    margin-top: 3px;
                }
                .invoice-meta-badge {
                    text-align: left;
                }
                .order-num-pill {
                    background: #0f172a;
                    color: #f8fafc;
                    padding: 8px 18px;
                    border-radius: 10px;
                    font-size: 18px;
                    font-weight: 950;
                    display: inline-block;
                    border: 1.5px solid #d97706;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.15);
                }
                .invoice-badge-label {
                    font-size: 11px;
                    color: #64748b;
                    font-weight: 800;
                    margin-top: 5px;
                }

                .body-content {
                    padding: 24px 30px;
                }

                .cards-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 16px;
                    margin-bottom: 22px;
                }
                .info-card {
                    background: #f8fafc;
                    border: 1.5px solid #e2e8f0;
                    border-radius: 12px;
                    padding: 16px;
                }
                .card-head-title {
                    font-size: 13px;
                    font-weight: 950;
                    color: #0369a1;
                    margin-bottom: 10px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    border-bottom: 1px solid #cbd5e1;
                    padding-bottom: 6px;
                }
                .info-card-row {
                    font-size: 13px;
                    line-height: 1.6;
                    margin-bottom: 4px;
                }
                .info-card-row b {
                    color: #334155;
                }

                .notes-warning-box {
                    grid-column: 1 / -1;
                    background: #fffbeb;
                    border: 1.5px solid #fde68a;
                    border-radius: 10px;
                    padding: 10px 14px;
                    font-size: 13px;
                    font-weight: 800;
                    color: #92400e;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .table-wrap {
                    width: 100%;
                    margin-bottom: 18px;
                    border-radius: 10px;
                    overflow: hidden;
                    border: 1px solid #cbd5e1;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 13px;
                }
                thead th {
                    background: #0f172a;
                    color: #ffffff;
                    padding: 11px 12px;
                    font-weight: 900;
                    letter-spacing: 0.2px;
                }

                .totals-grand-container {
                    display: grid;
                    grid-template-columns: 1fr 1.3fr;
                    gap: 16px;
                    margin-top: 10px;
                    align-items: stretch;
                }
                .policy-card {
                    background: #f8fafc;
                    border: 1.5px solid #e2e8f0;
                    border-radius: 12px;
                    padding: 14px;
                    font-size: 11.5px;
                    color: #475569;
                    line-height: 1.6;
                }
                .grand-cod-card {
                    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
                    border: 2px solid #d97706;
                    border-radius: 14px;
                    padding: 18px 22px;
                    color: white;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    box-shadow: 0 6px 20px rgba(15, 23, 42, 0.2);
                }
                .grand-cod-val {
                    font-size: 32px;
                    font-weight: 950;
                    color: #34d399;
                    text-shadow: 0 2px 8px rgba(0,0,0,0.3);
                }

                .barcode-footer-strip {
                    margin-top: 24px;
                    padding-top: 14px;
                    border-top: 1px dashed #cbd5e1;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 12px;
                    color: #64748b;
                }
                .barcode-sim {
                    font-family: monospace;
                    font-weight: 900;
                    letter-spacing: 4px;
                    font-size: 16px;
                    background: #0f172a;
                    color: #ffffff;
                    padding: 4px 12px;
                    border-radius: 4px;
                }

                @media print {
                    body {
                        background: white;
                        padding: 0;
                    }
                    .invoice-wrapper {
                        border: none;
                        box-shadow: none;
                        max-width: 100%;
                    }
                    .no-print {
                        display: none !important;
                    }
                }
            </style>
        </head>
        <body>
            <div class="invoice-wrapper">
                <div class="royal-top-stripe"></div>

                <!-- رأس الفاتورة الملكي -->
                <div class="header-container">
                    <div class="brand-emblem-wrap">
                        <div class="brand-icon-crown">👑</div>
                        <div>
                            <div class="brand-title">${storeName}</div>
                            <div class="brand-sub">فاتورة شراء معتمدة • أزياء وموضة راقية</div>
                        </div>
                    </div>
                    <div class="invoice-meta-badge">
                        <div class="order-num-pill">طلب #${order.id}</div>
                        <div class="invoice-badge-label">تاريخ الإصدار: ${orderDate}</div>
                    </div>
                </div>

                <div class="body-content">
                    <!-- كروت البيانات واللوجستيات -->
                    <div class="cards-grid">
                        <div class="info-card">
                            <div class="card-head-title">👤 بيانات المستلم والعميل</div>
                            <div class="info-card-row"><b>الاسم:</b> ${order.customerName}</div>
                            <div class="info-card-row"><b>الهاتف الأساسي:</b> <span dir="ltr">${order.phone1}</span></div>
                            ${order.phone2 ? `<div class="info-card-row"><b>هاتف إضافي:</b> <span dir="ltr">${order.phone2}</span></div>` : ''}
                            <div class="info-card-row"><b>المحافظة:</b> <span style="font-weight: 900; color: #0369a1;">${order.city || 'القاهرة'}</span></div>
                            <div class="info-card-row"><b>العنوان بالتفصيل:</b> ${order.address}</div>
                        </div>

                        <div class="info-card">
                            <div class="card-head-title">🚚 تفاصيل التوصيل والاستلام</div>
                            <div class="info-card-row"><b>طريقة الدفع:</b> <span style="font-weight: 900; color: #047857;">نقداً عند الاستلام (COD)</span></div>
                            <div class="info-card-row"><b>حالة المعاينة:</b> مسموح بالمعاينة والتجربة قبل الدفع للمندوب</div>
                            <div class="info-card-row"><b>مدة التوصيل:</b> ${order.estimatedTime || 'خلال 24 إلى 48 ساعة'}</div>
                            <div class="info-card-row"><b>خدمة العملاء والواتساب:</b> <span dir="ltr">${storePhone}</span></div>
                        </div>

                        ${order.notes ? `
                            <div class="notes-warning-box">
                                <span style="font-size: 18px;">📝</span>
                                <span><b>ملاحظات التوصيل الخاصة:</b> ${order.notes}</span>
                            </div>
                        ` : ''}
                    </div>

                    <!-- جدول الأصناف الفاخر -->
                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th style="width: 35px; text-align: center;">#</th>
                                    <th style="text-align: right;">الصنف / الموديل</th>
                                    <th style="text-align: center; width: 75px;">المقاس</th>
                                    <th style="text-align: center; width: 85px;">اللون</th>
                                    <th style="text-align: center; width: 60px;">الكمية</th>
                                    <th style="text-align: left; width: 95px;">سعر القطعة</th>
                                    <th style="text-align: left; width: 105px;">الإجمالي</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsHtml}
                                <tr style="border-top: 2px solid #0f172a; background: #fafbfc;">
                                    <td colspan="6" style="padding: 9px 14px; text-align: right; font-weight: 900; color: #334155;">مجموع البضاعة الأصلي:</td>
                                    <td style="padding: 9px 14px; text-align: left; font-weight: 950; color: #0f172a;">${Number(order.subtotal || 0).toFixed(0)} ج.م</td>
                                </tr>
                                ${discountRow}
                                ${shippingRow}
                            </tbody>
                        </table>
                    </div>

                    <!-- إجمالي الدفع كاش عند الاستلام والشروط -->
                    <div class="totals-grand-container">
                        <div class="policy-card">
                            <div style="font-weight: 900; color: #0f172a; margin-bottom: 5px;">📜 سياسة الاستبدال والمعاينة:</div>
                            <div>• يحق لك معاينة الموديل والتأكد من المقاس والجودة بحضور المندوب قبل السداد.</div>
                            <div>• الاستبدال أو الاسترجاع متاح خلال 14 يوماً مع الحفاظ على التكت والغلاف الأصلي.</div>
                            <div style="margin-top: 4px; font-weight: 800; color: #0369a1;">شكراً لاختياركم متجر بيان للأزياء ونتمنى لكم إطلالة ساحرة ✨</div>
                        </div>

                        <div class="grand-cod-card">
                            <div>
                                <div style="font-size: 13px; color: #cbd5e1; font-weight: 800;">المطلوب سداده عند الاستلام:</div>
                                <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">شامل البضاعة والشحن والتوصيل</div>
                            </div>
                            <div class="grand-cod-val">${Number(order.grandTotal || 0).toFixed(0)} ج.م</div>
                        </div>
                    </div>

                    <!-- شريط الباركود والتذييل -->
                    <div class="barcode-footer-strip">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span>الباركود المرجعي:</span>
                            <span class="barcode-sim">||| ${order.id} ||||</span>
                        </div>
                        <div>متجر بيان للأزياء • جميع الحقوق محفوظة</div>
                    </div>
                </div>

                <!-- أزرار التحكم بالطباعة -->
                <div class="no-print" style="padding: 16px 30px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; display: flex; justify-content: center; gap: 12px;">
                    <button onclick="window.print()" style="background: linear-gradient(135deg, #0f172a, #1e293b); color: white; border: 1.5px solid #d97706; padding: 12px 28px; border-radius: 10px; font-size: 15px; font-weight: 950; cursor: pointer; font-family: inherit; box-shadow: 0 4px 12px rgba(15,23,42,0.2);">
                        🖨️ طباعة الفاتورة الفاخرة الآن (Ctrl + P)
                    </button>
                    <button onclick="window.close()" style="background: #ffffff; color: #64748b; border: 1px solid #cbd5e1; padding: 12px 20px; border-radius: 10px; font-size: 14px; font-weight: 800; cursor: pointer; font-family: inherit;">
                        إغلاق النافذة ✕
                    </button>
                </div>
            </div>

            <script>
                window.onload = function() {
                    setTimeout(function() { window.print(); }, 450);
                };
            <\/script>
        </body>
        </html>
    `;

    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
}

// فتح محادثة الواتساب العامة لخدمة العملاء
function openStoreCustomerWhatsApp() {
    let targetPhone = STORE_WHATSAPP_PHONE;
    try {
        const rawSettings = (typeof BayanIDB !== 'undefined') ? BayanIDB.getItem('bayan_store_settings') : null;
        if (rawSettings) {
            const parsed = JSON.parse(rawSettings);
            if (parsed.whatsapp) {
                targetPhone = parsed.whatsapp.replace(/[^0-9]/g, '');
                if (targetPhone.startsWith('01')) targetPhone = '2' + targetPhone;
            }
        }
    } catch(e) {}

    const text = encodeURIComponent('مرحباً متجر بيان للأزياء، أود الاستفسار عن الموديلات والعروض المتاحة 🌸');
    const url = targetPhone ? `https://wa.me/${targetPhone}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(url, '_blank');
}


