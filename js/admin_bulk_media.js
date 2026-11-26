/**
 * =========================================================================
 * ⚡ استوديو الصور الجماعي + ختم اللوجو + الربط التلقائي بالأصناف والألوان
 *    Bayan Store Merchant Admin - Bulk Studio & Logo Stamper
 * =========================================================================
 */
(function (root) {
    'use strict';

    let bgRemovalLibPromise = null;
    const bulkState = {
        items: [],
        logoDataUrl: '',
        isRunning: false,
        cancelRequested: false
    };

    const KNOWN_COLOR_ALIASES = {
        'اسود': 'اسود', 'أسود': 'اسود', 'black': 'اسود',
        'ابيض': 'ابيض', 'أبيض': 'ابيض', 'white': 'ابيض',
        'اوف وايت': 'اوف وايت', 'أوف وايت': 'اوف وايت', 'off white': 'اوف وايت', 'offwhite': 'اوف وايت',
        'جملي': 'جملي', 'جمل': 'جملي', 'camel': 'جملي',
        'بني': 'بني', 'بنى': 'بني', 'brown': 'بني',
        'بيج': 'بيج', 'beige': 'بيج',
        'كافيه': 'كافيه', 'كافية': 'كافيه', 'cafe': 'كافيه', 'mocha': 'كافيه',
        'نبيتي': 'نبيتي', 'نبيتى': 'نبيتي', 'عنابي': 'نبيتي', 'burgundy': 'نبيتي', 'maroon': 'نبيتي',
        'كحلي': 'كحلي', 'كحلى': 'كحلي', 'ازرق غامق': 'كحلي', 'navy': 'كحلي',
        'رمادي': 'رمادي', 'رمادى': 'رمادي', 'رصاصي': 'رصاصي', 'جراي': 'رمادي', 'gray': 'رمادي', 'grey': 'رمادي',
        'زيتي': 'زيتي', 'زيتى': 'زيتي', 'olive': 'زيتي',
        'اخضر': 'اخضر', 'أخضر': 'اخضر', 'green': 'اخضر',
        'احمر': 'احمر', 'أحمر': 'احمر', 'red': 'احمر',
        'ازرق': 'ازرق', 'أزرق': 'ازرق', 'blue': 'ازرق', 'سماوي': 'سماوي', 'لبني': 'لبني',
        'اصفر': 'اصفر', 'أصفر': 'اصفر', 'yellow': 'اصفر', 'مستردة': 'مستردة', 'مسترده': 'مستردة', 'mustard': 'مستردة',
        'وردي': 'وردي', 'وردى': 'وردي', 'بينك': 'بينك', 'pink': 'بينك', 'كشمير': 'كشمير', 'فوشيا': 'فوشيا',
        'موف': 'موف', 'بنفسجي': 'بنفسجي', 'purple': 'موف',
        'هافان': 'هافان', 'عسلي': 'عسلي', 'عسلى': 'عسلي', 'tan': 'هافان',
        'برتقالي': 'برتقالي', 'اورنج': 'اورنج', 'orange': 'اورنج',
        'سيلفر': 'سيلفر', 'فضي': 'فضي', 'silver': 'فضي',
        'جولد': 'جولد', 'ذهبي': 'ذهبي', 'gold': 'ذهبي',
        'تايجر': 'تايجر', 'نمر': 'تايجر', 'leopard': 'تايجر'
    };

    function normalizeText(str) {
        return String(str || '')
            .replace(/[\u064B-\u065F\u0670]/g, '')
            .replace(/[أإآ]/g, 'ا')
            .replace(/ى/g, 'ي')
            .replace(/ة/g, 'ه')
            .trim()
            .toLowerCase();
    }

    function escapeHtml(str) {
        if (typeof root.escapeAdminHtml === 'function') return root.escapeAdminHtml(str);
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getProductsList() {
        if (typeof root.getBayanAdminProducts === 'function') {
            return root.getBayanAdminProducts() || [];
        }
        try {
            if (typeof adminProductsList !== 'undefined' && Array.isArray(adminProductsList)) {
                return adminProductsList;
            }
        } catch (_) { }
        return [];
    }

    function getShopLogoStorageKey() {
        const shopId = (typeof root.getActiveShopId === 'function') ? root.getActiveShopId() : 'DEFAULT';
        return `bayan_bulk_studio_logo_${shopId}`;
    }

    function extractProductColors(prod) {
        const colors = new Set();
        if (prod && Array.isArray(prod.colors)) {
            prod.colors.forEach(c => {
                const clean = String(c || '').trim();
                if (clean && clean !== 'قياسي' && clean !== 'موحد') colors.add(clean);
            });
        }
        if (prod && prod.variantsStock && typeof prod.variantsStock === 'object') {
            Object.keys(prod.variantsStock).forEach(key => {
                const parts = String(key).split('|');
                if (parts.length >= 2) {
                    const c = String(parts[1] || '').trim();
                    if (c && c !== 'قياسي' && c !== 'موحد') colors.add(c);
                }
            });
        }
        if (prod && prod.colorImages && typeof prod.colorImages === 'object') {
            Object.keys(prod.colorImages).forEach(c => {
                const clean = String(c || '').trim();
                if (clean) colors.add(clean);
            });
        }
        return Array.from(colors);
    }

    function findBestProductMatch(queryRaw, productsList) {
        const qClean = String(queryRaw || '').trim();
        const qNorm = normalizeText(qClean);
        if (!qNorm || !Array.isArray(productsList) || !productsList.length) return null;

        const matchers = [
            (p) => [p.name, p.code, p.barcode, p.pos_id].some(v => v && String(v).trim() === qClean),
            (p) => [p.name, p.code, p.barcode, p.pos_id].some(v => v && normalizeText(v) === qNorm),
            (p) => {
                const stripped = qNorm.replace(/^(?:كود|موديل|صنف|رقم|#)\s*/i, '').trim();
                if (!stripped) return false;
                return [p.name, p.code, p.barcode].some(v => normalizeText(v) === stripped);
            }
        ];

        for (const fn of matchers) {
            const found = productsList.find(fn);
            if (found) return found;
        }
        return null;
    }

    function parseFilenameInfo(filename, productsList) {
        const rawBase = String(filename || '')
            .replace(/\.[^.]+$/, '')
            .replace(/\s*\(\d+\)\s*$/, '')
            .replace(/[_\-\s]+(clean|copy|edited|white|\d+)$/i, (m, g1) => {
                // احتفظ بالأرقام إذا كان الاسم كله مثل "52-1" بعد مطابقة محتملة، فقط أزل اللواحق النصية الصريحة
                return /^\d+$/.test(g1) ? m : '';
            })
            .trim();

        const normalizedFull = normalizeText(rawBase).replace(/[_|\-/]+/g, ' ').replace(/\s+/g, ' ').trim();

        // 1. حاول مطابقة الاسم كاملاً أولاً (لو اسم الصنف نفسه فيه كلمة)
        let directMatch = findBestProductMatch(rawBase, productsList) || findBestProductMatch(normalizedFull, productsList);
        if (directMatch) {
            return { matchedProduct: directMatch, matchedColor: '', productQuery: rawBase };
        }

        // 2. افصل رمز لون أو رقم نسخة مثل "52 اسود" أو "52_جملي_2" أو "52-2"
        let working = normalizedFull.replace(/\s+\d{1,2}$/, '').trim();
        let detectedAlias = '';

        const sortedAliases = Object.keys(KNOWN_COLOR_ALIASES).sort((a, b) => b.length - a.length);
        for (const alias of sortedAliases) {
            const normAlias = normalizeText(alias);
            const escaped = normAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(`(?:^|\\s)${escaped}$`);
            if (re.test(working)) {
                detectedAlias = KNOWN_COLOR_ALIASES[alias];
                working = working.replace(re, '').trim();
                break;
            }
        }

        // أيضاً جرب إزالة لاحقة رقم صورة مثل "52-1" أو "52 1" بعد أو بدون لون
        let productQuery = working.replace(/\s+\d{1,2}$/, '').trim() || rawBase;
        let matched = findBestProductMatch(productQuery, productsList);
        if (!matched && working !== productQuery) {
            matched = findBestProductMatch(working, productsList);
            if (matched) productQuery = working;
        }

        // 3. اذا طابقنا المنتج، نربط اللون بأقرب اسم لون فعلي مسجل داخل المنتج (للحفاظ على الهمزات/الصياغة داخل variantsStock)
        let exactColor = detectedAlias;
        if (matched && detectedAlias) {
            const prodColors = extractProductColors(matched);
            const normDet = normalizeText(detectedAlias);
            const foundProdCol = prodColors.find(c => normalizeText(c) === normDet);
            if (foundProdCol) exactColor = foundProdCol;
        }

        // 4. بحث احتياطي ضد ألوان المنتج مباشرة حتى لو اللون غير موجود في الجدول العام
        if (!matched) {
            const tokens = normalizedFull.split(' ').filter(Boolean);
            if (tokens.length >= 2) {
                const lastTok = tokens[tokens.length - 1];
                const head = tokens.slice(0, -1).join(' ');
                const candidate = findBestProductMatch(head, productsList);
                if (candidate) {
                    const pCols = extractProductColors(candidate);
                    const found = pCols.find(c => normalizeText(c) === lastTok);
                    if (found) {
                        matched = candidate;
                        exactColor = found;
                        productQuery = head;
                    }
                }
            }
        }

        return { matchedProduct: matched || null, matchedColor: exactColor || '', productQuery };
    }

    async function loadBgRemovalLib() {
        if (!bgRemovalLibPromise) {
            bgRemovalLibPromise = import('https://esm.sh/@imgly/background-removal@1.4.5');
        }
        return bgRemovalLibPromise;
    }

    function loadHtmlImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            if (src && !/^data:/i.test(src)) img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('تعذر قراءة الصورة'));
            img.src = src;
        });
    }

    function readBlobAsDataUrl(blobOrFile) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = () => reject(new Error('فشل قراءة الملف'));
            r.readAsDataURL(blobOrFile);
        });
    }

    async function processStudioImage(sourceInput, opts = {}) {
        const size = opts.size || 640;
        const quality = opts.quality || 0.78;
        const squareWhiteBg = opts.squareWhiteBg !== false;
        const removeBg = Boolean(opts.removeBg);
        const logoDataUrl = opts.logoDataUrl || '';
        const logoPos = opts.logoPosition || 'top-right';
        const logoSizePct = Math.max(8, Math.min(35, Number(opts.logoSizePct) || 18));
        const logoMarginPct = Math.max(1, Math.min(10, Number(opts.logoMarginPct) || 3.5));

        let workingSrc = typeof sourceInput === 'string'
            ? sourceInput
            : await readBlobAsDataUrl(sourceInput);

        if (removeBg) {
            try {
                const lib = await loadBgRemovalLib();
                const removeFn = lib.removeBackground || (lib.default && lib.default.removeBackground) || lib.default;
                if (typeof removeFn === 'function') {
                    const transparentBlob = await removeFn(sourceInput, { output: { format: 'image/png', quality: 0.9 } });
                    workingSrc = await readBlobAsDataUrl(transparentBlob);
                }
            } catch (e) {
                console.warn('[BulkMedia] Background removal skipped for item:', e);
            }
        }

        const prodImg = await loadHtmlImage(workingSrc);
        const canvas = document.createElement('canvas');

        if (squareWhiteBg) {
            canvas.width = size;
            canvas.height = size;
        } else {
            const scale = prodImg.width > size ? (size / prodImg.width) : 1;
            canvas.width = Math.max(1, Math.round(prodImg.width * scale));
            canvas.height = Math.max(1, Math.round(prodImg.height * scale));
        }

        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        if (squareWhiteBg) {
            const padRatio = 0.06;
            const maxDim = size * (1 - padRatio * 2);
            const scale = Math.min(maxDim / prodImg.width, maxDim / prodImg.height);
            const drawW = prodImg.width * scale;
            const drawH = prodImg.height * scale;
            const x = (canvas.width - drawW) / 2;
            const y = (canvas.height - drawH) / 2;
            ctx.drawImage(prodImg, x, y, drawW, drawH);
        } else {
            ctx.drawImage(prodImg, 0, 0, canvas.width, canvas.height);
        }

        if (logoDataUrl) {
            try {
                const logoImg = await loadHtmlImage(logoDataUrl);
                const maxLogoW = canvas.width * (logoSizePct / 100);
                const lScale = Math.min(maxLogoW / logoImg.width, maxLogoW / logoImg.height);
                const lw = logoImg.width * lScale;
                const lh = logoImg.height * lScale;
                const marginX = canvas.width * (logoMarginPct / 100);
                const marginY = canvas.height * (logoMarginPct / 100);

                let lx = canvas.width - lw - marginX;
                let ly = marginY;
                if (logoPos === 'top-left') {
                    lx = marginX; ly = marginY;
                } else if (logoPos === 'bottom-right') {
                    lx = canvas.width - lw - marginX; ly = canvas.height - lh - marginY;
                } else if (logoPos === 'bottom-left') {
                    lx = marginX; ly = canvas.height - lh - marginY;
                }
                ctx.drawImage(logoImg, lx, ly, lw, lh);
            } catch (le) {
                console.warn('[BulkMedia] Logo stamp skipped:', le);
            }
        }

        let out = canvas.toDataURL('image/webp', quality);
        if (!out || !out.startsWith('data:image/webp')) {
            out = canvas.toDataURL('image/jpeg', quality);
        }
        return out;
    }

    function mergeProductMedia(existingProd, processedEntries, mode = 'replace') {
        const existingImages = Array.isArray(existingProd.images) && existingProd.images.length
            ? [...existingProd.images]
            : (existingProd.image ? [existingProd.image] : []);
        const existingColorImages = (existingProd.colorImages && typeof existingProd.colorImages === 'object')
            ? { ...existingProd.colorImages }
            : {};
        const existingColors = Array.isArray(existingProd.colors) ? [...existingProd.colors] : [];

        let nextImages = mode === 'append' ? [...existingImages] : [];
        const nextColorImages = mode === 'append' ? existingColorImages : { ...existingColorImages };

        // رتب الصور بحيث تكون الصور الرئيسية (بدون لون) أولاً
        const ordered = [...processedEntries].sort((a, b) => (a.color ? 1 : 0) - (b.color ? 1 : 0));

        for (const entry of ordered) {
            if (!entry || !entry.dataUrl) continue;
            if (nextImages.length < 6) {
                if (!entry.color && mode === 'replace' && nextImages.length > 0 && ordered[0] === entry) {
                    nextImages.unshift(entry.dataUrl);
                } else {
                    nextImages.push(entry.dataUrl);
                }
            }
            if (entry.color) {
                nextColorImages[entry.color] = entry.dataUrl;
                if (!existingColors.some(c => normalizeText(c) === normalizeText(entry.color))) {
                    existingColors.push(entry.color);
                }
            }
        }

        if (!nextImages.length && existingImages.length) {
            nextImages = existingImages;
        }
        nextImages = nextImages.slice(0, 6);

        return {
            image: nextImages[0] || '',
            images: nextImages,
            colorImages: nextColorImages,
            colors: existingColors,
            updatedAt: new Date().toISOString()
        };
    }

    function buildProductOptionsHtml(products, selectedDocId) {
        let html = '<option value="">-- اختر الصنف --</option>';
        for (const p of products) {
            const pid = p.firestoreId || p.id;
            const label = `${p.name || p.code || pid} (${p.price || 0} ج.م)`;
            html += `<option value="${escapeHtml(pid)}"${String(pid) === String(selectedDocId) ? ' selected' : ''}>${escapeHtml(label)}</option>`;
        }
        return html;
    }

    function buildColorOptionsHtml(prod, selectedColor) {
        const prodColors = extractProductColors(prod);
        const allKnown = Array.from(new Set([...prodColors, ...Object.values(KNOWN_COLOR_ALIASES)]));
        let html = '<option value="">👑 صورة عامة / رئيسية</option>';
        if (selectedColor && !allKnown.some(c => c === selectedColor)) {
            html += `<option value="${escapeHtml(selectedColor)}" selected>🎨 ${escapeHtml(selectedColor)}</option>`;
        }
        for (const col of allKnown) {
            html += `<option value="${escapeHtml(col)}"${col === selectedColor ? ' selected' : ''}>🎨 ${escapeHtml(col)}</option>`;
        }
        return html;
    }

    function updateBulkCounts() {
        const total = bulkState.items.length;
        const matched = bulkState.items.filter(it => Boolean(it.productId)).length;
        const elTotal = document.getElementById('bmTotalFilesCount');
        const elMatched = document.getElementById('bmMatchedFilesCount');
        const btnRun = document.getElementById('bmStartUploadBtn');
        if (elTotal) elTotal.textContent = total;
        if (elMatched) elMatched.textContent = matched;
        if (btnRun && !bulkState.isRunning) {
            btnRun.disabled = matched === 0;
            btnRun.innerHTML = `<span>🚀</span><span>تجهيز وحفظ (${matched}) صورة في السحابة</span>`;
        }
    }

    function renderBulkTable() {
        const tbody = document.getElementById('bmItemsTableBody');
        if (!tbody) return;
        const products = getProductsList();

        if (!bulkState.items.length) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:34px; color:#64748b; font-weight:800;">📂 اختر صور المنتجات من جهازك أو اسحب دفعة من المتجر لتظهر هنا للمراجعة الفورية</td></tr>`;
            updateBulkCounts();
            return;
        }

        tbody.innerHTML = bulkState.items.map((it, idx) => {
            const prod = products.find(p => String(p.firestoreId || p.id) === String(it.productId));
            const statusBadge = it.done
                ? '<span style="background:#dcfce7;color:#166534;padding:3px 8px;border-radius:8px;font-size:0.74rem;font-weight:900;">✅ تم الحفظ</span>'
                : (it.error
                    ? `<span style="background:#fee2e2;color:#991b1b;padding:3px 8px;border-radius:8px;font-size:0.74rem;font-weight:900;" title="${escapeHtml(it.error)}">❌ خطأ</span>`
                    : (prod
                        ? '<span style="background:#ecfdf5;color:#047857;padding:3px 8px;border-radius:8px;font-size:0.74rem;font-weight:900;">جاهز ⚡</span>'
                        : '<span style="background:#fef3c7;color:#92400e;padding:3px 8px;border-radius:8px;font-size:0.74rem;font-weight:900;">اختر الصنف</span>'));

            return `
                <tr data-bm-idx="${idx}" style="border-bottom:1px solid #e2e8f0; background:${prod ? '#ffffff' : '#fffbeb'};">
                    <td style="padding:8px; text-align:center;">
                        <img src="${escapeHtml(it.previewUrl)}" style="width:50px; height:50px; object-fit:cover; border-radius:10px; border:1px solid #cbd5e1; background:#fff;">
                    </td>
                    <td style="padding:8px; font-weight:800; font-size:0.8rem; color:#0f172a; max-width:170px; word-break:break-word;">
                        ${escapeHtml(it.label)}
                    </td>
                    <td style="padding:8px;">
                        <select class="filter-select" style="width:100%; min-width:170px; font-weight:800; font-size:0.8rem;" onchange="window.BayanBulkMedia.setItemProduct(${idx}, this.value)">
                            ${buildProductOptionsHtml(products, it.productId)}
                        </select>
                    </td>
                    <td style="padding:8px;">
                        <select class="filter-select" style="width:100%; min-width:140px; font-weight:800; font-size:0.8rem;" onchange="window.BayanBulkMedia.setItemColor(${idx}, this.value)">
                            ${buildColorOptionsHtml(prod, it.color)}
                        </select>
                    </td>
                    <td style="padding:8px; text-align:center;">${statusBadge}</td>
                    <td style="padding:8px; text-align:center;">
                        <button type="button" onclick="window.BayanBulkMedia.removeItem(${idx})" style="background:#fee2e2;color:#b91c1c;border:none;border-radius:8px;padding:4px 9px;font-weight:900;cursor:pointer;">✕</button>
                    </td>
                </tr>`;
        }).join('');

        updateBulkCounts();
    }

    function updateLogoPreviewBox() {
        const preview = document.getElementById('bmLogoPreviewImg');
        const emptyMsg = document.getElementById('bmLogoEmptyText');
        const removeBtn = document.getElementById('bmRemoveLogoBtn');
        if (preview && emptyMsg) {
            if (bulkState.logoDataUrl) {
                preview.src = bulkState.logoDataUrl;
                preview.style.display = 'block';
                emptyMsg.style.display = 'none';
                if (removeBtn) removeBtn.style.display = 'inline-flex';
            } else {
                preview.style.display = 'none';
                emptyMsg.style.display = 'inline';
                if (removeBtn) removeBtn.style.display = 'none';
            }
        }
    }

    function getCurrentStudioOptions() {
        return {
            logoDataUrl: bulkState.logoDataUrl || '',
            logoPosition: document.getElementById('bmLogoPos')?.value || 'top-right',
            logoSizePct: Number(document.getElementById('bmLogoSizePct')?.value) || 18,
            logoMarginPct: Number(document.getElementById('bmLogoMarginPct')?.value) || 3.5,
            squareWhiteBg: Boolean(document.getElementById('bmChkSquareWhite')?.checked),
            removeBg: Boolean(document.getElementById('bmChkRemoveBg')?.checked),
            mode: document.getElementById('bmSaveMode')?.value || 'replace'
        };
    }

    async function refreshSamplePreview() {
        const box = document.getElementById('bmSamplePreviewBox');
        const imgEl = document.getElementById('bmSamplePreviewImg');
        if (!box || !imgEl || !bulkState.items.length) return;
        const first = bulkState.items[0];
        box.style.display = 'flex';
        try {
            const opts = getCurrentStudioOptions();
            opts.removeBg = false; // للمعاينة السريعة بدون انتظار تحميل مكتبة AI
            const out = await processStudioImage(first.source, opts);
            imgEl.src = out;
        } catch (_) { }
    }

    function handleLocalFilesSelected(fileList) {
        const files = Array.from(fileList || []).filter(f => f && f.type && f.type.startsWith('image/'));
        if (!files.length) return;
        const products = getProductsList();

        for (const f of files) {
            const parsed = parseFilenameInfo(f.name, products);
            const previewUrl = URL.createObjectURL(f);
            bulkState.items.push({
                label: f.name,
                source: f,
                previewUrl,
                productId: parsed.matchedProduct ? (parsed.matchedProduct.firestoreId || parsed.matchedProduct.id) : '',
                color: parsed.matchedColor || '',
                done: false,
                error: ''
            });
        }
        renderBulkTable();
        refreshSamplePreview();
    }

    function loadExistingProductsIntoStudio(batchLimit = 50, onlyWithoutLogoMode = false) {
        const products = getProductsList();
        const searchQ = normalizeText(document.getElementById('bmCloudFilterInput')?.value || '');
        let candidates = products.filter(p => {
            const hasImgs = (Array.isArray(p.images) && p.images.some(Boolean)) || Boolean(p.image);
            if (!hasImgs) return false;
            if (!searchQ) return true;
            return normalizeText(p.name).includes(searchQ) || normalizeText(p.code).includes(searchQ);
        });

        const offsetVal = Math.max(0, parseInt(document.getElementById('bmCloudOffsetInput')?.value || '0', 10) || 0);
        if (offsetVal > 0) candidates = candidates.slice(offsetVal);
        if (batchLimit > 0) candidates = candidates.slice(0, batchLimit);

        let added = 0;
        for (const p of candidates) {
            const pid = p.firestoreId || p.id;
            const cMap = (p.colorImages && typeof p.colorImages === 'object') ? p.colorImages : {};
            const imgToCol = new Map();
            Object.keys(cMap).forEach(col => {
                if (cMap[col]) imgToCol.set(cMap[col], col);
            });
            const imgs = (Array.isArray(p.images) && p.images.length) ? p.images.filter(Boolean) : (p.image ? [p.image] : []);
            imgs.forEach((src, i) => {
                if (onlyWithoutLogoMode && i > 0 && !imgToCol.has(src)) return;
                bulkState.items.push({
                    label: `${p.name || pid}${imgToCol.has(src) ? ' - ' + imgToCol.get(src) : ' (صورة ' + (i + 1) + ')'}`,
                    source: src,
                    previewUrl: src,
                    productId: pid,
                    color: imgToCol.get(src) || '',
                    done: false,
                    error: ''
                });
                added++;
            });
        }

        renderBulkTable();
        refreshSamplePreview();
        if (typeof root.showFastSaveToast === 'function') {
            root.showFastSaveToast(`📥 تم سحب ${added} صورة من منتجات المتجر الحالية بنجاح!`);
        }
    }

    async function runBulkStudioUpload() {
        if (bulkState.isRunning) return;
        const db = (typeof root.getBayanDb === 'function') ? root.getBayanDb() : null;
        if (!db) {
            alert('⚠️ غير متصل بقاعدة بيانات السحابة حالياً');
            return;
        }
        const matchedItems = bulkState.items.filter(it => Boolean(it.productId) && !it.done);
        if (!matchedItems.length) {
            alert('⚠️ لا توجد صور مربوطة بمنتجات جاهزة للرفع!');
            return;
        }

        const opts = getCurrentStudioOptions();
        const products = getProductsList();
        const progressEl = document.getElementById('bmProgressBar');
        const statusEl = document.getElementById('bmProgressText');
        const runBtn = document.getElementById('bmStartUploadBtn');

        bulkState.isRunning = true;
        bulkState.cancelRequested = false;
        if (runBtn) {
            runBtn.disabled = true;
            runBtn.innerHTML = '<span>⏳</span><span>جاري المعالجة والرفع...</span>';
        }

        // تجميع الصور حسب المنتج لتقليل عدد كتابات Firestore وحفظ كل منتج مرة واحدة نظيفة
        const byProduct = new Map();
        for (const it of matchedItems) {
            const key = String(it.productId);
            if (!byProduct.has(key)) byProduct.set(key, []);
            byProduct.get(key).push(it);
        }

        let processedFiles = 0;
        let savedProducts = 0;
        const totalFiles = matchedItems.length;

        try {
            const prodKeys = Array.from(byProduct.keys());
            for (const pid of prodKeys) {
                if (bulkState.cancelRequested) break;
                const prod = products.find(p => String(p.firestoreId || p.id) === pid);
                const group = byProduct.get(pid) || [];
                if (!prod || !prod.firestoreId) {
                    group.forEach(g => { g.error = 'المنتج غير محفوظ في السحابة'; });
                    processedFiles += group.length;
                    continue;
                }

                const processedEntries = [];
                for (const item of group) {
                    if (bulkState.cancelRequested) break;
                    try {
                        if (statusEl) {
                            statusEl.textContent = `⚡ معالجة (${processedFiles + 1}/${totalFiles}): ${item.label}`;
                        }
                        const dataUrl = await processStudioImage(item.source, opts);
                        processedEntries.push({ dataUrl, color: item.color || '', item });
                    } catch (err) {
                        item.error = err && err.message ? err.message : 'فشل المعالجة';
                    }
                    processedFiles++;
                    if (progressEl) {
                        progressEl.style.width = `${Math.round((processedFiles / totalFiles) * 100)}%`;
                    }
                }

                if (processedEntries.length) {
                    const merged = mergeProductMedia(prod, processedEntries, opts.mode);
                    await db.collection('products').doc(prod.firestoreId).set(merged, { merge: true });
                    Object.assign(prod, merged);
                    processedEntries.forEach(pe => { pe.item.done = true; pe.item.error = ''; });
                    savedProducts++;
                }
            }

            if (typeof BayanIDB !== 'undefined' && typeof BayanIDB.saveAllProducts === 'function') {
                await BayanIDB.saveAllProducts(products).catch(() => { });
            }
            if (typeof root.filterAdminProducts === 'function') root.filterAdminProducts();
            if (typeof root.updateProductsStats === 'function') root.updateProductsStats();
            if (root.BayanAdminVisibility && typeof root.BayanAdminVisibility.bumpCatalogVersionInCloud === 'function') {
                root.BayanAdminVisibility.bumpCatalogVersionInCloud(true);
            }

            if (statusEl) {
                statusEl.textContent = `✅ اكتمل بنجاح! تم تحديث ${savedProducts} منتج (${processedFiles} صورة) في السحابة.`;
            }
            if (typeof root.showFastSaveToast === 'function') {
                root.showFastSaveToast(`✅ تم تحديث ${savedProducts} منتج بنجاح في السحابة!`);
            }
        } catch (err) {
            console.error('[BulkMedia] Upload failed:', err);
            alert('❌ حدث خطأ أثناء الحفظ الجماعي: ' + (err && err.message ? err.message : err));
        } finally {
            bulkState.isRunning = false;
            renderBulkTable();
        }
    }

    function openBulkMediaStudioModal() {
        try {
            const savedLogo = localStorage.getItem(getShopLogoStorageKey()) || '';
            if (savedLogo) bulkState.logoDataUrl = savedLogo;
        } catch (_) { }

        let modal = document.getElementById('bayanBulkMediaStudioModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'bayanBulkMediaStudioModal';
            modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,0.85);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:12px;direction:rtl;font-family:Cairo,sans-serif;';
            modal.innerHTML = `
                <div style="background:#ffffff;border-radius:22px;width:96vw;max-width:1160px;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,0.45);">
                    <div style="padding:14px 20px;background:linear-gradient(135deg,#0f172a,#047857);color:#fff;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                        <div>
                            <div style="font-size:1.12rem;font-weight:900;">⚡ استوديو الصور الجماعي + ختم اللوجو التلقائي</div>
                            <div style="font-size:0.8rem;opacity:0.9;">ارفع عشرات الصور دفعة واحدة بالاسم واللون (مثال: <code>52 اسود</code>)، أو اسحب صور المتجر الحالية لختم اللوجو أعلى اليمين!</div>
                        </div>
                        <button type="button" onclick="document.getElementById('bayanBulkMediaStudioModal').style.display='none'" style="background:rgba(255,255,255,0.2);border:none;color:#fff;width:36px;height:36px;border-radius:10px;font-size:18px;font-weight:900;cursor:pointer;">✕</button>
                    </div>

                    <div style="padding:14px 18px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;align-items:start;">
                        <!-- إعدادات اللوجو -->
                        <div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;padding:12px;">
                            <div style="font-weight:900;font-size:0.88rem;color:#0f172a;margin-bottom:8px;">🏷️ ١. لوجو المحل والختم التلقائي</div>
                            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
                                <div style="width:52px;height:52px;border-radius:12px;border:1.5px dashed #94a3b8;display:flex;align-items:center;justify-content:center;background:#f8fafc;overflow:hidden;">
                                    <img id="bmLogoPreviewImg" style="width:100%;height:100%;object-fit:contain;display:none;">
                                    <span id="bmLogoEmptyText" style="font-size:0.7rem;color:#64748b;font-weight:800;text-align:center;">بدون لوجو</span>
                                </div>
                                <label class="btn-primary-action" style="background:#0f172a;border-color:#0f172a;padding:7px 12px;font-size:0.8rem;cursor:pointer;margin:0;">
                                    <span>🖼️ اختيار اللوجو</span>
                                    <input type="file" accept="image/*" style="display:none;" onchange="window.BayanBulkMedia.handleLogoSelected(event)">
                                </label>
                                <button type="button" id="bmRemoveLogoBtn" onclick="window.BayanBulkMedia.clearLogo()" style="display:none;background:#fee2e2;color:#b91c1c;border:none;border-radius:8px;padding:6px 10px;font-weight:800;font-size:0.78rem;cursor:pointer;">حذف</button>
                            </div>
                            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">
                                <select id="bmLogoPos" class="filter-select" style="font-size:0.78rem;font-weight:800;" onchange="window.BayanBulkMedia.refreshPreview()">
                                    <option value="top-right">↖️ أعلى اليمين</option>
                                    <option value="top-left">↗️ أعلى اليسار</option>
                                    <option value="bottom-right">↙️ أسفل اليمين</option>
                                    <option value="bottom-left">↘️ أسفل اليسار</option>
                                </select>
                                <input type="number" id="bmLogoSizePct" class="form-control" value="18" min="8" max="35" title="حجم اللوجو %" style="font-size:0.78rem;font-weight:800;" onchange="window.BayanBulkMedia.refreshPreview()">
                                <input type="number" id="bmLogoMarginPct" class="form-control" value="3.5" min="1" max="10" step="0.5" title="الهامش %" style="font-size:0.78rem;font-weight:800;" onchange="window.BayanBulkMedia.refreshPreview()">
                            </div>
                        </div>

                        <!-- إعدادات الخلفية ووضع الحفظ -->
                        <div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;padding:12px;">
                            <div style="font-weight:900;font-size:0.88rem;color:#0f172a;margin-bottom:8px;">🎨 ٢. الخلفية ونظام الربط</div>
                            <label style="display:flex;align-items:center;gap:8px;font-weight:800;font-size:0.8rem;color:#0f172a;cursor:pointer;margin-bottom:6px;">
                                <input type="checkbox" id="bmChkSquareWhite" checked style="width:17px;height:17px;accent-color:#059669;" onchange="window.BayanBulkMedia.refreshPreview()">
                                <span>⬜ توحيد المقاس بمربع أبيض نقي (#FFFFFF)</span>
                            </label>
                            <label style="display:flex;align-items:center;gap:8px;font-weight:800;font-size:0.8rem;color:#047857;cursor:pointer;margin-bottom:8px;">
                                <input type="checkbox" id="bmChkRemoveBg" style="width:17px;height:17px;accent-color:#059669;">
                                <span>✨ تفريغ الخلفية بالـ AI (أبطأ للدفعات الكبيرة)</span>
                            </label>
                            <select id="bmSaveMode" class="filter-select" style="width:100%;font-size:0.8rem;font-weight:800;">
                                <option value="replace">🔄 تحديث/استبدال صور الصنف المختار (موصى به)</option>
                                <option value="append">➕ إضافة فوق الصور الحالية (حتى 6 صور)</option>
                            </select>
                        </div>

                        <!-- جلب الصور + معاينة حية -->
                        <div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;padding:12px;">
                            <div style="font-weight:900;font-size:0.88rem;color:#0f172a;margin-bottom:8px;">📂 ٣. إضافة دفعة الصور</div>
                            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
                                <label class="btn-primary-action" style="flex:1;justify-content:center;background:#059669;border-color:#047857;padding:8px 12px;font-size:0.82rem;cursor:pointer;margin:0;">
                                    <span>📸 اختيار صور من الجهاز</span>
                                    <input type="file" id="bmLocalFilesInp" accept="image/*" multiple style="display:none;" onchange="window.BayanBulkMedia.onFilesPicked(event)">
                                </label>
                                <button type="button" onclick="window.BayanBulkMedia.clearList()" style="background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;border-radius:10px;padding:8px 10px;font-weight:800;font-size:0.78rem;cursor:pointer;">تفريغ القائمة</button>
                            </div>
                            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                                <input type="text" id="bmCloudFilterInput" class="form-control" placeholder="كود/اسم..." style="flex:1;min-width:85px;font-size:0.76rem;padding:5px 8px;">
                                <input type="number" id="bmCloudOffsetInput" class="form-control" value="0" min="0" step="50" title="بداية من منتج رقم..." style="width:68px;font-size:0.76rem;padding:5px 6px;">
                                <button type="button" onclick="window.BayanBulkMedia.loadFromStore(50)" style="background:#0284c7;color:#fff;border:none;border-radius:9px;padding:6px 10px;font-weight:800;font-size:0.76rem;cursor:pointer;">📥 سحب 50 من المتجر</button>
                            </div>
                        </div>
                    </div>

                    <!-- شريط المعاينة والتقدم -->
                    <div style="padding:10px 18px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
                        <div style="display:flex;align-items:center;gap:12px;">
                            <div id="bmSamplePreviewBox" style="display:none;align-items:center;gap:8px;background:#fff;padding:4px 10px;border-radius:10px;border:1px solid #cbd5e1;">
                                <img id="bmSamplePreviewImg" style="width:42px;height:42px;object-fit:contain;border-radius:6px;background:#fff;">
                                <span style="font-size:0.76rem;font-weight:800;color:#047857;">معاينة الختم 👁️</span>
                            </div>
                            <div style="font-size:0.84rem;font-weight:800;color:#0f172a;">
                                إجمالي الصور: <b id="bmTotalFilesCount">0</b> | متطابقة مع أصناف: <b id="bmMatchedFilesCount" style="color:#059669;">0</b>
                            </div>
                        </div>
                        <div style="display:flex;align-items:center;gap:10px;">
                            <button type="button" id="bmStartUploadBtn" onclick="window.BayanBulkMedia.startUpload()" class="btn-primary-action" disabled style="background:linear-gradient(135deg,#059669,#047857);border-color:#047857;font-weight:900;padding:9px 18px;">
                                <span>🚀</span><span>تجهيز وحفظ (0) صورة في السحابة</span>
                            </button>
                        </div>
                    </div>

                    <div style="padding:0 18px;background:#ffffff;">
                        <div style="height:6px;background:#e2e8f0;border-radius:999px;overflow:hidden;margin-top:8px;">
                            <div id="bmProgressBar" style="height:100%;width:0%;background:linear-gradient(90deg,#10b981,#0284c7);transition:width 0.2s;"></div>
                        </div>
                        <div id="bmProgressText" style="font-size:0.78rem;font-weight:800;color:#475569;margin:4px 0 6px;"></div>
                    </div>

                    <div style="flex:1;overflow:auto;padding:0 18px 16px;">
                        <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
                            <thead style="position:sticky;top:0;background:#f8fafc;z-index:2;border-bottom:2px solid #cbd5e1;">
                                <tr style="color:#334155;font-weight:900;text-align:right;">
                                    <th style="padding:9px;text-align:center;">الصورة</th>
                                    <th style="padding:9px;">اسم الملف / المصدر</th>
                                    <th style="padding:9px;">الصنف المرتبط</th>
                                    <th style="padding:9px;">اللون (إن وجد)</th>
                                    <th style="padding:9px;text-align:center;">الحالة</th>
                                    <th style="padding:9px;text-align:center;">حذف</th>
                                </tr>
                            </thead>
                            <tbody id="bmItemsTableBody"></tbody>
                        </table>
                    </div>
                </div>`;
            document.body.appendChild(modal);

            // دعم السحب والإفلات داخل المودال
            modal.addEventListener('dragover', (e) => { e.preventDefault(); });
            modal.addEventListener('drop', (e) => {
                e.preventDefault();
                if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
                    handleLocalFilesSelected(e.dataTransfer.files);
                }
            });
        }

        modal.style.display = 'flex';
        updateLogoPreviewBox();
        renderBulkTable();
    }

    root.openBulkMediaStudioModal = openBulkMediaStudioModal;
    root.BayanBulkMedia = {
        normalizeText,
        parseFilenameInfo,
        extractProductColors,
        mergeProductMedia,
        processStudioImage,
        openModal: openBulkMediaStudioModal,
        onFilesPicked: (e) => {
            handleLocalFilesSelected(e?.target?.files);
            if (e?.target) e.target.value = '';
        },
        handleLogoSelected: async (e) => {
            const file = e?.target?.files?.[0];
            if (!file) return;
            try {
                const raw = await readBlobAsDataUrl(file);
                bulkState.logoDataUrl = raw;
                try { localStorage.setItem(getShopLogoStorageKey(), raw); } catch (_) { }
                updateLogoPreviewBox();
                refreshSamplePreview();
            } catch (err) {
                alert('❌ تعذر قراءة اللوجو: ' + err.message);
            }
            if (e?.target) e.target.value = '';
        },
        clearLogo: () => {
            bulkState.logoDataUrl = '';
            try { localStorage.removeItem(getShopLogoStorageKey()); } catch (_) { }
            updateLogoPreviewBox();
            refreshSamplePreview();
        },
        setItemProduct: (idx, pid) => {
            if (!bulkState.items[idx]) return;
            bulkState.items[idx].productId = pid || '';
            bulkState.items[idx].done = false;
            renderBulkTable();
        },
        setItemColor: (idx, color) => {
            if (!bulkState.items[idx]) return;
            bulkState.items[idx].color = color || '';
            bulkState.items[idx].done = false;
            updateBulkCounts();
        },
        removeItem: (idx) => {
            bulkState.items.splice(idx, 1);
            renderBulkTable();
        },
        clearList: () => {
            if (bulkState.isRunning) return;
            bulkState.items = [];
            const bar = document.getElementById('bmProgressBar');
            const txt = document.getElementById('bmProgressText');
            if (bar) bar.style.width = '0%';
            if (txt) txt.textContent = '';
            renderBulkTable();
        },
        loadFromStore: (limit) => loadExistingProductsIntoStudio(limit, false),
        refreshPreview: () => refreshSamplePreview(),
        startUpload: () => runBulkStudioUpload()
    };
})(typeof window !== 'undefined' ? window : globalThis);
