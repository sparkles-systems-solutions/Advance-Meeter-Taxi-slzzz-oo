import UIKit
import WebKit
import CoreLocation
import Security
import Speech
import AVFoundation
import MessageUI

@main class AppDelegate: UIResponder, UIApplicationDelegate {
 var window: UIWindow?
 func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
  let window=UIWindow(frame: UIScreen.main.bounds);window.rootViewController=DriverController();window.makeKeyAndVisible();self.window=window;return true
 }
}

final class DriverController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate, MFMailComposeViewControllerDelegate {
 let meter=RideMeter();var web:WKWebView!;let audioEngine=AVAudioEngine();var speechTask:SFSpeechRecognitionTask?
 let host="sparkles-systems-solutions.github.io", path="/Advance-Meeter-Taxi-slzzz-oo/driver-test/"
 func trusted(_ url:URL?) -> Bool {url?.scheme == "https" && url?.host == host && (url?.path.hasPrefix(path) ?? false)}
 override func viewDidLoad(){
  super.viewDidLoad();let config=WKWebViewConfiguration();config.userContentController.add(self,name:"taxi")
  web=WKWebView(frame:.zero,configuration:config);web.translatesAutoresizingMaskIntoConstraints=false;web.navigationDelegate=self;view.addSubview(web)
  NSLayoutConstraint.activate([web.topAnchor.constraint(equalTo:view.safeAreaLayoutGuide.topAnchor),web.bottomAnchor.constraint(equalTo:view.safeAreaLayoutGuide.bottomAnchor),web.leadingAnchor.constraint(equalTo:view.safeAreaLayoutGuide.leadingAnchor),web.trailingAnchor.constraint(equalTo:view.safeAreaLayoutGuide.trailingAnchor)])
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
    case "start":try meter.start(d);result=meter.state
    case "configure":meter.config=d;result=meter.state
    case "stop":meter.stop();result=meter.state
    case "snapshot":result=meter.state
    case "sharePdf":try sharePdf(d);result=["ok":true]
    case "savePdf":try savePdf(d);result=["ok":true]
    case "printPdf":try printPdf(d);result=["ok":true]
    case "voice":startVoice(id:id,language:(d["language"] as? String) ?? "en-US");return
    case "saveSession":try saveSession(d);result=["ok":true]
    case "loadSession":result=loadSession()
    case "clearSession":clearSession();result=["ok":true]
    default:throw NSError(domain:"Unknown action",code:1)
   }
  }catch{result=["error":error.localizedDescription]}
  if let bytes=try? JSONSerialization.data(withJSONObject:result),let json=String(data:bytes,encoding:.utf8){web.evaluateJavaScript("window.taxiNativeReply && window.taxiNativeReply(\(id),\(json))")}
 }
 func sendVoice(_ id:Int,_ result:[String:Any]){
  if let bytes=try? JSONSerialization.data(withJSONObject:result),let json=String(data:bytes,encoding:.utf8){web.evaluateJavaScript("window.taxiNativeReply && window.taxiNativeReply(\(id),\(json))")}
 }
 func startVoice(id:Int,language:String){
  SFSpeechRecognizer.requestAuthorization{status in DispatchQueue.main.async{
   guard status == .authorized,let recognizer=SFSpeechRecognizer(locale:Locale(identifier:language)),recognizer.isAvailable else{self.sendVoice(id,["error":"Allow Speech Recognition and Microphone in Settings"]);return}
   let request=SFSpeechAudioBufferRecognitionRequest();request.shouldReportPartialResults=true
   let session=AVAudioSession.sharedInstance()
   do{try session.setCategory(.record,mode:.measurement,options:.duckOthers);try session.setActive(true,options:.notifyOthersOnDeactivation)
    let node=self.audioEngine.inputNode;node.removeTap(onBus:0);let format=node.outputFormat(forBus:0);node.installTap(onBus:0,bufferSize:1024,format:format){buffer,_ in request.append(buffer)}
    self.audioEngine.prepare();try self.audioEngine.start()
   }catch{self.sendVoice(id,["error":"Microphone could not start"]);return}
   var last="";var replied=false
   func finish(_ error:String?=nil){guard !replied else{return};replied=true;self.audioEngine.stop();self.audioEngine.inputNode.removeTap(onBus:0);request.endAudio();self.speechTask?.cancel();try? session.setActive(false,options:.notifyOthersOnDeactivation);self.sendVoice(id,error != nil ? ["error":error!] : ["transcript":last])}
   self.speechTask=recognizer.recognitionTask(with:request){result,error in DispatchQueue.main.async{if let result=result{last=result.bestTranscription.formattedString;if result.isFinal{finish(last.isEmpty ? "No command heard" : nil)}}else if error != nil{finish("No command heard")}}}
   DispatchQueue.main.asyncAfter(deadline:.now()+8){finish(last.isEmpty ? "No command heard" : nil)}
  }}
 }
 func saveSession(_ d:[String:Any])throws{
  guard let token=d["token"] as? String,token.range(of:"^[a-f0-9]{64}$",options:.regularExpression) != nil,d["user"] is [String:Any] else{throw NSError(domain:"Invalid session",code:1)}
  let value=try JSONSerialization.data(withJSONObject:d),query:[String:Any]=[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"com.sparkles.taxidriver.session",kSecAttrAccount as String:"active"]
  SecItemDelete(query as CFDictionary);var add=query;add[kSecValueData as String]=value;guard SecItemAdd(add as CFDictionary,nil)==errSecSuccess else{throw NSError(domain:"Could not save session",code:1)}
 }
 func loadSession()->[String:Any]{
  let query:[String:Any]=[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"com.sparkles.taxidriver.session",kSecAttrAccount as String:"active",kSecReturnData as String:true,kSecMatchLimit as String:kSecMatchLimitOne]
  var item:CFTypeRef?;guard SecItemCopyMatching(query as CFDictionary,&item)==errSecSuccess,let value=item as? Data,let result=(try? JSONSerialization.jsonObject(with:value)) as? [String:Any] else{return [:]};return result
 }
 func clearSession(){let query:[String:Any]=[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"com.sparkles.taxidriver.session",kSecAttrAccount as String:"active"];SecItemDelete(query as CFDictionary)}
 func sharePdf(_ d:[String:Any])throws{
  let file=try pdfFile(d),text=(d["text"] as? String) ?? "Taxi receipt",subject=(d["title"] as? String) ?? "Taxi receipt"
  if MFMailComposeViewController.canSendMail(){let mail=MFMailComposeViewController();mail.mailComposeDelegate=self;mail.setSubject(subject);mail.setMessageBody(text,isHTML:false);if let email=d["email"] as? String,!email.isEmpty{mail.setToRecipients([email])};mail.addAttachmentData(file.data,mimeType:"application/pdf",fileName:file.url.lastPathComponent);present(mail,animated:true);return}
  let sheet=UIActivityViewController(activityItems:[text,file.url],applicationActivities:nil);if let pop=sheet.popoverPresentationController{pop.sourceView=view;pop.sourceRect=CGRect(x:view.bounds.midX,y:view.bounds.midY,width:1,height:1)};present(sheet,animated:true)
 }
 func pdfFile(_ d:[String:Any])throws->(url:URL,data:Data){guard let encoded=d["base64"] as? String,encoded.count<8_000_000,let data=Data(base64Encoded:encoded) else{throw NSError(domain:"Invalid receipt PDF",code:1)};let raw=(d["name"] as? String) ?? "taxi-receipt.pdf",name=raw.replacingOccurrences(of:"[^A-Za-z0-9._-]",with:"_",options:.regularExpression),url=FileManager.default.temporaryDirectory.appendingPathComponent(name);try data.write(to:url,options:.atomic);return(url,data)}
 func savePdf(_ d:[String:Any])throws{let file=try pdfFile(d),picker=UIDocumentPickerViewController(forExporting:[file.url],asCopy:true);present(picker,animated:true)}
 func printPdf(_ d:[String:Any])throws{let file=try pdfFile(d),printer=UIPrintInteractionController.shared;printer.printingItem=file.url;printer.printInfo=UIPrintInfo(dictionary:nil);printer.printInfo?.jobName=file.url.lastPathComponent;printer.printInfo?.outputType = .general;printer.present(animated:true)}
 func mailComposeController(_ controller:MFMailComposeViewController,didFinishWith result:MFMailComposeResult,error:Error?){controller.dismiss(animated:true)}
}

final class RideMeter:NSObject,CLLocationManagerDelegate {
 let manager=CLLocationManager();var state:[String:Any]=[:],config:[String:Any]=[:];var previous:CLLocation?;var lastSent=Date.distantPast;var sending=false;var recoverySerial=0
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
   let savedLat=(state["lat"] as? NSNumber)?.doubleValue,savedLng=(state["lng"] as? NSNumber)?.doubleValue,savedTime=(state["timestamp"] as? NSNumber)?.doubleValue
   state["lat"]=p.coordinate.latitude;state["lng"]=p.coordinate.longitude;state["accuracy"]=p.horizontalAccuracy;state["timestamp"]=p.timestamp.timeIntervalSince1970*1000
   state["quality"]=p.horizontalAccuracy<=15 ? "excellent" : p.horizontalAccuracy<=30 ? "good" : "weak"
   if let old=previous {let dt=p.timestamp.timeIntervalSince(old.timestamp),distance=p.distance(from:old)
    if dt>30 {recoverGap(old,p,dt);previous=p}
    else if dt>=1,distance>=2,distance<=500,distance/dt<=55 {if state["metered"] as? Bool == true{state["meters"]=(state["meters"] as? Double ?? 0)+distance};previous=p}
   }else if let lat=savedLat,let lng=savedLng,let millis=savedTime {let saved=CLLocation(coordinate:CLLocationCoordinate2D(latitude:lat,longitude:lng),altitude:0,horizontalAccuracy:50,verticalAccuracy:50,timestamp:Date(timeIntervalSince1970:millis/1000)),dt=p.timestamp.timeIntervalSince(saved.timestamp);if dt>30{recoverGap(saved,p,dt)};previous=p}
   else{previous=p}
  };save();if Date().timeIntervalSince(lastSent)>=10 {publish()}
 }
 func locationManager(_ manager:CLLocationManager,didFailWithError error:Error){state["gap"]=true;save()}
 func recoverGap(_ from:CLLocation,_ to:CLLocation,_ seconds:Double){
  let direct=from.distance(from:to);guard direct>=2,direct/max(1,seconds)<=55 else{return}
  recoverySerial += 1;let serial=recoverySerial,ride=state["rideId"] as? String
  if state["metered"] as? Bool == true {state["meters"]=(state["meters"] as? Double ?? 0)+direct}
  state["recoveredMeters"]=(state["recoveredMeters"] as? Double ?? 0)+direct;state["gapCount"]=(state["gapCount"] as? Int ?? 0)+1;state["gap"]=true;save()
  let coords="\(from.coordinate.longitude),\(from.coordinate.latitude);\(to.coordinate.longitude),\(to.coordinate.latitude)"
  guard let url=URL(string:"https://router.project-osrm.org/route/v1/driving/\(coords)?overview=false&alternatives=false&steps=false") else{return}
  URLSession.shared.dataTask(with:url){data,_,_ in
   var extra=0.0
   if let data=data,let root=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any],let routes=root["routes"] as? [[String:Any]],let road=(routes.first?["distance"] as? NSNumber)?.doubleValue {let ceiling=min(seconds*55,direct*4+1000);if road>=direct*0.9,road<=ceiling{extra=max(0,road-direct)}}
   DispatchQueue.main.async{guard self.recoverySerial==serial,self.state["rideId"] as? String==ride,self.state["active"] as? Bool==true else{return};if self.state["metered"] as? Bool == true{self.state["meters"]=(self.state["meters"] as? Double ?? 0)+extra};self.state["recoveredMeters"]=(self.state["recoveredMeters"] as? Double ?? 0)+extra;self.state["gap"]=false;self.save()}
  }.resume()
 }
 func publish(){
  guard !sending,let token=config["token"] as? String,let share=config["share"] as? String,token.range(of:"^[a-f0-9]{64}$",options:.regularExpression) != nil,share.range(of:"^[a-f0-9]{64}$",options:.regularExpression) != nil,let rates=config["rates"] as? [String:Any],let lat=state["lat"],let lng=state["lng"] else{return}
  func n(_ d:[String:Any],_ k:String)->Double{(d[k] as? NSNumber)?.doubleValue ?? 0}
  let km=(state["metered"] as? Bool == true ? n(state,"meters"):n(config,"manualMeters"))/1000
  var fare=(n(config,"manualFare")>0 ? n(config,"manualFare"):n(rates,"base")+max(0,km-1)*n(rates,"rate"))+n(config,"wait")*n(rates,"waitRate")-n(config,"discount")
  if config["night"] as? Bool == true {fare *= 1+n(rates,"nightPercent")/100}
  var payload:[String:Any]=["lat":lat,"lng":lng,"currentFare":max(0,fare.rounded()),"distanceTraveled":String(format:"%.2f",km),"status":"active","mode":config["mode"] ?? ""];if let route=config["route"] as? [String:Any]{payload["route"]=route}
  var request=URLRequest(url:URL(string:"https://odd-sun-eecf.dilshan7878787.workers.dev/api/track/\(share)")!);request.httpMethod="PUT";request.timeoutInterval=10;request.setValue("Bearer \(token)",forHTTPHeaderField:"Authorization");request.setValue("application/json",forHTTPHeaderField:"Content-Type");request.httpBody=try? JSONSerialization.data(withJSONObject:payload)
  sending=true;lastSent=Date();URLSession.shared.dataTask(with:request){_,response,error in DispatchQueue.main.async{self.sending=false;self.state["telemetryStatus"]=(response as? HTTPURLResponse)?.statusCode ?? 0}}.resume()
 }
}
