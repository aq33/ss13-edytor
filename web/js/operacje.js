// Operacje na całej mapie: nowa mapa, rozmiar, poziomy, szukaj i zamień (też edycja wielu
// obiektów naraz), eksport do PNG. main.js przekazuje ctx z dostępem do swojego stanu.

import { Mapa, atomNaTekst } from "./dmm.js";
import { istnieje, jestTypu, zmienne, wszystkie } from "./typy.js";

let ctx;
export function initOperacje(c) { ctx = c; }

const $ = (s) => document.querySelector(s);
const KOSMOS = [{ typ: "/turf/open/space/basic", zm: [] }, { typ: "/area/space", zm: [] }];

// ---------------------------------------------------------------- okno dialogowe

// pola: [{ id, etykieta, typ: "text"|"number"|"select"|"checkbox", wartosc, opcje: [[wartość, opis]], lista }]
export function dialog(tytul, opis, pola, przycisk = "OK") {
  return new Promise((ok) => {
    const okno = $("#okno-dialog");
    const tresc = okno.querySelector(".okno-tresc");
    tresc.innerHTML = "";
    const h = document.createElement("div");
    h.className = "start-tytul";
    h.textContent = tytul;
    tresc.append(h);
    if (opis) { const p = document.createElement("p"); p.innerHTML = opis; tresc.append(p); }
    const pola_ = {};
    for (const p of pola) {
      const w = document.createElement("label");
      w.className = "pole";
      const e = document.createElement("span");
      e.textContent = p.etykieta;
      let we;
      if (p.typ === "select") {
        we = document.createElement("select");
        for (const [v, t] of p.opcje) { const o = document.createElement("option"); o.value = v; o.textContent = t; we.append(o); }
        we.value = p.wartosc;
      } else {
        we = document.createElement("input");
        we.type = p.typ || "text";
        if (p.typ === "checkbox") we.checked = !!p.wartosc; else we.value = p.wartosc ?? "";
        if (p.typ === "number") { we.min = p.min ?? 1; we.max = p.max ?? 1000; }
        if (p.lista) we.setAttribute("list", p.lista);
        we.spellcheck = false;
      }
      w.append(e, we);
      tresc.append(w);
      pola_[p.id] = we;
    }
    const dol = document.createElement("div");
    dol.className = "szybkie przyciski-dialogu";
    const b = document.createElement("button");
    b.className = "wlaczony";
    b.textContent = przycisk;
    const a = document.createElement("button");
    a.textContent = "Anuluj";
    dol.append(b, a);
    tresc.append(dol);
    const zamknij = (wynik) => { okno.classList.add("ukryty"); okno.onkeydown = null; ok(wynik); };
    b.onclick = () => {
      const w = {};
      for (const [k, el] of Object.entries(pola_)) w[k] = el.type === "checkbox" ? el.checked : el.type === "number" ? +el.value : el.value.trim();
      zamknij(w);
    };
    a.onclick = () => zamknij(null);
    okno.onkeydown = (e) => { if (e.key === "Escape") zamknij(null); if (e.key === "Enter" && e.target.tagName !== "SELECT") b.click(); };
    okno.classList.remove("ukryty");
    (Object.values(pola_)[0] || b).focus();
  });
}

// Lista typów do podpowiedzi w polach (datalist).
function listaTypow() {
  const el = $("#lista-typow");
  if (el.childElementCount) return;
  const frag = document.createDocumentFragment();
  for (const t of wszystkie()) { const o = document.createElement("option"); o.value = t; frag.append(o); }
  el.append(frag);
}

// ---------------------------------------------------------------- nowa mapa i rozmiar

export async function nowaMapa() {
  listaTypow();
  const w = await dialog("Nowa mapa", "Mapa powstanie w edytorze. Na dysk trafi dopiero po zapisaniu.", [
    { id: "plik", etykieta: "Plik", wartosc: "_maps/map_files/nowa_mapa.dmm" },
    { id: "szer", etykieta: "Szerokość", typ: "number", wartosc: 100, max: 1000 },
    { id: "wys", etykieta: "Wysokość", typ: "number", wartosc: 100, max: 1000 },
    { id: "poziomy", etykieta: "Poziomy (Z)", typ: "number", wartosc: 1, max: 16 },
    { id: "turf", etykieta: "Wypełnienie", wartosc: KOSMOS[0].typ, lista: "lista-typow" },
    { id: "obszar", etykieta: "Obszar", wartosc: KOSMOS[1].typ, lista: "lista-typow" },
  ], "Utwórz");
  if (!w) return;
  if (!/^[\w\-./ ]+\.dmm$/i.test(w.plik)) return ctx.komunikat("Ścieżka musi kończyć się na .dmm", true);
  if (!istnieje(w.turf) || !w.turf.startsWith("/turf")) return ctx.komunikat("Nieznany turf: " + w.turf, true);
  if (!istnieje(w.obszar) || !w.obszar.startsWith("/area")) return ctx.komunikat("Nieznany obszar: " + w.obszar, true);
  if (ctx.listaMap().some((m) => m.plik.toLowerCase() === w.plik.toLowerCase()) && !confirm(`Plik ${w.plik} już istnieje. Zapis go nadpisze. Kontynuować?`)) return;
  const mapa = Mapa.nowa(w.plik, w.szer, w.wys, w.poziomy, [{ typ: w.turf, zm: [] }, { typ: w.obszar, zm: [] }]);
  mapa.nowa = true;
  await ctx.dodajKarte(mapa);
  ctx.ustawZmiany(true);
  if (!ctx.listaMap().some((m) => m.plik === w.plik)) ctx.listaMap().push({ plik: w.plik, rozmiar: 0 });
}

const wypelnienie = (mapa) => mapa.dodajPrefab(KOSMOS.map((a) => ({ ...a })));

function poZmianieStruktury(opis) {
  // Zmiana rozmiaru i poziomów przestawia całą siatkę – starej historii nie da się już zastosować.
  ctx.historia.wstecz = [];
  ctx.historia.naprzod = [];
  ctx.ustawZmiany(true);
  ctx.widok.ustawMape(ctx.stan.mapa);
  ctx.odswiezTytul();
  ctx.pokazPoziomy();
  ctx.widok.rysuj();
  ctx.komunikat(opis);
}

export async function zmienRozmiar() {
  const m = ctx.stan.mapa;
  if (!m) return;
  const w = await dialog("Rozmiar mapy", `Teraz: ${m.szer}×${m.wys}. Nowe pola wypełni kosmos. Tej operacji nie da się cofnąć (historia zostanie wyczyszczona).`, [
    { id: "szer", etykieta: "Szerokość", typ: "number", wartosc: m.szer, max: 1000 },
    { id: "wys", etykieta: "Wysokość", typ: "number", wartosc: m.wys, max: 1000 },
    { id: "kotwica", etykieta: "Stara zawartość", typ: "select", wartosc: "ld", opcje: [
      ["lg", "lewy górny róg"], ["sg", "góra, środek"], ["pg", "prawy górny róg"],
      ["ls", "lewo, środek"], ["ss", "środek"], ["ps", "prawo, środek"],
      ["ld", "lewy dolny róg"], ["sd", "dół, środek"], ["pd", "prawy dolny róg"]] },
  ], "Zmień rozmiar");
  if (!w || w.szer < 1 || w.wys < 1) return;
  const roznX = w.szer - m.szer, roznY = w.wys - m.wys;
  const dx = w.kotwica[0] === "l" ? 0 : w.kotwica[0] === "s" ? Math.floor(roznX / 2) : roznX;
  const dy = w.kotwica[1] === "d" ? 0 : w.kotwica[1] === "s" ? Math.floor(roznY / 2) : roznY;
  m.zmienRozmiar(w.szer, w.wys, dx, dy, wypelnienie(m));
  ctx.stan.wybrany = null;
  poZmianieStruktury(`Nowy rozmiar: ${w.szer}×${w.wys}`);
}

export function dodajPoziom() {
  const m = ctx.stan.mapa;
  if (!m) return;
  if (!confirm(`Dodać nowy poziom (Z ${ctx.widok.z + 1}) nad bieżącym? Historia cofania zostanie wyczyszczona.`)) return;
  m.dodajPoziom(wypelnienie(m), ctx.widok.z);
  const z = ctx.widok.z + 1;
  poZmianieStruktury(`Dodano poziom ${z}`);
  ctx.ustawPoziom(z);
}

export function usunPoziom() {
  const m = ctx.stan.mapa;
  if (!m) return;
  if (m.poziomy <= 1) return ctx.komunikat("Mapa ma tylko jeden poziom", true);
  const z = ctx.widok.z;
  if (!confirm(`Usunąć poziom ${z} razem z całą zawartością? Tej operacji nie da się cofnąć.`)) return;
  m.usunPoziom(z);
  poZmianieStruktury(`Usunięto poziom ${z}`);
  ctx.ustawPoziom(Math.min(z, m.poziomy));
}

// ---------------------------------------------------------------- szukaj i zamień

const wyniki = { lista: [], dopasuj: null };
export const wynikiSzukania = () => wyniki.lista;

function zakresPol(zakres) {
  const m = ctx.stan.mapa;
  const z0 = zakres === "wszystkie" ? 1 : ctx.widok.z, z1 = zakres === "wszystkie" ? m.poziomy : ctx.widok.z;
  let x0 = 1, y0 = 1, x1 = m.szer, y1 = m.wys;
  const zaz = ctx.stan.zaznaczenie;
  if (zakres === "zaznaczenie" && zaz) ({ x0, y0, x1, y1 } = zaz);
  return { z0, z1, x0, y0, x1, y1 };
}

function dopasowanie() {
  const typ = $("#sz-typ").value.trim();
  const podtypy = $("#sz-podtypy").checked;
  if (!typ) return null;
  return (a) => a.typ === typ || (podtypy && jestTypu(a.typ, typ));
}

export function szukaj() {
  const m = ctx.stan.mapa;
  const dop = dopasowanie();
  wyniki.lista = [];
  if (!m || !dop) { pokazWyniki(); return; }
  const { z0, z1, x0, y0, x1, y1 } = zakresPol($("#sz-zakres").value);
  const pasujePrefab = new Map();
  for (let z = z0; z <= z1; z++) {
    const s = m.siatki[z - 1];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const idx = s[(y - 1) * m.szer + (x - 1)];
      if (idx < 0) continue;
      let ile = pasujePrefab.get(idx);
      if (ile === undefined) { ile = m.prefaby[idx].atomy.filter(dop).length; pasujePrefab.set(idx, ile); }
      if (ile) wyniki.lista.push({ x, y, z, ile });
    }
  }
  wyniki.dopasuj = dop;
  pokazWyniki();
  if (wyniki.lista.length) ctx.zdarzenie("szukaj");
  ctx.widok.rysuj();
}

function pokazWyniki() {
  const el = $("#sz-wyniki");
  const suma = wyniki.lista.reduce((s, w) => s + w.ile, 0);
  el.innerHTML = "";
  const n = document.createElement("div");
  n.className = "przygaszone";
  n.textContent = wyniki.lista.length ? `Znaleziono ${suma} obiektów na ${wyniki.lista.length} kafelkach` : "Brak wyników";
  el.append(n);
  for (const w of wyniki.lista.slice(0, 300)) {
    const d = document.createElement("div");
    d.className = "wynik";
    d.textContent = `(${w.x}, ${w.y}, ${w.z})${w.ile > 1 ? " ×" + w.ile : ""}`;
    d.onclick = () => ctx.pokazKafelek(w.x, w.y, w.z);
    el.append(d);
  }
  if (wyniki.lista.length > 300) el.insertAdjacentHTML("beforeend", `<div class="przygaszone">…i ${wyniki.lista.length - 300} więcej</div>`);
  for (const b of document.querySelectorAll("#szukaj-panel .wymaga-wynikow")) b.disabled = !wyniki.lista.length;
}

// Przekształca każdy pasujący atom we wszystkich kafelkach wyników (jedna operacja w historii).
function przeksztalc(fn, opis) {
  const m = ctx.stan.mapa;
  const dop = wyniki.dopasuj;
  if (!m || !dop || !wyniki.lista.length) return;
  const pamiec = new Map();
  let zmienione = 0;
  ctx.historia.zacznij();
  for (const w of wyniki.lista) {
    const idx = m.prefab(w.x, w.y, w.z);
    let nowy = pamiec.get(idx);
    if (nowy === undefined) {
      const atomy = m.prefaby[idx].atomy;
      const wynik = [];
      for (const a of atomy) { if (!dop(a)) { wynik.push(a); continue; } const b = fn(a); if (b) wynik.push(b); }
      nowy = m.dodajPrefab(wynik);
      pamiec.set(idx, nowy);
    }
    if (nowy !== idx) { ctx.zmienKafelek(w.x, w.y, m.prefaby[nowy].atomy, w.z); zmienione++; }
  }
  ctx.historia.zakoncz();
  if (zmienione) ctx.ustawZmiany(true);
  ctx.komunikat(`${opis}: ${zmienione} kafelków`);
  ctx.pokazInspekcje();
  szukaj();
}

export function zamien() {
  const nowy = $("#sz-na").value.trim();
  if (!istnieje(nowy)) return ctx.komunikat("Nieznany typ: " + nowy, true);
  const sa = $("#sz-zachowaj").checked;
  const r = nowy.match(/^\/(area|turf|obj|mob)/)?.[1];
  const stary = $("#sz-typ").value.trim().match(/^\/(area|turf|obj|mob)/)?.[1];
  if (r !== stary && !confirm(`Zamieniasz ${stary} na ${r}. To zwykle błąd. Kontynuować?`)) return;
  przeksztalc((a) => ({ typ: nowy, zm: sa ? a.zm.map((e) => [...e]) : [] }), "Zamieniono");
}

export function usunWszystkie() {
  if (!confirm("Usunąć wszystkie znalezione obiekty? (Turfy i obszary zostaną, je trzeba zamienić.)")) return;
  przeksztalc((a) => (a.typ.startsWith("/turf") || a.typ.startsWith("/area") ? a : null), "Usunięto");
}

// Edycja zmiennych wszystkich znalezionych naraz: pusta wartość usuwa zmienną.
export async function edytujWszystkie() {
  if (!wyniki.lista.length) return;
  const w = await dialog("Zmienne wszystkich znalezionych", "Wpisz zmienną i wartość, które dostaną wszystkie znalezione obiekty. Pusta wartość <b>usuwa</b> tę edycję (wraca wartość z kodu). Teksty wpisuj w cudzysłowie, np. <code>\"Korytarz\"</code>.", [
    { id: "n1", etykieta: "Zmienna 1", wartosc: "" }, { id: "v1", etykieta: "Wartość 1", wartosc: "" },
    { id: "n2", etykieta: "Zmienna 2", wartosc: "" }, { id: "v2", etykieta: "Wartość 2", wartosc: "" },
    { id: "n3", etykieta: "Zmienna 3", wartosc: "" }, { id: "v3", etykieta: "Wartość 3", wartosc: "" },
  ], "Zastosuj do wszystkich");
  if (!w) return;
  const zmiany = [1, 2, 3].map((i) => [w["n" + i], w["v" + i]]).filter(([n]) => /^[A-Za-z_]\w*$/.test(n));
  if (!zmiany.length) return;
  przeksztalc((a) => {
    let zm = a.zm.filter(([k]) => !zmiany.some(([n]) => n === k));
    for (const [n, v] of zmiany) if (v !== "") zm.push([n, v]);
    zm = zm.sort((p, q) => (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : 0));
    return { typ: a.typ, zm };
  }, "Zmieniono zmienne");
}

export function przelaczSzukanie(pokaz) {
  const el = $("#szukaj-panel");
  const widac = pokaz ?? el.classList.contains("ukryty");
  el.classList.toggle("ukryty", !widac);
  if (widac) { listaTypow(); $("#sz-typ").focus(); }
  else { wyniki.lista = []; wyniki.dopasuj = null; ctx.widok.rysuj(); }
}

export function initSzukanie() {
  $("#sz-szukaj").onclick = szukaj;
  $("#sz-typ").onkeydown = (e) => { if (e.key === "Enter") szukaj(); };
  $("#sz-zakres").onchange = szukaj;
  $("#sz-podtypy").onchange = szukaj;
  $("#sz-zamien").onclick = zamien;
  $("#sz-usun").onclick = usunWszystkie;
  $("#sz-edytuj").onclick = edytujWszystkie;
  $("#sz-zamknij").onclick = () => przelaczSzukanie(false);
  $("#sz-zaznacz").onclick = () => ctx.zacznijZaznaczanie();
  $("#sz-z-kafelka").onclick = () => {
    // typ z kafelka zaznaczonego w inspekcji (pierwszy obiekt, inaczej turf)
    const w = ctx.stan.wybrany;
    if (!w) return ctx.komunikat("Najpierw zaznacz kafelek w inspekcji", true);
    const atomy = ctx.stan.mapa.atomy(w.x, w.y, ctx.widok.z);
    const a = atomy.find((x) => x.typ.startsWith("/obj") || x.typ.startsWith("/mob")) || atomy.find((x) => x.typ.startsWith("/turf"));
    if (a) { $("#sz-typ").value = a.typ; szukaj(); }
  };
}

// ---------------------------------------------------------------- eksport PNG

export async function eksportPng() {
  const m = ctx.stan.mapa;
  if (!m) return;
  const w = await dialog("Eksport do PNG", `Zapisze obraz poziomu ${ctx.widok.z} z warstwami ustawionymi w panelu „Widok”.`, [
    { id: "res", etykieta: "Kafelek w pikselach", typ: "select", wartosc: "16", opcje: [["32", `32 px (${m.szer * 32}×${m.wys * 32})`], ["16", `16 px (${m.szer * 16}×${m.wys * 16})`], ["8", `8 px (${m.szer * 8}×${m.wys * 8})`], ["4", `4 px (${m.szer * 4}×${m.wys * 4})`]] },
  ], "Eksportuj");
  if (!w) return;
  ctx.ladowanie("Rysuję obraz mapy…");
  try {
    const blob = await ctx.widok.eksport(+w.res);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = m.plik.split("/").pop().replace(/\.dmm$/i, "") + `_z${ctx.widok.z}.png`;
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    ctx.komunikat("Zapisano " + a.download);
  } catch (e) {
    ctx.komunikat("Eksport nie udał się: " + e.message, true);
  } finally {
    ctx.ladowanie(null);
  }
}

export { atomNaTekst, zmienne };
