// Operacje na kafelkach z historią do cofania.

import { zmienne, korzen } from "./typy.js";
import { atomNaTekst } from "./dmm.js";

export const PODLOZE_PO_ROZBIORCE = "/turf/open/floor/plating";
const POD_SCIANA = ["/obj/structure/cable", "/obj/machinery/atmospherics/pipe", "/obj/structure/disposalpipe", "/obj/structure/lattice"];

function jestTurf(a) { return a.typ.startsWith("/turf"); }
function jestObszar(a) { return a.typ.startsWith("/area"); }

export function nowyAtom(typ, kierunek) {
  const zm = [];
  const domyslny = zmienne(typ).dir | 0 || 2;
  if (kierunek && kierunek !== domyslny && !typ.startsWith("/turf") && !typ.startsWith("/area")) zm.push(["dir", String(kierunek)]);
  return { typ, zm };
}

const kierunekAtomu = (a) => {
  const e = a.zm.find(([k]) => k === "dir");
  return e ? +e[1] : (zmienne(a.typ).dir | 0 || 2);
};

// Zwraca nową listę atomów po postawieniu albo null, jeśli nic się nie zmienia.
export function poPostawieniu(atomy, atom) {
  const r = korzen(atom.typ);
  const wynik = atomy.slice();
  if (r === "turf") {
    const i = wynik.findIndex(jestTurf);
    if (i >= 0 && wynik[i].typ === atom.typ && wynik[i].zm.length === 0) return null;
    let bez = wynik.filter((a) => !jestTurf(a));
    // Ściana wypiera wszystko poza instalacjami, które w SS13 biegną pod ścianami.
    if (atom.typ.startsWith("/turf/closed")) bez = bez.filter((a) => jestObszar(a) || POD_SCIANA.some((p) => a.typ.startsWith(p)));
    const gdzie = bez.findIndex(jestObszar);
    bez.splice(gdzie < 0 ? bez.length : gdzie, 0, atom);
    return bez;
  }
  if (r === "area") {
    const i = wynik.findIndex(jestObszar);
    if (i >= 0 && wynik[i].typ === atom.typ) return null;
    if (i >= 0) wynik[i] = atom; else wynik.push(atom);
    return wynik;
  }
  const tekst = atomNaTekst(atom);
  if (wynik.some((a) => atomNaTekst(a) === tekst)) return null;
  let gdzie = wynik.findIndex((a) => jestTurf(a) || jestObszar(a));
  if (gdzie < 0) gdzie = wynik.length;
  wynik.splice(gdzie, 0, atom);
  return wynik;
}

// Czy da się tu postawić (do koloru podglądu).
export function mozna(atomy, atom) {
  const r = korzen(atom.typ);
  if (r === "turf" || r === "area") return true;
  if (!atomy.length) return false;
  const turf = atomy.find(jestTurf);
  const gesty = +zmienne(atom.typ).density;
  if (gesty && turf && turf.typ.startsWith("/turf/closed")) return false;
  return true;
}

export function poRozbiorce(atomy) {
  const wynik = atomy.filter((a) => jestTurf(a) || jestObszar(a));
  const i = wynik.findIndex(jestTurf);
  if (i >= 0 && wynik[i].typ.startsWith("/turf/closed")) wynik[i] = { typ: PODLOZE_PO_ROZBIORCE, zm: [] };
  if (wynik.length === atomy.length && wynik.every((a, k) => a === atomy[k])) return null;
  return wynik;
}

export function bezAtomu(atomy, indeks) {
  const a = atomy[indeks];
  if (!a) return null;
  if (jestTurf(a)) return atomy.map((x, k) => (k === indeks ? { typ: PODLOZE_PO_ROZBIORCE, zm: [] } : x));
  if (jestObszar(a)) return null;
  return atomy.filter((_, k) => k !== indeks);
}

export function obrocony(atomy, indeks, zmiana) {
  const a = atomy[indeks];
  if (!a || jestTurf(a) || jestObszar(a)) return null;
  const kier = obrot(kierunekAtomu(a), zmiana);
  const domyslny = zmienne(a.typ).dir | 0 || 2;
  const zm = a.zm.filter(([k]) => k !== "dir");
  if (kier !== domyslny) {
    // dir zostaje na swoim miejscu alfabetycznym jak w mapmerge
    zm.push(["dir", String(kier)]);
    zm.sort((p, q) => (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : 0));
  }
  return atomy.map((x, k) => (k === indeks ? { typ: a.typ, zm } : x));
}

// Obrót o 90° (zmiana = +1 zgodnie ze wskazówkami zegara, -1 przeciwnie).
const KOLO = [1, 5, 4, 6, 2, 10, 8, 9]; // N NE E SE S SW W NW
export function obrot(kier, zmiana) {
  const i = KOLO.indexOf(kier);
  if (i < 0) return 2;
  return KOLO[(i + 2 * zmiana + 8) % 8];
}

export class Historia {
  constructor() { this.wstecz = []; this.naprzod = []; this.biezaca = null; }
  zacznij() { this.biezaca = new Map(); }
  // zapisuje stan kafelka sprzed pierwszej zmiany w tej operacji
  zmiana(klucz, przed, po) {
    if (!this.biezaca) this.zacznij();
    const e = this.biezaca.get(klucz);
    if (e) e.po = po; else this.biezaca.set(klucz, { przed, po });
  }
  zakoncz() {
    if (this.biezaca && this.biezaca.size) { this.wstecz.push(this.biezaca); this.naprzod = []; }
    if (this.wstecz.length > 300) this.wstecz.shift();
    this.biezaca = null;
  }
}
