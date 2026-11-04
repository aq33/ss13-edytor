// Rysowanie mapy na canvasie. Mapę dzielę na kawałki 16x16 kafelków, które
// trzymam w pamięci jako gotowe obrazki i przerysowuję tylko po zmianie.

import { ikonaGotowa, klatka, poWczytaniu } from "./dmi.js";
import { zmienneAtomu, korzen } from "./typy.js";
import { wygladz } from "./wygladzanie.js";

const KAWALEK = 16;
const MARGINES = 2;          // kafelki z sąsiedztwa, których grafika może wejść na kawałek
const LIMIT_KAWALKOW = 400;

// Do której warstwy widoku należy atom (do przełączników „pokaż/ukryj”).
export function warstwaAtomu(typ) {
  if (typ.startsWith("/area")) return "obszary";
  if (typ.startsWith("/obj/machinery/atmospherics/pipe") || typ.startsWith("/obj/structure/disposalpipe")) return "rury";
  if (typ.startsWith("/obj/structure/cable")) return "kable";
  if (typ.startsWith("/obj/effect/turf_decal") || typ.startsWith("/obj/effect/decal")) return "dekale";
  if (typ.startsWith("/obj/effect/landmark") || typ.startsWith("/obj/effect/mapping_helpers") || typ.startsWith("/obj/effect/spawner") || typ.startsWith("/obj/docking_port")) return "pomocnicze";
  if (typ.startsWith("/turf")) return "podloze";
  return "obiekty";
}

const tinty = new Map();
function zabarwiona(kl, kolor) {
  const klucz = kl.obraz.__id + ":" + kl.sx + ":" + kl.sy + ":" + kolor;
  let c = tinty.get(klucz);
  if (c) return c;
  c = new OffscreenCanvas(kl.w, kl.h);
  const g = c.getContext("2d");
  g.drawImage(kl.obraz, kl.sx, kl.sy, kl.w, kl.h, 0, 0, kl.w, kl.h);
  g.globalCompositeOperation = "multiply";
  g.fillStyle = kolor;
  g.fillRect(0, 0, kl.w, kl.h);
  g.globalCompositeOperation = "destination-in";
  g.drawImage(kl.obraz, kl.sx, kl.sy, kl.w, kl.h, 0, 0, kl.w, kl.h);
  if (tinty.size > 4000) tinty.clear();
  tinty.set(klucz, c);
  return c;
}
let licznikObrazow = 0;

function kolorObszaru(typ) {
  let h = 0;
  for (const c of typ) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsla(${h % 360}, 70%, 55%, 0.28)`;
}

// Przygotowuje element do narysowania (albo null). brak.ladowanie = true, jeśli ikona jeszcze się wczytuje.
export function elementAtomu(atom, brak) {
  const v = zmienneAtomu(atom);
  if (!v.icon) return null;
  const ik = ikonaGotowa(v.icon);
  if (ik === undefined) { if (brak) brak.ladowanie = true; return null; }
  if (!ik) return null;
  if (!ik.obraz.__id) ik.obraz.__id = ++licznikObrazow;
  const kl = klatka(ik, v.icon_state, v.dir | 0);
  return { kl, v, ik };
}

function rysujElement(g, el, px, py, skala, alfa = 1) {
  const { kl, v } = el;
  if (!kl) return;
  const dx = px + ((v.pixel_x | 0) + (v.pixel_w | 0)) * skala;
  const dy = py + (32 - kl.h - (v.pixel_y | 0) - (v.pixel_z | 0)) * skala;
  const a = (v.alpha ?? 255) / 255 * alfa;
  if (a <= 0) return;
  g.globalAlpha = a;
  if (v.color && typeof v.color === "string" && v.color.startsWith("#") && v.color.toLowerCase() !== "#ffffff") {
    g.drawImage(zabarwiona(kl, v.color.slice(0, 7)), 0, 0, kl.w, kl.h, dx, dy, kl.w * skala, kl.h * skala);
  } else {
    g.drawImage(kl.obraz, kl.sx, kl.sy, kl.w, kl.h, dx, dy, kl.w * skala, kl.h * skala);
  }
  g.globalAlpha = 1;
}

export class Widok {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext("2d");
    this.mapa = null;
    this.z = 1;
    this.kam = { x: 0, y: 0, zoom: 32 };   // x,y – kafelek w lewym górnym rogu (od 0)
    this.warstwy = { obszary: false, rury: true, kable: true, dekale: true, pomocnicze: true, podloze: true, obiekty: true };
    this.kawalki = new Map();
    this.nakladki = [];   // funkcje (g, widok) rysowane nad mapą
    this.zaplanowane = false;
    poWczytaniu(() => this.odswiezPoIkonach());
    new ResizeObserver(() => this.dopasuj()).observe(canvas);
    this.dopasuj();
  }

  dopasuj() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.dpr = dpr;
    this.rysuj();
  }

  ustawMape(mapa) {
    this.mapa = mapa;
    this.z = 1;
    this.kawalki.clear();
    this.rysuj();
  }

  // Ponowne narysowanie kawałków, w których brakowało ikon.
  odswiezPoIkonach() {
    clearTimeout(this._ikony);
    this._ikony = setTimeout(() => {
      for (const k of this.kawalki.values()) if (k.niepelny) k.brudny = true;
      this.rysuj();
    }, 60);
  }

  uniewaznij(x, y) {
    // x,y w układzie mapy (od 1, y w górę)
    if (!this.mapa) return;
    const kol = x - 1, wiersz = this.mapa.wys - y;
    for (const k of this.kawalki.values()) {
      if (k.z !== this.z && k.z !== -1) continue;
      const x0 = k.cx * KAWALEK - MARGINES, y0 = k.cy * KAWALEK - MARGINES;
      if (kol >= x0 && kol < x0 + KAWALEK + 2 * MARGINES && wiersz >= y0 && wiersz < y0 + KAWALEK + 2 * MARGINES) k.brudny = true;
    }
  }
  uniewaznijWszystko() { for (const k of this.kawalki.values()) k.brudny = true; }

  // Ekran (px CSS) -> kafelek mapy {x, y} (od 1, y w górę).
  naKafelek(sx, sy) {
    const kol = Math.floor(sx / this.kam.zoom + this.kam.x);
    const wiersz = Math.floor(sy / this.kam.zoom + this.kam.y);
    return { x: kol + 1, y: this.mapa ? this.mapa.wys - wiersz : 0 };
  }
  naEkran(x, y) {
    return { sx: (x - 1 - this.kam.x) * this.kam.zoom, sy: (this.mapa.wys - y - this.kam.y) * this.kam.zoom };
  }

  rysuj() {
    if (this.zaplanowane) return;
    this.zaplanowane = true;
    requestAnimationFrame(() => { this.zaplanowane = false; this._rysuj(); });
  }

  rozdzielczosc() {
    const z = this.kam.zoom;
    return z >= 24 ? 32 : z >= 12 ? 16 : z >= 6 ? 8 : 4;
  }

  _kawalek(cx, cy, res) {
    const klucz = this.z + ":" + cx + ":" + cy + ":" + res;
    let k = this.kawalki.get(klucz);
    if (k && !k.brudny) { k.uzyty = performance.now(); return k; }
    if (!k) {
      if (this.kawalki.size > LIMIT_KAWALKOW) {
        const stare = [...this.kawalki.entries()].sort((a, b) => a[1].uzyty - b[1].uzyty).slice(0, 100);
        for (const [kk] of stare) this.kawalki.delete(kk);
      }
      const c = new OffscreenCanvas(KAWALEK * res, KAWALEK * res);
      k = { c, g: c.getContext("2d"), cx, cy, z: this.z, res };
      this.kawalki.set(klucz, k);
    }
    k.uzyty = performance.now();
    this._narysujKawalek(k);
    return k;
  }

  _narysujKawalek(k) {
    const { g, res } = k;
    const m = this.mapa;
    const skala = res / 32;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, k.c.width, k.c.height);
    const brak = { ladowanie: false };
    const elementy = [];
    const obszary = [];
    const x0 = k.cx * KAWALEK, y0 = k.cy * KAWALEK;
    for (let wr = y0 - MARGINES; wr < y0 + KAWALEK + MARGINES; wr++) {
      for (let kol = x0 - MARGINES; kol < x0 + KAWALEK + MARGINES; kol++) {
        const x = kol + 1, y = m.wys - wr;
        if (!m.wewnatrz(x, y)) continue;
        const atomy = m.atomy(x, y, this.z);
        for (let i = 0; i < atomy.length; i++) {
          const a = atomy[i];
          const w = warstwaAtomu(a.typ);
          if (w === "obszary") {
            if (this.warstwy.obszary && kol >= x0 && kol < x0 + KAWALEK && wr >= y0 && wr < y0 + KAWALEK) obszary.push({ kol, wr, typ: a.typ });
            continue;
          }
          if (!this.warstwy[w]) continue;
          const el = elementAtomu(a, brak);
          if (!el) continue;
          el.kol = kol; el.wr = wr;
          el.plane = el.v.plane | 0;
          el.layer = +el.v.layer || 0;
          el.kolejnosc = (wr * 100000 + kol) * 256 + (atomy.length - i) * 16;
          const wyg = wygladz(m, x, y, this.z, a, el.v);
          if (wyg) {
            if (wyg.bazowy === null) el.kl = null;
            else if (wyg.bazowy !== el.v.icon_state) el.kl = klatka(el.ik, wyg.bazowy, el.v.dir | 0);
            if (el.kl) elementy.push(el);
            wyg.nakladki.forEach((n, j) => {
              const kl = klatka(el.ik, n.stan, n.dir, true);
              if (kl) elementy.push({ ...el, kl, kolejnosc: el.kolejnosc + 1 + j });
            });
            continue;
          }
          if (el.kl) elementy.push(el);
        }
      }
    }
    // BYOND: najpierw plane, potem layer; turf zawsze pod obiektami.
    elementy.sort((a, b) => a.plane - b.plane || a.layer - b.layer || a.kolejnosc - b.kolejnosc);
    for (const el of elementy) rysujElement(g, el, (el.kol - x0) * res, (el.wr - y0) * res, skala);
    for (const o of obszary) {
      g.fillStyle = kolorObszaru(o.typ);
      g.fillRect((o.kol - x0) * res, (o.wr - y0) * res, res, res);
    }
    k.niepelny = brak.ladowanie;
    k.brudny = false;
  }

  _rysuj() {
    const g = this.g;
    const { width, height } = this.canvas;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = "#0b0c0e";
    g.fillRect(0, 0, width, height);
    if (!this.mapa) return;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.imageSmoothingEnabled = false;
    const z = this.kam.zoom;
    const wCss = width / this.dpr, hCss = height / this.dpr;
    const res = this.rozdzielczosc();
    const cx0 = Math.max(0, Math.floor(this.kam.x / KAWALEK));
    const cy0 = Math.max(0, Math.floor(this.kam.y / KAWALEK));
    const cx1 = Math.min(Math.ceil(this.mapa.szer / KAWALEK) - 1, Math.floor((this.kam.x + wCss / z) / KAWALEK));
    const cy1 = Math.min(Math.ceil(this.mapa.wys / KAWALEK) - 1, Math.floor((this.kam.y + hCss / z) / KAWALEK));
    // tło mapy
    const o = this.naEkran(1, this.mapa.wys);
    g.fillStyle = "#15171a";
    g.fillRect(o.sx, o.sy, this.mapa.szer * z, this.mapa.wys * z);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const k = this._kawalek(cx, cy, res);
        const sx = (cx * KAWALEK - this.kam.x) * z, sy = (cy * KAWALEK - this.kam.y) * z;
        g.drawImage(k.c, Math.round(sx), Math.round(sy), Math.ceil(KAWALEK * z), Math.ceil(KAWALEK * z));
      }
    }
    for (const fn of this.nakladki) fn(g, this);
  }

  // Cały bieżący poziom jako PNG (res = piksele na kafelek). Kawałki rysuję bez pamięci podręcznej.
  async eksport(res) {
    const m = this.mapa;
    const c = new OffscreenCanvas(m.szer * res, m.wys * res);
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.fillStyle = "#000";
    g.fillRect(0, 0, c.width, c.height);
    const kawalek = { c: new OffscreenCanvas(KAWALEK * res, KAWALEK * res), res, z: this.z };
    kawalek.g = kawalek.c.getContext("2d");
    for (let cy = 0; cy < Math.ceil(m.wys / KAWALEK); cy++) {
      for (let cx = 0; cx < Math.ceil(m.szer / KAWALEK); cx++) {
        kawalek.cx = cx; kawalek.cy = cy;
        this._narysujKawalek(kawalek);
        g.drawImage(kawalek.c, cx * KAWALEK * res, cy * KAWALEK * res);
      }
      await new Promise((r) => setTimeout(r, 0));
    }
    return await c.convertToBlob({ type: "image/png" });
  }

  // Do nakładek: rysuje atom w kafelku (podgląd przed postawieniem).
  rysujAtom(g, atom, x, y, alfa = 0.6) {
    const el = elementAtomu(atom);
    if (!el || !el.kl) return false;
    const p = this.naEkran(x, y);
    rysujElement(g, el, p.sx, p.sy, this.kam.zoom / 32, alfa);
    return true;
  }
}

// Mała ikonka typu do przycisków w katalogu (canvas 2D).
export function ikonkaTypu(canvas, atom) {
  const g = canvas.getContext("2d");
  g.imageSmoothingEnabled = false;
  const el = elementAtomu(atom);
  if (!el || !el.kl) return false;
  g.clearRect(0, 0, canvas.width, canvas.height);
  const { kl } = el;
  const s = Math.min(canvas.width / kl.w, canvas.height / kl.h);
  const w = kl.w * s, h = kl.h * s;
  const v = el.v;
  if (v.color && typeof v.color === "string" && v.color.startsWith("#") && v.color.toLowerCase() !== "#ffffff") {
    g.drawImage(zabarwiona(kl, v.color.slice(0, 7)), 0, 0, kl.w, kl.h, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  } else {
    g.drawImage(kl.obraz, kl.sx, kl.sy, kl.w, kl.h, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  }
  return true;
}

export { korzen, kolorObszaru };
