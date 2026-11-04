// Autołączenie kabli i rur przy przeciąganiu linii.
// Kable: icon_state "a-b" (a < b, 0 = końcówka). Rury atmos (pipe/simple) i zsypowe (segment):
// prosta pionowa dir 2, pozioma dir 4, zakręt = suma dwóch kierunków (5, 6, 9, 10).

import { zmienne, zmienneAtomu, jestTypu } from "./typy.js";

const KROK = { 1: [0, 1], 2: [0, -1], 4: [1, 0], 8: [-1, 0] };
const PRZECIWNY = { 1: 2, 2: 1, 4: 8, 8: 4 };

function rodzaj(typ) {
  if (jestTypu(typ, "/obj/structure/cable")) return "kabel";
  if (jestTypu(typ, "/obj/machinery/atmospherics/pipe/simple")) return "atmos";
  if (jestTypu(typ, "/obj/structure/disposalpipe/segment")) return "zsyp";
  return null;
}
export const laczySie = (typ) => rodzaj(typ) !== null;

const warstwaRury = (typ) => (/\/layer(\d)$/.exec(typ)?.[1]) || "3";

function kierunekZPola(a, b) {
  if (b.x > a.x) return 4;
  if (b.x < a.x) return 8;
  if (b.y > a.y) return 1;
  return 2;
}

// Kierunki, w które istniejący atom ma połączenia (albo null).
function polaczeniaAtomu(a) {
  const r = rodzaj(a.typ);
  const v = zmienneAtomu(a);
  if (r === "kabel") {
    const m = /^(\d+)-(\d+)$/.exec(v.icon_state || "");
    if (!m) return null;
    return new Set([+m[1], +m[2]].filter((d) => d in KROK));
  }
  if (r === "atmos" || r === "zsyp") {
    const d = v.dir | 0 || 2;
    if (d === 1 || d === 2) return new Set([1, 2]);
    if (d === 4 || d === 8) return new Set([4, 8]);
    return new Set([1, 2, 4, 8].filter((k) => d & k));
  }
  return null;
}

function pasujeDoSieci(typ, inny) {
  const r = rodzaj(typ);
  if (r !== rodzaj(inny)) return false;
  if (r === "atmos") return warstwaRury(typ) === warstwaRury(inny);
  return true;
}

// Czy na sąsiednim polu jest instalacja z końcem skierowanym na nas.
function sasiadCzeka(mapa, z, p, d, typ) {
  const [dx, dy] = KROK[d];
  for (const a of mapa.atomy(p.x + dx, p.y + dy, z)) {
    if (!pasujeDoSieci(typ, a.typ)) continue;
    const c = polaczeniaAtomu(a);
    if (c && c.has(PRZECIWNY[d])) return true;
  }
  return false;
}

function atomZPolaczen(typ, kier, domyslnyKierunek) {
  const r = rodzaj(typ);
  const ds = [...kier].sort((a, b) => a - b);
  if (r === "kabel") {
    const stan = ds.length >= 2 ? `${ds[0]}-${ds[1]}` : `0-${ds[0] ?? 1}`;
    const zm = stan === zmienne(typ).icon_state ? [] : [["icon_state", `"${stan}"`]];
    return { typ, zm };
  }
  let dir;
  if (ds.length >= 2 && PRZECIWNY[ds[0]] !== ds[1]) dir = ds[0] | ds[1];
  else if (ds.length) dir = ds[0] === 1 || ds[0] === 2 ? 2 : 4;
  else dir = domyslnyKierunek;
  const domyslny = zmienne(typ).dir | 0 || 2;
  return { typ, zm: dir === domyslny ? [] : [["dir", String(dir)]] };
}

// pola: uporządkowana ścieżka linii. Zwraca atomy do postawienia na kolejnych polach.
export function autolacz(mapa, z, pola, typ, kierunekGracza) {
  return pola.map((p, i) => {
    const kier = new Set();
    if (i > 0) kier.add(kierunekZPola(p, pola[i - 1]));
    if (i < pola.length - 1) kier.add(kierunekZPola(p, pola[i + 1]));
    // Końce dołączam do istniejących kabli/rur obok (najpierw na wprost).
    if (kier.size < 2) {
      const dalej = kier.size ? PRZECIWNY[[...kier][0]] : null;
      const kolejnosc = [dalej, 1, 2, 4, 8].filter((d) => d && !kier.has(d));
      for (const d of kolejnosc) {
        if (kier.size >= 2) break;
        const nb = { x: p.x + KROK[d][0], y: p.y + KROK[d][1] };
        if (pola.some((q) => q.x === nb.x && q.y === nb.y)) continue;
        if (sasiadCzeka(mapa, z, p, d, typ)) kier.add(d);
      }
    }
    if (rodzaj(typ) !== "kabel" && kier.size === 0) {
      // pojedyncza rura bez sąsiadów: kierunek z Q/E
      return atomZPolaczen(typ, kier, kierunekGracza);
    }
    if (rodzaj(typ) !== "kabel" && kier.size === 1) {
      const d = [...kier][0];
      kier.add(PRZECIWNY[d]);
    }
    return atomZPolaczen(typ, kier, kierunekGracza);
  });
}
