import { Mapa, atomNaTekst } from "./dmm.js";
import { ikona } from "./dmi.js";
import { wczytajTypy, wszystkie, zmienne, ileUzyc, korzen, zmienneAtomu } from "./typy.js";
import { Widok, ikonkaTypu, kolorObszaru, warstwaAtomu } from "./render.js";
import { nowyAtom, poPostawieniu, mozna, poRozbiorce, bezAtomu, obrocony, obrot, obroconySchowek, Historia } from "./edycja.js";
import { autolacz, laczySie } from "./polaczenia.js";
import { initSamouczek, zdarzenie, pokazSamouczek } from "./samouczek.js";
import { zrodlo, ustawZrodlo, ZrodloFolder, ZrodloPliki, ZrodloSerwer, ZrodloGithub, idbPobierz, idbZapisz, idbUsun, idbKlucze } from "./zrodlo.js";
import { t, initJezyk, przelaczJezyk, jezyk } from "./i18n.js";
import { ustawRegulySciany, jestScienny, przyciagnij, atomNaScianie } from "./sciana.js";
import { sprawdzMape, SPRAWDZENIA, wagaProblemu } from "./kontrola.js";
import { dialog, initOperacje, initSzukanie, nowaMapa, zmienRozmiar, dodajPoziom, usunPoziom, szukaj, przelaczSzukanie, wynikiSzukania, eksportPng } from "./operacje.js";

const $ = (s) => document.querySelector(s);
const plotno = $("#plotno");
const widok = new Widok(plotno);
const historia = new Historia();

const stan = {
  mapa: null,
  narzedzie: null,          // { rodzaj: "buduj", typ, tryb } | { rodzaj: "rozbiorka" } | null (inspekcja)
  kierunek: 2,
  kursor: null,             // kafelek pod myszą
  przeciaganie: null,       // { start, pola: Map, przesuniecie }
  wybrany: null,            // kafelek w inspekcji
  zmiany: false,
  siatka: false,
  kategorie: [],
  tryby: [],
  katalog: new Map(),       // id kategorii -> [typy]
  kategoria: null,
  podgrupa: null,
  schowek: null,            // { szer, wys, kafelki: [{ dx, dy, atomy }] }
  szablony: [],
  edycjaZm: null,           // indeks atomu z otwartym formularzem zmiennych
  karty: [],                // otwarte mapy (zakładki)
  karta: -1,
  ostatnie: { sciana: "/turf/closed/wall", podloga: "/turf/open/floor/plating" }, // do narzędzia Pokój
};

// ---------------------------------------------------------------- komunikaty

let czasKomunikatu;
function komunikat(tekst, blad = false) {
  const k = $("#komunikat");
  k.textContent = tekst;
  k.className = blad ? "blad" : "";
  clearTimeout(czasKomunikatu);
  czasKomunikatu = setTimeout(() => k.classList.add("ukryty"), blad ? 6000 : 2500);
}
function ladowanie(tekst) {
  $("#ladowanie").classList.toggle("ukryty", !tekst);
  if (tekst) $("#ladowanie-tekst").textContent = tekst;
}

const ladnaNazwa = (typ) => {
  const n = zmienne(typ).name;
  const czysta = typeof n === "string" ? n.replace(/\\(im)?proper\s*/g, "").trim() : "";
  const s = czysta && !czysta.includes("[") ? czysta : typ.split("/").pop().replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// ---------------------------------------------------------------- katalog

function trybTypu(typ) {
  for (const r of stan.tryby) if (typ.startsWith(r.prefiks)) return r.tryb;
  return "pojedynczo";
}

function pasuje(typ, prefiks) {
  return typ === prefiks || typ.startsWith(prefiks + "/");
}

function zbudujKatalog() {
  stan.katalog = new Map(stan.kategorie.map((k) => [k.id, []]));
  for (const typ of wszystkie()) {
    const v = zmienne(typ);
    if (!v.icon && !typ.startsWith("/area")) continue;
    if (v.abstract_type === typ) continue;
    for (const k of stan.kategorie) {
      if (k.reguly.some((r) => pasuje(typ, r)) && !(k.wyklucz || []).some((r) => pasuje(typ, r))) {
        stan.katalog.get(k.id).push(typ);
        break;
      }
    }
  }
  for (const lista of stan.katalog.values()) lista.sort((a, b) => ileUzyc(b) - ileUzyc(a) || ladnaNazwa(a).localeCompare(ladnaNazwa(b)));
}

function rysujIkonke(canvas, typ) {
  const atom = { typ, zm: [] };
  const v = zmienne(typ);
  if (typ.startsWith("/area") && !v.icon) {
    const g = canvas.getContext("2d");
    g.fillStyle = kolorObszaru(typ).replace("0.28", "0.9");
    g.fillRect(0, 0, canvas.width, canvas.height);
    return Promise.resolve(true);
  }
  return ikona(v.icon).then(() => ikonkaTypu(canvas, atom));
}

function pokazKategorie() {
  const el = $("#kategorie");
  el.innerHTML = "";
  for (const k of stan.kategorie) {
    const b = document.createElement("button");
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    rysujIkonke(c, k.ikona);
    b.append(c, document.createTextNode(k.nazwa));
    b.dataset.id = k.id;
    b.onclick = () => wybierzKategorie(stan.kategoria === k.id ? null : k.id);
    el.append(b);
  }
}

function wybierzKategorie(id) {
  stan.kategoria = id;
  if (id) zdarzenie("kategoria", { id });
  stan.podgrupa = null;
  $("#szukaj").value = "";
  for (const b of document.querySelectorAll("#kategorie button")) b.classList.toggle("wlaczony", b.dataset.id === id);
  $("#siatka-panel").classList.toggle("ukryty", !id);
  if (id) pokazPrzyciski();
}

function podgrupaTypu(typ, kat) {
  const regula = kat.reguly.filter((r) => pasuje(typ, r)).sort((a, b) => b.length - a.length)[0] || "";
  const reszta = typ.slice(regula.length).split("/").filter(Boolean);
  return reszta[0] || regula.split("/").pop();
}

// ---------------------------------------------------------------- szablony

async function wczytajSzablony() {
  try { stan.szablony = await zrodlo.szablony(); } catch { stan.szablony = []; }
}

// Miniatura fragmentu mapy (szablonu) na canvasie.
async function rysujMiniature(canvas, s) {
  const pliki = new Set();
  for (const t of s.kafelki) for (const a of t.atomy) { const i = zmienneAtomu(a).icon; if (i) pliki.add(i); }
  await Promise.all([...pliki].map((p) => ikona(p)));
  const g = canvas.getContext("2d");
  g.imageSmoothingEnabled = false;
  const bok = Math.min(canvas.width / s.szer, canvas.height / s.wys);
  const ox = (canvas.width - bok * s.szer) / 2, oy = (canvas.height - bok * s.wys) / 2;
  const tymczasowy = document.createElement("canvas");
  tymczasowy.width = tymczasowy.height = 32;
  for (const t of s.kafelki) {
    const kolejne = t.atomy.filter((a) => !a.typ.startsWith("/area")).sort((a, b) => (+zmienneAtomu(a).layer || 0) - (+zmienneAtomu(b).layer || 0));
    for (const a of kolejne) {
      if (!ikonkaTypu(tymczasowy, a, false)) continue;
      g.drawImage(tymczasowy, ox + t.dx * bok, oy + (s.wys - 1 - t.dy) * bok, bok, bok);
    }
  }
}

function pokazSzablony() {
  const el = $("#przyciski");
  $("#podgrupy").innerHTML = "";
  el.innerHTML = "";
  const fraza = $("#szukaj").value.trim().toLowerCase();
  const lista = stan.szablony.filter((s) => s.nazwa.toLowerCase().includes(fraza));
  if (!lista.length) {
    el.innerHTML = `<div class="pusto">Brak szablonów. Skopiuj fragment mapy (C), a potem kliknij „Zapisz jako szablon” na dole.</div>`;
    return;
  }
  for (const s of lista) {
    const b = document.createElement("div");
    b.className = "projekt";
    if (stan.narzedzie?.rodzaj === "wklej" && stan.narzedzie.nazwa === s.nazwa) b.classList.add("wlaczony");
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const n = document.createElement("span");
    n.textContent = `${s.nazwa} (${s.szer}×${s.wys})`;
    const x = document.createElement("button");
    x.className = "usun-szablon";
    x.textContent = "✕";
    x.title = "Usuń szablon";
    x.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm(`Usunąć szablon „${s.nazwa}”?`)) return;
      await zrodlo.usunSzablon(s.plik);
      await wczytajSzablony();
      pokazSzablony();
    };
    b.title = s.nazwa;
    b.append(c, n, x);
    b.onclick = () => {
      stan.narzedzie = { rodzaj: "wklej", schowek: s, nazwa: s.nazwa };
      odswiezPrzyciskiNarzedzi();
      pokazSzablony();
    };
    rysujMiniature(c, s);
    el.append(b);
  }
}

async function zapiszSzablon() {
  const s = stan.schowek;
  if (!s) return;
  const nazwa = prompt("Nazwa szablonu:", "Pokój");
  if (!nazwa) return;
  const plik = nazwa.trim().replace(/[^\w\-ąćęłńóśźżĄĆĘŁŃÓŚŹŻ ]/g, "_").slice(0, 80) + ".json";
  try {
    await zrodlo.zapiszSzablon(plik, { nazwa: nazwa.trim(), szer: s.szer, wys: s.wys, kafelki: s.kafelki });
  } catch (e) { komunikat("Nie zapisano szablonu: " + e.message, true); return; }
  await wczytajSzablony();
  komunikat(`Zapisano szablon „${nazwa}”`);
  if (stan.kategoria === "szablony") pokazSzablony();
}

function pokazPrzyciski() {
  const kat = stan.kategorie.find((k) => k.id === stan.kategoria);
  if (!kat) return;
  $("#kat-nazwa").textContent = kat.nazwa;
  if (kat.id === "szablony") { pokazSzablony(); return; }
  const fraza = $("#szukaj").value.trim().toLowerCase();
  const wszystkieTypy = $("#wszystkie").checked;
  let lista = stan.katalog.get(kat.id) || [];
  if (!wszystkieTypy && !fraza) lista = lista.filter((t) => ileUzyc(t) > 0);
  if (fraza) lista = lista.filter((t) => t.toLowerCase().includes(fraza) || ladnaNazwa(t).toLowerCase().includes(fraza));

  // podgrupy z kolejnego członu ścieżki
  const grupy = new Map();
  for (const t of lista) { const g = podgrupaTypu(t, kat); grupy.set(g, (grupy.get(g) || 0) + 1); }
  const pg = $("#podgrupy");
  pg.innerHTML = "";
  if (grupy.size > 1 && grupy.size < 60) {
    const dodaj = (nazwa, wartosc) => {
      const b = document.createElement("button");
      b.textContent = nazwa;
      b.classList.toggle("wlaczony", stan.podgrupa === wartosc);
      b.onclick = () => { stan.podgrupa = wartosc; pokazPrzyciski(); };
      pg.append(b);
    };
    dodaj("wszystko", null);
    for (const [g, n] of [...grupy.entries()].sort((a, b) => b[1] - a[1])) dodaj(`${g.replace(/_/g, " ")} (${n})`, g);
  }
  if (stan.podgrupa) lista = lista.filter((t) => podgrupaTypu(t, kat) === stan.podgrupa);

  const el = $("#przyciski");
  el.innerHTML = "";
  if (!lista.length) {
    el.innerHTML = `<div class="pusto">Nic tu nie ma.${wszystkieTypy ? "" : " Zaznacz „wszystkie”, żeby zobaczyć typy nieużywane na mapach."}</div>`;
    return;
  }
  const MAKS = 600;
  for (const typ of lista.slice(0, MAKS)) {
    const b = document.createElement("div");
    b.className = "projekt";
    if (stan.narzedzie?.typ === typ) b.classList.add("wlaczony");
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const s = document.createElement("span");
    s.textContent = ladnaNazwa(typ);
    const v = zmienne(typ);
    b.title = `${ladnaNazwa(typ)}\n${typ}${v.desc && typeof v.desc === "string" ? "\n\n" + v.desc : ""}\n\nNa mapach: ${ileUzyc(typ)}×`;
    b.append(c, s);
    b.onclick = () => wybierzProjekt(typ);
    rysujIkonke(c, typ).then((ok) => { if (!ok && !typ.startsWith("/area")) b.remove(); });
    el.append(b);
  }
  if (lista.length > MAKS) el.insertAdjacentHTML("beforeend", `<div class="pusto">…i jeszcze ${lista.length - MAKS}. Zawęź wyszukiwanie.</div>`);
}

function wybierzProjekt(typ) {
  stan.narzedzie = { rodzaj: "buduj", typ, tryb: trybTypu(typ), scienny: jestScienny(typ) };
  if (typ.startsWith("/turf/closed")) stan.ostatnie.sciana = typ;
  else if (typ.startsWith("/turf/open/floor")) stan.ostatnie.podloga = typ;
  const domyslny = zmienne(typ).dir | 0 || 2;
  stan.kierunek = domyslny;
  for (const b of document.querySelectorAll(".projekt")) b.classList.toggle("wlaczony", b.querySelector("span").textContent === ladnaNazwa(typ) && b.title.includes("\n" + typ + "\n"));
  odswiezPrzyciskiNarzedzi();
  widok.rysuj();
}

function anulujNarzedzie() {
  stan.narzedzie = null;
  stan.przeciaganie = null;
  for (const b of document.querySelectorAll(".projekt.wlaczony")) b.classList.remove("wlaczony");
  pokazPodpowiedz(null);
  odswiezPrzyciskiNarzedzi();
  widok.rysuj();
}

function odswiezPrzyciskiNarzedzi() {
  const n = stan.narzedzie;
  $("#b-rozbiorka").classList.toggle("wlaczony", n?.rodzaj === "rozbiorka");
  $("#b-przenies").classList.toggle("wlaczony", n?.rodzaj === "przenies");
  $("#b-podloga").classList.toggle("wlaczony", n?.rodzaj === "podloga");
  $("#b-pokoj").classList.toggle("wlaczony", n?.rodzaj === "pokoj");
  $("#b-kopiuj").classList.toggle("wlaczony", n?.rodzaj === "kopiuj");
  $("#b-wklej").classList.toggle("wlaczony", n?.rodzaj === "wklej");
  $("#b-wskaz").classList.toggle("wlaczony", !n);
  $("#b-architekt").classList.toggle("wlaczony", !$("#architekt").classList.contains("ukryty"));
  plotno.style.cursor = n ? "crosshair" : "default";
}

// ---------------------------------------------------------------- mapa

// Zakładki: każda otwarta mapa ma własną historię, poziom, kamerę i znacznik zmian.
const biezacaKarta = () => stan.karty[stan.karta];

function zapamietajKarte() {
  const k = biezacaKarta();
  if (!k) return;
  k.wstecz = historia.wstecz;
  k.naprzod = historia.naprzod;
  k.zmiany = stan.zmiany;
  k.z = widok.z;
  k.kam = { ...widok.kam };
  k.wybrany = stan.wybrany;
}

function pokazKarte(k, nowa) {
  stan.mapa = k.mapa;
  historia.wstecz = k.wstecz;
  historia.naprzod = k.naprzod;
  stan.wybrany = k.wybrany;
  stan.edycjaZm = null;
  stan.przeciaganie = null;
  if (stan.narzedzie?.rodzaj === "przenies") stan.narzedzie = { rodzaj: "przenies" };
  widok.ustawMape(k.mapa);
  widok.z = Math.min(k.z, k.mapa.poziomy);
  if (nowa || !k.kam) wysrodkuj(); else Object.assign(widok.kam, k.kam);
  ustawZmiany(k.zmiany);
  odswiezTytul();
  pokazPoziomy();
  pokazInspekcje();
  pokazKarty();
  // wyniki szukania, zaznaczenie i kontrola dotyczą konkretnej mapy
  stan.zaznaczenie = null;
  zaplanujKontrole();
  if (!$("#szukaj-panel").classList.contains("ukryty")) szukaj();
  widok.rysuj();
}

function przelaczKarte(i) {
  if (i === stan.karta || !stan.karty[i]) return;
  zapamietajKarte();
  stan.karta = i;
  pokazKarte(stan.karty[i], false);
}

function dodajKarte(mapa) {
  zapamietajKarte();
  stan.karty.push({ mapa, wstecz: [], naprzod: [], zmiany: false, z: 1, kam: null, wybrany: null });
  stan.karta = stan.karty.length - 1;
  pokazKarte(biezacaKarta(), true);
}

function zamknijKarte(i) {
  zapamietajKarte();
  const k = stan.karty[i];
  if (k.zmiany && !confirm(`Mapa ${k.mapa.plik} ma niezapisane zmiany. Zamknąć bez zapisu?`)) return;
  stan.karty.splice(i, 1);
  if (!stan.karty.length) {
    stan.karta = -1;
    stan.mapa = null;
    widok.ustawMape(null);
    ustawZmiany(false);
    historia.wstecz = []; historia.naprzod = [];
    pokazKarty(); pokazPoziomy(); pokazInspekcje(); odswiezTytul();
    $("#b-otworz").click();
    return;
  }
  const bylaBiezaca = i === stan.karta;
  if (i < stan.karta) stan.karta--;
  else if (bylaBiezaca) stan.karta = Math.max(0, i - 1);
  if (bylaBiezaca) pokazKarte(biezacaKarta(), false);
  else pokazKarty();
}

function pokazKarty() {
  const el = $("#karty");
  el.innerHTML = "";
  el.classList.toggle("ukryty", !stan.karty.length);
  document.body.classList.toggle("z-kartami", stan.karty.length > 0);
  stan.karty.forEach((k, i) => {
    const b = document.createElement("div");
    b.className = "karta" + (i === stan.karta ? " wlaczony" : "");
    b.title = k.mapa.plik;
    const n = document.createElement("span");
    n.textContent = k.mapa.plik.split("/").pop() + ((i === stan.karta ? stan.zmiany : k.zmiany) ? " •" : "");
    const x = document.createElement("button");
    x.textContent = "✕";
    x.title = "Zamknij";
    x.onclick = (e) => { e.stopPropagation(); zamknijKarte(i); };
    b.append(n, x);
    b.onclick = () => przelaczKarte(i);
    b.onauxclick = (e) => { if (e.button === 1) zamknijKarte(i); };
    el.append(b);
  });
  const plus = document.createElement("button");
  plus.className = "karta-plus";
  plus.textContent = "+";
  plus.title = "Otwórz albo utwórz mapę";
  plus.onclick = () => $("#b-otworz").click();
  el.append(plus);
}

function odswiezTytul() {
  const m = stan.mapa;
  $("#nazwa-mapy").textContent = m ? `${zrodlo.nazwa}: ${m.plik} — ${m.szer}×${m.wys}, poziomów: ${m.poziomy}` : "nie wczytano mapy";
}

// Wczytuje wszystkie ikony użyte w mapie, żeby obraz nie „doskakiwał”.
async function wczytajIkonyMapy(mapa) {
  const pliki = new Set();
  for (const p of mapa.prefaby) for (const a of p.atomy) { const i = zmienneAtomu(a).icon; if (i) pliki.add(i); }
  let gotowe = 0;
  await Promise.all([...pliki].map((p) => ikona(p).then(() => { gotowe++; if (gotowe % 20 === 0) ladowanie(`Ikony: ${gotowe}/${pliki.size}`); })));
}

async function otworzMape(plik) {
  const jest = stan.karty.findIndex((k) => k.mapa.plik === plik);
  if (jest >= 0) { przelaczKarte(jest); return; }
  ladowanie("Wczytuję " + plik + "…");
  try {
    const tekst = await zrodlo.tekst(plik);
    const kopia = await idbPobierz(kluczKopii(plik));
    if (tekst === null && !kopia) throw new Error(t("nie ma pliku") + " " + plik);
    const zPliku = tekst !== null ? Mapa.parsuj(tekst, plik) : null;
    let mapa = zPliku;
    let przywrocona = false;
    if (kopia && kopia.tekst !== tekst) {
      ladowanie(null);
      const czas = new Date(kopia.czas).toLocaleString();
      const tak = await dialog(t("Kopia robocza"), `${t("Ta mapa ma niezapisane zmiany z")} <b>${czas}</b>. ${t("Przywrócić je? „Anuluj” otworzy plik i usunie kopię.")}`, [], t("Przywróć"));
      if (tak) { mapa = Mapa.parsuj(kopia.tekst, plik); mapa.nowa = kopia.nowa; przywrocona = true; }
      else { idbUsun(kluczKopii(plik)); if (!zPliku) return; }
      ladowanie(t("Wczytuję") + " " + plik + "…");
    }
    if (zPliku) zrzutMapy(mapa, zPliku);
    await wczytajIkonyMapy(mapa);
    dodajKarte(mapa);
    if (przywrocona) ustawZmiany(true);
    try { localStorage.setItem("ostatnia-mapa:" + zrodlo.nazwa, plik); } catch {}
  } catch (e) {
    komunikat("Nie udało się wczytać mapy: " + e.message, true);
    console.error(e);
  } finally {
    ladowanie(null);
  }
}

function wysrodkuj() {
  const m = stan.mapa;
  const r = plotno.getBoundingClientRect();
  // Szukam środka zajętej części mapy (bez pustego kosmosu na brzegach).
  let x0 = m.szer, x1 = 1, y0 = m.wys, y1 = 1;
  const s = m.siatki[widok.z - 1];
  for (let y = 1; y <= m.wys; y++) for (let x = 1; x <= m.szer; x++) {
    const p = m.prefaby[s[(y - 1) * m.szer + x - 1]];
    if (p && p.atomy.some((a) => a.typ.startsWith("/turf") && !a.typ.startsWith("/turf/open/space"))) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < x0) { x0 = 1; x1 = m.szer; y0 = 1; y1 = m.wys; }
  const zoom = Math.max(6, Math.min(32, Math.min(r.width / (x1 - x0 + 4), r.height / (y1 - y0 + 4))));
  widok.kam.zoom = ZOOMY.reduce((a, b) => (Math.abs(b - zoom) < Math.abs(a - zoom) ? b : a));
  widok.kam.x = (x0 + x1) / 2 - 1 - r.width / widok.kam.zoom / 2;
  widok.kam.y = m.wys - (y0 + y1) / 2 - r.height / widok.kam.zoom / 2;
  widok.rysuj();
}

function pokazPoziomy() {
  const el = $("#poziomy");
  el.innerHTML = "";
  if (!stan.mapa) return;
  for (let z = 1; z <= stan.mapa.poziomy; z++) {
    const b = document.createElement("button");
    b.textContent = "Poziom " + z;
    b.classList.toggle("wlaczony", z === widok.z);
    b.onclick = () => ustawPoziom(z);
    el.append(b);
  }
}
function ustawPoziom(z) {
  if (!stan.mapa || z < 1 || z > stan.mapa.poziomy) return;
  widok.z = z;
  stan.wybrany = null;
  pokazPoziomy();
  pokazInspekcje();
  widok.rysuj();
}

function ustawZmiany(v) {
  const bylo = stan.zmiany;
  stan.zmiany = v;
  const k = biezacaKarta();
  if (k) k.zmiany = v;
  $("#b-zapisz").classList.toggle("zmiany", v);
  if (bylo !== v) pokazKarty();
  if (v) { zaplanujKontrole(); zaplanujKopie(); }
}

// Po zapisie w trybie GitHub: plik się pobrał, teraz trzeba go wgrać (GitHub sam zrobi fork i PR).
function pokazWgranie(plik) {
  $("#wgranie-plik").textContent = plik.split("/").pop();
  $("#wgranie-sciezka").textContent = plik;
  $("#wgranie-link").href = zrodlo.linkWgrania(plik);
  $("#okno-wgranie").classList.remove("ukryty");
}
$("#wgranie-zamknij").onclick = () => $("#okno-wgranie").classList.add("ukryty");

// ---------------------------------------------------------------- kopie robocze w przeglądarce
// Każda zmiana zapisuje się po chwili w IndexedDB – po odświeżeniu strony albo awarii
// edytor zaproponuje przywrócenie. Kopia znika po prawdziwym zapisie.

const kluczKopii = (plik) => `robocza:${zrodlo.nazwa}:${plik}`;
let czasKopii = null;
function zaplanujKopie() {
  clearTimeout(czasKopii);
  const mapa = stan.mapa;
  if (!mapa) return;
  czasKopii = setTimeout(() => {
    if (!stan.karty.some((k) => k.mapa === mapa && (k === biezacaKarta() ? stan.zmiany : k.zmiany))) return;
    idbZapisz(kluczKopii(mapa.plik), { plik: mapa.plik, tekst: mapa.zapisz(), czas: Date.now(), nowa: !!mapa.nowa });
    $("#stan-kopii").textContent = t("kopia robocza zapisana") + " " + new Date().toLocaleTimeString().slice(0, 5);
  }, 2500);
}

// Stan mapy z pliku (podpisy kafelków) – do liczenia, ile się zmieniło przed zapisem.
function zrzutMapy(m, zrodlowa = m) {
  m.zapisane = { szer: zrodlowa.szer, wys: zrodlowa.wys, poziomy: zrodlowa.poziomy, siatki: zrodlowa.siatki.map((s) => Array.from(s, (i) => zrodlowa.prefaby[i]?.podpis)) };
}
function zmienioneKafelki(m) {
  const z = m.zapisane;
  if (!z) return null;
  if (z.szer !== m.szer || z.wys !== m.wys || z.poziomy !== m.poziomy) return -1;
  let n = 0;
  m.siatki.forEach((s, i) => { const a = z.siatki[i]; for (let k = 0; k < s.length; k++) if (m.prefaby[s[k]]?.podpis !== a[k]) n++; });
  return n;
}

async function zapisz() {
  if (!stan.mapa) return;
  // potwierdzenie z podsumowaniem: ile się zmieniło, dokąd idzie zapis, co mówi kontrola
  const m = stan.mapa;
  const ile = zmienioneKafelki(m);
  const wagi = liczWagi();
  const dokad = { folder: t("prosto do pliku w Twoim folderze repo"), serwer: t("prosto do pliku w repo (serwer lokalny)"), github: t("pobierze plik .dmm do wgrania na GitHuba"), pliki: t("pobierze plik .dmm do podmiany w repo") }[zrodlo.rodzaj];
  const opis = `<b>${m.plik}</b><br>${t("Zapis")}: ${dokad}.<br>` +
    (ile === -1 ? t("Zmieniono rozmiar albo liczbę poziomów mapy.") : ile === null ? "" : `${t("Zmienione kafelki")}: <b>${ile}</b>.`) +
    (wagi.blad ? `<div class="start-blad">⛔ ${t("Kontrola mapy zgłasza błędy")}: ${wagi.blad}. ${t("Mapa może się nie skompilować albo coś nie zadziała – sprawdź panel Kontrola.")}</div>` : "") +
    (!wagi.blad && wagi.ostrzezenie ? `<p class="przygaszone">⚠ ${t("Ostrzeżenia kontroli")}: ${wagi.ostrzezenie}.</p>` : "");
  if (!(await dialog(t("Zapisać mapę?"), opis, [], t("Zapisz")))) return;
  ladowanie(t("Zapisuję…"));
  try {
    const tekst = stan.mapa.zapisz();
    const jak = await zrodlo.zapisz(stan.mapa.plik, tekst);
    ustawZmiany(false);
    zrzutMapy(m);
    clearTimeout(czasKopii);
    idbUsun(kluczKopii(m.plik));
    $("#stan-kopii").textContent = "";
    if (jak === "github") pokazWgranie(stan.mapa.plik);
    else if (jak === "pobrano") komunikat(`Pobrano ${stan.mapa.plik.split("/").pop()} – podmień nim plik ${stan.mapa.plik} w repo (ta przeglądarka nie zapisuje prosto na dysk).`);
    else komunikat("✓ " + t("Zapisano") + " " + stan.mapa.plik);
    zdarzenie("zapisz");
  } catch (e) {
    komunikat("Zapis nie powiódł się: " + e.message, true);
  } finally {
    ladowanie(null);
  }
}

// ---------------------------------------------------------------- edycja

const kluczPola = (x, y) => x + "," + y;

function zmienKafelek(x, y, noweAtomy, z = widok.z) {
  const m = stan.mapa;
  const przed = m.prefab(x, y, z);
  const po = m.dodajPrefab(noweAtomy);
  if (przed === po) return;
  m.ustaw(x, y, z, po);
  historia.zmiana(z + ":" + x + ":" + y, przed, po);
  if (z === widok.z) widok.uniewaznij(x, y);
}

function zastosujHistorie(wpis, kierunek) {
  const m = stan.mapa;
  for (const [k, e] of wpis) {
    const [z, x, y] = k.split(":").map(Number);
    m.ustaw(x, y, z, kierunek < 0 ? e.przed : e.po);
    if (z === widok.z) widok.uniewaznij(x, y);
  }
  ustawZmiany(true);
  pokazInspekcje();
  widok.rysuj();
}
function cofnij() {
  const w = historia.wstecz.pop();
  if (!w) return;
  historia.naprzod.push(w);
  zastosujHistorie(w, -1);
  zdarzenie("cofnij");
}
function ponow() {
  const w = historia.naprzod.pop();
  if (!w) return;
  historia.wstecz.push(w);
  zastosujHistorie(w, 1);
}

// Kafelki objęte przeciągnięciem zależnie od trybu.
function polaPrzeciagniecia(start, kon, tryb) {
  const pola = [];
  const x0 = Math.min(start.x, kon.x), x1 = Math.max(start.x, kon.x);
  const y0 = Math.min(start.y, kon.y), y1 = Math.max(start.y, kon.y);
  if (tryb === "prostokat") {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) pola.push({ x, y });
  } else if (tryb === "obrys") {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++)
      if (x === x0 || x === x1 || y === y0 || y === y1) pola.push({ x, y });
  } else if (tryb === "linia") {
    // najpierw w dłuższym kierunku, potem skręt
    const poziomo = Math.abs(kon.x - start.x) >= Math.abs(kon.y - start.y);
    const rog = poziomo ? { x: kon.x, y: start.y } : { x: start.x, y: kon.y };
    const odcinek = (a, b) => {
      const dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y);
      let p = { ...a };
      pola.push({ ...p });
      while (p.x !== b.x || p.y !== b.y) { p = { x: p.x + dx, y: p.y + dy }; pola.push({ ...p }); }
    };
    odcinek(start, rog);
    if (rog.x !== kon.x || rog.y !== kon.y) { pola.pop(); odcinek(rog, kon); }
  } else {
    pola.push({ ...kon });
  }
  return pola.filter((p) => stan.mapa.wewnatrz(p.x, p.y));
}

function biezacePola() {
  const n = stan.narzedzie;
  if (!stan.mapa || !stan.kursor) return [];
  const tryb = n?.rodzaj === "buduj" ? n.tryb : "prostokat";
  const p = stan.przeciaganie;
  if (!p) return stan.mapa.wewnatrz(stan.kursor.x, stan.kursor.y) ? [stan.kursor] : [];
  if (tryb === "pojedynczo") return [...p.pola.values()];
  return polaPrzeciagniecia(p.start, stan.kursor, tryb);
}

// Co dokładnie stanie na których polach (z autołączeniem kabli i rur).
function projekt() {
  const n = stan.narzedzie;
  if (n?.rodzaj === "wklej") return polaWklejania(n.schowek);
  if (n?.rodzaj === "przenies" && n.chwyt) return polaPrzenoszenia(n.chwyt);
  const pola = biezacePola();
  if (n?.rodzaj === "pokoj") {
    if (!stan.kursor) return [];
    const p = stan.przeciaganie;
    const s0 = p ? p.start : stan.kursor;
    const x0 = Math.min(s0.x, stan.kursor.x), x1 = Math.max(s0.x, stan.kursor.x);
    const y0 = Math.min(s0.y, stan.kursor.y), y1 = Math.max(s0.y, stan.kursor.y);
    return pola.map((q) => {
      const brzeg = q.x === x0 || q.x === x1 || q.y === y0 || q.y === y1;
      return { ...q, atom: nowyAtom(brzeg ? stan.ostatnie.sciana : stan.ostatnie.podloga, 2) };
    });
  }
  if (!n || n.rodzaj !== "buduj") return pola;
  if (n.scienny) {
    // jeden obiekt na klik, przyciągnięty do ściany najbliższej kursorowi
    const k = stan.przeciaganie ? stan.przeciaganie.start : stan.kursor;
    const u = stan.przeciaganie?.ulamek || stan.ulamek || { fx: 0.5, fy: 0.5 };
    const s = przyciagnij(stan.mapa, widok.z, k, u.fx, u.fy);
    if (!s) return stan.mapa.wewnatrz(k.x, k.y) ? [{ ...k, atom: nowyAtom(n.typ, stan.kierunek), bezSciany: true }] : [];
    return [{ x: s.x, y: s.y, atom: atomNaScianie(n.typ, s.d) }];
  }
  if (laczySie(n.typ) && (n.tryb === "linia" || !stan.przeciaganie)) {
    const atomy = autolacz(stan.mapa, widok.z, pola, n.typ, stan.kierunek);
    return pola.map((p, i) => ({ ...p, atom: atomy[i] }));
  }
  return pola.map((p) => ({ ...p, atom: nowyAtom(n.typ, stan.kierunek) }));
}

// ---------------------------------------------------------------- schowek

const jestObszarem = (a) => a.typ.startsWith("/area");
// Kafelek z samym kosmosem nie nadpisuje celu – kształt pokoju wkleja się czysto.
const pustyKosmos = (atomy) => atomy.every((a) => jestObszarem(a) || a.typ.startsWith("/turf/open/space"));

function kopiuj(pola) {
  if (!pola.length) return null;
  const x0 = Math.min(...pola.map((p) => p.x)), y0 = Math.min(...pola.map((p) => p.y));
  const x1 = Math.max(...pola.map((p) => p.x)), y1 = Math.max(...pola.map((p) => p.y));
  const kafelki = [];
  for (const { x, y } of pola) {
    const atomy = stan.mapa.atomy(x, y, widok.z);
    if (!atomy.length || pustyKosmos(atomy)) continue;
    kafelki.push({ dx: x - x0, dy: y - y0, atomy: atomy.map((a) => ({ typ: a.typ, zm: a.zm.map((e) => [...e]) })) });
  }
  return { szer: x1 - x0 + 1, wys: y1 - y0 + 1, kafelki };
}

function polaWklejania(schowek) {
  const k = stan.kursor;
  if (!k || !schowek) return [];
  // kursor = lewy górny róg wklejanego fragmentu
  return schowek.kafelki
    .map((t) => ({ x: k.x + t.dx, y: k.y - (schowek.wys - 1) + t.dy, atomy: t.atomy }))
    .filter((p) => stan.mapa.wewnatrz(p.x, p.y));
}

function ustawSchowek(s) {
  stan.schowek = s;
  $("#b-wklej").disabled = !s;
  $("#b-zapisz-szablon").disabled = !s;
}

// Przenoszony fragment trzymany za punkt, w którym puszczono mysz przy zaznaczaniu.
function polaPrzenoszenia(c) {
  const k = stan.kursor;
  if (!k) return [];
  return c.schowek.kafelki
    .map((t) => ({ x: k.x - c.ux + t.dx, y: k.y - c.uy + t.dy, atomy: t.atomy }))
    .filter((p) => stan.mapa.wewnatrz(p.x, p.y));
}

const KOSMOS = "/turf/open/space/basic";
const naKosmos = (atomy) => {
  const obszar = atomy.find(jestObszarem);
  return [{ typ: KOSMOS, zm: [] }, obszar || { typ: "/area/space", zm: [] }];
};

function wklejNa(atomyCelu, atomySchowka) {
  const obszarCelu = atomyCelu.find(jestObszarem);
  const reszta = atomySchowka.filter((a) => !jestObszarem(a));
  const obszar = obszarCelu || atomySchowka.find(jestObszarem);
  return obszar ? [...reszta, obszar] : reszta;
}

function wykonaj() {
  const n = stan.narzedzie;
  const pola = projekt();
  if (n.rodzaj === "zaznacz") {
    if (!pola.length) return;
    const xs = pola.map((p) => p.x), ys = pola.map((p) => p.y);
    stan.zaznaczenie = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), z: widok.z };
    anulujNarzedzie();
    $("#sz-zakres").value = "zaznaczenie";
    przelaczSzukanie(true);
    szukaj();
    return;
  }
  if (n.rodzaj === "kopiuj") {
    const s = kopiuj(pola);
    if (!s || !s.kafelki.length) { komunikat("Nic do skopiowania"); return; }
    ustawSchowek(s);
    stan.narzedzie = { rodzaj: "wklej", schowek: s };
    odswiezPrzyciskiNarzedzi();
    komunikat(`Skopiowano ${s.szer}×${s.wys}. Kliknij, żeby wkleić (PPM kończy).`);
    zdarzenie("kopiuj");
    return;
  }
  if (n.rodzaj === "przenies") {
    if (!n.chwyt) {
      // pierwszy krok: zaznaczenie i „podniesienie”
      const s = kopiuj(pola);
      if (!s || !s.kafelki.length) { komunikat("Nic do przeniesienia"); return; }
      const x0 = Math.min(...pola.map((p) => p.x)), y0 = Math.min(...pola.map((p) => p.y));
      n.chwyt = { schowek: s, x0, y0, ux: stan.kursor.x - x0, uy: stan.kursor.y - y0 };
      komunikat("Podniesiono fragment. Kliknij w nowe miejsce, Q/E obraca, PPM anuluje.");
      widok.rysuj();
      return;
    }
    // drugi krok: źródło staje się kosmosem, fragment ląduje pod kursorem (razem z obszarami)
    const c = n.chwyt;
    historia.zacznij();
    for (const t of (c.zrodlo || c.schowek).kafelki) {
      const x = c.x0 + t.dx, y = c.y0 + t.dy;
      zmienKafelek(x, y, [{ typ: KOSMOS, zm: [] }, { typ: "/area/space", zm: [] }]);
    }
    for (const { x, y, atomy: wklejane } of pola) {
      const obszar = wklejane.find(jestObszarem) || stan.mapa.atomy(x, y, widok.z).find(jestObszarem);
      zmienKafelek(x, y, [...wklejane.filter((a) => !jestObszarem(a)), ...(obszar ? [obszar] : [])]);
    }
    if (historia.biezaca?.size) ustawZmiany(true);
    historia.zakoncz();
    stan.narzedzie = { rodzaj: "przenies" };
    zdarzenie("przenies");
    pokazInspekcje();
    widok.rysuj();
    return;
  }
  const calkiem = n.rodzaj === "rozbiorka" && stan.przeciaganie?.shift;
  historia.zacznij();
  for (const { x, y, atom, atomy: wklejane } of pola) {
    const atomy = stan.mapa.atomy(x, y, widok.z);
    let nowe = null;
    if (calkiem) nowe = naKosmos(atomy);
    else if (n.rodzaj === "rozbiorka") nowe = poRozbiorce(atomy);
    else if (n.rodzaj === "podloga") {
      // tylko podłoga (nie ściany i nie kosmos) – obiekty i obszar zostają
      const turf = atomy.find((a) => a.typ.startsWith("/turf"));
      if (!turf || !turf.typ.startsWith("/turf/open") || turf.typ.startsWith("/turf/open/space")) continue;
      nowe = atomy.map((a) => (a === turf ? { typ: KOSMOS, zm: [] } : a));
    }
    else if (n.rodzaj === "wklej") nowe = wklejNa(atomy, wklejane);
    else {
      if (!mozna(atomy, atom)) continue;
      nowe = poPostawieniu(atomy, atom);
    }
    if (nowe) zmienKafelek(x, y, nowe);
  }
  const ile = historia.biezaca?.size || 0;
  if (ile) ustawZmiany(true);
  historia.zakoncz();
  if (ile) zdarzenie(calkiem ? "wyczysc" : n.rodzaj, { typ: n.typ, ile, kierunek: stan.kierunek, scienny: n.scienny });
  pokazInspekcje();
  widok.rysuj();
}

// ---------------------------------------------------------------- nakładki

widok.nakladki.push((g, w) => {
  const m = stan.mapa;
  if (!m) return;
  const z = w.kam.zoom;
  if (stan.siatka && z >= 12) {
    g.strokeStyle = "rgba(255,255,255,0.07)";
    g.lineWidth = 1;
    g.beginPath();
    const r = plotno.getBoundingClientRect();
    const k0 = Math.max(0, Math.floor(w.kam.x)), k1 = Math.min(m.szer, Math.ceil(w.kam.x + r.width / z));
    const w0 = Math.max(0, Math.floor(w.kam.y)), w1 = Math.min(m.wys, Math.ceil(w.kam.y + r.height / z));
    for (let k = k0; k <= k1; k++) { const x = Math.round((k - w.kam.x) * z) + 0.5; g.moveTo(x, (w0 - w.kam.y) * z); g.lineTo(x, (w1 - w.kam.y) * z); }
    for (let r2 = w0; r2 <= w1; r2++) { const y = Math.round((r2 - w.kam.y) * z) + 0.5; g.moveTo((k0 - w.kam.x) * z, y); g.lineTo((k1 - w.kam.x) * z, y); }
    g.stroke();
  }
  // wyniki szukania na bieżącym poziomie
  const znalezione = wynikiSzukania();
  if (znalezione.length) {
    g.strokeStyle = "#e0c050";
    g.fillStyle = "rgba(224,192,80,0.18)";
    g.lineWidth = Math.max(1, z / 16);
    for (const r of znalezione) {
      if (r.z !== w.z) continue;
      const p = w.naEkran(r.x, r.y);
      g.fillRect(p.sx, p.sy, z, z);
      g.strokeRect(p.sx + 0.5, p.sy + 0.5, z - 1, z - 1);
    }
  }
  const zaz = stan.zaznaczenie;
  if (zaz && zaz.z === w.z) {
    const p = w.naEkran(zaz.x0, zaz.y1);
    g.save();
    g.setLineDash([6, 4]);
    g.strokeStyle = "#7fb0ff";
    g.lineWidth = 2;
    g.strokeRect(p.sx + 1, p.sy + 1, (zaz.x1 - zaz.x0 + 1) * z - 2, (zaz.y1 - zaz.y0 + 1) * z - 2);
    g.restore();
  }
  if (stan.wybrany) {
    const p = w.naEkran(stan.wybrany.x, stan.wybrany.y);
    g.strokeStyle = "#c7a846";
    g.lineWidth = 2;
    g.strokeRect(p.sx + 1, p.sy + 1, z - 2, z - 2);
  }
  const n = stan.narzedzie;
  const pola = projekt();
  if (!n && stan.chwyt?.aktywny) {
    // przeciąganie obiektu: skąd (przerywana ramka) i gdzie wyląduje (podgląd)
    const ch = stan.chwyt;
    const zp = w.naEkran(ch.x, ch.y);
    if (ch.piksele) {
      // podgląd przesunięcia w pikselach na tym samym kafelku
      if (ch.nowe) {
        const zm = ch.atom.zm.filter(([k]) => k !== "pixel_x" && k !== "pixel_y").concat([["pixel_x", String(ch.nowe.x)], ["pixel_y", String(ch.nowe.y)]]);
        w.rysujAtom(g, { typ: ch.atom.typ, zm }, ch.x, ch.y, 0.85);
      }
      g.strokeStyle = "#7fb0ff"; g.lineWidth = 1;
      g.strokeRect(zp.sx + 0.5, zp.sy + 0.5, z - 1, z - 1);
      return;
    }
    g.save(); g.setLineDash([5, 4]); g.strokeStyle = "#c7a846"; g.lineWidth = 2;
    g.strokeRect(zp.sx + 1, zp.sy + 1, z - 2, z - 2); g.restore();
    const cel = celPrzeniesienia(ch.atom, stan.kursor, stan.ulamek);
    if (cel) {
      const naCelu = cel.x === ch.x && cel.y === ch.y ? m.atomy(ch.x, ch.y, w.z).filter((_, i) => i !== ch.indeks) : m.atomy(cel.x, cel.y, w.z);
      const p = w.naEkran(cel.x, cel.y);
      w.rysujAtom(g, cel.atom, cel.x, cel.y, 0.75);
      g.fillStyle = mozna(naCelu, cel.atom) ? "rgba(87,160,90,0.22)" : "rgba(192,69,58,0.45)";
      g.fillRect(p.sx, p.sy, z, z);
    }
    return;
  }
  if (!n) {
    if (stan.kursor && m.wewnatrz(stan.kursor.x, stan.kursor.y)) {
      const p = w.naEkran(stan.kursor.x, stan.kursor.y);
      g.strokeStyle = "rgba(255,255,255,0.5)";
      g.lineWidth = 1;
      g.strokeRect(p.sx + 0.5, p.sy + 0.5, z - 1, z - 1);
    }
    return;
  }
  if (n.rodzaj === "przenies" && n.chwyt) {
    // miejsce, z którego fragment zniknie
    g.fillStyle = "rgba(10,12,14,0.6)";
    for (const t of (n.chwyt.zrodlo || n.chwyt.schowek).kafelki) {
      const p = w.naEkran(n.chwyt.x0 + t.dx, n.chwyt.y0 + t.dy);
      g.fillRect(p.sx, p.sy, z, z);
    }
  }
  for (const { x, y, atom, atomy: wklejane } of pola) {
    const p = w.naEkran(x, y);
    if (n.rodzaj === "rozbiorka" || n.rodzaj === "kopiuj" || n.rodzaj === "podloga" || n.rodzaj === "zaznacz" || (n.rodzaj === "przenies" && !n.chwyt)) {
      const shift = n.rodzaj === "rozbiorka" && (stan.przeciaganie ? stan.przeciaganie.shift : ostatniaMysz?.shiftKey);
      g.fillStyle = n.rodzaj === "kopiuj" || n.rodzaj === "przenies" || n.rodzaj === "zaznacz" ? "rgba(80,140,220,0.3)"
        : n.rodzaj === "podloga" ? "rgba(220,150,50,0.35)" : shift ? "rgba(120,20,20,0.6)" : "rgba(192,69,58,0.35)";
      g.fillRect(p.sx, p.sy, z, z);
      continue;
    }
    if (n.rodzaj === "wklej" || n.rodzaj === "przenies") {
      const kolejne = [...wklejane].filter((a) => !jestObszarem(a)).sort((a, b) => (+zmienneAtomu(a).layer || 0) - (+zmienneAtomu(b).layer || 0));
      for (const a of kolejne) w.rysujAtom(g, a, x, y, 0.7);
      g.fillStyle = "rgba(80,140,220,0.15)";
      g.fillRect(p.sx, p.sy, z, z);
      continue;
    }
    const ok = mozna(m.atomy(x, y, w.z), atom);
    if (atom.typ.startsWith("/area")) {
      g.fillStyle = kolorObszaru(n.typ).replace("0.28", "0.45");
      g.fillRect(p.sx, p.sy, z, z);
    } else {
      w.rysujAtom(g, atom, x, y, 0.65);
    }
    g.fillStyle = ok ? "rgba(87,160,90,0.18)" : "rgba(192,69,58,0.45)";
    g.fillRect(p.sx, p.sy, z, z);
  }
});

// ---------------------------------------------------------------- informacje

function pokazInfo() {
  const el = $("#info");
  const m = stan.mapa;
  const k = stan.kursor;
  if (!m || !k || !m.wewnatrz(k.x, k.y)) { el.classList.add("ukryty"); return; }
  const atomy = m.atomy(k.x, k.y, widok.z);
  const obszar = atomy.find((a) => a.typ.startsWith("/area"));
  const turf = atomy.find((a) => a.typ.startsWith("/turf"));
  const reszta = atomy.filter((a) => a !== obszar && a !== turf);
  el.innerHTML = "";
  const t = document.createElement("div");
  t.className = "tytul";
  t.textContent = `(${k.x}, ${k.y}, ${widok.z})  ${obszar ? ladnaNazwa(obszar.typ) : "bez obszaru"}`;
  el.append(t);
  const linia = (s) => { const d = document.createElement("div"); d.className = "linia"; d.textContent = s; el.append(d); };
  if (turf) linia(ladnaNazwa(turf.typ));
  for (const a of reszta.slice(0, 8)) linia("• " + ladnaNazwa(a.typ));
  if (reszta.length > 8) linia(`…i ${reszta.length - 8} więcej`);
  el.classList.remove("ukryty");
}

function pokazInspekcje() {
  const el = $("#inspekcja");
  const m = stan.mapa;
  const w = stan.wybrany;
  if (!m || !w) { el.classList.add("ukryty"); return; }
  const atomy = m.atomy(w.x, w.y, widok.z);
  el.innerHTML = `<div class="pasek-inspekcji"><span class="naglowek">${t("Kafelek")} (${w.x}, ${w.y}, ${widok.z})</span><button class="zamknij-inspekcje" title="${t("Zamknij")}">✕</button></div>
    <div class="przygaszone male">${t("Kliknij obiekt, żeby go wybrać. Przeciągnij na mapie albo Alt+strzałki – o kafelek, Alt+Shift+strzałki albo Ctrl+przeciąganie – o piksele.")}</div>`;
  el.querySelector(".zamknij-inspekcje").onclick = () => { stan.wybrany = null; stan.wybranyAtom = null; pokazInspekcje(); widok.rysuj(); };
  for (const p of kontrola.naKafelku.get(widok.z + ":" + w.x + ":" + w.y) || []) {
    const d = document.createElement("div");
    const def = SPRAWDZENIA[p.kod];
    d.className = "problem-kafelka waga-" + def.waga;
    d.textContent = `${IKONA_WAGI[def.waga]} ${def.tytul}${p.typ ? ": " + ladnaNazwa(p.typ) : ""}`;
    d.title = def.porada;
    el.append(d);
  }
  atomy.forEach((a, i) => {
    const r = document.createElement("div");
    r.className = "wiersz";
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    if (a.typ.startsWith("/area")) {
      const g = c.getContext("2d"); g.fillStyle = kolorObszaru(a.typ).replace("0.28", "0.9"); g.fillRect(0, 0, 32, 32);
    } else {
      ikona(zmienneAtomu(a).icon).then(() => ikonkaTypu(c, a));
    }
    const opis = document.createElement("div");
    opis.className = "opis";
    const edycje = a.zm.map(([k, v]) => `${k} = ${v}`).join("; ");
    opis.innerHTML = `<div></div><div class="sciezka"></div>`;
    opis.children[0].textContent = ladnaNazwa(a.typ);
    opis.children[1].textContent = a.typ + (edycje ? "  {" + edycje + "}" : "");
    opis.title = a.typ + (edycje ? "\n" + edycje : "");
    r.append(c, opis);
    const przycisk = (tekst, tytul, fn) => { const b = document.createElement("button"); b.textContent = tekst; b.title = t(tytul); b.onclick = (e) => { e.stopPropagation(); fn(); }; r.append(b); };
    const zmien = (nowe) => { if (!nowe) return; historia.zacznij(); zmienKafelek(w.x, w.y, nowe); historia.zakoncz(); ustawZmiany(true); pokazInspekcje(); widok.rysuj(); };
    const rk = korzen(a.typ);
    if (ruchomy(a)) {
      // wybór obiektu do przesuwania
      r.classList.add("wybieralny");
      if (stan.wybranyAtom === i || (stan.wybranyAtom == null && obiektDoZlapania(w.x, w.y) === i)) r.classList.add("wybrany-atom");
      r.onclick = () => { stan.wybranyAtom = i; pokazInspekcje(); };
    }
    if (rk === "obj" || rk === "mob") {
      przycisk("⟲", "Obróć w lewo", () => zmien(obrocony(atomy, i, -1)));
      przycisk("⟳", "Obróć w prawo", () => zmien(obrocony(atomy, i, 1)));
    }
    przycisk("⧉", "Buduj tym (pipeta)", () => { wybierzProjekt(a.typ); if (rk !== "area" && rk !== "turf") stan.kierunek = kierunekZAtomu(a); });
    if (rk !== "area") przycisk("✎", "Edytuj zmienne", () => { stan.edycjaZm = stan.edycjaZm === i ? null : i; pokazInspekcje(); });
    if (rk !== "area") przycisk("✕", rk === "turf" ? "Zamień na poszycie" : "Usuń", () => zmien(bezAtomu(atomy, i)));
    el.append(r);
    if (r.classList.contains("wybrany-atom")) el.append(sterowaniePrzesunieciem(w.x, w.y, i, a));
    if (stan.edycjaZm === i) el.append(formularzZmiennych(a, (zm) => {
      stan.edycjaZm = null;
      zmien(atomy.map((x, k) => (k === i ? { typ: a.typ, zm } : x)));
      zdarzenie("zmienne");
    }));
  });
  el.classList.remove("ukryty");
}

// ---------------------------------------------------------------- przesunięcie w pikselach

const pikseleAtomu = (a) => { const v = zmienneAtomu(a); return { x: +v.pixel_x || 0, y: +v.pixel_y || 0 }; };

// Ustawia pixel_x/pixel_y (edycja znika, jeśli wartość wraca do tej z kodu).
function ustawPiksele(x, y, indeks, px, py) {
  const atomy = stan.mapa.atomy(x, y, widok.z);
  const a = atomy[indeks];
  if (!ruchomy(a)) return;
  const dom = zmienne(a.typ);
  let zm = a.zm.filter(([k]) => k !== "pixel_x" && k !== "pixel_y");
  if (px !== (+dom.pixel_x || 0)) zm.push(["pixel_x", String(px)]);
  if (py !== (+dom.pixel_y || 0)) zm.push(["pixel_y", String(py)]);
  zm = zm.sort((p, q) => (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : 0));
  const nowe = atomy.map((b, i) => (i === indeks ? { typ: a.typ, zm } : b));
  historia.zacznij();
  zmienKafelek(x, y, nowe);
  historia.zakoncz();
  ustawZmiany(true);
  stan.wybranyAtom = indeks;
  zdarzenie("piksele");
  pokazInspekcje();
  widok.rysuj();
}

// Pasek pod wybranym obiektem: przesuwanie o kafelek i o piksele.
function sterowaniePrzesunieciem(x, y, indeks, a) {
  const d = document.createElement("div");
  d.className = "przesuniecie";
  const p = pikseleAtomu(a);
  d.innerHTML = `<span class="przygaszone">${t("Kafelek")}:</span>
    <button data-k="8" title="${t("W lewo o kafelek")}">◀</button><button data-k="1" title="${t("W górę o kafelek")}">▲</button><button data-k="2" title="${t("W dół o kafelek")}">▼</button><button data-k="4" title="${t("W prawo o kafelek")}">▶</button>
    <span class="przygaszone">${t("Piksele")}:</span>
    <button data-p="-1,0" title="${t("W lewo o piksel (Shift: 8)")}">←</button><button data-p="0,1" title="${t("W górę o piksel (Shift: 8)")}">↑</button><button data-p="0,-1" title="${t("W dół o piksel (Shift: 8)")}">↓</button><button data-p="1,0" title="${t("W prawo o piksel (Shift: 8)")}">→</button>
    <input class="px" type="number" value="${p.x}" title="pixel_x"><input class="px" type="number" value="${p.y}" title="pixel_y">
    <button data-zero title="${t("Wyzeruj przesunięcie")}">0</button>`;
  d.querySelectorAll("[data-k]").forEach((b) => (b.onclick = () => przesunOKafelek(x, y, indeks, +b.dataset.k)));
  d.querySelectorAll("[data-p]").forEach((b) => (b.onclick = (e) => {
    const [dx, dy] = b.dataset.p.split(",").map(Number);
    const krok = e.shiftKey ? 8 : 1;
    ustawPiksele(x, y, indeks, p.x + dx * krok, p.y + dy * krok);
  }));
  const [ix, iy] = d.querySelectorAll("input.px");
  const zatwierdz = () => ustawPiksele(x, y, indeks, Math.round(+ix.value || 0), Math.round(+iy.value || 0));
  ix.onchange = zatwierdz; iy.onchange = zatwierdz;
  d.querySelector("[data-zero]").onclick = () => {
    const dom = zmienne(a.typ);
    ustawPiksele(x, y, indeks, +dom.pixel_x || 0, +dom.pixel_y || 0);
  };
  return d;
}

const KROK_KIER = { 1: [0, 1], 2: [0, -1], 4: [1, 0], 8: [-1, 0] };
function przesunOKafelek(x, y, indeks, d) {
  const atom = stan.mapa.atomy(x, y, widok.z)[indeks];
  const k = { x: x + KROK_KIER[d][0], y: y + KROK_KIER[d][1] };
  // obiekt ścienny: szukaj ściany od strony, w którą przesuwamy
  const u = { 1: { fx: 0.5, fy: 1 }, 2: { fx: 0.5, fy: 0 }, 4: { fx: 1, fy: 0.5 }, 8: { fx: 0, fy: 0.5 } }[d];
  przeniesObiekt(x, y, indeks, celPrzeniesienia(atom, k, u));
}

const kierunekZAtomu = (a) => +(a.zm.find(([k]) => k === "dir")?.[1] ?? (zmienne(a.typ).dir | 0 || 2));

// Zmienne tekstowe, które same dostają cudzysłowy, jeśli ktoś ich nie wpisze.
const TEKSTOWE = new Set(["name", "desc", "icon_state", "id", "id_tag", "req_access_txt", "req_one_access_txt", "base_icon_state", "tag", "dname"]);
const KIERUNKI = [[2, "południe"], [1, "północ"], [4, "wschód"], [8, "zachód"], [6, "pd-wsch"], [10, "pd-zach"], [5, "pn-wsch"], [9, "pn-zach"]];

function formularzZmiennych(atom, zastosuj) {
  const f = document.createElement("div");
  f.className = "formularz";
  const wiersze = document.createElement("div");
  const domyslne = zmienne(atom.typ);
  const dodajWiersz = (k = "", v = "") => {
    const w = document.createElement("div");
    w.className = "zmienna";
    w.innerHTML = `<input class="nazwa" placeholder="zmienna" spellcheck="false"><input class="wartosc" placeholder="wartość" spellcheck="false"><button title="Usuń">✕</button>`;
    const [n, wart, x] = w.children;
    n.value = k; wart.value = v;
    const podpowiedz = () => { const d = domyslne[n.value]; wart.placeholder = d === undefined || d === null ? "wartość" : "domyślnie: " + (typeof d === "object" ? JSON.stringify(d) : d); };
    n.oninput = podpowiedz; podpowiedz();
    x.onclick = () => w.remove();
    wiersze.append(w);
    return w;
  };
  for (const [k, v] of atom.zm) dodajWiersz(k, v);
  const ustaw = (k, v) => {
    const jest = [...wiersze.children].find((w) => w.children[0].value.trim() === k);
    (jest || dodajWiersz(k)).children[1].value = v;
  };

  const szybkie = document.createElement("div");
  szybkie.className = "szybkie";
  const rk = korzen(atom.typ);
  if (rk === "obj" || rk === "mob") {
    const sel = document.createElement("select");
    sel.innerHTML = `<option value="">kierunek…</option>` + KIERUNKI.map(([d, n]) => `<option value="${d}">${n} (${d})</option>`).join("");
    sel.onchange = () => { if (sel.value) ustaw("dir", sel.value); sel.value = ""; };
    szybkie.append(sel);
  }
  const v = zmienneAtomu(atom);
  if (v.icon) {
    const sel = document.createElement("select");
    sel.innerHTML = `<option value="">stan ikony…</option>`;
    ikona(v.icon).then((ik) => {
      if (!ik) return;
      for (const nazwa of ik.stany.keys()) { const o = document.createElement("option"); o.value = o.textContent = nazwa || "(pusty)"; if (!nazwa) o.value = "__pusty__"; sel.append(o); }
    });
    sel.onchange = () => { if (sel.value) ustaw("icon_state", JSON.stringify(sel.value === "__pusty__" ? "" : sel.value)); sel.value = ""; };
    szybkie.append(sel);
  }
  const plus = document.createElement("button");
  plus.textContent = "+ zmienna";
  plus.onclick = () => dodajWiersz().children[0].focus();
  szybkie.append(plus);

  const dol = document.createElement("div");
  dol.className = "szybkie";
  const ok = document.createElement("button");
  ok.textContent = "Zastosuj";
  ok.className = "wlaczony";
  ok.onclick = () => {
    const zm = [];
    for (const w of wiersze.children) {
      const k = w.children[0].value.trim();
      let val = w.children[1].value.trim();
      if (!/^[A-Za-z_]\w*$/.test(k) || val === "") continue;
      if (TEKSTOWE.has(k) && !/^["'{]/.test(val) && val !== "null") val = JSON.stringify(val);
      zm.push([k, val]);
    }
    zm.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    zastosuj(zm);
  };
  const anuluj = document.createElement("button");
  anuluj.textContent = "Anuluj";
  anuluj.onclick = () => { stan.edycjaZm = null; pokazInspekcje(); };
  dol.append(ok, anuluj);
  f.append(wiersze, szybkie, dol);
  return f;
}

function pokazPodpowiedz(e) {
  const el = $("#podpowiedz");
  const n = stan.narzedzie;
  if (stan.chwyt?.aktywny && e) {
    const ch = stan.chwyt;
    el.textContent = ch.piksele
      ? `${ladnaNazwa(ch.atom.typ)} · pixel_x = ${ch.nowe?.x ?? pikseleAtomu(ch.atom).x}, pixel_y = ${ch.nowe?.y ?? pikseleAtomu(ch.atom).y} · ${t("Shift: co 8 px")}`
      : t("Przesuwam") + ": " + ladnaNazwa(ch.atom.typ) + " · " + t("puść, żeby postawić · PPM anuluje");
    el.style.left = e.clientX + 18 + "px";
    el.style.top = e.clientY + 18 + "px";
    el.classList.remove("ukryty");
    return;
  }
  if (!n || !e) { el.classList.add("ukryty"); return; }
  let tekst;
  if (n.rodzaj === "rozbiorka") tekst = e.shiftKey ? "Rozbiórka + Shift – usuwa wszystko, zostaje sam kosmos" : "Rozbiórka – usuwa obiekty, ściany zostają poszyciem · z Shiftem: wszystko do kosmosu";
  else if (n.rodzaj === "kopiuj") tekst = "Kopiuj – zaznacz prostokąt";
  else if (n.rodzaj === "zaznacz") tekst = "Zaznacz obszar dla szukania i zamiany – przeciągnij";
  else if (n.rodzaj === "przenies") tekst = n.chwyt ? "Przenieś – kliknij w nowe miejsce, Q/E obraca (PPM anuluje)" : "Przenieś – zaznacz prostokąt do przeniesienia";
  else if (n.rodzaj === "podloga") tekst = "Usuń podłogę – przeciągnij; podłoga zamienia się w kosmos, obiekty zostają";
  else if (n.rodzaj === "wklej") tekst = `Wklej ${n.schowek.szer}×${n.schowek.wys}${n.nazwa ? " „" + n.nazwa + "”" : ""} – kursor to lewy górny róg, Q/E obraca`;
  else if (n.rodzaj === "pokoj") tekst = `Pokój – ${ladnaNazwa(stan.ostatnie.sciana)} + ${ladnaNazwa(stan.ostatnie.podloga)} (ostatnio wybrane w Architekcie)`;
  else {
    const kier = { 1: "północ", 2: "południe", 4: "wschód", 8: "zachód", 5: "pn-wsch", 6: "pd-wsch", 9: "pn-zach", 10: "pd-zach" }[stan.kierunek] || stan.kierunek;
    const obrot = n.scienny ? (projekt()[0]?.bezSciany ? " · brak ściany obok" : " · przyciąga się do ściany")
      : korzen(n.typ) === "obj" || korzen(n.typ) === "mob" ? ` · kierunek: ${kier}` : "";
    const tryb = { obrys: "przeciągnij: obrys", prostokat: "przeciągnij: wypełnij", linia: "przeciągnij: linia", pojedynczo: "klik lub malowanie" }[n.tryb];
    tekst = `${ladnaNazwa(n.typ)}${obrot} · ${tryb}`;
  }
  if (stan.przeciaganie) {
    const ile = biezacePola().length;
    tekst += ` · ${ile} pól`;
  }
  el.textContent = tekst;
  el.style.left = e.clientX + 18 + "px";
  el.style.top = e.clientY + 18 + "px";
  el.classList.remove("ukryty");
}

// ---------------------------------------------------------------- mysz i klawiatura

const ZOOMY = [4, 6, 8, 12, 16, 24, 32, 48, 64, 96];
let przesuwanie = null;
let ostatniaMysz = null;

plotno.addEventListener("contextmenu", (e) => e.preventDefault());
// Bez tego Chrome po wciśnięciu kółka włącza autoprzewijanie strony.
plotno.addEventListener("auxclick", (e) => e.preventDefault());

// ---------------------------------------------------------------- przesuwanie pojedynczego obiektu
// W Inspekcji: złap obiekt lewym przyciskiem i przeciągnij na inny kafelek (albo Alt+strzałki).

const ruchomy = (a) => !!a && (a.typ.startsWith("/obj") || a.typ.startsWith("/mob"));

// Który obiekt złapać: wybrany w inspekcji albo ten, który leży na wierzchu (i jest widoczny).
function obiektDoZlapania(x, y) {
  if (!stan.mapa?.wewnatrz(x, y)) return -1;
  const atomy = stan.mapa.atomy(x, y, widok.z);
  if (stan.wybrany?.x === x && stan.wybrany?.y === y && ruchomy(atomy[stan.wybranyAtom])) return stan.wybranyAtom;
  let najlepszy = -1, klucz = null;
  atomy.forEach((a, i) => {
    if (!ruchomy(a) || !widok.warstwy[warstwaAtomu(a.typ)]) return;
    const v = zmienneAtomu(a);
    const k = [v.plane | 0, +v.layer || 0, -i]; // przy równej warstwie wyżej rysuje się wcześniejszy na liście
    if (!klucz || k[0] > klucz[0] || (k[0] === klucz[0] && (k[1] > klucz[1] || (k[1] === klucz[1] && k[2] > klucz[2])))) { najlepszy = i; klucz = k; }
  });
  return najlepszy;
}

// Gdzie wyląduje przenoszony obiekt. Obiekty ścienne przyczepiają się do nowej ściany
// (zachowując swoje pozostałe zmienne), reszta ląduje na kafelku pod kursorem.
function celPrzeniesienia(atom, k, u = { fx: 0.5, fy: 0.5 }) {
  if (!k || !stan.mapa.wewnatrz(k.x, k.y)) return null;
  if (jestScienny(atom.typ)) {
    const s = przyciagnij(stan.mapa, widok.z, k, u.fx, u.fy);
    if (s) {
      const nowy = atomNaScianie(atom.typ, s.d);
      const montaz = new Set(["dir", "pixel_x", "pixel_y"]);
      const zm = [...nowy.zm, ...atom.zm.filter(([n]) => !montaz.has(n) && !nowy.zm.some(([m]) => m === n))]
        .sort((p, q) => (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : 0));
      return { x: s.x, y: s.y, atom: { typ: nowy.typ, zm } };
    }
  }
  return { x: k.x, y: k.y, atom };
}

// Przenosi atom nr indeks z (x, y) do celu jedną operacją w historii. Zwraca true, jeśli się udało.
function przeniesObiekt(x, y, indeks, cel) {
  const m = stan.mapa;
  const zrodlo = m.atomy(x, y, widok.z);
  const atom = zrodlo[indeks];
  if (!cel || !ruchomy(atom)) return false;
  const bezNiego = zrodlo.filter((_, i) => i !== indeks);
  const naCelu = cel.x === x && cel.y === y ? bezNiego : m.atomy(cel.x, cel.y, widok.z);
  if (!mozna(naCelu, cel.atom)) { komunikat("Tu nie da się postawić tego obiektu", true); return false; }
  const poCelu = poPostawieniu(naCelu, cel.atom);
  if (!poCelu) { komunikat("Na tym kafelku stoi już taki sam obiekt", true); return false; }
  historia.zacznij();
  zmienKafelek(x, y, bezNiego);
  zmienKafelek(cel.x, cel.y, poCelu);
  historia.zakoncz();
  ustawZmiany(true);
  stan.wybrany = { x: cel.x, y: cel.y };
  stan.wybranyAtom = poCelu.indexOf(poCelu.find((a) => atomNaTekst(a) === atomNaTekst(cel.atom)));
  stan.edycjaZm = null;
  pokazInspekcje();
  zdarzenie("przesun-obiekt");
  widok.rysuj();
  return true;
}

function anulujChwyt() {
  if (!stan.chwyt) return;
  stan.chwyt = null;
  plotno.style.cursor = "default";
  pokazPodpowiedz(null);
  widok.rysuj();
}

plotno.addEventListener("mousedown", (e) => {
  if (!stan.mapa) return;
  const r = plotno.getBoundingClientRect();
  const kaf = widok.naKafelek(e.clientX - r.left, e.clientY - r.top);
  if (e.button === 1 || e.button === 2) {
    if (e.button === 2 && stan.chwyt?.aktywny) { anulujChwyt(); e.preventDefault(); return; }
    przesuwanie = { x: e.clientX, y: e.clientY, kx: widok.kam.x, ky: widok.kam.y, ruszyl: false, przycisk: e.button };
    e.preventDefault();
    return;
  }
  if (e.button !== 0) return;
  if (!stan.narzedzie) {
    const tenSam = stan.wybrany?.x === kaf.x && stan.wybrany?.y === kaf.y;
    stan.wybrany = stan.mapa.wewnatrz(kaf.x, kaf.y) ? kaf : null;
    if (!tenSam) stan.wybranyAtom = null;
    stan.edycjaZm = null;
    // złapanie obiektu – przeciąganie zacznie się, gdy mysz ruszy się o kilka pikseli
    const indeks = obiektDoZlapania(kaf.x, kaf.y);
    stan.chwyt = indeks >= 0 ? { x: kaf.x, y: kaf.y, indeks, atom: stan.mapa.atomy(kaf.x, kaf.y, widok.z)[indeks], px: e.clientX, py: e.clientY, aktywny: false, piksele: e.ctrlKey } : null;
    if (stan.chwyt) stan.wybranyAtom = indeks;
    pokazInspekcje();
    widok.rysuj();
    return;
  }
  stan.kursor = kaf;
  stan.przeciaganie = { start: kaf, pola: new Map([[kluczPola(kaf.x, kaf.y), kaf]]), shift: e.shiftKey, ulamek: stan.ulamek };
  widok.rysuj();
});

window.addEventListener("mousemove", (e) => {
  ostatniaMysz = e;
  if (przesuwanie) {
    const dx = e.clientX - przesuwanie.x, dy = e.clientY - przesuwanie.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) przesuwanie.ruszyl = true;
    widok.kam.x = przesuwanie.kx - dx / widok.kam.zoom;
    widok.kam.y = przesuwanie.ky - dy / widok.kam.zoom;
    widok.rysuj();
    if (przesuwanie.ruszyl) zdarzenie("kamera");
    return;
  }
  if (!stan.mapa || e.target !== plotno) { if (e.target !== plotno) { $("#podpowiedz").classList.add("ukryty"); } return; }
  const r = plotno.getBoundingClientRect();
  const kaf = widok.naKafelek(e.clientX - r.left, e.clientY - r.top);
  const zmiana = !stan.kursor || kaf.x !== stan.kursor.x || kaf.y !== stan.kursor.y;
  stan.kursor = kaf;
  // położenie kursora w kafelku – do wyboru ściany przy obiektach ściennych
  const kol = (e.clientX - r.left) / widok.kam.zoom + widok.kam.x, wr = (e.clientY - r.top) / widok.kam.zoom + widok.kam.y;
  const ulamek = { fx: kol - Math.floor(kol), fy: 1 - (wr - Math.floor(wr)) };
  const innaCwiartka = !stan.ulamek || (ulamek.fx > ulamek.fy) !== (stan.ulamek.fx > stan.ulamek.fy) || (ulamek.fx + ulamek.fy > 1) !== (stan.ulamek.fx + stan.ulamek.fy > 1);
  stan.ulamek = ulamek;
  if (stan.przeciaganie && stan.narzedzie?.tryb === "pojedynczo" && stan.mapa.wewnatrz(kaf.x, kaf.y)) stan.przeciaganie.pola.set(kluczPola(kaf.x, kaf.y), kaf);
  const ch = stan.chwyt;
  if (ch && !ch.aktywny && e.buttons & 1 && Math.abs(e.clientX - ch.px) + Math.abs(e.clientY - ch.py) > (ch.piksele ? 1 : 5)) {
    ch.aktywny = true;
    widok.rysuj();
  }
  if (ch?.aktywny && ch.piksele) {
    // Ctrl+przeciąganie: przesunięcie w pikselach (Shift – co 8 px)
    const krok = e.shiftKey ? 8 : 1;
    const p0 = pikseleAtomu(ch.atom);
    const dx = Math.round(((e.clientX - ch.px) / widok.kam.zoom) * 32 / krok) * krok;
    const dy = Math.round((-(e.clientY - ch.py) / widok.kam.zoom) * 32 / krok) * krok;
    if (dx !== ch.dx || dy !== ch.dy) { ch.dx = dx; ch.dy = dy; ch.nowe = { x: p0.x + dx, y: p0.y + dy }; widok.rysuj(); }
  }
  if (!stan.narzedzie) plotno.style.cursor = ch?.aktywny ? "grabbing" : obiektDoZlapania(kaf.x, kaf.y) >= 0 ? "grab" : "default";
  if (zmiana) pokazInfo();
  if (zmiana || (innaCwiartka && (stan.narzedzie?.scienny || (ch?.aktywny && jestScienny(ch.atom.typ))))) widok.rysuj();
  pokazPodpowiedz(e);
});

window.addEventListener("mouseup", (e) => {
  if (przesuwanie && e.button === przesuwanie.przycisk) {
    const p = przesuwanie;
    przesuwanie = null;
    if (p.przycisk === 2 && !p.ruszyl) {
      if (stan.przeciaganie) { stan.przeciaganie = null; widok.rysuj(); }
      else if (stan.narzedzie) anulujNarzedzie();
      pokazPodpowiedz(null);
    }
    return;
  }
  if (e.button === 0 && stan.chwyt) {
    const ch = stan.chwyt;
    stan.chwyt = null;
    if (ch.aktywny && ch.piksele) {
      if (ch.nowe) ustawPiksele(ch.x, ch.y, ch.indeks, ch.nowe.x, ch.nowe.y);
      pokazPodpowiedz(null);
      widok.rysuj();
    } else if (ch.aktywny) {
      przeniesObiekt(ch.x, ch.y, ch.indeks, celPrzeniesienia(ch.atom, stan.kursor, stan.ulamek));
      plotno.style.cursor = "grab";
      pokazPodpowiedz(null);
      widok.rysuj();
    }
    return;
  }
  if (e.button === 0 && stan.przeciaganie) {
    wykonaj();
    stan.przeciaganie = null;
    pokazPodpowiedz(ostatniaMysz);
    widok.rysuj();
  }
});

plotno.addEventListener("mouseleave", () => { $("#info").classList.add("ukryty"); });

let sumaKolka = 0;
plotno.addEventListener("wheel", (e) => {
  e.preventDefault();
  // Wciśnięte kółko / przeciąganie: żadnego przybliżania (myszy wysyłają wtedy przechył kółka).
  if (przesuwanie || e.buttons) return;
  // Przechył kółka (albo przesunięcie na touchpadzie w bok) przesuwa widok, nie przybliża.
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    widok.kam.x += e.deltaX / widok.kam.zoom;
    widok.rysuj();
    return;
  }
  if (!e.deltaY) return;
  // Touchpady wysyłają dziesiątki małych kroków – zbieram je do jednego „ząbka”.
  sumaKolka += e.deltaMode === 0 ? e.deltaY : e.deltaY * 40;
  if (Math.abs(sumaKolka) < 40) return;
  const wGore = sumaKolka < 0;
  sumaKolka = 0;
  const r = plotno.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  const stary = widok.kam.zoom;
  let i = ZOOMY.indexOf(stary);
  if (i < 0) i = ZOOMY.findIndex((z) => z >= stary);
  i = Math.max(0, Math.min(ZOOMY.length - 1, i + (wGore ? 1 : -1)));
  const nowy = ZOOMY[i];
  const tx = widok.kam.x + mx / stary, ty = widok.kam.y + my / stary;
  widok.kam.zoom = nowy;
  zdarzenie("kamera");
  widok.kam.x = tx - mx / nowy;
  widok.kam.y = ty - my / nowy;
  widok.rysuj();
}, { passive: false });

const wcisniete = new Set();
function petlaRuchu() {
  if (!wcisniete.size) return;
  const v = 14 / widok.kam.zoom * 2.2;
  if (wcisniete.has("w") || wcisniete.has("arrowup")) widok.kam.y -= v;
  if (wcisniete.has("s") || wcisniete.has("arrowdown")) widok.kam.y += v;
  if (wcisniete.has("a") || wcisniete.has("arrowleft")) widok.kam.x -= v;
  if (wcisniete.has("d") || wcisniete.has("arrowright")) widok.kam.x += v;
  widok.rysuj();
  zdarzenie("kamera");
  requestAnimationFrame(petlaRuchu);
}

// Q/E: obrót tego, co jest „w ręce” – fragmentu do wklejenia lub przeniesienia, budowanego obiektu,
// a bez narzędzia obiektu zaznaczonego w Inspekcji.
function obroc(zmiana) {
  const n = stan.narzedzie;
  if (n?.rodzaj === "wklej") {
    const s = obroconySchowek(n.schowek, zmiana);
    if (n.schowek === stan.schowek) ustawSchowek(s);
    n.schowek = s;
  } else if (n?.rodzaj === "przenies" && n.chwyt) {
    const c = n.chwyt;
    c.zrodlo ??= c.schowek;
    const s = obroconySchowek(c.schowek, zmiana, { x: c.ux, y: c.uy });
    c.schowek = s;
    c.ux = s.pkt.x; c.uy = s.pkt.y;
  } else if (!n && stan.wybrany) {
    const w = stan.wybrany;
    const indeks = obiektDoZlapania(w.x, w.y);
    if (indeks < 0) return;
    const nowe = obrocony(stan.mapa.atomy(w.x, w.y, widok.z), indeks, zmiana);
    if (!nowe) return;
    historia.zacznij(); zmienKafelek(w.x, w.y, nowe); historia.zakoncz(); ustawZmiany(true); pokazInspekcje();
  } else {
    stan.kierunek = obrot(stan.kierunek, zmiana);
  }
  zdarzenie("obrot");
  pokazPodpowiedz(ostatniaMysz);
  widok.rysuj();
}

window.addEventListener("keydown", (e) => {
  // Skróty nie działają tylko przy pisaniu. Kliknięty checkbox albo przycisk nie może ich blokować.
  const cel = e.target;
  const pisanie = cel.tagName === "TEXTAREA" || cel.tagName === "SELECT" || cel.isContentEditable
    || (cel.tagName === "INPUT" && !["checkbox", "radio", "button", "range", "color", "file"].includes(cel.type));
  if (pisanie || cel.closest?.("#okno-dialog")) {
    if (e.key === "Escape") cel.blur();
    return;
  }
  if (cel.tagName === "INPUT") cel.blur();
  const k = e.key.toLowerCase();
  if (e.ctrlKey && k === "s") { e.preventDefault(); zapisz(); return; }
  if (e.ctrlKey && k === "z") { e.preventDefault(); e.shiftKey ? ponow() : cofnij(); return; }
  if (e.ctrlKey && k === "y") { e.preventDefault(); ponow(); return; }
  if (e.ctrlKey && k === "f") { e.preventDefault(); if (stan.mapa) przelaczSzukanie(true); return; }
  if (e.ctrlKey && k === "n") { e.preventDefault(); nowaMapa(); return; }
  if (e.ctrlKey) return;
  if (e.altKey && k.startsWith("arrow")) {
    // Alt+strzałki: wybrany obiekt o kafelek, Alt+Shift+strzałki: o piksel
    e.preventDefault();
    const w = stan.wybrany;
    if (!w || stan.narzedzie) return;
    const indeks = obiektDoZlapania(w.x, w.y);
    if (indeks < 0) return;
    const d = { arrowup: 1, arrowdown: 2, arrowright: 4, arrowleft: 8 }[k];
    if (e.shiftKey) {
      const p = pikseleAtomu(stan.mapa.atomy(w.x, w.y, widok.z)[indeks]);
      ustawPiksele(w.x, w.y, indeks, p.x + KROK_KIER[d][0], p.y + KROK_KIER[d][1]);
    } else przesunOKafelek(w.x, w.y, indeks, d);
    return;
  }
  if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
    const pusto = !wcisniete.size;
    wcisniete.add(k);
    if (pusto) requestAnimationFrame(petlaRuchu);
    e.preventDefault();
    return;
  }
  if (k === "q" || k === "e") obroc(k === "e" ? 1 : -1);
  else if (k === "shift") { pokazPodpowiedz(ostatniaMysz); widok.rysuj(); }
  else if (k === "escape") { if (stan.chwyt) anulujChwyt(); else if (stan.narzedzie) anulujNarzedzie(); else { stan.wybrany = null; pokazInspekcje(); widok.rysuj(); } }
  else if (k === "pageup") ustawPoziom(widok.z + 1);
  else if (k === "pagedown") ustawPoziom(widok.z - 1);
  else if (k === "b") przelaczArchitekta();
  else if (k === "x") ustawRozbiorke();
  else if (k === "r") przelaczNarzedzie("pokoj");
  else if (k === "m") przelaczNarzedzie("przenies");
  else if (k === "f") przelaczNarzedzie("podloga");
  else if (k === "c") przelaczNarzedzie("kopiuj");
  else if (k === "v") ustawWklej();
  else if (k === "g") { stan.siatka = !stan.siatka; $("#w-siatka").checked = stan.siatka; widok.rysuj(); }
});
window.addEventListener("keyup", (e) => wcisniete.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => wcisniete.clear());
window.addEventListener("beforeunload", (e) => {
  zapamietajKarte();
  if (stan.karty.some((k) => k.zmiany)) { e.preventDefault(); e.returnValue = ""; }
});

// ---------------------------------------------------------------- przyciski

function przelaczArchitekta() {
  $("#architekt").classList.toggle("ukryty");
  odswiezPrzyciskiNarzedzi();
}
function przelaczNarzedzie(rodzaj, dodatki = {}) {
  if (stan.narzedzie?.rodzaj === rodzaj) anulujNarzedzie();
  else { stan.narzedzie = { rodzaj, ...dodatki }; odswiezPrzyciskiNarzedzi(); pokazPodpowiedz(ostatniaMysz); widok.rysuj(); }
}
const ustawRozbiorke = () => przelaczNarzedzie("rozbiorka");
const ustawWklej = () => { if (stan.schowek) przelaczNarzedzie("wklej", { schowek: stan.schowek }); };

// ---------------------------------------------------------------- kontrola mapy (raport inżyniera)

const kontrola = { wyniki: [], rozwiniete: new Set(), znaczniki: true, czas: null, naKafelku: new Map() };
const IKONA_WAGI = { blad: "⛔", ostrzezenie: "⚠", uwaga: "ℹ" };
const NAZWA_WAGI = { blad: ["błąd", "błędy", "błędów"], ostrzezenie: ["ostrzeżenie", "ostrzeżenia", "ostrzeżeń"], uwaga: ["uwaga", "uwagi", "uwag"] };
const odmiana = (n, [a, b, c]) => (n === 1 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? b : c);

function zaplanujKontrole() {
  clearTimeout(kontrola.czas);
  kontrola.czas = setTimeout(uruchomKontrole, 350);
}

function uruchomKontrole() {
  kontrola.wyniki = stan.mapa ? sprawdzMape(stan.mapa) : [];
  kontrola.naKafelku = new Map();
  for (const p of kontrola.wyniki) {
    const k = p.z + ":" + p.x + ":" + p.y;
    if (!kontrola.naKafelku.has(k)) kontrola.naKafelku.set(k, []);
    kontrola.naKafelku.get(k).push(p);
  }
  pokazKontrole();
  if (stan.wybrany) pokazInspekcje();
  widok.rysuj();
}

function liczWagi() {
  const n = { blad: 0, ostrzezenie: 0, uwaga: 0 };
  for (const p of kontrola.wyniki) n[wagaProblemu(p)]++;
  return n;
}

function pokazKontrole() {
  const n = liczWagi();
  const b = $("#b-kontrola");
  b.className = n.blad ? "kontrola-blad" : n.ostrzezenie ? "kontrola-ostrzezenie" : "kontrola-ok";
  b.innerHTML = !stan.mapa ? "Kontrola" : n.blad + n.ostrzezenie + n.uwaga === 0 ? "✓ Kontrola" : `${n.blad ? "⛔ " + n.blad + " " : ""}${n.ostrzezenie ? "⚠ " + n.ostrzezenie + " " : ""}${n.uwaga ? "ℹ " + n.uwaga : ""}`;
  b.title = "Kontrola mapy: " + Object.entries(n).map(([w, ile]) => `${ile} ${odmiana(ile, NAZWA_WAGI[w])}`).join(", ");
  const el = $("#kontrola");
  if (el.classList.contains("ukryty")) return;
  el.innerHTML = "";
  const g = document.createElement("div");
  g.className = "pasek";
  g.innerHTML = `<span class="naglowek">Kontrola mapy</span><span style="flex:1"></span><label class="przygaszone"><input type="checkbox" ${kontrola.znaczniki ? "checked" : ""}> znaczniki</label><button title="Zamknij">✕</button>`;
  g.querySelector("input").onchange = (e) => { kontrola.znaczniki = e.target.checked; widok.rysuj(); };
  g.querySelector("button").onclick = () => { el.classList.add("ukryty"); document.body.classList.remove("z-kontrola"); widok.rysuj(); };
  el.append(g);
  const podsumowanie = document.createElement("div");
  podsumowanie.className = "podsumowanie";
  podsumowanie.innerHTML = Object.entries(n).map(([w, ile]) => `<span class="waga-${w}">${IKONA_WAGI[w]} ${ile} ${odmiana(ile, NAZWA_WAGI[w])}</span>`).join("");
  el.append(podsumowanie);
  if (!kontrola.wyniki.length) {
    el.insertAdjacentHTML("beforeend", `<div class="wszystko-ok">✓ Nie znalazłem problemów na tej mapie.</div>`);
    return;
  }
  const grupy = new Map();
  for (const p of kontrola.wyniki) { if (!grupy.has(p.kod)) grupy.set(p.kod, []); grupy.get(p.kod).push(p); }
  for (const [kod, lista] of grupy) {
    const def = SPRAWDZENIA[kod];
    const sekcja = document.createElement("div");
    sekcja.className = "grupa waga-" + def.waga;
    const nag = document.createElement("div");
    nag.className = "grupa-naglowek";
    const otwarta = kontrola.rozwiniete.has(kod);
    nag.innerHTML = `<span>${otwarta ? "▾" : "▸"} ${IKONA_WAGI[def.waga]}</span><span class="grupa-tytul"></span><span class="ile">${lista.length}</span>`;
    nag.querySelector(".grupa-tytul").textContent = def.tytul;
    nag.onclick = () => { if (otwarta) kontrola.rozwiniete.delete(kod); else kontrola.rozwiniete.add(kod); pokazKontrole(); };
    sekcja.append(nag);
    if (otwarta) {
      const porada = document.createElement("div");
      porada.className = "porada";
      porada.textContent = def.porada;
      sekcja.append(porada);
      for (const p of lista.slice(0, 150)) {
        const w = document.createElement("div");
        w.className = "wynik";
        w.textContent = `(${p.x}, ${p.y}, ${p.z})  ${p.typ ? ladnaNazwa(p.typ) : ""}`;
        w.title = p.typ || "";
        w.onclick = () => pokazKafelek(p.x, p.y, p.z);
        sekcja.append(w);
      }
      if (lista.length > 150) sekcja.insertAdjacentHTML("beforeend", `<div class="przygaszone">…i ${lista.length - 150} więcej</div>`);
    }
    el.append(sekcja);
  }
}

function przelaczKontrole() {
  const el = $("#kontrola");
  el.classList.toggle("ukryty");
  document.body.classList.toggle("z-kontrola", !el.classList.contains("ukryty"));
  if (!el.classList.contains("ukryty")) zdarzenie("kontrola");
  pokazKontrole();
  widok.rysuj();
}
$("#b-kontrola").onclick = przelaczKontrole;

const KOLOR_WAGI = { blad: "#e0483c", ostrzezenie: "#e6b422", uwaga: "#5a9be0" };
widok.nakladki.push((g, w) => {
  if (!kontrola.znaczniki || !kontrola.wyniki.length || $("#kontrola").classList.contains("ukryty")) return;
  const z = w.kam.zoom;
  const r = Math.max(4, z * 0.28);
  for (const [k, lista] of kontrola.naKafelku) {
    const [pz, px, py] = k.split(":").map(Number);
    if (pz !== w.z) continue;
    const waga = lista.reduce((m, p) => (wagaProblemu(p) === "blad" || m === "blad" ? "blad" : wagaProblemu(p) === "ostrzezenie" || m === "ostrzezenie" ? "ostrzezenie" : "uwaga"), "uwaga");
    const p = w.naEkran(px, py);
    g.fillStyle = KOLOR_WAGI[waga];
    g.beginPath();
    g.moveTo(p.sx + z - r, p.sy);
    g.lineTo(p.sx + z, p.sy);
    g.lineTo(p.sx + z, p.sy + r);
    g.closePath();
    g.fill();
    if (z >= 12) { g.strokeStyle = KOLOR_WAGI[waga]; g.lineWidth = 1; g.strokeRect(p.sx + 0.5, p.sy + 0.5, z - 1, z - 1); }
  }
});

// Przeskok do kafelka (np. z wyników szukania): poziom, kamera, inspekcja.
function pokazKafelek(x, y, z) {
  if (z !== widok.z) ustawPoziom(z);
  const r = plotno.getBoundingClientRect();
  widok.kam.zoom = Math.max(widok.kam.zoom, 32);
  widok.kam.x = x - 1 + 0.5 - r.width / widok.kam.zoom / 2;
  widok.kam.y = stan.mapa.wys - y + 0.5 - r.height / widok.kam.zoom / 2;
  stan.wybrany = { x, y };
  stan.edycjaZm = null;
  pokazInspekcje();
  widok.rysuj();
}

initOperacje({
  stan, widok, historia, komunikat, ladowanie, ustawZmiany, odswiezTytul, pokazPoziomy, ustawPoziom, pokazInspekcje,
  zmienKafelek, pokazKafelek, zdarzenie, dodajKarte: async (mapa) => { await wczytajIkonyMapy(mapa); dodajKarte(mapa); },
  listaMap: () => listaMap,
  zacznijZaznaczanie: () => { stan.narzedzie = { rodzaj: "zaznacz" }; odswiezPrzyciskiNarzedzi(); komunikat("Przeciągnij prostokąt na mapie"); },
});
initSzukanie();

// Menu „Mapa” na górnym pasku.
const MENU_MAPY = {
  nowa: nowaMapa,
  rozmiar: zmienRozmiar,
  "dodaj-z": dodajPoziom,
  "usun-z": usunPoziom,
  szukaj: () => przelaczSzukanie(true),
  png: eksportPng,
};
$("#b-menu-mapy").onclick = (e) => { e.stopPropagation(); $("#menu-mapy").classList.toggle("ukryty"); };
for (const b of document.querySelectorAll("#menu-mapy [data-m]")) {
  b.onclick = () => {
    $("#menu-mapy").classList.add("ukryty");
    if (b.dataset.m !== "nowa" && !stan.mapa) return komunikat("Najpierw otwórz mapę", true);
    MENU_MAPY[b.dataset.m]();
  };
}
window.addEventListener("click", () => $("#menu-mapy").classList.add("ukryty"));

$("#b-architekt").onclick = przelaczArchitekta;
$("#b-rozbiorka").onclick = ustawRozbiorke;
$("#b-pokoj").onclick = () => przelaczNarzedzie("pokoj");
$("#b-przenies").onclick = () => przelaczNarzedzie("przenies");
$("#b-podloga").onclick = () => przelaczNarzedzie("podloga");
$("#b-kopiuj").onclick = () => przelaczNarzedzie("kopiuj");
$("#b-wklej").onclick = ustawWklej;
$("#b-zapisz-szablon").onclick = zapiszSzablon;
$("#b-wskaz").onclick = anulujNarzedzie;
$("#b-zapisz").onclick = zapisz;
$("#b-cofnij").onclick = cofnij;
$("#b-ponow").onclick = ponow;
$("#szukaj").oninput = () => { stan.podgrupa = null; pokazPrzyciski(); };
$("#wszystkie").onchange = () => { stan.podgrupa = null; pokazPrzyciski(); };
$("#w-siatka").onchange = (e) => { stan.siatka = e.target.checked; widok.rysuj(); };
for (const c of document.querySelectorAll("#warstwy [data-w]")) {
  c.onchange = () => { widok.warstwy[c.dataset.w] = c.checked; widok.uniewaznijWszystko(); widok.rysuj(); };
}

let listaMap = [];
async function pokazListeMap() {
  const f = $("#szukaj-mapy").value.trim().toLowerCase();
  const el = $("#lista-map");
  // kopie robocze z przeglądarki na górze listy (też nowe mapy, których nie ma jeszcze w repo)
  const kopie = zrodlo ? await idbKlucze(`robocza:${zrodlo.nazwa}:`) : [];
  el.innerHTML = "";
  for (const k of kopie) {
    const plik = k.slice(`robocza:${zrodlo.nazwa}:`.length);
    if (!plik.toLowerCase().includes(f)) continue;
    const d = document.createElement("div");
    d.className = "kopia-robocza";
    d.innerHTML = "<span></span><small></small>";
    d.children[0].textContent = "✎ " + plik.replace(/^_maps\//, "");
    d.children[1].textContent = t("kopia robocza");
    d.onclick = () => { $("#okno-map").classList.add("ukryty"); otworzMape(plik); };
    el.append(d);
  }
  for (const m of listaMap.filter((m) => m.plik.toLowerCase().includes(f))) {
    const d = document.createElement("div");
    d.innerHTML = "<span></span><small></small>";
    d.children[0].textContent = m.plik.replace(/^_maps\//, "");
    d.children[1].textContent = Math.round(m.rozmiar / 1024) + " KB";
    d.onclick = () => { $("#okno-map").classList.add("ukryty"); otworzMape(m.plik); };
    el.append(d);
  }
}
$("#b-otworz").onclick = () => { $("#okno-map").classList.remove("ukryty"); $("#szukaj-mapy").focus(); pokazListeMap(); };
$("#zamknij-mapy").onclick = () => $("#okno-map").classList.add("ukryty");
$("#szukaj-mapy").oninput = pokazListeMap;
$("#b-zmien-repo").onclick = () => {
  zapamietajKarte();
  if (stan.karty.some((k) => k.zmiany) && !confirm("Masz niezapisane zmiany. Zmienić repozytorium?")) return;
  for (const k of stan.karty) k.zmiany = false;
  stan.zmiany = false;
  location.reload();
};

// ---------------------------------------------------------------- start

// Ekran startowy: wybór folderu repozytorium (wersja z linka) albo serwer.py (lokalnie).
async function pokazStart(blad) {
  const el = $("#start");
  el.classList.remove("ukryty");
  $("#start-blad").textContent = blad || "";
  $("#start-blad").classList.toggle("ukryty", !blad);
  const github = await ZrodloGithub.wykryj();
  $("#start-github").classList.toggle("ukryty", !github);
  $("#start-lub").classList.toggle("ukryty", !github);
  if (github) {
    $("#start-github-nazwa").textContent = github.info.repo;
    $("#start-github-opis").textContent = `${github.info.map} map, stan z ${github.info.data} (commit ${github.info.sha.slice(0, 7)})`;
    $("#start-github").onclick = () => uruchom(github);
  }
  const mozeFolder = ZrodloFolder.dostepne();
  $("#start-folder").classList.toggle("ukryty", !mozeFolder);
  $("#start-bez-zapisu").classList.toggle("ukryty", mozeFolder);
  const ostatni = mozeFolder ? await ZrodloFolder.ostatni() : null;
  $("#start-ponownie").classList.toggle("ukryty", !ostatni);
  if (ostatni) {
    $("#start-ponownie").textContent = `Otwórz ponownie: ${ostatni.name}`;
    $("#start-ponownie").onclick = async () => { const z = await ZrodloFolder.otworzPonownie(ostatni); if (z) uruchom(z); };
  }
  $("#start-folder").onclick = async () => {
    try { const z = await ZrodloFolder.wybierz(); if (z) uruchom(z); } catch (e) { pokazStart("Nie udało się otworzyć folderu: " + e.message); }
  };
  $("#start-pliki").onchange = (e) => { if (e.target.files.length) uruchom(new ZrodloPliki([...e.target.files])); };
}

async function uruchom(z) {
  $("#start").classList.add("ukryty");
  ustawZrodlo(z);
  ladowanie("Czytam kod z " + z.nazwa + "…");
  try {
    const [kat, mapy] = await Promise.all([
      // wersja do pobrania ma kategorie w środku pliku (z dysku nie da się ich pobrać fetch-em)
      window.SS13_OFFLINE?.kategorie ?? fetch("kategorie.json").then((r) => r.json()),
      z.mapy(),
      wczytajTypy((t) => ladowanie(t)),
    ]);
    listaMap = mapy;
    stan.kategorie = [...kat.kategorie, { id: "szablony", nazwa: "Szablony", ikona: "/obj/item/paper", reguly: [] }];
    stan.tryby = kat.tryby;
    ustawRegulySciany(kat.naScianie, kat.naScianieWyklucz);
    zbudujKatalog();
    await wczytajSzablony();
    // Pokój domyślnie z najczęstszej ściany i podłogi na mapach.
    const najczestszy = (id, prefiks) => (stan.katalog.get(id) || []).find((t) => t.startsWith(prefiks));
    stan.ostatnie.sciana = najczestszy("sciany", "/turf/closed/wall") || stan.ostatnie.sciana;
    stan.ostatnie.podloga = najczestszy("podlogi", "/turf/open/floor") || stan.ostatnie.podloga;
    ustawSchowek(null);
    pokazKategorie();
    initSamouczek($("#samouczek"));
    $("#b-samouczek").onclick = pokazSamouczek;
    odswiezPrzyciskiNarzedzi();
    ladowanie(null);
    $("#b-zmien-repo").classList.toggle("ukryty", z.rodzaj === "serwer");
    let ostatnia = null;
    try { ostatnia = localStorage.getItem("ostatnia-mapa:" + z.nazwa); } catch {}
    const dom = listaMap.find((m) => m.plik === ostatnia) || listaMap.find((m) => /Atlas\/atlas\.dmm$/i.test(m.plik));
    if (dom) await otworzMape(dom.plik);
    else $("#b-otworz").click();
  } catch (e) {
    ladowanie(null);
    console.error(e);
    if (z.rodzaj === "serwer") komunikat("Błąd startu: " + e.message, true);
    else pokazStart(e.message);
  }
}

// Pomoc (lista funkcji) i język.
$("#b-pomoc").onclick = () => $("#okno-pomoc").classList.remove("ukryty");
$("#pomoc-zamknij").onclick = () => $("#okno-pomoc").classList.add("ukryty");
$("#okno-pomoc").onclick = (e) => { if (e.target.id === "okno-pomoc") $("#okno-pomoc").classList.add("ukryty"); };
$("#b-jezyk").onclick = async () => {
  zapamietajKarte();
  const zmienione = stan.karty.filter((k) => k.zmiany);
  if (zmienione.length && !confirm(jezyk() === "en" ? "Unsaved changes stay as drafts in the browser. Switch language?" : "Niezapisane zmiany zostaną jako kopie robocze w przeglądarce. Zmienić język?")) return;
  // kopie robocze od razu, bez czekania na opóźniony zapis
  clearTimeout(czasKopii);
  await Promise.all(zmienione.map((k) => idbZapisz(kluczKopii(k.mapa.plik), { plik: k.mapa.plik, tekst: k.mapa.zapisz(), czas: Date.now(), nowa: !!k.mapa.nowa })));
  for (const k of stan.karty) k.zmiany = false;
  stan.zmiany = false;
  przelaczJezyk();
};
window.addEventListener("keydown", (e) => {
  if (e.key === "F1") { e.preventDefault(); $("#okno-pomoc").classList.toggle("ukryty"); }
  if (e.key === "Escape") $("#okno-pomoc").classList.add("ukryty");
});
initJezyk();

async function start() {
  // serwer.py działa tylko lokalnie – na stronie z linka od razu wybór folderu
  const lokalnie = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  const serwer = lokalnie ? await ZrodloSerwer.wykryj() : null;
  if (serwer) uruchom(serwer);
  else pokazStart();
}
start();

// Dostęp z konsoli do testów.
window.edytor = { stan, widok, historia, uruchom };
