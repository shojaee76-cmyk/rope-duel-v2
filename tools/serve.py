"""ROPE DUEL - detached static server (Windows). Usage: python tools/serve.py [port]"""
import subprocess, sys, os

port = sys.argv[1] if len(sys.argv) > 1 else "8099"
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DETACHED = 0x00000008 | 0x00000200 | 0x00000004  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW
log = open(os.path.join(root, "server.log"), "w")
p = subprocess.Popen(
    [sys.executable, "-m", "http.server", port, "--directory", root],
    stdout=log, stderr=subprocess.STDOUT, creationflags=DETACHED, close_fds=True,
)
print("pid", p.pid)
