import http.server, socketserver, os, re, gzip, io
ROOT=os.path.dirname(os.path.abspath(__file__))
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*a,**k): super().__init__(*a,directory=ROOT,**k)
    def guess_type(self, path):
        t = super().guess_type(path)
        if t == 'text/html': return 'text/html; charset=utf-8'
        return t
    # 第253巡：GitHub Pages と同じく gzip で返す（速さの計測が本番と合うように）
    def send_head(self):
        path=self.translate_path(self.path)
        if os.path.isdir(path) or not os.path.exists(path): return super().send_head()
        if 'gzip' not in self.headers.get('Accept-Encoding',''): return super().send_head()
        if not path.endswith(('.html','.js','.css','.json','.svg')): return super().send_head()
        with open(path,'rb') as f: raw=f.read()
        body=gzip.compress(raw, 6)
        self.send_response(200)
        self.send_header('Content-type', self.guess_type(path))
        self.send_header('Content-Encoding','gzip')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        return io.BytesIO(body)
    # 検査用：ブラウザから画像などを書き出せるように（このフォルダの直下だけ）
    def do_PUT(self):
        name=os.path.basename(self.path.split('?')[0])
        if not re.fullmatch(r'[A-Za-z0-9_.-]+', name): self.send_response(400); self.end_headers(); return
        n=int(self.headers.get('Content-Length','0')); data=self.rfile.read(n)
        with open(os.path.join(ROOT,'out_'+name),'wb') as f: f.write(data)
        self.send_response(200); self.end_headers(); self.wfile.write(b'ok')
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(("", int(os.environ.get("PORT","8731"))), H) as s:
    s.serve_forever()
