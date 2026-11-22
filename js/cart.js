// ==============================================================================
// 🛒 إدارة سلة التسوق لمتجر بيان (Bayan Fashion Store Cart Engine)
// ==============================================================================

const CART_STORAGE_KEY = 'bayan_fashion_store_cart';
let cartItems = [];
let appliedCoupon = null;

// تحميل السلة من قاعدة بيانات IndexedDB
function loadCart() {
    try {
        const saved = (typeof BayanIDB !== 'undefined') ? BayanIDB.getItem(CART_STORAGE_KEY) : null;
        if (saved) cartItems = JSON.parse(saved);
    } catch (e) {
        console.error("Error loading cart:", e);
        cartItems = [];
    }
    updateCartUI();
}

// حفظ السلة في IndexedDB
function saveCart() {
    try {
        if (typeof BayanIDB !== 'undefined') {
            BayanIDB.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
        }
    } catch (e) {
        console.error("Error saving cart:", e);
    }
    updateCartUI();
}

// دالة حساب السعر الفعلي والشارة لعروض الكميات أو عروض BOGO الترويجية
function calculateItemPriceWithOffers(baseUnitPrice, qty, bundleOffers, bogoOffer) {
    const offers = Array.isArray(bundleOffers) ? bundleOffers : [];
    const matchingBundle = offers.find(o => parseInt(o.qty) === qty);

    if (matchingBundle) {
        return {
            unitPrice: parseFloat(matchingBundle.bundlePrice) / qty,
            badge: matchingBundle.badge || `عرض ${matchingBundle.qty} قطع بسعر ${matchingBundle.bundlePrice} ج.م`
        };
    }

    if (bogoOffer && bogoOffer.active && qty >= 2) {
        const type = bogoOffer.type || 'free_second';
        if (type === 'free_second') {
            // كل قطعة معها قطعة مجانية (1+1 Free)
            const paidQty = qty - Math.floor(qty / 2);
            const total = paidQty * baseUnitPrice;
            return {
                unitPrice: total / qty,
                badge: bogoOffer.badge || 'عرض 1+1 مجاناً 🔥'
            };
        } else if (type === 'percent_second') {
            // خصم نسبة مئوية على كل قطعة ثانية
            const discountPct = Number(bogoOffer.value || 50);
            const discountedCount = Math.floor(qty / 2);
            const discountAmount = discountedCount * (baseUnitPrice * (discountPct / 100));
            const total = (qty * baseUnitPrice) - discountAmount;
            return {
                unitPrice: total / qty,
                badge: bogoOffer.badge || `خصم ${discountPct}% على القطعة الثانية 🎁`
            };
        } else if (type === 'free_gift_3') {
            // اشتري قطعتين واحصل على الثالثة مجاناً (2+1 Free)
            const freeCount = Math.floor(qty / 3);
            const paidQty = qty - freeCount;
            const total = paidQty * baseUnitPrice;
            return {
                unitPrice: total / qty,
                badge: bogoOffer.badge || 'عرض 2+1 مجاناً 🎁'
            };
        }
    }

    return {
        unitPrice: baseUnitPrice,
        badge: null
    };
}

// إضافة المنتج الحالي من نافذة الاختيار للسلة
function addCurrentProductToCart() {
    if (!selectedProduct) return;
    if (selectedProduct.isFrozen === true || selectedProduct.status === 'frozen' || selectedProduct.frozen === true) {
        alert("⚠️ عذراً، هذا الموديل مجمد ومخفي حالياً ولا يمكن إضافته للسلة.");
        return;
    }

    const itemKey = `${selectedProduct.id}_${activeSelectedSize}_${activeSelectedColor}`;
    const existingIndex = cartItems.findIndex(it => it.key === itemKey);

    // حساب السعر الفعلي الفردي للمقاس واللون
    const effectiveSinglePrice = (typeof calculateProductItemPrice === 'function')
        ? calculateProductItemPrice(selectedProduct, activeSelectedSize, activeSelectedColor)
        : Number(selectedProduct.price || 0);

    const offers = Array.isArray(selectedProduct.quantityOffers) ? selectedProduct.quantityOffers : [];
    const bogoOffer = selectedProduct.bogoOffer || null;

    const pricing = calculateItemPriceWithOffers(effectiveSinglePrice, activeSelectedQty, offers, bogoOffer);
    const unitPrice = pricing.unitPrice;
    const bundleBadge = pricing.badge;

    if (existingIndex > -1) {
        const target = cartItems[existingIndex];
        const newTotalQty = target.qty + activeSelectedQty;
        target.qty = newTotalQty;

        const updatedPricing = calculateItemPriceWithOffers(
            target.baseUnitPrice || effectiveSinglePrice,
            newTotalQty,
            target.bundleOffers || offers,
            target.bogoOffer || bogoOffer
        );
        target.price = updatedPricing.unitPrice;
        target.bundleBadge = updatedPricing.badge;
    } else {
        cartItems.push({
            key: itemKey,
            id: selectedProduct.id,
            pos_id: selectedProduct.pos_id || selectedProduct.posId || selectedProduct.id || '',
            code: selectedProduct.code || '',
            barcode: selectedProduct.barcode || '',
            name: selectedProduct.name,
            price: unitPrice,
            baseUnitPrice: effectiveSinglePrice,
            image: (selectedProduct.colorImages && selectedProduct.colorImages[activeSelectedColor]) || selectedProduct.image,
            size: activeSelectedSize,
            color: activeSelectedColor,
            qty: activeSelectedQty,
            bundleBadge: bundleBadge,
            bundleOffers: offers,
            bogoOffer: bogoOffer
        });
    }

    saveCart();
    closeProductModal();
    openCartDrawer();
}

// فتح وإغلاق درج السلة
function openCartDrawer() {
    const overlay = document.getElementById('cartDrawerOverlay');
    if (overlay) overlay.classList.add('open');
}

function closeCartDrawer() {
    const overlay = document.getElementById('cartDrawerOverlay');
    if (overlay) overlay.classList.remove('open');
}

// تعديل كمية صنف في السلة مع فحص عروض الباكدج و BOGO وتحديث السعر تلقائياً
function updateCartItemQty(key, delta) {
    const item = cartItems.find(it => it.key === key);
    if (!item) return;

    item.qty += delta;
    if (item.qty <= 0) {
        removeCartItem(key);
        return;
    }

    // إعادة احتساب السعر تلقائياً بحسب الكمية الجديدة مع عروض الباكدج أو BOGO
    const pricing = calculateItemPriceWithOffers(
        item.baseUnitPrice || item.price,
        item.qty,
        item.bundleOffers,
        item.bogoOffer
    );
    item.price = pricing.unitPrice;
    item.bundleBadge = pricing.badge;

    saveCart();
}

// حذف صنف من السلة
function removeCartItem(key) {
    cartItems = cartItems.filter(it => it.key !== key);
    saveCart();
}

// جلب إعدادات الشحن المحفوظة
function getShippingConfig() {
    if (window.BAYAN_SHIPPING_SETTINGS) return window.BAYAN_SHIPPING_SETTINGS;
    try {
        const raw = (typeof BayanIDB !== 'undefined') ? BayanIDB.getItem('bayan_shipping_settings') : null;
        if (raw) {
            window.BAYAN_SHIPPING_SETTINGS = JSON.parse(raw);
            return window.BAYAN_SHIPPING_SETTINGS;
        }
    } catch(e) {}
    return {
        cairoGiza: 40,
        alex: 50,
        delta: 50,
        canal: 55,
        upperEgypt: 65,
        remote: 80,
        defaultFee: 50,
        freeShippingThreshold: 1000,
        estimatedTime: 'خلال 24 إلى 48 ساعة'
    };
}

// تحديث واجهة السلة والشارات وشريط الشحن المجاني
function updateCartUI() {
    const totalCount = cartItems.reduce((sum, it) => sum + it.qty, 0);
    const subtotal = cartItems.reduce((sum, it) => sum + (it.price * it.qty), 0);
    const shipCfg = getShippingConfig();

    // شارات العداد
    const headerBadge = document.getElementById('headerCartBadge');
    if (headerBadge) {
        headerBadge.textContent = totalCount;
        headerBadge.style.display = totalCount > 0 ? 'inline-flex' : 'none';
    }

    const mobileBadge = document.getElementById('mobileCartBadge');
    if (mobileBadge) {
        mobileBadge.textContent = totalCount;
        mobileBadge.style.display = totalCount > 0 ? 'inline-flex' : 'none';
    }

    const mobileTotal = document.getElementById('mobileCartTotal');
    if (mobileTotal) {
        mobileTotal.textContent = `${subtotal.toFixed(0)} ج.م`;
    }

    // شريط تقدم الشحن المجاني (Free Shipping Progress Bar)
    const freeShippingBar = document.getElementById('cartFreeShippingBar');
    if (freeShippingBar) {
        const threshold = Number(shipCfg.freeShippingThreshold || 0);
        if (threshold > 0) {
            freeShippingBar.style.display = 'block';
            const remaining = Math.max(0, threshold - subtotal);
            const percent = Math.min(100, Math.round((subtotal / threshold) * 100));
            const isFree = subtotal >= threshold && subtotal > 0;

            freeShippingBar.innerHTML = `
                <div class="free-shipping-card ${isFree ? 'free-unlocked' : ''}">
                    <div class="free-shipping-header">
                        <span class="free-shipping-icon">${isFree ? '🎁' : '🚚'}</span>
                        <span class="free-shipping-text">
                            ${isFree 
                                ? '<b>تهانينا!</b> لقد حصلت على <b>شحن مجاني لكافة المحافظات</b> 🎉' 
                                : `أضف بـ <b>${remaining.toFixed(0)} ج.م</b> إضافية لتستمتع بـ <b>شحن مجاني</b>`
                            }
                        </span>
                    </div>
                    <div class="free-shipping-track">
                        <div class="free-shipping-fill" style="width: ${percent}%;"></div>
                    </div>
                    <div class="free-shipping-subinfo">
                        <span>الحد المطلوب: ${threshold} ج.م</span>
                        <span>${percent}%</span>
                    </div>
                </div>
            `;
        } else {
            freeShippingBar.style.display = 'none';
        }
    }

    // محتوى درج السلة
    const drawerBody = document.getElementById('cartDrawerBody');
    const drawerFooter = document.getElementById('cartDrawerFooter');

    if (!drawerBody || !drawerFooter) return;

    if (cartItems.length === 0) {
        drawerBody.innerHTML = `
            <div class="cart-empty-state">
                <div style="font-size: 3.5rem; margin-bottom: 12px;">🛍️</div>
                <h4 style="font-size: 1.15rem; font-weight: 900; color: #1e293b;">سلة المشتريات فارغة</h4>
                <p style="font-size: 0.86rem; color: #64748b; margin-top: 6px;">اختر أجمل الموديلات والمقاسات وأضفها للسلة الآن.</p>
                <button onclick="closeCartDrawer()" style="margin-top: 18px; padding: 10px 22px; background: #0f172a; color: white; border: none; border-radius: 999px; font-weight: 900; cursor: pointer;">
                    تصفح الأزياء الآن ✨
                </button>
            </div>
        `;
        drawerFooter.style.display = 'none';
        return;
    }

    drawerFooter.style.display = 'block';

    drawerBody.innerHTML = cartItems.map(it => `
        <div class="cart-item-card">
            <img src="${it.image}" alt="${it.name}" class="cart-item-img">
            <div class="cart-item-info">
                <div class="cart-item-title">${it.name}</div>
                <div class="cart-item-variant">المقاس: ${it.size} | اللون: ${it.color}</div>
                ${it.bundleBadge ? `<div class="cart-item-bundle-badge" style="display:inline-block; font-size:0.72rem; background:#dcfce7; color:#15803d; font-weight:800; padding:2px 7px; border-radius:6px; margin-top:3px;">🎁 ${it.bundleBadge}</div>` : ''}
                <div class="cart-item-price">${Number(it.price * it.qty).toFixed(0)} ج.م</div>
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
                <button class="cart-item-remove" onclick="removeCartItem('${it.key}')" title="حذف">✕</button>
                <div class="qty-control-wrapper" style="transform: scale(0.85); transform-origin: left center;">
                    <button class="qty-btn" onclick="updateCartItemQty('${it.key}', 1)">+</button>
                    <span class="qty-value">${it.qty}</span>
                    <button class="qty-btn" onclick="updateCartItemQty('${it.key}', -1)">-</button>
                </div>
            </div>
        </div>
    `).join('');

    // تحديث قيم الفوتر مع خصم الكوبون إن وجد
    let discountVal = 0;
    if (appliedCoupon) {
        if (appliedCoupon.type === 'percent') {
            discountVal = (subtotal * appliedCoupon.value) / 100;
        } else {
            discountVal = Math.min(appliedCoupon.value, subtotal);
        }
        appliedCoupon.discountAmount = discountVal;
    }

    const finalDrawerTotal = Math.max(0, subtotal - discountVal);

    const subtotalEl = document.getElementById('drawerSubtotal');
    if (subtotalEl) subtotalEl.textContent = `${subtotal.toFixed(0)} ج.م`;

    const discountRow = document.getElementById('drawerDiscountRow');
    const discountValEl = document.getElementById('drawerDiscountVal');
    if (discountRow && discountValEl) {
        if (discountVal > 0) {
            discountRow.style.display = 'flex';
            discountValEl.textContent = `-${discountVal.toFixed(0)} ج.م`;
        } else {
            discountRow.style.display = 'none';
        }
    }

    // إشعار تكلفة الشحن في السلة
    const drawerShippingNotice = document.getElementById('drawerShippingNotice');
    if (drawerShippingNotice) {
        const threshold = Number(shipCfg.freeShippingThreshold || 0);
        if (threshold > 0 && subtotal >= threshold) {
            drawerShippingNotice.innerHTML = `<span style="color: #059669; font-weight: 900;">0 ج.م (شحن مجاني 🎁)</span>`;
        } else {
            drawerShippingNotice.innerHTML = `<span style="color: #0284c7;">يُحدد حسب المحافظة</span>`;
        }
    }

    const grandTotalEl = document.getElementById('drawerGrandTotal');
    if (grandTotalEl) grandTotalEl.textContent = `${finalDrawerTotal.toFixed(0)} ج.م`;
}

// حساب تكلفة الشحن ديناميكياً حسب المحافظة مع احتساب الشحن المجاني
function getCityDeliveryFee(city, customSubtotal) {
    const config = getShippingConfig();
    const currentSubtotal = (typeof customSubtotal === 'number') 
        ? customSubtotal 
        : (cartItems ? cartItems.reduce((sum, it) => sum + (it.price * it.qty), 0) : 0);

    // فحص حد الشحن المجاني التلقائي
    if (config.freeShippingThreshold > 0 && currentSubtotal >= config.freeShippingThreshold) {
        return 0;
    }

    if (!city) return Number(config.cairoGiza || 40);
    const c = city.trim();

    // القاهرة والجيزة والقليوبية
    if (c.includes('القاهرة') || c.includes('الجيزة') || c.includes('القليوبية') || c.includes('حلوان') || c.includes('أكتوبر') || c.includes('العبور') || c.includes('بدر') || c.includes('الشروق')) {
        return Number(config.cairoGiza || 40);
    }
    // الإسكندرية والبحيرة
    if (c.includes('الإسكندرية') || c.includes('البحيرة') || c.includes('دمنهور')) {
        return Number(config.alex || 50);
    }
    // الدلتا والوجه البحري
    if (c.includes('الدقهلية') || c.includes('المنصورة') || c.includes('الغربية') || c.includes('طنطا') || c.includes('المحلة') ||
        c.includes('الشرقية') || c.includes('الزقازيق') || c.includes('المنوفية') || c.includes('شبين') || c.includes('دمياط') || c.includes('كفر الشيخ')) {
        return Number(config.delta || 50);
    }
    // مدن القناة
    if (c.includes('بورسعيد') || c.includes('الإسماعيلية') || c.includes('السويس')) {
        return Number(config.canal || 55);
    }
    // محافظات الصعيد
    if (c.includes('الصعيد') || c.includes('الفيوم') || c.includes('بني سويف') || c.includes('المنيا') || c.includes('أسيوط') ||
        c.includes('سوهاج') || c.includes('قنا') || c.includes('الأقصر') || c.includes('أسوان')) {
        return Number(config.upperEgypt || 65);
    }
    // المحافظات الحدودية والنائية
    if (c.includes('البحر الأحمر') || c.includes('الغردقة') || c.includes('شرم الشيخ') || c.includes('سيناء') ||
        c.includes('مطروح') || c.includes('مرسى مطروح') || c.includes('الوادي الجديد')) {
        return Number(config.remote || 80);
    }

    return Number(config.defaultFee || 50);
}

// ==============================================================================
// تطبيق وإلغاء كود الخصم في السلة
// ==============================================================================
function applyCouponCode() {
    const input = document.getElementById('cartCouponInput');
    const code = (input?.value || '').trim().toUpperCase();

    if (!code) {
        alert("يرجى كتابة كود الخصم أولاً");
        return;
    }

    const subtotal = cartItems.reduce((sum, it) => sum + (it.price * it.qty), 0);
    if (subtotal <= 0) {
        alert("سلة المشتريات فارغة");
        return;
    }

    const db = (typeof getBayanDb === 'function') ? getBayanDb() : null;
    if (!db) {
        alert("⚠️ جاري فحص الكوبون، يرجى المحاولة بعد قليل");
        return;
    }

    db.collection('coupons').doc(code).get().then(doc => {
        if (!doc.exists) {
            alert(`⚠️ كود الخصم (${code}) غير صحيح أو منتهي الصلاحية`);
            return;
        }

        const c = doc.data();
        if (c.active === false) {
            alert(`⚠️ هذا الكوبون معطل حالياً`);
            return;
        }

        // التحقق من مدة وتاريخ صلاحية الكوبون
        if (c.expireAt) {
            const expDate = new Date(c.expireAt);
            if (expDate <= new Date()) {
                const formattedExp = expDate.toLocaleString('ar-EG', {
                    year: 'numeric', month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });
                alert(`⚠️ عذراً، انتهت صلاحية كود الخصم (${code}) في ${formattedExp}`);
                return;
            }
        }

        if (c.minOrder && subtotal < c.minOrder) {
            alert(`⚠️ هذا الكوبون يتطلب طلباً بقيمة ${c.minOrder} ج.م على الأقل لتفعيله`);
            return;
        }

        let discountVal = (c.type === 'percent') ? ((subtotal * c.value) / 100) : Math.min(c.value, subtotal);

        appliedCoupon = {
            code: c.code,
            type: c.type,
            value: c.value,
            discountAmount: discountVal
        };

        // تحديث واجهة الكوبون
        const inputGroup = document.getElementById('cartCouponInputGroup');
        const appliedPill = document.getElementById('cartAppliedCouponPill');
        const appliedText = document.getElementById('cartAppliedCouponText');

        if (inputGroup) inputGroup.style.display = 'none';
        if (appliedPill) appliedPill.style.display = 'flex';
        if (appliedText) appliedText.textContent = `🎟️ تم تطبيق (${c.code}) - خصم ${discountVal.toFixed(0)} ج.م`;

        updateCartUI();
        if (typeof updateCheckoutTotals === 'function') {
            updateCheckoutTotals();
        }
    }).catch(err => {
        alert("حدث خطأ أثناء التحقق من الكوبون: " + err.message);
    });
}

function removeAppliedCoupon() {
    appliedCoupon = null;

    const inputGroup = document.getElementById('cartCouponInputGroup');
    const appliedPill = document.getElementById('cartAppliedCouponPill');
    const input = document.getElementById('cartCouponInput');

    if (inputGroup) inputGroup.style.display = 'flex';
    if (appliedPill) appliedPill.style.display = 'none';
    if (input) input.value = '';

    updateCartUI();
    if (typeof updateCheckoutTotals === 'function') {
        updateCheckoutTotals();
    }
}
