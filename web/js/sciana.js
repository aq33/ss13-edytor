// Przyciąganie obiektów ściennych (plakaty, APC, alarmy, światła…) do najbliższej ściany.
// Obiekt stoi na podłodze przy ścianie; kierunek i przesunięcie biorę kolejno z:
// 1) podtypu kierunkowego (…/directional/north, …/north), 2) tego, jak typ wisi w naszych mapach,
// 3) reguły awaryjnej (światła: dir w stronę ściany, reszta: przesunięcie o 32 piksele).

import { istnieje, rodzic, zmienne, montazTypu, jestTypu } from "./typy.js";

const NAZWY = { 1: "north", 2: "south", 4: "east", 8: "west" };
const KROK = { 1: [0, 1], 2: [0, -1], 4: [1, 0], 8: [-1, 0] };
const PRZECIWNY = { 1: 2, 2: 1, 4: 8, 8: 4 };

let prefiksy = [];
let wykluczone = [];
export function ustawRegulySciany(lista = [], wyklucz = []) { prefiksy = lista; wykluczone = wyklucz; }

const pasuje = (typ, p) => typ === p || typ.startsWith(p + "/");
export const jestScienny = (typ) => prefiksy.some((p) => pasuje(typ, p)) && !wykluczone.some((p) => pasuje(typ, p));

// Typ bez końcówki kierunkowej: /obj/machinery/firealarm/directional/west -> /obj/machinery/firealarm
const bazowy = (typ) => typ.replace(/\/(directional|auto_name)\/(north|south|east|west)$/, "").replace(/\/(north|south|east|west)$/, "");

const posortowane = (zm) => [...zm].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

export function atomNaScianie(typ, d) {
  const baza = bazowy(typ);
  // auto_name: APC sam nadaje sobie nazwę obszaru (tak robią nowsze mapy)
  for (const kand of [baza + "/directional/" + NAZWY[d], baza + "/" + NAZWY[d], baza + "/auto_name/" + NAZWY[d]]) {
    if (istnieje(kand)) return { typ: kand, zm: [] };
  }
  if (jestTypu(typ, "/obj/machinery/light")) {
    // światło wisi na ścianie wskazanej przez dir
    const dom = zmienne(typ).dir | 0 || 2;
    return { typ, zm: d === dom ? [] : [["dir", String(d)]] };
  }
  // Wyuczone z map: najpierw sam typ, potem przodkowie, dopóki są obiektami ściennymi.
  for (let t = typ; t && jestScienny(t); t = rodzic(t)) {
    const m = montazTypu(t)?.[d];
    if (m) return { typ, zm: posortowane(m.map(([k, v]) => [k, v])) };
  }
  const zm = d === 1 ? [["pixel_y", "32"]] : d === 2 ? [["pixel_y", "-32"]] : d === 4 ? [["pixel_x", "32"]] : [["pixel_x", "-32"]];
  return { typ, zm };
}

// Po której stronie kafelka wisi obiekt ścienny (do kontroli mapy) albo null.
export function kierunekObiektuSciennego(atom, v) {
  // najpierw przesunięcie pikseli (podtypy kierunkowe też je mają w kodzie)
  const px = +v.pixel_x || 0, py = +v.pixel_y || 0;
  if (Math.max(Math.abs(px), Math.abs(py)) >= 16) return Math.abs(py) >= Math.abs(px) ? (py > 0 ? 1 : 2) : (px > 0 ? 4 : 8);
  const KIER = { north: 1, south: 2, east: 4, west: 8 };
  const m = /\/(?:directional|auto_name)\/(north|south|east|west)$/.exec(atom.typ);
  if (m) return KIER[m[1]];
  // gołe …/east u znaków to zwykle kierunek strzałki, nie strona montażu
  const g = /\/(north|south|east|west)$/.exec(atom.typ);
  if (g && !jestTypu(atom.typ, "/obj/structure/sign")) return KIER[g[1]];
  if (jestTypu(atom.typ, "/obj/machinery/light")) return [1, 2, 4, 8].includes(v.dir | 0) ? v.dir | 0 : 2;
  return null;
}

function sciana(mapa, x, y, z) {
  if (!mapa.wewnatrz(x, y)) return false;
  return mapa.atomy(x, y, z).some((a) => a.typ.startsWith("/turf/closed") || a.typ.startsWith("/obj/structure/falsewall"));
}
// Okna, kraty i drzwi zajmują kafelek – na nich nic nie wieszamy.
const ZAJMUJACE = ["/obj/structure/window", "/obj/effect/spawner/structure/window", "/obj/structure/grille", "/obj/machinery/door", "/obj/structure/falsewall"];
const podloga = (mapa, x, y, z) => {
  if (!mapa.wewnatrz(x, y) || sciana(mapa, x, y, z)) return false;
  const atomy = mapa.atomy(x, y, z);
  return atomy.some((a) => a.typ.startsWith("/turf/open") && !a.typ.startsWith("/turf/open/space"))
    && !atomy.some((a) => ZAJMUJACE.some((p) => a.typ.startsWith(p)));
};

// k: kafelek pod kursorem, fx/fy: położenie kursora w kafelku (0..1, fy w górę).
// Zwraca { x, y, d } – kafelek podłogi i kierunek ściany – albo null.
export function przyciagnij(mapa, z, k, fx, fy) {
  const blisko = { 1: fy, 2: 1 - fy, 4: fx, 8: 1 - fx };
  const kolejnosc = [1, 2, 4, 8].sort((a, b) => blisko[b] - blisko[a]);
  if (sciana(mapa, k.x, k.y, z)) {
    // kursor na ścianie: obiekt ląduje na podłodze po tej stronie, po której jest kursor
    for (const s of kolejnosc) {
      const x = k.x + KROK[s][0], y = k.y + KROK[s][1];
      if (podloga(mapa, x, y, z)) return { x, y, d: PRZECIWNY[s] };
    }
    return null;
  }
  if (!podloga(mapa, k.x, k.y, z)) return null;
  for (const s of kolejnosc) if (sciana(mapa, k.x + KROK[s][0], k.y + KROK[s][1], z)) return { x: k.x, y: k.y, d: s };
  return null;
}
