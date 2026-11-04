// Wczytywanie ikon .dmi: to zwykłe PNG z opisem stanów w bloku zTXt/tEXt "Description".

import { zrodlo } from "./zrodlo.js";

const ikony = new Map();        // ścieżka -> Promise<Ikona|null>
const gotowe = new Map();       // ścieżka -> Ikona|null (po wczytaniu)
const sluchacze = new Set();

// Kolejność kierunków w pliku .dmi.
const KOLEJNOSC_KIERUNKOW = { 2: 0, 1: 1, 4: 2, 8: 3, 6: 4, 10: 5, 5: 6, 9: 7 };

export function poWczytaniu(fn) { sluchacze.add(fn); }

async function rozpakuj(dane) {
  const strumien = new Blob([dane]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new TextDecoder().decode(await new Response(strumien).arrayBuffer());
}

async function opisPng(bufor) {
  const v = new DataView(bufor);
  let i = 8;
  while (i + 8 <= bufor.byteLength) {
    const dlugosc = v.getUint32(i);
    const typ = String.fromCharCode(v.getUint8(i + 4), v.getUint8(i + 5), v.getUint8(i + 6), v.getUint8(i + 7));
    const dane = new Uint8Array(bufor, i + 8, dlugosc);
    if (typ === "zTXt" || typ === "tEXt") {
      const zero = dane.indexOf(0);
      const klucz = new TextDecoder().decode(dane.subarray(0, zero));
      if (klucz === "Description") {
        if (typ === "tEXt") return new TextDecoder().decode(dane.subarray(zero + 1));
        return rozpakuj(dane.subarray(zero + 2));
      }
    }
    if (typ === "IEND") break;
    i += 12 + dlugosc;
  }
  return null;
}

function parsujOpis(tekst) {
  const wynik = { szer: 32, wys: 32, stany: new Map() };
  let indeks = 0;
  let stan = null;
  const zamknij = () => {
    if (!stan) return;
    stan.indeks = indeks;
    indeks += stan.kierunki * stan.klatki;
    // Pierwszy stan o danej nazwie wygrywa – tak samo robi BYOND.
    if (!wynik.stany.has(stan.nazwa)) wynik.stany.set(stan.nazwa, stan);
  };
  for (const linia of tekst.split("\n")) {
    const m = linia.trim().match(/^(\w+)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, klucz, wartosc] = m;
    if (klucz === "width") wynik.szer = +wartosc;
    else if (klucz === "height") wynik.wys = +wartosc;
    else if (klucz === "state") {
      zamknij();
      stan = { nazwa: JSON.parse(wartosc.replace(/\\/g, "\\\\")), kierunki: 1, klatki: 1 };
    } else if (stan && klucz === "dirs") stan.kierunki = +wartosc;
    else if (stan && klucz === "frames") stan.klatki = +wartosc;
  }
  zamknij();
  return wynik;
}

async function wczytaj(sciezka) {
  try {
    const bufor = await zrodlo.bajty(sciezka);
    if (!bufor) return null;
    const opis = await opisPng(bufor);
    const obraz = await createImageBitmap(new Blob([bufor], { type: "image/png" }));
    const meta = opis ? parsujOpis(opis) : { szer: obraz.width, wys: obraz.height, stany: new Map([["", { nazwa: "", kierunki: 1, klatki: 1, indeks: 0 }]]) };
    meta.obraz = obraz;
    meta.kolumny = Math.max(1, Math.floor(obraz.width / meta.szer));
    return meta;
  } catch (e) {
    console.warn("Nie wczytano ikony", sciezka, e);
    return null;
  }
}

export function ikona(sciezka) {
  if (!sciezka) return Promise.resolve(null);
  let p = ikony.get(sciezka);
  if (!p) {
    p = wczytaj(sciezka).then((ik) => {
      gotowe.set(sciezka, ik);
      for (const fn of sluchacze) fn(sciezka);
      return ik;
    });
    ikony.set(sciezka, p);
  }
  return p;
}

export function ikonaGotowa(sciezka) {
  if (!gotowe.has(sciezka)) { ikona(sciezka); return undefined; }
  return gotowe.get(sciezka);
}

// Zwraca wycinek obrazka dla stanu i kierunku albo null.
export function klatka(ik, stan, kierunek = 2, scisle = false) {
  if (!ik) return null;
  let s = ik.stany.get(stan ?? "");
  if (!s && !scisle) s = ik.stany.get("");
  if (!s) return null;
  let k = 0;
  if (s.kierunki === 4 || s.kierunki === 8) {
    if (s.kierunki === 4 && !(kierunek in { 1: 1, 2: 1, 4: 1, 8: 1 })) kierunek = kierunek & 4 ? 4 : kierunek & 8 ? 8 : 2;
    k = KOLEJNOSC_KIERUNKOW[kierunek] ?? 0;
  }
  const n = s.indeks + k;
  return {
    obraz: ik.obraz,
    sx: (n % ik.kolumny) * ik.szer,
    sy: Math.floor(n / ik.kolumny) * ik.wys,
    w: ik.szer,
    h: ik.wys,
    kierunki: s.kierunki,
  };
}

export function maStan(ik, stan) {
  return !!ik && (ik.stany.has(stan ?? "") || ik.stany.has(""));
}
