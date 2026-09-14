package com.sparkles.taxidriver;

import android.Manifest;
import android.app.Activity;
import android.os.Bundle;
import android.os.Build;
import android.content.Intent;
import android.speech.RecognizerIntent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.webkit.*;
import android.net.Uri;
import android.util.Base64;
import android.widget.FrameLayout;
import android.view.ViewGroup;
import androidx.core.content.FileProvider;
import org.json.JSONObject;
import androidx.webkit.WebViewCompat;
import java.util.Collections;
import java.util.ArrayList;
import java.io.File;
import java.io.FileOutputStream;

public class MainActivity extends Activity {
 // Use a separate test Pages deployment before enabling the new native meter.
 static final String HOST="sparkles-systems-solutions.github.io";
 static final String PATH="/Advance-Meeter-Taxi-slzzz-oo/driver-test/";
 static final int LOCATION_REQUEST=100;
 static final int FILE_CHOOSER_REQUEST=102;
 static final int VOICE_REQUEST=103;
 WebView web;
 int pendingVoiceId=0;
 ValueCallback<Uri[]> filePathCallback;
 boolean pageLoaded=false, hadPreciseLocation=false;
 boolean trusted(String url){if(url==null)return false;Uri u=Uri.parse(url);return "https".equals(u.getScheme())&&HOST.equals(u.getHost())&&u.getPath()!=null&&u.getPath().startsWith(PATH);}
 boolean trustedOrigin(String origin){if(origin==null)return false;Uri u=Uri.parse(origin);return "https".equals(u.getScheme())&&HOST.equals(u.getHost());}
 boolean hasPreciseLocation(){return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED;}
 @Override public void onCreate(Bundle state){
  super.onCreate(state);getWindow().setStatusBarColor(Color.rgb(15,23,42));getWindow().setNavigationBarColor(Color.rgb(15,23,42));
  FrameLayout root=new FrameLayout(this);web=new WebView(this);root.addView(web,new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.MATCH_PARENT));setContentView(root);
  root.setFitsSystemWindows(true);root.setOnApplyWindowInsetsListener((view,insets)->{view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});root.post(root::requestApplyInsets);
  web.getSettings().setJavaScriptEnabled(true);web.getSettings().setDomStorageEnabled(true);web.getSettings().setGeolocationEnabled(true);
  web.getSettings().setAllowFileAccess(false);web.getSettings().setAllowContentAccess(true);
  web.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  WebViewCompat.addWebMessageListener(web,"TaxiNative",Collections.singleton("https://"+HOST),(view,message,origin,mainFrame,reply)->{if(mainFrame&&trusted(view.getUrl()))handle(message.getData());});
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest r){
    if(trusted(r.getUrl().toString()))return false;
    if(r.isForMainFrame()&&("https".equals(r.getUrl().getScheme())||"geo".equals(r.getUrl().getScheme())))startActivity(new Intent(Intent.ACTION_VIEW,r.getUrl()));
    return true;
   }
  });
  web.setWebChromeClient(new WebChromeClient(){
   @Override public void onGeolocationPermissionsShowPrompt(String origin,GeolocationPermissions.Callback cb){cb.invoke(origin,trustedOrigin(origin)&&hasPreciseLocation(),false);}
   @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
    if(filePathCallback!=null)filePathCallback.onReceiveValue(null);filePathCallback=callback;
    Intent pick=new Intent(Intent.ACTION_GET_CONTENT);pick.addCategory(Intent.CATEGORY_OPENABLE);pick.setType("image/*");startActivityForResult(Intent.createChooser(pick,"Choose business logo"),FILE_CHOOSER_REQUEST);return true;
   }
  });
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
 @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
  super.onActivityResult(requestCode,resultCode,data);
  if(requestCode==VOICE_REQUEST){int id=pendingVoiceId;pendingVoiceId=0;JSONObject out=new JSONObject();try{ArrayList<String> words=resultCode==RESULT_OK&&data!=null?data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS):null;if(words==null||words.isEmpty())out.put("error","No command heard");else out.put("transcript",words.get(0));}catch(Exception e){try{out.put("error",e.getMessage());}catch(Exception ignored){}}reply(id,out);return;}
  if(requestCode==FILE_CHOOSER_REQUEST&&filePathCallback!=null){filePathCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode,data));filePathCallback=null;}
 }
 void handle(String json){int id=0;try{
  if(!trusted(web.getUrl()))throw new Exception("Untrusted page");
  JSONObject m=new JSONObject(json);id=m.getInt("id");String action=m.getString("action");JSONObject d=m.optJSONObject("data");
  if(action.equals("start")){
   if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},1);throw new Exception("Allow precise location, then start again");}
   MeterService.begin(this,d);startForegroundService(new Intent(this,MeterService.class));
  }else if(action.equals("configure")){MeterService.configure(d);}
  else if(action.equals("voice")){Intent voice=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);voice.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);voice.putExtra(RecognizerIntent.EXTRA_LANGUAGE,d.optString("language","en-US"));voice.putExtra(RecognizerIntent.EXTRA_PROMPT,"Say: Start ride, End ride, Navigate or Reports");pendingVoiceId=id;startActivityForResult(voice,VOICE_REQUEST);return;}
  else if(action.equals("saveSession")){String sessionToken=d.optString("token");JSONObject sessionUser=d.optJSONObject("user");if(!sessionToken.matches("^[a-f0-9]{64}$")||sessionUser==null)throw new Exception("Invalid session");getSharedPreferences("secure_session",MODE_PRIVATE).edit().putString("active",d.toString()).apply();reply(id,new JSONObject().put("ok",true));return;}
  else if(action.equals("loadSession")){String saved=getSharedPreferences("secure_session",MODE_PRIVATE).getString("active","");reply(id,saved.isEmpty()?new JSONObject():new JSONObject(saved));return;}
  else if(action.equals("clearSession")){getSharedPreferences("secure_session",MODE_PRIVATE).edit().remove("active").apply();reply(id,new JSONObject().put("ok",true));return;}
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
