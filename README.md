# Edytor map SS13

Prosty edytor map `.dmm` w przeglądarce, z interfejsem budowania jak w RimWorldzie.
Czyta kod DM repozytorium, wyświetla mapę z prawdziwych ikon `.dmi` i zapisuje mapę w formacie TGM.
Plik wczytany i zapisany bez zmian jest identyczny z oryginałem.

## Z linka (bez instalowania)

**https://aq33.github.io/ss13-edytor/**

Najprościej: kliknij **Edytuj mapy aq33/AquilaStation**. Nie trzeba niczego pobierać.
Mapy i ikony czytane są prosto z GitHuba, z commita, z którego CI zbudowało katalog (odświeżanie co 3 godziny).
„Zapisz” pobiera wtedy plik `.dmm`, a edytor podsuwa link do wgrania go na GitHuba. GitHub sam proponuje fork i Pull Request.

Można też pracować na własnym klonie repo. Otwórz stronę w Chrome albo Edge i kliknij **Wybierz folder repozytorium**. Wskaż główny folder repo, ten z plikiem `.dme`.
Przeglądarka zapyta o zgodę na dostęp. Edytor czyta kod i ikony prosto z dysku i zapisuje zmiany do plików `.dmm`.
Nic nie jest wysyłane do internetu. Katalog typów i szablony trzyma przeglądarka (IndexedDB), osobno dla każdego repo.

W Firefoksie i Safari folder też da się wczytać, ale „Zapisz” pobiera wtedy plik `.dmm` do ręcznej podmiany w repo.

Strona to zawartość folderu `web/`. Workflow `.github/workflows/strona.yml` publikuje ją na GitHub Pages przy każdym pushu na `main`.

## Uruchomienie lokalne (serwer)

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
| Rzeczy na ścianę | plakaty, APC, alarmy, interkomy, włączniki, światła… same przyczepiają się do ściany najbliższej kursorowi (lista typów: `naScianie` w `kategorie.json`). Najpierw próbowany jest podtyp kierunkowy (`/directional/north`, `/north`, `/auto_name/north`), potem to, jak dany typ wisi w naszych mapach, a na końcu `dir` (światła) albo przesunięcie o 32 piksele |
| Kable i rury | przeciąganie linii samo łączy segmenty: zakręty, końcówki i doczepianie do istniejących instalacji obok |
| Pokój | `R`: ściany dookoła, podłoga w środku (ostatnio wybrana ściana i podłoga z Architekta) |
| Rozbiórka | przycisk albo `X`; usuwa obiekty, ściany zamienia na poszycie. Z `Shift` usuwa wszystko do kosmosu |
| Usuń podłogę | `F`: podłoga zamienia się w kosmos, obiekty i ściany zostają |
| Przenieś | `M`: zaznacz prostokąt, puść, kliknij w nowe miejsce; źródło staje się kosmosem, obszary jadą razem z fragmentem |
| Samouczek | przycisk na górze; 14 lekcji odhacza się samo, gdy zrobisz daną rzecz |
| Kopiuj / wklej | `C` zaznacza prostokąt, potem klik wkleja (kursor = lewy górny róg); `V` wraca do wklejania |
| Szablony | „Zapisz jako szablon” zapisuje schowek do `szablony/`; wklejasz je z kategorii **Szablony** w Architekcie |
| Zakładki | każda otwarta mapa to osobna zakładka (własna historia cofania, poziom i kamera); ✕ albo środkowy przycisk zamyka |
| Menu **Mapa ▾** | nowa mapa (`Ctrl+N`), zmiana rozmiaru z wyborem, gdzie zostaje stara zawartość, dodanie i usunięcie poziomu Z, eksport poziomu do PNG |
| Szukaj i zamień | `Ctrl+F`: typ (z podtypami albo dokładnie), zakres: poziom, wszystkie poziomy albo zaznaczony prostokąt. Znalezione można zamienić na inny typ, usunąć albo ustawić im zmienne naraz (edycja wielu obiektów) |
| Przesuwanie obiektu | w Inspekcji złap obiekt na mapie i przeciągnij na inny kafelek (ścienne przyczepiają się do nowej ściany). `Ctrl` + przeciąganie przesuwa w pikselach (`Shift` co 8 px). `Alt` + strzałki o kafelek, `Alt` + `Shift` + strzałki o piksel. Pod wybranym obiektem w Inspekcji są też przyciski i pola `pixel_x`/`pixel_y` |
| Zapis | `Ctrl+S` pokazuje potwierdzenie: plik, dokąd idzie zapis, liczbę zmienionych kafelków i wynik kontroli |
| Kopie robocze | niezapisane zmiany co kilka sekund trafiają do przeglądarki (IndexedDB). Po odświeżeniu strony edytor proponuje ich przywrócenie, a lista jest w „Otwórz” |
| Pomoc i język | `F1` otwiera listę wszystkich funkcji. Przycisk `EN`/`PL` przełącza język interfejsu |
| Inspekcja kafelka | bez narzędzia klik na kafelek: lista atomów z obracaniem, usuwaniem, pipetą (⧉) i edycją zmiennych (✎) |
| Przesuwanie widoku | `WASD`, strzałki, środkowy albo prawy przycisk z przeciągnięciem |
| Przybliżanie | kółko myszy |
| Poziom Z | `PageUp` / `PageDown` |
| Siatka | `G` |
| Cofnij / ponów / zapisz | `Ctrl+Z` / `Ctrl+Y` / `Ctrl+S` |

## Pliki

- `web/js/ekstraktor.js`: przybliżony parser DM w przeglądarce; wyciąga typy atomów i zmienne wyglądu (z makrami, #define, #if). Daje taki sam wynik jak `ekstraktor.py`.
- `web/js/zrodlo.js`: skąd brać pliki (folder w Chrome/Edge, folder tylko do odczytu, serwer.py).
- `ekstraktor.py`: ta sama logika w Pythonie, używana przez `serwer.py`.
- `serwer.py`: serwuje interfejs, pliki repo i zapisuje `.dmm` (tylko pliki `.dmm` wewnątrz repo).
- `web/kategorie.json`: kategorie menu i tryby stawiania. Można je edytować bez ruszania kodu.
- `web/js/`: `dmi.js` (ikony), `dmm.js` (odczyt i zapis map), `typy.js` (dziedziczenie zmiennych),
  `render.js` (rysowanie), `edycja.js` (operacje i historia), `main.js` (interfejs).

## Kontrola mapy (raport inżyniera)

Przycisk **Kontrola** na górnym pasku pokazuje na bieżąco liczbę problemów. Panel grupuje je z poradą, kliknięcie pozycji przenosi do kafelka, a na mapie pojawiają się znaczniki w kolorze wagi.

| Waga | Sprawdzenie |
|---|---|
| ⛔ błąd | typ nie istnieje w kodzie (mapa się nie skompiluje), kafelek bez turfa albo bez obszaru, drzwi, okno albo mebel w ścianie, obszar wymagający zasilania bez APC, kilka APC w obszarze |
| ⚠ ostrzeżenie | kilka turfów na kafelku, zdublowana konstrukcja albo instalacja, urwany kabel, APC bez kabla pod spodem, obiekt ścienny bez ściany po swojej stronie, kabel, rura albo okno w próżni bez kratownicy |
| ℹ uwaga | obszar bez alarmu powietrza, obszar bez światła |

To, czy obszar potrzebuje zasilania, edytor bierze z kodu (`requires_power`, `always_unpowered`). Sprawdzenia są w `web/js/kontrola.js` i są skalibrowane na mapach Aquili, żeby nie zgłaszały naszego celowego stylu (automaty w ścianach, poszycie kadłuba na zewnątrz).

## Wygładzanie

`web/js/wygladzanie.js` liczy połączenia tak jak gra:
- `legacy_smooth` (Bay, `nsv13/code/game/turfs/legacy_smooth.dm`): ściany, fałszywe ściany, okna fulltile, kraty;
- stary system tg (`code/__HELPERS/icon_smoothing.dm`): stoły, dywany itp., także wariant diagonalny.

## Ograniczenia

- Nakładki, które gra dokłada w kodzie (np. ekran APC, światełka śluz, wypełnienie okien), się nie rysują. Edytor pokazuje stan ikony z kodu, tak jak StrongDMM bez pluginów.
- Zmiany rozmiaru mapy i liczby poziomów nie da się cofnąć: czyszczą historię.

- Podgląd przed postawieniem nie wygładza się z sąsiadami. Robi to dopiero postawiony obiekt.
- Wklejanie nie obraca fragmentu. Obszary (`/area`) zostają te z celu.
- Autołączenie nie robi rozgałęzień (manifoldów). Stawia się je ręcznie z kategorii Rury i atmos.
- 9 z 733 map w repo nie wraca bajt w bajt. Zapis usuwa nieużywane klucze (tak samo robi mapmerge) i ujednolica ręczne odstępstwa od formatu TGM.
