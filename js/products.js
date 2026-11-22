// ==============================================================================
// 🛍️ كتالوج أزياء متجر بيان (Bayan Fashion Storefront Products Engine)
// ==============================================================================

// يبدأ الكتالوج فارغاً تماماً بدون أي بيانات أو منتجات افتراضية
let FASHION_PRODUCTS = [];

// تشغيل المظهر المفضل فوراً لمنع وميض الصفحة
try {
    const savedTheme = (typeof BayanIDB !== 'undefined' ? BayanIDB.getItem('bayan_theme') : null) || 'light';
    if (savedTheme === 'system') {
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
        document.documentElement.setAttribute('data-theme', savedTheme);
    }
} catch (e) { }

// قراءة المنتجات المعتمدة والحقيقية من ذاكرة IndexedDB السريعة
try {
    const syncedProducts = (typeof BayanIDB !== 'undefined' ? BayanIDB.getItem('bayan_fashion_synced_products') : null);
    if (syncedProducts) {
        const parsed = JSON.parse(syncedProducts);
        if (Array.isArray(parsed)) FASHION_PRODUCTS = parsed;
    }
} catch (e) { }

// ⚡ تحميل فوري من قاعدة بيانات IndexedDB المحلية بأقصى سرعة
if (typeof BayanIDB !== 'undefined') {
    BayanIDB.getAllProducts().then(idbProds => {
        if (Array.isArray(idbProds) && idbProds.length > 0) {
            FASHION_PRODUCTS = idbProds;
            renderProducts();
        }
    }).catch(console.warn);
}

// 👑 تطبيق إعدادات المتجر وشعار البراند من IndexedDB فور الفتح
try {
    const savedSettings = (typeof BayanIDB !== 'undefined' ? BayanIDB.getItem('bayan_store_settings') : null);
    if (savedSettings) {
        const parsedCfg = JSON.parse(savedSettings);
        if (parsedCfg.storeName) {
            const brandTitle = document.querySelector('.store-brand h1');
            if (brandTitle) brandTitle.textContent = parsedCfg.storeName;
            const heroDefTitle = document.getElementById('heroDefaultTitle');
            if (heroDefTitle) heroDefTitle.textContent = parsedCfg.storeName;
        }
        if (parsedCfg.storeSubName) {
            const brandSub = document.getElementById('storeBrandSubTitle') || document.querySelector('.brand-details span');
            if (brandSub) brandSub.textContent = parsedCfg.storeSubName;
            const heroSub = document.getElementById('heroDefaultSub') || document.querySelector('.hero-default-sub');
            if (heroSub) heroSub.textContent = parsedCfg.storeSubName;
            const mainName = parsedCfg.storeName || 'بيان فاشون';
            document.title = `${mainName} | ${parsedCfg.storeSubName}`;
        }
        if (parsedCfg.storeLogo) {
            applyStoreLogo(parsedCfg.storeLogo, parsedCfg.storeName);
        }
    }
} catch (e) { }

let currentCategory = 'all';
let currentSearchQuery = '';
let currentSortOrder = 'newest';
let currentPriceRange = 'all';
let currentInStockOnly = false;
let activeModalImages = [];
let activeModalImageIndex = 0;

// دالة لمعرفة اسم القسم بالعربي
function getCategoryDisplayName(cat) {
    const map = {
        'men': 'أزياء رجالي 👔',
        'women': 'أزياء حريمي 👗',
        'kids': 'ملابس أطفال 🧒',
        'shoes': 'كوتشيات وأحذية 👟',
        'bags': 'شنط وإكسسوارات 👜',
        'offers': 'عروض وتخفيضات 🔥'
    };
    return map[cat] || 'تشكيلة أزياء';
}

// كود لوني افتراضي في حالة إدخال أسماء ألوان نصية
function getColorHex(colorName) {
    const map = {
        'أسود': '#0f172a',
        'أبيض': '#f8fafc',
        'كحلي': '#1e3a8a',
        'أزرق': '#2563eb',
        'بيج': '#f5f5dc',
        'بني': '#78350f',
        'رمادي': '#64748b',
        'رصاصي': '#64748b',
        'أحمر': '#dc2626',
        'نبيتي': '#881337',
        'أخضر': '#16a34a',
        'زيتي': '#3f6212',
        'كشمير': '#d977a6',
        'وردي': '#f472b6',
        'أصفر': '#eab308',
        'أوف وايت': '#fdfbf7'
    };
    return map[colorName] || '#94a3b8';
}

// تغيير طريقة الترتيب
function setSortOrder(order) {
    currentSortOrder = order;
    renderProducts();
}

// تغيير فلتر السعر
function setPriceFilter(range, btnEl) {
    currentPriceRange = range;
    document.querySelectorAll('.filter-chip-btn').forEach(btn => btn.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    renderProducts();
}

// تغيير فلتر المتوفر فقط
function toggleInStockOnly(isChecked) {
    currentInStockOnly = isChecked;
    renderProducts();
}

// عرض شبكة المنتجات مع الفلترة والترتيب المتقدم
function renderProducts() {
    renderFlashSalesSection();
    const grid = document.getElementById('productsGrid');
    if (!grid) return;

    let filtered = [...FASHION_PRODUCTS];

    // 0. استبعاد وتجميد: إخفاء كافة الموديلات المجمدة أو غير النشطة (active === false) تماماً من متجر العملاء
    filtered = filtered.filter(p => p.active !== false && p.isFrozen !== true && p.status !== 'frozen' && p.frozen !== true);

    // 1. فلترة الأقسام
    if (currentCategory !== 'all') {
        if (currentCategory === 'offers') {
            filtered = filtered.filter(p => p.oldPrice > p.price);
        } else {
            filtered = filtered.filter(p => p.category === currentCategory);
        }
    }

    // 2. فلترة البحث
    if (currentSearchQuery) {
        filtered = filtered.filter(p =>
            (p.name && p.name.toLowerCase().includes(currentSearchQuery)) ||
            (p.categoryName && p.categoryName.toLowerCase().includes(currentSearchQuery)) ||
            (p.description && p.description.toLowerCase().includes(currentSearchQuery))
        );
    }

    // 3. فلترة نطاق السعر
    if (currentPriceRange === 'under300') {
        filtered = filtered.filter(p => Number(p.price) < 300);
    } else if (currentPriceRange === '300to600') {
        filtered = filtered.filter(p => Number(p.price) >= 300 && Number(p.price) <= 600);
    } else if (currentPriceRange === 'above600') {
        filtered = filtered.filter(p => Number(p.price) > 600);
    }

    // 4. فلترة المتوفر فقط بالمخزن
    if (currentInStockOnly) {
        filtered = filtered.filter(p => p.inStock !== false && (p.stockQty === undefined || p.stockQty > 0));
    }

    // 5. محرك الترتيب الذكي
    if (currentSortOrder === 'price-asc') {
        filtered.sort((a, b) => Number(a.price) - Number(b.price));
    } else if (currentSortOrder === 'price-desc') {
        filtered.sort((a, b) => Number(b.price) - Number(a.price));
    } else if (currentSortOrder === 'offers') {
        filtered.sort((a, b) => {
            const discA = (a.oldPrice && a.oldPrice > a.price) ? (a.oldPrice - a.price) : 0;
            const discB = (b.oldPrice && b.oldPrice > b.price) ? (b.oldPrice - b.price) : 0;
            return discB - discA;
        });
    } else {
        // newest (الأحدث وصولاً)
        filtered.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
    }

    // تحديث عداد المنتجات المعروضة
    const countBadge = document.getElementById('storeFilteredCount');
    if (countBadge) {
        countBadge.textContent = `${filtered.length} موديل`;
    }

    if (filtered.length === 0) {
        const isStoreCompletelyEmpty = (!FASHION_PRODUCTS || FASHION_PRODUCTS.length === 0);
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; background: white; border-radius: 18px; border: 1.5px dashed #cbd5e1;">
                <div style="font-size: 3.5rem; margin-bottom: 12px;">👗✨</div>
                <h3 style="font-size: 1.3rem; font-weight: 900; color: #0f172a;">${isStoreCompletelyEmpty ? 'لا توجد موديلات معروضة حالياً في المتجر' : 'لا توجد موديلات مطابقة لخيارات البحث أو الفلترة'}</h3>
                <p style="font-size: 0.95rem; color: #64748b; margin-top: 8px;">${isStoreCompletelyEmpty ? 'بمجرد إضافة موديلات أزياء من لوحة تحكم التاجر ستظهر هنا فوراً للعملاء.' : 'جرب تغيير نطاق السعر أو البحث باسم مختلف.'}</p>
                ${!isStoreCompletelyEmpty ? `
                    <button onclick="setPriceFilter('all', document.querySelector('.filter-chip-btn')); toggleInStockOnly(false);" style="margin-top: 14px; padding: 8px 20px; background: var(--primary); color: white; border: none; border-radius: 999px; font-weight: 900; cursor: pointer; font-family: inherit;">
                        إعادة ضبط الفلاتر 🔄
                    </button>
                ` : ''}
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered.map(p => {
        const discountPercent = (p.oldPrice && p.oldPrice > p.price) ? Math.round(((p.oldPrice - p.price) / p.oldPrice) * 100) : 0;
        const fallbackImg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'%3E%3Crect fill='%23f1f5f9' width='300' height='300'/%3E%3Ctext fill='%2394a3b8' font-family='sans-serif' font-size='32' dy='10.5' font-weight='bold' x='50%25' y='50%25' text-anchor='middle'%3E👗 بيان فاشون%3C/text%3E%3C/svg%3E";
        const img = p.image || fallbackImg;
        const sizes = Array.isArray(p.sizes) ? p.sizes : [];
        const isOutOfStock = (p.inStock === false) || (p.stockQty !== undefined && p.stockQty <= 0);
        const isLowStock = !isOutOfStock && (p.stockQty !== undefined && p.stockQty <= 5 && p.stockQty > 0);
        const isFav = typeof isProductInWishlist === 'function' && isProductInWishlist(p.id);

        return `
            <div class="product-card" onclick="openProductModal('${p.id}')">
                <div class="product-thumb-wrapper">
                    <img src="${img}" alt="${p.name}" class="product-img" loading="lazy" onerror="this.src='${fallbackImg}'">
                    <button type="button" class="btn-wishlist-card ${isFav ? 'active' : ''}" onclick="toggleWishlist('${p.id}', event)" title="أضف للمفضلة">
                        ${isFav ? '❤️' : '🤍'}
                    </button>
                    ${p.bogoOffer && p.bogoOffer.active ? `<span class="bogo-badge">${p.bogoOffer.badge || 'عرض 1+1 🔥'}</span>` : ''}
                    ${p.badge ? `<span class="product-badge">${p.badge}</span>` : (discountPercent > 0 ? `<span class="product-badge" style="background:#dc2626;">خصم ${discountPercent}% 🔥</span>` : '')}
                    ${isOutOfStock ? `<div class="product-out-of-stock-overlay"><span>نفذت الكمية ❌</span></div>` : ''}
                </div>
                <div class="product-body">
                    <div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
                            <div class="product-category">${p.categoryName || getCategoryDisplayName(p.category)}</div>
                            ${(() => {
                let realReviews = [];
                try {
                    const saved = (typeof BayanIDB !== 'undefined') ? BayanIDB.getItem(`bayan_reviews_${p.id}`) : null;
                    if (saved) realReviews = JSON.parse(saved);
                } catch (e) { }
                if (realReviews && realReviews.length > 0) {
                    const avg = (realReviews.reduce((sum, r) => sum + r.rating, 0) / realReviews.length).toFixed(1);
                    return `
                                        <div class="card-rating-strip" style="display: flex; align-items: center; gap: 3px; font-size: 0.78rem; font-weight: 800; color: #f59e0b;">
                                            <span>⭐</span>
                                            <span>${avg}</span>
                                            <span style="color: #94a3b8; font-size: 0.72rem;">(${realReviews.length})</span>
                                        </div>
                                    `;
                }
                return '';
            })()}
                        </div>
                        <h3 class="product-title">${p.name}</h3>
                        ${isLowStock ? `<div class="urgency-badge">🔥 متبقي ${p.stockQty} قطع فقط!</div>` : ''}
                        <div class="product-variants-preview">
                            ${sizes.slice(0, 4).map(s => `<span class="size-pill-mini">${s}</span>`).join('')}
                            ${sizes.length > 4 ? `<span class="size-pill-mini">+${sizes.length - 4}</span>` : ''}
                        </div>
                    </div>
                    <div class="product-footer">
                        <div class="product-prices">
                            <span class="price-current">${Number(p.price).toFixed(0)} ج.م</span>
                            ${p.oldPrice && p.oldPrice > p.price ? `<span class="price-old">${Number(p.oldPrice).toFixed(0)} ج.م</span>` : ''}
                        </div>
                        <button class="btn-select-product" type="button" ${isOutOfStock ? 'disabled style="opacity:0.5;"' : ''}>
                            <span>${isOutOfStock ? 'نفذت' : 'اختيار'}</span>
                            <span>${isOutOfStock ? '❌' : '🛒'}</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// تصفية الأقسام
function setCategory(cat) {
    currentCategory = cat;
    document.querySelectorAll('.category-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.category === cat);
    });
    renderProducts();
}

// البحث الفوري
function handleStoreSearch(q) {
    currentSearchQuery = String(q || '').toLowerCase().trim();
    renderProducts();
}

// نافذة تفاصيل واختيار المقاس واللون
let selectedProduct = null;
let activeSelectedSize = '';
let activeSelectedColor = '';
let activeSelectedQty = 1;
let activeSelectedBundleOffer = null;

function openProductModal(productId) {
    const product = FASHION_PRODUCTS.find(p => String(p.id) === String(productId));
    if (!product) return;

    if (product.isFrozen === true || product.status === 'frozen' || product.frozen === true) {
        alert("⚠️ هذا الموديل غير معروض حالياً بالمتجر (مجمد مؤقتاً).");
        return;
    }

    selectedProduct = product;
    const sizes = Array.isArray(product.sizes) ? product.sizes : ['فري سايز'];
    const colors = Array.isArray(product.colors) ? product.colors : ['أساسي'];
    const fallbackImg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'%3E%3Crect fill='%23f1f5f9' width='300' height='300'/%3E%3Ctext fill='%2394a3b8' font-family='sans-serif' font-size='32' dy='10.5' font-weight='bold' x='50%25' y='50%25' text-anchor='middle'%3E👗 بيان فاشون%3C/text%3E%3C/svg%3E";

    // 1. مصفوفة الصور (الرئيسية + الفرعية)
    const allImages = (Array.isArray(product.images) && product.images.length > 0)
        ? product.images
        : (product.image ? [product.image] : [fallbackImg]);

    activeModalImages = allImages;
    activeModalImageIndex = 0;

    activeSelectedSize = sizes[0] || '';
    const firstColor = colors[0];
    activeSelectedColor = typeof firstColor === 'object' ? firstColor.name : String(firstColor || '');
    activeSelectedQty = 1;

    const modal = document.getElementById('productModal');
    if (!modal) return;

    // ضبط الصورة الرئيسية وتحديث المعرض
    const mainImgEl = document.getElementById('modalProductImg');
    mainImgEl.src = allImages[0];
    mainImgEl.alt = product.name;

    // شريط المصغرات (Thumbnails)
    const thumbsRow = document.getElementById('modalThumbsRow');
    if (thumbsRow) {
        if (allImages.length > 1) {
            thumbsRow.innerHTML = allImages.map((imgUrl, idx) => `
                <div class="modal-thumb-item ${idx === 0 ? 'active' : ''}" onclick="switchModalGalleryImage('${imgUrl}', this, ${idx})">
                    <img src="${imgUrl}" alt="زاوية ${idx + 1}" loading="lazy" onerror="this.src='${fallbackImg}'">
                </div>
            `).join('');
            thumbsRow.style.display = 'flex';
        } else {
            thumbsRow.innerHTML = '';
            thumbsRow.style.display = 'none';
        }
    }

    updateModalGalleryState();

    // شارة الخصم
    const discountBadge = document.getElementById('modalDiscountBadge');
    if (discountBadge) {
        const discountPercent = (product.oldPrice && product.oldPrice > product.price) ? Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100) : 0;
        if (discountPercent > 0) {
            discountBadge.textContent = `خصم ${discountPercent}% 🔥`;
            discountBadge.style.display = 'inline-block';
        } else {
            discountBadge.style.display = 'none';
        }
    }

    document.getElementById('modalProductCategory').textContent = product.categoryName || getCategoryDisplayName(product.category);
    document.getElementById('modalProductTitle').textContent = product.name;
    document.getElementById('modalProductDesc').textContent = product.description || 'خامة فاخرة مريحة وعالية الجودة مصممة لتناسب مختلف الإطلالات.';

    // فحص شارة المخزون وحالة التوفر
    const stockBadge = document.getElementById('modalStockUrgency');
    const addCartBtn = document.querySelector('.btn-add-cart-final');
    const isOutOfStock = (product.inStock === false) || (product.stockQty !== undefined && product.stockQty <= 0);
    const isLowStock = !isOutOfStock && (product.stockQty !== undefined && product.stockQty <= 5 && product.stockQty > 0);

    if (stockBadge) {
        if (isOutOfStock) {
            stockBadge.style.display = 'inline-flex';
            stockBadge.style.background = '#fee2e2';
            stockBadge.style.color = '#dc2626';
            stockBadge.textContent = '❌ نفذت الكمية من هذا الموديل حالياً';
        } else if (isLowStock) {
            stockBadge.style.display = 'inline-flex';
            stockBadge.style.background = 'linear-gradient(135deg, #fef2f2, #fee2e2)';
            stockBadge.style.color = '#dc2626';
            stockBadge.textContent = `🔥 متبقي ${product.stockQty} قطع فقط! اطلب الآن قبل نفاذ الكمية`;
        } else {
            stockBadge.style.display = 'none';
        }
    }

    if (addCartBtn) {
        if (isOutOfStock) {
            addCartBtn.disabled = true;
            addCartBtn.style.opacity = '0.5';
            addCartBtn.style.cursor = 'not-allowed';
            addCartBtn.innerHTML = '<span>❌ نفذت الكمية</span>';
        } else {
            addCartBtn.disabled = false;
            addCartBtn.style.opacity = '1';
            addCartBtn.style.cursor = 'pointer';
            addCartBtn.innerHTML = '<span>🛒</span><span>إضافة إلى سلة المشتريات</span>';
        }
    }

    // رندر المقاسات مع فحص السعر المخصص لكل مقاس
    const sizesContainer = document.getElementById('modalProductSizes');
    sizesContainer.innerHTML = sizes.map((s, idx) => {
        const hasCustomPrice = product.sizePrices && product.sizePrices[s] && Number(product.sizePrices[s]) > 0;
        const customPriceVal = hasCustomPrice ? Number(product.sizePrices[s]) : null;
        return `
            <button type="button" class="chip-btn ${idx === 0 ? 'selected' : ''}" onclick="selectModalSize('${s}', this)">
                <span>${s}</span>
                ${hasCustomPrice ? `<span class="chip-sub-price">${customPriceVal.toFixed(0)} ج.م</span>` : ''}
            </button>
        `;
    }).join('');

    // رندر الألوان مع فحص السعر المخصص لكل لون
    const colorsContainer = document.getElementById('modalProductColors');
    colorsContainer.innerHTML = colors.map((c, idx) => {
        const cName = typeof c === 'object' ? c.name : String(c);
        const cHex = typeof c === 'object' ? (c.hex || getColorHex(c.name)) : getColorHex(c);
        const hasCustomColor = product.colorPrices && product.colorPrices[cName] && Number(product.colorPrices[cName]) > 0;
        const customColorVal = hasCustomColor ? Number(product.colorPrices[cName]) : null;
        return `
            <button type="button" class="color-chip-btn ${idx === 0 ? 'selected' : ''}" onclick="selectModalColor('${cName}', this)">
                <span class="color-dot" style="background-color: ${cHex}; border: 1px solid #cbd5e1;"></span>
                <span>${cName}</span>
                ${hasCustomColor ? `<span class="chip-sub-price">${customColorVal.toFixed(0)} ج.م</span>` : ''}
            </button>
        `;
    }).join('');

    // رندر قسم عروض وتخفيضات الكميات والباكدج
    renderModalQuantityOffers(product);

    // تحديث السعر الفعلي للمقاس واللون الابتدائي
    updateModalPriceForSizeAndColor();

    // إذا كان اللون الابتدائي له صورة مخصصة نعرضها فوراً
    if (product.colorImages && product.colorImages[activeSelectedColor]) {
        mainImgEl.src = product.colorImages[activeSelectedColor];
    }

    document.getElementById('modalProductQty').textContent = '1';
    activeSelectedBundleOffer = null;

    // تحديث حالة زر المفضلة وتجهيز التقييمات وتنسيق الإطلالة
    if (typeof updateModalWishlistBtn === 'function') {
        updateModalWishlistBtn(product.id);
    }
    if (typeof renderCompleteTheLook === 'function') {
        renderCompleteTheLook(product);
    }
    if (typeof renderProductReviews === 'function') {
        renderProductReviews(product);
    }

    const modalBox = modal.querySelector('.modal-product-detail-box');
    if (modalBox) modalBox.scrollTop = 0;
    modal.classList.add('open');
}

// تبديل الصورة في المعرض عند النقر على صورة مصغرة
function switchModalGalleryImage(imgUrl, thumbEl, idx) {
    if (typeof idx === 'number') {
        activeModalImageIndex = idx;
    } else {
        const found = activeModalImages.indexOf(imgUrl);
        if (found > -1) activeModalImageIndex = found;
    }
    updateModalGalleryState();
}

// التنقل بين صور الموديل بالأسهم
function nextModalGalleryImage(e) {
    if (e) e.stopPropagation();
    if (!activeModalImages || activeModalImages.length <= 1) return;
    activeModalImageIndex = (activeModalImageIndex + 1) % activeModalImages.length;
    updateModalGalleryState();
}

function prevModalGalleryImage(e) {
    if (e) e.stopPropagation();
    if (!activeModalImages || activeModalImages.length <= 1) return;
    activeModalImageIndex = (activeModalImageIndex - 1 + activeModalImages.length) % activeModalImages.length;
    updateModalGalleryState();
}

// تحديث حالة صورة المعرض والعداد وشريط المصغرات
function updateModalGalleryState() {
    const mainImgEl = document.getElementById('modalProductImg');
    const counterEl = document.getElementById('modalGalleryCounter');
    const navPrevBtn = document.getElementById('modalGalleryPrevBtn');
    const navNextBtn = document.getElementById('modalGalleryNextBtn');

    if (activeModalImages.length > 0) {
        const curImg = activeModalImages[activeModalImageIndex];
        if (mainImgEl) {
            mainImgEl.style.opacity = '0.35';
            setTimeout(() => {
                mainImgEl.src = curImg;
                mainImgEl.style.opacity = '1';
            }, 90);
        }

        if (counterEl) {
            counterEl.textContent = `${activeModalImageIndex + 1} / ${activeModalImages.length}`;
            counterEl.style.display = activeModalImages.length > 1 ? 'inline-block' : 'none';
        }

        if (navPrevBtn && navNextBtn) {
            navPrevBtn.style.display = activeModalImages.length > 1 ? 'flex' : 'none';
            navNextBtn.style.display = activeModalImages.length > 1 ? 'flex' : 'none';
        }

        document.querySelectorAll('#modalThumbsRow .modal-thumb-item').forEach((el, idx) => {
            if (idx === activeModalImageIndex) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });
    }
}

// تكبير الصورة للشاشة الكاملة (Lightbox Zoom)
function openImageLightbox() {
    const mainImgEl = document.getElementById('modalProductImg');
    const lightboxModal = document.getElementById('imageLightboxModal');
    const lightboxImg = document.getElementById('lightboxMainImg');
    if (!lightboxModal || !lightboxImg || !mainImgEl || !mainImgEl.src) return;

    lightboxImg.src = mainImgEl.src;
    lightboxModal.classList.add('open');
}

function closeImageLightbox() {
    const lightboxModal = document.getElementById('imageLightboxModal');
    if (lightboxModal) lightboxModal.classList.remove('open');
}

function closeProductModal() {
    const modal = document.getElementById('productModal');
    if (modal) modal.classList.remove('open');
}

// حساب السعر الفعلي الفردي للموديل حسب المقاس واللون المختارين
function calculateProductItemPrice(product, size, color) {
    if (!product) return 0;
    const isFlashActive = product.flashSale && !product.flashFrozen && (!product.flashExpire || new Date(product.flashExpire).getTime() > Date.now());
    const basePrice = (isFlashActive && product.flashPrice > 0) ? Number(product.flashPrice) : Number(product.price || 0);

    const hasCustomSize = product.sizePrices && product.sizePrices[size] && Number(product.sizePrices[size]) > 0;
    const hasCustomColor = product.colorPrices && product.colorPrices[color] && Number(product.colorPrices[color]) > 0;

    let effectivePrice = basePrice;
    if (hasCustomSize && hasCustomColor) {
        const prodBase = Number(product.price || basePrice);
        const sizeDiff = Math.max(0, Number(product.sizePrices[size]) - prodBase);
        const colorDiff = Math.max(0, Number(product.colorPrices[color]) - prodBase);
        effectivePrice = basePrice + sizeDiff + colorDiff;
    } else if (hasCustomSize) {
        effectivePrice = Number(product.sizePrices[size]);
    } else if (hasCustomColor) {
        effectivePrice = Number(product.colorPrices[color]);
    }
    return effectivePrice;
}

// اختيار المقاس وتحديث السعر فوراً
function selectModalSize(size, el) {
    activeSelectedSize = size;
    document.querySelectorAll('#modalProductSizes .chip-btn').forEach(btn => btn.classList.remove('selected'));
    if (el) el.classList.add('selected');
    updateModalPriceForSizeAndColor();
}

// تحديث شاشة السعر بحسب المقاس واللون والكمية أو الباكدج المختار
function updateModalPriceForSizeAndColor() {
    if (!selectedProduct) return;
    const isFlashActive = selectedProduct.flashSale && !selectedProduct.flashFrozen && (!selectedProduct.flashExpire || new Date(selectedProduct.flashExpire).getTime() > Date.now());
    const basePrice = (isFlashActive && selectedProduct.flashPrice > 0) ? Number(selectedProduct.flashPrice) : Number(selectedProduct.price || 0);
    const originalPrice = (isFlashActive && selectedProduct.flashPrice > 0) ? Number(selectedProduct.price) : Number(selectedProduct.oldPrice || 0);

    const effectiveSinglePrice = calculateProductItemPrice(selectedProduct, activeSelectedSize, activeSelectedColor);
    const hasCustomVariantPrice = (effectiveSinglePrice !== basePrice);

    const priceEl = document.getElementById('modalProductPrice');
    const oldPriceEl = document.getElementById('modalProductOldPrice');
    const noticeEl = document.getElementById('modalSizePriceNotice');

    // إذا كان هناك عرض باكدج نشط
    if (activeSelectedBundleOffer && activeSelectedQty === activeSelectedBundleOffer.qty) {
        const regularTotal = effectiveSinglePrice * activeSelectedQty;
        if (priceEl) priceEl.textContent = `${activeSelectedBundleOffer.bundlePrice.toFixed(0)} ج.م`;
        if (oldPriceEl) {
            oldPriceEl.textContent = (regularTotal > activeSelectedBundleOffer.bundlePrice) ? `${regularTotal.toFixed(0)} ج.م` : '';
        }
        if (noticeEl) {
            noticeEl.style.display = 'inline-flex';
            noticeEl.style.background = '#dcfce7';
            noticeEl.style.color = '#15803d';
            noticeEl.textContent = `🎁 تم تطبيق عرض باكدج (${activeSelectedBundleOffer.qty} قطع): ${activeSelectedBundleOffer.bundlePrice.toFixed(0)} ج.م ${activeSelectedBundleOffer.badge ? '• ' + activeSelectedBundleOffer.badge : ''}`;
        }
    } else {
        // سعر عادي بحسب الكمية المختارة
        const totalLine = effectiveSinglePrice * activeSelectedQty;
        if (priceEl) {
            if (activeSelectedQty > 1) {
                priceEl.textContent = `${totalLine.toFixed(0)} ج.م (${effectiveSinglePrice.toFixed(0)} × ${activeSelectedQty})`;
            } else {
                priceEl.textContent = `${effectiveSinglePrice.toFixed(0)} ج.م`;
            }
        }
        if (oldPriceEl) {
            if (originalPrice > effectiveSinglePrice) {
                oldPriceEl.textContent = `${(originalPrice * activeSelectedQty).toFixed(0)} ج.م`;
            } else {
                oldPriceEl.textContent = '';
            }
        }
        if (noticeEl) {
            if (isFlashActive && !hasCustomVariantPrice) {
                noticeEl.style.display = 'inline-flex';
                noticeEl.style.background = '#fff7ed';
                noticeEl.style.color = '#c2410c';
                noticeEl.textContent = `⚡ سعر عرض الفلاش الاستثنائي: ${effectiveSinglePrice.toFixed(0)} ج.م`;
            } else if (hasCustomVariantPrice) {
                noticeEl.style.display = 'inline-flex';
                noticeEl.style.background = '#f5f3ff';
                noticeEl.style.color = '#7c3aed';
                noticeEl.textContent = `🏷️ سعر خاص للمقاس (${activeSelectedSize}) واللون (${activeSelectedColor}): ${effectiveSinglePrice.toFixed(0)} ج.م للقطعة`;
            } else if (selectedProduct.bogoOffer && selectedProduct.bogoOffer.active) {
                noticeEl.style.display = 'inline-flex';
                noticeEl.style.background = '#ecfdf5';
                noticeEl.style.color = '#065f46';
                noticeEl.textContent = `🎁 ${selectedProduct.bogoOffer.badge || 'عرض خاص نشط على هذا الموديل!'}`;
            } else {
                noticeEl.style.display = 'none';
            }
        }
    }

    // تحديث أسعار كروت العروض لتعكس السعر الفردي الجديد للمقاس/اللون إن وجد
    const wrapper = document.getElementById('modalQuantityOffersWrapper');
    if (wrapper && wrapper.style.display !== 'none' && selectedProduct.quantityOffers && selectedProduct.quantityOffers.length > 0) {
        const firstCardPrice = wrapper.querySelector('.bundle-offer-card:first-child .bundle-offer-price');
        if (firstCardPrice) firstCardPrice.textContent = `${effectiveSinglePrice.toFixed(0)} ج.م`;
    }
}

// رندر قسم عروض وتخفيضات الكميات والباكدج
function renderModalQuantityOffers(product) {
    const wrapper = document.getElementById('modalQuantityOffersWrapper');
    const grid = document.getElementById('modalQuantityOffersGrid');
    if (!wrapper || !grid) return;

    const offers = Array.isArray(product.quantityOffers) ? product.quantityOffers : [];
    if (offers.length === 0) {
        wrapper.style.display = 'none';
        grid.innerHTML = '';
        return;
    }

    wrapper.style.display = 'block';

    const unitPrice = calculateProductItemPrice(product, activeSelectedSize, activeSelectedColor);

    // كارت القطعة الواحدة + كروت عروض الكميات
    let html = `
        <div class="bundle-offer-card ${activeSelectedBundleOffer === null && activeSelectedQty === 1 ? 'active' : ''}" 
             onclick="selectBundleOffer(1, ${unitPrice}, '', this)">
            <span class="bundle-offer-qty">قطعة واحدة</span>
            <span class="bundle-offer-price">${unitPrice.toFixed(0)} ج.م</span>
            <span class="bundle-offer-unit-price">السعر الأساسي</span>
        </div>
    `;

    offers.forEach(off => {
        const qty = parseInt(off.qty);
        const bPrice = parseFloat(off.bundlePrice);
        const badge = (off.badge || '').trim();
        const perPiece = (bPrice / qty).toFixed(0);
        const regularTotal = unitPrice * qty;
        const savings = Math.round(regularTotal - bPrice);
        const isSelected = (activeSelectedBundleOffer && activeSelectedBundleOffer.qty === qty) || (activeSelectedQty === qty);

        html += `
            <div class="bundle-offer-card ${isSelected ? 'active' : ''}" 
                 onclick="selectBundleOffer(${qty}, ${bPrice}, '${badge}', this)">
                ${badge ? `<span class="bundle-offer-badge">${badge}</span>` : (savings > 0 ? `<span class="bundle-offer-badge">وفر ${savings} ج.م 🔥</span>` : '')}
                <span class="bundle-offer-qty">${qty} قطع</span>
                <span class="bundle-offer-price">${bPrice.toFixed(0)} ج.م</span>
                <span class="bundle-offer-unit-price">(${perPiece} ج.م / للقطعة)</span>
            </div>
        `;
    });

    grid.innerHTML = html;
}

// اختيار عرض باكدج محدد
function selectBundleOffer(qty, bundlePrice, badge, cardEl) {
    activeSelectedQty = qty;
    const qtyEl = document.getElementById('modalProductQty');
    if (qtyEl) qtyEl.textContent = qty;

    if (qty === 1) {
        activeSelectedBundleOffer = null;
    } else {
        activeSelectedBundleOffer = { qty, bundlePrice, badge };
    }

    document.querySelectorAll('#modalQuantityOffersGrid .bundle-offer-card').forEach(c => c.classList.remove('active'));
    if (cardEl) {
        cardEl.classList.add('active');
    }

    updateModalPriceForSizeAndColor();
}

function selectModalColor(colorName, el) {
    activeSelectedColor = colorName;
    document.querySelectorAll('#modalProductColors .color-chip-btn').forEach(btn => btn.classList.remove('selected'));
    if (el) el.classList.add('selected');

    // تبديل صورة الموديل تلقائياً حسب اللون المختار
    if (selectedProduct && selectedProduct.colorImages && selectedProduct.colorImages[colorName]) {
        const targetImgUrl = selectedProduct.colorImages[colorName];
        const mainImgEl = document.getElementById('modalProductImg');
        if (mainImgEl && mainImgEl.src !== targetImgUrl) {
            mainImgEl.style.opacity = '0.3';
            setTimeout(() => {
                mainImgEl.src = targetImgUrl;
                mainImgEl.style.opacity = '1';
            }, 120);
        }

        // تحديد الصورة المصغرة النشطة في شريط المعرض
        document.querySelectorAll('#modalThumbsRow .modal-thumb-item').forEach(thumb => {
            const imgInside = thumb.querySelector('img');
            if (imgInside && imgInside.src === targetImgUrl) {
                thumb.classList.add('active');
            } else {
                thumb.classList.remove('active');
            }
        });
    }

    updateModalPriceForSizeAndColor();
}

function changeModalQty(delta) {
    let next = activeSelectedQty + delta;
    if (next < 1) next = 1;
    activeSelectedQty = next;
    const el = document.getElementById('modalProductQty');
    if (el) el.textContent = next;

    // فحص ما إذا كانت الكمية الجديدة تطابق أحد عروض الباكدج
    if (selectedProduct && Array.isArray(selectedProduct.quantityOffers)) {
        const matchingOffer = selectedProduct.quantityOffers.find(o => parseInt(o.qty) === next);
        if (matchingOffer) {
            activeSelectedBundleOffer = {
                qty: next,
                bundlePrice: parseFloat(matchingOffer.bundlePrice),
                badge: matchingOffer.badge
            };
        } else {
            activeSelectedBundleOffer = null;
        }
    } else {
        activeSelectedBundleOffer = null;
    }

    // تحديث تمييز الكروت
    const cards = document.querySelectorAll('#modalQuantityOffersGrid .bundle-offer-card');
    cards.forEach(card => {
        const cardQtyText = card.querySelector('.bundle-offer-qty')?.textContent || '';
        if ((next === 1 && cardQtyText.includes('قطعة واحدة')) || cardQtyText.includes(`${next} قطع`)) {
            card.classList.add('active');
        } else {
            card.classList.remove('active');
        }
    });

    updateModalPriceForSizeAndColor();
}

// ☁️ الاستماع المباشر الفوري للأصناف والأسعار والصور من Firebase Firestore
function listenToProductsLive() {
    const db = (typeof getBayanDb === 'function') ? getBayanDb() : null;
    if (!db) {
        setTimeout(listenToProductsLive, 1500);
        return;
    }

    try {
        db.collection('products').onSnapshot(snapshot => {
            let liveList = [];
            snapshot.forEach(doc => {
                const d = doc.data();
                if (d.active !== false) {
                    const imgList = (Array.isArray(d.images) && d.images.length > 0) ? d.images : (d.image ? [d.image] : []);
                    liveList.push({
                        id: d.id || doc.id,
                        firestoreId: doc.id,
                        name: d.name || '',
                        category: d.category || 'men',
                        categoryName: d.categoryName || getCategoryDisplayName(d.category),
                        price: Number(d.price || 0),
                        oldPrice: d.oldPrice ? Number(d.oldPrice) : null,
                        sizes: Array.isArray(d.sizes) && d.sizes.length > 0 ? d.sizes : ['M', 'L', 'XL'],
                        colors: Array.isArray(d.colors) && d.colors.length > 0 ? d.colors : ['أساسي'],
                        image: imgList[0] || d.image || '',
                        images: imgList,
                        sizePrices: (typeof d.sizePrices === 'object' && d.sizePrices !== null) ? d.sizePrices : {},
                        colorPrices: (typeof d.colorPrices === 'object' && d.colorPrices !== null) ? d.colorPrices : {},
                        quantityOffers: Array.isArray(d.quantityOffers) ? d.quantityOffers : [],
                        bogoOffer: (d.bogoOffer && typeof d.bogoOffer === 'object') ? d.bogoOffer : null,
                        badge: d.badge || '',
                        description: d.description || '',
                        inStock: d.inStock !== false,
                        stockQty: Number(d.stockQty || 0),
                        flashSale: d.flashSale === true,
                        flashPrice: Number(d.flashPrice || 0),
                        flashExpire: d.flashExpire || null,
                        flashFrozen: d.flashFrozen === true,
                        isFrozen: d.isFrozen === true || d.status === 'frozen' || d.frozen === true,
                        status: d.status || (d.isFrozen ? 'frozen' : 'active'),
                        createdAt: d.createdAt || null
                    });
                }
            });

            if (liveList.length > 0 || snapshot.empty) {
                FASHION_PRODUCTS = liveList;
                // ⚡ حفظ في قاعدة بيانات IndexedDB الخالصة
                if (typeof BayanIDB !== 'undefined') {
                    BayanIDB.setItem('bayan_fashion_synced_products', JSON.stringify(liveList));
                    BayanIDB.saveAllProducts(liveList);
                }
                renderProducts();
            }
        }, err => {
            console.warn("Firestore products sync note:", err);
        });
    } catch (e) {
        console.error("Failed to bind Firestore products listener:", e);
    }
}

// ==============================================================================
// 🌓 محرك المظهر (Theme Engine: Dark / Light Mode)
// ==============================================================================
function applyTheme(theme) {
    if (theme === 'system') {
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
        document.documentElement.setAttribute('data-theme', theme);
    }
    if (typeof BayanIDB !== 'undefined') {
        BayanIDB.setItem('bayan_theme', theme);
    }

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const icon = document.getElementById('themeToggleIcon');
    const label = document.getElementById('themeToggleLabel');
    if (icon) icon.textContent = isDark ? '☀️' : '🌙';
    if (label) label.textContent = isDark ? 'فاتح' : 'داكن';
}

function toggleBayanTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = (current === 'dark') ? 'light' : 'dark';
    applyTheme(next);
}

// ==============================================================================
// 🔥 محرك عروض وتخفيضات الفلاش وساعة العد التنازلي الحية (Flash Deals)
// ==============================================================================
let flashTimerInterval = null;

function renderFlashSalesSection() {
    const section = document.getElementById('flashSalesSection');
    const grid = document.getElementById('flashSalesGrid');
    if (!section || !grid) return;

    const now = Date.now();
    const activeFlashProducts = FASHION_PRODUCTS.filter(p => {
        if (!p.flashSale || p.flashFrozen || p.isFrozen === true || p.status === 'frozen' || p.frozen === true) return false;
        if (!p.flashExpire) return true;
        const expTime = new Date(p.flashExpire).getTime();
        return expTime > now;
    });

    if (activeFlashProducts.length === 0) {
        section.style.display = 'none';
        if (flashTimerInterval) {
            clearInterval(flashTimerInterval);
            flashTimerInterval = null;
        }
        return;
    }

    section.style.display = 'block';

    const fallbackImg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'%3E%3Crect fill='%23f1f5f9' width='300' height='300'/%3E%3Ctext fill='%2394a3b8' font-family='sans-serif' font-size='32' dy='10.5' font-weight='bold' x='50%25' y='50%25' text-anchor='middle'%3E👗 بيان فاشون%3C/text%3E%3C/svg%3E";

    grid.innerHTML = activeFlashProducts.map(p => {
        const curPrice = (p.flashPrice && p.flashPrice > 0) ? p.flashPrice : p.price;
        const originalPrice = (p.flashPrice && p.flashPrice > 0) ? p.price : (p.oldPrice || p.price);
        const discountPercent = originalPrice > curPrice ? Math.round(((originalPrice - curPrice) / originalPrice) * 100) : 0;

        return `
            <div class="product-card" onclick="openProductModal('${p.id}')" style="border: 2px solid #8b5cf6; box-shadow: 0 8px 24px rgba(139, 92, 246, 0.25);">
                <div class="product-thumb-wrapper">
                    <img src="${p.image || fallbackImg}" alt="${p.name}" class="product-img" loading="lazy" onerror="this.src='${fallbackImg}'">
                    <span class="product-badge" style="background: linear-gradient(135deg, #ef4444, #dc2626); box-shadow: 0 4px 10px rgba(239, 68, 68, 0.45);">
                        ⚡ خصم ${discountPercent}% فلاش
                    </span>
                </div>
                <div class="product-body">
                    <div>
                        <div class="product-category" style="color: #a855f7; font-weight: 900;">⚡ عرض محدود بوقت</div>
                        <h3 class="product-title">${p.name}</h3>
                    </div>
                    <div class="product-footer">
                        <div class="product-prices">
                            <span class="price-current" style="color: #ef4444; font-size: 1.25rem;">${curPrice.toFixed(0)} ج.م</span>
                            ${originalPrice > curPrice ? `<span class="price-old">${originalPrice.toFixed(0)} ج.م</span>` : ''}
                        </div>
                        <button class="btn-select-product" type="button" style="background: #8b5cf6;">
                            <span>اغتنم العرض</span>
                            <span>⚡</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    startFlashCountdown(activeFlashProducts);
}

function startFlashCountdown(flashProducts) {
    if (flashTimerInterval) clearInterval(flashTimerInterval);

    // العثور على أقرب وقت انتهاء
    const expiresWithDates = flashProducts.map(p => p.flashExpire ? new Date(p.flashExpire).getTime() : (Date.now() + 24 * 3600 * 1000));
    const targetEnd = Math.min(...expiresWithDates);

    function tick() {
        const remaining = Math.max(0, targetEnd - Date.now());

        if (remaining <= 0) {
            clearInterval(flashTimerInterval);
            flashTimerInterval = null;
            // تجميد العروض التلقائي
            flashProducts.forEach(p => { p.flashFrozen = true; });
            renderFlashSalesSection();
            renderProducts();
            return;
        }

        const totalSecs = Math.floor(remaining / 1000);
        const hours = Math.floor(totalSecs / 3600);
        const minutes = Math.floor((totalSecs % 3600) / 60);
        const seconds = totalSecs % 60;

        const hEl = document.getElementById('flashTimerHours');
        const mEl = document.getElementById('flashTimerMinutes');
        const sEl = document.getElementById('flashTimerSeconds');

        if (hEl) hEl.textContent = String(hours).padStart(2, '0');
        if (mEl) mEl.textContent = String(minutes).padStart(2, '0');
        if (sEl) sEl.textContent = String(seconds).padStart(2, '0');
    }

    tick();
    flashTimerInterval = setInterval(tick, 1000);
}

// ☁️ الاستماع اللحظي لإعدادات المتجر والشحن والتوصيل (اسم المحل، شريط الإعلانات، الأسعار، وحد الشحن المجاني)
function listenToStoreSettingsLive() {
    const db = (typeof getBayanDb === 'function') ? getBayanDb() : null;
    if (!db) {
        setTimeout(listenToStoreSettingsLive, 2000);
        return;
    }
    try {
        // 1. الاستماع لإعدادات المتجر العامة
        db.collection('settings').doc('general').onSnapshot(doc => {
            if (doc.exists) {
                const data = doc.data();
                if (data.storeName) {
                    const brandTitle = document.querySelector('.store-brand h1');
                    if (brandTitle) brandTitle.textContent = data.storeName;
                    const heroDefTitle = document.getElementById('heroDefaultTitle');
                    if (heroDefTitle) heroDefTitle.textContent = data.storeName;
                    document.title = `${data.storeName} | ${data.storeSubName || 'Fashion Store'}`;
                }
                if (data.storeSubName !== undefined) {
                    const brandSub = document.getElementById('storeBrandSubTitle') || document.querySelector('.brand-details span');
                    if (brandSub) brandSub.textContent = data.storeSubName;
                    const heroSub = document.getElementById('heroDefaultSub') || document.querySelector('.hero-default-sub');
                    if (heroSub) heroSub.textContent = data.storeSubName;
                    const curName = data.storeName || (document.querySelector('.store-brand h1')?.textContent) || 'متجر بيان';
                    document.title = `${curName} | ${data.storeSubName || 'Fashion Store'}`;
                }
                if (data.announcement) {
                    const bar = document.querySelector('.top-announcement-bar');
                    if (bar) bar.innerHTML = `<span>✨</span><span>${data.announcement}</span><span>🚚</span>`;
                }
                applyStoreLogo(data.storeLogo, data.storeName);

                try {
                    let existing = {};
                    const raw = (typeof BayanIDB !== 'undefined') ? BayanIDB.getItem('bayan_store_settings') : null;
                    if (raw) existing = JSON.parse(raw);
                    if (typeof BayanIDB !== 'undefined') {
                        BayanIDB.setItem('bayan_store_settings', JSON.stringify({ ...existing, ...data }));
                    }
                } catch (e) { }
            }
        }, err => console.warn("Settings sync note:", err));

        // 2. الاستماع لإعدادات وسياسة الشحن والتوصيل
        db.collection('settings').doc('shipping').onSnapshot(doc => {
            if (doc.exists) {
                const shipData = doc.data();
                window.BAYAN_SHIPPING_SETTINGS = shipData;
                if (typeof BayanIDB !== 'undefined') {
                    BayanIDB.setItem('bayan_shipping_settings', JSON.stringify(shipData));
                }

                // تحديث واجهة السلة وحد الشحن المجاني تلقائياً
                if (typeof updateCartUI === 'function') {
                    updateCartUI();
                }
                // تحديث إجماليات نافذة الدفع إن كانت معروضة
                if (typeof updateCheckoutTotals === 'function') {
                    updateCheckoutTotals();
                }
            }
        }, err => console.warn("Shipping settings sync note:", err));
    } catch (e) {
        console.warn("Failed to listen to settings:", e);
    }
}

// مزامنة الكتالوج العام
window.FASHION_PRODUCTS = FASHION_PRODUCTS;

// ==============================================================================
// 📏 محرك دليل المقاسات الذكي (Smart Size Guide Engine)
// ==============================================================================
function openSizeGuideModal() {
    const modal = document.getElementById('sizeGuideModalOverlay');
    if (!modal) return;
    modal.classList.add('open');

    // تحديد التبويب المناسب تلقائياً حسب الموديل المعروض
    let initialTab = 'men';
    if (selectedProduct) {
        if (selectedProduct.category === 'women') initialTab = 'women';
        else if (selectedProduct.category === 'kids') initialTab = 'kids';
        else if (selectedProduct.category === 'shoes') initialTab = 'shoes';
    }
    const targetTabBtn = document.querySelector(`.size-guide-tabs .size-tab[onclick*="'${initialTab}'"]`) || document.querySelector('.size-guide-tabs .size-tab');
    switchSizeGuideTab(initialTab, targetTabBtn);
}

function closeSizeGuideModal() {
    const modal = document.getElementById('sizeGuideModalOverlay');
    if (modal) modal.classList.remove('open');
}

function switchSizeGuideTab(tab, btnEl) {
    document.querySelectorAll('.size-guide-tabs .size-tab').forEach(btn => btn.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');

    const container = document.getElementById('sizeGuideContent');
    if (!container) return;

    const guides = {
        men: {
            title: 'جدول قياسات الأزياء الرجالي بالسنتيمتر (قمصان - تيشرتات - سويت شيرت - بناطيل)',
            headers: ['المقاس', 'محيط الصدر (سم)', 'عرض الكتف (سم)', 'الطول (سم)', 'الوزن التقريبي'],
            rows: [
                ['M', '96 - 102 سم', '44 سم', '70 سم', '60 - 72 كجم'],
                ['L', '102 - 108 سم', '46 سم', '72 سم', '72 - 82 كجم'],
                ['XL', '108 - 114 سم', '48 سم', '74 سم', '82 - 92 كجم'],
                ['2XL', '114 - 120 سم', '50 سم', '76 سم', '92 - 104 كجم'],
                ['3XL', '120 - 128 سم', '52 سم', '78 سم', '104 - 118 كجم']
            ]
        },
        women: {
            title: 'جدول قياسات الأزياء الحريمي بالسنتيمتر (فساتين - بلوزات - أطقم كاجوال)',
            headers: ['المقاس', 'محيط الصدر (سم)', 'محيط الخصر (سم)', 'محيط الأرداف (سم)', 'الوزن التقريبي'],
            rows: [
                ['S', '84 - 88 سم', '66 - 70 سم', '90 - 94 سم', '50 - 58 كجم'],
                ['M', '88 - 94 سم', '70 - 76 سم', '94 - 100 سم', '58 - 66 كجم'],
                ['L', '94 - 100 سم', '76 - 82 سم', '100 - 106 سم', '66 - 75 كجم'],
                ['XL', '100 - 108 سم', '82 - 90 سم', '106 - 114 سم', '75 - 86 كجم'],
                ['2XL', '108 - 116 سم', '90 - 98 سم', '114 - 122 سم', '86 - 98 كجم']
            ]
        },
        kids: {
            title: 'جدول قياسات ملابس الأطفال حسب السن والطول بالسنتيمتر',
            headers: ['المقاس / العمر', 'الطول الكلي (سم)', 'محيط الصدر (سم)', 'الوزن التقريبي'],
            rows: [
                ['2 - 3 سنوات', '92 - 98 سم', '52 - 54 سم', '12 - 15 كجم'],
                ['4 - 5 سنوات', '104 - 110 سم', '56 - 58 سم', '16 - 19 كجم'],
                ['6 - 7 سنوات', '116 - 122 سم', '60 - 63 سم', '20 - 24 كجم'],
                ['8 - 9 سنوات', '128 - 134 سم', '65 - 68 سم', '25 - 30 كجم'],
                ['10 - 12 سنة', '140 - 152 سم', '70 - 76 سم', '31 - 42 كجم']
            ]
        },
        shoes: {
            title: 'جدول مقاسات الأحذية والكوتشيات (EU / US / طول القدم)',
            headers: ['المقاس الأوروبي (EU)', 'طول القدم (سم)', 'المقاس الأمريكي (US)'],
            rows: [
                ['40', '25.0 سم', '7.5'],
                ['41', '25.7 سم', '8.0'],
                ['42', '26.4 سم', '8.5 - 9.0'],
                ['43', '27.1 سم', '9.5'],
                ['44', '27.8 سم', '10.0'],
                ['45', '28.5 سم', '11.0']
            ]
        }
    };

    const g = guides[tab] || guides.men;

    container.innerHTML = `
        <div style="font-size: 0.85rem; font-weight: 800; color: #0284c7; margin-bottom: 10px;">${g.title}</div>
        <table class="size-guide-table">
            <thead>
                <tr>
                    ${g.headers.map(h => `<th>${h}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
                ${g.rows.map(r => `<tr>${r.map((c, i) => `<td style="${i === 0 ? 'font-weight:950; color:var(--primary);' : ''}">${c}</td>`).join('')}</tr>`).join('')}
            </tbody>
        </table>
    `;
}

// ==============================================================================
// 💬 مشاركة الموديل على واتساب (WhatsApp Social Share)
// ==============================================================================
function shareCurrentProductWhatsApp() {
    if (!selectedProduct) return;

    let phone = '201000000000';
    try {
        const raw = (typeof BayanIDB !== 'undefined') ? BayanIDB.getItem('bayan_store_settings') : null;
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.whatsapp) {
                phone = String(parsed.whatsapp).replace(/[^0-9]/g, '');
                if (phone.startsWith('01')) phone = '2' + phone;
            }
        }
    } catch (e) { }

    const isFlash = selectedProduct.flashSale && !selectedProduct.flashFrozen;
    const price = (isFlash && selectedProduct.flashPrice > 0) ? selectedProduct.flashPrice : selectedProduct.price;

    const msg = `مرحباً بيان فاشون 👑✨%0Aحابب أستفسر عن هذا الموديل الرائع:%0A%0A🛍️ *${encodeURIComponent(selectedProduct.name)}*%0A💰 السعر: *${price} ج.م*%0A🏷️ كود الموديل: *${encodeURIComponent(selectedProduct.id || '')}*%0A📏 المقاس المفضل: *${encodeURIComponent(activeSelectedSize || 'فري سايز')}*%0A🎨 اللون: *${encodeURIComponent(activeSelectedColor || 'أساسي')}*%0A%0Aهل الموديل متوفر للشحن الفوري؟ 🛵`;

    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
}

// ==============================================================================
// ⭐ محرك تقييمات وآراء العملاء (Customer Reviews & Ratings)
// ==============================================================================
function renderProductReviews(product) {
    const container = document.getElementById('modalProductReviews');
    if (!container || !product) return;

    const storageKey = `bayan_reviews_${product.id}`;
    let reviews = [];
    try {
        const saved = (typeof BayanIDB !== 'undefined') ? BayanIDB.getItem(storageKey) : null;
        if (saved) reviews = JSON.parse(saved);
    } catch (e) { }

    const hasReviews = reviews && reviews.length > 0;
    const avgRating = hasReviews ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1) : null;

    container.innerHTML = `
        <div class="reviews-header">
            <h4><span>⭐</span> آراء وتقييمات المشترين (${hasReviews ? reviews.length : 0})</h4>
            ${hasReviews ? `
                <div class="reviews-score-badge">
                    <span>⭐ ${avgRating}</span>
                    <span style="font-size: 0.78rem; opacity: 0.85;">من 5</span>
                </div>
            ` : ''}
        </div>

        <div class="reviews-list">
            ${hasReviews ? reviews.map(r => `
                <div class="review-item">
                    <div class="review-item-header">
                        <span class="review-author">👤 ${r.author}</span>
                        <div class="review-stars">${'⭐'.repeat(r.rating)}</div>
                    </div>
                    <div class="review-time">${r.date}</div>
                    <div class="review-text">${r.comment}</div>
                </div>
            `).join('') : `
                <div style="text-align: center; padding: 22px 10px; color: #64748b; font-size: 0.85rem; font-weight: 700; background: #f8fafc; border-radius: 10px; border: 1px dashed #cbd5e1;">
                    لا توجد تقييمات مسجلة لهذا الموديل حتى الآن. شاركنا رأيك وكن أول من يقيّم القطعة! ✨
                </div>
            `}
        </div>

        <!-- نموذج إضافة تقييم جديد -->
        <div class="add-review-form">
            <div style="font-size: 0.88rem; font-weight: 900; color: var(--primary); margin-bottom: 8px;">✍️ شاركنا رأيك في الموديل:</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
                <input type="text" id="inpReviewAuthor" class="form-control" placeholder="اسمك الكريم..." style="padding: 8px 12px; font-size: 0.85rem;">
                <select id="inpReviewRating" class="form-control" style="padding: 8px 12px; font-size: 0.85rem;">
                    <option value="5">⭐⭐⭐⭐⭐ ممتاز (5 نجوم)</option>
                    <option value="4">⭐⭐⭐⭐ جيد جداً (4 نجوم)</option>
                    <option value="3">⭐⭐⭐ متوسط (3 نجوم)</option>
                </select>
            </div>
            <textarea id="inpReviewComment" class="form-control" rows="2" placeholder="اكتب تفاصيل تجربتك مع الخامة والمقاس والتوصيل..." style="padding: 8px 12px; font-size: 0.85rem; resize: none; margin-bottom: 8px;"></textarea>
            <button type="button" class="btn-tool-pill" onclick="submitProductReview('${product.id}')" style="background: var(--primary); color: white; border: none; justify-content: center; width: 100%;">
                <span>نشر التقييم فوراً ✨</span>
            </button>
        </div>
    `;
}

function submitProductReview(productId) {
    const authorEl = document.getElementById('inpReviewAuthor');
    const ratingEl = document.getElementById('inpReviewRating');
    const commentEl = document.getElementById('inpReviewComment');

    const author = (authorEl?.value || '').trim();
    const rating = parseInt(ratingEl?.value) || 5;
    const comment = (commentEl?.value || '').trim();

    if (!author || !comment) {
        alert("يرجى كتابة اسمك الكريم ورأيك في الموديل.");
        return;
    }

    const storageKey = `bayan_reviews_${productId}`;
    let reviews = [];
    try {
        const saved = (typeof BayanIDB !== 'undefined') ? BayanIDB.getItem(storageKey) : null;
        if (saved) reviews = JSON.parse(saved);
    } catch (e) { }

    const newRev = {
        author: author,
        rating: rating,
        date: 'الآن',
        comment: comment
    };

    reviews.unshift(newRev);
    if (typeof BayanIDB !== 'undefined') {
        BayanIDB.setItem(storageKey, JSON.stringify(reviews));
    }

    if (selectedProduct && String(selectedProduct.id) === String(productId)) {
        renderProductReviews(selectedProduct);
    }
}

// ==============================================================================
// ✨ محرك نسق إطلالتك الكاملة (Complete The Look Recommendations)
// ==============================================================================
function renderCompleteTheLook(product) {
    const container = document.getElementById('modalCompleteTheLook');
    if (!container || !product) return;

    const all = window.FASHION_PRODUCTS || FASHION_PRODUCTS || [];
    const candidates = all.filter(p => String(p.id) !== String(product.id));
    if (candidates.length === 0) {
        container.style.display = 'none';
        return;
    }

    // إيجاد منتجات من فئات مكملة للإطلالة
    let matching = candidates.filter(p => p.category !== product.category);
    if (matching.length < 2) matching = candidates;

    const lookItems = matching.slice(0, 3);
    if (lookItems.length === 0) {
        container.style.display = 'none';
        return;
    }

    const fallbackImg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Crect fill='%23f1f5f9' width='120' height='120'/%3E%3Ctext fill='%2394a3b8' font-family='sans-serif' font-size='16' dy='6' font-weight='bold' x='50%25' y='50%25' text-anchor='middle'%3E👗 بايان%3C/text%3E%3C/svg%3E";

    container.style.display = 'block';
    container.innerHTML = `
        <div class="complete-look-title">
            <span>✨</span>
            <span>نسق إطلالتك الكاملة مع هذا الموديل:</span>
        </div>
        <div class="complete-look-grid">
            ${lookItems.map(item => `
                <div class="complete-look-card" onclick="openProductModal('${item.id}')">
                    <img src="${item.image || fallbackImg}" alt="${item.name}" class="complete-look-img" loading="lazy" onerror="this.src='${fallbackImg}'">
                    <div class="complete-look-info">
                        <div class="complete-look-name">${item.name}</div>
                        <div class="complete-look-price">${Number(item.price).toFixed(0)} ج.م</div>
                        <button type="button" class="btn-look-add">
                            <span>عرض وتنسيق 👁️</span>
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// ==============================================================================
// ❤️ محرك قائمة الأمنيات والمفضلات (Wishlist Engine)
// ==============================================================================
const WISHLIST_STORAGE_KEY = 'bayan_wishlist';

function getWishlist() {
    try {
        const raw = (typeof BayanIDB !== 'undefined') ? BayanIDB.getItem(WISHLIST_STORAGE_KEY) : null;
        if (raw) return JSON.parse(raw);
    } catch (e) { }
    return [];
}

function saveWishlist(list) {
    try {
        if (typeof BayanIDB !== 'undefined') {
            BayanIDB.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(list));
        }
    } catch (e) { }
    updateWishlistUI();
}

function isProductInWishlist(productId) {
    const list = getWishlist();
    return list.some(id => String(id) === String(productId));
}

function toggleWishlist(productId, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    let list = getWishlist();
    const strId = String(productId);
    const idx = list.findIndex(id => String(id) === strId);

    if (idx > -1) {
        list.splice(idx, 1);
        showWishlistToast("تم إزالة الموديل من المفضلة 💔");
    } else {
        list.push(strId);
        showWishlistToast("تمت إضافة الموديل إلى مفضلتك بنجاح ❤️");
    }

    saveWishlist(list);
    renderProducts();
    if (selectedProduct && String(selectedProduct.id) === strId) {
        updateModalWishlistBtn(strId);
    }
}

function toggleWishlistFromModal() {
    if (!selectedProduct) return;
    toggleWishlist(selectedProduct.id);
}

function updateModalWishlistBtn(productId) {
    const isFav = isProductInWishlist(productId);
    const iconEl = document.getElementById('modalWishlistIcon');
    const textEl = document.getElementById('modalWishlistText');
    const btnEl = document.getElementById('btnModalWishlist');

    if (iconEl) iconEl.textContent = isFav ? '❤️' : '🤍';
    if (textEl) textEl.textContent = isFav ? 'في المفضلة ❤️' : 'إضافة للمفضلة';
    if (btnEl) btnEl.classList.toggle('active', isFav);
}

function updateWishlistUI() {
    const list = getWishlist();
    const count = list.length;

    const badge = document.getElementById('headerWishlistBadge');
    if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'inline-flex' : 'none';
    }

    const tag = document.getElementById('wishlistCountTag');
    if (tag) {
        tag.textContent = `${count} ${count === 1 ? 'موديل' : 'موديلات'}`;
    }

    // إذا كانت نافذة المفضلة مفتوحة نعيد رندرتها
    const modal = document.getElementById('wishlistModalOverlay');
    if (modal && modal.classList.contains('open')) {
        renderWishlistModal();
    }
}

function openWishlistModal() {
    const modal = document.getElementById('wishlistModalOverlay');
    if (!modal) return;
    modal.classList.add('open');
    renderWishlistModal();
}

function closeWishlistModal() {
    const modal = document.getElementById('wishlistModalOverlay');
    if (modal) modal.classList.remove('open');
}

function renderWishlistModal() {
    const container = document.getElementById('wishlistItemsContainer');
    if (!container) return;

    const list = getWishlist();
    const all = window.FASHION_PRODUCTS || FASHION_PRODUCTS || [];
    const favProducts = all.filter(p => list.some(id => String(id) === String(p.id)));

    if (favProducts.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px 20px;">
                <div style="font-size: 3.5rem; margin-bottom: 10px;">❤️🛍️</div>
                <h4 style="font-size: 1.15rem; font-weight: 900; color: var(--primary);">قائمة المفضلة فارغة حالياً</h4>
                <p style="font-size: 0.86rem; color: var(--text-muted); margin: 6px 0 16px;">اضغط على علامة القلب في أي موديل ينال إعجابك لحفظه هنا والرجوع إليه متى شئت!</p>
                <button type="button" onclick="closeWishlistModal()" style="padding: 9px 20px; background: var(--primary); color: white; border: none; border-radius: 999px; font-weight: 900; cursor: pointer; font-family: inherit;">
                    استكشف أجمل الموديلات الآن ✨
                </button>
            </div>
        `;
        return;
    }

    const fallbackImg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Crect fill='%23f1f5f9' width='80' height='80'/%3E%3Ctext fill='%2394a3b8' font-family='sans-serif' font-size='12' dy='4' font-weight='bold' x='50%25' y='50%25' text-anchor='middle'%3E👗 بايان%3C/text%3E%3C/svg%3E";

    container.innerHTML = favProducts.map(p => `
        <div class="wishlist-item-row">
            <img src="${p.image || fallbackImg}" alt="${p.name}" class="wishlist-item-img" onclick="closeWishlistModal(); openProductModal('${p.id}');" onerror="this.src='${fallbackImg}'">
            <div class="wishlist-item-details">
                <div class="wishlist-item-title" onclick="closeWishlistModal(); openProductModal('${p.id}');">${p.name}</div>
                <div class="wishlist-item-price">${Number(p.price).toFixed(0)} ج.م</div>
                <div class="wishlist-item-category">${p.categoryName || getCategoryDisplayName(p.category)}</div>
            </div>
            <div class="wishlist-item-actions">
                <button type="button" class="btn-wishlist-to-cart" onclick="moveWishlistToCart('${p.id}')" title="نقل إلى سلة المشتريات">
                    <span>🛒</span>
                    <span>اختيار وشراء</span>
                </button>
                <button type="button" class="btn-wishlist-remove" onclick="toggleWishlist('${p.id}')" title="حذف من المفضلة">
                    ✕
                </button>
            </div>
        </div>
    `).join('');
}

function moveWishlistToCart(productId) {
    const all = window.FASHION_PRODUCTS || FASHION_PRODUCTS || [];
    const product = all.find(p => String(p.id) === String(productId));
    if (!product) return;

    closeWishlistModal();
    openProductModal(product.id);
}

function showWishlistToast(text) {
    let toast = document.getElementById('bayanWishlistToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'bayanWishlistToast';
        toast.style.cssText = `
            position: fixed;
            bottom: 85px;
            left: 50%;
            transform: translateX(-50%) translateY(20px);
            background: #0f172a;
            color: white;
            padding: 10px 20px;
            border-radius: 999px;
            font-size: 0.88rem;
            font-weight: 800;
            z-index: 999999;
            box-shadow: 0 10px 25px rgba(0,0,0,0.25);
            pointer-events: none;
            opacity: 0;
            transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            font-family: inherit;
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
    }, 2400);
}

// تشغيل عداد المفضلة وتطبيق اللوجو فور تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    if (typeof updateWishlistUI === 'function') {
        updateWishlistUI();
    }
    // تطبيق اللوجو واسم المتجر المحفوظ في IndexedDB فوراً لمنع أي وميض
    try {
        const rawSettings = (typeof BayanIDB !== 'undefined') ? BayanIDB.getItem('bayan_store_settings') : null;
        const saved = JSON.parse(rawSettings || '{}');
        if (saved.storeLogo || saved.storeName) {
            applyStoreLogo(saved.storeLogo, saved.storeName);
        }
        if (saved.storeName) {
            const brandTitle = document.querySelector('.store-brand h1');
            if (brandTitle) brandTitle.textContent = saved.storeName;
            const heroDefTitle = document.getElementById('heroDefaultTitle');
            if (heroDefTitle) heroDefTitle.textContent = saved.storeName;
        }
    } catch (e) { }
});

// ==============================================================================
// 👑 تطبيق وتحديث لوجو المتجر في البانر والهيدر فورياً (Dynamic Store Logo)
// ==============================================================================
function applyStoreLogo(logoUrl, storeName) {
    const heroImg = document.getElementById('heroStoreLogoImg');
    const heroDefault = document.getElementById('heroDefaultLogoBadge');
    const brandIcon = document.querySelector('.store-brand .brand-icon');

    if (logoUrl && typeof logoUrl === 'string' && logoUrl.trim() !== '') {
        if (heroImg) {
            heroImg.src = logoUrl;
            heroImg.style.display = 'block';
        }
        if (heroDefault) {
            heroDefault.style.display = 'none';
        }
        if (brandIcon) {
            brandIcon.innerHTML = `<img src="${logoUrl}" alt="لوجو المتجر" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit;">`;
        }
    } else {
        if (heroImg) {
            heroImg.style.display = 'none';
            heroImg.src = '';
        }
        if (heroDefault) {
            heroDefault.style.display = 'flex';
            if (storeName) {
                const tEl = document.getElementById('heroDefaultTitle');
                if (tEl) tEl.textContent = storeName;
            }
        }
        if (brandIcon) {
            brandIcon.innerHTML = '👑';
        }
    }
}

// الشعار يتم رفعه وتحديده حصرياً من لوحة تحكم التاجر (admin.html) ويسمع في المتجر تلقائياً

// ==============================================================================
// ⚡ 1. الشراء الفوري بنقرة واحدة (1-Click Fast Direct Checkout)
// ==============================================================================
function fastBuyCurrentProduct() {
    if (!selectedProduct) return;

    const isOutOfStock = (selectedProduct.inStock === false) || (selectedProduct.stockQty !== undefined && selectedProduct.stockQty <= 0);
    if (isOutOfStock) {
        alert("⚠️ عذراً، هذا الموديل نفذت كميته من المخزن حالياً.");
        return;
    }

    // 1. إضافة القطعة المختارة حالياً بالمقاس واللون والكمية للسلة
    if (typeof addCurrentProductToCart === 'function') {
        addCurrentProductToCart();
    }

    // 2. إغلاق درج السلة الجانبي فوراً والانتقال مباشرة لنافذة بيانات التوصيل
    if (typeof closeCartDrawer === 'function') {
        closeCartDrawer();
    }
    if (typeof openCheckoutModal === 'function') {
        openCheckoutModal();
    }

    // 3. توجيه المؤشر لحقل الاسم لإنهاء الطلب بأقصى سرعة (في ثوانٍ معدودة)
    setTimeout(() => {
        const nameInp = document.getElementById('chkCustomerName');
        if (nameInp) {
            nameInp.focus();
            nameInp.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 280);
}

// ==============================================================================
// 📱 2. فتح نافذة الموديل المباشر من رابط الباركود / QR Tag (?prod=ID أو #prod-ID)
// ==============================================================================
function checkUrlForProductDirectOpen() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const prodParam = urlParams.get('prod') || urlParams.get('product') || urlParams.get('id');
        let hashParam = null;
        if (window.location.hash) {
            if (window.location.hash.startsWith('#prod-')) {
                hashParam = window.location.hash.replace('#prod-', '');
            } else if (window.location.hash.startsWith('#product-')) {
                hashParam = window.location.hash.replace('#product-', '');
            }
        }

        const targetId = prodParam || hashParam;
        if (!targetId) return;

        function tryOpenTarget(attempts) {
            const prods = window.FASHION_PRODUCTS || FASHION_PRODUCTS || [];
            const match = prods.find(p => String(p.id) === String(targetId) || String(p.firestoreId) === String(targetId));
            if (match) {
                openProductModal(match.id);
            } else if (attempts > 0) {
                setTimeout(() => tryOpenTarget(attempts - 1), 350);
            }
        }

        tryOpenTarget(6);
    } catch (e) {
        console.warn("Direct product open error:", e);
    }
}


