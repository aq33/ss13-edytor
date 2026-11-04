# Edytor map SS13

Prosty edytor map `.dmm` w przeglądarce, z interfejsem budowania jak w RimWorldzie.
Czyta kod DM repozytorium, wyświetla mapę z prawdziwych ikon `.dmi` i zapisuje mapę w formacie TGM.
Plik wczytany i zapisany bez zmian jest identyczny z oryginałem.

## Uruchomienie

Wymagany jest tylko Python 3.10+, bez dodatkowych pakietów.

```
uruchom.bat
```

Albo z innym repozytorium:

```
python serwer.py --repo C:\Users\joker\Desktop\polonium-station
```

Serwer nasłuchuje tylko na `127.0.0.1:8613` i sam otwiera przeglądarkę (Chrome/Edge).
Przy pierwszym starcie i po zmianie plików `.dm` czyta kod (ok. 8 s). Wynik trzyma w `dane/`.

## Sterowanie

| Co | Jak |
|---|---|
| Menu budowania | przycisk **Architekt** albo `B` |
| Postaw | LPM, przeciąganie zależy od rodzaju: ściany = obrys, podłogi i obszary = wypełnienie, kable/rury/okna = linia, meble = malowanie |
| Anuluj narzędzie | PPM albo `Esc` |
| Obrót | `Q` / `E` |
| Kable i rury | przeciąganie linii samo łączy segmenty: zakręty, końcówki i doczepianie do istniejących instalacji obok |
| Pokój | `R`: ściany dookoła, podłoga w środku (ostatnio wybrana ściana i podłoga z Architekta) |
| Rozbiórka | przycisk albo `X`; usuwa obiekty, ściany zamienia na poszycie. Z `Shift` usuwa wszystko do kosmosu |
| Usuń podłogę | `F`: podłoga zamienia się w kosmos, obiekty i ściany zostają |
| Przenieś | `M`: zaznacz prostokąt, puść, kliknij w nowe miejsce; źródło staje się kosmosem, obszary jadą razem z fragmentem |
| Samouczek | przycisk na górze; 14 lekcji odhacza się samo, gdy zrobisz daną rzecz |
| Kopiuj / wklej | `C` zaznacza prostokąt, potem klik wkleja (kursor = lewy górny róg); `V` wraca do wklejania |
| Szablony | „Zapisz jako szablon” zapisuje schowek do `szablony/`; wklejasz je z kategorii **Szablony** w Architekcie |
| Inspekcja kafelka | bez narzędzia klik na kafelek: lista atomów z obracaniem, usuwaniem, pipetą (⧉) i edycją zmiennych (✎) |
| Przesuwanie widoku | `WASD`, strzałki, środkowy albo prawy przycisk z przeciągnięciem |
| Przybliżanie | kółko myszy |
| Poziom Z | `PageUp` / `PageDown` |
| Siatka | `G` |
| Cofnij / ponów / zapisz | `Ctrl+Z` / `Ctrl+Y` / `Ctrl+S` |

## Pliki

- `ekstraktor.py`: przybliżony parser DM; wyciąga typy atomów i zmienne wyglądu (z makrami, #define, #if).
- `serwer.py`: serwuje interfejs, pliki repo i zapisuje `.dmm` (tylko pliki `.dmm` wewnątrz repo).
- `web/kategorie.json`: kategorie menu i tryby stawiania. Można je edytować bez ruszania kodu.
- `web/js/`: `dmi.js` (ikony), `dmm.js` (odczyt i zapis map), `typy.js` (dziedziczenie zmiennych),
  `render.js` (rysowanie), `edycja.js` (operacje i historia), `main.js` (interfejs).

## Wygładzanie

`web/js/wygladzanie.js` liczy połączenia tak jak gra:
- `legacy_smooth` (Bay, `nsv13/code/game/turfs/legacy_smooth.dm`): ściany, fałszywe ściany, okna fulltile, kraty;
- stary system tg (`code/__HELPERS/icon_smoothing.dm`): stoły, dywany itp., także wariant diagonalny.

## Ograniczenia

- Podgląd przed postawieniem nie wygładza się z sąsiadami. Robi to dopiero postawiony obiekt.
- Wklejanie nie obraca fragmentu. Obszary (`/area`) zostają te z celu.
- Autołączenie nie robi rozgałęzień (manifoldów). Stawia się je ręcznie z kategorii Rury i atmos.
- 9 z 733 map w repo nie wraca bajt w bajt. Zapis usuwa nieużywane klucze (tak samo robi mapmerge) i ujednolica ręczne odstępstwa od formatu TGM.
