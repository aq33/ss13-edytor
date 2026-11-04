// Kontrola mapy – „raport inżyniera” jak w Kerbal Space Program.
// Sprawdza mapę po każdej zmianie i zgłasza błędy (mapa się nie skompiluje / coś na pewno
// nie zadziała), ostrzeżenia (prawdopodobny błąd) i uwagi (warto rzucić okiem).

import { istnieje, zmienneAtomu, jestTypu } from "./typy.js";
import { atomNaTekst } from "./dmm.js";
import { jestScienny, kierunekObiektuSciennego } from "./sciana.js";
import { kabelSam } from "./wygladzanie.js";

export const SPRAWDZENIA = {
  "nieznany-typ": { waga: "blad", tytul: "Typ nie istnieje w kodzie", porada: "Mapa się nie skompiluje. Ten typ został usunięty albo przemianowany – zamień go (Szukaj i zamień)." },
  "brak-turfa": { waga: "blad", tytul: "Kafelek bez podłoża", porada: "Każdy kafelek musi mieć turf. Postaw podłogę albo kosmos." },
  "brak-obszaru": { waga: "blad", tytul: "Kafelek bez obszaru", porada: "Każdy kafelek musi należeć do obszaru (/area). Pomaluj go w kategorii Obszary." },
  "gesty-w-scianie": { waga: "blad", tytul: "Drzwi, okno albo mebel w ścianie", porada: "Ten obiekt stoi na kafelku ściany – drzwi się nie otworzą, okno nic nie da, a do mebla nikt nie dojdzie." },
  "obszar-bez-apc": { waga: "blad", tytul: "Obszar bez APC", porada: "Obszar wymaga zasilania, a nie ma w nim APC – będzie tam ciemno i nic nie zadziała." },
  "obszar-kilka-apc": { waga: "blad", tytul: "Kilka APC w jednym obszarze", porada: "Obszar może mieć tylko jedno APC. Nadmiarowe gra usunie albo wyłączy." },
  "kilka-turfow": { waga: "ostrzezenie", tytul: "Kilka turfów na kafelku", porada: "Na kafelku leży więcej niż jeden turf – zostanie tylko jeden." },
  "duplikat": { waga: "ostrzezenie", tytul: "Zdublowany obiekt", porada: "Ten sam obiekt z tymi samymi zmiennymi stoi na kafelku kilka razy." },
  "kabel-urwany": { waga: "ostrzezenie", tytul: "Urwany kabel", porada: "Kabel prowadzi na sąsiedni kafelek, ale tam nie ma kabla, który by go odebrał. Prąd tędy nie popłynie." },
  "apc-bez-kabla": { waga: "ostrzezenie", tytul: "APC bez kabla", porada: "Pod APC powinna być końcówka kabla (stan 0-x), inaczej APC nie dostanie prądu z sieci." },
  "scienny-bez-sciany": { waga: "ostrzezenie", tytul: "Obiekt ścienny bez ściany", porada: "Obiekt wisi po stronie, po której nie ma ściany – wisi w powietrzu." },
  "obiekt-w-prozni": { waga: "ostrzezenie", tytul: "Instalacja w próżni bez kratownicy", porada: "Kabel, rura albo okno stoi na kosmosie bez kratownicy (lattice) ani pomostu – w grze nie da się tego tak zbudować i łatwo to zniszczyć." },
  "obszar-bez-alarmu": { waga: "uwaga", tytul: "Obszar bez alarmu powietrza", porada: "W obszarze nie ma alarmu powietrza – nikt nie zobaczy, że ucieka powietrze." },
  "obszar-bez-swiatla": { waga: "uwaga", tytul: "Obszar bez światła", porada: "W obszarze nie ma żadnego światła." },
};
const KOLEJNOSC_WAG = { blad: 0, ostrzezenie: 1, uwaga: 2 };

const KROK = { 1: [0, 1], 2: [0, -1], 4: [1, 0], 8: [-1, 0] };
const PRZECIWNY = { 1: 2, 2: 1, 4: 8, 8: 4 };
const PODPORY = ["/turf/closed", "/obj/structure/falsewall", "/obj/structure/window", "/obj/effect/spawner/structure/window", "/obj/structure/grille", "/obj/machinery/door"];
// W próżni bez kratownicy nie da się zbudować instalacji ani okien (reszta bywa celowa: poszycie, kamery na zewnątrz).
const SPRAWDZ_W_PROZNI = ["/obj/structure/cable", "/obj/machinery/atmospherics/pipe", "/obj/structure/disposalpipe", "/obj/structure/grille", "/obj/structure/window", "/obj/effect/spawner/structure/window"];
// W ścianie na pewno nie zadziałają drzwi i okna (automaty czy lodówki w ścianach to u nas celowy styl).
const NIE_W_SCIANIE = ["/obj/machinery/door/airlock", "/obj/machinery/door/window", "/obj/machinery/door/firedoor", "/obj/structure/window", "/obj/effect/spawner/structure/window", "/obj/structure/grille", "/obj/structure/table", "/obj/structure/chair", "/obj/structure/closet", "/obj/structure/rack"];
// Stosy przedmiotów są normalne – duplikaty liczę tylko dla instalacji i konstrukcji.
const BEZ_DUPLIKATOW = ["/obj/structure", "/obj/machinery"];
// Obszary zastępcze z szablonów.
const OBSZARY_POMIN = ["/area/template_noop"];

const zaczynaSie = (typ, lista) => lista.some((p) => typ === p || typ.startsWith(p + "/"));

// Analiza jednego prefabu (wynik zapamiętany po indeksie).
function analizuj(atomy) {
  const a = { turfy: 0, turf: null, obszar: null, apc: 0, alarm: false, swiatlo: false, kable: [], wezelKabla: false, problemy: [], scienne: [], obiektyPrzezroczyste: [], podpora: false, kratownica: false };
  const widziane = new Set();
  for (const atom of atomy) {
    const t = atom.typ;
    if (!istnieje(t)) { a.problemy.push(["nieznany-typ", t]); continue; }
    const tekst = atomNaTekst(atom);
    if (widziane.has(tekst) && zaczynaSie(t, BEZ_DUPLIKATOW)) a.problemy.push(["duplikat", t]);
    widziane.add(tekst);
    if (t.startsWith("/area")) { a.obszar = t; continue; }
    if (t.startsWith("/turf")) { a.turfy++; a.turf = t; continue; }
    if (zaczynaSie(t, PODPORY)) a.podpora = true;
    if (jestTypu(t, "/obj/structure/lattice") || jestTypu(t, "/obj/structure/catwalk")) a.kratownica = true;
    if (jestTypu(t, "/obj/machinery/power/apc")) a.apc++;
    else if (jestTypu(t, "/obj/machinery/airalarm")) a.alarm = true;
    else if (jestTypu(t, "/obj/machinery/light")) a.swiatlo = true; // także podłogowe
    const v = zmienneAtomu(atom);
    if (kabelSam(t)) {
      // nowe kable: łączą się same, węzeł dla APC robi każdy kabel na kafelku
      a.wezelKabla = true;
    } else if (jestTypu(t, "/obj/structure/cable")) {
      const m = /^(\d+)-(\d+)$/.exec(v.icon_state || "");
      if (m) {
        for (const d of [+m[1], +m[2]]) if (d in KROK) a.kable.push(d);
        if (m[1] === "0") a.wezelKabla = true;
      }
    }
    if (zaczynaSie(t, NIE_W_SCIANIE)) a.obiektyPrzezroczyste.push(t);
    if (jestScienny(t)) { const d = kierunekObiektuSciennego(atom, v); if (d) a.scienne.push([t, d]); }
    if (zaczynaSie(t, SPRAWDZ_W_PROZNI)) a.wProzni = (a.wProzni || []).concat(t);
  }
  if (!a.turfy) a.problemy.push(["brak-turfa", null]);
  if (!a.obszar) a.problemy.push(["brak-obszaru", null]);
  if (a.turfy > 1) a.problemy.push(["kilka-turfow", null]);
  const sciana = a.turf && a.turf.startsWith("/turf/closed");
  if (sciana) for (const t of a.obiektyPrzezroczyste) a.problemy.push(["gesty-w-scianie", t]);
  if (a.turf && a.turf.startsWith("/turf/open/space") && !a.kratownica) for (const t of a.wProzni || []) a.problemy.push(["obiekt-w-prozni", t]);
  if (a.apc && !a.wezelKabla) a.problemy.push(["apc-bez-kabla", null]);
  a.jestPodpora = sciana || a.podpora;
  a.kablePolaczenia = new Set(a.kable);
  return a;
}

// Zwraca listę problemów: { kod, x, y, z, typ }.
export function sprawdzMape(mapa) {
  const pamiec = new Map();
  const info = (idx) => {
    let a = pamiec.get(idx);
    if (!a) { a = analizuj(idx >= 0 ? mapa.prefaby[idx].atomy : []); pamiec.set(idx, a); }
    return a;
  };
  const wynik = [];
  const obszary = new Map(); // typ -> { apc: [], alarm, swiatlo, pole, kafelek }
  for (let z = 1; z <= mapa.poziomy; z++) {
    const s = mapa.siatki[z - 1];
    for (let y = 1; y <= mapa.wys; y++) {
      for (let x = 1; x <= mapa.szer; x++) {
        const a = info(s[(y - 1) * mapa.szer + (x - 1)]);
        for (const [kod, typ] of a.problemy) wynik.push({ kod, x, y, z, typ });
        // kable: każdy koniec musi trafić w kabel po drugiej stronie
        for (const d of a.kable) {
          const nx = x + KROK[d][0], ny = y + KROK[d][1];
          if (!mapa.wewnatrz(nx, ny)) continue;
          if (!info(s[(ny - 1) * mapa.szer + (nx - 1)]).kablePolaczenia.has(PRZECIWNY[d])) wynik.push({ kod: "kabel-urwany", x, y, z, typ: "/obj/structure/cable" });
        }
        // obiekty ścienne: po ich stronie musi być ściana (albo okno, drzwi)
        for (const [typ, d] of a.scienne) {
          const nx = x + KROK[d][0], ny = y + KROK[d][1];
          if (a.jestPodpora) continue; // wisi na tym samym kafelku co ściana – stary styl, zostawiam
          if (!mapa.wewnatrz(nx, ny) || !info(s[(ny - 1) * mapa.szer + (nx - 1)]).jestPodpora) wynik.push({ kod: "scienny-bez-sciany", x, y, z, typ });
        }
        if (a.obszar) {
          let o = obszary.get(a.obszar);
          if (!o) { o = { apc: [], alarm: false, swiatlo: false, pole: 0, kafelek: null }; obszary.set(a.obszar, o); }
          if (a.apc) for (let i = 0; i < a.apc; i++) o.apc.push({ x, y, z });
          o.alarm ||= a.alarm;
          o.swiatlo ||= a.swiatlo;
          if (a.turf && !a.turf.startsWith("/turf/open/space")) { o.pole++; if (!o.kafelek) o.kafelek = { x, y, z }; }
        }
      }
    }
  }
  for (const [typ, o] of obszary) {
    if (!o.pole || !istnieje(typ) || zaczynaSie(typ, OBSZARY_POMIN)) continue;
    const v = zmienneAtomu({ typ, zm: [] });
    const potrzebujePradu = v.requires_power !== 0 && v.requires_power !== false && !+v.always_unpowered;
    if (!potrzebujePradu) continue;
    if (!o.apc.length) wynik.push({ kod: "obszar-bez-apc", ...o.kafelek, typ });
    if (o.apc.length > 1) for (const p of o.apc.slice(1)) wynik.push({ kod: "obszar-kilka-apc", ...p, typ });
    if (!o.alarm && o.pole >= 4) wynik.push({ kod: "obszar-bez-alarmu", ...o.kafelek, typ });
    if (!o.swiatlo && o.pole >= 4) wynik.push({ kod: "obszar-bez-swiatla", ...o.kafelek, typ });
  }
  wynik.sort((a, b) => KOLEJNOSC_WAG[SPRAWDZENIA[a.kod].waga] - KOLEJNOSC_WAG[SPRAWDZENIA[b.kod].waga]);
  return wynik;
}

export const wagaProblemu = (p) => SPRAWDZENIA[p.kod].waga;
