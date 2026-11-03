# 確認用のローカルサーバー。app/ を http://127.0.0.1:<port>/ で出す。
# ブラウザに古い控え（キャッシュ）を使わせないよう、毎回 Cache-Control: no-store を付ける。
# 使い方: python tools/serve.py [port]   （既定 8765。.claude/launch.json からも呼ぶ）
import functools
import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app")
    handler = functools.partial(NoCacheHandler, directory=root)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    print("serving", os.path.abspath(root), "on http://127.0.0.1:%d/" % port, flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
