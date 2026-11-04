// Wygładzanie ikon tak, jak liczy je gra.
// - legacy_smooth (Bay, nsv13/code/game/turfs/legacy_smooth.dm): ściany, fałszywe ściany, okna fulltile, kraty
// - stary system tg (code/__HELPERS/icon_smoothing.dm): stoły, dywany, kratownice itp.
// Wynik: { bazowy: stan ikony atomu albo null (nie rysować), nakladki: [{ stan, dir }] }.

import { zmienne, zmienneAtomu, jestTypu, korzen } from "./typy.js";

const SMOOTH_TRUE = 1, SMOOTH_MORE = 2, SMOOTH_DIAGONAL = 4, SMOOTH_BORDER = 8;
const N = 1, S = 2, E = 4, W = 8;
const KROKI = { 1: [0, 1], 2: [0, -1], 4: [1, 0], 8: [-1, 0], 5: [1, 1], 9: [-1, 1], 6: [1, -1], 10: [-1, -1] };
const OSIEM = [1, 2, 4, 8, 5, 6, 9, 10];
// turn(dir, 45) w BYOND (dodatni kąt = przeciwnie do wskazówek zegara)
const KOLO = [1, 9, 8, 10, 2, 6, 4, 5]; // N NW W SW S SE E NE
const obroc = (d, kat) => KOLO[(KOLO.indexOf(d) + kat / 45 + 8) % 8];

function atomyObok(mapa, x, y, z, dir) {
  const [dx, dy] = KROKI[dir];
  if (!mapa.wewnatrz(x + dx, y + dy)) return null;
  return mapa.atomy(x + dx, y + dy, z);
}

// ---------------------------------------------------------------- Bay

function naRogi(kierunki) {
  // dirs_to_corner_states: kolejność NW, SE, NE, SW
  return [9, 6, 5, 10].map((d) => {
    let v = 0;
    if (kierunki.has(d)) v |= 2;
    if (kierunki.has(obroc(d, 45))) v |= 1;
    if (kierunki.has(obroc(d, -45))) v |= 4;
    return String(v);
  });
}
const DIR_ROGU = [1, 2, 4, 8];

function scianaLaczySie(typSciany, lista, a) {
  // /turf/closed/wall/proc/can_join_with
  if (a.typ.startsWith("/mob") || jestTypu(a.typ, "/obj/machinery/door/window") || jestTypu(a.typ, "/turf/closed/wall/mineral/titanium")) return 0;
  if (jestTypu(a.typ, typSciany)) return 1;
  for (const t of lista) if (jestTypu(a.typ, t)) return 2;
  return 0;
}

function baySciana(mapa, x, y, z, atom, v) {
  const lista = v.canSmoothWith || [];
  const pelne = new Set(), inne = new Set();
  for (const d of OSIEM) {
    const obok = atomyObok(mapa, x, y, z, d);
    if (!obok) continue;
    for (const a of obok) {
      if (a.typ.startsWith("/area")) continue;
      const j = scianaLaczySie(atom.typ, lista, a);
      if (j) pelne.add(d);
      if (j === 2) inne.add(d);
    }
  }
  const sciana = naRogi(pelne), inneRogi = naRogi(inne);
  const baza = zmienne(atom.typ).icon_state;
  const nakladki = [];
  for (let i = 0; i < 4; i++) {
    nakladki.push({ stan: baza + sciana[i], dir: DIR_ROGU[i] });
    if (inneRogi[i] !== "0") nakladki.push({ stan: baza + "_other" + sciana[i], dir: DIR_ROGU[i] });
  }
  const tekstura = typeof v.texture === "string" ? v.texture : null;
  if (tekstura) nakladki.push({ stan: tekstura, dir: 2 });
  return { bazowy: v.icon_state, nakladki };
}

function bayOkno(mapa, x, y, z, atom, v) {
  // /obj/structure/window/legacy_smooth i grille – tylko zakotwiczone fulltile
  const okno = atom.typ.startsWith("/obj/structure/window");
  if ((okno && !+v.fulltile) || v.anchored === 0) return null;
  const lista = v.canSmoothWith || [];
  const kier = new Set(), inne = new Set();
  for (const d of OSIEM) {
    const obok = atomyObok(mapa, x, y, z, d);
    if (!obok) continue;
    for (const a of obok) {
      if (!jestTypu(a.typ, atom.typ)) continue;
      const va = zmienneAtomu(a);
      if ((okno && !+va.fulltile) || va.anchored === 0) continue;
      kier.add(d);
    }
  }
  for (const d of [1, 2, 4, 8]) {
    const obok = atomyObok(mapa, x, y, z, d);
    if (!obok) continue;
    const turf = obok.find((a) => a.typ.startsWith("/turf"));
    let jest = !!turf && lista.some((t) => jestTypu(turf.typ, t));
    if (!jest) {
      const takieSame = obok.some((a) => a.typ.startsWith("/obj/structure") && jestTypu(a.typ, atom.typ));
      jest = !takieSame && obok.some((a) => a.typ.startsWith("/obj") && lista.some((t) => jestTypu(a.typ, t)));
    }
    if (jest) { kier.add(d); inne.add(d); }
  }
  const pol = naRogi(kier), inneRogi = naRogi(inne);
  const baza = zmienne(atom.typ).icon_state;
  const nakladki = [];
  for (let i = 0; i < 4; i++) nakladki.push({ stan: inneRogi[i] !== "0" ? baza + "_other" + pol[i] : baza + pol[i], dir: DIR_ROGU[i] });
  return { bazowy: null, nakladki };
}

// ---------------------------------------------------------------- tg

function znajdzWKierunku(mapa, x, y, z, atom, v, dir) {
  const obok = atomyObok(mapa, x, y, z, dir);
  if (!obok) return "granica";
  const lista = v.canSmoothWith;
  const turf = obok.find((a) => a.typ.startsWith("/turf"));
  if (lista && lista.length) {
    if (v.smooth & SMOOTH_MORE) {
      for (const t of lista) {
        if (turf && jestTypu(turf.typ, t)) return true;
        if (obok.some((a) => !a.typ.startsWith("/area") && jestTypu(a.typ, t))) return true;
      }
      return false;
    }
    return lista.some((t) => obok.some((a) => a.typ === t));
  }
  if (atom.typ.startsWith("/turf")) return !!turf && turf.typ === atom.typ;
  return obok.some((a) => a.typ === atom.typ);
}

function sasiedztwo(mapa, x, y, z, atom, v) {
  let adj = 0;
  const czy = (d) => {
    const r = znajdzWKierunku(mapa, x, y, z, atom, v, d);
    return r === "granica" ? !!(v.smooth & SMOOTH_BORDER) : r;
  };
  for (const d of [1, 2, 4, 8]) if (czy(d)) adj |= 1 << d;
  const nN = adj & (1 << N), nS = adj & (1 << S), nE = adj & (1 << E), nW = adj & (1 << W);
  if (nN && nW && czy(9)) adj |= 1 << 9;
  if (nN && nE && czy(5)) adj |= 1 << 5;
  if (nS && nW && czy(10)) adj |= 1 << 10;
  if (nS && nE && czy(6)) adj |= 1 << 6;
  return adj;
}

function rogiTg(adj) {
  const m = (d) => adj & (1 << d);
  const rog = (nr, a, b, ab, la, lb, lab) => {
    if (m(a) && m(b)) return m(ab) ? nr + "-f" : nr + "-" + lab;
    if (m(a)) return nr + "-" + la;
    if (m(b)) return nr + "-" + lb;
    return nr + "-i";
  };
  return [
    rog(1, N, W, 9, "n", "w", "nw"),
    rog(2, N, E, 5, "n", "e", "ne"),
    rog(3, S, W, 10, "s", "w", "sw"),
    rog(4, S, E, 6, "s", "e", "se"),
  ].map((stan) => ({ stan, dir: 2 }));
}

const DIAGONALNE = new Map([
  [(1 << N) | (1 << W), ["d-se", "d-se-0"]],
  [(1 << N) | (1 << E), ["d-sw", "d-sw-0"]],
  [(1 << S) | (1 << W), ["d-ne", "d-ne-0"]],
  [(1 << S) | (1 << E), ["d-nw", "d-nw-0"]],
  [(1 << N) | (1 << W) | (1 << 9), ["d-se", "d-se-1"]],
  [(1 << N) | (1 << E) | (1 << 5), ["d-sw", "d-sw-1"]],
  [(1 << S) | (1 << W) | (1 << 10), ["d-ne", "d-ne-1"]],
  [(1 << S) | (1 << E) | (1 << 6), ["d-nw", "d-nw-1"]],
]);

function tg(mapa, x, y, z, atom, v) {
  if (v.anchored === 0 && !atom.typ.startsWith("/turf")) return null;
  const adj = sasiedztwo(mapa, x, y, z, atom, v);
  if (v.smooth & SMOOTH_DIAGONAL) {
    const d = DIAGONALNE.get(adj);
    if (d) return { bazowy: null, nakladki: d.map((stan) => ({ stan, dir: 2 })) };
  }
  return { bazowy: v.icon_state, nakladki: rogiTg(adj) };
}

// ---------------------------------------------------------------- wejście

export function wygladz(mapa, x, y, z, atom, v) {
  const flaga = +v.smooth || 0;
  if (!(flaga & (SMOOTH_TRUE | SMOOTH_MORE))) return null;
  const r = korzen(atom.typ);
  if (r !== "turf" && r !== "obj") return null;
  if (+v.legacy_smooth) {
    if (jestTypu(atom.typ, "/turf/closed/wall") || jestTypu(atom.typ, "/obj/structure/falsewall")) return baySciana(mapa, x, y, z, atom, v);
    if (jestTypu(atom.typ, "/obj/structure/window") || jestTypu(atom.typ, "/obj/structure/grille")) return bayOkno(mapa, x, y, z, atom, v);
    return null;
  }
  return tg(mapa, x, y, z, atom, v);
}
