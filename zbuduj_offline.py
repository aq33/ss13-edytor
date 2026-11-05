"""Buduje wersję do pobrania: jeden plik HTML, który działa po otwarciu z dysku.

Moduły JS trafiają do mapy importów jako adresy data: (z dysku przeglądarka nie wczyta
osobnych plików .js), styl i kategorie są w środku pliku. Mapy Aquili (tryb GitHub)
plik bierze ze strony edytora, praca na własnym folderze repo działa offline.

Użycie: python zbuduj_offline.py [plik wyjściowy] [adres strony]
"""

import base64
import json
import os
import re
import sys
import time

TUTAJ = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(TUTAJ, "web")


def main():
    wyjscie = sys.argv[1] if len(sys.argv) > 1 else os.path.join(TUTAJ, "dist", "edytor-map-ss13.html")
    baza = sys.argv[2] if len(sys.argv) > 2 else "https://aq33.github.io/ss13-edytor/"

    with open(os.path.join(WEB, "index.html"), encoding="utf-8") as f:
        html = f.read()
    with open(os.path.join(WEB, "styl.css"), encoding="utf-8") as f:
        styl = f.read()
    with open(os.path.join(WEB, "kategorie.json"), encoding="utf-8") as f:
        kategorie = json.load(f)

    # moduły: import "./x.js" -> "ss13/x.js", który mapa importów wskazuje na data:
    importy = {}
    for nazwa in sorted(os.listdir(os.path.join(WEB, "js"))):
        if not nazwa.endswith(".js"):
            continue
        with open(os.path.join(WEB, "js", nazwa), encoding="utf-8") as f:
            kod = f.read()
        kod = re.sub(r'(from\s+|import\s*\(\s*|import\s+)"\./([\w\-]+\.js)"', r'\1"ss13/\2"', kod)
        importy["ss13/" + nazwa] = "data:text/javascript;base64," + base64.b64encode(kod.encode("utf-8")).decode("ascii")

    konfiguracja = {"kategorie": kategorie, "baza": baza, "zbudowano": time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime())}
    html = html.replace('<link rel="stylesheet" href="styl.css">', "<style>\n" + styl + "\n</style>")
    skrypty = (
        '<script type="importmap">' + json.dumps({"imports": importy}) + "</script>\n"
        + "<script>window.SS13_OFFLINE = " + json.dumps(konfiguracja, ensure_ascii=False) + ";</script>\n"
        + '<script type="module">import "ss13/main.js";</script>'
    )
    stary = '<script type="module" src="js/main.js"></script>'
    if stary not in html:
        sys.exit("Nie znalazłem skryptu startowego w index.html")
    html = html.replace(stary, skrypty)
    # w wersji do pobrania link „pobierz” nie ma sensu
    html = re.sub(r'<a id="start-pobierz"[^>]*>.*?</a>', "", html, flags=re.S)

    os.makedirs(os.path.dirname(os.path.abspath(wyjscie)), exist_ok=True)
    with open(wyjscie, "w", encoding="utf-8", newline="\n") as f:
        f.write(html)
    print("Zapisano %s (%d KB)" % (wyjscie, os.path.getsize(wyjscie) // 1024))


if __name__ == "__main__":
    main()
