let paymentSaving=false, settingsSaving=false;


    function readStoredList(key) {
        try { const value = JSON.parse(cloudStore.getItem(key) || '[]');
            return Array.isArray(value) ? value : [];
        } catch (e) { console.warn('Unable to read stored list: ' + key, e); return []; }
    }
    function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
    async function fetchWithTimeout(url, options = {}) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try { const response = await fetch(url, {...options, signal: controller.signal});
            if (!response.ok) throw new Error('Request failed: ' + response.status);
            return response;
        } finally { clearTimeout(timer); }
    }
    // ========== System Log Initialization ==========
    let systemLogs = readStoredList('system_logs');
    function addSystemLog(type, message, details) {
        let log = { id: Date.now(), date: new Date().toISOString(), type, message, details: details || '' };
        systemLogs.unshift(log);
        if (systemLogs.length > 200) systemLogs = systemLogs.slice(0, 200);
        cloudStore.setItem('system_logs', JSON.stringify(systemLogs));
    }
    
    function openSystemLogModal() {
        let container = document.getElementById('system-log-list');
        if (container) {
            container.innerHTML = systemLogs.map(log => `
                <div class="p-3 bg-slate-950 border border-slate-800/80 rounded-xl text-[10px] text-slate-300 space-y-1">
                    <div class="flex justify-between font-bold text-slate-400">
                        <span>${escapeHTML(log.type)}</span>
                        <span>${new Date(log.date).toLocaleString()}</span>
                    </div>
                    <div>${escapeHTML(log.message)}</div>
                    <div class="text-[9px] text-slate-500 font-mono">${escapeHTML(log.details)}</div>
                </div>
            `).join('') || '<div class="text-slate-500 py-10 text-center">No administrative events recorded.</div>';
            closeM('settings-modal');
            document.getElementById('system-log-modal').style.display = 'flex';
        }
    }
    
    function clearSystemLog() {
        systemLogs = [];
        cloudStore.setItem('system_logs', JSON.stringify(systemLogs));
        showToast('Administrative Logs Purged', 'success');
        openSystemLogModal();
    }
    
    function exportSystemLogCSV() {
        downloadRowsCSV('system_logs.csv',['Date','Type','Message','Details'],systemLogs.map(r=>[r.date,r.type,r.message,r.details]));
    }
    
    // ========== WAKE LOCK MANAGEMENTS ==========
    let wakeLock = null;
    let screenStateIndicator = null;
    
    async function requestWakeLock() {
        if (!sTime || document.hidden || wakeLock) return false;
        if (!navigator.wakeLock) return false;
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => { wakeLock = null; });
            return true;
        } catch(e) { return false; }
    }
    
    function releaseWakeLock() {
        if (wakeLock) {
            wakeLock.release();
            wakeLock = null;
            showScreenStateIndicator('⚫ SCREEN UNLOCKED (OFF)', 'danger');
            showToast('📱 ස්ක්‍රීන ගිණුම OFF - සාධාරණ ස්ක්‍රීන කාලසීමා යෙදෙයි', 'info');
        }
    }
    
    function showScreenStateIndicator(text, type) {
        const oldIndicator = document.querySelector('[id="screen-state-indicator"]');
        if (oldIndicator) oldIndicator.remove();
        
        if (!sTime) return;
        
        const colors = {
            'success': 'bg-emerald-600 text-white',
            'danger': 'bg-rose-600 text-white',
            'warning': 'bg-amber-600 text-white',
            'info': 'bg-blue-600 text-white'
        };
        
        const indicator = document.createElement('div');
        indicator.id = 'screen-state-indicator';
        indicator.className = `fixed top-4 right-4 px-3 py-2 rounded-lg text-[10px] sm:text-xs font-bold text-center z-50 ${colors[type] || colors.info} transition-all`;
        indicator.innerHTML = text;
        document.body.appendChild(indicator);
        
        setTimeout(() => {
            if (indicator.parentElement) indicator.remove();
        }, 5000);
    }

    // ========== NUMBER TO WORDS (SINHALA/ENGLISH ADAPTER) ==========
    function numberToWords(num) {
        if (num === 0) return "Zero Rupees Only";
        const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
        const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
        function convert(n) {
            if (n < 20) return ones[n];
            if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? " " + ones[n%10] : "");
            if (n < 1000) return ones[Math.floor(n/100)] + " Hundred" + (n%100 ? " " + convert(n%100) : "");
            if (n < 100000) return convert(Math.floor(n/1000)) + " Thousand" + (n%1000 ? " " + convert(n%1000) : "");
            return convert(Math.floor(n/100000)) + " Lakh" + (n%100000 ? " " + convert(n%100000) : "");
        }
        return convert(Math.floor(num)) + " Rupees Only";
    }

    // ========== TOAST NOTIFICATIONS (TOASTS) ==========
    function showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `p-3 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl flex items-center gap-3 text-xs text-white border-l-4 pointer-events-auto animate-bounce ${type === 'success' ? 'border-l-emerald-500' : type === 'error' ? 'border-l-red-500' : 'border-l-blue-500'}`;
        toast.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span><span>${escapeHTML(message)}</span>`;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }
    
    function showLoading(show) {
        document.getElementById('spinnerOverlay').style.display = show ? 'flex' : 'none';
    }

    // ========== Voice Command Support System ==========
    let voiceActive = false, recognition = null;
    function initVoiceRecognition() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            document.getElementById('voiceStatus').innerHTML = '❌ Voice engine not supported';
            return false;
        }
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        
        recognition.onresult = function(event) {
            let transcript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }
            transcript = transcript.toLowerCase().trim();
            document.getElementById('voiceStatus').innerHTML = `🗣️ Recognized: "${transcript}"`;
            processVoiceCommand(transcript);
        };
        recognition.onerror = function() {
            if (voiceActive) setTimeout(() => { try { recognition.start(); } catch(e) {} }, 2500);
        };
        recognition.onend = function() {
            if (voiceActive) {
                try { recognition.start(); } catch(e) {
                    voiceActive = false;
                    document.getElementById('voiceBtn').innerHTML = '🎤 VOICE CONTROL (OFF)';
                }
            }
        };
        return true;
    }
    
    function toggleVoiceCommand() {
        if (!voiceActive) {
            if (!recognition && !initVoiceRecognition()) return;
            try {
                recognition.start();
                voiceActive = true;
                document.getElementById('voiceBtn').innerHTML = '🎤 LISTENING...';
                document.getElementById('voiceStatus').innerHTML = '🔴 සක්‍රීය හඬ හඳුනාගැනීම...';
                showToast('Voice Command Engine Activated', 'success');
            } catch(e) {
                showToast('Mic Access Authorization Failed', 'error');
            }
        } else {
            if (recognition) recognition.stop();
            voiceActive = false;
            document.getElementById('voiceBtn').innerHTML = '🎤 VOICE CONTROL (OFF)';
            document.getElementById('voiceStatus').innerHTML = '⚪ සක්‍රීය කිරීමට ක්ලික් කරන්න';
            showToast('Voice Commands Deactivated', 'info');
        }
    }
    
    function processVoiceCommand(cmd) {
        if (cmd === 'sr' || cmd.includes('start ride') || cmd.includes('start')) {
            if (!sTime) startRide(); else showToast('Active Ride Running', 'warning');
        } else if (cmd === 'er' || cmd.includes('end ride') || cmd.includes('end')) {
            if (sTime) endRide(); else showToast('No Active Trip', 'warning');
        } else if (cmd === 'nav' || cmd.includes('navigate')) {
            if (currentDestinationAddress) openPhoneNavigation(); else showToast('No Target Destination Set', 'warning');
        } else if (cmd === 'rp' || cmd.includes('report')) {
            openReportsMenu();
        } else if (cmd === 'fl' || cmd.includes('fuel')) {
            openFuelLogModal();
        } else if (cmd === 'rpl' || cmd.includes('repair')) {
            openRepairLogModal();
        }
    }

    // ========== STREAMING_CHUNK: Core State Initializations & Expanded Modals ==========
    let sTime = null, watchId = null, totalMeters = 0, lastLat = null, lastLon = null, currentLat = null, currentLng = null, currentRID = "", nightActive = false, gpsReady = false, currentMode = "auto", pendingRideData = null, selectedMethod = "cash", currentLocationAddress = "", currentLocationLat = null, currentLocationLon = null, startLocationAddress = "", currentDestinationAddress = "", mapObj = null, mapMarker = null, mapPickerField = null, currentTrackingId = null;
    let deliveryPickupName="", deliveryPickupPhone="", deliveryDeliveryName="", deliveryDeliveryPhone="";
    let SETTINGS = { base: 100, rate: 80, waitRate: 5, nightPercent: 10, appName: "ADVANCE MEETER TAXI", receiptName: "AMT OFFICIAL RECEIPT", logo: null };
    let currentReportType = "daily";
    let passengerMap = null, passengerMarker = null;
    let latestPassengerPayload = null;
    let driverPopupMap = null, driverPopupMarker = null;
    
    // Track execution of a loaded schedule booking
    let activeBookingId = null; 
    let activeBookingManualFare = null;
    
    // ========== RIDE STATUS MONITORING ==========
    let rideStatusInterval = null;
    let currentGPSAccuracy = 0;
    
    // ========== BOOKING & SCHEDULE STATE MANAGEMENT ==========
    let schedules = readStoredList('amt_schedules');
    let currentScheduleFilterTab = "all";
    
    function saveSchedules() {
        cloudStore.setItem('amt_schedules', JSON.stringify(schedules));
        checkScheduleReminders();
    }
    
    function startRideStatusMonitoring() {
        const statusPanel = document.getElementById('ride-status-panel');
        if (statusPanel) statusPanel.classList.remove('hidden');
        
        if (rideStatusInterval) clearInterval(rideStatusInterval);
        
        rideStatusInterval = setInterval(() => {
            if (!sTime) {
                stopRideStatusMonitoring();
                return;
            }
            
            // Update elapsed time
            const elapsed = Math.floor((Date.now() - sTime.getTime()) / 1000);
            const hours = Math.floor(elapsed / 3600);
            const minutes = Math.floor((elapsed % 3600) / 60);
            const seconds = elapsed % 60;
            const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            
            const timeEl = document.getElementById('ride-elapsed-time');
            if (timeEl) timeEl.innerText = timeStr;
            
            // Update GPS accuracy
            const avgAccuracy = getAverageGPSAccuracy();
            const accuracyEl = document.getElementById('ride-gps-accuracy');
            if (accuracyEl) {
                const color = avgAccuracy < 20 ? 'text-emerald-400' : avgAccuracy < 50 ? 'text-amber-400' : 'text-rose-400';
                accuracyEl.className = `${color} font-extrabold`;
                accuracyEl.innerText = Math.round(avgAccuracy) + 'm';
            }
            
            // Update battery level
            if (navigator.getBattery || navigator.battery) {
                const battery = navigator.getBattery?.() || navigator.battery;
                Promise.resolve(battery).then(bat => {
                    const batteryEl = document.getElementById('ride-battery-level');
                    if (batteryEl) {
                        const percent = Math.round(bat.level * 100);
                        const batColor = percent > 50 ? 'text-green-400' : percent > 20 ? 'text-amber-400' : 'text-rose-400';
                        batteryEl.className = `${batColor} font-extrabold`;
                        batteryEl.innerText = percent + '%' + (bat.charging ? ' ⚡' : '');
                    }
                }).catch(e => {
                    const batteryEl = document.getElementById('ride-battery-level');
                    if (batteryEl) batteryEl.innerText = 'N/A';
                });
            }
        }, 1000);
    }
    
    function stopRideStatusMonitoring() {
        if (rideStatusInterval) {
            clearInterval(rideStatusInterval);
            rideStatusInterval = null;
        }
        const statusPanel = document.getElementById('ride-status-panel');
        if (statusPanel) statusPanel.classList.add('hidden');
    }

    // Modals Navigation Management
    function goBackToSettingsMenu() {
        closeM('app-settings-modal'); closeM('fuel-modal'); closeM('repair-modal'); closeM('reports-menu-modal'); closeM('system-log-modal'); closeM('db-backup-modal');
        document.getElementById('settings-modal').style.display = 'flex';
    }
    function goBackToFuelLog() { closeM('fuel-report-modal'); document.getElementById('fuel-modal').style.display = 'flex'; }
    function goBackToRepairLog() { closeM('repair-report-modal'); document.getElementById('repair-modal').style.display = 'flex'; }
    function goBackToReportsMenu() {
        closeM('report-modal'); closeM('income-modal'); closeM('history-modal'); closeM('travel-report-modal'); closeM('profit-report-modal'); closeM('peak-hours-modal'); closeM('driver-performance-modal');
        document.getElementById('reports-menu-modal').style.display = 'flex';
    }

    function saveRideState() {
        if (sTime) {
            deliveryPickupName = document.getElementById('pickup-name').value;
            deliveryPickupPhone = document.getElementById('pickup-phone').value;
            deliveryDeliveryName = document.getElementById('delivery-name').value;
            deliveryDeliveryPhone = document.getElementById('delivery-phone').value;
            cloudStore.setItem('amt_ride_state', JSON.stringify({
                isRideActive: true, startTime: sTime, totalMeters, lastLat, lastLon, currentMode, nightActive, startLocationAddress, currentLocationAddress, gpsReady: true, destinationAddress: currentDestinationAddress, trackingId: currentTrackingId,
                deliveryPickupName, deliveryPickupPhone, deliveryDeliveryName, deliveryDeliveryPhone,
                activeBookingId, activeBookingManualFare, sharingEnabled:document.getElementById('share-location').checked, trackingShareToken,
                form: Object.fromEntries(['customer-name','mobile','wait-select','discount-input','manual-fare','start-loc','end-loc','pickup-name','pickup-phone','delivery-name','delivery-phone'].map(id => [id, document.getElementById(id).value]))
            }));
            configureNativeMeter();
            broadcastOdometerTelemetry();
        }
    }
    
    // ========== Peer-to-Peer Telemetry Broadcast Engine ==========
    async function broadcastOdometerTelemetry(forceStatus='active') {
        if (!trackingShareToken || !Number.isFinite(currentLat) || !Number.isFinite(currentLng)) return;
        try { await cloudStore.request('/track/'+trackingShareToken,{method:'PUT',body:JSON.stringify({lat:currentLat,lng:currentLng,currentFare:calcFare(),distanceTraveled:(totalMeters/1000).toFixed(2),status:forceStatus,mode:currentMode})}); }
        catch(e) { cloudStore.reportStatus('Tracking update failed: '+e.message); }
    }

    function loadRideState() {
        let saved = cloudStore.getItem('amt_ride_state');
        if (saved) {
            try {
                let state = JSON.parse(saved);
                if (state.isRideActive && Number.isFinite(Date.parse(state.startTime))) {
                    document.getElementById('restore-banner').classList.remove('hidden');
                    return true;
                }
            } catch(e){}
        }
        return false;
    }
    
    function restorePreviousRide() {
        if (sTime || pendingRideData || rideEnding) return;
        let saved = cloudStore.getItem('amt_ride_state');
        if (!saved) return;
        try {
            let state = JSON.parse(saved);
            if (!state.isRideActive || !Number.isFinite(Date.parse(state.startTime))) throw new Error('Invalid ride');
            sTime = new Date(state.startTime);
            Object.entries(state.form || {}).forEach(([id, value]) => { const el = document.getElementById(id); if (el) el.value = value; });
            totalMeters = Number.isFinite(state.totalMeters) ? Math.max(0,state.totalMeters) : 0;
            lastLat = state.lastLat;
            lastLon = state.lastLon;
            currentLat = state.lastLat;
            currentLng = state.lastLon;
            currentMode = state.currentMode || "auto";
            nightActive = state.nightActive || false;
            startLocationAddress = state.startLocationAddress || "";
            currentLocationAddress = state.currentLocationAddress || "";
            currentDestinationAddress = state.destinationAddress || "";
            currentTrackingId = state.trackingId || null;
            trackingShareToken = state.sharingEnabled && /^[a-f0-9]{64}$/.test(state.trackingShareToken||'') ? state.trackingShareToken : null;
            document.getElementById('share-location').checked = Boolean(trackingShareToken);
            deliveryPickupName = state.deliveryPickupName || "";
            deliveryPickupPhone = state.deliveryPickupPhone || "";
            deliveryDeliveryName = state.deliveryDeliveryName || "";
            deliveryDeliveryPhone = state.deliveryDeliveryPhone || "";
            activeBookingId = state.activeBookingId || null;
            activeBookingManualFare = state.activeBookingManualFare || null;
            gpsReady = usesManualDistance();
            lastLat = null; lastLon = null;
            
            setMode(currentMode);
            startRideStatusMonitoring();
            document.getElementById('active-ride-banner').classList.remove('hidden');
            let nightBtn = document.getElementById('nightBtn');
            if (nightActive) {
                nightBtn.innerHTML = '🌙 NIGHT ON';
            } else {
                nightBtn.innerHTML = '🌙 NIGHT OFF';
            }
            
            updateDisplay();
            if (currentMode === 'auto' && currentLocationAddress) document.getElementById('current-location-address').textContent = currentLocationAddress;
            if (usesManualDistance()) document.getElementById('manual-km-input').value = (totalMeters/1000).toFixed(2);
            if (currentMode === 'delivery') {
                document.getElementById('pickup-name').value = deliveryPickupName;
                document.getElementById('pickup-phone').value = deliveryPickupPhone;
                document.getElementById('delivery-name').value = deliveryDeliveryName;
                document.getElementById('delivery-phone').value = deliveryDeliveryPhone;
                document.getElementById('delivery-accordion').classList.add('open');
            }
            
            if (sTime) {
                document.getElementById('startBtn').innerHTML = "⏵ ACTIVE";
                document.getElementById('startBtn').disabled = true;
                document.body.classList.add('ride-active');
                document.getElementById('showMapPopupBtn').classList.remove('hidden');
                requestWakeLock();
                trackRide();
                document.getElementById('nav-container').classList.remove('hidden');
                startTrackingUpdates();
                openDriverMapPopup();
            }
            
            document.getElementById('restore-banner').classList.add('hidden');
            document.querySelectorAll('.mode-btn').forEach(btn => btn.style.pointerEvents = 'none');
            showToast(`Ride Restored: ${(totalMeters/1000).toFixed(2)} km`, 'success');
        } catch(e){}
    }

    // ========== STREAMING_CHUNK: Integrating Precise Geolocation Decoder Logic ==========
    function getSriLankaFallbackAddress(lat, lon) {
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 'Location unavailable';
        return `GPS: ${lat.toFixed(6)}, ${lon.toFixed(6)} (address unavailable)`;
    }

    // ========== GEOLOCATION LOGIC (GPS LOGIC) ==========
    function usesManualDistance() { return ['manual','delivery','schedule'].includes(currentMode); }

    let gpsAttempt = 0;
    function startGPS() {
        if (usesManualDistance() || sTime) return;
        if (!navigator.geolocation) {
            document.getElementById('gps-status').textContent = 'GPS unavailable — use Manual mode';
            return;
        }
        const attempt = ++gpsAttempt;
        document.getElementById('gps-status').textContent = 'Finding GPS…';
        navigator.geolocation.getCurrentPosition(pos => {
            if (attempt !== gpsAttempt || usesManualDistance() || sTime) return;
            let acc = pos.coords.accuracy;
            lastLat = pos.coords.latitude;
            lastLon = pos.coords.longitude;
            currentLat = pos.coords.latitude;
            currentLng = pos.coords.longitude;
            if (acc <= MAX_ACCURACY) {
                gpsReady = true;
                document.getElementById('gps-status').innerHTML = `✅ GPS Ready (${acc.toFixed(0)}m)`;
                document.getElementById('startBtn').disabled = false;
                if (currentMode === 'gps') {
                    const field = document.getElementById('start-loc');
                    if (!field.value.trim()) { field.value = getSriLankaFallbackAddress(lastLat,lastLon); startLocationAddress = field.value; }
                }
                if (currentMode === 'auto') {
                    currentLocationLat = lastLat;
                    currentLocationLon = lastLon;
                    reverseGeocode(lastLat, lastLon);
                }
                showLoading(false);
                showToast('GPS Connectivity Stabilized', 'success');
            } else {
                showLoading(false);
                document.getElementById('gps-status').textContent = 'GPS accuracy low — tap location refresh outside';
            }
        }, err => {
            showLoading(false);
            if (usesManualDistance() || sTime) return;
            document.getElementById('gps-status').innerHTML = '❌ GPS Permissions Required';
            document.getElementById('startBtn').disabled = true;
            showToast('GPS Location Permissions Blocked', 'error');
            document.getElementById('gps-status').textContent = err.code === 1 ? 'Allow location permission, then tap refresh' : 'GPS unavailable — tap refresh to retry';
        }, { enableHighAccuracy: true, timeout: 15000 });
    }

    async function syncNativeMeter() {
        if (!window.nativeMeter?.supported || !sTime) return;
        const state = await window.nativeMeter.call('snapshot');
        if (state.rideId !== sTime.toISOString()) return;
        if (!usesManualDistance() && Number.isFinite(state.meters)) totalMeters = state.meters;
        if (Number.isFinite(state.lat) && Number.isFinite(state.lng)) { currentLat=state.lat; currentLng=state.lng; }
        const status=document.getElementById('gps-status');
        status.textContent=state.gap?'GPS gap detected — review unmeasured distance':`Native GPS · ${Math.round(state.accuracy || 0)}m accuracy`;
        updateDisplay();saveRideState();
    }
    function configureNativeMeter() {
        if (!window.nativeMeter?.supported || !sTime) return;
        cloudStore.configureNative({share:document.getElementById('share-location').checked?trackingShareToken:'',rates:SETTINGS,mode:currentMode,manualMeters:totalMeters,manualFare:Math.max(0,Number(document.getElementById('manual-fare').value)||0),wait:Number(document.getElementById('wait-select').value)||0,discount:Math.max(0,Number(document.getElementById('discount-input').value)||0),night:nightActive}).catch(e=>cloudStore.reportStatus(e.message));
    }

    function trackRide() {
        if (window.nativeMeter?.supported) {
            window.nativeMeter.call('start',{rideId:sTime.toISOString(),meters:totalMeters,metered:!usesManualDistance()}).then(syncNativeMeter).catch(e=>showToast(e.message,'error'));
            return;
        }
        if (!navigator.geolocation) return;
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        watchId = navigator.geolocation.watchPosition(pos => {
            if (!sTime || rideEnding) return;
            
            let lat = pos.coords.latitude, 
                lon = pos.coords.longitude, 
                acc = pos.coords.accuracy;
            
            if (![lat,lon,acc].every(Number.isFinite) || Math.abs(lat)>90 || Math.abs(lon)>180 || acc < 0 || acc > MAX_ACCURACY) {
                document.getElementById('gps-status').textContent = 'GPS accuracy low — distance paused';
                return;
            }
            document.getElementById('gps-status').textContent = `GPS ${Math.round(acc)}m`;
            currentLat = lat;
            currentLng = lon;
            
            addGPSUpdate(lat, lon, acc);
            
            if (acc < 200 && currentMode === 'auto') {
                reverseGeocode(lat, lon);
            }
            
            if (usesManualDistance()) { broadcastOdometerTelemetry(); updateDriverPopupMarker(lat,lon); return; }
            if (lastLat !== null && lastLon !== null) {
                const validation = isValidGPSUpdate(lat, lon, acc, lastLat, lastLon);
                
                if (validation.valid) {
                    const distance = calculateDistanceMeters(lastLat, lastLon, lat, lon);
                    
                    if (distance >= MIN_DISTANCE && distance <= MAX_DISTANCE) {
                        totalMeters += distance;
                        lastLat = lat;
                        lastLon = lon;
                        lastUpdateTime = Date.now();
                        updateDisplay();
                        saveRideState();
                        updateDriverPopupMarker(lat, lon);
                        
                        const avgAccuracy = getAverageGPSAccuracy();
                        if (acc > 40) {
                            showToast(`📍 GPS නිරවද්යතා: ${acc.toFixed(0)}m (සාමාන්ය: ${avgAccuracy}m)`, 'info');
                        }
                    }
                } else {
                    console.warn('GPS validation failed: ' + validation.reason);
                    if (Date.now() - lastUpdateTime > 30000 && calculateDistanceMeters(lastLat,lastLon,lat,lon) > MAX_DISTANCE) {
                        lastLat=lat; lastLon=lon; lastUpdateTime=Date.now();
                        showToast('GPS resumed after a gap. Please review the unmeasured distance.', 'warning');
                    }
                }
            } else {
                lastLat = lat;
                lastLon = lon;
                lastUpdateTime = Date.now();
            }
            
            if (mapMarker && mapObj) {
                updateDriverPopupMarker(lat, lon);
            }
            
        }, () => { document.getElementById('gps-status').textContent = 'GPS signal lost — waiting to reconnect'; }, { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 });
    }

    let lastGeocodeTime = 0;
    async function reverseGeocode(lat, lon) {
        if (Date.now() - lastGeocodeTime < 10000) return currentLocationAddress;
        lastGeocodeTime = Date.now();
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "Location unavailable";
        try {
            let res = await fetchWithTimeout(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=en&countrycodes=lk`, {
                headers: { "Accept-Language": "en" }
            });
            let data = await res.json();
            currentLocationAddress = data.display_name || getSriLankaFallbackAddress(lat, lon);
            document.getElementById('current-location-address').textContent = currentLocationAddress.substring(0, 80);
            return currentLocationAddress;
        } catch(e){
            currentLocationAddress = getSriLankaFallbackAddress(lat, lon);
            document.getElementById('current-location-address').textContent = currentLocationAddress.substring(0, 80);
            return currentLocationAddress;
        }
    }

    function refreshCurrentLocation() {
        if (!sTime && !usesManualDistance()) { startGPS(); return; }
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(pos => {
                currentLat = pos.coords.latitude;
                currentLng = pos.coords.longitude;
                reverseGeocode(pos.coords.latitude, pos.coords.longitude);
            });
        }
        showToast('Local Coordinates Refreshed', 'info');
    }

    function setMode(mode) {
        if (rideEnding || (sTime && mode !== currentMode)) { showToast('Finish the active ride before changing mode.', 'warning'); return; }
        if (!['auto','gps','manual','delivery','schedule'].includes(mode)) return;
        gpsAttempt++;
        currentMode = mode;
        if (!sTime && !usesManualDistance()) { gpsReady = false; document.getElementById('startBtn').disabled = true; }
        ['auto','gps','manual','delivery','schedule'].forEach(m => {
            const btn = document.getElementById(`mode-${m}`);
            if (btn) {
                btn.classList.remove('bg-blue-600', 'text-white');
                btn.classList.add('text-slate-400');
            }
        });
        const currentBtn = document.getElementById(`mode-${mode}`);
        if (currentBtn) {
            currentBtn.classList.add('bg-blue-600', 'text-white');
            currentBtn.classList.remove('text-slate-400');
        }
        
        if (mode === 'auto') {
            document.getElementById('auto-location-card').style.display = 'flex';
            document.getElementById('location-fields').style.display = 'none';
            document.getElementById('delivery-accordion').style.display = 'none';
            document.getElementById('manual-controls').style.display = 'none';
            if (!sTime) startGPS();
            refreshCurrentLocation();
        } else if (mode === 'gps') {
            document.getElementById('auto-location-card').style.display = 'none';
            document.getElementById('location-fields').style.display = 'block';
            document.getElementById('delivery-accordion').style.display = 'none';
            document.getElementById('manual-controls').style.display = 'none';
            if (!sTime) startGPS();
            setupAutocomplete('start-loc', 'start-loc-suggestions');
            setupAutocomplete('end-loc', 'end-loc-suggestions');
        } else if (mode === 'manual') {
            document.getElementById('auto-location-card').style.display = 'none';
            document.getElementById('location-fields').style.display = 'block';
            document.getElementById('delivery-accordion').style.display = 'none';
            document.getElementById('manual-controls').style.display = 'block';
            gpsReady = true;
            if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
            document.getElementById('startBtn').disabled = false;
            setupAutocomplete('start-loc', 'start-loc-suggestions');
            setupAutocomplete('end-loc', 'end-loc-suggestions');
        } else if (mode === 'delivery') {
            document.getElementById('auto-location-card').style.display = 'none';
            document.getElementById('location-fields').style.display = 'block';
            document.getElementById('delivery-accordion').style.display = 'block';
            document.getElementById('manual-controls').style.display = 'block';
            gpsReady = true; document.getElementById('startBtn').disabled = false;
            setupAutocomplete('start-loc', 'start-loc-suggestions');
            setupAutocomplete('end-loc', 'end-loc-suggestions');
        } else if (mode === 'schedule') {
            // Expands booking scheduler accordion dynamically and focuses details
            document.getElementById('auto-location-card').style.display = 'none';
            document.getElementById('location-fields').style.display = 'block';
            document.getElementById('delivery-accordion').style.display = 'none';
            document.getElementById('manual-controls').style.display = 'block';
            
            // Expand Schedule accordion directly
            const bookingAcc = document.getElementById('booking-accordion');
            if (bookingAcc && !bookingAcc.classList.contains('open')) {
                toggleAccordion('booking-accordion');
            }
            gpsReady = true; document.getElementById('startBtn').disabled = false;
            setupAutocomplete('sch-start', 'sch-start-suggestions');
            setupAutocomplete('sch-end', 'sch-end-suggestions');
        }
        updateDisplay();
        showToast(`${mode.toUpperCase()} Navigation Mode Enabled`, 'info');
    }

    let searchTimeout;
    function setupAutocomplete(inputId, suggestionsId) {
        let input = document.getElementById(inputId);
        let div = document.getElementById(suggestionsId);
        if (!input || !div || input.dataset.autocompleteReady) return;
        input.dataset.autocompleteReady = 'true';
        
        input.addEventListener('input', function() {
            let q = this.value.trim();
            if (q.length < 2) { div.style.display = 'none'; return; }
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(async () => {
                let results = await searchSriLankaLocations(q);
                if (input.value.trim() !== q) return;
                if (!Array.isArray(results)) results = [];
                div.innerHTML = '';
                if (results.length === 0) {
                    div.innerHTML = '<div class="p-2 border-b border-slate-800 text-slate-400">No Sri Lanka Results found.</div>';
                } else {
                    results.forEach(p => {
                        let item = document.createElement('div');
                        item.className = 'p-2 border-b border-slate-800 hover:bg-slate-900 cursor-pointer text-xs truncate';
                        item.textContent = p.display_name.substring(0, 80);
                        item.onclick = () => {
                            input.value = p.display_name;
                            if (inputId === 'end-loc' || inputId === 'sch-end') {
                                currentDestinationAddress = p.display_name;
                            }
                            if (inputId === 'start-loc' || inputId === 'sch-start') {
                                startLocationAddress = p.display_name;
                            }
                            div.style.display = 'none';
                            pickerSearchLocation={lat:Number(p.lat),lng:Number(p.lon)};
                            openMapPicker(inputId==='start-loc'?'start':inputId==='end-loc'?'end':inputId);
                        };
                        div.appendChild(item);
                    });
                }
                div.style.display = 'block';
            }, 400);
        });
        document.addEventListener('click', e => { if (e.target !== input) div.style.display = 'none'; });
    }

    // ========== ENHANCED GPS DISTANCE CALCULATION ENGINE ==========
    let gpsAccuracyHistory = [];
    let lastValidLat = null, lastValidLon = null;
    const MAX_ACCURACY = 50; 
    const MIN_DISTANCE = 2; 
    const MAX_DISTANCE = 500; 
    const MIN_TIME_BETWEEN_UPDATES = 2000; 
    let lastUpdateTime = 0;
    
    function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
        const R = 6371000; 
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + 
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return distance;
    }
    
    function isValidGPSUpdate(lat, lon, accuracy, prevLat, prevLon) {
        if (accuracy > MAX_ACCURACY) {
            return { valid: false, reason: '📍 GPS නිරවද්යතා දුර්බල (accuracy > ' + MAX_ACCURACY + 'm)' };
        }
        
        if (prevLat === null || prevLon === null) {
            return { valid: true, reason: 'මුල් GPS ස්ථානය' };
        }
        
        const now = Date.now();
        if (now - lastUpdateTime < MIN_TIME_BETWEEN_UPDATES) {
            return { valid: false, reason: '⏱️ GPS යාවත්කාලීනතා වඩා ඉක්මනි (too frequent)' };
        }
        
        const distance = calculateDistanceMeters(prevLat, prevLon, lat, lon);
        
        if (distance < MIN_DISTANCE) {
            return { valid: false, reason: '🟡 දුරක්ෂණ අතුරුපුර පර (distance < ' + MIN_DISTANCE + 'm)' };
        }
        
        if (distance > MAX_DISTANCE) {
            return { valid: false, reason: '⚠️ GPS jumping far (' + Math.round(distance) + 'm) - spurious data' };
        }
        
        return { valid: true, reason: '✅ හරි GPS ස්ථානය' };
    }
    
    function addGPSUpdate(lat, lon, accuracy) {
        gpsAccuracyHistory.push({ accuracy, timestamp: Date.now() });
        if (gpsAccuracyHistory.length > 20) {
            gpsAccuracyHistory.shift();
        }
    }
    
    function getAverageGPSAccuracy() {
        if (gpsAccuracyHistory.length === 0) return 100;
        const sum = gpsAccuracyHistory.reduce((a, b) => a + b.accuracy, 0);
        return (sum / gpsAccuracyHistory.length).toFixed(1);
    }

    let lastKmValue = 0, lastFareValue = 0;
    function animateCounter(id) {
        let el = document.getElementById(id);
        if (el) {
            el.classList.remove('count-animation');
            void el.offsetWidth;
            el.classList.add('count-animation');
        }
    }

    function updateDisplay() {
        let km = totalMeters / 1000;
        let fare = calcFare();
        if (Math.abs(km - lastKmValue) > 0.01) {
            animateCounter('disp-km');
            lastKmValue = km;
        }
        if (fare !== lastFareValue) {
            animateCounter('disp-fare');
            lastFareValue = fare;
        }
        document.getElementById('disp-km').innerHTML = km.toFixed(2);
        document.getElementById('disp-fare').innerHTML = fare.toFixed(2);
        
        const popupKm = document.getElementById('popup-disp-km');
        const popupFare = document.getElementById('popup-disp-fare');
        if (popupKm) popupKm.innerText = km.toFixed(2) + " KM";
        if (popupFare) popupFare.innerText = "Rs. " + fare.toFixed(2);
        
        const kmInput = document.getElementById('manual-km-input');
        if (kmInput && document.activeElement !== kmInput) {
            kmInput.value = km.toFixed(2);
        }
        
        let ni = document.getElementById('night-indicator');
        if (ni) ni.style.display = nightActive ? 'inline-block' : 'none';
    }

    function calcFare() {
        let manualFare = Math.max(0, parseFloat(document.getElementById('manual-fare').value) || 0),
            disc = Math.max(0, parseFloat(document.getElementById('discount-input').value) || 0),
            wait = (parseInt(document.getElementById('wait-select').value) || 0),
            waitCharge = wait * SETTINGS.waitRate,
            km = totalMeters / 1000,
            total = manualFare > 0 ? manualFare + waitCharge - disc : SETTINGS.base + (Math.max(0, km - 1) * SETTINGS.rate) + waitCharge - disc;
            
        if (nightActive) total = total + (total * SETTINGS.nightPercent / 100);
        return Math.max(0, Math.round(total));
    }

    // ========== STREAMING_CHUNK: Managing Active Ride Start & End Sequences ==========
    async function startRide() {
        if (pendingRideData) { openPaymentPopup(); return; }
        if (!sTime && loadRideState()) { showToast('Restore the previous ride or use RESET before starting a new one.', 'warning'); return; }
        if(sTime) { showToast("Ride already active!", 'warning'); return; }
        
        if (!usesManualDistance() && !gpsReady) { showToast('Wait for an accurate GPS fix or use Manual mode.', 'warning'); return; }
        if(currentMode === 'auto') { 
            if(!currentLocationAddress || currentLocationAddress === "GPS සංඥා ලැබෙන තෙක් රැඳී සිටින්න...") { 
                showToast("GPS සක්‍රීය වන තෙක් රැඳී සිටින්න!", 'warning'); 
                return; 
            } 
            startLocationAddress = currentLocationAddress;
        } 
        else if(currentMode === 'gps' || currentMode === 'manual' || currentMode === 'delivery' || currentMode === 'schedule') { 
            // Handles cases for schedule execution maps inheritance
            let startLocVal = document.getElementById('start-loc').value.trim();
            let endLocVal = document.getElementById('end-loc').value.trim();
            
            if (currentMode === 'schedule') {
                startLocVal = document.getElementById('sch-start').value.trim();
                endLocVal = document.getElementById('sch-end').value.trim();
            }
            
            if(!startLocVal || !endLocVal) { 
                showToast("කරුණාකර Pickup සහ Drop ස්ථාන ඇතුළත් කරන්න!", 'warning'); 
                return; 
            } 
            if(!gpsReady) { 
                showToast("GPS තවම සූදානම් නැත!", 'warning'); 
                return; 
            } 
            startLocationAddress = startLocVal;
            currentDestinationAddress = endLocVal;
        }
        
        const startedAt = new Date();
        if (window.nativeMeter?.supported) {
            try { await window.nativeMeter.call('start',{rideId:startedAt.toISOString(),meters:usesManualDistance()?totalMeters:0,metered:!usesManualDistance()}); }
            catch(e) { showToast(e.message,'error'); return; }
        }
        sTime = startedAt;
        await requestWakeLock();
        document.body.classList.add('ride-active');
        document.getElementById('showMapPopupBtn').classList.remove('hidden');
        document.getElementById('active-ride-banner').classList.remove('hidden');
        
        if(!usesManualDistance()) {
            totalMeters = 0;
            lastLat = null; 
            lastLon = null;
            trackRide();
            if (currentMode !== 'auto') document.getElementById('nav-container').classList.remove('hidden');
        } 
        else if(usesManualDistance()) {
            trackRide();
            totalMeters = (parseFloat(document.getElementById('manual-km-input').value) || 0) * 1000;
            document.getElementById('nav-container').classList.remove('hidden');
        } 
        
        const sBtn = document.getElementById('startBtn');
        sBtn.innerHTML = "⏵ RUNNING";
        sBtn.classList.remove('bg-emerald-600', 'hover:bg-emerald-500');
        sBtn.classList.add('bg-rose-600', 'hover:bg-rose-500', 'animate-pulse');
        sBtn.disabled = true;
        updateDisplay();
        
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.style.pointerEvents = 'none';
            btn.style.opacity = '0.5';
        });
        
        currentTrackingId = generateTrackingId();
        document.getElementById('nav-container').classList.remove('hidden');
        document.getElementById('share-location').checked=true;
        saveRideState();
        await showTrackingPopup();
        configureNativeMeter();
        startTrackingUpdates();
        startRideStatusMonitoring();
        showToast("ගමන සාර්ථකව ආරම්භ විය! 🚕", 'success');
        sendNotification('Ride Started', 'Your taxi ride has started. Safe journey!');
    }
    
    // ========== Setting up Driver Map Popup Modal ==========
    function openDriverMapPopup() {
        if (typeof L === 'undefined') { showToast('Map unavailable. The meter remains active.', 'warning'); return; }
        const modal = document.getElementById('driver-live-tracking-modal');
        modal.style.display = 'flex';
        
        const defaultLat = currentLat || lastLat || 6.9271;
        const defaultLng = currentLng || lastLon || 79.8612;
        
        setTimeout(() => {
            try {
                if (driverPopupMap) { driverPopupMap.remove(); }
                driverPopupMap = L.map('driver-popup-map-canvas', { zoomControl: false }).setView([defaultLat, defaultLng], 15);
                L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                    maxZoom: 19
                }).addTo(driverPopupMap);
                
                driverPopupMarker = L.marker([defaultLat, defaultLng], {
                    icon: L.divIcon({
                        html: '<div style="font-size: 32px;">🚕</div>',
                        className: 'driver-popup-icon',
                        iconSize: [36, 36],
                        iconAnchor: [18, 18]
                    })
                }).addTo(driverPopupMap);
                
                driverPopupMap.invalidateSize();
            } catch(e) {
                console.error("Popup Live Tracking Map Setup failed:", e);
            }
        }, 300);
    }
    
    function closeDriverMapPopup() {
        document.getElementById('driver-live-tracking-modal').style.display = 'none';
    }

    function updateDriverPopupMarker(lat, lon) {
        if (driverPopupMarker && driverPopupMap) {
            driverPopupMarker.setLatLng([lat, lon]);
            driverPopupMap.setView([lat, lon]);
        }
    }

    // ========== STREAMING_CHUNK: Processing Ride End, Payment Handshakes & Executing Schedules ==========
    let rideEnding = false;
    async function endRide() { 
        if(!sTime) { showToast("ක්‍රියාකාරී ගමනක් නොමැත", 'warning'); return; } 
        if (rideEnding) return;
        rideEnding = true;
        try {
        await syncNativeMeter();
        if (window.nativeMeter?.supported) await window.nativeMeter.call('stop');
        showLoading(true);
        closeDriverMapPopup();
        
        let finalLat = currentLat || lastLat;
        let finalLon = currentLng || lastLon;
        
        if (!window.nativeMeter?.supported && !usesManualDistance() && navigator.geolocation) {
            try {
                const finalPos = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 3000 });
                });
                finalLat = finalPos.coords.latitude;
                finalLon = finalPos.coords.longitude;
                currentLat = finalLat;
                currentLng = finalLon;
            } catch (e) {
                console.log("Fallback geo trigger default values", e);
            }
        }
        
        let finalAddress = getSriLankaFallbackAddress(finalLat, finalLon);
        if (currentMode !== 'manual' && finalLat && finalLon) {
            try {
                let res = await fetchWithTimeout(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${finalLat}&lon=${finalLon}&accept-language=en&countrycodes=lk`, {
                    headers: { "Accept-Language": "en" }
                });
                let data = await res.json();
                if (data && data.display_name) {
                    finalAddress = data.display_name;
                }
            } catch(err) {
                console.log("OSM Error, resolving fallback Sri Lankan address", err);
            }
        }
        
        if (usesManualDistance()) finalAddress = currentDestinationAddress || document.getElementById('end-loc').value;
        let fare = calcFare(); 
        currentRID = generateReceiptID(); 
        let km = totalMeters / 1000; 
        let fromAddress = startLocationAddress || "Unknown Pickup Location";

        if (currentMode === 'delivery') {
            deliveryPickupName = document.getElementById('pickup-name')?.value || '';
            deliveryPickupPhone = document.getElementById('pickup-phone')?.value || '';
            deliveryDeliveryName = document.getElementById('delivery-name')?.value || '';
            deliveryDeliveryPhone = document.getElementById('delivery-phone')?.value || '';
        }

        pendingRideData = { 
            id: currentRID,
            tariff: { ...SETTINGS },
            startTime: sTime.getTime(),
            fare: fare, 
            km: km, 
            from: fromAddress, 
            to: finalAddress, 
            customerName: document.getElementById('customer-name')?.value.trim() || '',
            mobile: document.getElementById('mobile').value || "N/A", 
            wait: parseInt(document.getElementById('wait-select').value) || 0, 
            disc: Math.max(0, parseFloat(document.getElementById('discount-input').value) || 0), 
            manualFare: Math.max(0, parseFloat(document.getElementById('manual-fare').value) || 0), 
            nightUsed: nightActive, 
            mode: activeBookingId ? "Booked Ride" : (currentMode === 'auto' ? "Auto" : (currentMode === 'gps' ? "GPS" : (currentMode === 'manual' ? "Manual" : "Delivery"))), 
            time: Date.now(),
            trackingId: currentTrackingId,
            bookingId: activeBookingId // Link booking ID
        }; 
        
        if (currentMode === 'delivery') { 
            pendingRideData.pickupName = deliveryPickupName; 
            pendingRideData.pickupPhone = deliveryPickupPhone; 
            pendingRideData.deliveryName = deliveryDeliveryName; 
            pendingRideData.deliveryPhone = deliveryDeliveryPhone; 
        } 
        
        cloudStore.setItem('amt_pending_payment', JSON.stringify(pendingRideData));
        await cloudStore.flush();
        await broadcastOdometerTelemetry('completed');
        
        // Mark Schedule Booking executed in Database
        if (activeBookingId) {
            schedules = schedules.map(sch => {
                if (sch.id === activeBookingId) {
                    return { ...sch, status: "completed" };
                }
                return sch;
            });
            saveSchedules();
        }

        resetDriverAppOnly();
        stopTrackingUpdates();
        
        showLoading(false);
        openPaymentPopup();
        } catch (e) {
            if (window.nativeMeter?.supported && sTime && !pendingRideData) trackRide();
            showToast('Unable to finish ride. Please retry: ' + e.message, 'error');
        } finally { rideEnding = false; showLoading(false); }
    }

    function resetDriverAppOnly() {
        if (window.nativeMeter?.supported) window.nativeMeter.call('stop').catch(e=>showToast(e.message,'error'));
        trackingShareToken=null;
        document.getElementById('share-location').checked=false;
        stopTrackingUpdates();
        currentTrackingId = null;
        document.getElementById('restore-banner').classList.add('hidden');
        if(watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
        releaseWakeLock();
        stopRideStatusMonitoring();
        document.body.classList.remove('ride-active');
        document.getElementById('showMapPopupBtn').classList.add('hidden');
        document.getElementById('active-ride-banner').classList.add('hidden');
        
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.style.pointerEvents = 'auto';
            btn.style.opacity = '1';
        });
        
        sTime = null;
        totalMeters = 0;
        lastLat = null;
        lastLon = null;
        currentDestinationAddress = "";
        activeBookingId = null;
        activeBookingManualFare = null;
        
        const sBtn = document.getElementById('startBtn');
        sBtn.innerHTML = "ගමන අරඹන්න (START)";
        sBtn.classList.remove('bg-rose-600', 'hover:bg-rose-500', 'animate-pulse');
        sBtn.classList.add('bg-emerald-600', 'hover:bg-emerald-500');
        sBtn.disabled = false;
        
        document.getElementById('start-loc').value = '';
        document.getElementById('end-loc').value = '';
        document.getElementById('mobile').value = '';
        document.getElementById('customer-name').value = '';
        document.getElementById('manual-fare').value = '';
        document.getElementById('discount-input').value = '';
        document.getElementById('wait-select').value = '0';
        document.getElementById('manual-km-input').value = '0.00';
        document.getElementById('nav-container').classList.add('hidden');
        document.getElementById('driver-live-map-card').classList.add('hidden');
        
        if (document.getElementById('pickup-name')) document.getElementById('pickup-name').value = '';
        if (document.getElementById('pickup-phone')) document.getElementById('pickup-phone').value = '';
        if (document.getElementById('delivery-name')) document.getElementById('delivery-name').value = '';
        if (document.getElementById('delivery-phone')) document.getElementById('delivery-phone').value = '';
        
        updateDisplay();
        cloudStore.removeItem('amt_ride_state');
        
        if (currentMode === 'auto') {
            refreshCurrentLocation();
        }
        if (currentMode !== 'manual') {
            startGPS();
        } else {
            gpsReady = true;
            document.getElementById('startBtn').disabled = false;
        }
        showToast('Driver console reset & ready for next ride!', 'info');
    }
    
    function generateReceiptID() {
        const now=new Date(), year=now.getFullYear(), fy=now.getMonth()>=3?year:year-1;
        const prefix=String(fy).slice(-2)+now.toLocaleString('en',{month:'short'}).toUpperCase()+'-';
        const existing=new Set(readStoredList('rides').map(r=>r.id));
        let count=Math.max(0,parseInt(cloudStore.getItem(`cnt_${fy}`),10)||0), id;
        do { count++; id=prefix+String(count).padStart(8,'0'); } while(existing.has(id));
        cloudStore.setItem(`cnt_${fy}`,String(count)); return id;
    }
    
    // ========== PAYMENT SELECTION CONFIGURATIONS ==========
    function openPaymentPopup() {
        document.getElementById('pending-payment-banner').classList.add('hidden'); 
        if(!pendingRideData) { showToast("No active trip parameters found.", 'error'); return; }
        if (document.getElementById('payment-popup').dataset.rideId !== pendingRideData.id) {
            document.querySelectorAll('#payment-detail-fields input').forEach(el => el.value = '');
            document.getElementById('payment-popup').dataset.rideId = pendingRideData.id;
        }
        selectedMethod = "cash";
        document.querySelectorAll('.payment-method-btn').forEach(btn => btn.classList.remove('bg-blue-600', 'border-transparent')); 
        const cashBtn = document.querySelector('.payment-method-btn[data-method="cash"]');
        if(cashBtn) cashBtn.classList.add('bg-blue-600', 'border-transparent');
        document.getElementById('payment-detail-fields').classList.remove('hidden'); 
        document.getElementById('cash-fields').style.display = 'block'; 
        document.getElementById('card-fields').style.display = 'none'; 
        document.getElementById('mobile-fields').style.display = 'none'; 
        document.getElementById('bank-fields').style.display = 'none'; 
        document.getElementById('other-fields').style.display = 'none'; 
        document.getElementById('payment-popup').style.display = 'flex'; 
    }
    
    function selectPaymentMethod(method) { 
        selectedMethod = method; 
        document.querySelectorAll('.payment-method-btn').forEach(btn => btn.classList.remove('bg-blue-600', 'border-transparent')); 
        const selectedBtn = document.querySelector(`.payment-method-btn[data-method="${method}"]`);
        if(selectedBtn) selectedBtn.classList.add('bg-blue-600', 'border-transparent');
        document.getElementById('cash-fields').style.display = 'none'; 
        document.getElementById('card-fields').style.display = 'none'; 
        document.getElementById('mobile-fields').style.display = 'none'; 
        document.getElementById('bank-fields').style.display = 'none'; 
        document.getElementById('other-fields').style.display = 'none'; 
        if(method === 'cash') document.getElementById('cash-fields').style.display = 'block'; 
        if(method === 'card') document.getElementById('card-fields').style.display = 'block'; 
        if(method === 'mobile') document.getElementById('mobile-fields').style.display = 'block'; 
        if(method === 'bank') document.getElementById('bank-fields').style.display = 'block'; 
        if(method === 'other') document.getElementById('other-fields').style.display = 'block'; 
    }
    
    function getPaymentInfo() { 
        switch(selectedMethod) { 
            case 'cash': return { method: 'Cash', detail: '' }; 
            case 'card': let cd = ""; if(document.getElementById('card-number')?.value) cd += `****${document.getElementById('card-number').value}`; if(document.getElementById('card-name')?.value) cd += ` - ${document.getElementById('card-name').value}`; return { method: 'Card', detail: cd || 'Card payment' }; 
            case 'mobile': let md = ""; if(document.getElementById('mobile-provider')?.value) md += document.getElementById('mobile-provider').value; if(document.getElementById('mobile-number')?.value) md += ` ${document.getElementById('mobile-number').value}`; return { method: 'Mobile', detail: md || 'Mobile payment' }; 
            case 'bank': let bd = ""; if(document.getElementById('bank-name')?.value) bd += document.getElementById('bank-name').value; if(document.getElementById('bank-ref')?.value) bd += ` - Ref: ${document.getElementById('bank-ref').value}`; return { method: 'Bank Transfer', detail: bd || 'Bank transfer' }; 
            default: return { method: document.getElementById('other-method')?.value || 'Other', detail: document.getElementById('other-ref')?.value || '' }; 
        } 
    }
    
    function closePaymentPopup() {
        document.getElementById('payment-popup').style.display = 'none';
        document.getElementById('pending-payment-banner').classList.toggle('hidden', !pendingRideData);
    }
    
    async function confirmPaymentAndShowReceipt() {
        if (paymentSaving) return;
        paymentSaving=true;
        try {
        if (!pendingRideData) return;
        const ride = { ...pendingRideData, payment: getPaymentInfo() };
        const list = readStoredList('rides');
        if (!list.some(r => r.id === ride.id)) list.push(ride);
        try { cloudStore.setItem('rides', JSON.stringify(list)); cloudStore.removeItem('amt_pending_payment'); await cloudStore.flush(); }
        catch(e) { showToast('Payment is not saved to the server. Check connection / sync status and retry.', 'error'); return; }
        pendingRideData = null;
        cloudStore.removeItem('amt_pending_payment');
        closePaymentPopup();
        try { triggerRollingBackup(); } catch(e) { showToast('Payment saved; backup storage is full.', 'warning'); }
        try { addSystemLog('INFO', 'Payment confirmed', 'Receipt: ' + ride.id); } catch(e) {}
        showReceipt(ride, false);
        showToast('ගෙවීම් සුරැකිණි. Receipt එක සූදානම්.', 'success');
        } finally {paymentSaving=false;}
    }

    // ========== Structuring receipt layout with 100% parity ==========
    function getPerfectReceiptTemplateHTML(ride, isReprint, qrContainerId) {
        const tariff = ride.tariff || SETTINGS;
        const textKeys = ['id','from','to','mobile','mode','pickupName','pickupPhone','deliveryName','deliveryPhone'];
        ride = { ...ride };
        textKeys.forEach(key => { if (ride[key] != null) ride[key] = escapeHTML(ride[key]); });
        if (ride.payment) ride.payment = { method: escapeHTML(ride.payment.method), detail: escapeHTML(ride.payment.detail) };
        let sub = Number(ride.fare) - (Number(ride.wait) || 0) * tariff.waitRate + (Number(ride.disc) || 0); 
        let waitC = (ride.wait || 0) * tariff.waitRate; 
        let discountRow = "";
        let waitRow = "";
        
        if (ride.disc > 0) {
            discountRow = `
            <tr>
                <td style="font-weight: bold; color: #ef4444; padding-bottom: 2px;">Discount:</td>
                <td style="text-align: right; font-weight: bold; color: #ef4444; padding-bottom: 2px;">-Rs.${ride.disc.toFixed(2)}</td>
            </tr>`;
        }
        if (waitC > 0) {
            waitRow = `
            <tr>
                <td style="font-weight: bold; padding-bottom: 2px;">Waiting (${ride.wait}m):</td>
                <td style="text-align: right; font-weight: bold; padding-bottom: 2px;">+Rs.${waitC.toFixed(2)}</td>
            </tr>`;
        }

        return `
            <div style="font-family: monospace; font-size: 11px; color: #000; line-height: 1.4; background: #fff; width: 100%; box-sizing: border-box; padding: 4px 6px;">
                ${isReprint ? `<div style="background: #ef4444; color: #fff; text-align: center; padding: 3px; font-weight: bold; border-radius: 6px; margin-bottom: 8px; text-transform: uppercase; font-size: 9px;">📋 REPRINT DUPLICATE</div>` : ''}
                
                <div style="text-align: center; font-weight: bold; font-size: 13px; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;">${escapeHTML(tariff.receiptName || SETTINGS.receiptName)}</div>
                <div style="border-bottom: 1px dashed #000; margin-bottom: 8px;"></div>
                
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 11px;">
                    <tr>
                        <td style="font-weight: bold; width: 35%; padding-bottom: 3px;">Receipt No:</td>
                        <td style="font-weight: bold; text-align: right; width: 65%; padding-bottom: 3px;">${ride.id}</td>
                    </tr>
                    <tr>
                        <td style="vertical-align: top; font-weight: bold; padding-bottom: 3px;">Tarikh /<br>Date:</td>
                        <td style="text-align: right; font-weight: bold; vertical-align: top; padding-bottom: 3px;">${new Date(ride.time).toLocaleDateString()} ${new Date(ride.time).toLocaleTimeString()}</td>
                    </tr>
                    <tr>
                        <td style="font-weight: bold; padding-bottom: 3px;">Mobile No:</td>
                        <td style="font-weight: bold; text-align: right; padding-bottom: 3px;">${ride.mobile || 'N/A'}</td>
                    </tr>
                </table>
                
                <div style="margin-bottom: 8px;">
                    <div style="font-weight: bold; text-transform: uppercase; margin-bottom: 1px;">Pickup Location:</div>
                    <div style="color: #000; font-size: 10px; word-break: break-word; line-height: 1.3;">${ride.from || 'Colombo, Sri Lanka'}</div>
                </div>
                
                <div style="margin-bottom: 10px;">
                    <div style="font-weight: bold; text-transform: uppercase; margin-bottom: 1px;">Drop Location:</div>
                    <div style="color: #000; font-size: 10px; word-break: break-word; line-height: 1.3;">${ride.to || 'Colombo, Sri Lanka'}</div>
                </div>
                
                ${ride.mode === 'Delivery' ? `
                <div style="border: 1px solid #000; border-radius: 6px; padding: 6px; margin-bottom: 8px; background: #f9f9f9;">
                    <div style="font-weight: bold; text-transform: uppercase; font-size: 10px; margin-bottom: 4px;">📦 DELIVERY & PICKUP DETAILS:</div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 9px;">
                        <tr>
                            <td style="font-weight: bold; width: 45%; padding-bottom: 2px;">Pickup Name:</td>
                            <td style="padding-bottom: 2px; word-break: break-word;">${ride.pickupName || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td style="font-weight: bold; width: 45%; padding-bottom: 2px;">Pickup Phone:</td>
                            <td style="padding-bottom: 2px; word-break: break-word;">${ride.pickupPhone || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td style="font-weight: bold; width: 45%; padding-bottom: 2px;">Delivery Name:</td>
                            <td style="padding-bottom: 2px; word-break: break-word;">${ride.deliveryName || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td style="font-weight: bold; width: 45%;">Delivery Phone:</td>
                            <td style="word-break: break-word;">${ride.deliveryPhone || 'N/A'}</td>
                        </tr>
                    </table>
                </div>
                ` : ''}
                
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 11px;">
                    <tr>
                        <td style="font-weight: bold; padding-bottom: 2px;">Durutto / Dist:</td>
                        <td style="text-align: right; font-weight: bold; padding-bottom: 2px;">${parseFloat(ride.km || 0).toFixed(2)} km</td>
                    </tr>
                    <tr>
                        <td style="font-weight: bold; padding-bottom: 2px;">Base tariff:</td>
                        <td style="text-align: right; font-weight: bold; padding-bottom: 2px;">Rs.${tariff.base.toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td style="font-weight: bold; padding-bottom: 2px;">Fare (incl. adjustments):</td>
                        <td style="text-align: right; font-weight: bold; padding-bottom: 2px;">Rs.${sub.toFixed(2)}</td>
                    </tr>
                    ${waitRow}
                    ${discountRow}
                    <tr>
                        <td style="font-weight: bold; padding-bottom: 2px;">Mode:</td>
                        <td style="text-align: right; font-weight: bold; padding-bottom: 2px;">${ride.mode || 'Auto'}</td>
                    </tr>
                    <tr>
                        <td style="font-weight: bold; padding-bottom: 2px;">Payment:</td>
                        <td style="text-align: right; font-weight: bold; padding-bottom: 2px;">${ride.payment ? ride.payment.method : 'Cash'}</td>
                    </tr>
                </table>
                
                <div style="border-bottom: 1px dashed #000; margin-bottom: 8px;"></div>
                
                <div style="border: 1px solid #000; border-radius: 8px; background: #fff; padding: 6px 10px; text-align: center; font-weight: bold; font-size: 12px; margin-bottom: 8px; letter-spacing: 0.5px;">
                    TOTAL: Rs. ${parseFloat(ride.fare || 0).toFixed(2)}
                </div>
                
                <div style="text-align: center; font-weight: bold; font-size: 10px; margin-bottom: 12px; padding: 0 4px; line-height: 1.2;">
                    ${numberToWords(ride.fare)}
                </div>
                
                <div style="display: flex; justify-content: center; position: relative; margin: 15px 0 10px 0; min-height: 85px;">
                    <div id="${qrContainerId}" style="background: #fff; padding: 4px; border: 1px solid #000; display: inline-block;"></div>
                    <div style="position: absolute; bottom: -5px; right: 25px; width: 58px; height: 58px; border-radius: 50%; border: 2px dashed #ef4444; display: flex; align-items: center; justify-content: center; color: #ef4444; font-size: 9px; font-weight: bold; transform: rotate(-15deg); text-transform: uppercase;">AMT PAID</div>
                </div>
                
                <div style="text-align: center; font-size: 9px; color: #555; margin-top: 10px;">
                    Thank you for riding with us!<br>Powered by Advance Meeter Taxi
                </div>
            </div>
        `;
    }

    // ========== STREAMING_CHUNK: Managing Location Picker on Live Interactive Leaflet Map ==========
    let activeMapField = null, pickerSearchLocation = null;
    function openMapPicker(field) {
        if (typeof L === 'undefined') { showToast('Map unavailable. Enter the address manually or reconnect to the internet.', 'warning'); return; }
        activeMapField = field;
        const modal = document.getElementById('map-modal');
        modal.style.display = 'flex';
        
        let titleText = "Select Pickup Location";
        if (field === 'end' || field === 'sch-end') {
            titleText = "Select Drop Location";
        }
        document.getElementById('map-title').innerText = titleText;
        
        setTimeout(() => {
            initPickerMap();
        }, 200);
    }
    
    function closeMapModal() {
        document.getElementById('map-modal').style.display = 'none';
    }
    
    function initPickerMap() {
        const defaultLat = pickerSearchLocation?.lat ?? currentLat ?? 6.9271;
        const defaultLng = pickerSearchLocation?.lng ?? currentLng ?? 79.8612;
        pickerSearchLocation=null;
        
        try {
            if (mapObj) { mapObj.remove(); }
            mapObj = L.map('map', { zoomControl: true }).setView([defaultLat, defaultLng], 14);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                maxZoom: 19
            }).addTo(mapObj);
            
            mapMarker = L.marker([defaultLat, defaultLng], { draggable: true }).addTo(mapObj);
            
            // Marker dragging updates address text box
            mapMarker.on('dragend', async function(e) {
                const position = mapMarker.getLatLng();
                const address = await reverseGeocodePicker(position.lat, position.lng);
                document.getElementById('selected-address').value = address;
            });
            
            // Clicking on map places marker
            mapObj.on('click', async function(e) {
                mapMarker.setLatLng(e.latlng);
                const address = await reverseGeocodePicker(e.latlng.lat, e.latlng.lng);
                document.getElementById('selected-address').value = address;
            });
            
            // Search function inside map picker
            const searchInput = document.getElementById('map-search');
            const resultsDiv = document.getElementById('search-results');
            
            searchInput.removeEventListener('input', handleMapSearchInput);
            searchInput.addEventListener('input', handleMapSearchInput);
            
            // Initial location reverse geocoding
            reverseGeocodePicker(defaultLat, defaultLng).then(addr => {
                document.getElementById('selected-address').value = addr;
            });
            
        } catch(e) {
            console.error("Picker map setup failed:", e);
        }
    }
    
    let mapSearchTimeout;
    function handleMapSearchInput() {
        const q = this.value.trim();
        const resultsDiv = document.getElementById('search-results');
        if (q.length < 3) { resultsDiv.style.display = 'none'; return; }
        
        clearTimeout(mapSearchTimeout);
        mapSearchTimeout = setTimeout(async () => {
            const results = await searchSriLankaLocations(q);
            resultsDiv.innerHTML = '';
            if (results.length === 0) {
                resultsDiv.innerHTML = '<div class="p-2 border-b border-slate-800 text-slate-400">No results.</div>';
            } else {
                results.forEach(p => {
                    const item = document.createElement('div');
                    item.className = 'p-2 border-b border-slate-850 hover:bg-slate-900 cursor-pointer text-xs truncate';
                    item.textContent = p.display_name.substring(0, 80);
                    item.onclick = () => {
                        const lat = parseFloat(p.lat);
                        const lon = parseFloat(p.lon);
                        mapMarker.setLatLng([lat, lon]);
                        mapObj.setView([lat, lon], 15);
                        document.getElementById('selected-address').value = p.display_name;
                        resultsDiv.style.display = 'none';
                    };
                    resultsDiv.appendChild(item);
                });
            }
            resultsDiv.style.display = 'block';
        }, 500);
    }
    
    async function reverseGeocodePicker(lat, lon) {
        try {
            const res = await fetchWithTimeout(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=en&countrycodes=lk`);
            const data = await res.json();
            return data.display_name || getSriLankaFallbackAddress(lat, lon);
        } catch(e) {
            return getSriLankaFallbackAddress(lat, lon);
        }
    }
    
    function useMapLocation() {
        const address = document.getElementById('selected-address').value;
        if (!address) return;
        
        // Dynamic targeting based on field parameter
        if (activeMapField === 'start') {
            document.getElementById('start-loc').value = address;
            startLocationAddress = address;
        } else if (activeMapField === 'end') {
            document.getElementById('end-loc').value = address;
            currentDestinationAddress = address;
        } else if (activeMapField === 'sch-start') {
            document.getElementById('sch-start').value = address;
            startLocationAddress = address;
        } else if (activeMapField === 'sch-end') {
            document.getElementById('sch-end').value = address;
            currentDestinationAddress = address;
        }
        
        closeMapModal();
        showToast("ස්ථානය සාර්ථකව තෝරා ගන්නා ලදී!", "success");
    }
    
    function getCurrentMapLocation() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(async pos => {
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;
                mapMarker.setLatLng([lat, lon]);
                mapObj.setView([lat, lon], 16);
                const address = await reverseGeocodePicker(lat, lon);
                document.getElementById('selected-address').value = address;
            });
        }
    }

    // ========== STREAMING_CHUNK: Upgraded Booking & Scheduling Methods ==========
    let lastScheduleReminder = "";
    function checkScheduleReminders() {
        const now = Date.now();
        let upcomingToday = 0;
        let upcomingThreeDays = 0;
        let upcomingWeek = 0;
        let absoluteNext = null;

        schedules.forEach(sch => {
            // Avoid reminder alerts for completed schedules
            if (sch.status === "completed") return;

            const schTime = new Date(sch.datetime).getTime();
            const diff = schTime - now;

            if (diff > 0) {
                if (diff <= 24 * 60 * 60 * 1000) upcomingToday++;
                if (diff <= 3 * 24 * 60 * 60 * 1000) upcomingThreeDays++;
                if (diff <= 7 * 24 * 60 * 60 * 1000) upcomingWeek++;

                if (!absoluteNext || schTime < new Date(absoluteNext.datetime).getTime()) {
                    absoluteNext = sch;
                }
            }
        });

        const alertBanner = document.getElementById('schedule-alert-banner');
        const alertText = document.getElementById('schedule-alert-text');

        if (upcomingWeek > 0) {
            alertBanner.classList.remove('hidden');
            let SinhaleseAlert = `ඉදිරි කාලය තුළ ගමන් ${upcomingWeek}ක් ඇත!`;
            if (upcomingThreeDays > 0) SinhaleseAlert = `ඉදිරි දින 3 තුළ ගමන් ${upcomingThreeDays}ක් ඇත!`;
            if (upcomingToday > 0) SinhaleseAlert = `🚨 අද දිනට සැලසුම් කල ගමන් ${upcomingToday}ක් පවතී!`;
            
            alertText.innerText = `${SinhaleseAlert} බැලීමට ක්ලික් කරන්න.`;
        } else {
            alertBanner.classList.add('hidden');
        }

        // Fire warning toast alerts on load for trips starting in 2 hours
        if (absoluteNext) {
            const diffMin = Math.round((new Date(absoluteNext.datetime).getTime() - now) / 60000);
            if (diffMin > 0 && diffMin <= 120 && lastScheduleReminder !== String(absoluteNext.id)) {
                lastScheduleReminder = String(absoluteNext.id);
                showToast(`📅 ළඟදීම ඇති ගමන: ${absoluteNext.name} (${diffMin} min ඇතුළත)`, 'warning');
                sendNotification('Upcoming Ride Alert', `Customer: ${absoluteNext.name} in ${diffMin} minutes!`);
            }
        }
    }

    function addNewSchedule() {
        const name = document.getElementById('sch-name').value.trim();
        const phone = document.getElementById('sch-phone').value.trim();
        const datetime = document.getElementById('sch-datetime').value;
        const startLoc = document.getElementById('sch-start').value.trim();
        const endLoc = document.getElementById('sch-end').value.trim();
        const km = parseFloat(document.getElementById('sch-km').value) || 0;
        const manualFare = parseFloat(document.getElementById('sch-manual-fare').value) || 0;
        const notes = document.getElementById('sch-notes').value.trim();

        if (!name || !phone || !datetime || !startLoc || !endLoc || !Number.isFinite(Date.parse(datetime)) || Date.parse(datetime) <= Date.now() || km < 0 || manualFare < 0) {
            showToast("කරුණාකර සියලුම අත්‍යවශ්‍ය විස්තර පුරවන්න!", "error");
            return;
        }

        const newSch = {
            id: Date.now(),
            name,
            phone,
            datetime,
            start: startLoc,
            end: endLoc,
            km,
            manualFare,
            notes,
            status: "pending" // track completion status
        };

        schedules.push(newSch);
        saveSchedules();

        // Reset Inputs
        document.getElementById('sch-name').value = '';
        document.getElementById('sch-phone').value = '';
        document.getElementById('sch-datetime').value = '';
        document.getElementById('sch-start').value = '';
        document.getElementById('sch-end').value = '';
        document.getElementById('sch-km').value = '';
        document.getElementById('sch-manual-fare').value = '';
        document.getElementById('sch-notes').value = '';

        // Collapse card accordion
        toggleAccordion('booking-accordion');
        showToast("නව කාලසටහන සාර්ථකව ඇතුළත් කරන ලදී!", "success");
        addSystemLog('INFO', 'New Ride Scheduled', `Customer: ${name}, Date: ${datetime}`);
    }

    function deleteSchedule(id) {
        if (confirm("මෙම කාලසටහන ඉවත් කිරීමට අවශ්‍ය බව ස්ථිරද?")) {
            schedules = schedules.filter(s => s.id !== id);
            saveSchedules();
            filterSchedulesTab(currentScheduleFilterTab);
            showToast("කාලසටහන සාර්ථකව ඉවත් කරන ලදී.", "success");
        }
    }

    // Export Scheduled Booking to Native System Calendar (.ics)
    function exportScheduleICS(sch) {
        const startObj = new Date(sch.datetime);
        const formatICSDate = (date) => {
            return date.getUTCFullYear() +
                String(date.getUTCMonth() + 1).padStart(2, '0') +
                String(date.getUTCDate()).padStart(2, '0') + 'T' +
                String(date.getUTCHours()).padStart(2, '0') +
                String(date.getUTCMinutes()).padStart(2, '0') +
                String(date.getUTCSeconds()).padStart(2, '0') + 'Z';
        };
        const dtstart = formatICSDate(startObj);
        const endObj = new Date(startObj.getTime() + 60 * 60 * 1000); 
        const dtend = formatICSDate(endObj);
        const dtstamp = formatICSDate(new Date());
        
        const summary = `AMT Taxi: ${escapeHTML(sch.name)}`;
        const description = `Customer: ${escapeHTML(sch.name)}\\nPhone: ${escapeHTML(sch.phone)}\\nPickup: ${escapeHTML(sch.start)}\\nDrop: ${escapeHTML(sch.end)}\\nNotes: ${escapeHTML(sch.notes || 'No notes')}`;
        const location = `${escapeHTML(sch.start)} to ${escapeHTML(sch.end)}`;
        
        const icsContent = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Advance Meeter Taxi//Schedule Calendar//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'BEGIN:VEVENT',
            `UID:amt-schedule-${sch.id}@advancemeetertaxi.com`,
            `DTSTAMP:${dtstamp}`,
            `DTSTART:${dtstart}`,
            `DTEND:${dtend}`,
            `SUMMARY:${summary}`,
            `DESCRIPTION:${description}`,
            `LOCATION:${location}`,
            'BEGIN:VALARM',
            'ACTION:DISPLAY',
            'DESCRIPTION:Upcoming Taxi Ride Schedule Alert',
            'TRIGGER:-PT15M', 
            'END:VALARM',
            'END:VEVENT',
            'END:VCALENDAR'
        ].join('\r\n');
        
        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', `schedule-${sch.name.replace(/\s+/g, '_')}-${sch.id}.ics`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('ICS Calendar File Downloaded!', 'success');
        addSystemLog('INFO', 'ICS exported', `ID: ${sch.id}`);
    }

    // Immediate Load and Start sequence
    function loadAndStartSchedule(id) {
        if (sTime || pendingRideData || loadRideState()) { showToast('Finish or restore the current ride first.', 'warning'); return; }
        const sch = schedules.find(s => s.id == id);
        if (!sch || sch.status === "completed") return;
        
        // Setup console tracking parameters
        setMode('manual');
        totalMeters=Math.max(0,Number(sch.km)||0)*1000;
        document.getElementById('manual-km-input').value=(totalMeters/1000).toFixed(2);
        document.getElementById('customer-name').value=sch.name||'';
        document.getElementById('start-loc').value = sch.start;
        document.getElementById('end-loc').value = sch.end;
        document.getElementById('mobile').value = sch.phone;
        
        // Handle pre-defined manual fee parameters
        if (sch.manualFare > 0) {
            document.getElementById('manual-fare').value = sch.manualFare;
            activeBookingManualFare = sch.manualFare;
        } else {
            document.getElementById('manual-fare').value = '';
            activeBookingManualFare = null;
        }

        startLocationAddress = sch.start;
        currentDestinationAddress = sch.end;
        activeBookingId = sch.id; // binds schedule to execution session

        closeM('schedule-manager-modal');
        
        const bookingAccordion = document.getElementById('booking-accordion');
        if (bookingAccordion && bookingAccordion.classList.contains('open')) {
            toggleAccordion('booking-accordion');
        }
        
        // Execute instant ride start sequence
        setTimeout(() => {
            startRide();
            showToast(`Schedule loaded instantly for ${escapeHTML(sch.name)}! 🚕`, 'success');
        }, 300);
    }

    function openScheduleManager() {
        document.getElementById('schedule-manager-modal').style.display = 'flex';
        filterSchedulesTab('all');
    }

    function openScheduleManagerFromSettings() {
        closeM('settings-modal');
        openScheduleManager();
    }

    function filterSchedulesTab(tab) {
        currentScheduleFilterTab = tab;
        document.querySelectorAll('.sch-filter-btn').forEach(btn => {
            btn.classList.remove('bg-indigo-600', 'text-white');
            btn.classList.add('text-slate-400');
        });

        const activeBtn = document.getElementById(`sch-tab-${tab}`);
        if (activeBtn) {
            activeBtn.classList.add('bg-indigo-600', 'text-white');
            activeBtn.classList.remove('text-slate-400');
        }

        renderSchedulesList(tab);
    }

    function renderSchedulesList(filter) {
        const now = Date.now();
        let listContainer = document.getElementById('schedule-list');
        let filtered = [];

        if (filter === 'all') {
            filtered = [...schedules];
        } else if (filter === 'today') {
            filtered = schedules.filter(s => {
                const diff = new Date(s.datetime).getTime() - now;
                return diff >= 0 && diff <= 24 * 60 * 60 * 1000;
            });
        } else if (filter === '3days') {
            filtered = schedules.filter(s => {
                const diff = new Date(s.datetime).getTime() - now;
                return diff >= 0 && diff <= 3 * 24 * 60 * 60 * 1000;
            });
        } else if (filter === 'week') {
            filtered = schedules.filter(s => {
                const diff = new Date(s.datetime).getTime() - now;
                return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
            });
        }

        // Sort schedules chronologically
        filtered.sort((a,b) => new Date(a.datetime) - new Date(b.datetime));

        // Update stats banner report
        document.getElementById('schedule-reports-summary').innerHTML = `
            <div class="grid grid-cols-2 gap-2 text-xs">
                <div>සැලසුම් කළ ගමන්: <b class="text-indigo-400">${filtered.length}</b></div>
                <div>සමස්ත ගමන් දුර: <b class="text-blue-400">${filtered.reduce((acc,curr) => acc + (parseFloat(curr.km) || 0), 0).toFixed(1)} KM</b></div>
            </div>
        `;

        if (filtered.length === 0) {
            listContainer.innerHTML = '<div class="text-slate-500 py-10 text-center">කිසිදු සැලසුම් කළ ගමනක් හමු නොවිණි.</div>';
            return;
        }

        listContainer.innerHTML = filtered.map(sch => {
            const schDate = new Date(sch.datetime);
            const isCompleted = sch.status === "completed";
            const statusBadge = isCompleted 
                ? `<span class="text-[9px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full">🟢 Completed</span>`
                : `<span class="text-[9px] font-mono text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded-full">🕒 Pending</span>`;

            return `
                <div class="p-3 bg-slate-950 border ${isCompleted ? 'border-emerald-950/40' : 'border-slate-800'} rounded-xl space-y-2">
                    <div class="flex justify-between items-center border-b border-slate-900 pb-1.5">
                        <div>
                            <span class="font-extrabold text-indigo-400 text-xs">${escapeHTML(sch.name)}</span>
                            <span class="text-[9px] text-slate-500 block">${escapeHTML(sch.phone)}</span>
                        </div>
                        <div class="flex flex-col items-end gap-1">
                            ${statusBadge}
                            <span class="text-[8px] text-slate-500">${schDate.toLocaleDateString()} ${schDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                    </div>
                    <div class="text-[9px] text-slate-300 grid grid-cols-2 gap-1 bg-slate-900/50 p-2 rounded-lg">
                        <div>📍 Pickup: <b class="text-white truncate block max-w-[150px]">${escapeHTML(sch.start)}</b></div>
                        <div>🏁 Drop: <b class="text-white truncate block max-w-[150px]">${escapeHTML(sch.end)}</b></div>
                        <div>📏 KM: <b class="text-white">${sch.km ? sch.km + ' km' : 'N/A'}</b></div>
                        <div>💰 Fare: <b class="text-emerald-400 font-bold">${sch.manualFare > 0 ? 'Rs. ' + sch.manualFare : 'Meter'}</b></div>
                    </div>
                    <div class="grid grid-cols-3 gap-1.5 pt-1">
                        <button class="py-1.5 bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:text-white font-bold rounded-lg text-[9px] transition ${isCompleted ? 'opacity-40 cursor-not-allowed' : ''}" onclick="${isCompleted ? '' : `loadAndStartSchedule(${sch.id})`}">
                            🚀 Load & Start
                        </button>
                        <button class="py-1.5 bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 hover:text-white font-bold rounded-lg text-[9px] transition flex justify-center items-center gap-1" onclick="exportScheduleICS(${escapeHTML(JSON.stringify(sch))})">
                            📅 Export ICS
                        </button>
                        <button class="py-1.5 bg-red-600/20 border border-red-500/30 text-red-400 hover:text-white font-bold rounded-lg text-[9px] transition" onclick="deleteSchedule(${sch.id})">
                            🗑️ Delete
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ========== STREAMING_CHUNK: Integrating Dynamic Analytical Engine Reports & History Statuses ==========
    function openReportsMenu() {
        closeM('settings-modal');
        document.getElementById('reports-menu-modal').style.display = 'flex';
    }

    function openPanel(id) {
        closeM('reports-menu-modal');
        document.getElementById(id).style.display = 'flex';
        if (id === 'report-modal') showReportTab(currentReportType);
        if (id === 'income-modal') {
            loadEarningsChart();
        } else if (id === 'history-modal') {
            filterHistory('today');
        }
    }

    // ========== STREAMING_CHUNK: Ride History Realizations with Scheduled Flag Outputs ==========
    function filterHistory(filter) {
        document.getElementById('custom-date-range').classList.toggle('hidden', filter !== 'custom');
        setActiveReportTab('history-modal', 'filterHistory', filter);
        const rides = filter === 'custom' ? filterByPeriod(readStoredList('rides'), 'time', 'range', 'history') : readStoredList('rides');
        const list = document.getElementById('history-list');
        if (!list) return;

        let filtered = [...rides];
        const now = new Date();

        if (filter === 'today') {
            filtered = rides.filter(r => new Date(r.time).toDateString() === now.toDateString());
        } else if (filter === 'week') {
            const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            filtered = rides.filter(r => new Date(r.time) >= oneWeekAgo);
        } else if (filter === 'month') {
            const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            filtered = rides.filter(r => new Date(r.time) >= oneMonthAgo);
        }

        // Sort reverse chronological
        filtered.sort((a,b) => b.time - a.time);

        list.innerHTML = filtered.map(r => {
            const isBookingCompleted = r.bookingId !== undefined && r.bookingId !== null;
            const badgeHTML = isBookingCompleted 
                ? `<span class="px-2 py-0.5 text-[8px] font-bold text-emerald-400 bg-emerald-500/10 rounded-full">🟢 Trip Completed</span>`
                : `<span class="px-2 py-0.5 text-[8px] font-bold text-blue-400 bg-blue-500/10 rounded-full">🚗 Regular Ride</span>`;

            return `
                <div class="p-3 bg-slate-950 border ${isBookingCompleted ? 'border-emerald-950/50' : 'border-slate-850'} rounded-xl space-y-2">
                    <div class="flex justify-between items-center border-b border-slate-900 pb-1.5">
                        <div>
                            <span class="font-extrabold text-slate-300 text-xs">${escapeHTML(r.id)}</span>
                            <span class="text-[9px] text-slate-500 block">${new Date(r.time).toLocaleString()}</span>
                        </div>
                        <div class="flex flex-col items-end gap-1">
                            <span class="text-xs text-emerald-400 font-extrabold">Rs.${r.fare.toFixed(2)}</span>
                            ${badgeHTML}
                        </div>
                    </div>
                    <div class="text-[9px] text-slate-400 space-y-1">
                        <div>📍 Pickup: <b class="text-slate-300">${escapeHTML(r.from)}</b></div>
                        <div>🏁 Drop: <b class="text-slate-300">${escapeHTML(r.to)}</b></div>
                        <div class="flex justify-between text-[8px] text-slate-500">
                            <span>📏 KM: ${r.km.toFixed(2)}</span>
                            <span>Payment: ${escapeHTML(r.payment ? r.payment.method : 'Cash')}</span>
                        </div>
                    </div>
                    <div class="flex gap-2 pt-1">
                        <button class="flex-1 py-1 bg-slate-900 border border-slate-800 text-slate-300 rounded-lg text-[9px] font-bold" onclick="showReceipt(${escapeHTML(JSON.stringify(r))}, true)">🖨️ Reprint Bill</button>
                    </div>
                </div>
            `;
        }).join('') || '<div class="text-slate-500 py-10 text-center">කිසිදු ධාවන සටහනක් හමු නොවිණි.</div>';
    }

    function showReportTab(tab) {
        currentReportType = tab;
        setActiveReportTab('report-modal', 'showReportTab', tab);
        const rides = filterByPeriod(readStoredList('rides'), 'time', tab);
        const container = document.getElementById('report-container');
        if (!container) return;

        let totalRides = 0;
        let totalCash = 0;
        let totalRevenue = 0;

        rides.forEach(r => {
            totalRides++;
            totalRevenue += parseFloat(r.fare) || 0;
            if (r.payment && r.payment.method === 'Cash') {
                totalCash += parseFloat(r.fare) || 0;
            }
        });

        container.innerHTML = `
            <div class="bg-slate-950 border border-slate-850 p-3 rounded-xl space-y-2.5 text-center text-xs">
                <div class="text-[9px] text-slate-500 font-extrabold uppercase">SUMMARY METRICS</div>
                <div class="grid grid-cols-3 gap-2 divide-x divide-slate-800">
                    <div>Rides:<br><strong class="text-blue-400">${totalRides}</strong></div>
                    <div>Revenue:<br><strong class="text-emerald-400">Rs.${totalRevenue.toFixed(0)}</strong></div>
                    <div>Cash Hand:<br><strong class="text-amber-400">Rs.${totalCash.toFixed(0)}</strong></div>
                </div>
            </div>
            <div class="max-h-36 overflow-y-auto divide-y divide-slate-850 custom-scrollbar pr-1 pt-1 space-y-1">
                ${rides.map(r => {
                    const isCompleted = r.bookingId !== undefined && r.bookingId !== null;
                    return `
                        <div class="flex justify-between items-center py-2 text-[9px] border-b border-slate-850/60">
                            <div>
                                <span class="font-bold text-slate-300 block">${escapeHTML(r.id)}</span>
                                <span class="text-slate-500 block">${new Date(r.time).toLocaleDateString()}</span>
                                ${isCompleted ? '<span class="text-[7px] text-emerald-400 uppercase font-bold">🟢 Trip Completed</span>' : ''}
                            </div>
                            <div class="text-right">
                                <span class="text-emerald-400 font-extrabold font-mono block">Rs.${r.fare.toFixed(2)}</span>
                                <span class="text-slate-400 text-[8px] block">${escapeHTML(r.payment ? r.payment.method : 'Cash')}</span>
                            </div>
                        </div>
                    `;
                }).join('') || '<div class="text-slate-500 py-10 text-center">No transaction records found.</div>'}
            </div>
        `;
    }

    function loadEarningsChart() {
        const rides = readStoredList('rides');
        const ctx = document.getElementById('earningsChart')?.getContext('2d');
        if (!ctx) return;

        let dataPoints = {};
        rides.forEach(r => {
            const day = new Date(r.time).toLocaleDateString();
            dataPoints[day] = (dataPoints[day] || 0) + parseFloat(r.fare);
        });

        const days = Array.from({length:7}, (_,i) => { const d = new Date(); d.setDate(d.getDate()-6+i); return d.toLocaleDateString(); });
        const labels = days;
        const data = days.map(day => dataPoints[day] || 0);

        // Render cumulative total stats
        const cumulative = rides.reduce((acc,curr) => acc + (parseFloat(curr.fare) || 0), 0);
        const todayStr = new Date().toLocaleDateString();
        const todayVal = dataPoints[todayStr] || 0;
        
        document.getElementById('stat-today').innerText = `Rs.${todayVal.toFixed(2)}`;
        document.getElementById('stat-total').innerText = `Rs.${cumulative.toFixed(2)}`;

        if (typeof Chart === 'undefined') { showToast('Chart unavailable; totals are still shown.', 'warning'); return; }
        if (window.earningsChartObj) window.earningsChartObj.destroy();
        window.earningsChartObj = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Revenue (LKR)',
                    data: data,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37,99,235,0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                scales: {
                    x: { ticks: { color: '#94a3b8', font: { size: 8 } } },
                    y: { ticks: { color: '#94a3b8', font: { size: 8 } } }
                },
                plugins: { legend: { display: false } }
            }
        });
    }

    function downloadCSV() {
        downloadRowsCSV('revenue_logs.csv',['Receipt','Date','Pickup','Drop','KM','Fare LKR','Mode','Payment'],rideExportRows(readStoredList('rides')));
    }

    // ========== Fuel registries log features ==========
    let fuelLogs = readStoredList('fuel_logs');
    
    function openFuelLogModal() {
        closeM('settings-modal');
        document.getElementById('fuel-modal').style.display = 'flex';
        document.getElementById('fuel-date').value = localDateKey(new Date());
        renderFuelLogsList();
    }
    
    function addFuelLog() {
        const date = document.getElementById('fuel-date').value;
        const liters = parseFloat(document.getElementById('fuel-liters').value) || 0;
        const price = parseFloat(document.getElementById('fuel-price').value) || 0;
        const total = liters * price;
        const notes = document.getElementById('fuel-notes').value.trim();
        
        if (!date || !Number.isFinite(total) || liters <= 0 || price <= 0) {
            showToast("කරුණාකර සියලු විස්තර නිවැරදිව පුරවන්න!", "error");
            return;
        }
        
        const newLog = { id: Date.now(), date, liters, price, total, notes };
        fuelLogs.unshift(newLog);
        cloudStore.setItem('fuel_logs', JSON.stringify(fuelLogs));
        
        document.getElementById('fuel-liters').value = '';
        document.getElementById('fuel-price').value = '';
        document.getElementById('fuel-total').value = '';
        document.getElementById('fuel-notes').value = '';
        
        showToast("ඉන්ධන සටහන සාර්ථකව එක් කරන ලදී!", "success");
        renderFuelLogsList();
    }
    
    document.getElementById('fuel-liters')?.addEventListener('input', calculateFuelTotal);
    document.getElementById('fuel-price')?.addEventListener('input', calculateFuelTotal);
    
    function calculateFuelTotal() {
        const liters = parseFloat(document.getElementById('fuel-liters').value) || 0;
        const price = parseFloat(document.getElementById('fuel-price').value) || 0;
        document.getElementById('fuel-total').value = (liters * price).toFixed(2);
    }
    
    function deleteFuelLog(id) {
        fuelLogs = fuelLogs.filter(log => log.id !== id);
        cloudStore.setItem('fuel_logs', JSON.stringify(fuelLogs));
        showToast("ඉන්ධන සටහන ඉවත් කරන ලදී.", "info");
        renderFuelLogsList();
    }
    
    function renderFuelLogsList() {
        const container = document.getElementById('fuel-list');
        if (!container) return;
        
        container.innerHTML = fuelLogs.map(log => `
            <div class="flex justify-between items-center py-2 text-[9px] border-b border-slate-850">
                <div>
                    <span class="font-bold text-slate-300 block">${log.liters.toFixed(2)} Liters (${new Date(log.date).toLocaleDateString()})</span>
                    <span class="text-slate-500 text-[8px] block">${escapeHTML(log.notes || 'ඉන්ධන පිරවීම')}</span>
                </div>
                <div class="flex items-center gap-3">
                    <span class="text-emerald-400 font-bold font-mono">Rs.${log.total.toFixed(0)}</span>
                    <button class="text-red-500 font-bold hover:text-red-400" onclick="deleteFuelLog(${log.id})">✕</button>
                </div>
            </div>
        `).join('') || '<div class="text-slate-500 py-6 text-center">ඉන්ධන සටහන් කිසිවක් නොමැත.</div>';
    }

    // ========== Repair Servicing Record Log features ==========
    let repairLogs = readStoredList('repair_logs');
    
    function openRepairLogModal() {
        closeM('settings-modal');
        document.getElementById('repair-modal').style.display = 'flex';
        document.getElementById('repair-date').value = localDateKey(new Date());
        renderRepairLogsList();
    }
    
    function addRepairLog() {
        const date = document.getElementById('repair-date').value;
        const desc = document.getElementById('repair-desc').value.trim();
        const cost = parseFloat(document.getElementById('repair-cost').value) || 0;
        const garage = document.getElementById('repair-garage').value.trim();
        const notes = document.getElementById('repair-notes').value.trim();
        
        if (!date || !desc || !Number.isFinite(cost) || cost <= 0) {
            showToast("කරුණාකර සියලු විස්තර නිවැරදිව පුරවන්න!", "error");
            return;
        }
        
        const newLog = { id: Date.now(), date, desc, cost, garage, notes };
        repairLogs.unshift(newLog);
        cloudStore.setItem('repair_logs', JSON.stringify(repairLogs));
        
        document.getElementById('repair-desc').value = '';
        document.getElementById('repair-cost').value = '';
        document.getElementById('repair-garage').value = '';
        document.getElementById('repair-notes').value = '';
        
        showToast("සේවා සටහන සාර්ථකව එක් කරන ලදී!", "success");
        renderRepairLogsList();
    }
    
    function deleteRepairLog(id) {
        repairLogs = repairLogs.filter(log => log.id !== id);
        cloudStore.setItem('repair_logs', JSON.stringify(repairLogs));
        showToast("සේවා සටහන ඉවත් කරන ලදී.", "info");
        renderRepairLogsList();
    }
    
    function renderRepairLogsList() {
        const container = document.getElementById('repair-list');
        if (!container) return;
        
        container.innerHTML = repairLogs.map(log => `
            <div class="flex justify-between items-center py-2 text-[9px] border-b border-slate-850">
                <div>
                    <span class="font-bold text-slate-300 block">${escapeHTML(log.desc)} (${new Date(log.date).toLocaleDateString()})</span>
                    <span class="text-slate-500 text-[8px] block">${escapeHTML(log.garage || 'ප්‍රධාන ගරාජය')}</span>
                </div>
                <div class="flex items-center gap-3">
                    <span class="text-emerald-400 font-bold font-mono">Rs.${log.cost.toFixed(0)}</span>
                    <button class="text-red-500 font-bold hover:text-red-400" onclick="deleteRepairLog(${log.id})">✕</button>
                </div>
            </div>
        `).join('') || '<div class="text-slate-500 py-6 text-center">සේවා සටහන් කිසිවක් නොමැත.</div>';
    }

    // ========== Cumulative Analytical Calculations ==========
    function openFuelReport() {
        closeM('fuel-modal');
        document.getElementById('fuel-report-modal').style.display = 'flex';
        updateFuelReport();
    }
    function updateFuelReport() {
        if (!validateReportRange('fuel')) return;
        const fuelLogs = filterByPeriod(readStoredList('fuel_logs'), 'date', reportPeriods.fuel, 'fuel');
        const container = document.getElementById('fuel-report-container');
        if (!container) return;
        
        const totalCost = fuelLogs.reduce((acc,curr) => acc + curr.total, 0);
        const totalLiters = fuelLogs.reduce((acc,curr) => acc + curr.liters, 0);
        
        container.innerHTML = `
            <div class="bg-slate-950 p-3.5 border border-slate-850 rounded-xl space-y-2 text-center text-xs">
                <div class="text-[9px] text-blue-500 font-bold uppercase">FUEL REPORT METRICS</div>
                <div class="grid grid-cols-2 gap-2 text-center">
                    <div>Total Cost:<br><b class="text-emerald-400 text-xs">Rs.${totalCost.toFixed(0)}</b></div>
                    <div>Total Liters:<br><b class="text-blue-400 text-xs">${totalLiters.toFixed(1)} L</b></div>
                </div>
            </div>
            <div class="py-2.5 max-h-36 overflow-y-auto divide-y divide-slate-850 custom-scrollbar pr-1">
                ${fuelLogs.map(log => `
                    <div class="flex justify-between items-center py-2 text-[9px] border-b border-slate-850">
                        <div>
                            <span class="font-bold text-slate-300 block">${log.liters.toFixed(1)} Liters</span>
                            <span class="text-slate-500 block">${new Date(log.date).toLocaleDateString()}</span>
                        </div>
                        <div class="text-right">
                            <span class="text-emerald-400 font-bold font-mono block">Rs.${log.total.toFixed(0)}</span>
                            <span class="text-slate-500 text-[8px] block">Rs.${log.price.toFixed(0)}/L</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    function openRepairReport() {
        closeM('repair-modal');
        document.getElementById('repair-report-modal').style.display = 'flex';
        updateRepairReport();
    }
    function updateRepairReport() {
        if (!validateReportRange('repair')) return;
        const repairLogs = filterByPeriod(readStoredList('repair_logs'), 'date', reportPeriods.repair, 'repair');
        const container = document.getElementById('repair-report-container');
        if (!container) return;
        
        const totalCost = repairLogs.reduce((acc,curr) => acc + curr.cost, 0);
        
        container.innerHTML = `
            <div class="bg-slate-950 p-3.5 border border-slate-850 rounded-xl space-y-2 text-center text-xs">
                <div class="text-[9px] text-blue-500 font-bold uppercase">REPAIR COMPILATION SUMMARY</div>
                <div>Total Maintenance Cost:<br><b class="text-red-400 text-sm font-black">Rs.${totalCost.toFixed(2)}</b></div>
            </div>
            <div class="py-2.5 max-h-36 overflow-y-auto divide-y divide-slate-850 custom-scrollbar pr-1">
                ${repairLogs.map(log => `
                    <div class="flex justify-between items-center py-2 text-[9px] border-b border-slate-850">
                        <div>
                            <span class="font-bold text-slate-300 block">${escapeHTML(log.desc)}</span>
                            <span class="text-slate-500 block">${new Date(log.date).toLocaleDateString()} (${escapeHTML(log.garage)})</span>
                        </div>
                        <span class="text-red-400 font-bold font-mono">Rs.${log.cost.toFixed(0)}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function openProfitReport() {
        closeM('reports-menu-modal');
        document.getElementById('profit-report-modal').style.display = 'flex';
        updateProfitReport();
    }
    
    function updateProfitReport() {
        if (!validateReportRange('profit')) return;
        const rides = filterByPeriod(readStoredList('rides'), 'time', reportPeriods.profit, 'profit');
        const fuelLogs = filterByPeriod(readStoredList('fuel_logs'), 'date', reportPeriods.profit, 'profit');
        const repairLogs = filterByPeriod(readStoredList('repair_logs'), 'date', reportPeriods.profit, 'profit');
        const totalRevenue = rides.reduce((acc,curr) => acc + (parseFloat(curr.fare) || 0), 0);
        const totalFuel = fuelLogs.reduce((acc,curr) => acc + curr.total, 0);
        const totalRepairs = repairLogs.reduce((acc,curr) => acc + curr.cost, 0);
        const netProfit = totalRevenue - (totalFuel + totalRepairs);
        
        const container = document.getElementById('profit-report-container');
        if (container) {
            container.innerHTML = `
                <div class="bg-slate-950 p-3 border border-slate-850 rounded-xl space-y-2 text-xs">
                    <div class="text-[8px] text-blue-500 font-bold uppercase text-center mb-1">FINANCIAL PROFILE</div>
                    <div class="grid grid-cols-3 gap-2 text-center divide-x divide-slate-800">
                        <div>Revenue:<br><strong class="text-emerald-400 text-[11px]">Rs.${totalRevenue.toFixed(0)}</strong></div>
                        <div>Expenses:<br><strong class="text-red-400 text-[11px]">Rs.${(totalFuel + totalRepairs).toFixed(0)}</strong></div>
                        <div>Net Profit:<br><strong class="text-blue-400 text-[11px]">Rs.${netProfit.toFixed(0)}</strong></div>
                    </div>
                </div>
            `;
        }
        
        const ctx = document.getElementById('profitChart')?.getContext('2d');
        if (ctx && typeof Chart !== 'undefined') {
            if (window.profitChartObj) window.profitChartObj.destroy();
            window.profitChartObj = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Revenue', 'Fuel', 'Repairs'],
                    datasets: [{
                        data: [totalRevenue, totalFuel, totalRepairs],
                        backgroundColor: ['#10b981', '#ef4444', '#f59e0b'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { labels: { color: '#fff', font: { size: 8 } } } }
                }
            });
        }
    }

    // ========== Local Dynamic Backups Engine ==========
    let localBackups = readStoredList('local_backups');
    
    function triggerRollingBackup() {
        if(document.getElementById('auto-backup-toggle')?.checked)downloadSystemBackupFile();
    }
    
    function renderLocalBackupsList() {
        const container = document.getElementById('local-backups-list');
        if (!container) return;
        
        container.innerHTML = localBackups.map(b => `
            <div class="flex justify-between items-center p-2 bg-slate-950 border border-slate-850 rounded-xl text-[9px] text-slate-300">
                <span>Backup: ${new Date(b.date).toLocaleString()}</span>
                <button class="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white font-bold" onclick="restoreFromLocalBackup(${b.id})">Restore</button>
            </div>
        `).join('') || '<div class="text-slate-500 py-4 text-center">No local backups stored.</div>';
    }
    
    function restoreFromLocalBackup(id) {
        if (sTime || pendingRideData) { showToast('Finish the ride and payment before restoring.', 'warning'); return; }
        const backup=localBackups.find(b=>b.id===id);
        if (!backup || !validateBackup(backup)) { showToast('This backup has invalid data.', 'error'); return; }
        if (!confirm('Replace current data with this backup?')) return;
        if (applyBackup(backup)) location.reload();
    }
    
    function downloadSystemBackupFile() {
        const backup = {
            rides: readStoredList('rides'),
            fuel: readStoredList('fuel_logs'),
            repairs: readStoredList('repair_logs'),
            settings: SETTINGS,
            schedules: schedules
        };
        
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], {type: 'application/json'}));
        a.download = `AMT_SYSTEM_BACKUP_${Date.now()}.json`;
        a.click();
        showToast('System Backup JSON File Exported!', 'success');
    }
    
    function restoreSystemFromFile() {
        if (sTime || pendingRideData) { showToast('Finish the ride and payment before restoring.', 'warning'); return; }
        const file=document.getElementById('backup-file-picker').files?.[0];
        if (!file) { showToast('Choose a JSON backup file first.', 'warning'); return; }
        const reader=new FileReader();
        reader.onerror=()=>showToast('Could not read the backup file.', 'error');
        reader.onload=()=>{
            try {
                const data=JSON.parse(reader.result);
                if (!validateBackup(data)) { showToast('Invalid backup data. Existing records were kept.', 'error'); return; }
                if (confirm('Replace current data with this backup?') && applyBackup(data)) location.reload();
            } catch(e) { showToast('Invalid JSON backup. Existing records were kept.', 'error'); }
        };
        reader.readAsText(file);
    }
    
    function toggleAutoBackupPref() {
        cloudStore.setItem('auto_backup_pref', document.getElementById('auto-backup-toggle').checked);
        showToast("Auto Backup settings updated", "success");
    }

    // ========== STREAMING_CHUNK: Bootup Sequence initialization ==========
    window.onload = async function () {
        if (trackingQuery) return;
        await cloudStore.connect();
        schedules=readStoredList('amt_schedules'); fuelLogs=readStoredList('fuel_logs'); repairLogs=readStoredList('repair_logs'); systemLogs=readStoredList('system_logs'); localBackups=readStoredList('local_backups');
        const savedSettings = cloudStore.getItem('settings');
        if (savedSettings) {
            try { SETTINGS = { ...SETTINGS, ...JSON.parse(savedSettings) }; } catch(e){}
        }
        
        document.getElementById('set-app-name').value = SETTINGS.appName;
        document.getElementById('set-receipt-header').value = SETTINGS.receiptName;
        document.getElementById('set-base').value = SETTINGS.base;
        document.getElementById('set-rate').value = SETTINGS.rate;
        document.getElementById('set-wait').value = SETTINGS.waitRate;
        document.getElementById('set-night').value = SETTINGS.nightPercent;

        document.getElementById('display-app-name').innerHTML = escapeHTML(SETTINGS.appName).replace(" ", "<br>");
        
        const autoBackupCheck = document.getElementById('auto-backup-toggle');
        if (autoBackupCheck) {
            autoBackupCheck.checked = cloudStore.getItem('auto_backup_pref') === 'true';
        }
        
        checkScheduleReminders();
        renderLocalBackupsList();
        
        // Default execution mode
        setMode('auto');
        loadRideState();
        try { pendingRideData = JSON.parse(cloudStore.getItem('amt_pending_payment') || 'null'); } catch(e) {}
        if (pendingRideData && readStoredList('rides').some(r => r.id === pendingRideData.id)) { pendingRideData=null; cloudStore.removeItem('amt_pending_payment'); }
        if (pendingRideData) { cloudStore.removeItem('amt_ride_state'); document.getElementById('restore-banner').classList.add('hidden'); openPaymentPopup(); }
        document.querySelectorAll('input, select').forEach(el => { el.addEventListener('change', saveRideState); el.addEventListener('input', saveRideState); });
        document.addEventListener('visibilitychange', () => { if (!document.hidden && sTime) requestWakeLock(); });
        window.addEventListener('pagehide', saveRideState);
        setInterval(checkScheduleReminders, 30000);
        if (window.nativeMeter?.supported) setInterval(()=>{if(sTime && !rideEnding) syncNativeMeter().catch(e=>cloudStore.reportStatus(e.message));},3000);
        
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    };

    // ========== HELPER ROUTINES ==========
    function generateTrackingId() { return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join(''); }
    function closeM(id) { document.getElementById(id).style.display = 'none'; }
    function openLogin() { document.getElementById('settings-modal').style.display='flex'; }
    function checkLogin() {
        openLogin();
    }
    function closeSettingsAndLogout() { document.getElementById('settings-modal').style.display = 'none'; }
    function openAppSettings() {
        document.getElementById('settings-modal').style.display = 'none';
        document.getElementById('app-settings-modal').style.display = 'flex';
    }
    function openDatabaseBackupModal() {
        document.getElementById('settings-modal').style.display = 'none';
        document.getElementById('db-backup-modal').style.display = 'flex';
    }
    
    async function saveSettings() {
        if(settingsSaving)return;
        if (sTime || pendingRideData) { showToast("Finish the ride and payment before changing tariffs.", "warning"); return; }
        if (['set-base','set-rate','set-wait','set-night'].some(id => {
            const val = document.getElementById(id).value;
            return val.trim() === '' || !Number.isFinite(Number(val)) || Number(val) < 0 || Number(val)>1000000;
        })) { showToast('Enter valid non-negative rates.', 'error'); return; }
        if(['set-app-name','set-receipt-header'].some(id=>document.getElementById(id).value.trim().length>120)){showToast('Names must be 120 characters or fewer.','error');return;}
        settingsSaving=true;
        document.getElementById('save-settings-button').disabled=true;
        try {
        SETTINGS.appName = document.getElementById('set-app-name').value.trim() || SETTINGS.appName;
        SETTINGS.receiptName = document.getElementById('set-receipt-header').value.trim() || SETTINGS.receiptName;
        SETTINGS.base = Number(document.getElementById('set-base').value);
        SETTINGS.rate = Number(document.getElementById('set-rate').value);
        SETTINGS.waitRate = Number(document.getElementById('set-wait').value);
        SETTINGS.nightPercent = Number(document.getElementById('set-night').value);

        
        cloudStore.setItem('settings', JSON.stringify(SETTINGS));
        await cloudStore.flush();
        document.getElementById('display-app-name').innerHTML = escapeHTML(SETTINGS.appName).replace(" ", "<br>");
        
        closeM('app-settings-modal');
        document.getElementById('settings-modal').style.display = 'flex';
        updateDisplay();
        showToast("Configs updated!", "success");
        } catch(e) {showToast('Configurations are not saved: '+e.message,'error');}
        finally {settingsSaving=false;document.getElementById('save-settings-button').disabled=false;}
    }

    function toggleAccordion(id) {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('open');
    }
    
    function toggleNightCharge() {
        nightActive = !nightActive;
        const btn = document.getElementById('nightBtn');
        if (nightActive) {
            btn.innerHTML = '🌙 NIGHT ON';
            btn.classList.add('bg-indigo-600/20', 'border-indigo-500');
            showToast("රාත්‍රී ගාස්තු ක්‍රියාත්මකයි (Night Tariff Activated)", "success");
        } else {
            btn.innerHTML = '🌙 NIGHT OFF';
            btn.classList.remove('bg-indigo-600/20', 'border-indigo-500');
            showToast("රාත්‍රී ගාස්තු අක්‍රීයයි (Night Tariff Deactivated)", "info");
        }
        updateDisplay();
        saveRideState();
    }

    function resetToNew() {
        if (rideEnding) return;
        if (pendingRideData) { openPaymentPopup(); return; }
        if (confirm("ගමන මුල සිට ආරම්භ කිරීමට (Reset) අවශ්‍ය බව ස්ථිරද?")) {
            resetDriverAppOnly();
        }
    }

    function manualAddDistance(val) {
        const current = parseFloat(document.getElementById('manual-km-input').value) || 0;
        document.getElementById('manual-km-input').value = Math.max(0, current + val).toFixed(2);
        manualKmInputChanged();
    }
    
    function manualKmInputChanged() {
        const kmVal = Math.max(0, parseFloat(document.getElementById('manual-km-input').value) || 0);
        totalMeters = kmVal * 1000;
        updateDisplay();
        saveRideState();
    }
    
    function setManualDistance() {
        const kmVal = Math.max(0, parseFloat(document.getElementById('manual-km-input').value) || 0);
        totalMeters = kmVal * 1000;
        updateDisplay();
        saveRideState();
        saveRideState();
        showToast(`ගමන් දුර ${kmVal.toFixed(2)} KM ලෙස තහවුරු කරන ලදී.`, "success");
    }

    // Autocomplete Osm Fallbacks
    async function searchSriLankaLocations(query) {
        try {
            const res = await fetchWithTimeout(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Sri Lanka')}&accept-language=en&countrycodes=lk`, {
                headers: { "Accept-Language": "en" }
            });
            return await res.json();
        } catch (e) { return []; }
    }

    // Open Phone Navigation links
    function openPhoneNavigation() {
        const destination=currentDestinationAddress || document.getElementById('end-loc').value.trim();
        const hasGPS=Number.isFinite(currentLat)&&Number.isFinite(currentLng);
        let url;
        if(destination){
            const origin=hasGPS?`${currentLat},${currentLng}`:startLocationAddress;
            url=`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
        }else if(hasGPS){
            url=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${currentLat},${currentLng}`)}`;
        }else{showToast('Enter a destination or wait for GPS before opening the map.','warning');return;}
        window.open(url, '_blank','noopener,noreferrer');
        addSystemLog('INFO', 'Navigation opened', destination?'Destination: '+destination:'Current GPS position');
    }

    // ========== Receipt & Print Direct Rendering ==========
    let activeReceiptObject = null;
    function showReceipt(ride, isReprint) {
        activeReceiptObject = ride;
        document.getElementById('receiptModal').style.display = 'flex';
        const containerId = `qr-${ride.id}`;
        
        document.getElementById('receipt-view').innerHTML = getPerfectReceiptTemplateHTML(ride, isReprint, containerId);
        
        // Generate receipt verification QR code
        setTimeout(() => {
            const qrContainer = document.getElementById(containerId);
            if (qrContainer) {
                qrContainer.innerHTML = '';
                try { if (typeof QRCode !== 'undefined') new QRCode(qrContainer, {
                    text: `AMT Receipt: ${ride.id} | LKR ${Number(ride.fare).toFixed(2)}`,
                    width: 76,
                    height: 76,
                    colorDark : "#000000",
                    colorLight : "#ffffff",
                    correctLevel : QRCode.CorrectLevel.M
                }); } catch(e) { qrContainer.textContent = "Receipt " + ride.id; }
            }
        }, 100);
    }

    function shareWA() {
        if (!activeReceiptObject) return;
        const msg = `*${SETTINGS.appName} OFFICIAL RECEIPT*\n\n` +
                    `Receipt No: ${activeReceiptObject.id}\n` +
                    `Date: ${new Date(activeReceiptObject.time).toLocaleString()}\n` +
                    `From: ${activeReceiptObject.from}\n` +
                    `To: ${activeReceiptObject.to}\n` +
                    `Distance: ${activeReceiptObject.km.toFixed(2)} km\n\n` +
                    `*TOTAL FARE: Rs. ${activeReceiptObject.fare.toFixed(2)}*`;
        window.open(`https://api.whatsapp.com/send?phone=${activeReceiptObject.mobile}&text=${encodeURIComponent(msg)}`, '_blank');
    }

    function sendEmailWithAttachment() {
        if (!activeReceiptObject) return;
        const subject = `${SETTINGS.appName} - Trip Invoice`;
        const body = `Official Trip Receipt details: \n\nReceipt Number: ${activeReceiptObject.id}\nTotal Paid: LKR ${activeReceiptObject.fare.toFixed(2)}`;
        window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
    }

    async function downloadReceiptPDF() {
        if (!activeReceiptObject) return;
        if (!window.jspdf || typeof html2canvas === 'undefined') { showToast('PDF libraries unavailable. Use Print / Save as PDF.', 'warning'); return; }
        try {
            const canvas = await html2canvas(document.getElementById('receipt-view'), { scale: 2, backgroundColor: '#ffffff' });
            const height = canvas.height * 80 / canvas.width;
            const doc = new window.jspdf.jsPDF({ unit:'mm', format:[80, Math.max(100,height+4)] });
            doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 80, height);
            doc.save(`AMT_RECEIPT_${activeReceiptObject.id}.pdf`);
        } catch(e) { showToast('PDF export failed. Use Print / Save as PDF.', 'error'); }
    }

    function printReceiptDirectly() {
        window.print();
    }

    let trackingInterval = null;
    function startTrackingUpdates() {
        if (trackingInterval) clearInterval(trackingInterval);
        trackingInterval = setInterval(() => {
            if (sTime && currentTrackingId) {
                broadcastOdometerTelemetry();
            }
        }, 15000); 
    }
    
    function stopTrackingUpdates() {
        if (trackingInterval) {
            clearInterval(trackingInterval);
            trackingInterval = null;
        }
    }

    async function showTrackingPopup() {
        if (!sTime || !document.getElementById('share-location').checked) { showToast('Start a ride and enable location sharing first.', 'info'); return; }
        try {
            if(!trackingShareToken){const result=await cloudStore.request('/track',{method:'POST',body:'{}'});trackingShareToken=result.token;currentTrackingId=result.token;saveRideState();}
            await broadcastOdometerTelemetry();
            const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('track',trackingShareToken);
            document.getElementById('trackingLinkDisplay').textContent=url.href;
            const qr=document.getElementById('trackingQR');qr.innerHTML='';
            if(typeof QRCode!=='undefined') new QRCode(qr,{text:url.href,width:128,height:128});
            closeM('settings-modal');
            document.getElementById('trackingPopupModal').style.display='flex';
        } catch(e) { showToast('Could not create a tracking link: '+e.message,'error'); }
    }
    
    function closeTrackingPopup() {
        document.getElementById('trackingPopupModal').style.display = 'none';
    }
    
    function copyTrackingLink() {
        const link = document.getElementById('trackingLinkDisplay').innerText;
        const dummy = document.createElement('textarea');
        document.body.appendChild(dummy);
        dummy.value = link;
        dummy.select();
        document.execCommand('copy');
        document.body.removeChild(dummy);
        showToast('Tracking URL Copied!', 'success');
    }
    
    function shareTrackingWhatsApp() {
        const link = document.getElementById('trackingLinkDisplay').innerText;
        const phone = document.getElementById('mobile').value || '';
        const msg = `🚕 Track my real-time ADVANCE MEETER TAXI journey here:\n${link}`;
        window.open(`https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`, '_blank');
    }

    function sendNotification(title, body) {
        if ('Notification' in window && Notification.permission === 'granted') {
            try { new Notification(title, { body, icon: 'https://placehold.co/128x128/0f172a/2563eb?text=🚕' }); } catch (e) { console.warn('Notification unavailable', e); }
        }
    }

    // ========== Passenger Portal Bootstrap ==========
    const urlParams = new URLSearchParams(window.location.search);
    const trackingQuery = urlParams.get('track');
    if (trackingQuery) {
        document.getElementById('account-gate').hidden=true;
        document.getElementById('main-driver-view').classList.add('hidden');
        document.getElementById('passenger-tracking-view').classList.remove('hidden');
        document.getElementById('track-trip-id').innerText = trackingQuery;
        
        bootstrapPassengerTrackerMap();
        listenToTelemetryStream(trackingQuery);
    }
    
    function bootstrapPassengerTrackerMap() {
        try {
            passengerMap = L.map('tracking-map-canvas', { zoomControl: false }).setView([6.9271, 79.8612], 14);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                maxZoom: 19
            }).addTo(passengerMap);
            
            passengerMarker = L.marker([6.9271, 79.8612], {
                icon: L.divIcon({
                    html: '<div style="font-size: 36px;">🚕</div>',
                    className: 'live-passenger-icon',
                    iconSize: [40, 40],
                    iconAnchor: [20, 20]
                })
            }).addTo(passengerMap);
        } catch(e) {
            console.error('Passenger Map Initialization failed: ', e);
        }
    }
    
    function listenToTelemetryStream(trackingId) {
        if (!/^[a-f0-9]{64}$/.test(trackingId)) { document.getElementById('track-status').textContent='Invalid tracking link'; return; }
        let stopped=false;
        async function poll(){
            if(stopped)return;
            try {
                const payload=await cloudStore.request('/track/'+trackingId);
                if(payload.status==='waiting'){document.getElementById('track-status').textContent='Waiting for driver GPS';return;}
                latestPassengerPayload=payload;
                if(passengerMarker&&passengerMap){passengerMarker.setLatLng([payload.lat,payload.lng]);passengerMap.setView([payload.lat,payload.lng]);}
                document.getElementById('track-pickup-location').textContent='Address hidden';
                document.getElementById('track-destination').textContent='Address hidden';
                document.getElementById('track-est-fare').textContent='LKR '+payload.currentFare.toFixed(2);
                document.getElementById('track-est-distance').textContent=payload.distanceTraveled+' km';
                document.getElementById('track-ride-mode').textContent=String(payload.mode||'ride').toUpperCase()+' Mode';
                document.getElementById('track-last-update').textContent=new Date(payload.timestamp).toLocaleTimeString();
                document.getElementById('track-status').textContent=payload.status==='completed'?'Trip completed':'Live ride';
                if(payload.status==='completed'){stopped=true;document.getElementById('passenger-pdf-btn').classList.remove('hidden');}
            } catch(e) {document.getElementById('track-status').textContent=e.message;if(e.status===404)stopped=true;}
            finally {if(!stopped)setTimeout(poll,15000);}
        }
        poll();
    }
    // Report periods are calendar periods; range end dates are inclusive.
    const reportPeriods = { fuel:'daily', repair:'daily', profit:'daily', travel:'daily' };
    function localDateKey(value) {
        const d = value instanceof Date ? value : new Date(value);
        if (!Number.isFinite(d.getTime())) return '';
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    function filterByPeriod(rows, field, period, prefix='') {
        const today = localDateKey(new Date());
        const start = document.getElementById(prefix+'-start-date')?.value;
        const end = document.getElementById(prefix+'-end-date')?.value;
        return rows.filter(row => {
            const raw = row[field];
            const key = field === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(String(raw)) ? raw : localDateKey(raw);
            if (!key) return false;
            if (period === 'range') return Boolean(start && end && start <= end && key >= start && key <= end);
            if (period === 'daily') return key === today;
            if (period === 'monthly') return key.slice(0,7) === today.slice(0,7);
            if (period === 'yearly') return key.slice(0,4) === today.slice(0,4);
            return true;
        });
    }
    function validateReportRange(prefix) {
        if (reportPeriods[prefix] !== 'range' && prefix !== 'history') return true;
        const start = document.getElementById(prefix+'-start-date').value;
        const end = document.getElementById(prefix+'-end-date').value;
        if (!start || !end || start > end) { showToast('Select a valid start and end date.', 'warning'); return false; }
        return true;
    }
    function setActiveReportTab(modalId, handler, selected) {
        document.querySelectorAll(`#${modalId} button[onclick^="${handler}("]`).forEach(btn => {
            const active = btn.getAttribute('onclick') === `${handler}('${selected}')`;
            btn.classList.toggle('bg-blue-600', active);
            btn.classList.toggle('text-white', active);
            btn.classList.toggle('text-slate-400', !active);
            btn.setAttribute('aria-pressed', String(active));
        });
    }
    function selectReportPeriod(prefix, tab, handler, update) {
        if (!['daily','monthly','yearly','range'].includes(tab)) return;
        reportPeriods[prefix] = tab;
        document.getElementById(prefix+'-date-range-panel').classList.toggle('hidden', tab !== 'range');
        setActiveReportTab(prefix+'-report-modal', handler, tab);
        if (tab === 'range') {
            ['start','end'].forEach(part => {
                const input = document.getElementById(prefix+'-'+part+'-date');
                if (!input.value) input.value = localDateKey(new Date());
            });
        }
        update();
    }
    function showFuelReportTab(tab) { selectReportPeriod('fuel', tab, 'showFuelReportTab', updateFuelReport); }
    function showRepairReportTab(tab) { selectReportPeriod('repair', tab, 'showRepairReportTab', updateRepairReport); }
    function showProfitReportTab(tab) { selectReportPeriod('profit', tab, 'showProfitReportTab', updateProfitReport); }
    function showTravelReportTab(tab) { selectReportPeriod('travel', tab, 'showTravelReportTab', updateTravelReport); }
    function applyCustomHistoryFilter() { if (validateReportRange('history')) filterHistory('custom'); }
    function downloadRowsCSV(filename, headers, rows) {
        const cell = value => {
            let text = String(value ?? '');
            if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
            return '"'+text.replace(/"/g,'""')+'"';
        };
        const csv = '\uFEFF' + [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
        a.download = filename; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    function exportFuelCSV() {
        if (!validateReportRange('fuel')) return;
        downloadRowsCSV('fuel-report.csv', ['Date','Liters','Price per liter','Total LKR','Notes'],
            filterByPeriod(readStoredList('fuel_logs'),'date',reportPeriods.fuel,'fuel').map(r=>[r.date,r.liters,r.price,r.total,r.notes]));
    }
    function exportRepairCSV() {
        if (!validateReportRange('repair')) return;
        downloadRowsCSV('repair-report.csv', ['Date','Description','Garage','Cost LKR','Notes'],
            filterByPeriod(readStoredList('repair_logs'),'date',reportPeriods.repair,'repair').map(r=>[r.date,r.desc,r.garage,r.cost,r.notes]));
    }
    function rideExportRows(rides) { return rides.map(r=>[r.id,new Date(r.time).toLocaleString(),r.from,r.to,r.km,r.fare,r.mode,r.payment?.method || 'Cash']); }
    function exportReportCSV() {
        downloadRowsCSV('payment-report.csv',['Receipt','Date','Pickup','Drop','KM','Fare LKR','Mode','Payment'],rideExportRows(filterByPeriod(readStoredList('rides'),'time',currentReportType)));
    }
    function exportTravelCSV() {
        if (!validateReportRange('travel')) return;
        downloadRowsCSV('travel-report.csv',['Receipt','Date','Pickup','Drop','KM','Fare LKR','Mode','Payment'],rideExportRows(filterByPeriod(readStoredList('rides'),'time',reportPeriods.travel,'travel')));
    }
    function exportProfitCSV() {
        if (!validateReportRange('profit')) return;
        const rides=filterByPeriod(readStoredList('rides'),'time',reportPeriods.profit,'profit');
        const fuel=filterByPeriod(readStoredList('fuel_logs'),'date',reportPeriods.profit,'profit');
        const repairs=filterByPeriod(readStoredList('repair_logs'),'date',reportPeriods.profit,'profit');
        const revenue=rides.reduce((n,r)=>n+Number(r.fare),0), f=fuel.reduce((n,r)=>n+Number(r.total),0), cost=repairs.reduce((n,r)=>n+Number(r.cost),0);
        downloadRowsCSV('profit-report.csv',['Metric','LKR'],[['Revenue',revenue],['Fuel',f],['Repairs',cost],['Net profit',revenue-f-cost]]);
    }
    function openTravelReport() { openPanel('travel-report-modal'); updateTravelReport(); }
    function updateTravelReport() {
        if (!validateReportRange('travel')) return;
        const rows=filterByPeriod(readStoredList('rides'),'time',reportPeriods.travel,'travel');
        const distance=rows.reduce((n,r)=>n+Number(r.km),0);
        document.getElementById('travel-report-container').innerHTML = `<div class="report-summary"><div>Trips<strong>${rows.length}</strong></div><div>Distance<strong>${distance.toFixed(2)} km</strong></div></div>` + rows.map(r=>`<div class="report-row"><strong>${escapeHTML(r.id)}</strong> · ${new Date(r.time).toLocaleDateString()}<br>${escapeHTML(r.from)} → ${escapeHTML(r.to)}<br>${Number(r.km).toFixed(2)} km · Rs.${Number(r.fare).toFixed(2)}</div>`).join('') + (rows.length?'':'<p>No trips in this period.</p>');
    }
    function drawReportChart(id, labels, values, label) {
        if (typeof Chart === 'undefined') return;
        window.amtCharts ||= {};
        window.amtCharts[id]?.destroy();
        window.amtCharts[id] = new Chart(document.getElementById(id).getContext('2d'), {
            type:'bar', data:{labels,datasets:[{label,data:values,backgroundColor:'#3b82f6'}]},
            options:{responsive:true, plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{color:'#94a3b8'}},x:{ticks:{color:'#94a3b8'}}}}
        });
    }
    function peakHourCounts() {
        const counts=Array(24).fill(0);
        readStoredList('rides').forEach(r=>{ const d=new Date(r.startTime || r.time); if(Number.isFinite(d.getTime())) counts[d.getHours()]++; });
        return counts;
    }
    function showPeakHoursReport() {
        openPanel('peak-hours-modal');
        const counts=peakHourCounts(), max=Math.max(...counts);
        const peak=counts.map((n,i)=> n===max ? String(i).padStart(2,'0')+':00' : null).filter(Boolean);
        document.getElementById('peak-hours-stats').textContent=max?`Peak hour(s): ${peak.join(', ')} · ${max} trips. Older records use completion time when start time is unavailable.`:'No completed rides yet.';
        drawReportChart('peakHoursChart',counts.map((_,i)=>String(i).padStart(2,'0')+':00'),counts,'Trips');
    }
    function exportPeakHoursCSV() { downloadRowsCSV('peak-hours.csv',['Hour','Trips'],peakHourCounts().map((n,i)=>[String(i).padStart(2,'0')+':00',n])); }
    function driverMetrics() {
        const rows=readStoredList('rides'), revenue=rows.reduce((n,r)=>n+Number(r.fare),0), km=rows.reduce((n,r)=>n+Number(r.km),0);
        return [['Completed trips',rows.length],['Total revenue LKR',revenue],['Total distance km',km],['Average fare LKR',rows.length?revenue/rows.length:0],['Revenue per km LKR',km?revenue/km:0]];
    }
    function showDriverPerformanceReport() {
        openPanel('driver-performance-modal');
        const metrics=driverMetrics();
        document.getElementById('driver-performance-stats').innerHTML='<div class="report-summary">'+metrics.map(([label,value])=>`<div>${label}<strong>${Number(value).toFixed(2)}</strong></div>`).join('')+'</div>';
        const byDay={};readStoredList('rides').forEach(r=>{const day=localDateKey(r.time);byDay[day]=(byDay[day]||0)+1;});
        const days=Object.keys(byDay).sort().slice(-7);drawReportChart('driverPerformanceChart',days,days.map(d=>byDay[d]),'Trips per day');
    }
    function exportDriverPerformanceCSV() { downloadRowsCSV('driver-performance.csv',['Metric','Value'],driverMetrics()); }
    function openDriverApp() {
        closeM('settings-modal'); openPanel('driver-app-modal');
        document.getElementById('driver-app-stats').textContent=sTime?`Active ride · ${(totalMeters/1000).toFixed(2)} km · Rs.${calcFare().toFixed(2)}`:'No active ride';
        document.getElementById('driver-app-rides').innerHTML=readStoredList('rides').slice().sort((a,b)=>b.time-a.time).slice(0,10).map(r=>`<div class="report-row">${escapeHTML(r.id)} · Rs.${Number(r.fare).toFixed(2)}</div>`).join('') || 'No completed rides';
    }
    function printTravelReceipt() {
        if (!validateReportRange('travel')) return;
        updateTravelReport();
        const summary=document.createElement('section');summary.id='report-print-view';
        summary.innerHTML='<h1>Travel Summary</h1>'+document.getElementById('travel-report-container').innerHTML;
        document.getElementById('report-print-view')?.remove();document.body.appendChild(summary);
        document.body.classList.add('printing-report');window.print();
        document.body.classList.remove('printing-report');summary.remove();
    }
    function downloadPassengerReceiptPDF() {
        const p=latestPassengerPayload;
        if (!p || p.status !== 'completed') return;
        if (!window.jspdf) { showToast('PDF unavailable. Try again when connected to the internet.', 'warning'); return; }
        const doc=new window.jspdf.jsPDF();
        doc.setFontSize(18);doc.text('Taxi Trip Summary',14,22);doc.setFontSize(11);
        doc.text([`Tracking ID: ${p.id}`,`Distance: ${p.distanceTraveled} km`,`Fare: LKR ${Number(p.currentFare).toFixed(2)}`,`Completed: ${new Date(p.timestamp).toLocaleString()}`,'','This summary does not confirm payment.','Ask the driver for your payment receipt.'],14,35);
        doc.save('taxi-trip-summary.pdf');
    }
    function updateMobileViewport() {
        const viewport=window.visualViewport;
        document.documentElement.style.setProperty('--viewport-height',`${viewport?.height || window.innerHeight}px`);
        document.documentElement.style.setProperty('--viewport-top',`${viewport?.offsetTop || 0}px`);
        [mapObj,driverPopupMap,passengerMap].forEach(map=>{if(map) map.invalidateSize();});
    }
    window.addEventListener('resize',updateMobileViewport);
    window.visualViewport?.addEventListener('resize',updateMobileViewport);
    window.visualViewport?.addEventListener('scroll',updateMobileViewport);
    window.addEventListener('load',updateMobileViewport);

    function validateBackup(data) {
        const nonnegative=n=>typeof n==='number' && Number.isFinite(n) && n>=0;
        const date=d=>Number.isFinite(new Date(d).getTime());
        if (!data || typeof data!=='object' || !Array.isArray(data.rides) || !Array.isArray(data.fuel) || !Array.isArray(data.repairs)) return false;
        const settings=data.settings;
        if (!settings || !['base','rate','waitRate','nightPercent'].every(k=>nonnegative(settings[k])) || !['appName','receiptName','password'].every(k=>typeof settings[k]==='string')) return false;
        if (!data.rides.every(r=>r && typeof r.id==='string' && nonnegative(r.fare) && nonnegative(r.km) && date(r.time))) return false;
        if (new Set(data.rides.map(r=>r.id)).size !== data.rides.length) return false;
        if (!data.fuel.every(r=>r && date(r.date) && ['liters','price','total'].every(k=>nonnegative(r[k])))) return false;
        if (!data.repairs.every(r=>r && date(r.date) && nonnegative(r.cost) && typeof r.desc==='string')) return false;
        if (data.schedules!=null && (!Array.isArray(data.schedules) || !data.schedules.every(r=>r && Number.isFinite(r.id) && date(r.datetime) && ['name','phone','start','end'].every(k=>typeof r[k]==='string')))) return false;
        return true;
    }
    function applyBackup(data) {
        showToast('Server records cannot be replaced from the browser. Ask the administrator to import this backup.', 'warning');
        return false;
    }


    let trackingShareToken=null;
    async function changeLocationSharing(){
        if(document.getElementById('share-location').checked){if(sTime)await showTrackingPopup();saveRideState();return;}
        if(trackingShareToken){try{await cloudStore.request('/track/'+trackingShareToken,{method:'DELETE'});trackingShareToken=null;showToast('Tracking link revoked.','success');}catch(e){document.getElementById('share-location').checked=true;showToast('Could not revoke the link. Retry when connected.','error');}}
        saveRideState();
    }
