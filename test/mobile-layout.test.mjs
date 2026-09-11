import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../assets/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/app.css',import.meta.url),'utf8');
// Function-name inventory extracted from user-supplied index-fixed (1).html.
// Presence is not a claim of browser/runtime equivalence; see docs/QA-MOBILE.md.
const referenceNames=["addFuelLog","addGPSUpdate","addNewSchedule","addRepairLog","addSystemLog","animateCounter","applyBackup","applyCustomHistoryFilter","bootstrapPassengerTrackerMap","broadcastOdometerTelemetry","calcFare","calculateDistanceMeters","calculateFuelTotal","checkLogin","checkScheduleReminders","clearSystemLog","closeDriverMapPopup","closeM","closeMapModal","closePaymentPopup","closeSettingsAndLogout","closeTrackingPopup","confirmPaymentAndShowReceipt","convert","copyTrackingLink","deleteFuelLog","deleteRepairLog","deleteSchedule","downloadCSV","downloadPassengerReceiptPDF","downloadReceiptPDF","downloadRowsCSV","downloadSystemBackupFile","drawReportChart","driverMetrics","endRide","escapeHTML","exportDriverPerformanceCSV","exportFuelCSV","exportPeakHoursCSV","exportProfitCSV","exportRepairCSV","exportReportCSV","exportScheduleICS","exportSystemLogCSV","exportTravelCSV","fetchWithTimeout","filterByPeriod","filterHistory","filterSchedulesTab","generateReceiptID","generateTrackingId","getAverageGPSAccuracy","getCurrentMapLocation","getPaymentInfo","getPerfectReceiptTemplateHTML","getSriLankaFallbackAddress","goBackToFuelLog","goBackToRepairLog","goBackToReportsMenu","goBackToSettingsMenu","handleMapSearchInput","initPickerMap","initVoiceRecognition","isValidGPSUpdate","listenToTelemetryStream","loadAndStartSchedule","loadEarningsChart","loadRideState","localDateKey","manualAddDistance","manualKmInputChanged","numberToWords","openAppSettings","openDatabaseBackupModal","openDriverApp","openDriverMapPopup","openFuelLogModal","openFuelReport","openLogin","openMapPicker","openPanel","openPaymentPopup","openPhoneNavigation","openProfitReport","openRepairLogModal","openRepairReport","openReportsMenu","openScheduleManager","openScheduleManagerFromSettings","openSystemLogModal","openTravelReport","peakHourCounts","printReceiptDirectly","printTravelReceipt","processVoiceCommand","readStoredList","refreshCurrentLocation","releaseWakeLock","renderFuelLogsList","renderLocalBackupsList","renderRepairLogsList","renderSchedulesList","requestWakeLock","resetDriverAppOnly","resetToNew","restoreFromLocalBackup","restorePreviousRide","restoreSystemFromFile","reverseGeocode","reverseGeocodePicker","rideExportRows","saveRideState","saveSchedules","saveSettings","searchSriLankaLocations","selectPaymentMethod","selectReportPeriod","sendEmailWithAttachment","sendNotification","setActiveReportTab","setManualDistance","setMode","setupAutocomplete","shareTrackingWhatsApp","shareWA","showDriverPerformanceReport","showFuelReportTab","showLoading","showPeakHoursReport","showProfitReportTab","showReceipt","showRepairReportTab","showReportTab","showScreenStateIndicator","showToast","showTrackingPopup","showTravelReportTab","startGPS","startRide","startRideStatusMonitoring","startTrackingUpdates","stopRideStatusMonitoring","stopTrackingUpdates","toggleAccordion","toggleAutoBackupPref","toggleNightCharge","toggleVoiceCommand","trackRide","triggerRollingBackup","updateDisplay","updateDriverPopupMarker","updateFuelReport","updateMobileViewport","updateProfitReport","updateRepairReport","updateTravelReport","useMapLocation","validateBackup","validateReportRange"];
test('All 160 named reference functions remain available',()=>{
 const actual=new Set([...js.matchAll(/function\s+(\w+)\s*\(/g)].map(m=>m[1]));
 assert.equal(referenceNames.length,160);
 for(const name of referenceNames)assert(actual.has(name),name);
});
test('Account and sync controls are inside Settings, not above the meter',()=>{
 const section=html.slice(html.indexOf('<section id="account-settings"'),html.indexOf('<!-- Core Operations Section -->'));
 const main=html.slice(html.indexOf('<div id="main-driver-view"'),html.indexOf('<div id="settings-modal"'));
 for(const id of ['account-name','sync-status','share-location']){
  assert(section.includes('id="'+id+'"'));assert(!main.includes('id="'+id+'"'));
 }
 assert(main.includes('id="sync-warning"'));
 for(const action of ['cloudStore.logout()','cloudStore.exportUnsaved()','changeLocationSharing()','showTrackingPopup()'])assert(section.includes(action));
});
test('Driver console is hidden until login; public tracking bypass is explicit',()=>{
 assert.match(html,/<div id="main-driver-view" hidden/);
 assert.match(html,/<section id="account-gate" class="account-gate">/);
 assert(js.includes("document.getElementById('account-gate').hidden=true;"));
 assert.match(css,/\[hidden\]\s*\{\s*display:none !important/);
});
test('IDs are unique and wait-time choices 0–120 remain',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
 const options=html.match(/<select[^>]*id="wait-select"[\s\S]*?<\/select>/)[0];
 for(let n=0;n<=120;n++)assert(options.includes('value="'+n+'"'));
});
test('Inline event handlers are valid JavaScript',()=>{
 for(const m of html.matchAll(/\bon(?:click|change|input)="([^"]*)"/g)){
  const code=m[1].replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'");
  assert.doesNotThrow(()=>new vm.Script('(function(event){'+code+'})'));
 }
});
test('Mobile account controls wrap and have 44px touch targets',()=>{
 assert(css.includes('min-height:44px'));
 assert(css.includes('@media (max-width:380px)'));
 assert(css.includes('overflow-wrap:anywhere'));
 assert(css.includes('.account-gate input { font-size:16px;'));
});

