import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {validateState} from '../cloudflare/worker.mjs';

test('agreed fare includes waiting, discount and night in every mode',()=>{
 const settings={base:100,rate:80,waitRate:5,nightPercent:10,appName:'Taxi',receiptName:'Taxi'};
 const previous={settings:JSON.stringify(settings),rides:'[]'};
 for(const mode of ['Auto','GPS','Manual','Delivery','Booked Ride']){
  const ride={id:mode,mode,km:2,time:Date.now(),manualFare:1000,wait:10,disc:50,nightUsed:true,fare:1100};
  assert.equal(JSON.parse(validateState({...previous,rides:JSON.stringify([ride])},previous,'driver').rides)[0].fare,1100);
  assert.throws(()=>validateState({...previous,rides:JSON.stringify([{...ride,fare:1000}])},previous,'driver'),/fare/i);
 }
});
test('CRM groups phone punctuation, preserves history, excludes anonymous rides',()=>{
const context=vm.createContext({window:{}});vm.runInContext(readFileSync(new URL('../assets/reports.js',import.meta.url),'utf8'),context);
 const rows=context.window.customerSummary([{mobile:'077 123-4567',customerName:'One',fare:100,time:1},{mobile:'0771234567',fare:200,time:2},{mobile:'N/A',fare:500,time:3}]);
 assert.equal(rows.length,1);assert.equal(rows[0].total,300);assert.equal(rows[0].rides,2);assert.equal(rows[0].history.length,2);assert.equal(rows[0].last,2);
});
test('Android waits for precise permission before loading WebView GPS',()=>{
 const source=readFileSync(new URL('../native/android/app/src/main/java/com/sparkles/taxidriver/MainActivity.java',import.meta.url),'utf8');
 assert.match(source,/if\(hadPreciseLocation\)loadApp\(\);else requestPermissions/);
 assert.match(source,/requestCode==LOCATION_REQUEST.*loadApp\(\)/s);
 assert.match(source,/setGeolocationEnabled\(true\)/);
 assert.match(source,/trustedOrigin\(origin\)&&hasPreciseLocation\(\)/);
 assert.match(source,/pageLoaded&&precise&&!hadPreciseLocation.*web\.reload\(\)/s);
});
