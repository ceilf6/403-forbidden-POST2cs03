from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread
from urllib.request import Request, urlopen


class Receiver(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)

        print("\n=== 接收到的请求 ===")
        print(self.requestline)
        print(self.headers, end="")
        print(body.decode("utf-8"))

        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"received")

    def log_message(self, *args):
        pass


# 仅监听本机；自动选择空闲端口。
server = HTTPServer(("127.0.0.1", 0), Receiver)
worker = Thread(target=server.handle_request, daemon=True)
worker.start()

boundary = "demo-boundary"
body = (
    f"--{boundary}\r\n"
    'Content-Disposition: form-data; name="note"\r\n'
    "\r\n"
    "hello\r\n"
    f"--{boundary}\r\n"
    'Content-Disposition: form-data; name="file"; filename="demo.txt"\r\n'
    "Content-Type: text/plain\r\n"
    "\r\n"
    "ordinary test file\r\n"
    f"--{boundary}--\r\n"
).encode("utf-8")

request = Request(
    f"http://127.0.0.1:{server.server_port}/example",
    data=body,
    headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    method="POST",
)

try:
    with urlopen(request, timeout=5) as response:
        print("响应：", response.status, response.read().decode())
finally:
    worker.join(timeout=5)
    server.server_close()