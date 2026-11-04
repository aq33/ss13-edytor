"""Lokalny serwer edytora map.

Serwuje interfejs z folderu web/, pliki repozytorium (ikony .dmi, mapy .dmm)
i zapisuje mapy z powrotem do repo. Nasłuchuje tylko na 127.0.0.1.

Użycie: python serwer.py [--repo ŚCIEŻKA] [--port 8613]
"""

import argparse
import gzip
import hashlib
import json
import mimetypes
import os
import re
import socket
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

import ekstraktor

TUTAJ = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(TUTAJ, "web")
DANE = os.path.join(TUTAJ, "dane")
SZABLONY = os.path.join(TUTAJ, "szablony")

blokada_typow = threading.Lock()
pamiec = {"typy": None, "klucz": None}


def znajdz_dme(repo):
    dme = [f for f in os.listdir(repo) if f.lower().endswith(".dme")]
    if not dme:
        sys.exit("W %s nie ma pliku .dme" % repo)
    return os.path.join(repo, sorted(dme)[0])


def odcisk_kodu(repo):
    """Najnowszy czas modyfikacji pliku .dm/.dme – mówi, czy katalog trzeba odświeżyć."""
    najnowszy = 0.0
    for korzen, katalogi, pliki in os.walk(repo):
        katalogi[:] = [k for k in katalogi if not k.startswith(".") and k not in ("node_modules", "tgui", "_maps", "icons", "sound", "data", "tools")]
        for p in pliki:
            if p.endswith((".dm", ".dme")):
                t = os.path.getmtime(os.path.join(korzen, p))
                if t > najnowszy:
                    najnowszy = t
    return najnowszy


def uzycie_w_mapach(repo):
    """Ile razy każdy typ występuje w słownikach map – do sortowania katalogu."""
    licznik = {}
    katalog = os.path.join(repo, "_maps")
    for korzen, _, pliki in os.walk(katalog):
        for p in pliki:
            if not p.endswith(".dmm"):
                continue
            try:
                with open(os.path.join(korzen, p), encoding="utf-8", errors="replace") as f:
                    for m in re.finditer(r"^(/[\w/]+)", f.read(), re.M):
                        licznik[m.group(1)] = licznik.get(m.group(1), 0) + 1
            except OSError:
                pass
    return licznik


def typy_json(repo, wymus=False):
    with blokada_typow:
        os.makedirs(DANE, exist_ok=True)
        dme = znajdz_dme(repo)
        nazwa = hashlib.sha1(os.path.abspath(repo).lower().encode()).hexdigest()[:10]
        plik = os.path.join(DANE, "typy-%s.json.gz" % nazwa)
        # Zmiana ekstraktora też unieważnia zapisany katalog.
        odcisk = max(odcisk_kodu(repo), os.path.getmtime(ekstraktor.__file__))
        if not wymus and pamiec["typy"] is not None and pamiec["klucz"] == odcisk:
            return pamiec["typy"]
        if not wymus and os.path.exists(plik) and os.path.getmtime(plik) >= odcisk:
            with open(plik, "rb") as f:
                pamiec["typy"] = f.read()
                pamiec["klucz"] = odcisk
                return pamiec["typy"]
        print("Czytam kod z %s ..." % dme, flush=True)
        dane = ekstraktor.ekstrahuj(dme)
        print("  typów atomów: %d z %d plików" % (len(dane["typy"]), dane["pliki"]), flush=True)
        wynik = {"typy": dane["typy"], "uzycie": uzycie_w_mapach(repo)}
        surowe = gzip.compress(json.dumps(wynik, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), 6)
        with open(plik, "wb") as f:
            f.write(surowe)
        pamiec["typy"] = surowe
        pamiec["klucz"] = odcisk
        return surowe


def lista_map(repo):
    wynik = []
    katalog = os.path.join(repo, "_maps")
    for korzen, _, pliki in os.walk(katalog):
        for p in pliki:
            if p.endswith(".dmm"):
                sciezka = os.path.relpath(os.path.join(korzen, p), repo).replace("\\", "/")
                wynik.append({"plik": sciezka, "rozmiar": os.path.getsize(os.path.join(korzen, p))})
    wynik.sort(key=lambda m: m["plik"].lower())
    return wynik


class Obsluga(BaseHTTPRequestHandler):
    repo = ""
    protocol_version = "HTTP/1.1"   # połączenia keep-alive – ikon są setki

    def log_message(self, fmt, *args):
        if "/repo/" in (args[0] if args else ""):
            return
        sys.stderr.write("%s\n" % (fmt % args))

    def _wyslij(self, kod, tresc, typ="application/json; charset=utf-8", naglowki=None):
        self.send_response(kod)
        self.send_header("Content-Type", typ)
        self.send_header("Content-Length", str(len(tresc)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (naglowki or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(tresc)

    def _json(self, obiekt, kod=200):
        self._wyslij(kod, json.dumps(obiekt, ensure_ascii=False).encode("utf-8"))

    def _bezpieczna(self, wzgledna):
        sciezka = os.path.normpath(os.path.join(self.repo, unquote(wzgledna)))
        if os.path.commonpath([sciezka, self.repo]) != self.repo:
            return None
        return sciezka

    def do_GET(self):
        url = urlparse(self.path)
        p = url.path
        if p == "/api/info":
            return self._json({"repo": self.repo, "dme": os.path.basename(znajdz_dme(self.repo)), "mapy": lista_map(self.repo)})
        if p == "/api/szablony":
            wynik = []
            if os.path.isdir(SZABLONY):
                for f in sorted(os.listdir(SZABLONY)):
                    if f.endswith(".json"):
                        try:
                            with open(os.path.join(SZABLONY, f), encoding="utf-8") as h:
                                d = json.load(h)
                            d["plik"] = f
                            wynik.append(d)
                        except (OSError, ValueError):
                            pass
            return self._json(wynik)
        if p == "/api/typy":
            surowe = typy_json(self.repo, "odswiez" in parse_qs(url.query))
            return self._wyslij(200, surowe, naglowki={"Content-Encoding": "gzip"})
        if p.startswith("/repo/"):
            sciezka = self._bezpieczna(p[len("/repo/"):])
            if not sciezka or not os.path.isfile(sciezka):
                return self._wyslij(404, b"brak pliku", "text/plain")
            with open(sciezka, "rb") as f:
                tresc = f.read()
            typ = "image/png" if sciezka.lower().endswith((".dmi", ".png")) else "text/plain; charset=utf-8"
            return self._wyslij(200, tresc, typ)
        # Pliki interfejsu.
        if p == "/":
            p = "/index.html"
        sciezka = os.path.normpath(os.path.join(WEB, p.lstrip("/")))
        if os.path.commonpath([sciezka, WEB]) != WEB or not os.path.isfile(sciezka):
            return self._wyslij(404, b"nie ma", "text/plain")
        typ = mimetypes.guess_type(sciezka)[0] or "application/octet-stream"
        if typ.startswith("text/") or typ.endswith("javascript"):
            typ += "; charset=utf-8"
        with open(sciezka, "rb") as f:
            self._wyslij(200, f.read(), typ)

    def _z_interfejsu(self):
        # Tylko z interfejsu na localhost – inne strony nie mogą zapisywać plików.
        pochodzenie = self.headers.get("Origin", "")
        return not pochodzenie or re.match(r"^http://(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$", pochodzenie)

    def _szablon(self, metoda):
        nazwa = parse_qs(urlparse(self.path).query).get("plik", [""])[0]
        if not re.fullmatch(r"[\w\-ąćęłńóśźżĄĆĘŁŃÓŚŹŻ ]{1,80}\.json", nazwa):
            return self._json({"blad": "zła nazwa szablonu"}, 400)
        sciezka = os.path.join(SZABLONY, nazwa)
        if metoda == "DELETE":
            if os.path.exists(sciezka):
                os.remove(sciezka)
            return self._json({"ok": True})
        dane = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        try:
            json.loads(dane)
        except ValueError:
            return self._json({"blad": "to nie JSON"}, 400)
        os.makedirs(SZABLONY, exist_ok=True)
        with open(sciezka, "wb") as f:
            f.write(dane)
        return self._json({"ok": True, "plik": nazwa})

    def do_DELETE(self):
        if not self._z_interfejsu():
            return self._json({"blad": "zła strona"}, 403)
        if urlparse(self.path).path == "/api/szablon":
            return self._szablon("DELETE")
        return self._wyslij(404, b"", "text/plain")

    def do_POST(self):
        url = urlparse(self.path)
        if not self._z_interfejsu():
            return self._json({"blad": "zła strona"}, 403)
        if url.path == "/api/szablon":
            return self._szablon("POST")
        if url.path != "/api/zapisz":
            return self._wyslij(404, b"", "text/plain")
        plik = parse_qs(url.query).get("plik", [""])[0]
        sciezka = self._bezpieczna(plik)
        if not sciezka or not sciezka.lower().endswith(".dmm"):
            return self._json({"blad": "można zapisywać tylko pliki .dmm w repo"}, 400)
        dlugosc = int(self.headers.get("Content-Length", "0"))
        tresc = self.rfile.read(dlugosc)
        tymczasowy = sciezka + ".zapis"
        with open(tymczasowy, "wb") as f:
            f.write(tresc)
        os.replace(tymczasowy, sciezka)
        print("Zapisano %s (%d B)" % (plik, len(tresc)), flush=True)
        return self._json({"ok": True})


def main():
    domyslne_repo = os.path.normpath(os.path.join(TUTAJ, "..", "NSV13-master"))
    a = argparse.ArgumentParser(description="Edytor map SS13")
    a.add_argument("--repo", default=domyslne_repo, help="folder repozytorium z plikiem .dme")
    a.add_argument("--port", type=int, default=8613)
    a.add_argument("--bez-przegladarki", action="store_true")
    arg = a.parse_args()
    Obsluga.repo = os.path.normcase(os.path.abspath(arg.repo))
    znajdz_dme(Obsluga.repo)
    typy_json(Obsluga.repo)
    serwer = ThreadingHTTPServer(("127.0.0.1", arg.port), Obsluga)
    # „localhost” w przeglądarce idzie najpierw na ::1 – bez tego każde połączenie czeka.
    try:
        class Serwer6(ThreadingHTTPServer):
            address_family = socket.AF_INET6
        serwer6 = Serwer6(("::1", arg.port), Obsluga)
        threading.Thread(target=serwer6.serve_forever, daemon=True).start()
    except OSError:
        pass
    adres = "http://127.0.0.1:%d/" % arg.port
    print("Edytor działa: %s  (repo: %s)" % (adres, Obsluga.repo), flush=True)
    if not arg.bez_przegladarki:
        webbrowser.open(adres)
    try:
        serwer.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
