"""Serviço mínimo de cotação (yfinance). Só deve ser acessível pela rede interna do Compose."""
import json
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import yfinance as yf

TTL = 10  # segundos de cache por ativo, para não martelar o Yahoo
_cache: dict = {}
_lock = threading.Lock()


def get_quote(symbol: str) -> dict:
    now = time.time()
    with _lock:
        hit = _cache.get(symbol)
        if hit and now - hit[0] < TTL:
            return hit[1]
    info = yf.Ticker(f"{symbol}.SA").fast_info
    price = info["last_price"]
    prev = info["previous_close"]
    if price is None:
        raise ValueError("sem cotação para o ativo")
    data = {
        "symbol": symbol,
        "price": float(price),
        "previousClose": float(prev) if prev is not None else None,
        "changePct": (float(price) / float(prev) - 1) * 100 if prev else None,
        "source": "yfinance",
        "fetchedAt": int(now),
    }
    with _lock:
        _cache[symbol] = (now, data)
    return data


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: dict):
        raw = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/health":
            return self._send(200, {"ok": True})
        if url.path != "/quote":
            return self._send(404, {"error": "não encontrado"})
        symbol = (parse_qs(url.query).get("symbol") or [""])[0].upper()
        if not re.fullmatch(r"[A-Z0-9]{4,8}", symbol):
            return self._send(400, {"error": "símbolo inválido"})
        try:
            self._send(200, get_quote(symbol))
        except Exception as e:  # yfinance levanta vários tipos de erro de rede/dados
            self._send(502, {"error": f"falha ao obter cotação: {e}"})

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
