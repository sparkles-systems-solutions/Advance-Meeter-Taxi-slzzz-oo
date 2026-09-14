package com.sparkles.taxidriver;

import android.Manifest;
import android.app.Activity;
import android.os.Bundle;
import android.os.Build;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.webkit.*;
import android.net.Uri;
import android.util.Base64;
import androidx.core.content.FileProvider;
import org.json.JSONObject;
import androidx.webkit.WebViewCompat;
import java.util.Collections;
import java.io.File;
import java.io.FileOutputStream;

public class MainActivity extends Activity {
 // Use a separate test Pages deployment before enabling the new native meter.
 static final String HOST="sparkles-systems-solutions.github.io";
 static final String PATH="/Advance-Meeter-Taxi-slzzz-oo/driver-test/";
 static final int LOCATION_REQUEST=100;
 WebView web;
 boolean pageLoaded=false, hadPreciseLocation=false;
 boolean trusted(String url){if(url==null)return false;Uri u=Uri.parse(url);return "https".equals(u.getScheme())&&HOST.equals(u.getHost())&&u.getPath()!=null&&u.getPath().startsWith(PATH);}
 boolean trustedOrigin(String origin){if(origin==null)return false;Uri u=Uri.parse(origin);return "https".equals(u.getScheme())&&HOST.equals(u.getHost());}
 boolean hasPreciseLocation(){return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED;}
 @Override public void onCreate(Bundle state){
  super.onCreate(state);web=new WebView(this);setContentView(web);
  web.setOnApplyWindowInsetsListener((view,insets)->{view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
  web.getSettings().setJavaScriptEnabled(true);web.getSettings().setDomStorageEnabled(true);web.getSettings().setGeolocationEnabled(true);
  web.getSettings().setAllowFileAccess(false);web.getSettings().setAllowContentAccess(false);
  web.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  WebViewCompat.addWebMessageListener(web,"TaxiNative",Collections.singleton("https://"+HOST),(view,message,origin,mainFrame,reply)->{if(mainFrame&&trusted(view.getUrl()))handle(message.getData());});
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest r){
    if(trusted(r.getUrl().toString()))return false;
    if(r.isForMainFrame()&&("https".equals(r.getUrl().getScheme())||"geo".equals(r.getUrl().getScheme())))startActivity(new Intent(Intent.ACTION_VIEW,r.getUrl()));
    return true;
   }
  });
  web.setWebChromeClient(new WebChromeClient(){@Override public void onGeolocationPermissionsShowPrompt(String origin,GeolocationPermissions.Callback cb){cb.invoke(origin,trustedOrigin(origin)&&hasPreciseLocation(),false);}});
  hadPreciseLocation=hasPreciseLocation();
  if(hadPreciseLocation)loadApp();else requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},LOCATION_REQUEST);
 }
 void loadApp(){if(pageLoaded)return;pageLoaded=true;web.loadUrl("https://"+HOST+PATH);requestNotificationPermission();}
 void requestNotificationPermission(){if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},101);}
 @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] results){
  super.onRequestPermissionsResult(requestCode,permissions,results);
  if(requestCode==LOCATION_REQUEST){hadPreciseLocation=hasPreciseLocation();loadApp();}
 }
 @Override protected void onResume(){
  super.onResume();boolean precise=hasPreciseLocation();
  if(pageLoaded&&precise&&!hadPreciseLocation){hadPreciseLocation=true;web.reload();}
 }
 void handle(String json){int id=0;try{
  if(!trusted(web.getUrl()))throw new Exception("Untrusted page");
  JSONObject m=new JSONObject(json);id=m.getInt("id");String action=m.getString("action");JSONObject d=m.optJSONObject("data");
  if(action.equals("start")){
   if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},1);throw new Exception("Allow precise location, then start again");}
   MeterService.begin(this,d);startForegroundService(new Intent(this,MeterService.class));
  }else if(action.equals("configure")){MeterService.configure(d);}
  else if(action.equals("sharePdf")){sharePdf(d);reply(id,new JSONObject().put("ok",true));return;}
  else if(action.equals("stop")){stopService(new Intent(this,MeterService.class));MeterService.finish(this);}
  else if(!action.equals("snapshot"))throw new Exception("Unknown native action");
  reply(id,MeterService.snapshot(this));
 }catch(Exception e){JSONObject error=new JSONObject();try{error.put("error",e.getMessage());}catch(Exception ignored){}reply(id,error);}}
 void reply(int id,JSONObject result){web.evaluateJavascript("window.taxiNativeReply&&window.taxiNativeReply("+id+","+result.toString()+")",null);}
 void sharePdf(JSONObject d)throws Exception{
  String base64=d.optString("base64"),name=d.optString("name","taxi-receipt.pdf").replaceAll("[^A-Za-z0-9._-]","_");if(base64.length()>8_000_000)throw new Exception("Receipt PDF is too large");
  File dir=new File(getCacheDir(),"receipts");if(!dir.exists()&&!dir.mkdirs())throw new Exception("Cannot prepare receipt");File file=new File(dir,name);try(FileOutputStream out=new FileOutputStream(file)){out.write(Base64.decode(base64,Base64.DEFAULT));}
  Uri uri=FileProvider.getUriForFile(this,getPackageName()+".fileprovider",file);Intent share=new Intent(Intent.ACTION_SEND);share.setType("application/pdf");share.putExtra(Intent.EXTRA_STREAM,uri);share.putExtra(Intent.EXTRA_SUBJECT,d.optString("title"));share.putExtra(Intent.EXTRA_TEXT,d.optString("text"));share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);startActivity(Intent.createChooser(share,"Share receipt PDF"));
 }
}
