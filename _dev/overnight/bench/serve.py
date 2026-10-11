"""Serve the site for the benchmarks: a test board from out/<name>/ laid over the repo,
the way _dev/garden-thumbs.py serves it (a plain static server, no Jekyll)."""
import functools
import http.server
import os
import pathlib
import threading

# The site: the working tree, or a frozen copy of it (run.sh makes one per label, so
# the code can be edited while a benchmark runs)
ROOT = pathlib.Path(os.environ.get("BENCH_ROOT") or pathlib.Path(__file__).resolve().parents[3]).resolve()
OUT = pathlib.Path(os.environ.get("BENCH_BOARDS") or pathlib.Path(__file__).resolve().parent / "out").resolve()


class Handler(http.server.SimpleHTTPRequestHandler):
    overlay = None

    def log_message(self, *args):
        pass

    def handle(self):
        try:
            super().handle()
        except (BrokenPipeError, ConnectionResetError):
            pass            # the browser closed or dropped a request it no longer wanted

    def translate_path(self, path):
        # The board's own files first, then the working tree
        for base in (self.overlay, ROOT):
            p = pathlib.Path(super().translate_path(path).replace(str(ROOT), str(base), 1))
            if p.is_dir() and (p / "index.html").exists():
                return str(p / "index.html")
            if p.exists() and not p.is_dir():
                return str(p)
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")    # every run gets the current code
        super().end_headers()


def serve(board):
    handler = type("BoardHandler", (Handler,), {"overlay": OUT / board})
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(handler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_address[1]}"
