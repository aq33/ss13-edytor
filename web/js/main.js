import { Mapa } from "./dmm.js";
import { ikona } from "./dmi.js";
import { wczytajTypy, wszystkie, zmienne, ileUzyc, korzen, zmienneAtomu } from "./typy.js";
import { Widok, ikonkaTypu, kolorObszaru } from "./render.js";
import { nowyAtom, poPostawieniu, mozna, poRozbiorce, bezAtomu, obrocony, obrot, Historia } from "./edycja.js";

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
  const s = n && typeof n === "string" && !n.includes("[") ? n : typ.split("/").pop().replace(/_/g, " ");
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

function pokazPrzyciski() {
  const kat = stan.kategorie.find((k) => k.id === stan.kategoria);
  if (!kat) return;
  $("#kat-nazwa").textContent = kat.nazwa;
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
  const tryb = n?.rodzaj === "rozbiorka" ? "prostokat" : n?.tryb;
  const p = stan.przeciaganie;
  if (!p) return stan.mapa.wewnatrz(stan.kursor.x, stan.kursor.y) ? [stan.kursor] : [];
  if (tryb === "pojedynczo") return [...p.pola.values()];
  return polaPrzeciagniecia(p.start, stan.kursor, tryb);
}

function wykonaj() {
  const n = stan.narzedzie;
  const pola = biezacePola();
  historia.zacznij();
  for (const { x, y } of pola) {
    const atomy = stan.mapa.atomy(x, y, widok.z);
    let nowe = null;
    if (n.rodzaj === "rozbiorka") nowe = poRozbiorce(atomy);
    else {
      const atom = nowyAtom(n.typ, stan.kierunek);
      if (!mozna(atomy, atom)) continue;
      nowe = poPostawieniu(atomy, atom);
    }
    if (nowe) zmienKafelek(x, y, nowe);
  }
  if (historia.biezaca?.size) ustawZmiany(true);
  historia.zakoncz();
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
  const pola = biezacePola();
  if (!n) {
    if (stan.kursor && m.wewnatrz(stan.kursor.x, stan.kursor.y)) {
      const p = w.naEkran(stan.kursor.x, stan.kursor.y);
      g.strokeStyle = "rgba(255,255,255,0.5)";
      g.lineWidth = 1;
      g.strokeRect(p.sx + 0.5, p.sy + 0.5, z - 1, z - 1);
    }
    return;
  }
  for (const { x, y } of pola) {
    const p = w.naEkran(x, y);
    if (n.rodzaj === "rozbiorka") {
      g.fillStyle = "rgba(192,69,58,0.35)";
      g.fillRect(p.sx, p.sy, z, z);
      continue;
    }
    const atom = nowyAtom(n.typ, stan.kierunek);
    const ok = mozna(m.atomy(x, y, w.z), atom);
    if (n.typ.startsWith("/area")) {
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
    if (rk !== "area") przycisk("✕", rk === "turf" ? "Zamień na poszycie" : "Usuń", () => zmien(bezAtomu(atomy, i)));
    el.append(r);
  });
  el.classList.remove("ukryty");
}

function pokazPodpowiedz(e) {
  const el = $("#podpowiedz");
  const n = stan.narzedzie;
  if (!n || !e) { el.classList.add("ukryty"); return; }
  let tekst;
  if (n.rodzaj === "rozbiorka") tekst = "Rozbiórka – przeciągnij, żeby usunąć obiekty (ściany zostają poszyciem)";
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
    pokazInspekcje();
    widok.rysuj();
    return;
  }
  stan.kursor = kaf;
  stan.przeciaganie = { start: kaf, pola: new Map([[kluczPola(kaf.x, kaf.y), kaf]]) };
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
  if (k === "q" || k === "e") { stan.kierunek = obrot(stan.kierunek, k === "e" ? 1 : -1); pokazPodpowiedz(ostatniaMysz); widok.rysuj(); }
  else if (k === "escape") { if (stan.narzedzie) anulujNarzedzie(); else { stan.wybrany = null; pokazInspekcje(); widok.rysuj(); } }
  else if (k === "pageup") ustawPoziom(widok.z + 1);
  else if (k === "pagedown") ustawPoziom(widok.z - 1);
  else if (k === "b") przelaczArchitekta();
  else if (k === "x") ustawRozbiorke();
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
function ustawRozbiorke() {
  if (stan.narzedzie?.rodzaj === "rozbiorka") anulujNarzedzie();
  else { stan.narzedzie = { rodzaj: "rozbiorka" }; odswiezPrzyciskiNarzedzi(); }
}

$("#b-architekt").onclick = przelaczArchitekta;
$("#b-rozbiorka").onclick = ustawRozbiorke;
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
    stan.kategorie = kat.kategorie;
    stan.tryby = kat.tryby;
    zbudujKatalog();
    pokazKategorie();
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
