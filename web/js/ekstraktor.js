// Ekstraktor drzewa typów z kodu DM – wersja przeglądarkowa (port ekstraktor.py).
// Czyta .dme i wszystkie #include przez czytaj(ścieżka) i zwraca typy atomów
// (/area, /turf, /obj, /mob) ze zmiennymi potrzebnymi do wyświetlania.
// Przybliżony parser: wcięcia i klamry, #define (także makra z argumentami),
// #if/#ifdef; ciała procedur są pomijane.

const ZMIENNE = new Set([
  "icon", "icon_state", "name", "desc", "dir", "layer", "plane",
  "pixel_x", "pixel_y", "pixel_w", "pixel_z", "color", "alpha",
  "density", "opacity", "invisibility", "smooth", "canSmoothWith",
  "abstract_type", "parent_type", "base_icon_state", "smoothing_flags",
  "smoothing_groups", "legacy_smooth", "fulltile", "anchored",
  "texture", "texture_state",
]);
const KORZENIE = ["/area", "/turf", "/obj", "/mob"];

const WBUDOWANE = {
  NORTH: "1", SOUTH: "2", EAST: "4", WEST: "8",
  NORTHEAST: "5", NORTHWEST: "9", SOUTHEAST: "6", SOUTHWEST: "10",
  UP: "16", DOWN: "32",
  TRUE: "1", FALSE: "0", null: "null",
  FLOAT_LAYER: "-1", AREA_LAYER: "1", TURF_LAYER: "2",
  OBJ_LAYER: "3", MOB_LAYER: "4", FLY_LAYER: "5",
  EFFECTS_LAYER: "5000", TOPDOWN_LAYER: "10000",
  BACKGROUND_LAYER: "20000", FLOAT_PLANE: "-32767",
  DM_VERSION: "516", DM_BUILD: "1660", CBT: "1",
  INFINITY: "1e31",
};

// ---------------------------------------------------------------- napisy i komentarze

function pominNapis(t, i, wielolinijkowy) {
  const n = t.length;
  while (i < n) {
    const c = t[i];
    if (c === "\\") { i += 2; continue; }
    if (c === "[") { i = pominWyrazenie(t, i + 1); continue; }
    if (c === '"') {
      if (wielolinijkowy) { if (i + 1 < n && t[i + 1] === "}") return i + 2; }
      else return i + 1;
    }
    if (c === "\n" && !wielolinijkowy) return i;
    i++;
  }
  return n;
}

function pominWyrazenie(t, i) {
  const n = t.length;
  let gl = 1;
  while (i < n) {
    const c = t[i];
    if (c === '"') { i = pominNapis(t, i + 1, false); continue; }
    if (c === "{" && i + 1 < n && t[i + 1] === '"') { i = pominNapis(t, i + 2, true); continue; }
    if (c === "[") gl++;
    else if (c === "]") { gl--; if (gl === 0) return i + 1; }
    else if (c === "\n") return i;
    i++;
  }
  return n;
}

function usunKomentarze(t) {
  const wynik = [];
  const re = /"|\{"|'|\/\/|\/\*/g;
  let i = 0;
  const n = t.length;
  while (i < n) {
    re.lastIndex = i;
    const m = re.exec(t);
    if (!m) { wynik.push(t.slice(i)); break; }
    const s = m.index;
    wynik.push(t.slice(i, s));
    const tok = m[0];
    if (tok === '"') {
      const e = pominNapis(t, s + 1, false);
      wynik.push(t.slice(s, e)); i = e;
    } else if (tok === '{"') {
      const e = pominNapis(t, s + 2, true);
      wynik.push(t.slice(s, e).replace(/\n/g, " ")); i = e;
    } else if (tok === "'") {
      let e = t.indexOf("'", s + 1);
      const nl = t.indexOf("\n", s + 1);
      if (e === -1 || (nl !== -1 && nl < e)) e = s;
      wynik.push(t.slice(s, e + 1)); i = e + 1;
    } else if (tok === "//") {
      const e = t.indexOf("\n", s);
      i = e === -1 ? n : e;
    } else {
      let gl = 1, j = s + 2;
      while (j < n && gl) {
        if (t.startsWith("/*", j)) { gl++; j += 2; }
        else if (t.startsWith("*/", j)) { gl--; j += 2; }
        else j++;
      }
      let ile = 0;
      for (let k = s; k < j; k++) if (t.charCodeAt(k) === 10) ile++;
      wynik.push("\n".repeat(ile));
      i = j;
    }
  }
  return wynik.join("");
}

// ---------------------------------------------------------------- wyrażenia (zamiast eval z Pythona)

class BladWyrazenia extends Error {}

function tokenyWyrazenia(s) {
  const re = /\s*(\d+\.\d*(?:e[-+]?\d+)?|\.\d+(?:e[-+]?\d+)?|\d+(?:e[-+]?\d+)?|and\b|or\b|not\b|\*\*|<<|>>|<=|>=|==|!=|[-+*/%()|&^~<>])/gy;
  const wynik = [];
  let m;
  re.lastIndex = 0;
  while (re.lastIndex < s.length) {
    const start = re.lastIndex;
    m = re.exec(s);
    if (!m) { if (/^\s*$/.test(s.slice(start))) break; throw new BladWyrazenia(s); }
    wynik.push(m[1]);
  }
  return wynik;
}

// Ocenia wyrażenie w składni Pythona (tak jak ekstraktor.py przez eval).
function ocen(s) {
  const t = tokenyWyrazenia(s);
  let i = 0;
  const spojrz = () => t[i];
  const wez = () => t[i++];
  const calkowita = (v) => { if (typeof v === "boolean") return v ? 1 : 0; if (!Number.isInteger(v)) throw new BladWyrazenia("bitowe na ułamku"); return v; };
  const liczba = (v) => (typeof v === "boolean" ? (v ? 1 : 0) : v);
  const prawda = (v) => !!v;
  function lub() { let v = i_(); while (spojrz() === "or") { wez(); const p = i_(); v = prawda(v) ? v : p; } return v; }
  function i_() { let v = nie(); while (spojrz() === "and") { wez(); const p = nie(); v = prawda(v) ? p : v; } return v; }
  function nie() { if (spojrz() === "not") { wez(); return !prawda(nie()); } return porownanie(); }
  function porownanie() {
    let v = bitLub();
    while (["<", ">", "<=", ">=", "==", "!="].includes(spojrz())) {
      const op = wez(); const p = bitLub();
      const a = liczba(v), b = liczba(p);
      v = op === "<" ? a < b : op === ">" ? a > b : op === "<=" ? a <= b : op === ">=" ? a >= b : op === "==" ? a === b : a !== b;
    }
    return v;
  }
  function bitLub() { let v = bitXor(); while (spojrz() === "|") { wez(); v = calkowita(v) | calkowita(bitXor()); } return v; }
  function bitXor() { let v = bitI(); while (spojrz() === "^") { wez(); v = calkowita(v) ^ calkowita(bitI()); } return v; }
  function bitI() { let v = przesun(); while (spojrz() === "&") { wez(); v = calkowita(v) & calkowita(przesun()); } return v; }
  function przesun() {
    let v = suma();
    while (spojrz() === "<<" || spojrz() === ">>") { const op = wez(); const p = calkowita(suma()); v = op === "<<" ? calkowita(v) * 2 ** p : Math.floor(calkowita(v) / 2 ** p); }
    return v;
  }
  function suma() {
    let v = iloczyn();
    while (spojrz() === "+" || spojrz() === "-") { const op = wez(); const p = liczba(iloczyn()); v = op === "+" ? liczba(v) + p : liczba(v) - p; }
    return v;
  }
  function iloczyn() {
    let v = jednoarg();
    while (["*", "/", "%"].includes(spojrz())) {
      const op = wez(); const p = liczba(jednoarg()); const a = liczba(v);
      if ((op === "/" || op === "%") && p === 0) throw new BladWyrazenia("dzielenie przez zero");
      v = op === "*" ? a * p : op === "/" ? a / p : ((a % p) + p) % p;
    }
    return v;
  }
  function jednoarg() {
    const s0 = spojrz();
    if (s0 === "-") { wez(); return -liczba(jednoarg()); }
    if (s0 === "+") { wez(); return +liczba(jednoarg()); }
    if (s0 === "~") { wez(); return ~calkowita(jednoarg()); }
    return potega();
  }
  function potega() {
    const v = atom();
    if (spojrz() === "**") { wez(); return liczba(v) ** liczba(jednoarg()); }
    return v;
  }
  function atom() {
    const s0 = wez();
    if (s0 === undefined) throw new BladWyrazenia("koniec");
    if (s0 === "(") { const v = lub(); if (wez() !== ")") throw new BladWyrazenia(")"); return v; }
    if (/^[\d.]/.test(s0)) return parseFloat(s0);
    throw new BladWyrazenia(s0);
  }
  const v = lub();
  if (i !== t.length) throw new BladWyrazenia("nadmiar");
  return v;
}

// ---------------------------------------------------------------- preprocesor

const IDENT = /[A-Za-z_][A-Za-z0-9_]*/g;

class Preprocesor {
  constructor() {
    this.proste = new Map(Object.entries(WBUDOWANE));
    this.funkcyjne = new Map();
  }
  zdefiniowane(n) { return this.proste.has(n) || this.funkcyjne.has(n); }
  define(reszta) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)(\(([^)]*)\))?\s*([\s\S]*)$/.exec(reszta);
    if (!m) return;
    const [, nazwa, nawias, argumenty, tresc0] = m;
    const tresc = tresc0.trim();
    if (nawias !== undefined) {
      this.funkcyjne.set(nazwa, [argumenty.split(",").map((a) => a.trim()).filter(Boolean), tresc]);
      this.proste.delete(nazwa);
    } else {
      this.proste.set(nazwa, tresc);
      this.funkcyjne.delete(nazwa);
    }
  }
  undef(n) { this.proste.delete(n); this.funkcyjne.delete(n); }
  rozwinProste(tekst, gl = 0) {
    if (gl > 20) return tekst;
    const czesci = tekst.split(/("(?:\\.|[^"\\])*"|'[^']*')/);
    for (let k = 0; k < czesci.length; k += 2) {
      czesci[k] = czesci[k].replace(IDENT, (nazwa) => {
        if (!this.proste.has(nazwa)) return nazwa;
        const w = this.proste.get(nazwa);
        const r = this.rozwinProste(w, gl + 1);
        return /[-+*/]/.test(w) ? "(" + r + ")" : r;
      });
    }
    return czesci.join("");
  }
  warunek(wyr) {
    let w = wyr.replace(/defined\s*\(\s*(\w+)\s*\)/g, (_, n) => (this.zdefiniowane(n) ? "1" : "0"));
    w = this.rozwinProste(w);
    w = w.replace(/&&/g, " and ").replace(/\|\|/g, " or ");
    w = w.replace(/!(?!=)/g, " not ");
    w = w.replace(/[A-Za-z_]\w*/g, (x) => (x === "and" || x === "or" || x === "not" ? x : "0"));
    try { return !!ocen(w); } catch { return true; }
  }
  argumenty(tekst, i) {
    let gl = 1;
    const args = [];
    let biezacy = "";
    while (i < tekst.length) {
      const c = tekst[i];
      if (c === '"') { const e = pominNapis(tekst, i + 1, false); biezacy += tekst.slice(i, e); i = e; continue; }
      if (c === "(" || c === "[") gl++;
      else if (c === ")" || c === "]") { gl--; if (gl === 0) { args.push(biezacy.trim()); return [args, i + 1]; } }
      else if (c === "," && gl === 1) { args.push(biezacy.trim()); biezacy = ""; i++; continue; }
      biezacy += c;
      i++;
    }
    return [null, i];
  }
  rozwinJedno(nazwa, args) {
    const [nazwy, tresc0] = this.funkcyjne.get(nazwa);
    if (args.length === 1 && args[0] === "" && !nazwy.length) args = [];
    const mapa = new Map();
    nazwy.forEach((n, k) => { if (k < args.length) mapa.set(n, args[k]); });
    if (nazwy.length && nazwy[nazwy.length - 1] === "...") mapa.set("__VA_ARGS__", args.slice(nazwy.length - 1).join(", "));
    let tresc = tresc0.replace(/(?<!#)#(?!#)\s*([A-Za-z_]\w*)/g, (cale, n) => (mapa.has(n) ? `"${mapa.get(n)}"` : cale));
    tresc = tresc.replace(IDENT, (x) => (mapa.has(x) ? mapa.get(x) : x));
    return tresc.replace(/\s*##\s*/g, "");
  }
  wywolanie(tekst, gl = 0) {
    const re = /"|\b([A-Za-z_]\w*)\s*\(/g;
    let zmiana = false;
    const wynik = [];
    let i = 0;
    for (;;) {
      re.lastIndex = i;
      const m = re.exec(tekst);
      if (!m) { wynik.push(tekst.slice(i)); break; }
      const koniecM = m.index + m[0].length;
      if (m[0] === '"') { const e = pominNapis(tekst, koniecM, false); wynik.push(tekst.slice(i, e)); i = e; continue; }
      const nazwa = m[1];
      if (!this.funkcyjne.has(nazwa)) { wynik.push(tekst.slice(i, koniecM)); i = koniecM; continue; }
      const [args, koniec] = this.argumenty(tekst, koniecM);
      if (args === null) { wynik.push(tekst.slice(i)); break; }
      wynik.push(tekst.slice(i, m.index));
      wynik.push(" " + this.rozwinJedno(nazwa, args) + " ");
      i = koniec;
      zmiana = true;
    }
    if (!zmiana) return null;
    const t = wynik.join("");
    if (gl < 8) { const dalej = this.wywolanie(t, gl + 1); if (dalej !== null) return dalej; }
    return t;
  }
}

// Łączy ścieżkę katalogu z dołączanym plikiem i normalizuje „..”.
function polacz(katalog, wzgledna) {
  const czesci = (katalog ? katalog + "/" : "") + wzgledna.replace(/\\/g, "/");
  const wynik = [];
  for (const c of czesci.split("/")) {
    if (!c || c === ".") continue;
    if (c === "..") wynik.pop(); else wynik.push(c);
  }
  return wynik.join("/");
}
const katalogPliku = (p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

async function przetworzDyrektywy(tekst, pp, plik, dolacz, odroczone) {
  const linie = tekst.split("\n");
  const wynik = [];
  const stos = [];
  let i = 0;
  while (i < linie.length) {
    let linia = linie[i];
    while (linia.trimEnd().endsWith("\\") && i + 1 < linie.length) {
      linia = linia.trimEnd().slice(0, -1) + " " + linie[i + 1].trim();
      i++;
      wynik.push("");
    }
    i++;
    const s = linia.trim();
    const aktywny = stos.every(([a]) => a);
    if (!s.startsWith("#")) { wynik.push(aktywny ? linia : ""); continue; }
    wynik.push("");
    const m = /^#\s*(\w+)\s*(.*)$/.exec(s);
    if (!m) continue;
    const [, dyr, reszta] = m;
    if (dyr === "if" || dyr === "ifdef" || dyr === "ifndef") {
      if (!aktywny) { stos.push([false, true]); continue; }
      const pierwszy = reszta.split(/\s+/).filter(Boolean)[0];
      let v;
      if (dyr === "ifdef") v = reszta ? pp.zdefiniowane(pierwszy) : false;
      else if (dyr === "ifndef") v = reszta ? !pp.zdefiniowane(pierwszy) : true;
      else v = pp.warunek(reszta);
      stos.push([v, v]);
    } else if (dyr === "elif") {
      if (stos.length) {
        const [, byla] = stos.pop();
        const rodzic = stos.every(([a]) => a);
        const v = rodzic && !byla && pp.warunek(reszta);
        stos.push([v, byla || v]);
      }
    } else if (dyr === "else") {
      if (stos.length) { const [, byla] = stos.pop(); stos.push([!byla, true]); }
    } else if (dyr === "endif") {
      if (stos.length) stos.pop();
    } else if (!aktywny) {
      continue;
    } else if (dyr === "define") {
      pp.define(reszta);
    } else if (dyr === "undef") {
      odroczone.push(reszta.trim());
    } else if (dyr === "include") {
      const mm = /^"([^"]+)"/.exec(reszta);
      if (mm) await dolacz(polacz(katalogPliku(plik), mm[1]));
    }
  }
  return wynik.join("\n");
}

// ---------------------------------------------------------------- instrukcje

function instrukcje(tekst) {
  const wynik = [];
  const stosWciec = [0];
  const stosKlamer = [];
  let biezacy = "";
  let glebokosc = 0;
  let nawiasy = 0;
  let poczatekLinii = true;
  let i = 0;
  const n = tekst.length;
  const wyslij = () => {
    const s = biezacy.trim();
    if (s) wynik.push([glebokosc, s]);
    biezacy = "";
  };
  while (i < n) {
    const c = tekst[i];
    if (poczatekLinii) {
      let j = i, szer = 0;
      while (j < n && (tekst[j] === " " || tekst[j] === "\t")) { szer += tekst[j] === "\t" ? 4 : 1; j++; }
      if (j < n && tekst[j] === "\n") { i = j + 1; continue; }
      poczatekLinii = false;
      i = j;
      if (!stosKlamer.length && nawiasy === 0 && !biezacy) {
        if (szer > stosWciec[stosWciec.length - 1]) stosWciec.push(szer);
        else {
          while (stosWciec.length > 1 && szer < stosWciec[stosWciec.length - 1]) stosWciec.pop();
          if (szer > stosWciec[stosWciec.length - 1]) stosWciec.push(szer);
        }
        glebokosc = stosWciec.length - 1;
      }
      continue;
    }
    if (c === '"') { const e = pominNapis(tekst, i + 1, false); biezacy += tekst.slice(i, e); i = e; continue; }
    if (c === "{" && i + 1 < n && tekst[i + 1] === '"') { const e = pominNapis(tekst, i + 2, true); biezacy += tekst.slice(i, e); i = e; continue; }
    if (c === "'") { let e = tekst.indexOf("'", i + 1); if (e === -1) e = i; biezacy += tekst.slice(i, e + 1); i = e + 1; continue; }
    if (c === "(" || c === "[") nawiasy++;
    else if (c === ")" || c === "]") nawiasy = Math.max(0, nawiasy - 1);
    else if (c === "\n") {
      if (nawiasy === 0) {
        wyslij();
        poczatekLinii = true;
        if (stosKlamer.length) glebokosc = stosKlamer[stosKlamer.length - 1] + 1;
      } else biezacy += " ";
      i++;
      continue;
    } else if (nawiasy === 0 && c === ";") { wyslij(); i++; continue; }
    else if (nawiasy === 0 && c === "{") { wyslij(); stosKlamer.push(glebokosc); glebokosc++; i++; continue; }
    else if (nawiasy === 0 && c === "}") {
      wyslij();
      if (stosKlamer.length) {
        glebokosc = stosKlamer.pop();
        glebokosc = stosKlamer.length ? stosKlamer[stosKlamer.length - 1] + 1 : stosWciec.length - 1;
      }
      i++;
      continue;
    }
    biezacy += c;
    i++;
  }
  wyslij();
  return wynik;
}

// ---------------------------------------------------------------- drzewo typów

function rozdzielPrzypisanie(s) {
  let gl = 0, i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '"') { i = pominNapis(s, i + 1, false); continue; }
    if (c === "(" || c === "[") gl++;
    else if (c === ")" || c === "]") gl--;
    else if (c === "=" && gl === 0) {
      const poprz = i ? s[i - 1] : "";
      const nast = i + 1 < s.length ? s[i + 1] : "";
      if (!(poprz && "=!<>+-*/|&^%~".includes(poprz)) && nast !== "=") return [s.slice(0, i).trim(), s.slice(i + 1).trim()];
      return null;
    }
    i++;
  }
  return null;
}

const bezUkosnikow = (s) => s.replace(/^\/+|\/+$/g, "");
const segmenty = (s) => bezUkosnikow(s).split("/").filter(Boolean);
const sciezkaZ = (absolutna, rodzic, seg) => (absolutna || !rodzic ? "" : rodzic) + seg.map((x) => "/" + x).join("");

class Drzewo {
  constructor(pp) { this.pp = pp; this.typy = new Map(); }
  typ(p) {
    let t = this.typy.get(p);
    if (!t) {
      t = {};
      this.typy.set(p, t);
      const r = p.slice(0, p.lastIndexOf("/"));
      if (r && !this.typy.has(r)) this.typ(r);
    }
    return t;
  }
  ustaw(p, nazwa, wartosc) {
    if (!ZMIENNE.has(nazwa)) { if (p) this.typ(p); return; }
    this.typ(p)[nazwa] = wylicz(wartosc, this.pp);
  }
  wczytaj(tekst) {
    const kontekst = [];
    for (const [g, s] of instrukcje(tekst)) this.krok(g, s, kontekst);
  }
  krok(g, s, kontekst, poziom = 0) {
    while (kontekst.length && kontekst[kontekst.length - 1][0] >= g) kontekst.pop();
    const ost = kontekst[kontekst.length - 1];
    if (ost && ost[2] === "pomin") return;
    const rodzic = ost ? ost[1] : "";
    const trybRodzica = ost ? ost[2] : "typ";
    const rozw = poziom < 5 ? this.pp.wywolanie(s) : null;
    if (rozw !== null) {
      for (const [g2, s2] of instrukcje(rozw)) this.krok(g + g2, s2, kontekst, poziom + 1);
      return;
    }
    this.instrukcja(g, s, rodzic, trybRodzica, kontekst);
  }
  instrukcja(g, s, rodzic, trybRodzica, kontekst) {
    if (trybRodzica === "var") {
      const p = rozdzielPrzypisanie(s);
      const lewa = p ? p[0] : s;
      const nazwa = lewa.split("/").pop().trim();
      if (p) this.ustaw(rodzic, nazwa, p[1]);
      kontekst.push([g, rodzic, "var"]);
      return;
    }
    const p = rozdzielPrzypisanie(s);
    if (p) {
      const [lewa, prawa] = p;
      if (lewa.includes("(")) { kontekst.push([g, rodzic, "pomin"]); return; }
      const seg = segmenty(lewa);
      if (!seg.length) return;
      const k = seg.indexOf("var");
      const wlasciciel = k >= 0 ? seg.slice(0, k) : seg.slice(0, -1);
      const nazwa = seg[seg.length - 1].trim();
      this.ustaw(sciezkaZ(lewa.startsWith("/"), rodzic, wlasciciel), nazwa, prawa);
      return;
    }
    if (s.includes("(")) {
      const glowa = s.slice(0, s.indexOf("("));
      const seg = segmenty(glowa);
      let wlasciciel = seg.slice(0, -1).filter((x) => x !== "proc" && x !== "verb");
      if (seg.includes("proc")) wlasciciel = seg.slice(0, seg.indexOf("proc"));
      else if (seg.includes("verb")) wlasciciel = seg.slice(0, seg.indexOf("verb"));
      const sc = sciezkaZ(glowa.startsWith("/"), rodzic, wlasciciel);
      if (sc) this.typ(sc);
      kontekst.push([g, rodzic, "pomin"]);
      return;
    }
    if (!/^\/?[A-Za-z_][\p{L}\p{N}_/]*$/u.test(s)) { kontekst.push([g, rodzic, "pomin"]); return; }
    const seg = segmenty(s);
    if (seg.includes("proc") || seg.includes("verb")) { kontekst.push([g, rodzic, "pomin"]); return; }
    if (seg.includes("var")) {
      const k = seg.indexOf("var");
      const sc = sciezkaZ(s.startsWith("/"), rodzic, seg.slice(0, k));
      if (k < seg.length - 1) return;
      kontekst.push([g, sc || "", "var"]);
      return;
    }
    const sc = sciezkaZ(s.startsWith("/"), rodzic, seg);
    if (sc) this.typ(sc);
    kontekst.push([g, sc || "", "typ"]);
  }
}

function wylicz(wartosc, pp) {
  const w = wartosc.trim();
  if (!w) return null;
  if (w.startsWith('"') && w.endsWith('"') && w.length >= 2 && pominNapis(w, 1, false) === w.length) return w.slice(1, -1).replace(/\\"/g, '"');
  if (w.startsWith('{"') && w.endsWith('"}')) return w.slice(2, -2);
  if (w.startsWith("'") && w.endsWith("'")) return { plik: w.slice(1, -1) };
  if (w.startsWith("/")) return { typ: w };
  const w2 = pp.rozwinProste(w).trim();
  const m = /^\(?\s*rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)\s*\)?$/.exec(w2);
  if (m) return "#" + m.slice(1, 4).map((x) => Math.min(255, +x).toString(16).padStart(2, "0")).join("");
  if (w2.includes('"') && w2.includes("+")) {
    const czesci = w2.split(/\+(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((x) => x.trim().replace(/^[()]+|[()]+$/g, "").trim());
    if (czesci.every((x) => x.length >= 2 && x[0] === '"' && x[x.length - 1] === '"')) return czesci.map((x) => x.slice(1, -1)).join("");
  }
  if (w2.startsWith('"') && w2.endsWith('"')) return w2.slice(1, -1);
  if (w2.startsWith("'") && w2.endsWith("'")) return { plik: w2.slice(1, -1) };
  if (w2 === "null") return null;
  if (w2.startsWith("list(")) return { lista: w2.slice(5, -1).split(",").map((x) => x.trim()).filter(Boolean) };
  if (/^[-+*/%() .0-9e|&<>~]+$/.test(w2)) {
    try {
      const v = ocen(w2);
      return typeof v === "boolean" ? v : v;
    } catch { /* jak w Pythonie: zostaje wyrażenie */ }
  }
  return { wyr: w };
}

// ---------------------------------------------------------------- wejście

// czytaj(ścieżka względna z „/”) -> Promise<string|null>; postep(tekst) opcjonalnie.
export async function ekstrahuj(dme, czytaj, postep = () => {}) {
  const pp = new Preprocesor();
  const drzewo = new Drzewo(pp);
  const odwiedzone = new Set();
  const pliki = [];
  const wczytane = new Map();
  const pobierz = (p) => {
    const k = p.toLowerCase();
    if (!wczytane.has(k)) wczytane.set(k, czytaj(p));
    return wczytane.get(k);
  };

  // Wczytuję z wyprzedzeniem wszystkie #include z .dme – kolejność parsowania i tak zostaje.
  const tekstDme = await pobierz(dme);
  if (tekstDme === null) throw new Error("Nie ma pliku " + dme);
  const wDme = [...tekstDme.matchAll(/^\s*#include\s+"([^"]+\.dm)"/gim)].map((m) => polacz(katalogPliku(dme), m[1]));
  let nr = 0;
  const kolejka = [...wDme];
  const watki = Array.from({ length: 24 }, async () => {
    while (kolejka.length) { const p = kolejka.shift(); if (!odwiedzone.has(p.toLowerCase())) await pobierz(p); }
  });

  const dolacz = async (p) => {
    const k = p.toLowerCase();
    if (odwiedzone.has(k)) return;
    odwiedzone.add(k);
    const rozsz = p.slice(p.lastIndexOf(".")).toLowerCase();
    if (rozsz !== ".dm" && rozsz !== ".dme") return;
    let tekst = await pobierz(p);
    if (tekst === null) return;
    pliki.push(p);
    if (++nr % 200 === 0) postep(`Czytam kod: ${nr}/${wDme.length} plików`);
    tekst = usunKomentarze(tekst.replace(/\r\n/g, "\n").replace(/\r/g, "\n"));
    const odroczone = [];
    tekst = await przetworzDyrektywy(tekst, pp, p, dolacz, odroczone);
    if (rozsz === ".dm") drzewo.wczytaj(tekst);
    for (const n of odroczone) pp.undef(n);
    wczytane.delete(k); // pamięć: treść już niepotrzebna
  };
  await dolacz(dme);
  await Promise.all(watki);

  const typy = {};
  for (const [p, zm] of drzewo.typy) {
    if (!KORZENIE.some((k) => p === k || p.startsWith(k + "/"))) continue;
    const wpis = {};
    for (const k in zm) if (k !== "parent_type") wpis[k] = zm[k];
    const pt = zm.parent_type;
    if (pt && typeof pt === "object" && "typ" in pt) wpis["^"] = pt.typ;
    typy[p] = wpis;
  }
  for (const k of KORZENIE) if (!(k in typy)) typy[k] = {};
  return { typy, pliki: pliki.length };
}

// Statystyki z map (port statystyki_map z ekstraktor.py): ile razy używany jest typ
// i jak mapperzy wieszają go na ścianie. montaz[typ][kierunek] = [[zmienna, wartość], ...].
const KLUCZE_MONTAZU = new Set(["dir", "pixel_x", "pixel_y"]);
function kierunekMontazu(zm) {
  const px = parseFloat(zm.pixel_x ?? 0), py = parseFloat(zm.pixel_y ?? 0);
  if (Number.isNaN(px) || Number.isNaN(py) || Math.max(Math.abs(px), Math.abs(py)) < 16) return null;
  if (Math.abs(py) >= Math.abs(px)) return py > 0 ? 1 : 2;
  return px > 0 ? 4 : 8;
}
// Ten sam zapis co json.dumps w Pythonie – żeby remisy rozstrzygały się identycznie.
const podpisPy = (pary) => "[" + pary.map(([k, v]) => `[${JSON.stringify(k)}, ${JSON.stringify(v)}]`).join(", ") + "]";

export function statystykiMap(teksty) {
  const uzycie = {};
  const liczniki = new Map();
  for (const t of teksty) {
    for (const m of t.matchAll(/^(\/[\w/]+)/gm)) uzycie[m[1]] = (uzycie[m[1]] || 0) + 1;
    for (const m of t.matchAll(/^(\/[\w/]+)\{\n((?:\t[^\n]*\n)*?)\t\}/gm)) {
      const zm = {};
      for (const z of m[2].matchAll(/^\t(\w+) = (.*?);?$/gm)) if (KLUCZE_MONTAZU.has(z[1])) zm[z[1]] = z[2].trim();
      const d = kierunekMontazu(zm);
      if (d === null) continue;
      const pary = Object.entries(zm).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      const klucz = m[1] + "|" + d;
      if (!liczniki.has(klucz)) liczniki.set(klucz, new Map());
      const w = liczniki.get(klucz);
      const p = podpisPy(pary);
      w.set(p, { ile: (w.get(p)?.ile || 0) + 1, pary });
    }
  }
  const montaz = {};
  for (const [klucz, warianty] of liczniki) {
    const [typ, d] = klucz.split("|");
    const najlepszy = [...warianty.entries()].sort((a, b) => b[1].ile - a[1].ile || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0][1];
    (montaz[typ] ??= {})[d] = najlepszy.pary;
  }
  return { uzycie, montaz };
}
