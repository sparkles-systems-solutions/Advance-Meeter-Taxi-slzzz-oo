import UIKit
import WebKit
import CoreLocation

@main class AppDelegate: UIResponder, UIApplicationDelegate {
 var window: UIWindow?
 func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
  let window=UIWindow(frame: UIScreen.main.bounds);window.rootViewController=DriverController();window.makeKeyAndVisible();self.window=window;return true
 }
}

final class DriverController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate {
 let meter=RideMeter();var web:WKWebView!
 let host="sparkles-systems-solutions.github.io", path="/Advance-Meeter-Taxi-slzzz-oo/"
 func trusted(_ url:URL?) -> Bool {url?.scheme == "https" && url?.host == host && (url?.path.hasPrefix(path) ?? false)}
 override func viewDidLoad(){
  super.viewDidLoad();let config=WKWebViewConfiguration();config.userContentController.add(self,name:"taxi")
  web=WKWebView(frame:view.bounds,configuration:config);web.autoresizingMask=[.flexibleWidth,.flexibleHeight];web.navigationDelegate=self;view.addSubview(web)
  web.load(URLRequest(url:URL(string:"https://\(host)\(path)")!))
 }
 func webView(_ webView:WKWebView,decidePolicyFor navigationAction:WKNavigationAction,decisionHandler:@escaping (WKNavigationActionPolicy)->Void){
  if trusted(navigationAction.request.url){decisionHandler(.allow)}else{decisionHandler(.cancel);if let u=navigationAction.request.url,u.scheme == "https",navigationAction.targetFrame?.isMainFrame != false{UIApplication.shared.open(u)}}
 }
 func userContentController(_ userContentController:WKUserContentController,didReceive message:WKScriptMessage){
  guard message.frameInfo.isMainFrame,trusted(message.frameInfo.request.url),let text=message.body as? String,let data=text.data(using:.utf8),let m=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any],let id=m["id"] as? Int else{return}
  var result:[String:Any]
  do{
   let d=m["data"] as? [String:Any] ?? [:]
   switch m["action"] as? String {
    case "start":try meter.start(d)
    case "configure":meter.config=d
    case "stop":meter.stop()
    case "snapshot":break
    default:throw NSError(domain:"Unknown action",code:1)
   };result=meter.state
  }catch{result=["error":error.localizedDescription]}
  if let bytes=try? JSONSerialization.data(withJSONObject:result),let json=String(data:bytes,encoding:.utf8){web.evaluateJavaScript("window.taxiNativeReply && window.taxiNativeReply(\(id),\(json))")}
 }
}

final class RideMeter:NSObject,CLLocationManagerDelegate {
 let manager=CLLocationManager();var state:[String:Any]=[:],config:[String:Any]=[:];var previous:CLLocation?;var lastSent=Date.distantPast;var sending=false
 override init(){super.init();manager.delegate=self;manager.desiredAccuracy=kCLLocationAccuracyBestForNavigation;manager.distanceFilter=kCLDistanceFilterNone;manager.activityType = .automotiveNavigation;manager.pausesLocationUpdatesAutomatically=false;manager.allowsBackgroundLocationUpdates=true;manager.showsBackgroundLocationIndicator=true
  if let bytes=UserDefaults.standard.data(forKey:"ride"),let saved=(try? JSONSerialization.jsonObject(with:bytes)) as? [String:Any]{state=saved}
 }
 func save(){if let data=try? JSONSerialization.data(withJSONObject:state){UserDefaults.standard.set(data,forKey:"ride")}}
 func start(_ d:[String:Any])throws{
  if manager.authorizationStatus == .notDetermined {manager.requestWhenInUseAuthorization()}
  guard manager.authorizationStatus == .authorizedAlways || manager.authorizationStatus == .authorizedWhenInUse else {throw NSError(domain:"Allow location in Settings, then Start again",code:1)}
  guard let id=d["rideId"] as? String else{throw NSError(domain:"Missing ride",code:1)}
  if state["active"] as? Bool == true,state["rideId"] as? String != id{throw NSError(domain:"Restore the existing ride first",code:1)}
  if state["rideId"] as? String != id {state=["rideId":id,"meters":d["meters"] as? Double ?? 0];previous=nil}
  state["active"]=true;state["metered"]=d["metered"] as? Bool ?? true;save();manager.startUpdatingLocation()
 }
 func stop(){manager.stopUpdatingLocation();state["active"]=false;config=[:];previous=nil;save()}
 func locationManager(_ manager:CLLocationManager,didUpdateLocations locations:[CLLocation]){
  guard state["active"] as? Bool == true else{return}
  for p in locations.sorted(by:{$0.timestamp < $1.timestamp}){
   guard p.horizontalAccuracy>=0,p.horizontalAccuracy<=50,abs(p.timestamp.timeIntervalSinceNow)<15 else{continue}
   state["lat"]=p.coordinate.latitude;state["lng"]=p.coordinate.longitude;state["accuracy"]=p.horizontalAccuracy;state["timestamp"]=p.timestamp.timeIntervalSince1970*1000
   if let old=previous {let dt=p.timestamp.timeIntervalSince(old.timestamp),distance=p.distance(from:old)
    if dt>30 {state["gap"]=true;previous=p}
    else if dt>=1,distance>=2,distance<=500,distance/dt<=55 {if state["metered"] as? Bool == true{state["meters"]=(state["meters"] as? Double ?? 0)+distance};previous=p}
   }else{previous=p}
  };save();if Date().timeIntervalSince(lastSent)>=10 {publish()}
 }
 func locationManager(_ manager:CLLocationManager,didFailWithError error:Error){state["gap"]=true;save()}
 func publish(){
  guard !sending,let token=config["token"] as? String,let share=config["share"] as? String,token.range(of:"^[a-f0-9]{64}$",options:.regularExpression) != nil,share.range(of:"^[a-f0-9]{64}$",options:.regularExpression) != nil,let rates=config["rates"] as? [String:Any],let lat=state["lat"],let lng=state["lng"] else{return}
  func n(_ d:[String:Any],_ k:String)->Double{(d[k] as? NSNumber)?.doubleValue ?? 0}
  let km=(state["metered"] as? Bool == true ? n(state,"meters"):n(config,"manualMeters"))/1000
  var fare=(n(config,"manualFare")>0 ? n(config,"manualFare"):n(rates,"base")+max(0,km-1)*n(rates,"rate"))+n(config,"wait")*n(rates,"waitRate")-n(config,"discount")
  if config["night"] as? Bool == true {fare *= 1+n(rates,"nightPercent")/100}
  let payload:[String:Any]=["lat":lat,"lng":lng,"currentFare":max(0,fare.rounded()),"distanceTraveled":String(format:"%.2f",km),"status":"active","mode":config["mode"] ?? ""]
  var request=URLRequest(url:URL(string:"https://odd-sun-eecf.dilshan7878787.workers.dev/api/track/\(share)")!);request.httpMethod="PUT";request.timeoutInterval=10;request.setValue("Bearer \(token)",forHTTPHeaderField:"Authorization");request.setValue("application/json",forHTTPHeaderField:"Content-Type");request.httpBody=try? JSONSerialization.data(withJSONObject:payload)
  sending=true;lastSent=Date();URLSession.shared.dataTask(with:request){_,response,error in DispatchQueue.main.async{self.sending=false;self.state["telemetryStatus"]=(response as? HTTPURLResponse)?.statusCode ?? 0}}.resume()
 }
}
