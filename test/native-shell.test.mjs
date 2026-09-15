import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const android=readFileSync(new URL('../native/android/app/src/main/java/com/sparkles/taxidriver/MainActivity.java',import.meta.url),'utf8');
const meter=readFileSync(new URL('../native/android/app/src/main/java/com/sparkles/taxidriver/MeterService.java',import.meta.url),'utf8');
const ios=readFileSync(new URL('../native/ios/TaxiDriver/App.swift',import.meta.url),'utf8');
const session=readFileSync(new URL('../assets/session.js',import.meta.url),'utf8');
test('Android shell supports logo chooser and system-bar safe area',()=>{assert.match(android,/onShowFileChooser/);assert.match(android,/ACTION_GET_CONTENT/);assert.match(android,/FrameLayout root/);assert.match(android,/root\.setOnApplyWindowInsetsListener/);});
test('Native shells retain only the server session and can clear it',()=>{for(const action of ['saveSession','loadSession','clearSession']){assert.match(android,new RegExp(action));assert.match(ios,new RegExp(action));assert.match(session,new RegExp(action));}assert.doesNotMatch(session,/localStorage/);});

test('Android and iPhone shells provide native speech recognition',()=>{assert.match(android,/RecognizerIntent/);assert.match(android,/action.equals\("voice"\)/);assert.match(ios,/SFSpeechRecognizer/);assert.match(ios,/case "voice"/);});
test('Native meters recover background GPS gaps with validated road distance',()=>{
 for(const source of [meter,ios]){assert.match(source,/router\.project-osrm\.org/);assert.match(source,/recoveredMeters/);assert.match(source,/gapCount/);}
 assert.match(meter,/START_STICKY/);assert.match(ios,/allowsBackgroundLocationUpdates=true/);
});
test('Android and iPhone provide native A5 PDF save, email and print actions',()=>{
 for(const action of ['sharePdf','savePdf','printPdf']){assert.match(android,new RegExp(action));assert.match(ios,new RegExp(action));}
 assert.match(android,/ACTION_CREATE_DOCUMENT/);assert.match(android,/PrintAttributes\.MediaSize\.ISO_A5/);assert.match(android,/EXTRA_STREAM/);
 assert.match(ios,/MFMailComposeViewController/);assert.match(ios,/UIDocumentPickerViewController/);assert.match(ios,/UIPrintInteractionController/);
});
