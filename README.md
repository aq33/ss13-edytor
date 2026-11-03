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
| Rozbiórka | przycisk albo `X`; usuwa obiekty, ściany zamienia na poszycie |
| Inspekcja kafelka | bez narzędzia klik na kafelek: lista atomów z obracaniem i usuwaniem |
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

## Czego jeszcze nie ma

- Wygładzania ścian, okien i stołów: rysują się w stanie bazowym z kodu.
- Edycji zmiennych (poza kierunkiem), kopiowania obszarów i szablonów pokojów.
- Automatycznego łączenia kabli i rur przy przeciąganiu: stawia się wybrany stan ikony.
