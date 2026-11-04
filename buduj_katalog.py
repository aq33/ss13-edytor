"""Buduje gotowy katalog repozytorium dla wersji z linka (tryb „bez pobierania repo”).

Strona czyta wtedy typy z dane/katalog.json, a mapy i ikony prosto z GitHuba
(raw.githubusercontent.com) z tego samego commita, z którego zbudowano katalog.

Użycie:
  python buduj_katalog.py --repo ŚCIEŻKA --nazwa aq33/AquilaStation --galaz master --sha COMMIT --wyjscie web/dane
"""

import argparse
import json
import os
import time

import ekstraktor


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--repo", required=True)
    a.add_argument("--nazwa", required=True, help="właściciel/repo na GitHubie")
    a.add_argument("--galaz", default="master")
    a.add_argument("--sha", required=True)
    a.add_argument("--wyjscie", default=os.path.join("web", "dane"))
    arg = a.parse_args()

    t0 = time.time()
    dme = sorted(f for f in os.listdir(arg.repo) if f.lower().endswith(".dme"))[0]
    dane = ekstraktor.ekstrahuj(os.path.join(arg.repo, dme))

    mapy = []
    teksty = []
    for korzen, _, pliki in os.walk(os.path.join(arg.repo, "_maps")):
        for p in pliki:
            if not p.endswith(".dmm"):
                continue
            pelna = os.path.join(korzen, p)
            mapy.append({"plik": os.path.relpath(pelna, arg.repo).replace("\\", "/"), "rozmiar": os.path.getsize(pelna)})
            with open(pelna, encoding="utf-8", errors="replace") as f:
                teksty.append(f.read())
    mapy.sort(key=lambda m: m["plik"].lower())
    uzycie, montaz = ekstraktor.statystyki_map(teksty)

    info = {
        "repo": arg.nazwa,
        "galaz": arg.galaz,
        "sha": arg.sha,
        "data": time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime()),
        "dme": dme,
        "map": len(mapy),
    }
    os.makedirs(arg.wyjscie, exist_ok=True)
    with open(os.path.join(arg.wyjscie, "katalog.json"), "w", encoding="utf-8") as f:
        json.dump({**info, "typy": dane["typy"], "uzycie": uzycie, "montaz": montaz, "mapy": mapy}, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(arg.wyjscie, "info.json"), "w", encoding="utf-8") as f:
        json.dump(info, f, ensure_ascii=False)
    print("Katalog %s@%s: %d typów, %d map, %.1f s" % (arg.nazwa, arg.sha[:10], len(dane["typy"]), len(mapy), time.time() - t0))


if __name__ == "__main__":
    main()
