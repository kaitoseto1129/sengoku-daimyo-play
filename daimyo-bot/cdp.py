import json, websocket, urllib.request, time, base64, subprocess, os, sys, shutil
# 第257巡（作り手：ギット上で百人に遊ばせる）：Mac でも Linux（GitHub のランナー）でも動くように。
# CDP_PORT で口を変えられる（同じ機械で二つ並べて回せる）
PORT=int(os.environ.get('CDP_PORT','9333'))
def chrome_bin():
    c=os.environ.get('CHROME')
    if c: return c
    for p in ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
              "/Applications/Chromium.app/Contents/MacOS/Chromium",
              "/usr/bin/google-chrome","/usr/bin/google-chrome-stable",
              "/usr/bin/chromium","/usr/bin/chromium-browser","/snap/bin/chromium"]:
        if os.path.exists(p): return p
    for n in ["google-chrome","google-chrome-stable","chromium","chromium-browser"]:
        w=shutil.which(n)
        if w: return w
    raise RuntimeError("検査用のブラウザ（Chrome）が見つかりません。CHROME にその場所を入れてください")
class CDP:
    def __init__(self, w=1280, h=720, scale=1, port=None):
        self.port=int(port or PORT)
        base="http://localhost:%d"%self.port
        try: json.load(urllib.request.urlopen(base+"/json/version"))
        except Exception:
            args=[chrome_bin(),"--headless=new","--remote-debugging-port=%d"%self.port,
                  "--no-first-run","--no-default-browser-check","--disable-gpu","--remote-allow-origins=*",
                  "--user-data-dir=/tmp/sengoku-chrome-prof-%d"%self.port,
                  "--window-size=%d,%d"%(w,h),"about:blank"]
            if sys.platform!="darwin" or os.environ.get("CI"):
                # ランナーの中では砦（sandbox）を外し、共有記憶の狭さを避ける
                args[1:1]=["--no-sandbox","--disable-dev-shm-usage","--disable-software-rasterizer","--mute-audio","--hide-scrollbars"]
            subprocess.Popen(args,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            for _ in range(60):
                time.sleep(0.5)
                try: json.load(urllib.request.urlopen(base+"/json/version")); break
                except Exception: pass
            else: raise RuntimeError("ブラウザが立ち上がりませんでした（%s）"%chrome_bin())
        req=urllib.request.Request(base+"/json/new?about:blank", method="PUT"); t=json.load(urllib.request.urlopen(req))
        self.tid=t["id"]; self.ws=websocket.create_connection(t["webSocketDebuggerUrl"]); self.ws.settimeout(1800); self.mid=0
        self.send("Page.enable"); self.send("Runtime.enable"); self.send("Network.enable"); self.send("Network.setCacheDisabled", cacheDisabled=True)   # 第204巡：古い頁が残って直しが検査に映らないことがあった
        self.send("Emulation.setDeviceMetricsOverride", width=w, height=h, deviceScaleFactor=scale, mobile=False)
    def send(self, method, **params):
        self.mid+=1; self.ws.send(json.dumps({"id":self.mid,"method":method,"params":params}))
        while True:
            m=json.loads(self.ws.recv())
            if m.get("id")==self.mid: return m.get("result",m)
    def goto(self, url): self.send("Page.navigate", url=url); time.sleep(2.0)
    def js(self, expr):
        r=self.send("Runtime.evaluate", expression=expr, awaitPromise=True, returnByValue=True)
        if "exceptionDetails" in r: raise RuntimeError(json.dumps(r["exceptionDetails"])[:800])
        return r.get("result",{}).get("value")
    def shot(self, path):
        r=self.send("Page.captureScreenshot", format="png"); data=base64.b64decode(r["data"]); open(path,"wb").write(data); print("saved",path,len(data))
    def close(self):
        try: self.ws.close()
        except Exception: pass
        try: urllib.request.urlopen("http://localhost:%d/json/close/%s"%(self.port,self.tid))
        except Exception: pass
