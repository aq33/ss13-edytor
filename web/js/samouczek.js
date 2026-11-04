// Samouczek: lekcje odhaczają się same, gdy zrobisz daną rzecz w edytorze.
// main.js zgłasza czynności przez zdarzenie(nazwa, dane).

const LEKCJE = [
  { id: "kamera", tytul: "Rozglądanie się",
    tekst: "Przesuwaj widok klawiszami <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> albo przeciągając <b>prawym</b> lub środkowym przyciskiem myszy. Kółkiem przybliżasz i oddalasz.",
    gotowe: (z) => z.nazwa === "kamera" },
  { id: "architekt", tytul: "Menu Architekt",
    tekst: "Kliknij <b>Architekt</b> na dole (albo <kbd>B</kbd>) i wybierz kategorię po lewej, np. <b>Podłogi</b>. Najczęściej używane rzeczy są na początku, wyszukiwarka jest u góry.",
    gotowe: (z) => z.nazwa === "kategoria" },
  { id: "podloga", tytul: "Kładzenie podłogi",
    tekst: "Kliknij ikonkę podłogi, a potem <b>przeciągnij lewym przyciskiem</b> po mapie. Podłoga wypełni cały prostokąt. Zielony podgląd = da się postawić, czerwony = nie.",
    gotowe: (z) => z.nazwa === "buduj" && z.typ?.startsWith("/turf/open") && z.ile >= 2 },
  { id: "sciany", tytul: "Ściany",
    tekst: "W kategorii <b>Ściany</b> wybierz ścianę i przeciągnij. Powstanie obrys pokoju, a ściany same się ze sobą połączą.",
    gotowe: (z) => z.nazwa === "buduj" && z.typ?.startsWith("/turf/closed") && z.ile >= 4 },
  { id: "pokoj", tytul: "Pokój jednym ruchem",
    tekst: "Naciśnij <kbd>R</kbd> (przycisk <b>Pokój</b>) i przeciągnij: ściany dookoła, podłoga w środku. Używa ostatnio wybranej ściany i podłogi.",
    gotowe: (z) => z.nazwa === "pokoj" },
  { id: "meble", tytul: "Meble i obracanie",
    tekst: "W <b>Meble</b> wybierz krzesło. Obróć je <kbd>Q</kbd>/<kbd>E</kbd> (kierunek widać w dymku przy kursorze) i kliknij, żeby postawić.",
    gotowe: (z, stan) => z.nazwa === "buduj" && z.typ?.startsWith("/obj") && stan.obrocono },
  { id: "sciana", tytul: "Rzeczy na ścianę",
    tekst: "W <b>Na ścianę</b> wybierz np. plakat, alarm albo APC i najedź na ścianę. Obiekt sam się do niej przyczepi, po tej stronie, po której jest kursor, z takim kierunkiem i przesunięciem, jakich używają nasze mapy. Światła z <b>Oświetlenie</b> działają tak samo.",
    gotowe: (z) => z.nazwa === "buduj" && z.scienny },
  { id: "kable", tytul: "Kable i rury",
    tekst: "W <b>Zasilanie</b> wybierz kabel i przeciągnij linię z zakrętem. Kable połączą się same, łącznie z istniejącymi obok. Rury z <b>Rury i atmos</b> działają tak samo.",
    gotowe: (z) => z.nazwa === "buduj" && /cable|pipe/.test(z.typ || "") && z.ile >= 3 },
  { id: "cofnij", tytul: "Anulowanie i cofanie",
    tekst: "<b>PPM</b> albo <kbd>Esc</kbd> odkłada narzędzie. <kbd>Ctrl</kbd>+<kbd>Z</kbd> cofa ostatnią zmianę, <kbd>Ctrl</kbd>+<kbd>Y</kbd> ją ponawia. Cofnij coś teraz.",
    gotowe: (z) => z.nazwa === "cofnij" },
  { id: "rozbiorka", tytul: "Rozbiórka",
    tekst: "<kbd>X</kbd> i przeciągnij: znikają obiekty, a ściany zamieniają się w poszycie. Z wciśniętym <kbd>Shift</kbd> usuwasz <b>wszystko</b> i zostaje sam kosmos.",
    gotowe: (z) => z.nazwa === "rozbiorka" || z.nazwa === "wyczysc" },
  { id: "usun-podloge", tytul: "Usuwanie podłogi",
    tekst: "<kbd>F</kbd> (przycisk <b>Usuń podłogę</b>) i przeciągnij: podłoga zamienia się w kosmos, a obiekty i ściany zostają.",
    gotowe: (z) => z.nazwa === "podloga" },
  { id: "przenies", tytul: "Przenoszenie fragmentu",
    tekst: "<kbd>M</kbd> (<b>Przenieś</b>): zaznacz prostokąt i puść. Fragment „wisi” pod kursorem, więc kliknij w nowe miejsce. Tam, skąd go zabrałeś, zostaje kosmos. PPM anuluje.",
    gotowe: (z) => z.nazwa === "przenies" },
  { id: "kopiuj", tytul: "Kopiowanie i szablony",
    tekst: "<kbd>C</kbd> zaznacza prostokąt, a każdy klik wkleja kopię. <b>Zapisz jako szablon</b> zachowuje ją na stałe w kategorii <b>Szablony</b> w Architekcie.",
    gotowe: (z) => z.nazwa === "wklej" },
  { id: "inspekcja", tytul: "Inspekcja i zmienne",
    tekst: "Bez narzędzia (<kbd>Esc</kbd>) kliknij kafelek: zobaczysz wszystko, co na nim stoi. <b>✎</b> edytuje zmienne (kierunek, stan ikony, nazwa…), <b>⧉</b> bierze typ do budowania, <b>✕</b> usuwa.",
    gotowe: (z) => z.nazwa === "zmienne" },
  { id: "szukaj", tytul: "Szukaj i zamień",
    tekst: "<kbd>Ctrl</kbd>+<kbd>F</kbd> (albo menu <b>Mapa ▾</b>): wpisz typ, a znalezione kafelki podświetlą się na mapie. Możesz je wszystkie zamienić na inny typ, usunąć albo ustawić im zmienne naraz. „Zaznacz obszar” zawęża szukanie do prostokąta.",
    gotowe: (z) => z.nazwa === "szukaj" },
  { id: "kontrola", tytul: "Kontrola mapy",
    tekst: "Przycisk <b>Kontrola</b> na górze działa jak raport inżyniera w KSP: na bieżąco sprawdza mapę i liczy ⛔ błędy, ⚠ ostrzeżenia i ℹ uwagi (obszar bez APC, urwany kabel, drzwi w ścianie…). Otwórz go i kliknij pozycję na liście, a edytor przeniesie cię do kafelka.",
    gotowe: (z) => z.nazwa === "kontrola" },
  { id: "zapis", tytul: "Zapis",
    tekst: "<kbd>Ctrl</kbd>+<kbd>S</kbd> albo <b>Zapisz</b> zapisuje mapę do repo. Kropka przy „Zapisz” oznacza niezapisane zmiany. Przed commitem obejrzyj diff w gicie.",
    gotowe: (z) => z.nazwa === "zapisz" },
];

const KLUCZ = "samouczek-postep";
let ukonczone = new Set();
let biezaca = 0;
let widoczny = true;
const stanPomocniczy = { obrocono: false };
let el;

function zapiszPostep() {
  try { localStorage.setItem(KLUCZ, JSON.stringify({ ukonczone: [...ukonczone], widoczny })); } catch {}
}

function nastepnaNieukonczona(od = 0) {
  for (let i = 0; i < LEKCJE.length; i++) {
    const k = (od + i) % LEKCJE.length;
    if (!ukonczone.has(LEKCJE[k].id)) return k;
  }
  return -1;
}

function rysuj() {
  if (!el) return;
  el.classList.toggle("ukryty", !widoczny);
  const l = LEKCJE[biezaca];
  const wszystko = ukonczone.size === LEKCJE.length;
  el.innerHTML = `
    <div class="pasek"><span class="naglowek">Samouczek</span><span class="przygaszone">${ukonczone.size}/${LEKCJE.length}</span>
      <span style="flex:1"></span><button data-a="zamknij" title="Schowaj (wróci z przycisku Samouczek na górze)">✕</button></div>
    <div class="postep"><div style="width:${(ukonczone.size / LEKCJE.length) * 100}%"></div></div>
    ${wszystko ? `<div class="lekcja"><div class="tytul-lekcji">Gotowe!</div><p>Znasz już wszystkie narzędzia. Samouczek możesz otworzyć ponownie przyciskiem na górze.</p><button data-a="od-nowa">Zacznij od nowa</button></div>`
      : `<div class="lekcja"><div class="tytul-lekcji">${biezaca + 1}. ${l.tytul}</div><p>${l.tekst}</p>
      <div class="przyciski-lekcji"><button data-a="pomin">Pomiń</button>${ukonczone.has(l.id) ? `<button data-a="dalej">Dalej</button>` : ""}</div></div>`}
    <ol class="spis">${LEKCJE.map((x, i) => `<li data-i="${i}" class="${ukonczone.has(x.id) ? "zrobione" : ""} ${i === biezaca && !wszystko ? "teraz" : ""}">${x.tytul}</li>`).join("")}</ol>`;
  el.onclick = (e) => {
    const a = e.target.dataset.a;
    const i = e.target.dataset.i;
    if (a === "zamknij") { widoczny = false; zapiszPostep(); rysuj(); }
    else if (a === "pomin") { ukonczone.add(LEKCJE[biezaca].id); przejdzDalej(); }
    else if (a === "dalej") przejdzDalej();
    else if (a === "od-nowa") { ukonczone.clear(); biezaca = 0; zapiszPostep(); rysuj(); }
    else if (i !== undefined) { biezaca = +i; rysuj(); }
  };
}

function przejdzDalej() {
  const n = nastepnaNieukonczona(biezaca + 1);
  if (n >= 0) biezaca = n;
  zapiszPostep();
  rysuj();
}

export function zdarzenie(nazwa, dane = {}) {
  if (nazwa === "obrot") stanPomocniczy.obrocono = true;
  const z = { nazwa, ...dane };
  let zmiana = false;
  for (const l of LEKCJE) {
    if (!ukonczone.has(l.id) && l.gotowe(z, stanPomocniczy)) { ukonczone.add(l.id); zmiana = true; }
  }
  if (!zmiana) return;
  // Jeśli właśnie zaliczyłeś bieżącą lekcję, przechodzę do następnej.
  if (ukonczone.has(LEKCJE[biezaca].id)) {
    const n = nastepnaNieukonczona(biezaca + 1);
    if (n >= 0) biezaca = n;
  }
  zapiszPostep();
  rysuj();
  el?.classList.add("mrugnij");
  setTimeout(() => el?.classList.remove("mrugnij"), 600);
}

export function pokazSamouczek() {
  widoczny = !widoczny || el.classList.contains("ukryty");
  zapiszPostep();
  rysuj();
}

export function initSamouczek(element) {
  el = element;
  try {
    const d = JSON.parse(localStorage.getItem(KLUCZ) || "null");
    if (d) { ukonczone = new Set(d.ukonczone || []); widoczny = d.widoczny !== false; }
  } catch {}
  biezaca = Math.max(0, nastepnaNieukonczona(0));
  rysuj();
}
