// Skąd edytor bierze pliki repozytorium:
// - ZrodloFolder: folder wybrany w Chrome/Edge (File System Access API), zapis prosto do plików,
// - ZrodloPliki: folder wczytany przez <input webkitdirectory> (Firefox itd.), zapis = pobranie pliku,
// - ZrodloSerwer: lokalny serwer.py (tryb dla deweloperów).
// Nic nie jest wysyłane w sieć – wszystko dzieje się w przeglądarce.

import { ekstrahuj, statystykiMap } from "./ekstraktor.js";

// ---------------------------------------------------------------- IndexedDB (klucz → wartość)

let bazaObietnica;
function baza() {
  bazaObietnica ??= new Promise((ok, zle) => {
    const r = indexedDB.open("ss13-edytor", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => zle(r.error);
  });
  return bazaObietnica;
}
export async function idbPobierz(klucz) {
  try {
    const db = await baza();
    return await new Promise((ok, zle) => { const r = db.transaction("kv").objectStore("kv").get(klucz); r.onsuccess = () => ok(r.result); r.onerror = () => zle(r.error); });
  } catch { return undefined; }
}
export async function idbZapisz(klucz, wartosc) {
  try {
    const db = await baza();
    await new Promise((ok, zle) => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(wartosc, klucz); t.oncomplete = ok; t.onerror = () => zle(t.error); });
  } catch (e) { console.warn("IndexedDB", e); }
}
async function idbUsun(klucz) {
  try {
    const db = await baza();
    await new Promise((ok) => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").delete(klucz); t.oncomplete = ok; t.onerror = ok; });
  } catch {}
}

const dekoder = new TextDecoder("utf-8");

// ---------------------------------------------------------------- część wspólna (folder i pliki)

class ZrodloLokalne {
  // Podklasy: plik(ścieżka) -> File|null, wszystkiePliki(prefiks, rozszerzenie) -> [{sciezka, plik}]
  async bajty(p) { const f = await this.plik(p); return f ? await f.arrayBuffer() : null; }
  async tekst(p) { const f = await this.plik(p); return f ? dekoder.decode(await f.arrayBuffer()) : null; }

  async mapy() {
    const lista = await this.wszystkiePliki("_maps", ".dmm");
    return lista.map(({ sciezka, plik }) => ({ plik: sciezka, rozmiar: plik.size })).sort((a, b) => a.plik.toLowerCase().localeCompare(b.plik.toLowerCase()));
  }

  async typy(postep) {
    const kluczPamieci = "typy:" + this.nazwa;
    // Pamięć podręczna ważna, dopóki nie zmienił się żaden wczytany plik .dm.
    const zapisane = await idbPobierz(kluczPamieci);
    if (zapisane) {
      postep("Sprawdzam, czy kod się zmienił…");
      const odcisk = await this.odcisk(zapisane.pliki);
      if (odcisk === zapisane.odcisk && zapisane.montaz) return { typy: zapisane.typy, uzycie: zapisane.uzycie, montaz: zapisane.montaz };
    }
    const dme = await this.dme();
    const czytane = [];
    const wynik = await ekstrahuj(dme, async (p) => { const t = await this.tekst(p); if (t !== null) czytane.push(p); return t; }, postep);
    postep("Liczę, czego używają mapy…");
    const mapy = await this.mapy();
    const teksty = [];
    for (let i = 0; i < mapy.length; i += 32) teksty.push(...(await Promise.all(mapy.slice(i, i + 32).map((m) => this.tekst(m.plik)))));
    const { uzycie, montaz } = statystykiMap(teksty.filter(Boolean));
    const odcisk = await this.odcisk(czytane);
    await idbZapisz(kluczPamieci, { odcisk, pliki: czytane, typy: wynik.typy, uzycie, montaz });
    return { typy: wynik.typy, uzycie, montaz };
  }

  async odcisk(pliki) {
    let suma = pliki.length;
    for (let i = 0; i < pliki.length; i += 64) {
      const czesc = await Promise.all(pliki.slice(i, i + 64).map((p) => this.plik(p)));
      for (const f of czesc) suma = (suma * 31 + (f ? f.lastModified + f.size : 7)) % 2 ** 52;
    }
    return suma;
  }

  async dme() {
    const nazwy = await this.plikiWKorzeniu();
    const dme = nazwy.filter((n) => n.toLowerCase().endsWith(".dme")).sort();
    if (!dme.length) throw new Error("W wybranym folderze nie ma pliku .dme – wybierz główny folder repozytorium.");
    return dme[0];
  }

  // Szablony w przeglądarce, osobno dla każdego repozytorium.
  async szablony() { return (await idbPobierz("szablony:" + this.nazwa)) || []; }
  async zapiszSzablon(plik, s) {
    const lista = (await this.szablony()).filter((x) => x.plik !== plik);
    lista.push({ ...s, plik });
    lista.sort((a, b) => a.nazwa.localeCompare(b.nazwa));
    await idbZapisz("szablony:" + this.nazwa, lista);
  }
  async usunSzablon(plik) {
    await idbZapisz("szablony:" + this.nazwa, (await this.szablony()).filter((x) => x.plik !== plik));
  }
}

function pobierzJakoPlik(nazwa, tekst) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([tekst], { type: "text/plain" }));
  a.download = nazwa;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ---------------------------------------------------------------- folder (Chrome/Edge)

export class ZrodloFolder extends ZrodloLokalne {
  constructor(uchwyt) {
    super();
    this.uchwyt = uchwyt;
    this.nazwa = uchwyt.name;
    this.rodzaj = "folder";
    this.zapisWMiejscu = true;
    this.katalogi = new Map([["", uchwyt]]);
    this.spisy = new Map(); // katalog -> Map(nazwa małymi -> prawdziwa nazwa)
  }

  static dostepne() { return "showDirectoryPicker" in window; }

  async spis(sciezka, uchwyt) {
    let s = this.spisy.get(sciezka);
    if (!s) {
      s = new Map();
      for await (const [n] of uchwyt.entries()) s.set(n.toLowerCase(), n);
      this.spisy.set(sciezka, s);
    }
    return s;
  }

  async katalog(sciezka) {
    if (this.katalogi.has(sciezka)) return this.katalogi.get(sciezka);
    const i = sciezka.lastIndexOf("/");
    const rodzic = await this.katalog(i < 0 ? "" : sciezka.slice(0, i));
    if (!rodzic) return null;
    const nazwa = sciezka.slice(i + 1);
    let k = null;
    try { k = await rodzic.getDirectoryHandle(nazwa); } catch {
      // inna wielkość liter niż w #include
      const prawdziwa = (await this.spis(sciezka.slice(0, Math.max(0, i)), rodzic)).get(nazwa.toLowerCase());
      if (prawdziwa) try { k = await rodzic.getDirectoryHandle(prawdziwa); } catch {}
    }
    this.katalogi.set(sciezka, k);
    return k;
  }

  async uchwytPliku(p) {
    const i = p.lastIndexOf("/");
    const kat = await this.katalog(i < 0 ? "" : p.slice(0, i));
    if (!kat) return null;
    const nazwa = p.slice(i + 1);
    try { return await kat.getFileHandle(nazwa); } catch {
      const prawdziwa = (await this.spis(i < 0 ? "" : p.slice(0, i), kat)).get(nazwa.toLowerCase());
      if (prawdziwa) try { return await kat.getFileHandle(prawdziwa); } catch {}
      return null;
    }
  }

  async plik(p) {
    const u = await this.uchwytPliku(p);
    return u ? await u.getFile() : null;
  }

  async plikiWKorzeniu() {
    const wynik = [];
    for await (const [n, u] of this.uchwyt.entries()) if (u.kind === "file") wynik.push(n);
    return wynik;
  }

  async wszystkiePliki(prefiks, rozszerzenie) {
    const wynik = [];
    const start = await this.katalog(prefiks);
    if (!start) return wynik;
    const idz = async (kat, sciezka) => {
      const podkatalogi = [];
      for await (const [n, u] of kat.entries()) {
        if (u.kind === "directory") podkatalogi.push([u, sciezka + "/" + n]);
        else if (n.toLowerCase().endsWith(rozszerzenie)) wynik.push({ sciezka: sciezka + "/" + n, plik: await u.getFile() });
      }
      await Promise.all(podkatalogi.map(([u, s]) => idz(u, s)));
    };
    await idz(start, prefiks);
    return wynik;
  }

  // Nowa mapa: tworzy brakujące katalogi i plik.
  async utworzPlik(p) {
    let kat = this.uchwyt;
    const cz = p.split("/");
    for (const c of cz.slice(0, -1)) kat = await kat.getDirectoryHandle(c, { create: true });
    this.katalogi.clear();
    this.spisy.clear();
    this.katalogi.set("", this.uchwyt);
    return await kat.getFileHandle(cz[cz.length - 1], { create: true });
  }

  async zapisz(p, tekst) {
    const u = (await this.uchwytPliku(p)) || (await this.utworzPlik(p));
    if ((await u.queryPermission({ mode: "readwrite" })) !== "granted" && (await u.requestPermission({ mode: "readwrite" })) !== "granted") {
      throw new Error("Przeglądarka nie dała zgody na zapis");
    }
    const w = await u.createWritable();
    await w.write(tekst);
    await w.close();
    return "zapisano";
  }

  // Wybór folderu. Zwraca źródło albo null, jeśli ktoś zamknął okno.
  static async wybierz() {
    let uchwyt;
    try { uchwyt = await window.showDirectoryPicker({ id: "repo-ss13", mode: "readwrite" }); } catch (e) {
      if (e.name === "AbortError") return null;
      throw e;
    }
    await idbZapisz("ostatni-folder", uchwyt);
    return new ZrodloFolder(uchwyt);
  }

  static async ostatni() {
    const u = await idbPobierz("ostatni-folder");
    return u && u.kind === "directory" ? u : null;
  }

  // Ponowne otwarcie zapamiętanego folderu (wymaga kliknięcia – przeglądarka pyta o zgodę).
  static async otworzPonownie(uchwyt) {
    let zgoda = await uchwyt.queryPermission({ mode: "readwrite" });
    if (zgoda !== "granted") zgoda = await uchwyt.requestPermission({ mode: "readwrite" });
    if (zgoda !== "granted") return null;
    return new ZrodloFolder(uchwyt);
  }

  static zapomnij() { return idbUsun("ostatni-folder"); }
}

// ---------------------------------------------------------------- pliki z <input webkitdirectory>

export class ZrodloPliki extends ZrodloLokalne {
  constructor(lista) {
    super();
    this.rodzaj = "pliki";
    this.zapisWMiejscu = false;
    this.pliki = new Map();
    const pierwszy = lista[0]?.webkitRelativePath || "";
    this.nazwa = pierwszy.split("/")[0] || "repo";
    for (const f of lista) {
      const p = f.webkitRelativePath.split("/").slice(1).join("/");
      this.pliki.set(p.toLowerCase(), { sciezka: p, plik: f });
    }
  }
  async plik(p) { return this.pliki.get(p.toLowerCase())?.plik || null; }
  async plikiWKorzeniu() { return [...this.pliki.values()].map((x) => x.sciezka).filter((p) => !p.includes("/")); }
  async wszystkiePliki(prefiks, rozszerzenie) {
    const pre = prefiks.toLowerCase() + "/";
    return [...this.pliki.entries()].filter(([k]) => k.startsWith(pre) && k.endsWith(rozszerzenie)).map(([, v]) => v);
  }
  async zapisz(p, tekst) {
    pobierzJakoPlik(p.split("/").pop(), tekst);
    return "pobrano";
  }
}

// ---------------------------------------------------------------- GitHub (bez pobierania repo)

// Katalog typów zbudowany w CI (dane/katalog.json), mapy i ikony z raw.githubusercontent.com
// z tego samego commita. Zapis pobiera plik .dmm do wgrania na GitHuba.
export class ZrodloGithub extends ZrodloLokalne {
  constructor(info) {
    super();
    this.rodzaj = "github";
    this.zapisWMiejscu = false;
    this.info = info;
    this.nazwa = info.repo.split("/")[1];
    this.katalog = null;
  }
  static async wykryj() {
    try {
      const r = await fetch("dane/info.json", { cache: "no-cache" });
      if (!r.ok) return null;
      return new ZrodloGithub(await r.json());
    } catch { return null; }
  }
  async wczytajKatalog() {
    this.katalog ??= await fetch("dane/katalog.json", { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error("brak katalogu (" + r.status + ")");
      return r.json();
    });
    return this.katalog;
  }
  adres(p) { return `https://raw.githubusercontent.com/${this.info.repo}/${this.info.sha}/` + p.split("/").map(encodeURIComponent).join("/"); }
  async bajty(p) { const r = await fetch(this.adres(p)); return r.ok ? await r.arrayBuffer() : null; }
  async tekst(p) { const r = await fetch(this.adres(p)); return r.ok ? await r.text() : null; }
  async mapy() { return (await this.wczytajKatalog()).mapy; }
  async typy() { const k = await this.wczytajKatalog(); return { typy: k.typy, uzycie: k.uzycie, montaz: k.montaz }; }
  async zapisz(p, tekst) { pobierzJakoPlik(p.split("/").pop(), tekst); return "github"; }
  // Strona GitHuba do wgrania pliku w ten sam folder (GitHub sam zaproponuje fork i PR).
  linkWgrania(p) {
    const katalog = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
    return `https://github.com/${this.info.repo}/upload/${this.info.galaz}/${katalog.split("/").map(encodeURIComponent).join("/")}`;
  }
}

// ---------------------------------------------------------------- serwer.py

export class ZrodloSerwer {
  constructor(info) {
    this.rodzaj = "serwer";
    this.zapisWMiejscu = true;
    this.info = info;
    this.nazwa = info.repo.split(/[\\/]/).pop();
  }
  static async wykryj() {
    try {
      const r = await fetch("api/info");
      if (!r.ok || !(r.headers.get("content-type") || "").includes("json")) return null;
      return new ZrodloSerwer(await r.json());
    } catch { return null; }
  }
  async mapy() { return this.info.mapy; }
  async bajty(p) { const r = await fetch("repo/" + encodeURI(p)); return r.ok ? await r.arrayBuffer() : null; }
  async tekst(p) { const r = await fetch("repo/" + encodeURI(p)); return r.ok ? await r.text() : null; }
  async typy() { return await fetch("api/typy").then((r) => r.json()); }
  async zapisz(p, tekst) {
    const r = await fetch("api/zapisz?plik=" + encodeURIComponent(p), { method: "POST", body: tekst });
    const w = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(w.blad || r.status);
    return "zapisano";
  }
  async szablony() { try { return await fetch("api/szablony").then((r) => r.json()); } catch { return []; } }
  async zapiszSzablon(plik, s) {
    const r = await fetch("api/szablon?plik=" + encodeURIComponent(plik), { method: "POST", body: JSON.stringify(s) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).blad || r.status);
  }
  async usunSzablon(plik) { await fetch("api/szablon?plik=" + encodeURIComponent(plik), { method: "DELETE" }); }
}

// ---------------------------------------------------------------- bieżące źródło

export let zrodlo = null;
export function ustawZrodlo(z) { zrodlo = z; }
