/**
 * =========================================================================
 * ⚡ استوديو الصور الجماعي + ختم اللوجو + فهرس بحث فوري O(1) بالأصناف والألوان
 *    Bayan Store Merchant Admin - Bulk Studio & Logo Stamper (v5.4.5)
 * =========================================================================
 */
(function (root) {
    'use strict';

    let bgRemovalLibPromise = null;
    let nextRowUid = 1;
    let cachedIndexSig = '';
    let cachedIndex = null;

    const bulkState = {
        items: [],
        logoDataUrl: '',
        isRunning: false,
        cancelRequested: false,
        activePickerRowUid: null
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
        'موف': 'موف', 'بنفسجي': 'موف', 'purple': 'موف',
        'هافان': 'هافان', 'عسلي': 'عسلي', 'عسلى': 'عسلي', 'tan': 'هافان',
        'برتقالي': 'برتقالي', 'اورنج': 'اورنج', 'orange': 'اورنج',
        'سيلفر': 'سيلفر', 'فضي': 'فضي', 'silver': 'فضي',
        'جولد': 'جولد', 'ذهبي': 'ذهبي', 'gold': 'ذهبي',
        'تايجر': 'تايجر', 'نمر': 'تايجر', 'leopard': 'تايجر'
    };

    const CORE_COLORS_LIST = ['اسود', 'ابيض', 'جملي', 'بني', 'بيج', 'كافيه', 'نبيتي', 'كحلي', 'رمادي', 'رصاصي', 'زيتي', 'احمر', 'ازرق', 'اخضر', 'كشمير', 'هافان', 'اوف وايت'];

    function normalizeText(str) {
        return String(str || '')
            .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
            .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
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

    /**
     * ⚡ بناء فهرس بحث فوري O(1) للمنتجات بالاسم والكود والباركود والألوان
     */
    function getOrBuildProductIndex(productsList) {
        const list = Array.isArray(productsList) ? productsList : [];
        const first = list[0];
        const last = list[list.length - 1];
        const sig = `${list.length}:${first ? (first.firestoreId || first.id || first.name) : ''}:${last ? (last.firestoreId || last.id || last.name) : ''}`;
        if (cachedIndex && cachedIndexSig === sig) {
            return cachedIndex;
        }

        const exactMap = new Map();
        const byIdMap = new Map();
        const entries = [];

        const addExactKey = (rawKey, prod) => {
            const norm = normalizeText(rawKey);
            if (!norm) return;
            if (!exactMap.has(norm)) exactMap.set(norm, []);
            const arr = exactMap.get(norm);
            if (!arr.includes(prod)) arr.push(prod);
        };

        for (const p of list) {
            const pid = String(p.firestoreId || p.id || '');
            if (pid) byIdMap.set(pid, p);

            addExactKey(p.name, p);
            addExactKey(p.code, p);
            addExactKey(p.barcode, p);
            addExactKey(p.pos_id, p);

            const normName = normalizeText(p.name);
            const normCode = normalizeText(p.code);
            const normBarcode = normalizeText(p.barcode);
            const normCat = normalizeText(`${p.category || ''} ${p.categoryName || ''}`);
            const normColors = normalizeText(extractProductColors(p).join(' '));
            const searchBlob = `${normName} ${normCode} ${normBarcode} ${normCat} ${normColors}`.trim();

            entries.push({
                prod: p,
                normName,
                normCode,
                normBarcode,
                searchBlob
            });
        }

        cachedIndex = { exactMap, byIdMap, entries };
        cachedIndexSig = sig;
        return cachedIndex;
    }

    /**
     * 🔍 بحث مفهرس سريع جداً:
     * - عند تفعيل exactIfMatched (الافتراضي في سحب الكود): لو كتب 2 ووجدنا صنف اسمه "2" يرجع "2" فقط فوراً!
     * - عند البحث الحر: يرتب النتائج: تطابق تام ← يبدأ بـ الكود ← يحتوي على الكود (الأقصر أولاً)
     */
    function searchIndexedProducts(queryRaw, productsList, options = {}) {
        const list = Array.isArray(productsList) ? productsList : [];
        const qNorm = normalizeText(queryRaw);
        const index = getOrBuildProductIndex(list);
        if (!qNorm) return list;

        const exactHits = index.exactMap.get(qNorm) || [];
        if (options.exactOnly) {
            return [...exactHits];
        }
        if (options.exactPreferred !== false && exactHits.length > 0) {
            return [...exactHits];
        }

        const tierExact = new Set(exactHits);
        const tierStarts = [];
        const tierContains = [];

        for (const e of index.entries) {
            if (tierExact.has(e.prod)) continue;
            if (e.normName.startsWith(qNorm) || e.normCode.startsWith(qNorm) || e.normBarcode.startsWith(qNorm)) {
                tierStarts.push(e);
            } else if (e.searchBlob.includes(qNorm)) {
                tierContains.push(e);
            }
        }

        tierStarts.sort((a, b) => a.normName.length - b.normName.length);
        tierContains.sort((a, b) => a.normName.length - b.normName.length);

        const merged = [...exactHits, ...tierStarts.map(e => e.prod), ...tierContains.map(e => e.prod)];
        return options.limit > 0 ? merged.slice(0, options.limit) : merged;
    }

    function findBestProductMatch(queryRaw, productsList) {
        const qNorm = normalizeText(queryRaw);
        if (!qNorm || !Array.isArray(productsList) || !productsList.length) return null;
        const index = getOrBuildProductIndex(productsList);

        const direct = index.exactMap.get(qNorm);
        if (direct && direct.length) return direct[0];

        const stripped = qNorm.replace(/^(?:كود|موديل|صنف|رقم|#)\s*/i, '').trim();
        if (stripped) {
            const strippedHit = index.exactMap.get(stripped);
            if (strippedHit && strippedHit.length) return strippedHit[0];
        }
        return null;
    }

    function parseFilenameInfo(filename, productsList) {
        const rawBase = String(filename || '')
            .replace(/\.[^.]+$/, '')
            .replace(/\s*\(\d+\)\s*$/, '')
            .replace(/[_\-\s]+(clean|copy|edited|white|\d+)$/i, (m, g1) => (/^\d+$/.test(g1) ? m : ''))
            .trim();

        const normalizedFull = normalizeText(rawBase).replace(/[_|\-/]+/g, ' ').replace(/\s+/g, ' ').trim();

        const directMatch = findBestProductMatch(rawBase, productsList) || findBestProductMatch(normalizedFull, productsList);
        if (directMatch) {
            return { matchedProduct: directMatch, matchedColor: '', productQuery: rawBase };
        }

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

        let productQuery = working.replace(/\s+\d{1,2}$/, '').trim() || rawBase;
        let matched = findBestProductMatch(productQuery, productsList);
        if (!matched && working !== productQuery) {
            matched = findBestProductMatch(working, productsList);
            if (matched) productQuery = working;
        }

        let exactColor = detectedAlias;
        if (matched && detectedAlias) {
            const prodColors = extractProductColors(matched);
            const normDet = normalizeText(detectedAlias);
            const foundProdCol = prodColors.find(c => normalizeText(c) === normDet);
            if (foundProdCol) exactColor = foundProdCol;
        }

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

    function dataUrlToBlob(dataUrl) {
        const parts = String(dataUrl).split(',');
        const mimeMatch = (parts[0] || '').match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'image/png';
        const bin = atob(parts[1] || '');
        const len = bin.length;
        const arr = new Uint8Array(len);
        for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
        return new Blob([arr], { type: mime });
    }

    function withTimeout(promise, ms, timeoutMessage) {
        let tid = null;
        return Promise.race([
            promise,
            new Promise((_, reject) => {
                tid = setTimeout(() => reject(new Error(timeoutMessage || 'انتهت المهلة')), ms);
            })
        ]).finally(() => { if (tid) clearTimeout(tid); });
    }

    async function updateChangedProductsInIdb(updatedProducts) {
        if (!Array.isArray(updatedProducts) || !updatedProducts.length) return;
        if (typeof BayanIDB === 'undefined' || typeof BayanIDB.open !== 'function') return;
        try {
            const idb = await BayanIDB.open();
            if (!idb) return;
            await new Promise((resolve) => {
                const tx = idb.transaction('products', 'readwrite');
                const store = tx.objectStore('products');
                for (const p of updatedProducts) {
                    if (p && p.id) store.put(p);
                }
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            });
        } catch (_) { }
    }

    async function loadBgRemovalLib(onStatus) {
        if (!bgRemovalLibPromise) {
            if (typeof onStatus === 'function') onStatus('⬇️ جاري تحميل أداة تفريغ الخلفية (أول مرة فقط)...');
            bgRemovalLibPromise = withTimeout(
                import('https://esm.sh/@imgly/background-removal@1.4.5'),
                35000,
                'استغرق تحميل مكتبة التفريغ وقتاً طويلاً — جرّب بدون AI أو أعد المحاولة'
            );
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

    /**
     * 🧹 تنظيف بقايا الألفا الشفافة وقص الهوامش الفارغة حول المنتج وتوسيطه بالحجم الكامل
     */
    function cleanAndCropTransparentBounds(img) {
        const w = img.width;
        const h = img.height;
        const tmp = document.createElement('canvas');
        tmp.width = w;
        tmp.height = h;
        const tctx = tmp.getContext('2d');
        tctx.drawImage(img, 0, 0);

        const imgData = tctx.getImageData(0, 0, w, h);
        const d = imgData.data;

        // 1. إزالة الهالات الشفافة المسببة للبقع الرمادية/الزرقاء على الخلفية البيضاء
        let minX = w, minY = h, maxX = -1, maxY = -1;
        let solidCount = 0;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                const a = d[i + 3];
                if (a < 135) {
                    d[i + 3] = 0;
                } else {
                    if (a < 220) {
                        d[i + 3] = Math.min(255, Math.round(((a - 135) / 85) * 255));
                    }
                    solidCount++;
                }
            }
        }

        // 2. إيجاد حدود الكتلة الحقيقية مع تجاهل النقاط الشاردة الصغيرة على الأطراف (row/col density >= 2px)
        const rowHits = new Int32Array(h);
        const colHits = new Int32Array(w);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (d[(y * w + x) * 4 + 3] > 160) {
                    rowHits[y]++;
                    colHits[x]++;
                }
            }
        }
        const minDense = Math.max(2, Math.round(Math.min(w, h) * 0.01));
        for (let y = 0; y < h; y++) {
            if (rowHits[y] >= minDense) {
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
        for (let x = 0; x < w; x++) {
            if (colHits[x] >= minDense) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
            }
        }

        tctx.putImageData(imgData, 0, 0);

        if (solidCount < 100 || maxX <= minX || maxY <= minY) {
            return { canvas: tmp, sx: 0, sy: 0, sw: w, sh: h };
        }

        // هامش صغير 2% حول حدود المنتج المقصوص
        const bw = maxX - minX + 1;
        const bh = maxY - minY + 1;
        const padX = Math.round(bw * 0.02);
        const padY = Math.round(bh * 0.02);
        const sx = Math.max(0, minX - padX);
        const sy = Math.max(0, minY - padY);
        const sw = Math.min(w - sx, bw + padX * 2);
        const sh = Math.min(h - sy, bh + padY * 2);
        return { canvas: tmp, sx, sy, sw, sh };
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
        const onStatus = typeof opts.onStatus === 'function' ? opts.onStatus : null;

        let workingSrc = typeof sourceInput === 'string'
            ? sourceInput
            : await readBlobAsDataUrl(sourceInput);

        let bgRemoved = false;
        if (removeBg) {
            try {
                const lib = await loadBgRemovalLib(onStatus);
                const removeFn = lib.removeBackground || (lib.default && lib.default.removeBackground) || lib.default;
                if (typeof removeFn === 'function') {
                    const bgInput = (typeof workingSrc === 'string' && workingSrc.startsWith('data:'))
                        ? dataUrlToBlob(workingSrc)
                        : sourceInput;
                    if (onStatus) onStatus('✨ جاري تفريغ الخلفية بالـ AI...');
                    const transparentBlob = await withTimeout(
                        removeFn(bgInput, {
                            model: 'small',
                            output: { format: 'image/png', quality: 0.92 },
                            progress: (key, current, total) => {
                                if (onStatus && total > 0) {
                                    const pct = Math.min(100, Math.round((current / total) * 100));
                                    onStatus(`✨ تفريغ الخلفية بالـ AI: ${pct}%`);
                                }
                            }
                        }),
                        60000,
                        'انتهت مهلة تفريغ الـ AI'
                    );
                    workingSrc = await readBlobAsDataUrl(transparentBlob);
                    bgRemoved = true;
                }
            } catch (e) {
                bgRemovalLibPromise = null;
                console.warn('[BulkMedia] Background removal fallback:', e);
                if (onStatus) onStatus(`⚠️ تعذر التفريغ (${e && e.message ? e.message : 'بطء الشبكة'}) — جاري إكمال ختم اللوجو...`);
            }
        }

        const prodImg = await loadHtmlImage(workingSrc);
        const canvas = document.createElement('canvas');

        let drawSource = prodImg;
        let sx = 0, sy = 0, sw = prodImg.width, sh = prodImg.height;
        if (bgRemoved) {
            const cleaned = cleanAndCropTransparentBounds(prodImg);
            drawSource = cleaned.canvas;
            sx = cleaned.sx;
            sy = cleaned.sy;
            sw = cleaned.sw;
            sh = cleaned.sh;
        }

        if (squareWhiteBg) {
            canvas.width = size;
            canvas.height = size;
        } else {
            const scale = sw > size ? (size / sw) : 1;
            canvas.width = Math.max(1, Math.round(sw * scale));
            canvas.height = Math.max(1, Math.round(sh * scale));
        }

        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        if (squareWhiteBg) {
            const padRatio = 0.08;
            const maxDim = size * (1 - padRatio * 2);
            const scale = Math.min(maxDim / sw, maxDim / sh);
            const drawW = sw * scale;
            const drawH = sh * scale;
            const x = (canvas.width - drawW) / 2;
            const y = (canvas.height - drawH) / 2;
            ctx.filter = bgRemoved ? 'contrast(1.06) saturate(1.06) brightness(1.02)' : 'none';
            ctx.drawImage(drawSource, sx, sy, sw, sh, x, y, drawW, drawH);
            ctx.filter = 'none';
        } else {
            ctx.drawImage(drawSource, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
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

    function buildCompactColorOptionsHtml(prod, selectedColor) {
        const prodColors = extractProductColors(prod);
        const list = prodColors.length ? Array.from(new Set([...prodColors, ...CORE_COLORS_LIST])) : CORE_COLORS_LIST;
        let html = '<option value="">👑 رئيسية / عامة</option>';
        if (selectedColor && !list.includes(selectedColor)) {
            html += `<option value="${escapeHtml(selectedColor)}" selected>🎨 ${escapeHtml(selectedColor)}</option>`;
        }
        for (const col of list) {
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

    function renderSingleRowHtml(it, indexObj) {
        const prod = it.productId ? indexObj.byIdMap.get(String(it.productId)) : null;
        const statusBadge = it.done
            ? '<span style="background:#dcfce7;color:#166534;padding:3px 8px;border-radius:8px;font-size:0.74rem;font-weight:900;">✅ تم الحفظ</span>'
            : (it.error
                ? `<span style="background:#fee2e2;color:#991b1b;padding:3px 8px;border-radius:8px;font-size:0.74rem;font-weight:900;" title="${escapeHtml(it.error)}">❌ خطأ</span>`
                : (prod
                    ? '<span style="background:#ecfdf5;color:#047857;padding:3px 8px;border-radius:8px;font-size:0.74rem;font-weight:900;">جاهز ⚡</span>'
                    : '<span style="background:#fef3c7;color:#92400e;padding:3px 8px;border-radius:8px;font-size:0.74rem;font-weight:900;">غير مربوط</span>'));

        const prodTitle = prod ? `${escapeHtml(prod.name || prod.code || prod.firestoreId)} <small style="color:#64748b;">(${prod.price || 0} ج.م)</small>` : '<span style="color:#b45309;">لم يتم اختيار صنف</span>';

        return `
            <tr data-bm-uid="${it.uid}" style="border-bottom:1px solid #e2e8f0; background:${prod ? '#ffffff' : '#fffbeb'};">
                <td style="padding:7px; text-align:center;">
                    <img src="${escapeHtml(it.previewUrl)}" loading="lazy" style="width:48px; height:48px; object-fit:cover; border-radius:10px; border:1px solid #cbd5e1; background:#fff;">
                </td>
                <td style="padding:7px; font-weight:800; font-size:0.79rem; color:#0f172a; max-width:170px; word-break:break-word;">
                    ${escapeHtml(it.label)}
                </td>
                <td style="padding:7px;">
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:9px; padding:5px 8px;">
                        <span style="font-weight:900; font-size:0.8rem; color:#0f172a;">${prodTitle}</span>
                        <button type="button" onclick="window.BayanBulkMedia.openRowPicker(${it.uid})" style="background:#e2e8f0; color:#0f172a; border:none; border-radius:7px; padding:3px 8px; font-weight:800; font-size:0.74rem; cursor:pointer; white-space:nowrap;">تغيير</button>
                    </div>
                </td>
                <td style="padding:7px;">
                    <select class="filter-select" style="width:100%; min-width:130px; font-weight:800; font-size:0.79rem;" onchange="window.BayanBulkMedia.setItemColor(${it.uid}, this.value)">
                        ${buildCompactColorOptionsHtml(prod, it.color)}
                    </select>
                </td>
                <td style="padding:7px; text-align:center;">${statusBadge}</td>
                <td style="padding:7px; text-align:center;">
                    <button type="button" onclick="window.BayanBulkMedia.removeItem(${it.uid})" style="background:#fee2e2;color:#b91c1c;border:none;border-radius:8px;padding:4px 10px;font-weight:900;cursor:pointer;">✕</button>
                </td>
            </tr>`;
    }

    function renderBulkTable() {
        const tbody = document.getElementById('bmItemsTableBody');
        if (!tbody) return;
        const products = getProductsList();
        const indexObj = getOrBuildProductIndex(products);

        if (!bulkState.items.length) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:#64748b; font-weight:800;">📂 اختر صور المنتجات من جهازك أو اكتب كود المنتج (مثلاً <code>2</code>) واضغط سحب!</td></tr>`;
            updateBulkCounts();
            return;
        }

        tbody.innerHTML = bulkState.items.map((it) => renderSingleRowHtml(it, indexObj)).join('');
        updateBulkCounts();
    }

    function removeRowFast(uid) {
        const idx = bulkState.items.findIndex(it => it.uid === uid);
        if (idx === -1) return;
        bulkState.items.splice(idx, 1);

        const rowEl = document.querySelector(`tr[data-bm-uid="${uid}"]`);
        if (rowEl) rowEl.remove();

        if (!bulkState.items.length) {
            renderBulkTable();
        } else {
            updateBulkCounts();
        }
    }

    function openRowProductPicker(uid) {
        bulkState.activePickerRowUid = uid;
        let overlay = document.getElementById('bmProductPickerModal');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'bmProductPickerModal';
            overlay.style.cssText = 'position:fixed;inset:0;z-index:100001;background:rgba(15,23,42,0.75);display:flex;align-items:center;justify-content:center;padding:12px;direction:rtl;font-family:Cairo,sans-serif;';
            overlay.innerHTML = `
                <div style="background:#fff;border-radius:16px;width:440px;max-width:95vw;max-height:78vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,0.4);">
                    <div style="padding:12px 14px;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:space-between;">
                        <span style="font-weight:900;font-size:0.95rem;">🔍 اختيار الصنف (بحث فوري مفهرس)</span>
                        <button type="button" onclick="document.getElementById('bmProductPickerModal').style.display='none'" style="background:rgba(255,255,255,0.2);color:#fff;border:none;width:28px;height:28px;border-radius:8px;font-weight:900;cursor:pointer;">✕</button>
                    </div>
                    <div style="padding:10px;border-bottom:1px solid #e2e8f0;background:#f8fafc;">
                        <input type="text" id="bmPickerSearchInp" class="form-control" placeholder="اكتب اسم الصنف أو الرقم أو الكود..." style="width:100%;font-weight:800;" oninput="window.BayanBulkMedia.renderPickerResults()">
                    </div>
                    <div id="bmPickerResultsBox" style="overflow-y:auto;padding:8px;flex:1;display:flex;flex-direction:column;gap:5px;"></div>
                </div>`;
            overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.style.display = 'none'; });
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'flex';
        const inp = document.getElementById('bmPickerSearchInp');
        if (inp) {
            inp.value = '';
            setTimeout(() => inp.focus(), 40);
        }
        renderPickerResults();
    }

    function renderPickerResults() {
        const box = document.getElementById('bmPickerResultsBox');
        if (!box) return;
        const q = document.getElementById('bmPickerSearchInp')?.value || '';
        const matches = searchIndexedProducts(q, getProductsList(), { exactPreferred: false, limit: 40 });
        if (!matches.length) {
            box.innerHTML = '<div style="text-align:center;padding:20px;color:#64748b;font-weight:800;">لا توجد أصناف مطابقة</div>';
            return;
        }
        box.innerHTML = matches.map(p => {
            const pid = p.firestoreId || p.id;
            return `
                <button type="button" onclick="window.BayanBulkMedia.pickProductForRow('${escapeHtml(pid)}')"
                    style="text-align:right;background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:8px 10px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;font-family:inherit;">
                    <span style="font-weight:900;color:#0f172a;font-size:0.86rem;">${escapeHtml(p.name || p.code || pid)}</span>
                    <span style="font-size:0.76rem;color:#059669;font-weight:800;">${p.price || 0} ج.م</span>
                </button>`;
        }).join('');
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
            opts.removeBg = false;
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
                uid: nextRowUid++,
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

    function loadExistingProductsIntoStudio(batchLimit = 50) {
        const products = getProductsList();
        const searchQ = (document.getElementById('bmCloudFilterInput')?.value || '').trim();
        const exactOnly = Boolean(document.getElementById('bmChkExactSearch')?.checked);

        // عند البحث بالرقم/الكود: الفهرس يعطي التطابق التام مباشرة (مثلاً "2" يجلب منتج 2 فقط!)
        let candidates = searchQ
            ? searchIndexedProducts(searchQ, products, { exactPreferred: true, exactOnly })
            : [...products];

        candidates = candidates.filter(p => (Array.isArray(p.images) && p.images.some(Boolean)) || Boolean(p.image));

        const offsetVal = searchQ ? 0 : Math.max(0, parseInt(document.getElementById('bmCloudOffsetInput')?.value || '0', 10) || 0);
        if (offsetVal > 0) candidates = candidates.slice(offsetVal);
        if (batchLimit > 0) candidates = candidates.slice(0, batchLimit);

        // عند البحث عن كود محدد نبدّل القائمة الحالية بنتيجة البحث النظيفة لتجنب التراكم والبطء
        if (searchQ) {
            bulkState.items = [];
        }

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
                bulkState.items.push({
                    uid: nextRowUid++,
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
            root.showFastSaveToast(added > 0
                ? `⚡ تم سحب ${candidates.length} منتج (${added} صورة) في لحظة!`
                : `⚠️ لم يُعثر على منتجات مطابقة لـ "${searchQ}"`);
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
        const indexObj = getOrBuildProductIndex(products);
        const progressEl = document.getElementById('bmProgressBar');
        const statusEl = document.getElementById('bmProgressText');
        const runBtn = document.getElementById('bmStartUploadBtn');
        const stopBtn = document.getElementById('bmStopUploadBtn');
        const tStart = Date.now();

        opts.onStatus = (msg) => {
            if (statusEl) statusEl.textContent = msg;
        };

        bulkState.isRunning = true;
        bulkState.cancelRequested = false;
        if (runBtn) {
            runBtn.disabled = true;
            runBtn.innerHTML = '<span>⏳</span><span>جاري المعالجة والرفع...</span>';
        }
        if (stopBtn) stopBtn.style.display = 'inline-flex';

        const byProduct = new Map();
        for (const it of matchedItems) {
            const key = String(it.productId);
            if (!byProduct.has(key)) byProduct.set(key, []);
            byProduct.get(key).push(it);
        }

        let processedFiles = 0;
        let savedProducts = 0;
        const modifiedProds = [];
        const totalFiles = matchedItems.length;

        try {
            const prodKeys = Array.from(byProduct.keys());
            for (const pid of prodKeys) {
                if (bulkState.cancelRequested) break;
                const prod = indexObj.byIdMap.get(pid);
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
                            statusEl.textContent = `⚡ (${processedFiles + 1}/${totalFiles}) جاري تجهيز: ${item.label}`;
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
                    if (statusEl) {
                        statusEl.textContent = `☁️ جاري رفع منتج «${prod.name || pid}» للسحابة...`;
                    }
                    const merged = mergeProductMedia(prod, processedEntries, opts.mode);
                    await withTimeout(
                        db.collection('products').doc(prod.firestoreId).set(merged, { merge: true }),
                        25000,
                        'تأخر رد السحابة — تأكد من اتصال الإنترنت وحجم الصور'
                    );
                    Object.assign(prod, merged);
                    modifiedProds.push(prod);
                    processedEntries.forEach(pe => { pe.item.done = true; pe.item.error = ''; });
                    savedProducts++;
                }
            }

            if (modifiedProds.length) {
                await updateChangedProductsInIdb(modifiedProds);
            }
            if (typeof root.filterAdminProducts === 'function') root.filterAdminProducts();
            if (typeof root.updateProductsStats === 'function') root.updateProductsStats();
            if (root.BayanAdminVisibility && typeof root.BayanAdminVisibility.bumpCatalogVersionInCloud === 'function') {
                root.BayanAdminVisibility.bumpCatalogVersionInCloud(true);
            }

            const secs = ((Date.now() - tStart) / 1000).toFixed(1);
            if (statusEl) {
                statusEl.textContent = bulkState.cancelRequested
                    ? `🛑 تم الإيقاف بعد حفظ ${savedProducts} منتج (${secs} ثانية).`
                    : `✅ اكتمل في ${secs} ثانية! تم تحديث ${savedProducts} منتج (${processedFiles} صورة) في السحابة.`;
            }
            if (typeof root.showFastSaveToast === 'function' && savedProducts > 0) {
                root.showFastSaveToast(`✅ تم تحديث ${savedProducts} منتج في ${secs} ثانية!`);
            }
        } catch (err) {
            console.error('[BulkMedia] Upload failed:', err);
            if (statusEl) statusEl.textContent = `❌ خطأ: ${err && err.message ? err.message : err}`;
            alert('❌ حدث خطأ أثناء الحفظ الجماعي: ' + (err && err.message ? err.message : err));
        } finally {
            bulkState.isRunning = false;
            if (stopBtn) stopBtn.style.display = 'none';
            renderBulkTable();
        }
    }

    function openBulkMediaStudioModal() {
        try {
            const savedLogo = localStorage.getItem(getShopLogoStorageKey()) || '';
            if (savedLogo) bulkState.logoDataUrl = savedLogo;
        } catch (_) { }

        // تهيئة الفهرس فور فتح النافذة لضمان سرعة O(1) من أول ثانية
        getOrBuildProductIndex(getProductsList());

        let modal = document.getElementById('bayanBulkMediaStudioModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'bayanBulkMediaStudioModal';
            modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,0.85);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:12px;direction:rtl;font-family:Cairo,sans-serif;';
            modal.innerHTML = `
                <div style="background:#ffffff;border-radius:22px;width:96vw;max-width:1160px;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,0.45);">
                    <div style="padding:14px 20px;background:linear-gradient(135deg,#0f172a,#047857);color:#fff;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                        <div>
                            <div style="font-size:1.12rem;font-weight:900;">⚡ استوديو الصور الجماعي + فهرس بحث فوري (v5.4.7)</div>
                            <div style="font-size:0.8rem;opacity:0.9;">ابحث برقم/اسم المنتج (مثلاً <code>2</code> يجلب <code>2</code> فقط فوراً) أو اسحب دفعة صور من جهازك!</div>
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
                                <span>✨ تفريغ الخلفية بالـ AI (للصور غير البيضاء فقط)</span>
                            </label>
                            <select id="bmSaveMode" class="filter-select" style="width:100%;font-size:0.8rem;font-weight:800;">
                                <option value="replace">🔄 تحديث/استبدال صور الصنف المختار (موصى به)</option>
                                <option value="append">➕ إضافة فوق الصور الحالية (حتى 6 صور)</option>
                            </select>
                        </div>

                        <!-- جلب الصور + البحث المفهرس -->
                        <div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;padding:12px;">
                            <div style="font-weight:900;font-size:0.88rem;color:#0f172a;margin-bottom:8px;">📂 ٣. إضافة أو سحب دفعة الصور</div>
                            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
                                <label class="btn-primary-action" style="flex:1;justify-content:center;background:#059669;border-color:#047857;padding:8px 12px;font-size:0.82rem;cursor:pointer;margin:0;">
                                    <span>📸 اختيار صور من الجهاز</span>
                                    <input type="file" id="bmLocalFilesInp" accept="image/*" multiple style="display:none;" onchange="window.BayanBulkMedia.onFilesPicked(event)">
                                </label>
                                <button type="button" onclick="window.BayanBulkMedia.clearList()" style="background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;border-radius:10px;padding:8px 10px;font-weight:800;font-size:0.78rem;cursor:pointer;">تفريغ القائمة</button>
                            </div>
                            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                                <input type="text" id="bmCloudFilterInput" class="form-control" placeholder="اكتب كود أو اسم (مثلاً 2)..." style="flex:1.4;min-width:110px;font-size:0.78rem;padding:6px 9px;font-weight:800;" onkeydown="if(event.key==='Enter'){event.preventDefault();window.BayanBulkMedia.loadFromStore(50);}">
                                <input type="number" id="bmCloudOffsetInput" class="form-control" value="0" min="0" step="50" title="بداية الدفعة (0، 50، 100...)" style="width:62px;font-size:0.76rem;padding:6px;">
                                <button type="button" onclick="window.BayanBulkMedia.loadFromStore(50)" style="background:#0284c7;color:#fff;border:none;border-radius:9px;padding:7px 11px;font-weight:900;font-size:0.78rem;cursor:pointer;">📥 سحب</button>
                            </div>
                            <label style="display:flex;align-items:center;gap:6px;margin-top:6px;font-size:0.74rem;font-weight:800;color:#475569;cursor:pointer;">
                                <input type="checkbox" id="bmChkExactSearch" checked style="accent-color:#0284c7;">
                                <span>🎯 تطابق تام بالاسم/الكود أولاً (<code>2</code> يجلب <code>2</code> فقط)</span>
                            </label>
                        </div>
                    </div>

                    <!-- شريط المعاينة والتقدم -->
                    <div style="padding:10px 18px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
                        <div style="display:flex;align-items:center;gap:12px;">
                            <div id="bmSamplePreviewBox" style="display:none;align-items:center;gap:8px;background:#fff;padding:4px 10px;border-radius:10px;border:1px solid #cbd5e1;">
                                <img id="bmSamplePreviewImg" style="width:46px;height:46px;object-fit:contain;border-radius:6px;background:#fff;">
                                <span style="font-size:0.76rem;font-weight:800;color:#047857;">معاينة الختم 👁️</span>
                            </div>
                            <div style="font-size:0.84rem;font-weight:800;color:#0f172a;">
                                إجمالي الصور: <b id="bmTotalFilesCount">0</b> | متطابقة مع أصناف: <b id="bmMatchedFilesCount" style="color:#059669;">0</b>
                            </div>
                        </div>
                        <div style="display:flex;align-items:center;gap:10px;">
                            <button type="button" id="bmStopUploadBtn" onclick="window.BayanBulkMedia.stopUpload()" style="display:none;background:#fee2e2;color:#b91c1c;border:1px solid #fecaca;border-radius:10px;padding:9px 14px;font-weight:900;cursor:pointer;">🛑 إيقاف</button>
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
        cleanAndCropTransparentBounds,
        searchIndexedProducts,
        getOrBuildProductIndex,
        parseFilenameInfo,
        extractProductColors,
        mergeProductMedia,
        processStudioImage,
        openModal: openBulkMediaStudioModal,
        openRowPicker: (uid) => openRowProductPicker(uid),
        renderPickerResults: () => renderPickerResults(),
        pickProductForRow: (pid) => {
            const uid = bulkState.activePickerRowUid;
            const it = bulkState.items.find(x => x.uid === uid);
            if (it) {
                it.productId = pid || '';
                it.done = false;
                const overlay = document.getElementById('bmProductPickerModal');
                if (overlay) overlay.style.display = 'none';
                const rowEl = document.querySelector(`tr[data-bm-uid="${uid}"]`);
                if (rowEl) {
                    const tmp = document.createElement('tbody');
                    tmp.innerHTML = renderSingleRowHtml(it, getOrBuildProductIndex(getProductsList()));
                    if (tmp.firstElementChild) rowEl.replaceWith(tmp.firstElementChild);
                    updateBulkCounts();
                } else {
                    renderBulkTable();
                }
            }
        },
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
        setItemColor: (uid, color) => {
            const it = bulkState.items.find(x => x.uid === uid);
            if (!it) return;
            it.color = color || '';
            it.done = false;
            updateBulkCounts();
        },
        removeItem: (uid) => removeRowFast(uid),
        clearList: () => {
            if (bulkState.isRunning) return;
            bulkState.items = [];
            const bar = document.getElementById('bmProgressBar');
            const txt = document.getElementById('bmProgressText');
            if (bar) bar.style.width = '0%';
            if (txt) txt.textContent = '';
            renderBulkTable();
        },
        loadFromStore: (limit) => loadExistingProductsIntoStudio(limit),
        refreshPreview: () => refreshSamplePreview(),
        startUpload: () => runBulkStudioUpload(),
        stopUpload: () => { bulkState.cancelRequested = true; }
    };
})(typeof window !== 'undefined' ? window : globalThis);
