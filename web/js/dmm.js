// Odczyt i zapis plików .dmm (zapis zawsze w formacie TGM, jak w repo).

const ALFABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const NAGLOWEK_TGM = "//MAP CONVERTED BY dmm2tgm.py THIS HEADER COMMENT PREVENTS RECONVERSION, DO NOT REMOVE";

function kluczNaLiczbe(k) {
  let n = 0;
  for (const c of k) n = n * 52 + ALFABET.indexOf(c);
  return n;
}
function liczbaNaKlucz(n, dlugosc) {
  let s = "";
  for (let i = 0; i < dlugosc; i++) { s = ALFABET[n % 52] + s; n = Math.floor(n / 52); }
  return s;
}

// Pomija napis zaczynający się w t[i] === '"'. Zwraca indeks za nim.
function zaNapisem(t, i) {
  i++;
  while (i < t.length) {
    const c = t[i];
    if (c === "\\") { i += 2; continue; }
    if (c === '"') return i + 1;
    i++;
  }
  return i;
}

function parsujZmienne(t) {
  // t: zawartość między { a }, zmienne rozdzielone ';'
  const wynik = [];
  let gl = 0, start = 0, i = 0;
  const dodaj = (kawalek) => {
    const s = kawalek.trim();
    if (!s) return;
    const r = s.indexOf("=");
    if (r < 0) return;
    wynik.push([s.slice(0, r).trim(), s.slice(r + 1).trim()]);
  };
  while (i < t.length) {
    const c = t[i];
    if (c === '"') { i = zaNapisem(t, i); continue; }
    if (c === "(" || c === "[") gl++;
    else if (c === ")" || c === "]") gl--;
    else if (c === ";" && gl === 0) { dodaj(t.slice(start, i)); start = i + 1; }
    i++;
  }
  dodaj(t.slice(start));
  return wynik;
}

function parsujAtomy(t, i) {
  // i wskazuje znak za '('. Zwraca [atomy, indeks za ')'].
  const atomy = [];
  while (i < t.length) {
    while (i < t.length && /[\s,]/.test(t[i])) i++;
    if (t[i] === ")") return [atomy, i + 1];
    let j = i;
    while (j < t.length && !"{,)".includes(t[j]) && !/\s/.test(t[j])) j++;
    const typ = t.slice(i, j);
    i = j;
    while (i < t.length && /[ \t]/.test(t[i])) i++;
    let zm = [];
    if (t[i] === "{") {
      let k = i + 1, gl = 0;
      while (k < t.length) {
        const c = t[k];
        if (c === '"') { k = zaNapisem(t, k); continue; }
        if (c === "(" || c === "[") gl++;
        else if (c === ")" || c === "]") gl--;
        else if (c === "}" && gl === 0) break;
        k++;
      }
      zm = parsujZmienne(t.slice(i + 1, k));
      i = k + 1;
    }
    if (typ) atomy.push({ typ, zm });
  }
  return [atomy, i];
}

export function atomNaTekst(a) {
  if (!a.zm || a.zm.length === 0) return a.typ;
  return a.typ + "{\n" + a.zm.map(([k, v]) => "\t" + k + " = " + v).join(";\n") + "\n\t}";
}
export const podpisPrefabu = (atomy) => atomy.map(atomNaTekst).join(",\n");

export class Mapa {
  constructor() {
    this.plik = "";
    this.prefaby = [];          // { atomy, klucz|null, podpis }
    this.poPodpisie = new Map();
    this.szer = 0; this.wys = 0; this.poziomy = 0;
    this.siatki = [];           // Int32Array na poziom, indeks (y-1)*szer+(x-1)
    this.dlugoscKlucza = 1;
  }

  static parsuj(tekst, plik) {
    const m = new Mapa();
    m.plik = plik;
    m.crlf = tekst.includes("\r\n");
    tekst = tekst.replace(/\r\n/g, "\n");
    const poKluczu = new Map();
    const reWpis = /^"([a-zA-Z]+)" = \(/gm;
    let r;
    let koniecSlownika = 0;
    while ((r = reWpis.exec(tekst))) {
      const [atomy, koniec] = parsujAtomy(tekst, r.index + r[0].length);
      const idx = m.dodajPrefab(atomy, r[1]);
      poKluczu.set(r[1], idx);
      m.dlugoscKlucza = r[1].length;
      reWpis.lastIndex = koniec;
      koniecSlownika = koniec;
    }
    const reBlok = /\((\d+),(\d+),(\d+)\) = \{"\n?([\s\S]*?)"\}/g;
    reBlok.lastIndex = koniecSlownika;
    const bloki = [];
    while ((r = reBlok.exec(tekst))) {
      const linie = r[4].split("\n").filter((l) => l.length);
      const b = { x: +r[1], y: +r[2], z: +r[3], linie };
      bloki.push(b);
      const kol = linie.length ? linie[0].length / m.dlugoscKlucza : 0;
      m.szer = Math.max(m.szer, b.x + kol - 1);
      m.wys = Math.max(m.wys, b.y + linie.length - 1);
      m.poziomy = Math.max(m.poziomy, b.z);
    }
    for (let z = 0; z < m.poziomy; z++) m.siatki.push(new Int32Array(m.szer * m.wys).fill(-1));
    const kl = m.dlugoscKlucza;
    for (const b of bloki) {
      const s = m.siatki[b.z - 1];
      const n = b.linie.length;
      for (let i = 0; i < n; i++) {
        const linia = b.linie[i];
        const y = b.y + (n - 1 - i);
        for (let j = 0; j * kl < linia.length; j++) {
          const idx = poKluczu.get(linia.substr(j * kl, kl));
          s[(y - 1) * m.szer + (b.x + j - 1)] = idx ?? -1;
        }
      }
    }
    return m;
  }

  // Nowa mapa wypełniona jednym prefabem (zwykle kosmos + /area/space).
  static nowa(plik, szer, wys, poziomy, atomy) {
    const m = new Mapa();
    m.plik = plik;
    m.szer = szer; m.wys = wys; m.poziomy = poziomy;
    m.dlugoscKlucza = 1;
    const idx = m.dodajPrefab(atomy);
    for (let z = 0; z < poziomy; z++) m.siatki.push(new Int32Array(szer * wys).fill(idx));
    return m;
  }

  // Zmiana rozmiaru. dx, dy – o ile przesunąć starą zawartość (w kafelkach, w prawo i w górę).
  // Nowe pola dostają prefab wypelnienie.
  zmienRozmiar(szer, wys, dx, dy, wypelnienie) {
    const nowe = this.siatki.map((stara) => {
      const s = new Int32Array(szer * wys).fill(wypelnienie);
      for (let y = 1; y <= this.wys; y++) {
        const ny = y + dy;
        if (ny < 1 || ny > wys) continue;
        for (let x = 1; x <= this.szer; x++) {
          const nx = x + dx;
          if (nx < 1 || nx > szer) continue;
          s[(ny - 1) * szer + (nx - 1)] = stara[(y - 1) * this.szer + (x - 1)];
        }
      }
      return s;
    });
    this.siatki = nowe;
    this.szer = szer;
    this.wys = wys;
  }

  dodajPoziom(wypelnienie, poz = this.poziomy) {
    this.siatki.splice(poz, 0, new Int32Array(this.szer * this.wys).fill(wypelnienie));
    this.poziomy++;
  }

  usunPoziom(z) {
    if (this.poziomy <= 1) return false;
    this.siatki.splice(z - 1, 1);
    this.poziomy--;
    return true;
  }

  dodajPrefab(atomy, klucz = null) {
    const podpis = podpisPrefabu(atomy);
    const jest = this.poPodpisie.get(podpis);
    if (jest !== undefined) return jest;
    const idx = this.prefaby.length;
    this.prefaby.push({ atomy, klucz, podpis });
    this.poPodpisie.set(podpis, idx);
    return idx;
  }

  wewnatrz(x, y) { return x >= 1 && y >= 1 && x <= this.szer && y <= this.wys; }
  prefab(x, y, z) {
    if (!this.wewnatrz(x, y)) return -1;
    return this.siatki[z - 1][(y - 1) * this.szer + (x - 1)];
  }
  atomy(x, y, z) {
    const i = this.prefab(x, y, z);
    return i < 0 ? [] : this.prefaby[i].atomy;
  }
  ustaw(x, y, z, idx) {
    this.siatki[z - 1][(y - 1) * this.szer + (x - 1)] = idx;
  }

  zapisz() {
    // Zbieramy używane prefaby; nowe dostają wolne klucze.
    const uzywane = new Set();
    for (const s of this.siatki) for (const v of s) if (v >= 0) uzywane.add(v);
    const zajete = new Set();
    for (const i of uzywane) if (this.prefaby[i].klucz) zajete.add(this.prefaby[i].klucz);
    let dl = this.dlugoscKlucza;
    const nowe = [...uzywane].filter((i) => !this.prefaby[i].klucz);
    const klucze = new Map();
    if (zajete.size + nowe.length > 52 ** dl) {
      // Brakuje kluczy – trzeba przenumerować całość dłuższymi kluczami.
      while (uzywane.size > 52 ** dl) dl++;
      let n = 0;
      const poKolei = [...uzywane].sort((a, b) => a - b);
      for (const i of poKolei) klucze.set(i, liczbaNaKlucz(n++, dl));
    } else {
      for (const i of uzywane) if (this.prefaby[i].klucz) klucze.set(i, this.prefaby[i].klucz);
      let n = 0;
      for (const i of nowe) {
        let k;
        do { k = liczbaNaKlucz(n++, dl); } while (zajete.has(k));
        zajete.add(k);
        klucze.set(i, k);
      }
    }
    for (const [i, k] of klucze) this.prefaby[i].klucz = k;
    this.dlugoscKlucza = dl;

    const wpisy = [...klucze.entries()].sort((a, b) => kluczNaLiczbe(a[1]) - kluczNaLiczbe(b[1]));
    const czesci = [NAGLOWEK_TGM];
    for (const [i, k] of wpisy) czesci.push('"' + k + '" = (\n' + this.prefaby[i].podpis + ")");
    czesci.push("");
    for (let z = 1; z <= this.poziomy; z++) {
      if (z > 1) czesci.push("");
      for (let x = 1; x <= this.szer; x++) {
        const kol = [];
        for (let y = this.wys; y >= 1; y--) {
          const idx = this.prefab(x, y, z);
          kol.push(idx >= 0 ? klucze.get(idx) : liczbaNaKlucz(0, dl));
        }
        czesci.push("(" + x + ",1," + z + ') = {"\n' + kol.join("\n") + '\n"}');
      }
    }
    const wynik = czesci.join("\n") + "\n";
    return this.crlf ? wynik.replace(/\n/g, "\r\n") : wynik;
  }
}
