#!/usr/bin/env python3
"""税法速查工具 - 本地服务器"""
import http.server
import socketserver
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8899
DIR = os.path.dirname(os.path.abspath(__file__))

class TaxLawHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)
    
    def log_message(self, format, *args):
        sys.stderr.write(f"[税法速查] {args[0]} {args[1]} {args[2]}\n")

Handler = TaxLawHandler

print(f"📜 税法速查工具已启动！")
print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
print(f"  PC 端访问:  http://localhost:{PORT}")
print(f"  手机端访问:  http://<本机IP>:{PORT}")
print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
print(f"  按 Ctrl+C 停止服务器")
print(f"")

with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
    httpd.serve_forever()
