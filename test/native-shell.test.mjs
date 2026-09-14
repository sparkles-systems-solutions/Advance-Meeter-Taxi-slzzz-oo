import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const android=readFileSync(new URL('../native/android/app/src/main/java/com/sparkles/taxidriver/MainActivity.java',import.meta.url),'utf8');
const ios=readFileSync(new URL('../native/ios/TaxiDriver/App.swift',import.meta.url),'utf8');
const session=readFileSync(new URL('../assets/session.js',import.meta.url),'utf8');
test('Android shell supports logo chooser and system-bar safe area',()=>{assert.match(android,/onShowFileChooser/);assert.match(android,/ACTION_GET_CONTENT/);assert.match(android,/FrameLayout root/);assert.match(android,/root\.setOnApplyWindowInsetsListener/);});
test('Native shells retain only the server session and can clear it',()=>{for(const action of ['saveSession','loadSession','clearSession']){assert.match(android,new RegExp(action));assert.match(ios,new RegExp(action));assert.match(session,new RegExp(action));}assert.doesNotMatch(session,/localStorage/);});
