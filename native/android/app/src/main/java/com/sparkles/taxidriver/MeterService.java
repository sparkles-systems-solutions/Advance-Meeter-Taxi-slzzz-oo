package com.sparkles.taxidriver;

import android.app.*;
import android.content.*;
import android.location.*;
import android.os.*;
import org.json.JSONObject;
import java.net.*;
import java.util.concurrent.*;

public class MeterService extends Service implements LocationListener {
 static JSONObject state=new JSONObject(),config=new JSONObject();
 static Location previous;
 static final ExecutorService network=Executors.newSingleThreadExecutor();
 static long lastSent=0;
 LocationManager manager;
 static synchronized void load(Context c){if(state.length()==0)try{state=new JSONObject(c.getSharedPreferences("meter",0).getString("ride","{}"));}catch(Exception ignored){}}
 static synchronized void persist(Context c){c.getSharedPreferences("meter",0).edit().putString("ride",state.toString()).apply();}
 static synchronized void begin(Context c,JSONObject d)throws Exception{
  load(c);String id=d.getString("rideId");
  if(state.optBoolean("active")&&!id.equals(state.optString("rideId")))throw new Exception("Restore the existing native ride before starting another");
  if(!id.equals(state.optString("rideId"))){state=new JSONObject();state.put("rideId",id);state.put("meters",d.optDouble("meters",0));previous=null;}
  state.put("active",true);state.put("metered",d.optBoolean("metered",true));persist(c);
 }
 static synchronized void configure(JSONObject d){config=d;}
 static synchronized void finish(Context c)throws Exception{load(c);state.put("active",false);config=new JSONObject();previous=null;persist(c);}
 static synchronized JSONObject snapshot(Context c)throws Exception{load(c);return new JSONObject(state.toString());}
 @Override public void onCreate(){super.onCreate();load(this);
  NotificationManager nm=getSystemService(NotificationManager.class);
  nm.createNotificationChannel(new NotificationChannel("ride","Active taxi ride",NotificationManager.IMPORTANCE_LOW));
  PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
  startForeground(1,new Notification.Builder(this,"ride").setContentTitle("Taxi meter active").setContentText("Recording ride GPS. Open Taxi Driver to end your ride.").setSmallIcon(android.R.drawable.ic_menu_mylocation).setContentIntent(open).setOngoing(true).build());
  manager=(LocationManager)getSystemService(LOCATION_SERVICE);
  try{manager.requestLocationUpdates(LocationManager.GPS_PROVIDER,2000,0,this);}catch(SecurityException e){stopSelf();}
 }
 @Override public int onStartCommand(Intent i,int flags,int startId){return START_STICKY;}
 @Override public IBinder onBind(Intent i){return null;}
 @Override public void onDestroy(){if(manager!=null)manager.removeUpdates(this);super.onDestroy();}
 @Override public void onLocationChanged(Location p){synchronized(MeterService.class){try{
  if(!state.optBoolean("active")||!p.hasAccuracy()||p.getAccuracy()>50||p.getAccuracy()<0)return;
  if(Math.abs(System.currentTimeMillis()-p.getTime())>15000)return;
  state.put("lat",p.getLatitude());state.put("lng",p.getLongitude());state.put("accuracy",p.getAccuracy());state.put("timestamp",p.getTime());
  if(previous!=null){double seconds=(p.getElapsedRealtimeNanos()-previous.getElapsedRealtimeNanos())/1e9,dist=previous.distanceTo(p);
   if(seconds>30){state.put("gap",true);previous=p;}
   else if(seconds>=1&&dist>=2&&dist<=500&&dist/seconds<=55){if(state.optBoolean("metered"))state.put("meters",state.optDouble("meters")+dist);previous=p;}
  }else previous=p;
  persist(this);if(System.currentTimeMillis()-lastSent>=10000){lastSent=System.currentTimeMillis();publish(new JSONObject(state.toString()),new JSONObject(config.toString()));}
 }catch(Exception ignored){}}}
 static void publish(JSONObject s,JSONObject c){
  String token=c.optString("token"),share=c.optString("share");if(!token.matches("[a-f0-9]{64}")||!share.matches("[a-f0-9]{64}"))return;
  network.execute(()->{try{
   JSONObject rates=c.getJSONObject("rates");double km=(s.optBoolean("metered")?s.optDouble("meters"):c.optDouble("manualMeters"))/1000;
   double manual=c.optDouble("manualFare"),fare=(manual>0?manual:rates.getDouble("base")+Math.max(0,km-1)*rates.getDouble("rate"))+c.optDouble("wait")*rates.getDouble("waitRate")-c.optDouble("discount");
   if(c.optBoolean("night"))fare*=1+rates.getDouble("nightPercent")/100;
   JSONObject data=new JSONObject().put("lat",s.getDouble("lat")).put("lng",s.getDouble("lng")).put("currentFare",Math.max(0,Math.round(fare))).put("distanceTraveled",String.format(java.util.Locale.US,"%.2f",km)).put("status","active").put("mode",c.optString("mode"));
   HttpURLConnection conn=(HttpURLConnection)new URL("https://odd-sun-eecf.dilshan7878787.workers.dev/api/track/"+share).openConnection();
   conn.setConnectTimeout(10000);conn.setReadTimeout(10000);conn.setInstanceFollowRedirects(false);conn.setRequestMethod("PUT");conn.setRequestProperty("Authorization","Bearer "+token);conn.setRequestProperty("Content-Type","application/json");conn.setDoOutput(true);
   try(var out=conn.getOutputStream()){out.write(data.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}int status=conn.getResponseCode();conn.disconnect();
   synchronized(MeterService.class){state.put("telemetryStatus",status);}
  }catch(Exception e){try{synchronized(MeterService.class){state.put("telemetryStatus",0);}}catch(Exception ignored){}}});
 }
 @Override public void onProviderDisabled(String provider){}
 @Override public void onProviderEnabled(String provider){}
 @Override public void onStatusChanged(String provider,int status,Bundle extras){}
}
