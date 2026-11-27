/**
 * =========================================================================
 * 🎨 أدوات الصور الاحترافية وشارة «جديد» للوحة تحكم التاجر - بَيَان ستور
 * =========================================================================
 * 1. زر تصوير بالكاميرا مباشرة (capture="environment")
 * 2. تفريغ خلفية صور المنتجات تلقائياً مجاناً داخل المتصفح (Client-Side)
 *    باستخدام @imgly/background-removal + مربع أبيض نقي 1000x1000 (#FFFFFF)
 * 3. شارة «جديد» (isNew) مربوطة بالمتجر الأونلاين فوراً
 * 4. تحديث تلقائي لقائمة ربط الصور بالألوان
 * =========================================================================
 */
(function initAdminMediaTools() {
    if (typeof window === 'undefined') return;

    let bgRemovalModule = null;

    async function loadBgRemovalLib() {
        if (bgRemovalModule) return bgRemovalModule;
        bgRemovalModule = await import('https://esm.sh/@imgly/background-removal@1.4.5');
        return bgRemovalModule;
    }

    async function placeOnWhiteSquareCanvas(blob, size = 1000, paddingRatio = 0.08) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const objUrl = URL.createObjectURL(blob);
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = size;
                    canvas.height = size;
                    const ctx = canvas.getContext('2d');

                    // خلفية بيضاء نقية #FFFFFF
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, size, size);

                    // حساب الأبعاد مع هامش أمان متناسق من جميع الجهات
                    const maxDim = size * (1 - paddingRatio * 2);
                    const scale = Math.min(maxDim / img.width, maxDim / img.height);
                    const drawW = img.width * scale;
                    const drawH = img.height * scale;
                    const offsetX = (size - drawW) / 2;
                    const offsetY = (size - drawH) / 2;

                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

                    canvas.toBlob((outBlob) => {
                        URL.revokeObjectURL(objUrl);
                        if (!outBlob) return reject(new Error('Canvas toBlob failed'));
                        resolve(outBlob);
                    }, 'image/jpeg', 0.92);
                } catch (err) {
                    URL.revokeObjectURL(objUrl);
                    reject(err);
                }
            };
            img.onerror = (err) => {
                URL.revokeObjectURL(objUrl);
                reject(err);
            };
            img.src = objUrl;
        });
    }

    async function processFileWithBgRemoval(file, statusEl) {
        try {
            if (statusEl) {
                statusEl.style.display = 'flex';
                statusEl.innerHTML = '<span>✨ جاري تفريغ الخلفية وتجهيز الصورة (1000×1000 أبيض نقي)... قد يستغرق التحميل الأول بضع ثوانٍ</span>';
            }
            const lib = await loadBgRemovalLib();
            const removeFn = lib.removeBackground || (lib.default && lib.default.removeBackground) || lib.default;
            if (typeof removeFn !== 'function') throw new Error('removeBackground function not found');

            const transparentBlob = await removeFn(file, {
                output: { format: 'image/png', quality: 0.9 }
            });
            const whiteSquareBlob = await placeOnWhiteSquareCanvas(transparentBlob, 1000, 0.08);
            const cleanName = (file.name || 'product.jpg').replace(/\.[^.]+$/, '') + '_clean.jpg';
            return new File([whiteSquareBlob], cleanName, { type: 'image/jpeg' });
        } catch (err) {
            console.warn('[AdminMediaTools] Background removal fallback to original image:', err);
            return file;
        }
    }

    function injectControlsIntoProductModal() {
        const fileInput = document.getElementById('inpProdFiles');
        if (!fileInput || document.getElementById('inpProdCamera')) return;

        const btnRow = fileInput.parentElement;
        if (btnRow) {
            // 1. زر التصوير بالكاميرا مباشرة
            const camInput = document.createElement('input');
            camInput.type = 'file';
            camInput.id = 'inpProdCamera';
            camInput.accept = 'image/*';
            camInput.setAttribute('capture', 'environment');
            camInput.style.display = 'none';
            camInput.onchange = (e) => {
                if (typeof window.handleMultipleImagesUpload === 'function') {
                    window.handleMultipleImagesUpload(e);
                }
            };

            const camBtn = document.createElement('button');
            camBtn.type = 'button';
            camBtn.className = 'btn-card-action';
            camBtn.style.cssText = 'background:#059669; color:#ffffff; border-color:#059669; font-weight:900;';
            camBtn.innerHTML = '<span>📷 تصوير بالكاميرا مباشرة</span>';
            camBtn.onclick = () => openLiveCameraModal(camInput);

            btnRow.appendChild(camInput);
            btnRow.appendChild(camBtn);

            // 2. خيار تفريغ الخلفية تلقائياً (غير مفعّل افتراضياً) + شريط الحالة
            const bgBox = document.createElement('div');
            bgBox.style.cssText = 'width:100%; margin-top:8px; padding:10px 12px; background:#f0fdf4; border:1.5px solid #a7f3d0; border-radius:12px;';
            bgBox.innerHTML = `
                <label style="display:flex; align-items:center; gap:9px; cursor:pointer; font-weight:800; font-size:0.84rem; color:#065f46; margin:0;">
                    <input type="checkbox" id="chkAutoRemoveBg" style="width:18px; height:18px; accent-color:#059669; cursor:pointer;">
                    <span>✨ تفريغ الخلفية وتحويلها لخلفية بيضاء احترافية تلقائياً (1000×1000 مجاناً داخل المتصفح)</span>
                </label>
                <div id="bgRemovalStatusBar" style="display:none; margin-top:8px; padding:8px 10px; background:#ffffff; border:1px solid #6ee7b7; border-radius:8px; color:#047857; font-size:0.8rem; font-weight:800; align-items:center; gap:8px;"></div>
            `;
            btnRow.parentElement.insertBefore(bgBox, btnRow.nextSibling);
        }

        // 3. خيار شارة «جديد» (NEW Badge) على المنتج
        const descInput = document.getElementById('inpProdDesc');
        if (descInput && !document.getElementById('inpProdIsNew')) {
            const newBadgeGroup = document.createElement('div');
            newBadgeGroup.className = 'form-group';
            newBadgeGroup.style.cssText = 'background:#fff1f2; border:1.5px solid #fecdd3; border-radius:12px; padding:10px 14px; margin-bottom:12px;';
            newBadgeGroup.innerHTML = `
                <label style="display:flex; align-items:center; gap:10px; cursor:pointer; font-weight:900; font-size:0.88rem; color:#be123c; margin:0;">
                    <input type="checkbox" id="inpProdIsNew" style="width:19px; height:19px; accent-color:#e11d48; cursor:pointer;">
                    <span>🔥 إظهار شارة «جديد» على هذا المنتج في المتجر الأونلاين</span>
                </label>
            `;
            descInput.parentElement.parentElement.insertBefore(newBadgeGroup, descInput.parentElement);
        }

        // 4. تحديث تلقائي لقائمة ربط الصور بالألوان عند تعديل الألوان المخصصة
        const customColorsInp = document.getElementById('inpCustomColors');
        if (customColorsInp && !customColorsInp._spColorHooked) {
            customColorsInp._spColorHooked = true;
            customColorsInp.addEventListener('input', () => {
                if (typeof window.renderAdminGallery === 'function') window.renderAdminGallery();
            });
        }
    }

    function hookImageUploadForBgRemoval() {
        const origUpload = window.handleMultipleImagesUpload;
        if (typeof origUpload !== 'function' || origUpload._bgRemovalHooked) return;

        const wrappedUpload = async function (event) {
            const files = event && event.target && event.target.files ? Array.from(event.target.files) : [];
            const chk = document.getElementById('chkAutoRemoveBg');
            const statusEl = document.getElementById('bgRemovalStatusBar');

            if (!files.length || !chk || !chk.checked) {
                return origUpload.call(this, event);
            }

            const processedFiles = [];
            for (let i = 0; i < files.length; i++) {
                const f = files[i];
                if (statusEl) {
                    statusEl.style.display = 'flex';
                    statusEl.innerHTML = `<span>✨ جاري تفريغ خلفية الصورة (${i + 1} من ${files.length}) وتجهيزها بحجم 1000×1000...</span>`;
                }
                const outFile = await processFileWithBgRemoval(f, statusEl);
                processedFiles.push(outFile);
            }

            if (statusEl) {
                statusEl.innerHTML = '<span>✅ تم تفريغ الخلفية وتجهيز الصور بنجاح!</span>';
                setTimeout(() => { statusEl.style.display = 'none'; }, 2800);
            }

            // تمرير الملفات المجهزة إلى دالة الرفع الأصلية
            const fakeEvent = {
                target: {
                    files: processedFiles,
                    value: ''
                }
            };
            if (event && event.target) {
                try { event.target.value = ''; } catch (e) { }
            }
            return origUpload.call(this, fakeEvent);
        };
        wrappedUpload._bgRemovalHooked = true;
        window.handleMultipleImagesUpload = wrappedUpload;
    }

    function hookIsNewBadgeState() {
        // ربط فتح المودال لقراءة حالة isNew للمنتج عند التعديل
        const origEdit = window.editProduct;
        if (typeof origEdit === 'function' && !origEdit._isNewHooked) {
            const wrappedEdit = function (id) {
                const res = origEdit.apply(this, arguments);
                setTimeout(() => {
                    const chk = document.getElementById('inpProdIsNew');
                    if (chk && Array.isArray(window.allProducts)) {
                        const prod = window.allProducts.find(p => String(p.id) === String(id));
                        chk.checked = Boolean(prod && prod.isNew);
                    }
                }, 60);
                return res;
            };
            wrappedEdit._isNewHooked = true;
            window.editProduct = wrappedEdit;
        }

        // عند إضافة منتج جديد تصفير الـ Checkbox
        const origOpenAdd = window.openAddProductModal;
        if (typeof origOpenAdd === 'function' && !origOpenAdd._isNewHooked) {
            const wrappedOpenAdd = function () {
                const res = origOpenAdd.apply(this, arguments);
                setTimeout(() => {
                    const chk = document.getElementById('inpProdIsNew');
                    if (chk) chk.checked = false;
                }, 60);
                return res;
            };
            wrappedOpenAdd._isNewHooked = true;
            window.openAddProductModal = wrappedOpenAdd;
        }
    }

    // نافذة الكاميرا الحية (تعمل على الكمبيوتر والموبايل معاً عبر WebRTC getUserMedia)
    async function openLiveCameraModal(fallbackInput) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            if (fallbackInput) fallbackInput.click();
            return;
        }

        const old = document.getElementById('adminLiveCameraModal');
        if (old) old.remove();

        let currentStream = null;
        let facingMode = 'environment';

        const overlay = document.createElement('div');
        overlay.id = 'adminLiveCameraModal';
        overlay.style.cssText = 'position:fixed; inset:0; z-index:999999; background:rgba(2,6,23,0.88); backdrop-filter:blur(6px); display:flex; align-items:center; justify-content:center; padding:16px; direction:rtl; font-family:Cairo,sans-serif;';
        overlay.innerHTML = `
            <div style="background:#0f172a; border:1.5px solid #34d399; border-radius:22px; width:460px; max-width:96vw; overflow:hidden; box-shadow:0 25px 60px rgba(0,0,0,0.65); color:#fff;">
                <div style="padding:14px 18px; background:linear-gradient(135deg,#064e3b,#047857); display:flex; align-items:center; justify-content:space-between;">
                    <span style="font-weight:900; font-size:1rem;">📷 تصوير المنتج بالكاميرا مباشرة</span>
                    <button type="button" id="closeLiveCamBtn" style="background:rgba(255,255,255,0.18); color:#fff; border:none; width:32px; height:32px; border-radius:10px; font-weight:900; cursor:pointer;">✕</button>
                </div>
                <div style="position:relative; background:#000; width:100%; aspect-ratio:1/1; display:flex; align-items:center; justify-content:center; overflow:hidden;">
                    <video id="liveCamVideo" autoplay playsinline muted style="width:100%; height:100%; object-fit:cover;"></video>
                    <div id="liveCamMsg" style="position:absolute; color:#a7f3d0; font-weight:800; font-size:0.86rem; text-align:center; padding:12px;">جاري تشغيل الكاميرا...</div>
                </div>
                <div style="padding:14px 18px; display:flex; gap:10px; justify-content:center; background:#0f172a;">
                    <button type="button" id="switchLiveCamBtn" style="background:#1e293b; color:#e2e8f0; border:1px solid #334155; border-radius:12px; padding:10px 14px; font-weight:800; cursor:pointer; font-family:inherit;">🔄 قلب الكاميرا</button>
                    <button type="button" id="captureLiveCamBtn" style="flex:1; background:linear-gradient(135deg,#10b981,#059669); color:#fff; border:none; border-radius:12px; padding:10px 18px; font-weight:900; font-size:0.95rem; cursor:pointer; font-family:inherit;">📸 التقاط وإضافة للمعرض</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        const videoEl = overlay.querySelector('#liveCamVideo');
        const msgEl = overlay.querySelector('#liveCamMsg');

        function stopStream() {
            if (currentStream) {
                currentStream.getTracks().forEach(t => t.stop());
                currentStream = null;
            }
        }

        function closeModal() {
            stopStream();
            overlay.remove();
        }

        async function startCamera() {
            stopStream();
            if (msgEl) { msgEl.style.display = 'block'; msgEl.textContent = 'جاري تشغيل الكاميرا...'; }
            try {
                currentStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 1280 } },
                    audio: false
                });
                videoEl.srcObject = currentStream;
                if (msgEl) msgEl.style.display = 'none';
            } catch (err) {
                console.warn('[AdminMediaTools] Camera error, using file input fallback:', err);
                closeModal();
                if (fallbackInput) fallbackInput.click();
            }
        }

        overlay.querySelector('#closeLiveCamBtn').onclick = closeModal;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
        overlay.querySelector('#switchLiveCamBtn').onclick = () => {
            facingMode = (facingMode === 'environment') ? 'user' : 'environment';
            startCamera();
        };
        overlay.querySelector('#captureLiveCamBtn').onclick = () => {
            if (!videoEl.videoWidth || !videoEl.videoHeight) return;
            const canvas = document.createElement('canvas');
            canvas.width = videoEl.videoWidth;
            canvas.height = videoEl.videoHeight;
            canvas.getContext('2d').drawImage(videoEl, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
                if (!blob) return;
                const capturedFile = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
                closeModal();
                if (typeof window.handleMultipleImagesUpload === 'function') {
                    window.handleMultipleImagesUpload({ target: { files: [capturedFile], value: '' } });
                }
            }, 'image/jpeg', 0.92);
        };

        startCamera();
    }

    function boot() {
        injectControlsIntoProductModal();
        hookImageUploadForBgRemoval();
        hookIsNewBadgeState();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 150));
    } else {
        setTimeout(boot, 150);
    }
})();
