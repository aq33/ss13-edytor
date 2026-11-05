// Wersja językowa (polski / angielski).
// Interfejs piszemy po polsku; w trybie EN obserwator DOM podmienia każdy napis, podpowiedź
// (title) i placeholder znaleziony w słowniku albo pasujący do wzorca. Akapity z formatowaniem
// mają gotową wersję w atrybucie data-en. confirm() i prompt() też są tłumaczone.

let biezacy = "pl";
export const jezyk = () => biezacy;

const EN = {
  // pasek i panele
  "Edytor map": "Map editor", "Edytor map SS13": "SS13 map editor", "Otwórz": "Open", "Zapisz": "Save", "Mapa ▾": "Map ▾",
  "Samouczek": "Tutorial", "Kontrola": "Checks", "✓ Kontrola": "✓ Checks", "Pomoc": "Help", "nie wczytano mapy": "no map loaded",
  "Otwórz mapę": "Open map", "Filtruj…": "Filter…", "Zmień repo": "Change repo", "Wybierz inny folder repozytorium": "Choose another repository folder",
  "Zapisz (Ctrl+S)": "Save (Ctrl+S)", "Cofnij (Ctrl+Z)": "Undo (Ctrl+Z)", "Ponów (Ctrl+Y)": "Redo (Ctrl+Y)", "Operacje na całej mapie": "Whole-map operations",
  "Pokaż albo schowaj samouczek": "Show or hide the tutorial", "Kontrola mapy": "Map checks", "Lista funkcji i skrótów (F1)": "Features and shortcuts (F1)",
  "Język / Language": "Język / Language", "Niezapisane zmiany są na bieżąco zachowywane w przeglądarce": "Unsaved changes are kept in your browser as you work",
  "kopia robocza zapisana": "draft saved", "kopia robocza": "draft",
  "Widok": "View", "Podłoże": "Floors", "Obiekty": "Objects", "Dekale": "Decals", "Rury": "Pipes", "Kable": "Cables", "Pomocnicze": "Helpers", "Obszary": "Areas", "Siatka": "Grid",
  "Szukaj…": "Search…", "wszystkie": "all", "wszystko": "everything",
  "Architekt": "Architect", "Pokój": "Room", "Rozbiórka": "Deconstruct", "Usuń podłogę": "Remove floor", "Przenieś": "Move", "Inspekcja": "Inspect",
  "Kopiuj": "Copy", "Wklej": "Paste", "Zapisz jako szablon": "Save as template",
  "Pokój (R): ściany dookoła, podłoga w środku": "Room (R): walls around, floor inside", "Rozbiórka (X), z Shiftem usuwa wszystko do kosmosu": "Deconstruct (X); with Shift removes everything down to space",
  "Usuń podłogę (F): podłoga zamienia się w kosmos": "Remove floor (F): the floor turns into space", "Przenieś (M): zaznacz, potem kliknij w nowe miejsce": "Move (M): select, then click the new spot",
  "Inspekcja (Esc)": "Inspect (Esc)", "Kopiuj prostokąt (C)": "Copy a rectangle (C)", "Wklej schowek (V)": "Paste clipboard (V)", "Zapisz schowek jako szablon": "Save the clipboard as a template",
  "LPM stawia · PPM anuluje · Q/E obrót · WASD przesuwa · kółko przybliża": "LMB places · RMB cancels · Q/E rotate · WASD pans · wheel zooms",
  "Wczytywanie…": "Loading…", "Zamknij": "Close", "Anuluj": "Cancel", "OK": "OK",
  // kategorie
  "Ściany": "Walls", "Podłogi": "Floors", "Drzwi i okna": "Doors & windows", "Zasilanie": "Power", "Rury i atmos": "Pipes & atmos", "Oświetlenie": "Lighting",
  "Na ścianę": "Wall-mounted", "Meble": "Furniture", "Maszyny": "Machines", "Dekoracje": "Decorations", "Inne struktury": "Other structures", "Przedmioty": "Items",
  "Istoty": "Creatures", "Szablony": "Templates",
  // menu Mapa
  "Nowa mapa…": "New map…", "Zmień rozmiar…": "Resize…", "Dodaj poziom nad bieżącym": "Add level above current", "Usuń bieżący poziom": "Delete current level",
  "Szukaj i zamień…": "Find & replace…", "Eksport do PNG…": "Export to PNG…",
  // szukaj i zamień
  "Szukaj i zamień": "Find & replace", "Typ": "Type", "z podtypami": "with subtypes", "bieżący poziom": "current level", "wszystkie poziomy": "all levels", "zaznaczenie": "selection",
  "Szukaj": "Search", "Typ z kafelka": "Type from tile", "Zaznacz obszar": "Select area", "Weź typ z kafelka zaznaczonego w inspekcji": "Take the type from the tile selected in Inspect",
  "Przeciągnij prostokąt na mapie": "Drag a rectangle on the map", "Wszystkie znalezione:": "All found:", "Zamień na": "Replace with", "zachowaj zmienne": "keep variables",
  "Zamień": "Replace", "Edytuj zmienne…": "Edit variables…", "Usuń": "Delete", "Brak wyników": "No results",
  // start
  "Wybierz folder repozytorium": "Choose repository folder", "Wczytaj folder repozytorium": "Load repository folder", "Edytuj mapy": "Edit maps",
  "bez pobierania repo: mapy i ikony prosto z GitHuba": "no download needed: maps and icons straight from GitHub",
  "albo pracuj na własnym klonie repo (zapis prosto do plików):": "or work on your own clone of the repo (saves straight to files):",
  // inspekcja i zmienne
  "Kafelek": "Tile", "Obróć w lewo": "Rotate left", "Obróć w prawo": "Rotate right", "Buduj tym (pipeta)": "Build with this (eyedropper)", "Edytuj zmienne": "Edit variables",
  "Zamień na poszycie": "Replace with plating", "zmienna": "variable", "wartość": "value", "kierunek…": "direction…", "stan ikony…": "icon state…", "+ zmienna": "+ variable",
  "Zastosuj": "Apply", "(pusty)": "(empty)", "południe": "south", "północ": "north", "wschód": "east", "zachód": "west",
  "pd-wsch": "south-east", "pd-zach": "south-west", "pn-wsch": "north-east", "pn-zach": "north-west",
  "Kliknij obiekt, żeby go wybrać. Przeciągnij na mapie albo Alt+strzałki – o kafelek, Alt+Shift+strzałki albo Ctrl+przeciąganie – o piksele.":
    "Click an object to select it. Drag it on the map or use Alt+arrows to move by a tile; Alt+Shift+arrows or Ctrl+drag to move by pixels.",
  "Piksele": "Pixels", "W lewo o kafelek": "One tile left", "W górę o kafelek": "One tile up", "W dół o kafelek": "One tile down", "W prawo o kafelek": "One tile right",
  "W lewo o piksel (Shift: 8)": "One pixel left (Shift: 8)", "W górę o piksel (Shift: 8)": "One pixel up (Shift: 8)", "W dół o piksel (Shift: 8)": "One pixel down (Shift: 8)",
  "W prawo o piksel (Shift: 8)": "One pixel right (Shift: 8)", "Wyzeruj przesunięcie": "Reset offset",
  "Przesuwam": "Moving", "puść, żeby postawić · PPM anuluje": "release to drop · RMB cancels", "Shift: co 8 px": "Shift: 8 px steps",
  // podpowiedzi narzędzi
  "przeciągnij: obrys": "drag: outline", "przeciągnij: wypełnij": "drag: fill", "przeciągnij: linia": "drag: line", "klik lub malowanie": "click or paint",
  "Kopiuj – zaznacz prostokąt": "Copy – select a rectangle", "Przenieś – kliknij w nowe miejsce (PPM anuluje)": "Move – click the new spot (RMB cancels)",
  "Przenieś – zaznacz prostokąt do przeniesienia": "Move – select the rectangle to move", "Zaznacz obszar dla szukania i zamiany – przeciągnij": "Select an area for find & replace – drag",
  "Usuń podłogę – przeciągnij; podłoga zamienia się w kosmos, obiekty zostają": "Remove floor – drag; floors turn into space, objects stay",
  "Rozbiórka + Shift – usuwa wszystko, zostaje sam kosmos": "Deconstruct + Shift – removes everything, only space is left",
  "Rozbiórka – usuwa obiekty, ściany zostają poszyciem · z Shiftem: wszystko do kosmosu": "Deconstruct – removes objects, walls become plating · with Shift: everything to space",
  // komunikaty
  "Nic do skopiowania": "Nothing to copy", "Nic do przeniesienia": "Nothing to move", "Najpierw otwórz mapę": "Open a map first", "Tu nie da się postawić tego obiektu": "This object can't be placed here",
  "Na tym kafelku stoi już taki sam obiekt": "The same object already stands on this tile", "Zapisuję…": "Saving…", "Zapisano": "Saved", "Przywróć": "Restore",
  "Zapisać mapę?": "Save the map?", "Zapis": "Saving", "Zmienione kafelki": "Changed tiles", "Kontrola mapy zgłasza błędy": "Map checks report errors",
  "Mapa może się nie skompilować albo coś nie zadziała – sprawdź panel Kontrola.": "The map may not compile or something won't work – see the Checks panel.",
  "Ostrzeżenia kontroli": "Check warnings", "Zmieniono rozmiar albo liczbę poziomów mapy.": "The map size or number of levels was changed.",
  "prosto do pliku w Twoim folderze repo": "straight to the file in your repo folder", "prosto do pliku w repo (serwer lokalny)": "straight to the file in the repo (local server)",
  "pobierze plik .dmm do wgrania na GitHuba": "downloads the .dmm file to upload to GitHub", "pobierze plik .dmm do podmiany w repo": "downloads the .dmm file to replace in the repo",
  "Kopia robocza": "Draft", "Ta mapa ma niezapisane zmiany z": "This map has unsaved changes from", "Przywrócić je? „Anuluj” otworzy plik i usunie kopię.": "Restore them? “Cancel” opens the file and deletes the draft.",
  "Wczytuję": "Loading", "nie ma pliku": "file not found", "Mapa pobrana": "Map downloaded", "Wgraj na GitHuba": "Upload to GitHub",
  "Sprawdzam, czy kod się zmienił…": "Checking whether the code changed…", "Liczę, czego używają mapy…": "Counting what the maps use…",
  "Przeglądarka nie dała zgody na zapis": "The browser did not allow saving",
  "W wybranym folderze nie ma pliku .dme – wybierz główny folder repozytorium.": "There is no .dme file in the chosen folder – choose the main repository folder.",
  "Otwórz albo utwórz mapę": "Open or create a map", "Masz niezapisane zmiany. Zmienić repozytorium?": "You have unsaved changes. Change the repository?",
  "Nazwa szablonu:": "Template name:", "Usuń szablon": "Delete template",
  "Brak szablonów. Skopiuj fragment mapy (C), a potem kliknij „Zapisz jako szablon” na dole.": "No templates. Copy part of a map (C), then click “Save as template” at the bottom.",
  "✓ Nie znalazłem problemów na tej mapie.": "✓ No problems found on this map.", "znaczniki": "markers",
  // dialogi operacji
  "Nowa mapa": "New map", "Plik": "File", "Szerokość": "Width", "Wysokość": "Height", "Poziomy (Z)": "Levels (Z)", "Wypełnienie": "Fill", "Obszar": "Area", "Utwórz": "Create",
  "Mapa powstanie w edytorze. Na dysk trafi dopiero po zapisaniu.": "The map is created in the editor. It reaches the disk only when you save.",
  "Rozmiar mapy": "Map size", "Stara zawartość": "Old content", "Zmień rozmiar": "Resize", "lewy górny róg": "top left", "góra, środek": "top centre", "prawy górny róg": "top right",
  "lewo, środek": "left centre", "środek": "centre", "prawo, środek": "right centre", "lewy dolny róg": "bottom left", "dół, środek": "bottom centre", "prawy dolny róg": "bottom right",
  "Eksport do PNG": "Export to PNG", "Kafelek w pikselach": "Tile size in pixels", "Eksportuj": "Export", "Rysuję obraz mapy…": "Drawing the map image…",
  "Zmienne wszystkich znalezionych": "Variables of all found objects", "Zastosuj do wszystkich": "Apply to all",
  "Zmienna 1": "Variable 1", "Wartość 1": "Value 1", "Zmienna 2": "Variable 2", "Wartość 2": "Value 2", "Zmienna 3": "Variable 3", "Wartość 3": "Value 3",
  "Ścieżka musi kończyć się na .dmm": "The path must end with .dmm", "Mapa ma tylko jeden poziom": "The map has only one level",
  "Usunąć wszystkie znalezione obiekty? (Turfy i obszary zostaną, je trzeba zamienić.)": "Delete all found objects? (Turfs and areas stay – replace them instead.)",
  "Zamieniono": "Replaced", "Usunięto": "Deleted", "Zmieniono zmienne": "Variables changed", "Najpierw zaznacz kafelek w inspekcji": "Select a tile in Inspect first",
  // kontrola
  "Typ nie istnieje w kodzie": "Type does not exist in the code", "Kafelek bez podłoża": "Tile without a turf", "Kafelek bez obszaru": "Tile without an area",
  "Drzwi, okno albo mebel w ścianie": "Door, window or furniture inside a wall", "Obszar bez APC": "Area without an APC", "Kilka APC w jednym obszarze": "Several APCs in one area",
  "Kilka turfów na kafelku": "Several turfs on a tile", "Zdublowany obiekt": "Duplicated object", "Urwany kabel": "Broken cable", "APC bez kabla": "APC without a cable",
  "Obiekt ścienny bez ściany": "Wall-mounted object without a wall", "Instalacja w próżni bez kratownicy": "Installation in vacuum without lattice",
  "Obszar bez alarmu powietrza": "Area without an air alarm", "Obszar bez światła": "Area without a light",
  "Mapa się nie skompiluje. Ten typ został usunięty albo przemianowany – zamień go (Szukaj i zamień).": "The map won't compile. This type was removed or renamed – replace it (Find & replace).",
  "Każdy kafelek musi mieć turf. Postaw podłogę albo kosmos.": "Every tile needs a turf. Place a floor or space.",
  "Każdy kafelek musi należeć do obszaru (/area). Pomaluj go w kategorii Obszary.": "Every tile must belong to an area (/area). Paint it in the Areas category.",
  "Ten obiekt stoi na kafelku ściany – drzwi się nie otworzą, okno nic nie da, a do mebla nikt nie dojdzie.": "This object stands on a wall tile – a door won't open, a window does nothing and nobody can reach furniture.",
  "Obszar wymaga zasilania, a nie ma w nim APC – będzie tam ciemno i nic nie zadziała.": "The area needs power but has no APC – it will be dark and nothing will work.",
  "Obszar może mieć tylko jedno APC. Nadmiarowe gra usunie albo wyłączy.": "An area can have only one APC. The game removes or disables extra ones.",
  "Na kafelku leży więcej niż jeden turf – zostanie tylko jeden.": "More than one turf on the tile – only one will remain.",
  "Ten sam obiekt z tymi samymi zmiennymi stoi na kafelku kilka razy.": "The same object with the same variables stands on the tile several times.",
  "Kabel prowadzi na sąsiedni kafelek, ale tam nie ma kabla, który by go odebrał. Prąd tędy nie popłynie.": "The cable leads to a neighbouring tile with no cable to receive it. Power won't flow here.",
  "Pod APC powinna być końcówka kabla (stan 0-x), inaczej APC nie dostanie prądu z sieci.": "There should be a cable end under the APC (state 0-x), otherwise it gets no power from the grid.",
  "Obiekt wisi po stronie, po której nie ma ściany – wisi w powietrzu.": "The object hangs on a side with no wall – it hangs in mid-air.",
  "Kabel, rura albo okno stoi na kosmosie bez kratownicy (lattice) ani pomostu – w grze nie da się tego tak zbudować i łatwo to zniszczyć.": "A cable, pipe or window stands on space without lattice or catwalk – it can't be built like that in game and breaks easily.",
  "W obszarze nie ma alarmu powietrza – nikt nie zobaczy, że ucieka powietrze.": "The area has no air alarm – nobody will notice air leaking.",
  "W obszarze nie ma żadnego światła.": "The area has no light at all.",
  // pomoc
  "Lista funkcji": "Features", "Poruszanie się": "Navigation", "Budowanie": "Building", "Przesuwanie i kopiowanie": "Moving & copying", "Inspekcja i zmienne": "Inspect & variables",
  "Cała mapa": "Whole map", "/ strzałki": "/ arrows", "Przesuwanie widoku": "Pan the view", "PPM albo kółko + przeciąganie": "RMB or wheel + drag",
  "Kółko myszy": "Mouse wheel", "Przybliżanie i oddalanie": "Zoom in and out", "Następny / poprzedni poziom Z": "Next / previous Z level", "Siatka kafelków": "Tile grid",
  "Panel „Widok”": "“View” panel", "Pokazywanie i ukrywanie warstw: podłoże, obiekty, dekale, rury, kable, pomocnicze, obszary": "Show and hide layers: floors, objects, decals, pipes, cables, helpers, areas",
  "Menu budowania z kategoriami i ikonkami, wyszukiwarka, podgrupy": "Build menu with categories and icons, search, subgroups", "LPM / przeciąganie": "LMB / drag",
  "Stawianie: ściany jako obrys, podłogi i obszary jako wypełnienie, kable, rury i okna jako linia, meble pojedynczo": "Placing: walls as an outline, floors and areas as a fill, cables, pipes and windows as a line, furniture one by one",
  "Obrót stawianego obiektu": "Rotate the object being placed", "PPM /": "RMB /", "Odłożenie narzędzia": "Put the tool down", "Rzeczy na ścianę": "Wall-mounted things",
  "Plakaty, APC, alarmy, światła same przyczepiają się do najbliższej ściany": "Posters, APCs, alarms and lights snap to the nearest wall", "Kable i rury": "Cables & pipes",
  "Łączą się same przy przeciąganiu": "Connect by themselves as you drag", "Ściany dookoła i podłoga w środku jednym ruchem": "Walls around and floor inside in one go",
  "Usuwa obiekty, ściany zamienia w poszycie; z": "Removes objects and turns walls into plating; with", "usuwa wszystko do kosmosu": "removes everything to space",
  "Podłoga staje się kosmosem, obiekty zostają": "The floor becomes space, objects stay", "Przeciągnij obiekt (Inspekcja)": "Drag an object (Inspect)",
  "Przenosi jeden obiekt na inny kafelek; obiekty ścienne przyczepiają się do nowej ściany": "Moves one object to another tile; wall-mounted objects snap to the new wall",
  "+ przeciągnij obiekt": "+ drag an object", "Przesunięcie w pikselach (z": "Pixel offset (with", "co 8 px)": "8 px steps)", "+ strzałki": "+ arrows",
  "Wybrany obiekt o kafelek": "Selected object by one tile", "Wybrany obiekt o piksel": "Selected object by one pixel",
  "Zaznacz prostokąt i kliknij w nowe miejsce; źródło staje się kosmosem": "Select a rectangle and click the new spot; the source becomes space", "Kopiuj,": "Copy,",
  "Kopiowanie fragmentu mapy; „Zapisz jako szablon” zachowuje go w kategorii Szablony": "Copy part of the map; “Save as template” keeps it in the Templates category",
  "Klik na kafelek": "Click a tile", "Lista wszystkiego, co na nim stoi (✕ w rogu zamyka)": "List of everything on it (✕ in the corner closes it)", "Obrót obiektu": "Rotate the object",
  "Pipeta: buduj tym samym typem": "Eyedropper: build with the same type", "Edycja zmiennych: kierunek, stan ikony, dowolne zmienne": "Edit variables: direction, icon state, any variable",
  "Usunięcie obiektu (turf zmienia się w poszycie)": "Delete the object (a turf becomes plating)", "Zakładki": "Tabs", "Kilka map naraz, każda z własną historią cofania": "Several maps at once, each with its own undo history",
  "Cofnij / ponów": "Undo / redo", "Zapis z potwierdzeniem i podsumowaniem zmian": "Save with a confirmation and a summary of changes", "Kopie robocze": "Drafts",
  "Niezapisane zmiany na bieżąco trafiają do przeglądarki; po odświeżeniu strony edytor zaproponuje przywrócenie (lista w „Otwórz”)": "Unsaved changes are kept in the browser as you work; after reloading, the editor offers to restore them (listed under “Open”)",
  "Szukaj i zamień: zamiana typów, usuwanie i edycja zmiennych wielu obiektów naraz": "Find & replace: swap types, delete and edit variables of many objects at once",
  "i menu „Mapa”": "and the “Map” menu", "Nowa mapa, zmiana rozmiaru, dodawanie i usuwanie poziomów, eksport do PNG": "New map, resize, add and delete levels, export to PNG",
  "Raport inżyniera: błędy, ostrzeżenia i uwagi na bieżąco, z przeskokiem do kafelka": "Engineer's report: errors, warnings and notes as you work, with a jump to the tile",
  "Lekcje, które odhaczają się same": "Lessons that tick themselves off",
  "⬇ Pobierz edytor jako plik (działa bez internetu)": "⬇ Download the editor as a file (works offline)",
  "Jeden plik HTML – otwórz go z dysku w Chrome albo Edge, bez instalowania": "A single HTML file – open it from disk in Chrome or Edge, nothing to install",
  // samouczek (panel)
  "Pomiń": "Skip", "Dalej": "Next", "Gotowe!": "Done!", "Zacznij od nowa": "Start over",
  "Znasz już wszystkie narzędzia. Samouczek możesz otworzyć ponownie przyciskiem na górze.": "You know all the tools now. You can reopen the tutorial with the button at the top.",
  "Schowaj (wróci z przycisku Samouczek na górze)": "Hide (comes back from the Tutorial button at the top)",
};

// Napisy z liczbami i nazwami.
const WZORCE = [
  [/^Poziom (\d+)$/, "Level $1"],
  [/^Znaleziono (\d+) obiektów na (\d+) kafelkach$/, "Found $1 objects on $2 tiles"],
  [/^Otwórz ponownie: (.+)$/, "Reopen: $1"],
  [/^(.+): (.+) — (\d+)×(\d+), poziomów: (\d+)$/, "$1: $2 — $3×$4, levels: $5"],
  [/^…i (\d+) więcej$/, "…and $1 more"],
  [/^…i jeszcze (\d+)\. Zawęź wyszukiwanie\.$/, "…and $1 more. Narrow the search."],
  [/^Skopiowano (\d+)×(\d+)\. Kliknij, żeby wkleić \(PPM kończy\)\.$/, "Copied $1×$2. Click to paste (RMB stops)."],
  [/^Mapa (.+) ma niezapisane zmiany\. Zamknąć bez zapisu\?$/, "Map $1 has unsaved changes. Close without saving?"],
  [/^Nie udało się wczytać mapy: (.*)$/, "Could not load the map: $1"],
  [/^Zapis nie powiódł się: (.*)$/, "Saving failed: $1"],
  [/^Nie udało się otworzyć folderu: (.*)$/, "Could not open the folder: $1"],
  [/^Błąd startu: (.*)$/, "Startup error: $1"],
  [/^Usunąć szablon „(.+)”\?$/, "Delete template “$1”?"],
  [/^Zapisano szablon „(.+)”$/, "Template “$1” saved"],
  [/^Nie zapisano szablonu: (.*)$/, "Template not saved: $1"],
  [/^Pobrano (.+) – podmień nim plik (.+) w repo \(ta przeglądarka nie zapisuje prosto na dysk\)\.$/, "Downloaded $1 – replace $2 in the repo with it (this browser can't save to disk directly)."],
  [/^(Zamieniono|Usunięto|Zmieniono zmienne): (\d+) kafelków$/, (m, a, n) => `${t(a)}: ${n} tiles`],
  [/^Nowy rozmiar: (.+)$/, "New size: $1"], [/^Dodano poziom (\d+)$/, "Added level $1"], [/^Usunięto poziom (\d+)$/, "Deleted level $1"],
  [/^Dodać nowy poziom \(Z (\d+)\) nad bieżącym\? Historia cofania zostanie wyczyszczona\.$/, "Add a new level (Z $1) above the current one? The undo history will be cleared."],
  [/^Usunąć poziom (\d+) razem z całą zawartością\? Tej operacji nie da się cofnąć\.$/, "Delete level $1 with all its content? This can't be undone."],
  [/^Plik (.+) już istnieje\. Zapis go nadpisze\. Kontynuować\?$/, "File $1 already exists. Saving will overwrite it. Continue?"],
  [/^Zamieniasz (\w+) na (\w+)\. To zwykle błąd\. Kontynuować\?$/, "You are replacing $1 with $2. That is usually a mistake. Continue?"],
  [/^Nieznany (turf|obszar|typ): (.+)$/, (m, a, b) => `Unknown ${{ turf: "turf", obszar: "area", typ: "type" }[a]}: ${b}`],
  [/^Teraz: (\d+)×(\d+)\. Nowe pola wypełni kosmos\. Tej operacji nie da się cofnąć \(historia zostanie wyczyszczona\)\.$/, "Now: $1×$2. New tiles are filled with space. This can't be undone (the history is cleared)."],
  [/^Zapisze obraz poziomu (\d+) z warstwami ustawionymi w panelu „Widok”\.$/, "Saves an image of level $1 with the layers set in the “View” panel."],
  [/^(\d+) px \((\d+)×(\d+)\)$/, "$1 px ($2×$3)"],
  [/^Ikony: (\d+)\/(\d+)$/, "Icons: $1/$2"], [/^Czytam kod: (\d+)\/(\d+) plików$/, "Reading code: $1/$2 files"], [/^Czytam kod z (.+)…$/, "Reading code from $1…"],
  [/^Wczytuję (.+)…$/, "Loading $1…"], [/^✓ Zapisano (.+)$/, "✓ Saved $1"], [/^Zapisano (.+)$/, "Saved $1"],
  [/^Kafelek \((\d+), (\d+), (\d+)\)$/, "Tile ($1, $2, $3)"],
  [/^(\S+ )?(\d+) (błąd|błędy|błędów)$/, (m, i, n) => `${i || ""}${n} ${n === "1" ? "error" : "errors"}`],
  [/^(\S+ )?(\d+) (ostrzeżenie|ostrzeżenia|ostrzeżeń)$/, (m, i, n) => `${i || ""}${n} ${n === "1" ? "warning" : "warnings"}`],
  [/^(\S+ )?(\d+) (uwaga|uwagi|uwag)$/, (m, i, n) => `${i || ""}${n} ${n === "1" ? "note" : "notes"}`],
  [/^Kontrola mapy: (.*)$/, (m, r) => "Map checks: " + r.split(", ").map((x) => t(x)).join(", ")],
  [/^(\d+)\. (.+)$/, (m, n, s) => `${n}. ${t(s)}`],
  [/^Na mapach: (\d+)×$/, "On maps: $1×"],
  [/^Pokój – (.+) \+ (.+) \(ostatnio wybrane w Architekcie\)$/, "Room – $1 + $2 (last picked in Architect)"],
  [/^Wklej (\d+)×(\d+)(.*) – kursor to lewy górny róg$/, "Paste $1×$2$3 – the cursor is the top-left corner"],
  [/^(.*) · kierunek: (.+) · (.+)$/, (m, a, k, b) => `${a} · direction: ${t(k)} · ${t(b)}`],
  [/^(.*) · przyciąga się do ściany · (.+)$/, (m, a, b) => `${a} · snaps to the wall · ${t(b)}`],
  [/^(.*) · brak ściany obok · (.+)$/, (m, a, b) => `${a} · no wall nearby · ${t(b)}`],
  [/^(.*) · (\d+) pól$/, (m, a, n) => `${t(a)} · ${n} tiles`],
  [/^(.+) \(kopia robocza\)$/, "$1 (draft)"], [/^kopia robocza zapisana (.+)$/, "draft saved $1"],
  [/^domyślnie: (.*)$/, "default: $1"],
  [/^Przesuwam: (.+) · puść, żeby postawić · PPM anuluje$/, "Moving: $1 · release to drop · RMB cancels"],
];

export function t(s) {
  if (biezacy !== "en" || typeof s !== "string") return s;
  if (s in EN) return EN[s];
  for (const [re, zamiana] of WZORCE) if (re.test(s)) return s.replace(re, zamiana);
  return s;
}

// Tłumaczy węzeł tekstowy, zachowując białe znaki wokół.
function tlumaczTekst(w) {
  const tekst = w.nodeValue;
  const s = tekst.trim();
  if (!s) return;
  const p = t(s);
  if (p !== s) w.nodeValue = tekst.replace(s, p);
}
function tlumaczElement(el) {
  if (el.nodeType !== 1) return;
  if (el.dataset?.en !== undefined && !el.dataset.przetlumaczone) { el.dataset.przetlumaczone = "1"; el.innerHTML = el.dataset.en; }
  for (const a of ["title", "placeholder"]) {
    const v = el.getAttribute(a);
    if (v) { const p = t(v); if (p !== v) el.setAttribute(a, p); }
  }
}
function tlumaczDrzewo(korzen) {
  if (korzen.nodeType === 3) return tlumaczTekst(korzen);
  if (korzen.nodeType !== 1) return;
  tlumaczElement(korzen);
  const it = document.createTreeWalker(korzen, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let w;
  while ((w = it.nextNode())) {
    if (w.nodeType === 3) { if (w.parentNode?.nodeName !== "SCRIPT" && w.parentNode?.nodeName !== "STYLE") tlumaczTekst(w); }
    else tlumaczElement(w);
  }
}

export function initJezyk() {
  try { biezacy = localStorage.getItem("jezyk") || (navigator.language?.toLowerCase().startsWith("pl") ? "pl" : "en"); } catch { biezacy = "pl"; }
  document.documentElement.lang = biezacy;
  const b = document.querySelector("#b-jezyk");
  if (b) b.textContent = biezacy === "en" ? "PL" : "EN";
  if (biezacy !== "en") return;
  document.title = t(document.title);
  tlumaczDrzewo(document.body);
  new MutationObserver((zmiany) => {
    for (const z of zmiany) {
      if (z.type === "characterData") tlumaczTekst(z.target);
      else if (z.type === "attributes") tlumaczElement(z.target);
      else for (const n of z.addedNodes) tlumaczDrzewo(n);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["title", "placeholder"] });
  const potwierdz = window.confirm.bind(window), pytaj = window.prompt.bind(window), uwaga = window.alert.bind(window);
  window.confirm = (m) => potwierdz(t(m));
  window.prompt = (m, d) => pytaj(t(m), d);
  window.alert = (m) => uwaga(t(m));
}

export function przelaczJezyk() {
  try { localStorage.setItem("jezyk", biezacy === "en" ? "pl" : "en"); } catch {}
  location.reload();
}
