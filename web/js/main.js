import { Mapa } from "./dmm.js";
import { ikona } from "./dmi.js";
import { wczytajTypy, wszystkie, zmienne, ileUzyc, korzen, zmienneAtomu } from "./typy.js";
import { Widok, ikonkaTypu, kolorObszaru } from "./render.js";
import { nowyAtom, poPostawieniu, mozna, poRozbiorce, bezAtomu, obrocony, obrot, Historia } from "./edycja.js";
import { autolacz, laczySie } from "./polaczenia.js";
import { initSamouczek, zdarzenie, pokazSamouczek } from "./samouczek.js";

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
  try { stan.szablony = await fetch("/api/szablony").then((r) => r.json()); } catch { stan.szablony = []; }
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
      await fetch("/api/szablon?plik=" + encodeURIComponent(s.plik), { method: "DELETE" });
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
  const odp = await fetch("/api/szablon?plik=" + encodeURIComponent(plik), { method: "POST", body: JSON.stringify({ nazwa: nazwa.trim(), szer: s.szer, wys: s.wys, kafelki: s.kafelki }) });
  if (!odp.ok) { komunikat("Nie zapisano szablonu: " + ((await odp.json().catch(() => ({}))).blad || odp.status), true); return; }
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
  stan.narzedzie = { rodzaj: "buduj", typ, tryb: trybTypu(typ) };
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

async function otworzMape(plik) {
  if (stan.zmiany && !confirm("Masz niezapisane zmiany. Otworzyć inną mapę?")) return;
  ladowanie("Wczytuję " + plik + "…");
  try {
    const odp = await fetch("/repo/" + encodeURI(plik));
    if (!odp.ok) throw new Error("serwer zwrócił " + odp.status);
    const mapa = Mapa.parsuj(await odp.text(), plik);
    // Najpierw wczytuję wszystkie ikony z mapy, żeby obraz nie „doskakiwał”.
    const pliki = new Set();
    for (const p of mapa.prefaby) for (const a of p.atomy) { const i = zmienneAtomu(a).icon; if (i) pliki.add(i); }
    let gotowe = 0;
    await Promise.all([...pliki].map((p) => ikona(p).then(() => { gotowe++; if (gotowe % 20 === 0) ladowanie(`Ikony: ${gotowe}/${pliki.size}`); })));
    stan.mapa = mapa;
    stan.wybrany = null;
    historia.wstecz = []; historia.naprzod = [];
    ustawZmiany(false);
    widok.ustawMape(mapa);
    wysrodkuj();
    pokazPoziomy();
    $("#nazwa-mapy").textContent = `${plik} — ${mapa.szer}×${mapa.wys}, poziomów: ${mapa.poziomy}`;
    try { localStorage.setItem("ostatnia-mapa", plik); } catch {}
    pokazInspekcje();
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
  stan.zmiany = v;
  $("#b-zapisz").classList.toggle("zmiany", v);
}

async function zapisz() {
  if (!stan.mapa) return;
  ladowanie("Zapisuję…");
  try {
    const tekst = stan.mapa.zapisz();
    const odp = await fetch("/api/zapisz?plik=" + encodeURIComponent(stan.mapa.plik), { method: "POST", body: tekst });
    const w = await odp.json();
    if (!odp.ok) throw new Error(w.blad || odp.status);
    ustawZmiany(false);
    komunikat("Zapisano " + stan.mapa.plik);
    zdarzenie("zapisz");
  } catch (e) {
    komunikat("Zapis nie powiódł się: " + e.message, true);
  } finally {
    ladowanie(null);
  }
}

// ---------------------------------------------------------------- edycja

const kluczPola = (x, y) => x + "," + y;

function zmienKafelek(x, y, noweAtomy) {
  const m = stan.mapa;
  const z = widok.z;
  const przed = m.prefab(x, y, z);
  const po = m.dodajPrefab(noweAtomy);
  if (przed === po) return;
  m.ustaw(x, y, z, po);
  historia.zmiana(z + ":" + x + ":" + y, przed, po);
  widok.uniewaznij(x, y);
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
      komunikat("Podniesiono fragment. Kliknij w nowe miejsce, PPM anuluje.");
      widok.rysuj();
      return;
    }
    // drugi krok: źródło staje się kosmosem, fragment ląduje pod kursorem (razem z obszarami)
    const c = n.chwyt;
    historia.zacznij();
    for (const t of c.schowek.kafelki) {
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
  if (ile) zdarzenie(calkiem ? "wyczysc" : n.rodzaj, { typ: n.typ, ile, kierunek: stan.kierunek });
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
  if (stan.wybrany) {
    const p = w.naEkran(stan.wybrany.x, stan.wybrany.y);
    g.strokeStyle = "#c7a846";
    g.lineWidth = 2;
    g.strokeRect(p.sx + 1, p.sy + 1, z - 2, z - 2);
  }
  const n = stan.narzedzie;
  const pola = projekt();
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
    for (const t of n.chwyt.schowek.kafelki) {
      const p = w.naEkran(n.chwyt.x0 + t.dx, n.chwyt.y0 + t.dy);
      g.fillRect(p.sx, p.sy, z, z);
    }
  }
  for (const { x, y, atom, atomy: wklejane } of pola) {
    const p = w.naEkran(x, y);
    if (n.rodzaj === "rozbiorka" || n.rodzaj === "kopiuj" || n.rodzaj === "podloga" || (n.rodzaj === "przenies" && !n.chwyt)) {
      const shift = n.rodzaj === "rozbiorka" && (stan.przeciaganie ? stan.przeciaganie.shift : ostatniaMysz?.shiftKey);
      g.fillStyle = n.rodzaj === "kopiuj" || n.rodzaj === "przenies" ? "rgba(80,140,220,0.3)"
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
  el.innerHTML = `<div class="naglowek" style="margin-bottom:6px">Kafelek (${w.x}, ${w.y}, ${widok.z})</div>`;
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
    const przycisk = (tekst, tytul, fn) => { const b = document.createElement("button"); b.textContent = tekst; b.title = tytul; b.onclick = fn; r.append(b); };
    const zmien = (nowe) => { if (!nowe) return; historia.zacznij(); zmienKafelek(w.x, w.y, nowe); historia.zakoncz(); ustawZmiany(true); pokazInspekcje(); widok.rysuj(); };
    const rk = korzen(a.typ);
    if (rk === "obj" || rk === "mob") {
      przycisk("⟲", "Obróć w lewo", () => zmien(obrocony(atomy, i, -1)));
      przycisk("⟳", "Obróć w prawo", () => zmien(obrocony(atomy, i, 1)));
    }
    przycisk("⧉", "Buduj tym (pipeta)", () => { wybierzProjekt(a.typ); if (rk !== "area" && rk !== "turf") stan.kierunek = kierunekZAtomu(a); });
    if (rk !== "area") przycisk("✎", "Edytuj zmienne", () => { stan.edycjaZm = stan.edycjaZm === i ? null : i; pokazInspekcje(); });
    if (rk !== "area") przycisk("✕", rk === "turf" ? "Zamień na poszycie" : "Usuń", () => zmien(bezAtomu(atomy, i)));
    el.append(r);
    if (stan.edycjaZm === i) el.append(formularzZmiennych(a, (zm) => {
      stan.edycjaZm = null;
      zmien(atomy.map((x, k) => (k === i ? { typ: a.typ, zm } : x)));
      zdarzenie("zmienne");
    }));
  });
  el.classList.remove("ukryty");
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
  if (!n || !e) { el.classList.add("ukryty"); return; }
  let tekst;
  if (n.rodzaj === "rozbiorka") tekst = e.shiftKey ? "Rozbiórka + Shift – usuwa wszystko, zostaje sam kosmos" : "Rozbiórka – usuwa obiekty, ściany zostają poszyciem · z Shiftem: wszystko do kosmosu";
  else if (n.rodzaj === "kopiuj") tekst = "Kopiuj – zaznacz prostokąt";
  else if (n.rodzaj === "przenies") tekst = n.chwyt ? "Przenieś – kliknij w nowe miejsce (PPM anuluje)" : "Przenieś – zaznacz prostokąt do przeniesienia";
  else if (n.rodzaj === "podloga") tekst = "Usuń podłogę – przeciągnij; podłoga zamienia się w kosmos, obiekty zostają";
  else if (n.rodzaj === "wklej") tekst = `Wklej ${n.schowek.szer}×${n.schowek.wys}${n.nazwa ? " „" + n.nazwa + "”" : ""} – kursor to lewy górny róg`;
  else if (n.rodzaj === "pokoj") tekst = `Pokój – ${ladnaNazwa(stan.ostatnie.sciana)} + ${ladnaNazwa(stan.ostatnie.podloga)} (ostatnio wybrane w Architekcie)`;
  else {
    const kier = { 1: "północ", 2: "południe", 4: "wschód", 8: "zachód", 5: "pn-wsch", 6: "pd-wsch", 9: "pn-zach", 10: "pd-zach" }[stan.kierunek] || stan.kierunek;
    const obrot = korzen(n.typ) === "obj" || korzen(n.typ) === "mob" ? ` · kierunek: ${kier}` : "";
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

plotno.addEventListener("mousedown", (e) => {
  if (!stan.mapa) return;
  const r = plotno.getBoundingClientRect();
  const kaf = widok.naKafelek(e.clientX - r.left, e.clientY - r.top);
  if (e.button === 1 || e.button === 2) {
    przesuwanie = { x: e.clientX, y: e.clientY, kx: widok.kam.x, ky: widok.kam.y, ruszyl: false, przycisk: e.button };
    e.preventDefault();
    return;
  }
  if (e.button !== 0) return;
  if (!stan.narzedzie) {
    stan.wybrany = stan.mapa.wewnatrz(kaf.x, kaf.y) ? kaf : null;
    stan.edycjaZm = null;
    pokazInspekcje();
    widok.rysuj();
    return;
  }
  stan.kursor = kaf;
  stan.przeciaganie = { start: kaf, pola: new Map([[kluczPola(kaf.x, kaf.y), kaf]]), shift: e.shiftKey };
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
  if (stan.przeciaganie && stan.narzedzie?.tryb === "pojedynczo" && stan.mapa.wewnatrz(kaf.x, kaf.y)) stan.przeciaganie.pola.set(kluczPola(kaf.x, kaf.y), kaf);
  if (zmiana) { pokazInfo(); widok.rysuj(); }
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
  if (e.button === 0 && stan.przeciaganie) {
    wykonaj();
    stan.przeciaganie = null;
    pokazPodpowiedz(ostatniaMysz);
    widok.rysuj();
  }
});

plotno.addEventListener("mouseleave", () => { $("#info").classList.add("ukryty"); });

plotno.addEventListener("wheel", (e) => {
  e.preventDefault();
  const r = plotno.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  const stary = widok.kam.zoom;
  let i = ZOOMY.indexOf(stary);
  if (i < 0) i = ZOOMY.findIndex((z) => z >= stary);
  i = Math.max(0, Math.min(ZOOMY.length - 1, i + (e.deltaY < 0 ? 1 : -1)));
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

window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") {
    if (e.key === "Escape") e.target.blur();
    return;
  }
  const k = e.key.toLowerCase();
  if (e.ctrlKey && k === "s") { e.preventDefault(); zapisz(); return; }
  if (e.ctrlKey && k === "z") { e.preventDefault(); e.shiftKey ? ponow() : cofnij(); return; }
  if (e.ctrlKey && k === "y") { e.preventDefault(); ponow(); return; }
  if (e.ctrlKey) return;
  if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
    const pusto = !wcisniete.size;
    wcisniete.add(k);
    if (pusto) requestAnimationFrame(petlaRuchu);
    e.preventDefault();
    return;
  }
  if (k === "q" || k === "e") { stan.kierunek = obrot(stan.kierunek, k === "e" ? 1 : -1); zdarzenie("obrot"); pokazPodpowiedz(ostatniaMysz); widok.rysuj(); }
  else if (k === "shift") { pokazPodpowiedz(ostatniaMysz); widok.rysuj(); }
  else if (k === "escape") { if (stan.narzedzie) anulujNarzedzie(); else { stan.wybrany = null; pokazInspekcje(); widok.rysuj(); } }
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
window.addEventListener("beforeunload", (e) => { if (stan.zmiany) { e.preventDefault(); e.returnValue = ""; } });

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
function pokazListeMap() {
  const f = $("#szukaj-mapy").value.trim().toLowerCase();
  const el = $("#lista-map");
  el.innerHTML = "";
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

// ---------------------------------------------------------------- start

async function start() {
  ladowanie("Wczytuję typy z kodu…");
  try {
    const [info, kat] = await Promise.all([
      fetch("/api/info").then((r) => r.json()),
      fetch("kategorie.json").then((r) => r.json()),
      wczytajTypy(),
    ]);
    listaMap = info.mapy;
    stan.kategorie = [...kat.kategorie, { id: "szablony", nazwa: "Szablony", ikona: "/obj/item/paper", reguly: [] }];
    stan.tryby = kat.tryby;
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
    let ostatnia = null;
    try { ostatnia = localStorage.getItem("ostatnia-mapa"); } catch {}
    const dom = listaMap.find((m) => m.plik === ostatnia) || listaMap.find((m) => /Atlas\/atlas\.dmm$/i.test(m.plik));
    if (dom) await otworzMape(dom.plik);
    else $("#b-otworz").click();
  } catch (e) {
    ladowanie(null);
    komunikat("Błąd startu: " + e.message, true);
    console.error(e);
  }
}
start();

// Dostęp z konsoli do testów.
window.edytor = { stan, widok, historia };
