// Baza typów z ekstraktora i wyliczanie zmiennych z dziedziczeniem.

const DOMYSLNE = {
  "/area": { layer: 1, plane: 0 },
  "/turf": { layer: 2, plane: 0 },
  "/obj": { layer: 3, plane: 0 },
  "/mob": { layer: 4, plane: 0 },
};
const BAZA = { icon: null, icon_state: "", name: "", desc: "", dir: 2, pixel_x: 0, pixel_y: 0, pixel_w: 0, pixel_z: 0, color: null, alpha: 255, density: 0, opacity: 0, invisibility: 0 };

let typy = {};
let uzycie = {};
const pamiec = new Map();

export async function wczytajTypy(odswiez = false) {
  const odp = await fetch("/api/typy" + (odswiez ? "?odswiez=1" : ""));
  const dane = await odp.json();
  typy = dane.typy;
  uzycie = dane.uzycie || {};
  pamiec.clear();
}

export const istnieje = (sciezka) => sciezka in typy;
export const wszystkie = () => Object.keys(typy);
export const ileUzyc = (sciezka) => uzycie[sciezka] || 0;

export function rodzic(sciezka) {
  const t = typy[sciezka];
  if (t && t["^"]) return t["^"];
  const i = sciezka.lastIndexOf("/");
  return i > 0 ? sciezka.slice(0, i) : null;
}

// istype(): czy typ to baza albo jej podtyp.
const przodkowie = new Map();
export function jestTypu(typ, baza) {
  if (typ === baza) return true;
  let zbior = przodkowie.get(typ);
  if (!zbior) {
    zbior = new Set();
    for (let r = rodzic(typ); r; r = rodzic(r)) zbior.add(r);
    przodkowie.set(typ, zbior);
  }
  return zbior.has(baza);
}

export function korzen(sciezka) {
  const m = sciezka.match(/^\/(area|turf|obj|mob)/);
  return m ? m[1] : null;
}

function prosta(v) {
  if (v && typeof v === "object") {
    if ("plik" in v) return v.plik;
    if ("typ" in v) return v.typ;
    if ("lista" in v) return v.lista.filter((x) => x.startsWith("/"));
    return undefined; // wyrażenie, którego ekstraktor nie wyliczył
  }
  return v;
}

// Zmienne typu po uwzględnieniu przodków.
export function zmienne(sciezka) {
  let w = pamiec.get(sciezka);
  if (w) return w;
  const r = rodzic(sciezka);
  const baza = r ? zmienne(r) : { ...BAZA, ...(DOMYSLNE[sciezka] || {}) };
  w = { ...baza };
  const t = typy[sciezka];
  if (t) {
    for (const k in t) {
      if (k === "^") continue;
      const v = prosta(t[k]);
      if (v !== undefined) w[k] = v;
      else if (k === "layer" || k === "plane") { /* zostaw z rodzica */ }
    }
  }
  pamiec.set(sciezka, w);
  return w;
}

// Wartość zmiennej z edycji na mapie (surowy tekst DM) -> JS.
export function wartoscZMapy(surowa) {
  const s = surowa.trim();
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1).replace(/\\"/g, '"');
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1);
  if (s === "null") return null;
  if (/^-?\d+(\.\d+)?(e-?\d+)?$/.test(s)) return parseFloat(s);
  return s;
}

// Pełne zmienne atomu z mapy: typ + edycje.
export function zmienneAtomu(atom) {
  const baza = zmienne(atom.typ);
  if (!atom.zm || atom.zm.length === 0) return baza;
  const w = { ...baza };
  for (const [k, v] of atom.zm) w[k] = wartoscZMapy(v);
  return w;
}
