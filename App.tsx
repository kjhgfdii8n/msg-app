import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert as RNAlert, Animated, BackHandler, Dimensions, Easing, FlatList, Image, KeyboardAvoidingView, Linking, Modal, PanResponder, Platform, Pressable, RefreshControl, ScrollView, StatusBar as RNStatusBar, StyleSheet, Text, TextInput, Vibration, View } from 'react-native';
// ===== Web-Version: Hilfen =====
const IS_WEB = Platform.OS === 'web';
// Im Browser gibt es kein Alert: einfache Ersatz-Dialoge
const Alert: { alert: (title: string, msg?: string, buttons?: any[]) => void } = IS_WEB ? {
  alert: (title, msg, buttons) => {
    const g: any = globalThis as any;
    const text = [title, msg].filter(Boolean).join('\n\n');
    if (!buttons || buttons.length <= 1) { g.alert?.(text); buttons?.[0]?.onPress?.(); return; }
    const acts = buttons.filter((b: any) => b.style !== 'cancel');
    if (acts.length === 1) { if (g.confirm?.(`${text}\n\nOK = ${acts[0].text}`)) acts[0].onPress?.(); return; }
    for (const b of acts) { if (g.confirm?.(`${text}\n\nOK = ${b.text}   |   Abbrechen = weiter`)) { b.onPress?.(); return; } }
  },
} : RNAlert;
// Im Browser dürfen fremde Seiten nicht direkt geladen werden: über die eigene Netlify-Funktion
const px = (u: string) => (IS_WEB ? `/.netlify/functions/page?u=${encodeURIComponent(u)}` : u);
// Optionale Pakete: fehlt eines, läuft die App trotzdem (nur ohne diese Funktion)
let Location: any = null;
try { Location = require('expo-location'); } catch (e) { Location = null; }
let Haptics: any = null;
try { Haptics = require('expo-haptics'); } catch (e) { Haptics = null; }
let WebBrowser: any = null;
try { WebBrowser = require('expo-web-browser'); } catch (e) { WebBrowser = null; }
let DeviceCal: any = null;
try { DeviceCal = require('expo-calendar'); } catch (e) { DeviceCal = null; }
if (IS_WEB) { Haptics = null; DeviceCal = null; }
let Store: any = null;
try { Store = require('@react-native-async-storage/async-storage').default; } catch (e) { Store = null; }
// Winziges Vibrations-Feedback (z. B. beim Neuladen einer Seite)
const buzz = () => {
  try {
    if (Haptics?.impactAsync) Haptics.impactAsync(Haptics.ImpactFeedbackStyle?.Light ?? 'light');
    else if (Platform.OS === 'android') Vibration.vibrate(15);
  } catch (e) {}
};
// ---- Design: Hell/Dunkel + App-Farbe (alles wird zentral aus diesen Werten gebaut) ----
type Mode = 'light' | 'dark';
type AccentKey = 'rot' | 'blau' | 'hellblau' | 'lila' | 'gruen' | 'tuerkis' | 'gelb' | 'orange' | 'rosa';
const ACCENTS: Record<AccentKey, { label: string; main: string; deep: string; lite: string }> = {
  rot: { label: 'Original Rot', main: '#801619', deep: '#5E1013', lite: '#FF8A8D' },
  blau: { label: 'Blau', main: '#1F4E9E', deep: '#143672', lite: '#8DB6FF' },
  lila: { label: 'Lila', main: '#6A2C91', deep: '#491E65', lite: '#CBA2F0' },
  gruen: { label: 'Grün', main: '#1F7A3E', deep: '#14562B', lite: '#7FD69C' },
  tuerkis: { label: 'Türkis', main: '#0B8383', deep: '#075C5C', lite: '#6FE0DA' },
  gelb: { label: 'Gelb', main: '#C79A00', deep: '#8A6A00', lite: '#FFD54F' },
  hellblau: { label: 'Hellblau', main: '#2386C8', deep: '#14618F', lite: '#8CD3FF' },
  orange: { label: 'Orange', main: '#E8650A', deep: '#A64600', lite: '#FFB074' },
  rosa: { label: 'Rosa', main: '#D94F8C', deep: '#A3295F', lite: '#FF9CC8' },
};
const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
// a·t + b·(1−t)
const mix = (a: string, b: string, t: number) => {
  const x = hexRgb(a), y = hexRgb(b);
  return '#' + x.map((v, i) => Math.round(v * t + y[i] * (1 - t)).toString(16).padStart(2, '0')).join('');
};
const colors: Record<string, string> = {
  logo: '#991B1E', primary: '', primaryDark: '', accent: '', hero: '', bg: '', card: '', text: '', muted: '', border: '',
  tint: '', tint2: '', soft: '', inputBg: '', faint: '', ringBg: '', instaBg: '',
};
function applyTheme(mode: Mode, accent: AccentKey) {
  const a = ACCENTS[accent] ?? ACCENTS.rot;
  const dark = mode === 'dark';
  const card = dark ? '#1B1B1F' : '#FFFFFF';
  Object.assign(colors, {
    logo: '#991B1E',
    primary: a.main,                                   // Flächen: Buttons, aktive Chips
    primaryDark: dark ? a.lite : a.deep,               // Überschriften-Text
    accent: dark ? a.lite : a.main,                    // Links, Rahmen, Icons
    hero: dark ? a.deep : a.main,                      // Kopfbereich
    bg: dark ? mix(a.main, '#0B0B0D', 0.07) : mix(a.main, '#FFFFFF', 0.04),
    card,
    text: dark ? '#F1F1F3' : '#1F1F1F',
    muted: dark ? '#A3A3AB' : '#6B6B6B',
    border: dark ? '#2E2E35' : mix(a.main, '#FFFFFF', 0.12),
    tint: dark ? mix(a.main, card, 0.35) : mix(a.main, card, 0.1),
    tint2: dark ? mix(a.main, card, 0.18) : mix(a.main, card, 0.06),
    soft: mix('#FFFFFF', a.main, 0.82),                // helle Schrift im Kopfbereich
    inputBg: dark ? '#26262C' : '#FFFFFF',
    faint: dark ? '#5A5A62' : '#C4C4C4',
    ringBg: a.main + '22',
    instaBg: dark ? '#2B1A22' : '#FFF0F5',
  });
}
applyTheme('light', 'rot');
type Side = 'left' | 'right' | 'both';
type Cfg = { action: 'back' | 'menu' | 'reload'; side: Side; mode: Mode; accent: AccentKey };
const DEFAULT_CFG: Cfg = { action: 'back', side: 'left', mode: 'light', accent: 'rot' };
const CFG_KEY = 'msg_cfg_v1';
// Schrift: der MSG-Schriftzug ist eine kräftige Grotesk (wie Roboto/Helvetica). Auf Android ist das die Standardschrift,
// auf iOS nehmen wir Helvetica Neue. (Eigene Schriftdateien lassen sich in Snack nicht laden.)
let FONT: string | undefined = Platform.OS === 'ios' ? 'Helvetica Neue' : undefined;
const withFont = (o: Record<string, any>) => {
  if (!FONT) return o;
  const r: Record<string, any> = {};
  for (const k of Object.keys(o)) {
    const v = o[k];
    const isText = v && (v.fontSize !== undefined || v.fontWeight !== undefined || v.color !== undefined || v.textAlign !== undefined || v.lineHeight !== undefined);
    r[k] = isText && !v.fontFamily && k !== 'search' ? { ...v, fontFamily: FONT } : v;
  }
  return r;
};
// Zentrale Konfiguration: Kontakt, Orte, Kurse
const contact = {
  phone: '07141 220043',
  phoneUrl: 'tel:+497141220043',
  whatsappUrl: 'https://wa.me/497141649023',
  email: 'info@eh-lb.de',
};
const SITES = {
  fellbach: 'https://erstehilfe-fellbach.de',
  ludwigsburg: 'https://www.erstehilfe-ludwigsburg.de',
} as const;
type Site = keyof typeof SITES;
// Reihenfolge = Reihenfolge der Chips in der App
const CITIES: Record<string, { lat: number; lon: number }> = {
  Ludwigsburg: { lat: 48.8975, lon: 9.192 },
  Fellbach: { lat: 48.8083, lon: 9.2761 },
  Stuttgart: { lat: 48.771, lon: 9.246 }, // Kurse in Stuttgart-Ost (Wangen)
  'Bad Cannstatt': { lat: 48.804, lon: 9.218 },
  Esslingen: { lat: 48.7406, lon: 9.3051 },
  Schorndorf: { lat: 48.8057, lon: 9.5276 },
  Winnenden: { lat: 48.876, lon: 9.398 },
  Walheim: { lat: 49.0003, lon: 9.1517 },
};
type Course = { id: string; site: Site; path: string; title: string; city: string; category: string };
const F = 'Fellbach', L = 'Ludwigsburg';
const FS = 'Führerschein', BE = 'Betriebliche Ersthelfer', KI = 'Kinder & Säugling',
  KT = 'Kita & Schule', SD = 'Sanitätsdienst', NT = 'Notfalltraining', SO = 'Sonderkurse';
const c = (site: Site, slug: string, title: string, city: string, category: string): Course =>
  ({ id: `${site}:${slug}`, site, path: `/kurse/${slug}/`, title, city, category });
const COURSES: Course[] = [
  c('fellbach', 'erste-hilfe-in-fellbach', 'Erste Hilfe (Führerschein)', F, FS),
  c('fellbach', 'erste-hilfe-abendkurs-fuer-den-fuehrerschein', 'Abendkurs (Führerschein)', F, FS),
  c('fellbach', 'erste-hilfe-kurs-in-stuttgart-ost-wangen', 'Erste-Hilfe-Kurs Stuttgart-Ost (Wangen)', 'Stuttgart', FS),
  c('fellbach', 'erste-hilfe-kurs-in-esslingen-am-neckar', 'Erste-Hilfe-Kurs Esslingen', 'Esslingen', FS),
  c('fellbach', 'erste-hilfe-kurs-in-bad-cannstatt', 'Erste-Hilfe-Kurs Bad Cannstatt', 'Bad Cannstatt', FS),
  c('fellbach', 'erste-hilfe-kurs-in-schorndorf', 'Erste-Hilfe-Kurs Schorndorf', 'Schorndorf', FS),
  c('fellbach', 'erste-hilfe-kurs-in-winnenden', 'Erste-Hilfe-Kurs Winnenden', 'Winnenden', FS),
  c('fellbach', 'erste-hilfe-kurs-fuer-betriebliche-ersthelfer', 'Betriebliche Ersthelfer', F, BE),
  c('fellbach', 'erste-hilfe-abendkurs-betrieblicher-ersthelfer', 'Abendkurs (betrieblicher Ersthelfer)', F, BE),
  c('fellbach', 'erste-hilfe-am-kind', 'Erste Hilfe am Kind', F, KI),
  c('fellbach', 'erste-hilfe-in-bildungs-und-betreuungseinrichtungen-fuer-kinder', 'Bildungs- & Betreuungseinrichtungen', F, KT),
  c('ludwigsburg', 'erste-hilfe-kurs-fuer-den-fuehrerschein', 'Erste-Hilfe-Kurs (Führerschein)', L, FS),
  c('ludwigsburg', 'first-aid-course-for-a-drivers-license-english', 'First Aid Course (English)', L, FS),
  c('ludwigsburg', 'erste-hilfe-in-walheim', 'Erste Hilfe in Walheim', 'Walheim', FS),
  c('ludwigsburg', 'erste-hilfe-kurs-fuer-betriebliche-ersthelfer', 'Betriebliche Ersthelfer', L, BE),
  c('ludwigsburg', 'erste-hilfe-am-kind', 'Erste Hilfe am Kind', L, KI),
  c('ludwigsburg', 'erste-hilfe-am-kind-in-walheim', 'Erste Hilfe am Kind in Walheim', 'Walheim', KI),
  c('ludwigsburg', 'erste-hilfe-in-bildungs-und-betreuungseinrichtungen-fuer-kinder', 'Bildungs- & Betreuungseinrichtungen', L, KT),
  c('ludwigsburg', 'kurse-fuer-kindertagespflegepersonen-im-landkreis-ludwigsburg', 'Kindertagespflegepersonen', L, KT),
  c('ludwigsburg', 'fachqualifikation-sanitaetsdienst-7-tage-intensivkurs', 'Fachqualifikation Sanitätsdienst', L, SD),
  c('ludwigsburg', 'notfalltraining-fuer-hebammen', 'Notfalltraining für Hebammen', L, NT),
  c('ludwigsburg', 'suesses-saures-erste-hilfe', 'Süßes, Saures, Erste Hilfe!', L, SO),
];
const CATEGORIES = [FS, BE, KI, KT, SD, NT, SO];
// Special-Kurse: werden im Special-Banner gezeigt, der nächste Termin immer zuerst
const SPECIAL_IDS = [
  'ludwigsburg:suesses-saures-erste-hilfe',
  'ludwigsburg:fachqualifikation-sanitaetsdienst-7-tage-intensivkurs',
];
// ---- Google-Bewertungen ----
// Echte Google-Bewertungen (alle 5 Sterne), Originaltexte von Google Maps. `partial: true` = Google zeigte nur einen Auszug
// (die App weist dann auf den Volltext hin). Die Karten laufen ENDLOS: nach der letzten kommt eine neu gemischte Runde.
// Neue Bewertung ergänzen:  { name: 'Vorname N.', date: 'vor 2 Wochen', text: 'Vollständiger Originaltext …' },
const GOOGLE = {
  rating: '5,0',
  url: 'https://g.page/MSG-Erste-Hilfe?share',
  reviews: [
    { name: 'Екатерина Антонюк', date: 'vor 5 Monaten', text: 'Ich bin sehr zufrieden mit dem Kurs. Er war nicht nur informativ, sondern auch unterhaltsam. Die Inhalte wurden sehr gut präsentiert, mit Beispielen aus dem echten Leben und praktischen Anwendungsbeispielen. Ich kann jedem nur empfehlen …', partial: true },
    { name: 'HT Muenster', date: 'vor 7 Monaten', text: 'Wir hatten einen In-House Erste-Hilfe-Kurs bei MSG Medical Service Germany und waren rundum begeistert! 😊 Die Trainer waren super freundlich und kompetent, der Kurs war alles andere als langweilig, im Gegenteil, er war unterhaltsam und hat …', partial: true },
    { name: 'Patricia Wildermuth', date: 'vor 3 Monaten', text: 'Marjeta hat uns super durch den Kurs gebracht!!! Sehr lieb, sehr abwechslungsreich, sehr lustig. Es hat einfach Spaß gemacht (das hat es mir zuvor noch nie)! Ich würde jederzeit diese Schule und vorallem Marjeta empfehlen.' },
    { name: 'Drexlerfotografie', date: 'vor einem Jahr', text: 'Der Geschäftsführer hatte mich zu zwei seiner Kurse eingeladen, dass ich zusammen mit ihm die auszubildenden Ersthelfer in Aktion erleben durfte und auch für Fragen bezüglich Rettungsdienst mit ihm zur Rat und Tat den EH zur Hilfe stand. …', partial: true },
    { name: 'Luinatic Zwirner', date: 'vor 2 Monaten', text: 'Bisher der beste meiner Erste Hilfe Kurse. Sehr lehrreich und abwechslungsreich, eine offene und angenehme Atmosphäre und vor allem nicht langweilig! …', partial: true },
    { name: 'Zulal Gokce', date: 'vor 7 Monaten', text: 'Ich habe meinen Erste-Hilfe-Kurs bei Medical Service Germany gemacht und war sehr zufrieden. Der Kurs war gut organisiert und verständlich erklärt. Wir haben viele praktische Übungen gemacht, besonders die Wiederbelebung war sehr hilfreich. Ich fühle mich jetzt sicherer im Notfall. Sehr empfehlenswert!' },
    { name: 'Batuhan', date: 'vor 8 Monaten', text: 'Der Erste-Hilfe-Kurs war gut strukturiert und praxisnah aufgebaut. Die Inhalte wurden verständlich erklärt und realistische Szenarien geübt. Insgesamt sehr hilfreich und empfehlenswert.' },
    { name: 'Stefanie Fink', date: 'vor 8 Monaten', text: 'Ein richtig toller Erste-Hilfe-Kurs! Ich habe bei Nico unglaublich viel gelernt. Durch die vielen praktischen Übungen fühle ich mich sicher und gut vorbereitet, im Ernstfall zu handeln. Und der Spaß kam dabei definitiv nicht zu kurz' },
    { name: 'marco viebrock', date: 'vor 5 Monaten', text: 'Die zweite Erstjelferausbildung in meinem Leben, aber die deutlich proffessionellere und modernere. Hat sehr viel Spaß gemacht hier teilzunehmen. Es ist sehr zu empfehlen!' },
    { name: 'Julia Uebachs', date: 'vor 11 Monaten', text: 'Nach über 20 Jahre Berufserfahrung als Erzieherin und die somit verpflichtende zweijährliche 1.Hilfe Auffrischung, habe ich heute den besten Kurs jemals besucht! …', partial: true },
    { name: 'Li Za', date: 'vor 6 Monaten', text: 'Der Kurs war gut erklärt, mit vielen praxisbezogenen Beispielen. An praktischen Übungen konnte man selbst sein Wissen testen' },
    { name: 'Sven Kremer', date: 'vor 2 Monaten', text: 'Super Erste-Hilfe-Kurs! Es wurde stark auf die Interessen der Teilnehmer eingegangen und praktische Übungen dazu eingebaut …', partial: true },
    { name: 'dark_angel_ 701', date: 'vor 3 Monaten', text: 'Es war ein sehr interessanter,informativer Tag.\nWar auch sehr lustiger Tag. Danke an Marjeta war echt gut ✌️danke fürs Retten 😂✌️ …', partial: true },
    { name: 'Steffen Krstinic', date: 'vor 5 Monaten', text: '… endlich mal ein spassiger und vor allem kompetenter erste Hilfe Kurs, also mit bester Empfehlung … Top Job & Besten Dank 🥳👍🏻 …', partial: true },
    { name: 'Martin Storz', date: 'vor 6 Monaten', text: 'Wirklich super gemacht, der Erste Hilfe Kurs. So dass es wirklich Spass macht und sehr informativ. Kann ich nur weiterempfehlen.' },
    { name: 'viki 25', date: 'vor 7 Monaten', text: 'Der Erste-Hilfe-Kurs hat sehr viel Spaß gemacht, war sehr informativ, es wurde super auf Fragen und Themen eingegangen! Nico hat es echt super gemacht' },
    { name: 'Petra Schumacher', date: 'vor 3 Monaten', text: 'Danke Marijeta, sehr lebendiger Kurs. Viel üben dürfen. Macht weiter so.' },
    { name: 'CV2 Design', date: 'vor 2 Monaten', text: 'Super toller Kurs mit Nico' },
    { name: 'K. W.', date: 'vor 6 Monaten', text: 'Super Erste-Hilfe Kurs. Sehr gut und interessant erklärt und nicht langweilig.' },
    { name: 'Наталія Савчук', date: 'vor einem Jahr', text: 'Ich finde, dieser Kurs ist einfach unverzichtbar!\nJeder Mensch sollte wissen, wie man Erste Hilfe leistet – ein Unfall kann jederzeit und überall passieren. …', partial: true },
    { name: 'Britta', date: 'vor 9 Monaten', text: 'Nico ist individuell auf die für uns wichtigen und gewünschten Themen kompetent und humorvoll eingegangen. Praktische Übungen waren im richtigen Maß und teilweise auf freiwilliger Basis, sodass man nicht bloßgestellt war.\nDanke für einen tollen Erste Hilfe Kurs!' },
    { name: 'U G', date: 'vor 9 Monaten', text: 'War kurzweilig, lebendig und echt gut. Praktische Übungen haben echt Spaß gemacht. Wir hatten als Kigateam gemeinsam einen Kurs.' },
    { name: 'Patricia', date: 'vor 11 Monaten', text: 'Hatten den erste hilfekrus in der Zahnarzt Praxis. War sehr schön Praxis und Patienten bezogen gestaltet. War absolut nicht trocken, sondern viel auch mit Humor. So hat man auch bei der 5 Stunden Sitzung gerne zugehört. Freuen uns schon wieder aufs nächste Jahr' },
    { name: 'Christine Schenk', date: 'vor 5 Monaten', text: 'Informativer, kurzweiliger, praxisorientierter, Kurs. Fragen wurden gut verständlich erklärt.' },
    { name: 'Jasmin Viebrock', date: 'vor 5 Monaten', text: 'Es war super! Bisher der Beste Erste Hilfe Kurs.' },
    { name: 'Ivlknivl', date: 'vor 8 Monaten', text: 'Super symphatische Jungs die die Schulung gemacht haben. Theoretische und praktische Umsetzung super . So macht leben retten lernen Spaß!👍👍👍 …', partial: true },
    { name: 'Laura G.', date: 'vor einem Jahr', text: 'Ich hatte viel spaß. Es war ein guter erste Hilfe Kurs. Der Kurs war bei Wael, er hat eine angenehme und sympathische Art. Er konnte Witz in den Kurs einbringen und die praktischen Übungen sehr gut erklären, vormachen und bei der Umsetzung begleiten. Danke und gerne in zwei Jahren wieder.' },
    { name: 'Kladderadatsch Chen', date: 'vor einem Jahr', text: 'Wael ist ein sehr guter, kompetenter Trainer. sympathisch und sehr angenehmer Umgang mit der Gruppe. Sehr kurzweiliger Erste-Hilfe-Kurs. Noch nie so viel gelacht und Spaß gehabt bei einem Kurs. Würde jederzeit wieder einen Kurs bei ihm machen.' },
    { name: 'Anna Emde', date: 'vor einem Jahr', text: 'Habe als Oma am Kurs "Erste Hilfe am Kind" teilgenommen. Sehr viel gelernt, vieles ausprobiert - und dabei viel Spaß gehabt. Diesen Kurs kann ich nur von Herzen empfehlen!' },
    { name: 'Fabio L.', date: '18.02.2025', text: 'Hatte den Erste-Hilfe Kurs im Rahmen des Berufs. Gut strukturiert, genug Zeit zum praktischen üben. …', partial: true },
    { name: 'Salvatore Grottola', date: '19.02.2025', text: 'Sehr gut, nicht langweilig Und wider sehr viel erneut dazu gelernt' },
  ] as { name: string; date: string; text: string; partial?: boolean }[],
};
// Optional: JSON-Liste [{ "name": "…", "date": "…", "text": "…" }, …] im Internet (z. B. GitHub Raw). Wird beim Start/Neuladen geladen.
const REVIEWS_URL = '';
// Bilder für die Diashow (offizielle Website erstehilfe-ludwigsburg.de). Defekte Bilder werden automatisch übersprungen.
const MEDIA = 'https://www.erstehilfe-ludwigsburg.de/media/';
const SLIDES: string[] = [
  'img_20220504_171502199_1.jpg?timestamp=1733165212',
  'image00002_1__2.jpg?timestamp=1756229330',
  'adobestock_141145042.jpg?timestamp=1756227668',
  'haushaltsunfall_mit_kind.jpg?timestamp=1756228686',
  'adobestock_515655358.jpg?timestamp=1756228609',
  'adobestock_407176951.jpg?timestamp=1756294499',
  'adobestock_92472570.jpg?timestamp=1756294627',
  'img_7302-2048x1365_1_.jpg?timestamp=1733165212',
  'adobestock_133398912-min.jpeg?timestamp=1733165213',
  'shutterstock_1715144239.jpg?timestamp=1756228758',
].map((f) => MEDIA + f);
// Social-Media-Kontakt (Suche „Social Media“ / „Julian Reiter“)
const SOCIAL_MAIL = 'reiter@eh-lb.de';
// Instagram: Followerzahl wird live versucht. Klappt das nicht (Instagram blockiert oft),
// wird `followers` angezeigt – trag hier die aktuelle Zahl ein, z. B. '1.234'. null = keine Zahl.
const INSTAGRAM = {
  user: 'msg_erstehilfe',
  url: 'https://www.instagram.com/msg_erstehilfe/',
  followers: null as string | null,
};
async function fetchFollowers(): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(px(INSTAGRAM.url), {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36', 'Accept-Language': 'de-DE,de;q=0.9' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = /([\d.,]+\s*(?:[KkMm]|Tsd\.?|Mio\.?)?)\s*(?:Followers|Follower|Abonnenten)/.exec(html);
    return m ? m[1].trim() : null;
  } catch { return null; } finally { clearTimeout(t); }
}
// Echte Google-Maps-Fotos und -Bewertungen live über die Google Places API.
// Dafür einen API-Schlüssel eintragen (Google Cloud → „Places API (New)“ aktivieren). Leer = nur die Bewertungen oben.
const GOOGLE_PLACES = { apiKey: '', query: 'MSG Erste-Hilfe-Schule Ludwigsburg' };
type Review = { name: string; date: string; text: string; avatar?: string; partial?: boolean };
type GoogleData = { rating: string; count: number | null; reviews: Review[]; photos: string[] };
async function fetchGoogle(): Promise<GoogleData | null> {
  const key = GOOGLE_PLACES.apiKey;
  if (!key) return null;
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.rating,places.userRatingCount,places.reviews,places.photos',
      },
      body: JSON.stringify({ textQuery: GOOGLE_PLACES.query, languageCode: 'de' }),
    });
    if (!res.ok) return null;
    const p = (await res.json())?.places?.[0];
    if (!p) return null;
    return {
      rating: p.rating ? String(p.rating.toFixed(1)).replace('.', ',') : GOOGLE.rating,
      count: p.userRatingCount ?? null,
      reviews: (p.reviews ?? []).filter((r: any) => r.text?.text).map((r: any) => ({
        name: r.authorAttribution?.displayName ?? 'Google-Nutzer',
        date: r.relativePublishTimeDescription ?? '',
        text: r.text.text,
        avatar: r.authorAttribution?.photoUri,
      })),
      photos: (p.photos ?? []).slice(0, 8).map((ph: any) => `https://places.googleapis.com/v1/${ph.name}/media?maxWidthPx=700&key=${key}`),
    };
  } catch { return null; }
}
// Zusätzliche Bewertungen aus einer eigenen JSON-Datei (optional, siehe REVIEWS_URL)
async function fetchRemoteReviews(): Promise<Review[]> {
  if (!REVIEWS_URL) return [];
  try {
    const res = await fetch(REVIEWS_URL);
    if (!res.ok) return [];
    const j = await res.json();
    return (Array.isArray(j) ? j : j?.reviews ?? [])
      .filter((r: any) => r && typeof r.text === 'string' && r.text.trim())
      .map((r: any) => ({ name: String(r.name ?? 'Google-Nutzer'), date: String(r.date ?? ''), text: r.text.trim(), partial: !!r.partial }));
  } catch { return []; }
}
// Team (Stand: erstehilfe-ludwigsburg.de/team) – Fotos werden von der MSG-Website geladen
const TEAM_URL = 'https://www.erstehilfe-ludwigsburg.de/media/';
const TEAM_PAGE = 'https://www.erstehilfe-ludwigsburg.de/team/';
const TEAM = [
  { name: 'Nico Weinand', slug: 'nico-weinand', role: 'Geschäftsführer · Dozent', photo: 'dedfsghjkksign_ohne_titel.png?timestamp=1759495098', info: 'Ausbilder für Erste Hilfe und Erste Hilfe am Kind, Kranken- und Kinderkrankenpfleger sowie Rettungssanitäter.' },
  { name: 'Marjeta Festerling', slug: 'marjeta-festerling', role: 'Niederlassungsleitung Ludwigsburg', photo: 'img_9569.jpg?timestamp=1786189451', info: 'Medizinische Fachangestellte und Erste-Hilfe-Ausbilderin.' },
  { name: 'Lukas Ruscher', slug: 'lukas-ruscher', role: 'Dozent', photo: 'dgfh.png?timestamp=1759500371', info: 'Medizinstudent, Erste-Hilfe-Ausbilder und Rettungssanitäter.' },
  { name: 'Julian Reiter', slug: 'julian-reiter', role: 'Management Social Media', photo: 'f15f6e73-10ac-46bb-8de5-cce3eaae7933.jpg?timestamp=1782563849', info: 'Sanitäter und verantwortlich für Social Media.' },
  { name: 'Marcel Wilhelm', slug: 'marcel-wilhelm', role: 'Dozent · Notfalltrainer', photo: 'team-wilhelm.jpg?timestamp=1733165211', info: 'Erste-Hilfe-Ausbilder, Rettungssanitäter und Influencer, Initiator von „Krebs kennt keine Kilometer“.' },
  { name: 'Nael Hamaideh', slug: 'nael-hamaideh', role: 'Dozent', photo: 'design_ohg_mgnfdhne_titel.png?timestamp=1759493629', info: 'Ausbilder für Erste Hilfe und Erste Hilfe am Kind, Sanitätshelfer.' },
  { name: 'Tobias Büttner', slug: 'tobias-buettner', role: 'Qualitätsmanagement · Leiter Technik', photo: 'team-buettner.jpg?timestamp=1733165211', info: 'Mechatroniker und Facility Manager, verantwortet Qualitätsmanagement und Technik.' },
  { name: 'Judith Stein', slug: 'judith-stein', role: 'Dozentin', photo: 'judith_stein.jpg?timestamp=1733165211', info: 'Ausbilderin für Erste Hilfe und Erste Hilfe am Kind, Gesundheits- und Kinderkrankenpflegerin sowie Erzieherin.' },
  { name: 'Marie-Sophie Gläser', slug: 'marie-sophie-glaeser', role: 'Dozentin', photo: 'poiuzthrguji.png?timestamp=1759502167', info: 'Gesundheits- und Kinderkrankenpflegerin und Praxisanleiterin im Gesundheitswesen.' },
];
// Vollständiger Profiltext: wird live von der Profilseite der MSG-Website gelesen
// (Text zwischen dem Namen und dem Abschnitt „Über uns“). Zeilen mit „:“ am Ende = Zwischenüberschrift.
type Bio = { lines: { text: string; head?: boolean; bullet?: boolean }[] };
function parseBio(html: string, name: string): Bio | null {
  const clean = html.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ');
  const re = new RegExp('<h[1-6][^>]*>\\s*(?:<[^>]+>\\s*)*' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const m = re.exec(clean) ?? (() => { const i = clean.indexOf(name); return i >= 0 ? ({ index: i } as RegExpExecArray) : null; })();
  if (!m) return null;
  const startAt = m.index;
  const after = clean.slice(startAt);
  let end = after.length;
  for (const mark of ['Über uns', '&Uuml;ber uns', 'Unsere Erste-Hilfe-Kurse', '>Kontakt<', '>Anfahrt<', '<footer']) {
    const i = after.indexOf(mark, 20);
    if (i > 0 && i < end) end = i;
  }
  const seg = after.slice(0, end)
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<br\s*\/?>(?=)/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|section|strong|b)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const lines = decode(seg).split('\n').map((l) => l.replace(/[ \t\u00a0]+/g, ' ').trim()).filter(Boolean);
  const out: Bio['lines'] = [];
  for (const l of lines) {
    if (l === name || /^MSG\s*[—–-]\s*Medical Service Germany$/i.test(l) || /^<?\s*$/.test(l)) continue;
    if (out.length && out[out.length - 1].text === l) continue;
    const bullet = l.startsWith('• ');
    out.push({ text: bullet ? l.slice(2) : l, bullet, head: !bullet && /:$/.test(l) && l.length < 60 });
  }
  const words = out.reduce((n, l) => n + l.text.split(' ').length, 0);
  return words >= 15 ? { lines: out } : null;
}
async function fetchBio(slug: string, name: string): Promise<Bio | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(px(TEAM_PAGE + slug + '/'), { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36', 'Accept-Language': 'de-DE,de;q=0.9' } });
    if (!res.ok) return null;
    return parseBio(await res.text(), name);
  } catch { return null; } finally { clearTimeout(t); }
}
type Slot = {
  start: Date; label: string; time: string; price: string | null;
  booked: number | null; capacity: number | null; bookable: boolean; url: string | null;
};
const MONTHS: Record<string, number> = {
  januar: 0, februar: 1, märz: 2, maerz: 2, april: 3, mai: 4, juni: 5,
  juli: 6, august: 7, september: 8, oktober: 9, november: 10, dezember: 11,
};
const DATE_RE =
  /(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag),?\s*(\d{1,2})\.\s*([A-Za-zäöüÄÖÜ]+)\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(?:–|—|-)\s*(\d{1,2}):(\d{2})(?:\s*Uhr)?(?:\s+([\d.]+(?:,\d{1,2})?)\s*(?:EUR|€))?/i;
const ENT: Record<string, string> = {
  nbsp: ' ', ndash: '–', mdash: '—', euro: '€', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', hellip: '…',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', laquo: '«', raquo: '»',
};
const decode = (s: string) =>
  s.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n] ?? m);
const toText = (html: string) =>
  decode(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const resolve = (href: string, origin: string) => {
  const h = decode(href);
  if (/^https?:\/\//i.test(h)) return h;
  return h.startsWith('/') ? origin + h : `${origin}/${h}`;
};
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MN = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const p2 = (n: string | number) => String(n).padStart(2, '0');
// Jeder buchbare Termin hat einen Link mit /anmeldung/. Daran ankern wir und lesen davor Datum, Zeit, Preis, Plätze.
function parseSlots(html: string, origin: string): Slot[] {
  const slots: Slot[] = [];
  const seen = new Set<string>();
  const anchor = /<a\b[^>]*href\s*=\s*["']([^"']*\/anmeldung\/[^"']+)["']/gi;
  let prev = 0;
  let m: RegExpExecArray | null;
  while ((m = anchor.exec(html))) {
    const from = Math.max(prev, m.index - 1500);
    prev = anchor.lastIndex;
    const url = resolve(m[1], origin);
    if (seen.has(url)) continue;
    seen.add(url);
    const win = toText(html.slice(from, m.index));
    const g = new RegExp(DATE_RE.source, 'gi');
    let d: RegExpExecArray | null = null;
    let x: RegExpExecArray | null;
    while ((x = g.exec(win))) d = x;
    let start: Date, label: string, time: string, price: string | null = null, rest = '';
    if (d && MONTHS[d[3].toLowerCase()] !== undefined) {
      start = new Date(Number(d[4]), MONTHS[d[3].toLowerCase()], Number(d[2]), Number(d[5]), Number(d[6]));
      label = `${d[1].slice(0, 2)}., ${d[2]}. ${d[3]} ${d[4]}`;
      time = `${p2(d[5])}:${d[6]} – ${p2(d[7])}:${d[8]} Uhr`;
      price = d[9] ? `${d[9]} €` : null;
      rest = win.slice(d.index + d[0].length);
    } else {
      const u = /(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-\d{2}-\d+\/?$/.exec(url);
      if (!u) continue;
      start = new Date(+u[1], +u[2] - 1, +u[3], +u[4], +u[5]);
      label = `${WD[start.getDay()]}., ${start.getDate()}. ${MN[start.getMonth()]} ${start.getFullYear()}`;
      time = `${u[4]}:${u[5]} Uhr`;
    }
    const cap = /(\d+)\s*\/\s*(\d+)/.exec(rest);
    slots.push({
 start, label, time, price,
      booked: cap ? +cap[1] : null, capacity: cap ? +cap[2] : null,
      bookable: !/ausgebucht/i.test(rest), url,
    });
  }
  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}
async function fetchSlots(course: Course): Promise<{ slots: Slot[]; sample: string }> {
  const origin = SITES[course.site];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(px(origin + course.path), {
 signal: ctrl.signal,
 headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'de-DE,de;q=0.9',
 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const n = (re: RegExp) => (html.match(re) || []).length;
    const k = html.search(/anmelden/i);
    const j = k >= 0 ? k : Math.max(0, html.indexOf('Termine'));
    const sample =
      `len=${html.length} /anmeldung/=${n(/\/anmeldung\//g)} anmelden=${n(/anmelden/gi)} ausgebucht=${n(/ausgebucht/gi)} keine=${n(/keine passenden Termine/g)} | ` +
      html.slice(Math.max(0, j - 300), j + 300).replace(/\s+/g, ' ');
    return { slots: parseSlots(html, origin), sample };
  } finally {
    clearTimeout(timer);
  }
}
type Page = 'home' | 'team' | 'search' | 'calendar' | 'settings' | 'history';
type Snap = { page: Page; city: string | null; category: string | null; specials: boolean };
type Coords = { latitude: number; longitude: number };
type Point = { lat: number; lon: number };
type Result = { course: Course; next: Slot; upcoming: Slot[]; distanceKm: number | null };
type Filter = { city: string | null; category: string | null };
const km = (a: Point, b: Point) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};
const here = (l: Coords | null): Point | null => (l ? { lat: l.latitude, lon: l.longitude } : null);
function collect(courses: Course[], slots: Record<string, Slot[]>, ref: Point | null): Result[] {
  const now = Date.now();
  const out: Result[] = [];
  for (const course of courses) {
    const upcoming = (slots[course.id] ?? []).filter((s) => s.bookable && s.start.getTime() > now);
    if (upcoming.length) out.push({ course, next: upcoming[0], upcoming, distanceKm: ref && CITIES[course.city] ? km(ref, CITIES[course.city]) : null });
  }
  return out;
}
const nearThenDate = (a: Result, b: Result) =>
  a.distanceKm !== null && b.distanceKm !== null && Math.abs(a.distanceKm - b.distanceKm) > 0.5
    ? a.distanceKm - b.distanceKm
    : a.next.start.getTime() - b.next.start.getTime();
function search(courses: Course[], slots: Record<string, Slot[]>, f: Filter, loc: Coords | null): Result[] {
  return collect(courses, slots, here(loc))
    .filter((r) => (!f.city || r.course.city === f.city) && (!f.category || r.course.category === f.category))
    .sort(nearThenDate);
}
// Wenn nichts passt: Kurse in der Umgebung bzw. ähnliche Kurse vorschlagen
function suggestions(courses: Course[], slots: Record<string, Slot[]>, f: Filter, loc: Coords | null) {
  const ref: Point | null = f.city && CITIES[f.city] ? CITIES[f.city] : here(loc);
  const all = collect(courses, slots, ref);
  const nearby = all
    .filter((r) => r.course.city !== f.city && (!f.category || r.course.category === f.category))
    .sort(nearThenDate).slice(0, 3);
  let similar = f.city && f.category
    ? all.filter((r) => r.course.city === f.city && r.course.category !== f.category).sort(nearThenDate).slice(0, 3)
    : [];
  let similarLabel = f.city ? `Ähnliche Kurse in ${f.city}` : 'Ähnliche Kurse';
  if (nearby.length === 0 && similar.length === 0) {
    similar = [...all].sort(nearThenDate).slice(0, 3);
    similarLabel = 'Weitere Kurse';
  }
  return { nearby, similar, similarLabel };
}
// ---- Ortssuche mit Toleranz für Tippfehler ----
const ALIASES: Record<string, string> = {
  wangen: 'Stuttgart', 'stuttgart ost': 'Stuttgart', 'stuttgart-ost': 'Stuttgart', cannstatt: 'Bad Cannstatt', cannstadt: 'Bad Cannstatt',
  'bad cannstadt': 'Bad Cannstatt', 'bad-cannstadt': 'Bad Cannstatt', 'esslingen am neckar': 'Esslingen',
};
const norm = (t: string) =>
  t.toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
function lev(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function matchCity(query: string): string | null {
  const n = norm(query);
  if (n.length < 2) return null;
  const tol = n.length <= 4 ? 1 : n.length <= 8 ? 2 : 3;
  const keys: [string, string][] = [
    ...Object.keys(CITIES).map((c): [string, string] => [norm(c), c]),
    ...Object.entries(ALIASES).map(([k, v]): [string, string] => [norm(k), v]),
  ];
  let best: { d: number; city: string } | null = null;
  for (const [key, city] of keys) {
    let d = key.startsWith(n) ? 0 : lev(n, key);                            // Anfang des Ortsnamens oder ganzer Name mit Fehlern
    if (n.length >= 4) d = Math.min(d, lev(n, key.slice(0, n.length)));       // halb getippt, mit Tippfehler
    if (d <= tol && (!best || d < best.d)) best = { d, city };
  }
  return best ? best.city : null;
}
// ---- Suche nach Ort UND Kursart (mit Tippfehlern und anderen Bezeichnungen) ----
const CAT_ALIASES: Record<string, string[]> = {
  [FS]: ['führerschein', 'fuehrerschein', 'fahrschule', 'fahrerlaubnis', 'auto', 'motorrad', 'roller', 'lkw', 'grundkurs', 'english', 'englisch', 'first aid', 'abendkurs', 'lebensrettende sofortmaßnahmen', 'lsm'],
  [BE]: ['betrieblich', 'betrieb', 'ersthelfer', 'arbeit', 'arbeitsplatz', 'firma', 'unternehmen', 'dguv', 'berufsgenossenschaft', 'bg', 'fortbildung', 'auffrischung'],
  [KI]: ['kind', 'kinder', 'säugling', 'baby', 'babys', 'kleinkind', 'eltern', 'großeltern', 'familie'],
  [KT]: ['kita', 'schule', 'kindergarten', 'krippe', 'erzieher', 'erzieherin', 'lehrer', 'tagespflege', 'tagesmutter', 'betreuung', 'bildung', 'pädagogik'],
  [SD]: ['sanitätsdienst', 'sanitäter', 'sanitaeter', 'sani', 'sanitätshelfer', 'fachqualifikation', 'intensivkurs'],
  [NT]: ['notfalltraining', 'notfall', 'hebamme', 'hebammen', 'geburt'],
  [SO]: ['sonderkurs', 'special', 'halloween', 'süßes saures', 'süßes', 'saures'],
};
// Passt ein getipptes Wort (mit Tippfehlern) zum Anfang eines Begriffs?
function fuzzyWord(t: string, w: string): number {
  if (!t || !w) return Infinity;
  if (w.startsWith(t)) return 0;
  if (t.length >= 4 && t.startsWith(w) && w.length >= 4) return 0;
  if (t.length < 4) return Infinity;
  const tol = t.length <= 5 ? 1 : 2;
  const d = Math.min(lev(t, w.slice(0, t.length)), lev(t, w));
  return d <= tol ? d : Infinity;
}
const words = (t: string) => t.toLowerCase().split(/[^a-z0-9äöüß]+/).map(norm).filter((x) => x.length > 0);
function matchCategory(tokens: string[]): { cat: string; used: Set<number> } | null {
  let best: { cat: string; d: number; used: Set<number> } | null = null;
  for (const [cat, list] of Object.entries(CAT_ALIASES)) {
    for (const alias of [cat, ...list]) {
      const aw = words(alias);
      // jedes Wort des Begriffs muss zu einem getippten Wort passen (z. B. „first aid“)
      let d = 0; const used = new Set<number>();
      for (const a of aw) {
        let bi = -1, bd = Infinity;
        tokens.forEach((t, i) => { if (t.length >= 3 || a.length <= 3) { const x = t.length >= 3 ? fuzzyWord(t, a) : (t === a ? 0 : Infinity); if (x < bd) { bd = x; bi = i; } } });
        if (bi < 0 || bd === Infinity) { d = Infinity; break; }
        d += bd; used.add(bi);
      }
      if (d < Infinity && (!best || d < best.d)) best = { cat, d, used };
    }
  }
  return best ? { cat: best.cat, used: best.used } : null;
}
// Ergebnis der Kopf-Suche: Ort und/oder Kursart
const STOP = new Set(['erste', 'hilfe', 'ersthilfe', 'kurs', 'kurse', 'in', 'im', 'am', 'an', 'fur', 'der', 'die', 'das', 'mit', 'bei', 'und', 'zum', 'zur', 'termin', 'termine']);
function matchQuery(q: string): { city: string | null; category: string | null } | null {
  const tokens = words(q).filter((t) => !STOP.has(t));
  if (!tokens.length || norm(q).length < 2) return null;
  const c = matchCategory(tokens);
  const rest = tokens.filter((_, i) => !c?.used.has(i));
  let city: string | null = null;
  // erst Wortpaare (z. B. „bad cannstatt“), dann einzelne Wörter
  for (let i = 0; i < rest.length && !city; i++) if (rest[i + 1]) city = matchCity(rest[i] + rest[i + 1]);
  for (let i = 0; i < rest.length && !city; i++) if (rest[i].length >= 3) city = matchCity(rest[i]);
  if (!city && !c && tokens.length === 1) city = matchCity(tokens[0]);
  if (!city && !c) return null;
  return { city, category: c?.cat ?? null };
}
// ---- Terminsuche: „24.10.“, „24. Oktober“, „November“, „morgen“, „Samstag“, „Wochenende“, „nächste Woche“ ----
const MONTH_NAMES = ['januar', 'februar', 'marz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
const WEEKDAYS = ['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag'];
type DateQ = { from: Date; to: Date; label: string; rest: string };
const day0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const endOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
const fmtDay = (d: Date) => `${WD[d.getDay()]}., ${d.getDate()}. ${MN[d.getMonth()]} ${d.getFullYear()}`;
const fmtShort = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}.`;
// Name mit Tippfehler-Toleranz finden (Monat oder Wochentag)
function nameIndex(t: string, names: string[]): number {
  const n = norm(t);
  if (n.length < 3) return -1;
  let best = -1, bd = Infinity;
  names.forEach((w, i) => {
    let d = w === n ? 0 : n.length >= 3 && w.startsWith(n) && (n.length >= 4 || w.length <= 4 || i >= 0) ? 0.5 : Infinity;
    if (d === Infinity && n.length >= 5) { const x = lev(n, w); if (x <= (n.length >= 7 ? 2 : 1)) d = x; }
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}
function parseDateQuery(q: string, now: Date = new Date()): DateQ | null {
  const today = day0(now);
  const year = (d: number, m: number, y?: number) => {
    if (y) return y < 100 ? 2000 + y : y;
    let yy = today.getFullYear();
    if (new Date(yy, m, d) < addDays(today, -1)) yy++;
    return yy;
  };
  const one = (d: Date, rest: string): DateQ => ({ from: d, to: endOf(d), label: fmtDay(d), rest });
  const lower = q.toLowerCase();
  // 24.10. / 24.10.2026 / 24.10.26
  const m = /(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?/.exec(lower);
  if (m) {
    const d = +m[1], mo = +m[2] - 1;
    if (d < 1 || d > 31 || mo < 0 || mo > 11) return null;
    return one(new Date(year(d, mo, m[3] ? +m[3] : undefined), mo, d), lower.replace(m[0], ' '));
  }
  const toks = lower.split(/[^a-z0-9äöüß]+/).filter(Boolean);
  const keep = (used: number[]) => toks.filter((_, i) => !used.includes(i)).join(' ');
  for (let i = 0; i < toks.length; i++) {
    const t = norm(toks[i]);
    const mi = /^\d+$/.test(t) ? -1 : nameIndex(t, MONTH_NAMES);
    if (mi >= 0) {
      const num = i > 0 && /^\d{1,2}$/.test(toks[i - 1]) ? +toks[i - 1] : null;
      const yr = toks[i + 1] && /^\d{4}$/.test(toks[i + 1]) ? +toks[i + 1] : undefined;
      const used = [i, ...(num !== null ? [i - 1] : []), ...(yr ? [i + 1] : [])];
      if (num !== null && num >= 1 && num <= 31) return one(new Date(year(num, mi, yr), mi, num), keep(used));
      // ganzer Monat (aktueller Monat: ab heute)
      const y = yr ?? (mi < today.getMonth() ? today.getFullYear() + 1 : today.getFullYear());
      let from = new Date(y, mi, 1);
      if (from < today) from = today;
      return { from, to: endOf(new Date(y, mi + 1, 0)), label: `${MN[mi]} ${y}`, rest: keep(used) };
    }
    if (t === 'heute') return one(today, keep([i]));
    if (t === 'morgen') return one(addDays(today, 1), keep([i]));
    if (t === 'ubermorgen' || t === 'uebermorgen') return one(addDays(today, 2), keep([i]));
    if (t === 'wochenende') {
      const sat = today.getDay() === 0 ? addDays(today, -1) : addDays(today, (6 - today.getDay() + 7) % 7);
      const from = sat < today ? today : sat;
      const used = [i, ...(i > 0 && /^(nachste|naechste|kommende|dieses|am)$/.test(norm(toks[i - 1])) ? [i - 1] : [])];
      return { from, to: endOf(addDays(sat, 1)), label: `Wochenende ${fmtShort(sat)}–${fmtShort(addDays(sat, 1))}`, rest: keep(used) };
    }
    if (t === 'woche' && i > 0) {
      const pre = norm(toks[i - 1]);
      const mon = addDays(today, -((today.getDay() + 6) % 7));
      if (pre === 'diese') return { from: today, to: endOf(addDays(mon, 6)), label: 'diese Woche', rest: keep([i - 1, i]) };
      if (/^(nachste|naechste|kommende)$/.test(pre)) {
        const nm = addDays(mon, 7);
        return { from: nm, to: endOf(addDays(nm, 6)), label: `nächste Woche (${fmtShort(nm)}–${fmtShort(addDays(nm, 6))})`, rest: keep([i - 1, i]) };
      }
    }
    const wi = /^\d+$/.test(t) ? -1 : nameIndex(t, WEEKDAYS);
    if (wi >= 0 && t.length >= 4) {
      const diff = (wi - today.getDay() + 7) % 7;
      const next = /^(nachsten|naechsten|nachster|kommenden)$/.test(norm(toks[i - 1] ?? '')) && diff === 0 ? 7 : diff;
      return one(addDays(today, next), keep([i, ...(i > 0 && /^(nachsten|naechsten|kommenden|am)$/.test(norm(toks[i - 1])) ? [i - 1] : [])]));
    }
  }
  return null;
}
// ---- Globale Suche (Menüpunkt „Suche“): alles, was es in der App gibt ----
type SearchItem = { key: string; group: string; title: string; sub: string; icon: string; fb: string; words: string[]; tw: string[]; action: any };
function buildIndex(): SearchItem[] {
  const items: SearchItem[] = [];
  const add = (it: Omit<SearchItem, 'words' | 'tw'>, extra: string) => items.push({ ...it, words: words(`${it.title} ${it.sub} ${extra}`), tw: words(it.title) });
  for (const c of COURSES) add({ key: c.id, group: 'Kurse', title: c.title, sub: `${c.city} · ${c.category}`, icon: 'medkit-outline', fb: '✚', action: { type: 'course', course: c } },
    `${(CAT_ALIASES[c.category] ?? []).join(' ')} kurs termin anmelden ${SPECIAL_IDS.includes(c.id) ? 'special sonderkurs' : ''} ${c.id === 'ludwigsburg:suesses-saures-erste-hilfe' ? 'halloween kinder 7 14 jahre' : ''}`);
  for (const n of Object.keys(CITIES)) add({ key: 'city:' + n, group: 'Orte', title: n, sub: 'Alle Kurse an diesem Ort', icon: 'location-outline', fb: '📍', action: { type: 'city', city: n } },
    `ort stadt standort ${Object.entries(ALIASES).filter(([, v]) => v === n).map(([k]) => k).join(' ')}`);
  for (const m of TEAM) add({ key: 'team:' + m.name, group: 'Team', title: m.name, sub: m.role, icon: 'person-outline', fb: '👤', action: { type: 'member', name: m.name } }, `team mitarbeiter dozent ausbilder ${m.info}`);
  const misc: [string, string, string, string, string, any, string][] = [
    ['calendar', 'Kalender', 'Alle Termine nach Tagen', 'calendar-outline', '📅', { type: 'page', page: 'calendar' }, 'kalender termine datum tag monat übersicht wann'],
    ['team', 'Unser Team', 'Alle Dozentinnen und Dozenten', 'people-outline', '👥', { type: 'page', page: 'team' }, 'team mitarbeiter dozenten ausbilder über uns'],
    ['specials', 'Special-Kurse', 'Sonderangebote und besondere Kurse', 'star-outline', '★', { type: 'page', page: 'specials' }, 'special sonderkurs angebot besondere'],
    ['ask', 'Kurs anfragen', 'Per Anruf, WhatsApp oder E-Mail', 'chatbubbles-outline', '💬', { type: 'ask' }, 'anfrage anfragen kontakt frage fragen buchen inhouse firma gruppe'],
    ['tel', 'Anrufen', contact.phone, 'call-outline', '📞', { type: 'tel' }, 'telefon anruf nummer kontakt fragen hilfe'],
    ['wa', 'WhatsApp', 'Nachricht schreiben', 'logo-whatsapp', '💬', { type: 'wa' }, 'whatsapp chat nachricht kontakt fragen'],
    ['mail', 'E-Mail', contact.email, 'mail-outline', '✉️', { type: 'mail' }, 'email mail kontakt fragen schreiben'],
    ['insta', 'Instagram', '@' + INSTAGRAM.user, 'logo-instagram', '📷', { type: 'insta' }, 'instagram insta social media folgen follower'],
    ['reviews', 'Bewertungen', 'Google-Bewertungen ansehen', 'star-half-outline', '★', { type: 'reviews' }, 'bewertung bewertungen rezension google sterne erfahrungen'],
    ['locate', 'Meinen Standort verwenden', 'Kurse in deiner Nähe', 'navigate-outline', '📍', { type: 'locate' }, 'standort nähe gps in der nähe'],
  ];
  for (const [key, title, sub, icon, fb, action, extra] of misc) add({ key, group: 'Mehr', title, sub, icon, fb, action }, extra);
  return items;
}
const INDEX = buildIndex();
function searchAll(q: string): SearchItem[] {
  const tokens = words(q).filter((t) => t.length >= 2);
  if (!tokens.length) return [];
  const scored: { it: SearchItem; score: number }[] = [];
  for (const it of INDEX) {
    let score = 0;
    for (const t of tokens) {
      let best = Infinity;
      for (const w of it.words) best = Math.min(best, t.length < 3 ? (w.startsWith(t) ? 0 : Infinity) : fuzzyWord(t, w));
      if (best === Infinity) { score = Infinity; break; }
      const inTitle = it.tw.some((w) => (t.length < 3 ? w.startsWith(t) : fuzzyWord(t, w) <= best));
      score += best + (inTitle ? 0 : 0.5); // Treffer im Titel zuerst
    }
    if (score < Infinity) scored.push({ it, score });
  }
  const order = ['Kurse', 'Orte', 'Team', 'Mehr'];
  return scored.sort((a, b) => a.score - b.score || order.indexOf(a.it.group) - order.indexOf(b.it.group)).map((x) => x.it);
}
// ---- „Social Media“ / „Julian Reiter“ in der Suche (mit Tippfehlern und anderen Bezeichnungen) ----
const SOCIAL_WORDS = ['social', 'sozial', 'soziale', 'media', 'medien', 'socialmedia', 'sozialmedia', 'julian', 'julien', 'reiter', 'instagram', 'insta', 'influencer'];
const SOCIAL_NOT = new Set(['leiter', 'weiter', 'reiten', 'reifen', 'weitere', 'leiten']);
function socialMatch(q: string): boolean {
  const tokens = words(q).filter((t) => t.length >= 4 && !SOCIAL_NOT.has(t));
  return tokens.some((t) => SOCIAL_WORDS.some((w) => fuzzyWord(t, w) !== Infinity));
}
// Icon-Bibliothek von Expo (enthält das offizielle Instagram-Symbol). Optional wie der WebView.
let Ionicons: any = null;
try { Ionicons = require('@expo/vector-icons').Ionicons; } catch (e) { Ionicons = null; }
// Der unsichtbare Browser ist optional: fehlt das Paket, läuft die App trotzdem (nur ohne Fallback)
let WebView: any = null;
try { WebView = require('react-native-webview').WebView; } catch (e) { WebView = null; }
if (IS_WEB) WebView = null;
// Fallback: Seite in unsichtbarem Browser laden, warten bis die Termine eingeblendet sind, dann den fertigen Seitencode zurückgeben
const INJECT = `(function(){var t=0;var iv=setInterval(function(){t+=300;var ok=document.querySelectorAll('a[href*="/anmeldung/"]').length>0;if(ok||t>=6000){clearInterval(iv);window.ReactNativeWebView.postMessage(document.documentElement.outerHTML);}},300);})();true;`;
const Hidden = ({ course, onDone }: { course: Course; onDone: (c: Course, html: string) => void }) => {
  const done = useRef(false);
  const finish = (html: string) => { if (!done.current) { done.current = true; onDone(course, html); } };
  useEffect(() => {
    if (!WebView) { finish(''); return; }
    const t = setTimeout(() => finish(''), 25000);
    return () => clearTimeout(t);
  }, []);
  if (!WebView) return null;
  return (
    <WebView
      source={{ uri: SITES[course.site] + course.path }}
      injectedJavaScript={INJECT}
 onMessage={(e) => finish(e.nativeEvent.data)}
      onError={() => finish('')}
      style={{ width: 300, height: 300 }}
    />
  );
};
const Chip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
  <Pressable onPress={onPress} style={[s.chip, active && s.chipOn]}>
    <Text style={[s.chipTxt, active && s.chipTxtOn]}>{label}</Text>
  </Pressable>
);
const info = (n: Slot) => {
  const free = n.capacity !== null && n.booked !== null ? n.capacity - n.booked : null;
  return `${n.time}${n.price ? ` · ${n.price}` : ''}${free !== null ? ` · ${free} Plätze frei` : ''}`;
};
type BookInfo = { title: string; city: string; label: string; time: string; start: number; end?: number };
type Register = (url: string, title: string, info?: BookInfo) => void;
type Person = { name: string; email?: string; phone?: string };
type Booking = BookInfo & { url: string; eventId?: string; calName?: string; people?: Person[]; count?: number; edited?: boolean };
type Profile = { name: string; user: string; first: string; last: string; kind: '' | 'privat' | 'geschaeftlich'; done: boolean };
// ===== Benutzernamen online prüfen (kostenlos mit Supabase) =====
// Trage hier die zwei Werte aus deinem Supabase-Projekt ein (siehe Anleitung). Leer lassen = Namen gelten nur auf diesem Handy.
const SUPABASE_URL = 'https://gestnsvxmmvdkohdcsgc.supabase.co';   // z. B. 'https://abcdxyz.supabase.co'
const SUPABASE_KEY = 'sb_publishable_wWmRTSHMQ25yu1-gELZtRw_Ch_JQD9N';   // der „anon public“ bzw. „publishable“ Schlüssel
const RESERVED_USERS = ['msg', 'admin', 'msg-team', 'msg team', 'administrator'];
const sbHeaders = () => ({ apikey: SUPABASE_KEY, 'Content-Type': 'application/json' } as Record<string, string>);
// Prüft nur (für „generieren“): ist der Name schon vergeben?
const userTaken = async (u: string): Promise<boolean> => {
  const k = u.trim().toLowerCase();
  if (RESERVED_USERS.includes(k)) return true;
  if (!SUPABASE_URL || !SUPABASE_KEY) return false;
  try { const r = await fetch(`${SUPABASE_URL}/rest/v1/users?name=eq.${encodeURIComponent(k)}&select=name`, { headers: sbHeaders() }); const j = await r.json(); return Array.isArray(j) && j.length > 0; } catch (e) { return false; }
};
// Reserviert den Namen verbindlich: 'ok' = gehört jetzt dir, 'taken' = schon vergeben, 'error' = keine Verbindung
const userClaim = async (u: string): Promise<'ok' | 'taken' | 'error'> => {
  const k = u.trim().toLowerCase();
  if (RESERVED_USERS.includes(k)) return 'taken';
  if (!SUPABASE_URL || !SUPABASE_KEY) return 'ok';
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/users`, { method: 'POST', headers: { ...sbHeaders(), Prefer: 'return=minimal' }, body: JSON.stringify({ name: k }) });
    if (r.status === 201 || r.status === 200 || r.status === 204) return 'ok';
    if (r.status === 409) return 'taken';
    return 'error';
  } catch (e) { return 'error'; }
};
const genUser = () => {
  const a = ['Herz', 'Helfer', 'Sani', 'Retter', 'Notfall', 'Pulsschlag'], b = ['Fuchs', 'Adler', 'Luchs', 'Falke', 'Bär', 'Otter'];
  return `${a[Math.floor(Math.random() * a.length)]}${b[Math.floor(Math.random() * b.length)]}${1000 + Math.floor(Math.random() * 9000)}`;
};
const dispName = (p: { first: string; last: string; user: string }) => `${p.first} ${p.last}`.trim() || p.user;
const maxPersons = (b: Booking) => Math.max(b.count ?? 0, (b.people ?? []).length, 1);
const PROFILE_KEY = 'msg_profile_v1';
const CODES_KEY = 'msg_codes_v1';
const CANC_KEY = 'msg_cancelled_v1';
type Cancelled = Booking & { cancelledAt: number; whole: boolean; key: string };
// Lösch-Codes: Der n-te Löschvorgang auf diesem Gerät braucht den n-ten Code (jeder Code gilt nur einmal).
let PART_HINT = 'Alles, was du hier einträgst oder änderst, wird nur in dieser App gespeichert. Es wird nicht an MSG übermittelt und ist nicht verbindlich.';
const DEL_CODES = ['72874', '64872', '70236', '29770', '23929'];
const KIND_LABEL: Record<string, string> = { privat: 'privat', geschaeftlich: 'geschäftlich / Organisation' };
type FormField = { l: string; n: string; v: string };
// Aus den abgesendeten Formularfeldern: Teilnehmer (Name, E-Mail, Telefon) und Anzahl Personen. Adresse/Geburtsdatum werden bewusst NICHT gespeichert.
const parseForm = (f: FormField[]): { people: Person[]; count?: number } => {
  const people: Person[] = [];
  let cur: any = {}; let count: number | undefined;
  const flush = () => { const nm = [cur.first, cur.last, cur.full].filter(Boolean).join(' ').trim(); if (nm || cur.email || cur.phone) people.push({ name: nm, email: cur.email, phone: cur.phone }); cur = {}; };
  for (const x of f) {
    const k = `${x.l} ${x.n}`.toLowerCase(); const v = x.v.trim(); if (!v) continue;
    if (/geburt|stra(ß|ss)e|plz|postleit|\bort\b|anrede|gefunden|nachricht|bemerk|text/.test(k)) continue;
    if (/anzahl|personen|teilnehmerzahl/.test(k) && /^\d{1,2}$/.test(v)) { count = +v; continue; }
    let t = '';
    if (/mail/.test(k)) t = 'email'; else if (/tel|handy|mobil|fon/.test(k)) t = 'phone';
    else if (/vorname|first/.test(k)) t = 'first'; else if (/nachname|familienname|last|surname/.test(k)) t = 'last';
    else if (/name/.test(k)) t = 'full';
    if (!t) continue;
    if (cur[t] || (t === 'full' && (cur.first || cur.last)) || ((t === 'first' || t === 'last') && cur.full)) flush();
    cur[t] = v;
  }
  flush();
  return { people, count };
};
const HintCard = ({ onClose, title, children }: { onClose: () => void; title: string; children: any }) => {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.spring(a, { toValue: 1, friction: 8, tension: 70, useNativeDriver: true }).start(); }, []);
  const close = () => Animated.timing(a, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => onClose());
  return (
    <Animated.View style={[StyleSheet.absoluteFill, s.hintBg, { opacity: a }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      <Animated.View style={[s.hintCard, { transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }, { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }]}>
        <View style={s.hintHead}>
          <View style={s.hintI}><Text style={s.hintITxt}>i</Text></View>
          <Text style={s.hintH}>{title}</Text>
          <Pressable onPress={close} hitSlop={14}><Text style={s.hintX}>✕</Text></Pressable>
        </View>
        {children}
        <Pressable style={s.hintOk} onPress={close}><Text style={s.hintOkTxt}>Verstanden</Text></Pressable>
      </Animated.View>
    </Animated.View>
  );
};
const confirmMail = (b: Booking, p: Person, me: Profile) => {
  const who = me.name ? ` (${me.name})` : '';
  const subject = `Bestätigung: ${b.title} am ${b.label}`;
  const body = `${p.name ? `Hallo ${p.name}` : 'Hallo'},\n\nhiermit bestätige ich dir deinen Platz im Kurs „${b.title}“:\n\nTermin: ${b.label}, ${b.time}\nOrt: ${b.city}\nVeranstalter: MSG Erste-Hilfe-Schule\n\nHinweis: Diese Bestätigung kommt von mir${who}, nicht von der MSG Erste-Hilfe-Schule. Es kann sein, dass dir MSG zusätzlich eine eigene Bestätigung schickt – das ist normal, du musst nichts weiter tun.\n\nBei Fragen melde dich gern bei mir.\n\nMit freundlichen Grüßen${me.name ? `\n${me.name}` : ''}`;
  return { subject, body };
};
const waDigits = (t: string) => { let d = t.replace(/[^0-9+]/g, ''); if (d.startsWith('+')) d = d.slice(1); else if (d.startsWith('00')) d = d.slice(2); else if (d.startsWith('0')) d = '49' + d.slice(1); return d; };
const PersonLines = ({ b, color, small, onEdit }: { b: Booking; color?: string; small?: boolean; onEdit?: () => void }) => {
  const ps = b.people ?? [];
  if (!ps.length && !onEdit) return null;
  const tc = [small ? s.muted : s.bookS, !!color && { color }];
  return (
    <View style={{ marginTop: 6 }}>
      {ps.length > 0 && <Text style={[...tc, { fontWeight: '800' }]}>{ps.length > 1 || (b.count ?? 1) > 1 ? `Teilnehmer (${b.count ?? ps.length})` : 'Teilnehmer'}{b.edited ? ' · nur in der App geändert, nicht bei MSG' : ''}</Text>}
      {ps.map((p, i) => (
        <Text key={i} style={tc} numberOfLines={2}>👤 {p.name || 'Teilnehmer ' + (i + 1)}{p.email ? ` · ${p.email}` : ''}{p.phone ? ` · ${p.phone}` : ''}</Text>
      ))}
      {!!onEdit && <Pressable onPress={onEdit} hitSlop={8}><Text style={[...tc, { fontWeight: '800', textDecorationLine: 'underline', marginTop: 3 }]}>{ps.length ? 'Teilnehmer ändern / Termin senden ›' : 'Teilnehmer eintragen ›'}</Text></Pressable>}
    </View>
  );
};
const BOOK_GREEN = '#2E9E5B';
const REG_KEY = 'msg_booked_v1';
let BOOKED: Record<string, Booking> = {};   // wird in App bei jedem Render aktualisiert (für Karten/Zeilen)
const slotEnd = (n: Slot) => {
  const m = /(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/.exec(n.time);
  const e = new Date(n.start);
  if (m) { e.setHours(+m[3], +m[4], 0, 0); return e.getTime(); }
  return n.start.getTime() + 4 * 3600 * 1000;
};
const binfo = (c: Course, n: Slot): BookInfo => ({ title: c.title, city: c.city, label: n.label, time: n.time, start: n.start.getTime(), end: slotEnd(n) });
let CANCEL_INFO = 'Stornieren oder Verschieben geht nicht in der App, nur per Telefon, WhatsApp oder E-Mail. Die Stornierung ist nur bis 7 Tage vorher kostenlos, das Verschieben auf einen anderen Termin ist kostenlos.';
// Wird auf der Anmeldeseite eingeschleust: erkennt, wann „Zahlungspflichtig anmelden“ abgeschickt wurde und das Formular danach verschwunden ist
const REG_JS = `(function(){if(window.__msgReg)return;window.__msgReg=1;
var post=function(o){try{window.ReactNativeWebView.postMessage(JSON.stringify(o));}catch(e){}};
var hasForm=function(){var t=(document.body&&document.body.innerText)||'';return /zahlungspflichtig[^a-z]+anmelden/i.test(t)||!!document.querySelector('[value*="ahlungspflichtig" i]');};
var lab=function(el){var t='';try{if(el.id){var l=document.querySelector('label[for="'+el.id+'"]');if(l)t=l.innerText;}if(!t){var p=el.closest('label');if(p)t=p.innerText;}if(!t)t=el.getAttribute('aria-label')||el.placeholder||'';if(!t){var q=el.parentElement&&el.parentElement.querySelector('label');if(q)t=q.innerText;}}catch(e){}return String(t||'').replace(/[*:]/g,' ').replace(/ +/g,' ').trim().slice(0,40);};
var collect=function(){var r=[];var els=document.querySelectorAll('input,select,textarea');for(var i=0;i<els.length;i++){var e=els[i];var ty=(e.type||'').toLowerCase();if(ty=='hidden'||ty=='password'||ty=='checkbox'||ty=='radio'||ty=='submit'||ty=='button')continue;var v=e.tagName=='SELECT'?(e.options[e.selectedIndex]?e.options[e.selectedIndex].text:''):e.value;v=String(v||'').trim();if(!v)continue;r.push({l:lab(e),n:e.name||'',v:v.slice(0,80)});}return r;};
var last=[];var snap=function(){try{var c=collect();if(c.length)last=c;}catch(e){}};
document.addEventListener('input',snap,true);document.addEventListener('change',snap,true);document.addEventListener('blur',snap,true);
try{window.open=function(u){if(u){location.href=u;}return null;};document.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('a[target]'):null;if(a&&a.getAttribute('target')!=='_self'){a.setAttribute('target','_self');}},true);}catch(e){}
post({t:'page',url:location.href,form:hasForm()});
document.addEventListener('submit',function(){snap();post({t:'submit',f:last});var n=0;var iv=setInterval(function(){n++;var f=hasForm();if(!f||n>12){clearInterval(iv);post({t:'after',url:location.href,form:f});}},700);},true);
})();true;`;
const SlotRow = ({ n, onPress }: { n: Slot; onPress: () => void }) => (
  <Pressable style={s.slot} onPress={onPress}>
    <View style={{ flex: 1 }}>
      {!!n.url && !!BOOKED[n.url] && <Text style={s.bkTag}>✓ Du bist angemeldet</Text>}
      <Text style={s.slotDate}>{n.label}</Text>
      <Text style={s.muted}>{info(n)}</Text>
    </View>
    <Text style={s.slotGo}>Anmelden ›</Text>
  </Pressable>
);
const Card = ({ r, top, badge, from, onRegister }: { r: Result; top?: boolean; badge?: string; from?: string; onRegister: Register }) => {
  const [all, setAll] = useState(false);
  const { course: c, next: n, upcoming } = r;
  const more = upcoming.slice(1, all ? undefined : 3); // nächster Termin + die 2 darauffolgenden
  const rest = upcoming.length - 3;
  return (
    <View style={[s.card, top && s.cardTop]}>
      {top && <Text style={s.badge}>{badge ?? 'Dein nächster Kurs'}</Text>}
      {c.id === HALLOWEEN_ID && (
        <View style={s.hwBox}>
          <Image source={{ uri: HALLOWEEN }} style={s.hwImg} resizeMode="cover" />
          <View style={s.hwShade}>
            <Text style={s.hwTitle}>Süßes, Saures, Erste Hilfe!</Text>
            <Text style={s.hwAge}>🎃 Für Kinder von 7 bis 14 Jahren</Text>
          </View>
        </View>
      )}
      <Text style={s.title}>{c.title}</Text>
      {c.id === HALLOWEEN_ID && <Text style={s.ageNote}>Ein Erste-Hilfe-Kurs zu Halloween – für alle Kinder von 7 bis 14 Jahren.</Text>}
      <Text style={s.muted}>
        {c.city}{r.distanceKm !== null ? ` · ca. ${Math.round(r.distanceKm)} km${from ? ` von ${from}` : ''}` : ''} · {c.category}
      </Text>
      {!!n.url && !!BOOKED[n.url] && <Text style={s.bkTag}>✓ Du bist angemeldet</Text>}
      <Text style={s.date}>{n.label}</Text>
      <Text style={s.muted}>{info(n)}</Text>
      <Pressable style={s.btn} onPress={() => n.url && onRegister(n.url, `${c.title} · ${n.label}`, binfo(c, n))}>
        <Text style={s.btnTxt}>Jetzt anmelden</Text>
      </Pressable>
      {more.length > 0 && <Text style={s.moreH}>Danach</Text>}
      {more.map((m) => <SlotRow key={m.url ?? m.label + m.time} n={m} onPress={() => m.url && onRegister(m.url, `${c.title} · ${m.label}`, binfo(c, m))} />)}
      {rest > 0 && (
        <Pressable style={s.moreBtn} onPress={() => setAll((v) => !v)}>
          <Text style={s.moreTxt}>{all ? 'Weniger anzeigen' : `Alle Termine anzeigen (${rest} weitere)`}</Text>
        </Pressable>
      )}
    </View>
  );
};
// MSG-Logo (rund) und Schriftzug „ERSTE-HILFE-SCHULE“ (weiß), direkt eingebettet – keine Internetverbindung nötig
const LOGO = 'data:image/png;base64,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';
const WORDMARK = 'data:image/png;base64,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';
const WM_AR = 13.543;
const MSG_IMG = 'data:image/png;base64,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';
const MSG_AR = 3.5446;
const HALLOWEEN = 'data:image/jpeg;base64,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';
const HALLOWEEN_ID = 'ludwigsburg:suesses-saures-erste-hilfe';
// Zeile eines Termins in der Terminsuche (mit Kursname und Ort)
const onColor = (hex: string) => { const [r, g, b] = hexRgb(hex); return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#1F1F1F' : '#FFFFFF'; };
const MARK_COLORS = ['#E53935', '#FB8C00', '#FDD835', '#43A047', '#00ACC1', '#1E88E5', '#8E24AA', '#EC407A', '#6D4C41', '#546E7A'];
type Mark = { url: string; color: string; title: string; city: string; label: string; time: string; start: number };
const MARKS_KEY = 'msg_marks_v1';
const Palette = ({ value, onPick, onRemove }: { value: string; onPick: (c: string) => void; onRemove: () => void }) => (
  <View style={s.pal}>
    <Text style={s.palH}>Farbe wählen</Text>
    <View style={s.palRow}>
      <Pressable onPress={onRemove} style={s.palNone}><Text style={s.palNoneTxt}>✕ Keine Markierung</Text></Pressable>
      {MARK_COLORS.map((c) => <Pressable key={c} onPress={() => onPick(c)} style={[s.palDot, { backgroundColor: c }, value === c && s.palDotOn]} />)}
    </View>
  </View>
);
// Zeile eines Termins in der Terminsuche (mit Kursname und Ort); im Kalender mit Stern zum Merken
const DateRow = ({ c, n, tag, onRegister, mark, onMark, onColor: onDot }: { c: Course; n: Slot; tag?: string; onRegister: Register; mark?: string | null; onMark?: () => void; onColor?: () => void }) => (
  <Pressable style={[s.slot, !!mark && { borderLeftWidth: 4, borderLeftColor: mark, paddingLeft: 8 }]} onPress={() => n.url && onRegister(n.url, `${c.title} · ${n.label}`, binfo(c, n))}>
    <View style={{ flex: 1 }}>
      {!!n.url && !!BOOKED[n.url] && <Text style={s.bkTag}>✓ Du bist angemeldet</Text>}
      {!!tag && <Text style={s.dTag}>{tag}</Text>}
      <Text style={s.slotDate}>{n.label}</Text>
      <Text style={s.dCourse}>{c.title} · {c.city}</Text>
      <Text style={s.muted}>{info(n)}</Text>
    </View>
    {!!mark && !!onDot && <Pressable onPress={onDot} hitSlop={8} style={[s.colorDot, { backgroundColor: mark }]} accessibilityLabel="Farbe ändern" />}
    {!!onMark && (
      <Pressable onPress={onMark} hitSlop={10} style={s.star} accessibilityLabel="Termin merken">
        <Text style={[s.starTxt, { color: mark ?? colors.faint }]}>{mark ? '★' : '☆'}</Text>
      </Pressable>
    )}
    <Text style={s.slotGo}>Anmelden ›</Text>
  </Pressable>
);
// Personenfoto: wird nie abgeschnitten (ganzes Bild, mittig im Rahmen)
const Photo = ({ uri, w, maxH, round = 14 }: { uri: string; w: number; maxH: number; round?: number }) => {
  const [ratio, setRatio] = useState(0.8); // Breite / Höhe
  useEffect(() => { Image.getSize(uri, (a, b) => b && setRatio(a / b), () => {}); }, [uri]);
  const h = Math.min(w / ratio, maxH);
  return (
    <View style={[s.photoFrame, { width: w, height: h, borderRadius: round }]}>
      <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
    </View>
  );
};
const Logo = () => (
  <View style={s.logo}>
    <Image source={{ uri: LOGO }} style={s.logoImg} />
  </View>
);
const SW = Math.min(Dimensions.get('window').width, 560);
const CW = SW - 80;
const GAP = 14;
const STEP = CW + GAP;
// Bei jedem Start/Neuladen andere Reihenfolge (neue Bewertungen einfach in GOOGLE.reviews ergänzen)
const shuffle = <T,>(a: T[]): T[] => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
};
// Endlos wischbare, aufgefächerte Bewertungskarten: nach der letzten Bewertung kommt eine neu gemischte Runde – ohne Ende.
const ReviewCarousel = ({ source }: { source: Review[] }) => {
  const n = source.length;
  const per = Math.max(1, Math.ceil(12 / Math.max(1, n))); // so viele Runden nachladen, dass immer genug Karten da sind
  const rounds = useRef<Review[][]>([]);
  const [count, setCount] = useState(per + 1);
  const x = useRef(new Animated.Value(0)).current;
  const [idx, setIdx] = useState(0);
  const idxRef = useRef(0);
  const data = useMemo(() => {
    while (rounds.current.length < count) rounds.current.push(shuffle(source));
    return rounds.current.slice(0, count).flatMap((r, c) => r.map((it, i) => ({ ...it, k: `${c}-${i}` })));
  }, [count, source]);
  if (!n) return null;
  return (
    <View>
      <Animated.FlatList
        data={data}
        extraData={colors.accent + colors.card + colors.text}
        keyExtractor={(r: any) => r.k}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={STEP}
        decelerationRate="fast"
        scrollEventThrottle={16}
        initialNumToRender={6}
        windowSize={7}
        getItemLayout={(_: any, index: number) => ({ length: STEP, offset: STEP * index, index })}
        onEndReachedThreshold={2}
        onEndReached={() => setCount((c) => Math.min(c + per, 400))}
        contentContainerStyle={{ paddingHorizontal: (SW - CW) / 2 - GAP / 2, paddingVertical: 14 }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x } } }], {
          useNativeDriver: true,
          listener: (e: any) => { const i = Math.round(e.nativeEvent.contentOffset.x / STEP); if (i !== idxRef.current) { idxRef.current = i; setIdx(i); } },
        })}
        renderItem={({ item, index }: any) => {
          const range = [(index - 1) * STEP, index * STEP, (index + 1) * STEP];
          return (
            <Animated.View
              style={[s.rCard, {
                opacity: x.interpolate({ inputRange: range, outputRange: [0.55, 1, 0.55], extrapolate: 'clamp' }),
                transform: [
                  { scale: x.interpolate({ inputRange: range, outputRange: [0.88, 1, 0.88], extrapolate: 'clamp' }) },
                  { rotate: x.interpolate({ inputRange: range, outputRange: ['4deg', '0deg', '-4deg'], extrapolate: 'clamp' }) },
                ],
              }]}
            >
              <Text style={s.rQuote}>“</Text>
              <Text style={s.stars}>★★★★★</Text>
              <Text style={s.revTxt}>„{item.text}“</Text>
              {!!item.partial && <Text style={s.partial}>Auszug · Volltext bei Google</Text>}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                {!!item.avatar && <Image source={{ uri: item.avatar }} style={s.avatar} />}
                <Text style={[s.rName, { marginTop: 0 }]}>{item.name}</Text>
              </View>
              <Text style={s.muted}>Google{item.date ? ` · ${item.date}` : ''}</Text>
            </Animated.View>
          );
        }}
      />
      <View style={s.dots}>
        {Array.from({ length: Math.min(n, 7) }).map((_, i) => <View key={i} style={[s.dot, i === idx % Math.min(n, 7) && s.dotOn]} />)}
      </View>
    </View>
  );
};
// Diashow: wechselt alle 5 Sekunden das Foto; man kann auch selbst nach links/rechts wischen (endlos).
// Alle Fotos werden gleich beim App-Start vorgeladen (prefetch) und dauerhaft zwischengespeichert, damit sie sofort da sind.
const SLIDE_W = SW - 32;
const SLIDE_H = Math.round(SLIDE_W * 0.58);
const SLIDE_MS = 5000;
const SLIDE_REPEAT = 40;
const prefetchAll = (list: string[]) => list.forEach((u) => { try { Image.prefetch(u).catch(() => {}); } catch (e) {} });
// Ein Bild der Diashow: zeigt „Bild wird geladen …“, solange es lädt oder nicht angezeigt werden kann (mit automatischem Neuversuch)
const SlideImg = ({ uri }: { uri: string }) => {
  const [ok, setOk] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (!failed) return;
    const t = setTimeout(() => { setFailed(false); setTries((n) => n + 1); }, 4000);
    return () => clearTimeout(t);
  }, [failed]);
  const src = tries ? uri + (uri.includes('?') ? '&' : '?') + 'r=' + tries : uri;
  return (
    <View style={{ width: SLIDE_W, height: SLIDE_H, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
      {!ok && (
        <View style={{ alignItems: 'center' }}>
          <ActivityIndicator color={colors.accent} />
          <Text style={s.slideLoad}>Bild wird geladen …</Text>
        </View>
      )}
      {!failed && (
        <Image key={tries} source={{ uri: src, cache: 'force-cache' }} style={StyleSheet.absoluteFill} resizeMode="cover"
          onLoad={() => setOk(true)} onError={() => { setOk(false); setFailed(true); }} />
      )}
    </View>
  );
};
const Slideshow = ({ images, label }: { images: string[]; label: string }) => {
  const [list] = useState(() => shuffle(images));
  const n = list.length;
  const [idx, setIdx] = useState(() => n * (SLIDE_REPEAT / 2));
  const [tick, setTick] = useState(0);
  const [big, setBig] = useState<number | null>(null);
  const bigIdx = useRef(0);
  const ref = useRef<FlatList<string>>(null);
  const drag = useRef(false);
  const data = useMemo(() => Array.from({ length: n * SLIDE_REPEAT }, (_, i) => list[i % n]), [list]);
  useEffect(() => {
    if (n < 2) return;
    const t = setTimeout(() => {
      if (drag.current || big !== null) { setTick((x) => x + 1); return; }
      ref.current?.scrollToIndex({ index: idx + 1, animated: true });
    }, SLIDE_MS);
    return () => clearTimeout(t);
  }, [idx, tick, n, big]);
  const closeBig = () => {
    const i = bigIdx.current;
    setBig(null); setIdx(i);
    setTimeout(() => { try { ref.current?.scrollToIndex({ index: i, animated: false }); } catch (e) {} }, 50);
  };
  if (!n) return null;
  return (
    <View style={s.slides}>
      {big !== null && (
        <Modal visible animationType="fade" onRequestClose={closeBig}>
          <View style={s.viewer}>
            <FlatList
              data={data}
              keyExtractor={(_, i) => 'b' + i}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={big}
              getItemLayout={(_, i) => ({ length: SW, offset: SW * i, index: i })}
              windowSize={3}
              initialNumToRender={1}
              onMomentumScrollEnd={(e) => { bigIdx.current = Math.round(e.nativeEvent.contentOffset.x / SW); }}
              renderItem={({ item }) => (
                <Pressable style={{ width: SW, justifyContent: 'center', alignItems: 'center' }} onPress={closeBig}>
                  <ActivityIndicator color="#fff" style={StyleSheet.absoluteFill} />
                  <Image source={{ uri: item, cache: 'force-cache' }} style={{ width: SW, height: SW * 1.3 }} resizeMode="contain" />
                </Pressable>
              )}
            />
            <Pressable style={s.viewerX} onPress={closeBig} hitSlop={10}><Text style={s.viewerXTxt}>✕</Text></Pressable>
          </View>
        </Modal>
      )}
      <FlatList
        ref={ref}
        data={data}
        extraData={colors.accent + colors.border}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={idx}
        getItemLayout={(_, i) => ({ length: SLIDE_W, offset: SLIDE_W * i, index: i })}
        windowSize={3}
        initialNumToRender={3}
        onScrollBeginDrag={() => { drag.current = true; }}
        onScrollEndDrag={() => { drag.current = false; }}
        onMomentumScrollEnd={(e) => { drag.current = false; setIdx(Math.round(e.nativeEvent.contentOffset.x / SLIDE_W)); }}
        renderItem={({ item, index }) => <Pressable onPress={() => { bigIdx.current = index; setBig(index); }}><SlideImg uri={item} /></Pressable>}
      />
      <View style={s.slideTag} pointerEvents="none"><Text style={s.slideTagTxt}>{label}</Text></View>
    </View>
  );
};
// Mindestdauer bei schnellem Internet (sieht nach kurzem Laden aus, nie nach Hänger) –
// bei langsamem Internet läuft die Animation, bis Termine da sind (Sicherheitsgrenze 30 s)
const LOADER_MIN_MS = 450;
const LOADER_MAX_MS = 30000;
// Lade-Animation beim Ortswechsel: Logo mit rotem Ring, der um das Logo kreist
const Loader = ({ visible, top }: { visible: boolean; top: number }) => {
  const spin = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      spin.setValue(0);
      Animated.timing(fade, { toValue: 1, duration: 150, useNativeDriver: true }).start();
      const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 700, easing: Easing.linear, useNativeDriver: true }));
      loop.start();
      return () => loop.stop();
    }
    Animated.timing(fade, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setMounted(false));
  }, [visible]);
  if (!mounted) return null;
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={[s.loader, { top, opacity: fade }]}>
      <View style={s.loaderBox}>
        <Animated.View style={[s.ring, { transform: [{ rotate }] }]} />
        <Image source={{ uri: LOGO }} style={s.loaderLogo} />
      </View>
    </Animated.View>
  );
};
// Wisch-Streifen am Bildschirmrand: von außen nach innen wischen (wie die Zurück-Geste beim iPhone).
// onMove meldet den Weg nach innen (die Seite folgt dem Finger), onCancel = zu kurz gewischt.
const EdgeSwipe = ({ side, onTrigger, onMove, onCancel }: { side: 'left' | 'right'; onTrigger: (side: 'left' | 'right') => void; onMove?: (d: number, side: 'left' | 'right') => void; onCancel?: () => void }) => {
  const cb = useRef(onTrigger); cb.current = onTrigger;
  const mv = useRef(onMove); mv.current = onMove;
  const cn = useRef(onCancel); cn.current = onCancel;
  const sd = useRef(side); sd.current = side;
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, g) => { const d = g.dx * (sd.current === 'left' ? 1 : -1); if (mv.current && d > 0 && Math.abs(g.dy) < 160) mv.current(d, sd.current); },
    onPanResponderTerminate: () => { cn.current?.(); },
    onPanResponderRelease: (_, g) => {
      const k = sd.current === 'left' ? 1 : -1;
      const dir = g.dx * k, v = g.vx * k;
      if (Math.abs(g.dy) < 120 && (dir > 70 || (dir > 28 && v > 0.35))) cb.current(sd.current);
      else cn.current?.();
    },
  })).current;
  return <View {...pan.panHandlers} style={[s.edge, side === 'left' ? { left: 0 } : { right: 0 }]} />;
};
// Streifen links, rechts oder auf beiden Seiten (je nach Einstellung)
const Edges = ({ side, onTrigger, onMove, onCancel }: { side: Side; onTrigger: (side: 'left' | 'right') => void; onMove?: (d: number, side: 'left' | 'right') => void; onCancel?: () => void }) =>
  side === 'both' ? (
    <>
      <EdgeSwipe side="left" onTrigger={onTrigger} onMove={onMove} onCancel={onCancel} />
      <EdgeSwipe side="right" onTrigger={onTrigger} onMove={onMove} onCancel={onCancel} />
    </>
  ) : <EdgeSwipe side={side} onTrigger={onTrigger} onMove={onMove} onCancel={onCancel} />;
// Tippen auf den freien Bereich oder seitlich wischen schließt das Menü
const useDismiss = (onClose: () => void, taps: boolean) => {
  const cb = useRef(onClose); cb.current = onClose;
  return useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => taps,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderTerminationRequest: () => false,
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) < 8 && Math.abs(g.dy) < 8) { if (taps) cb.current(); return; }
      if (Math.abs(g.dx) > 40 && Math.abs(g.dx) > Math.abs(g.dy)) cb.current();
    },
  })).current;
};
// Seitenmenü: gleitet von rechts herein
const DRAWER_W = Math.round((SW * 2) / 3); // Menü bedeckt 2/3 des Bildschirms
const Drawer = ({ open, onClose, side, children }: { open: boolean; onClose: () => void; side: Side; children: React.ReactNode }) => {
  const x = useRef(new Animated.Value(DRAWER_W)).current;
  const [shown, setShown] = useState(open);
  const bg = useDismiss(onClose, true);
  const body = useDismiss(onClose, false);
  useEffect(() => {
    if (open) { setShown(true); Animated.timing(x, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(); }
    else Animated.timing(x, { toValue: DRAWER_W, duration: 180, useNativeDriver: true }).start(() => setShown(false));
  }, [open]);
  if (!shown) return null;
  const fade = x.interpolate({ inputRange: [0, DRAWER_W], outputRange: [1, 0] });
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Animated.View style={[s.menuBg, { opacity: fade }]} {...bg.panHandlers} />
        <Animated.View style={[s.drawer, { transform: [{ translateX: x }] }]} {...body.panHandlers}>{children}</Animated.View>
        <Edges side={side} onTrigger={onClose} />
      </View>
    </Modal>
  );
};
const Icon = ({ name, size = 22, color = colors.accent, fallback }: { name: string; size?: number; color?: string; fallback: string }) =>
  Ionicons ? <Ionicons name={name} size={size} color={color} /> : <Text style={{ fontSize: size - 4 }}>{fallback}</Text>;
export default function App() {
  const [cfg, setCfg] = useState<Cfg>(DEFAULT_CFG);
  const [cfgReady, setCfgReady] = useState(false);
  const [adm, setAdm] = useState<Remote>({});
  applyRemote(adm);
  applyStyles(cfg.mode, cfg.accent); // Farben + Stile für den aktuellen Modus (vor allen Unterkomponenten)
  // Einstellungen merken (falls AsyncStorage vorhanden ist)
  useEffect(() => {
    (async () => {
      try {
        const raw = await Store?.getItem(CFG_KEY);
        if (raw) {
          const j = JSON.parse(raw);
          setCfg((c) => ({
            action: ['back', 'menu', 'reload'].includes(j.action) ? j.action : c.action,
            side: ['right', 'both'].includes(j.side) ? j.side : 'left',
            mode: j.mode === 'dark' ? 'dark' : 'light',
            accent: ACCENTS[j.accent as AccentKey] ? j.accent : c.accent,
          }));
        }
      } catch (e) {}
      setCfgReady(true);
    })();
  }, []);
  useEffect(() => { if (cfgReady) { try { Store?.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {} } }, [cfg, cfgReady]);
  const refreshRemote = useCallback(async () => {
    const r = await fetchRemote();
    if (r) { setAdm(r); try { Store?.setItem(REMOTE_KEY, JSON.stringify(r)); } catch (e) {} }
  }, []);
  useEffect(() => {
    (async () => { try { const raw = await Store?.getItem(REMOTE_KEY); if (raw) setAdm(JSON.parse(raw)); } catch (e) {} refreshRemote(); })();
  }, []);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [marksReady, setMarksReady] = useState(false);
  const [palFor, setPalFor] = useState<string | null>(null);
  useEffect(() => {
    (async () => { try { const raw = await Store?.getItem(MARKS_KEY); if (raw) setMarks(JSON.parse(raw)); } catch (e) {} setMarksReady(true); })();
  }, []);
  useEffect(() => { if (marksReady) { try { Store?.setItem(MARKS_KEY, JSON.stringify(marks)); } catch (e) {} } }, [marks, marksReady]);
  const tapMark = (c: Course, n: Slot) => {
    const u = n.url; if (!u) return;
    if (!marks[u]) { setMarks((m) => ({ ...m, [u]: { url: u, color: MARK_COLORS[0], title: c.title, city: c.city, label: n.label, time: n.time, start: n.start.getTime() } })); setPalFor(u); }
    else unmark(u); // nochmal auf den Stern = Markierung aufheben
  };
  const setMarkColor = (u: string, color: string) => setMarks((m) => (m[u] ? { ...m, [u]: { ...m[u], color } } : m));
  const unmark = (u: string) => { setMarks((m) => { const r = { ...m }; delete r[u]; return r; }); setPalFor(null); };
  // Meine Anmeldungen (nach „Zahlungspflichtig anmelden“ automatisch gemerkt)
  const [booked, setBooked] = useState<Record<string, Booking>>({});
  const [bookedReady, setBookedReady] = useState(false);
  BOOKED = booked;
  useEffect(() => {
    (async () => { try { const raw = await Store?.getItem(REG_KEY); if (raw) setBooked(JSON.parse(raw)); } catch (e) {} setBookedReady(true); })();
  }, []);
  useEffect(() => { if (bookedReady) { try { Store?.setItem(REG_KEY, JSON.stringify(booked)); } catch (e) {} } }, [booked, bookedReady]);
  const markBooked = (url: string, i: BookInfo, extra?: { people?: Person[]; count?: number }) => setBooked((b) => ({ ...b, [url]: { ...i, ...(extra ?? {}), url } }));
  const formData = useRef<FormField[]>([]);
  const [webAsk, setWebAsk] = useState<{ url: string; title: string; info: BookInfo } | null>(null);
  const [webCnt, setWebCnt] = useState(1);
  const [profile, setProfile] = useState<Profile>({ name: '', user: '', first: '', last: '', kind: '', done: false });
  const [profReady, setProfReady] = useState(false);
  useEffect(() => {
    (async () => { try { const raw = await Store?.getItem(PROFILE_KEY); if (raw) { const j = JSON.parse(raw); setProfile({ name: String(j.name ?? ''), user: String(j.user ?? ''), first: String(j.first ?? ''), last: String(j.last ?? ''), kind: j.kind === 'privat' || j.kind === 'geschaeftlich' ? j.kind : '', done: !!j.done }); } } catch (e) {} setProfReady(true); })();
  }, []);
  useEffect(() => { if (profReady) { try { Store?.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch (e) {} } }, [profile, profReady]);
  const [onbStep, setOnbStep] = useState(0);
  const [onbFirst, setOnbFirst] = useState('');
  const [onbLast, setOnbLast] = useState('');
  const [onbUser, setOnbUser] = useState('');
  const [onbErr, setOnbErr] = useState('');
  const [onbBusy, setOnbBusy] = useState(false);
  const [onbClaimed, setOnbClaimed] = useState('');
  const tryLogin = async () => {
    const u = onbUser.trim();
    if (u.length < 3 || u.length > 24 || !/^[A-Za-z0-9ÄÖÜäöüß._ -]+$/.test(u)) { setOnbErr('Bitte 3 bis 24 Zeichen: Buchstaben, Zahlen, Leerzeichen, Punkt, Bindestrich.'); return; }
    setOnbBusy(true); setOnbErr('');
    if (onbClaimed.toLowerCase() !== u.toLowerCase()) {
      const res = await userClaim(u);
      if (res === 'taken') { setOnbBusy(false); setOnbErr('Dieser Benutzername existiert bereits. Bitte wähle einen anderen oder lass dir einen generieren.'); return; }
      if (res === 'error') { setOnbBusy(false); setOnbErr('Keine Verbindung zum Internet oder zum Server. Bitte versuche es gleich noch einmal.'); return; }
      setOnbClaimed(u);
    }
    setOnbBusy(false);
    setOnbStep(1);
  };
  const generateUser = async () => {
    setOnbBusy(true);
    let u = genUser(); for (let i = 0; i < 5 && (await userTaken(u)); i++) u = genUser();
    setOnbBusy(false); setOnbUser(u); setOnbErr('');
  };
  const [onbInfo, setOnbInfo] = useState<'' | 'privat' | 'geschaeftlich'>('');
  const showOnb = profReady && !profile.user;
  const finishOnb = (kind: Profile['kind']) => { const p = { user: onbUser.trim(), first: onbFirst.trim(), last: onbLast.trim() }; setProfile({ ...p, name: dispName(p), kind, done: true }); };
  const [partUrl, setPartUrl] = useState<string | null>(null);
  const [partDraft, setPartDraft] = useState<Person[]>([]);
  const [usedCodes, setUsedCodes] = useState<string[]>([]);
  const [codeFor, setCodeFor] = useState('');
  const codeKey = CODES_KEY + '_' + (profile.user.toLowerCase() || 'default');   // jeder Benutzername hat seinen eigenen Code-Zähler
  useEffect(() => {
    if (!profReady) return;
    (async () => {
      let list: string[] = [];
      try {
        let raw = await Store?.getItem(codeKey);
        if (!raw) raw = await Store?.getItem(CODES_KEY);   // alter Stand aus früheren Versionen
        if (raw) { if (raw.trim().startsWith('[')) list = JSON.parse(raw).filter((c: string) => DEL_CODES.includes(c)); else list = DEL_CODES.slice(0, Math.max(0, parseInt(raw, 10) || 0)); }
      } catch (e) {}
      setUsedCodes(list); setCodeFor(codeKey);
    })();
  }, [profReady, codeKey]);
  useEffect(() => { if (codeFor === codeKey) { try { Store?.setItem(codeKey, JSON.stringify(usedCodes)); } catch (e) {} } }, [usedCodes, codeFor, codeKey]);
  const [cancelled, setCancelled] = useState<Cancelled[]>([]);
  const [cancReady, setCancReady] = useState(false);
  useEffect(() => { (async () => { try { const raw = await Store?.getItem(CANC_KEY); if (raw) setCancelled(JSON.parse(raw)); } catch (e) {} setCancReady(true); })(); }, []);
  useEffect(() => { if (cancReady) { try { Store?.setItem(CANC_KEY, JSON.stringify(cancelled)); } catch (e) {} } }, [cancelled, cancReady]);
  const [delUrl, setDelUrl] = useState<string | null>(null);
  const [delCode, setDelCode] = useState('');
  const [delErr, setDelErr] = useState('');
  const [delStep, setDelStep] = useState(0);
  const [delSel, setDelSel] = useState<number[]>([]);
  const [partWarn, setPartWarn] = useState(false);
  const openDel = (b: Booking) => { setDelCode(''); setDelErr(''); setDelStep(0); setDelSel((b.people ?? []).map((_, i) => i)); setDelUrl(b.url); };
  const delBooking = delUrl ? booked[delUrl] : null;
  const delPeople = delBooking?.people ?? [];
  const [delBusy, setDelBusy] = useState(false);
  const checkCode = async () => {
    const b = delBooking; if (!b) return;
    const c = delCode.trim();
    if (SUPABASE_URL && SUPABASE_KEY) {
      setDelBusy(true);
      const res = await codeRpc('check_code', c, profile.user.toLowerCase());
      setDelBusy(false);
      if (res === 'invalid') { setDelErr('Der Code stimmt nicht. Du bekommst ihn von MSG, nachdem der Termin dort storniert wurde.'); return; }
      if (res === 'used') { setDelErr('Dieser Code wurde von dir schon benutzt. Bitte nimm einen anderen Code.'); return; }
      if (res !== 'ok') { setDelErr('Keine Verbindung zum Server. Bitte prüfe dein Internet und versuche es noch einmal.'); return; }
    } else {
      if (!DEL_CODES.includes(c)) { setDelErr('Der Code stimmt nicht. Du bekommst ihn von MSG, nachdem der Termin dort storniert wurde.'); return; }
      if (usedCodes.includes(c)) { setDelErr('Dieser Code wurde schon benutzt. Bitte nimm einen anderen Code.'); return; }
    }
    setDelErr('');
    if (delPeople.length > 1) setDelStep(1); else finalizeDelete(delPeople.map((_, i) => i), false);
  };
  const finalizeDelete = (sel: number[], inform: boolean) => {
    const b = delBooking; if (!b) return;
    const ps = b.people ?? [];
    const whole = ps.length <= 1 || sel.length === ps.length;
    const gone = ps.length ? sel.map((i) => ps[i]) : [];
    const code = delCode.trim();
    if (SUPABASE_URL && SUPABASE_KEY) codeRpc('consume_code', code, profile.user.toLowerCase());
    else setUsedCodes((u) => { const n = [...u, code]; return n.length >= DEL_CODES.length ? [] : n; });   // alle 5 benutzt = wieder von vorn
    setCancelled((l) => [{ ...b, people: gone, count: gone.length || b.count, cancelledAt: Date.now(), whole, key: b.url + '#' + Date.now() }, ...l]);
    if (whole) {
      if (b.eventId && DeviceCal?.deleteEventAsync) { try { DeviceCal.deleteEventAsync(b.eventId); } catch (e) {} }
      setBooked((m) => { const n = { ...m }; delete n[b.url]; return n; });
    } else {
      const rest = ps.filter((_, i) => !sel.includes(i));
      setBooked((m) => m[b.url] ? { ...m, [b.url]: { ...m[b.url], people: rest, count: rest.length, edited: true } } : m);
    }
    const mails = gone.map((p) => p.email).filter((e): e is string => !!e && e.includes('@'));
    setDelUrl(null); setDelCode(''); setDelErr(''); setDelStep(0);
    if (inform && mails.length) {
      const me = profile.name;
      const hi = gone.length === 1 && gone[0].name ? `Hallo ${gone[0].name}` : 'Hallo zusammen';
      const subject = `Kurs abgesagt: ${b.title} am ${b.label}`;
      const body = `${hi},\n\nleider findet der Kurs „${b.title}“ am ${b.label} (${b.time}) in ${b.city} für ${gone.length === 1 ? 'dich' : 'euch'} nicht mehr statt. Der Termin wurde storniert.\n\nHinweis: Diese Nachricht kommt von mir${me ? ` (${me})` : ''}, nicht von der MSG Erste-Hilfe-Schule. Es kann sein, dass MSG zusätzlich eine eigene Nachricht schickt.\n\nMit freundlichen Grüßen${me ? `\n${me}` : ''}`;
      const q = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      setTimeout(() => Linking.openURL(mails.length === 1 ? `mailto:${mails[0]}?${q}` : `mailto:?bcc=${mails.join(',')}&${q}`), 400);
    } else {
      Alert.alert('Gelöscht', whole ? 'Der Termin wurde aus der App entfernt und steht jetzt in der Kurshistorie.' : 'Die ausgewählten Teilnehmer wurden entfernt und stehen in der Kurshistorie.');
    }
  };
  const openParts = (b: Booking) => {
    setPartWarn(true);
    const base: Person[] = (b.people ?? []).map((p) => ({ ...p }));
    while (base.length < maxPersons(b)) base.push({ name: '' });
    setPartDraft(base); setPartUrl(b.url);
  };
  const setPerson1 = (i: number, patch: Partial<Person>) => setPartDraft((l) => l.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const saveParts = () => {
    if (!partUrl) return;
    const clean = partDraft.map((p) => ({ name: p.name.trim(), email: p.email?.trim() || undefined, phone: p.phone?.trim() || undefined })).filter((p) => p.name || p.email || p.phone);
    setBooked((m) => m[partUrl] ? { ...m, [partUrl]: { ...m[partUrl], people: clean, count: maxPersons(m[partUrl]), edited: true } } : m);
    setPartUrl(null);
  };
  const sendConfirm = (p: Person, how: 'mail' | 'wa' | 'sms') => {
    const b = partUrl ? booked[partUrl] : null; if (!b) return;
    const { subject, body } = confirmMail(b, p, profile);
    if (how === 'mail' && p.email) {
      Alert.alert('Termin senden?', `Die Bestätigung wird in deiner eigenen Mail-App an ${p.email} vorbereitet und kommt von dir${profile.name ? ` (${profile.name})` : ''}, nicht von MSG. Es kann sein, dass MSG zusätzlich eine eigene Bestätigung schickt.`, [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Mail-App öffnen', onPress: () => Linking.openURL(`mailto:${p.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`) },
      ]);
    } else if (p.phone) {
      Alert.alert('Termin senden?', `Die Nachricht an ${p.phone} kommt von dir, nicht von MSG. MSG kann zusätzlich eine eigene Bestätigung schicken.`, [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'WhatsApp', onPress: () => Linking.openURL(`https://wa.me/${waDigits(p.phone!)}?text=${encodeURIComponent(body)}`) },
        { text: 'SMS', onPress: () => Linking.openURL(`sms:${p.phone}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(body)}`) },
      ]);
    }
  };
  const [askBk, setAskBk] = useState<Booking | null>(null);
  const [pendingCal, setPendingCal] = useState<string | null>(null);
  const [calAsk, setCalAsk] = useState<string | null>(null);
  const [deviceCals, setDeviceCals] = useState<any[] | null>(null);
  const [calErr, setCalErr] = useState('');
  const openAskFor = (b?: Booking) => { setAskBk(b ?? null); setAsk(true); };
  const loadDeviceCals = async () => {
    setDeviceCals(null); setCalErr('');
    if (!DeviceCal) { setDeviceCals([]); setCalErr('Der Zugriff auf den Handy-Kalender ist hier nicht verfügbar (Paket „expo-calendar“ fehlt in der package.json).'); return; }
    try {
      const p = await DeviceCal.requestCalendarPermissionsAsync();
      if (p.status !== 'granted') { setDeviceCals([]); setCalErr('Der Zugriff auf deinen Kalender wurde nicht erlaubt. Du kannst das in den iPhone-Einstellungen ändern.'); return; }
      const list = await DeviceCal.getCalendarsAsync(DeviceCal.EntityTypes.EVENT);
      setDeviceCals(list.filter((c: any) => c.allowsModifications));
    } catch (e) { setDeviceCals([]); setCalErr('Die Kalender konnten nicht geladen werden.'); }
  };
  const saveToCalendar = async (cal: any) => {
    const b = calAsk ? booked[calAsk] : null; if (!b) return;
    try {
      const id = await DeviceCal.createEventAsync(cal.id, {
        title: `MSG · ${b.title}`,
        startDate: new Date(b.start),
        endDate: new Date(b.end ?? b.start + 4 * 3600 * 1000),
        location: b.city,
        notes: `MSG Erste-Hilfe-Schule\nStornieren oder verschieben: ${contact.phone}, WhatsApp oder ${contact.email}`,
        timeZone: 'Europe/Berlin',
        alarms: [{ relativeOffset: -1440 }, { relativeOffset: -60 }],
      });
      setBooked((m) => ({ ...m, [b.url]: { ...m[b.url], eventId: String(id), calName: cal.title } }));
      setCalAsk(null);
      Alert.alert('Gespeichert', `Der Termin steht jetzt im Kalender „${cal.title}“ (mit Erinnerung am Vortag).`);
    } catch (e) { setCalErr('Der Termin konnte nicht gespeichert werden.'); }
  };
  const submitted = useRef(false);
  const curUrl = useRef('');
  const [regToast, setRegToast] = useState(false);
  useEffect(() => { if (!regToast) return; const t = setTimeout(() => setRegToast(false), 9000); return () => clearTimeout(t); }, [regToast]);
  const finishBooking = () => { submitted.current = false; if (reg?.info) { let ex: any; try { ex = parseForm(formData.current); } catch (e) {} markBooked(reg.url, reg.info, ex); formData.current = []; setRegToast(true); setPendingCal(reg.url); } };
  const onRegMsg = (raw: string) => {
    let m: any; try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.t === 'submit') { submitted.current = true; if (Array.isArray(m.f) && m.f.length) formData.current = m.f; return; }
    if (!submitted.current) return;
    if (m.t === 'page') { if (!m.form) finishBooking(); else submitted.current = false; }   // Formular weg = Anmeldung durch; Formular noch da = Fehler im Formular
    if (m.t === 'after') { if (!m.form) finishBooking(); else submitted.current = false; }
  };
  // aktuelle Seite im normalen Browser-Fenster öffnen (falls etwas in der App-Ansicht nicht bedienbar ist)
  const openExternal = () => {
    const u = curUrl.current || reg?.url; if (!u) return;
    if (WebBrowser?.openBrowserAsync) WebBrowser.openBrowserAsync(u); else Linking.openURL(u);
  };
  const setC = (patch: Partial<Cfg>) => setCfg((c) => ({ ...c, ...patch }));
  const [slots, setSlots] = useState<Record<string, Slot[]>>({});
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ pages: 0, slots: 0, sample: '' });
  const [pending, setPending] = useState<Course[]>([]);
  const [active, setActive] = useState<Course[]>([]);
  const [loc, setLoc] = useState<Coords | null>(null);
  const [locMsg, setLocMsg] = useState('');
  const [city, setCity] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [reg, setReg] = useState<{ url: string; title: string; info?: BookInfo } | null>(null);
  // Anmeldeseite innerhalb der App öffnen (ohne WebView-Paket: normaler Browser)
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(3);
  const [specials, setSpecials] = useState(false);
  const [page, setPage] = useState<Page>('home');
  // Kalender
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [calDay, setCalDay] = useState<Date | null>(null);
  const [calCities, setCalCities] = useState<string[]>([]);
  const [calCats, setCalCats] = useState<string[]>([]);
  const [calFav, setCalFav] = useState(false);
  const [draftFav, setDraftFav] = useState(false);
  const [calMine, setCalMine] = useState(false);
  const [draftMine, setDraftMine] = useState(false);
  const [draftCities, setDraftCities] = useState<string[]>([]);
  const [draftCats, setDraftCats] = useState<string[]>([]);
  const [calFilter, setCalFilter] = useState(false);
  const [calKey, setCalKey] = useState(0);
  const calRef = useRef<ScrollView>(null);
  const [sq, setSq] = useState('');
  const [searchKey, setSearchKey] = useState(0);
  const searchRef = useRef<ScrollView>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const memberY = useRef<Record<string, number>>({});
  const [person, setPerson] = useState<(typeof TEAM)[number] | null>(null);
  const [bios, setBios] = useState<Record<string, Bio | 'error' | 'loading'>>({});
  const openPerson = (m: (typeof TEAM)[number]) => {
    setPerson(m);
    if (bios[m.name] && bios[m.name] !== 'error') return;
    setBios((b) => ({ ...b, [m.name]: 'loading' }));
    fetchBio(m.slug, m.name).then((bio) => setBios((b) => ({ ...b, [m.name]: bio ?? 'error' })));
  };
  const [menu, setMenu] = useState(false);
  const [ask, setAsk] = useState(false);
  const [teamKey, setTeamKey] = useState(0);
  const teamRef = useRef<ScrollView>(null);
  const [heroH, setHeroH] = useState(240);
  const listRef = useRef<FlatList<Result>>(null);
  const [gdata, setGdata] = useState<GoogleData | null>(null);
  const [seed, setSeed] = useState(0);
  // Lade-Animation: mindestens eine Umdrehung, länger falls noch Termine laden (max. 8 s)
  // Startet auch direkt beim App-Start (pulseId = 1)
  const [pulseId, setPulseId] = useState(1);
  const [switching, setSwitching] = useState(true);
  const [minDone, setMinDone] = useState(false);
  const pulse = (quiet = false) => { if (!quiet) buzz(); listRef.current?.scrollToOffset({ offset: 0, animated: false }); teamRef.current?.scrollTo({ y: 0, animated: false }); searchRef.current?.scrollTo({ y: 0, animated: false }); calRef.current?.scrollTo({ y: 0, animated: false }); setPulseId((n) => n + 1); };
  useEffect(() => {
    setSwitching(true); setMinDone(false);
    const a = setTimeout(() => setMinDone(true), LOADER_MIN_MS);
    const b = setTimeout(() => setSwitching(false), LOADER_MAX_MS);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [pulseId]);
  // Kopf-Suche: erkennt Ort und/oder Kursart, auch mit Tippfehlern
  const dq = useMemo(() => (query.trim() ? parseDateQuery(query) : null), [query]);
  const match = useMemo(() => (query.trim() ? matchQuery(dq ? dq.rest : query) : null), [query, dq]);
  // Früher/Später: springt zum vorherigen bzw. nächsten Tag mit freiem Termin
  const [anchor, setAnchor] = useState<Date | null>(null);
  useEffect(() => { setAnchor(null); }, [query]);
  const matchKey = match ? `${match.city}|${match.category}` : '';
  useEffect(() => {
    if (!match) return;
    if (match.city) setCity(match.city);
    if (match.category) setCategory(match.category);
    setSpecials(false); pulse(true);
  }, [matchKey]);
  useEffect(() => { setShown(3); }, [city, category, loc, specials]);
  // Anmeldeseite immer IN der App öffnen (WebView; ohne das Paket: In-App-Browser; zuletzt normaler Browser)
  const openReg: Register = (url, title, info) => {
    if (BOOKED[url]) {
      Alert.alert('Du bist schon angemeldet', 'Diesen Termin hast du bereits gebucht. ' + CANCEL_INFO, [
        { text: 'Kontakt aufnehmen', onPress: () => openAskFor(BOOKED[url]) },
        { text: 'OK', style: 'cancel' },
      ]);
      return;
    }
    if (WebView) { submitted.current = false; curUrl.current = url; setReg({ url, title, info }); }
    else if (IS_WEB) { Linking.openURL(url); if (info) { setWebCnt(1); setWebAsk({ url, title, info }); } }
    else if (WebBrowser?.openBrowserAsync) WebBrowser.openBrowserAsync(url);
    else Linking.openURL(url);
  };
  const confirmWebBooking = () => {
    if (!webAsk) return;
    const a = webAsk; setWebAsk(null);
    markBooked(a.url, a.info, { count: webCnt, people: [] });
    setTimeout(() => openParts({ ...a.info, url: a.url, count: webCnt, people: [] } as Booking), 300);
  };
  const load = useCallback(async () => {
    setLoading(true); setStats({ pages: 0, slots: 0, sample: '' }); setPending([]); setActive([]); setSeed((n) => n + 1);
    const queue = [...COURSES];
    const worker = async () => {
      for (let c = queue.shift(); c; c = queue.shift()) {
        try {
          const { slots: list } = await fetchSlots(c);
          if (list.length === 0) { setPending((p) => [...p, c]); continue; }
          setSlots((p) => ({ ...p, [c.id]: list }));
          setStats((p) => ({ ...p, pages: p.pages + 1, slots: p.slots + list.length }));
        } catch { setPending((p) => [...p, c]); }
 }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  const refresh = () => { load(); pulse(); };
  // Fotos erst vorladen, wenn die Termine da sind (damit der Start nicht ausgebremst wird)
  useEffect(() => { if (!loading) { prefetchAll(SLIDES); prefetchAll(TEAM.map((m) => TEAM_URL + m.photo)); } }, [loading]);
  // „Termine werden geladen“ höchstens ca. 2 Sekunden zeigen – auch wenn noch geladen wird
  const [hint, setHint] = useState(true);
  useEffect(() => { setHint(true); const t = setTimeout(() => setHint(false), 2000); return () => clearTimeout(t); }, [seed]);
  // Browser-Fallback: höchstens 3 unsichtbare Seiten gleichzeitig
  useEffect(() => {
    if (active.length < 3 && pending.length > 0) {
      setActive((a) => [...a, pending[0]]);
      setPending((p) => p.slice(1));
    }
  }, [pending, active]);
  const onDone = useCallback((c: Course, html: string) => {
    const list = html ? parseSlots(html, SITES[c.site]) : [];
    setSlots((p) => ({ ...p, [c.id]: list }));
    setStats((p) => ({ pages: p.pages + 1, slots: p.slots + list.length, sample: p.sample || (list.length === 0 ? `${c.id}: len=${html.length}` : '') }));
    setActive((a) => a.filter((x) => x.id !== c.id));
  }, []);
  const busy = loading || pending.length + active.length > 0;
  const locate = async () => {
    if (!Location) return setLocMsg('Standort ist hier nicht verfügbar – wähle unten einfach eine Stadt.');
    setLocMsg('Standort wird ermittelt …');
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return setLocMsg('Standortfreigabe fehlt – wähle unten einfach eine Stadt.');
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLoc(p.coords); setCity(null); setQuery(''); setSpecials(false); pulse();
      const [a] = await Location.reverseGeocodeAsync(p.coords).catch(() => []);
      setLocMsg(`Standort: ${a?.city ?? a?.region ?? 'aktuelle Position'}`);
    } catch { setLocMsg('Standort konnte nicht ermittelt werden.'); }
  };
  const specialResults = useMemo(
    () => collect(COURSES.filter((c) => SPECIAL_IDS.includes(c.id)), slots, here(loc))
      .sort((a, b) => a.next.start.getTime() - b.next.start.getTime()),
    [slots, loc],
  );
  const nextSpecial = specialResults[0];
  const normal = useMemo(() => search(COURSES, slots, { city, category }, loc), [slots, city, category, loc]);
  const results = specials ? specialResults : normal;
  // Fertig, sobald es etwas zu zeigen gibt oder alle Seiten durch sind
  const ready = page !== 'home' || !busy || results.length > 0;
  useEffect(() => { if (switching && minDone && ready) setSwitching(false); }, [switching, minDone, ready]);
  const sugg = useMemo(
    () => (!specials && results.length === 0 ? suggestions(COURSES, slots, { city, category }, loc) : null),
    [specials, results, slots, city, category, loc],
  );
  const pickCity = (n: string | null) => {
    setCity(n); setQuery(''); setSpecials(false);
    pulse();
  };
  const toggleSpecials = () => {
    if (!specials) pulse();
    setSpecials((v) => !v);
  };
  // Alle buchbaren Termine der gewählten Stadt/Kursart, zeitlich sortiert
  const pool = useMemo(() => {
    if (!dq) return [] as { c: Course; n: Slot }[];
    const now = Date.now();
    const out: { c: Course; n: Slot }[] = [];
    for (const c of COURSES) {
      if ((city && c.city !== city) || (category && c.category !== category)) continue;
      for (const n of slots[c.id] ?? []) if (n.bookable && n.start.getTime() > now) out.push({ c, n });
    }
    return out.sort((a, b) => a.n.start.getTime() - b.n.start.getTime());
  }, [dq, slots, city, category]);
  const range = anchor ? { from: anchor, to: endOf(anchor), label: fmtDay(anchor) } : dq;
  const hits = range ? pool.filter((x) => x.n.start >= range.from && x.n.start <= range.to) : [];
  const before = range ? [...pool].reverse().find((x) => x.n.start < range.from) : undefined;
  const after = range ? pool.find((x) => x.n.start > range.to) : undefined;
  const datePanel = dq && range ? (
    <View style={[s.card, s.cardTop]}>
      <Text style={s.badge}>Terminsuche</Text>
      <Text style={s.title}>{range.label}</Text>
      <Text style={s.muted}>{[category, city].filter(Boolean).join(' · ') || 'Alle Orte und Kursarten'}</Text>
      {hits.length > 0 ? (
        hits.slice(0, 12).map((x) => <DateRow key={x.n.url ?? x.c.id + x.n.label} c={x.c} n={x.n} onRegister={openReg} />)
      ) : (
        <View>
          <Text style={s.dNone}>{busy ? 'Termine werden noch geladen …' : 'In diesem Zeitraum ist leider kein Termin frei.'}</Text>
          {before && <DateRow c={before.c} n={before.n} tag="Nächster Termin davor" onRegister={openReg} />}
          {after && <DateRow c={after.c} n={after.n} tag="Nächster Termin danach" onRegister={openReg} />}
        </View>
      )}
      <View style={s.dNav}>
        <Pressable style={[s.dBtn, !before && s.dOff]} disabled={!before} onPress={() => before && setAnchor(day0(before.n.start))}>
          <Text style={[s.moreTxt, !before && s.dOffTxt]}>‹ Früherer Termin</Text>
        </Pressable>
        <Pressable style={[s.dBtn, !after && s.dOff]} disabled={!after} onPress={() => after && setAnchor(day0(after.n.start))}>
          <Text style={[s.moreTxt, !after && s.dOffTxt]}>Späterer Termin ›</Text>
        </Pressable>
      </View>
    </View>
  ) : null;
  const brand = (sub: string) => (
    <View style={s.brand}>
      <View pointerEvents="none" style={s.band} />
      <Pressable style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }} onPress={() => go('home')} accessibilityLabel="Startseite">
        <Logo />
        <View style={{ flex: 1 }}>
          <Image source={{ uri: MSG_IMG }} style={s.msgImg} resizeMode="contain" accessibilityLabel="MSG" />
          <Image source={{ uri: WORDMARK }} style={s.wordmark} resizeMode="contain" accessibilityLabel="Erste-Hilfe-Schule" />
          <Text style={s.sub}>{sub}</Text>
        </View>
      </Pressable>
      <Pressable style={s.burger} onPress={() => setMenu(true)} hitSlop={10} accessibilityLabel="Menü">
        <View style={s.bar} /><View style={s.bar} /><View style={s.bar} />
      </Pressable>
    </View>
  );
  const bookedUp = Object.values(booked).filter((b) => b.start + 86400000 > Date.now()).sort((a, b) => a.start - b.start);
  const openBookedDay = (b: Booking) => { go('calendar'); const d = new Date(b.start); setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setCalDay(day0(d)); };
  const header = (
    <View>
      <View style={s.hero} onLayout={(e) => setHeroH(e.nativeEvent.layout.height)}>
        {brand('Finde deinen nächsten Erste-Hilfe-Kurs')}
        <TextInput
     style={s.search}
     value={query}
     onChangeText={setQuery}
          placeholder="🔍  Ort oder Kurs, z. B. Kinder Esslingen"
          placeholderTextColor={colors.muted}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
   />
        {!!query.trim() && <Text style={s.hint}>{dq
          ? `Termine: ${dq.label}${(match?.category ?? category) ? ` · ${match?.category ?? category}` : ''}${(match?.city ?? city) ? ` · ${match?.city ?? city}` : ''}`
          : match ? `Zeige ${match.category ?? 'Kurse'}${match.city ? ` in ${match.city}` : city ? ` in ${city}` : ''}` : 'Nichts erkannt – probier z. B. „Führerschein Fellbach“ oder „24.10.“'}</Text>}
        <Pressable style={s.locBtn} onPress={locate}>
          <Text style={s.locTxt}>📍 Meinen Standort verwenden</Text>
        </Pressable>
        {!!locMsg && <Text style={s.locMsg}>{locMsg}</Text>}
      </View>
      {!!adm.announce?.on && !!(adm.announce.title || adm.announce.text) && (
        <View style={[s.bookCard, { backgroundColor: colors.tint, borderWidth: 1.5, borderColor: colors.accent }]}>
          {!!adm.announce.title && <Text style={[s.bookH, { color: colors.primaryDark, fontSize: 16 }]}>{adm.announce.title}</Text>}
          {!!adm.announce.text && <Text style={[s.bookS, { color: colors.text, marginTop: 2 }]}>{adm.announce.text}</Text>}
        </View>
      )}
      {bookedUp.length > 0 && (
        <View style={s.bookCard}>
          {bookedUp.slice(0, 2).map((b) => (
            <Pressable key={b.url} style={s.bookRow} onPress={() => openBookedDay(b)}>
              <View style={s.bookCheck}><Text style={s.bookCheckTxt}>✓</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.bookH}>Du bist angemeldet</Text>
                <Text style={s.bookT}>{b.label} · {b.time}</Text>
                <Text style={s.bookS}>{b.title} · {b.city}</Text>
                <PersonLines b={b} color="#fff" onEdit={() => openParts(b)} />
              </View>
              <Text style={s.bookGo}>›</Text>
            </Pressable>
          ))}
          {bookedUp.length > 2 && <Text style={s.bookS}>+ {bookedUp.length - 2} weitere im Kalender</Text>}
          <Pressable onPress={() => openAskFor(bookedUp[0])} hitSlop={6}><Text style={s.bookLink}>Stornieren oder verschieben: Telefon, WhatsApp oder E-Mail ›</Text></Pressable>
        </View>
      )}
      <Text style={s.label}>Stadt</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
        <Chip label="Alle Orte" active={!specials && !city} onPress={() => pickCity(null)} />
        {Object.keys(CITIES).map((n) => <Chip key={n} label={n} active={!specials && city === n} onPress={() => pickCity(n)} />)}
      </ScrollView>
      <Text style={s.label}>Kursart</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
        <Chip label="Alle Kurse" active={!specials && !category} onPress={() => { setCategory(null); setSpecials(false); }} />
        {CATEGORIES.map((n) => <Chip key={n} label={n} active={!specials && category === n} onPress={() => { setCategory(n); setSpecials(false); }} />)}
      </ScrollView>
      <Pressable style={[s.special, specials && s.specialOn]} onPress={toggleSpecials}>
        <View style={s.specialStar}><Text style={s.specialStarTxt}>★</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={[s.specialH, specials && s.specialHOn]}>{specials ? 'Special-Kurse · aktiv' : 'Special-Kurse'}</Text>
          <Text style={[s.specialSub, specials && s.specialSubOn]} numberOfLines={1}>
            {nextSpecial ? `Als Nächstes: ${nextSpecial.course.title} · ${nextSpecial.next.label}` : busy ? (hint ? 'Termine werden geladen …' : '') : 'Aktuell keine Termine'}
          </Text>
        </View>
        <Text style={[s.specialGo, specials && s.specialHOn]}>{specials ? '✕' : '›'}</Text>
      </Pressable>
      {busy && hint && <View style={s.row}><ActivityIndicator color={colors.accent} /><Text style={s.muted}>  Termine werden geladen …</Text></View>}
      {datePanel}
    </View>
  );
  const empty = busy ? null : (
    <View>
      <Text style={s.sorry}>Sorry, aktuell gibt es hier keine Kurse.</Text>
      <Text style={s.empty}>Schau dir diese Alternativen an oder ruf uns kurz an.</Text>
      {sugg && sugg.nearby.length > 0 && (
        <View>
          <Text style={s.label}>Kurse in der Umgebung</Text>
          {sugg.nearby.map((r) => <Card key={r.course.id} r={r} from={city ?? undefined} onRegister={openReg} />)}
        </View>
 )}
      {sugg && sugg.similar.length > 0 && (
        <View>
          <Text style={s.label}>{sugg.similarLabel}</Text>
          {sugg.similar.map((r) => <Card key={r.course.id} r={r} from={city ?? undefined} onRegister={openReg} />)}
        </View>
 )}
    </View>
  );
  const moreCourses = !dq && results.length > shown ? (
    <Pressable style={[s.moreBtn, { marginHorizontal: 16, marginTop: 16 }]} onPress={() => setShown((n) => n + 3)}>
      <Text style={s.moreTxt}>Weitere Kurse anzeigen ({results.length - shown})</Text>
    </Pressable>
  ) : null;
  const [followers, setFollowers] = useState<string | null>(INSTAGRAM.followers);
  const [remote, setRemote] = useState<Review[]>([]);
  useEffect(() => { fetchFollowers().then((f) => f && setFollowers(f)); fetchGoogle().then((g) => g && setGdata(g)); fetchRemoteReviews().then((r) => r.length && setRemote(r)); }, [seed]);
  const reviewList: Review[] = useMemo(() => {
    const seen = new Set<string>(); const out: Review[] = [];
    for (const r of [...(gdata?.reviews ?? []), ...remote, ...GOOGLE.reviews]) {
      const k = norm(r.name) + '|' + norm(r.text).slice(0, 40);
      if (!seen.has(k)) { seen.add(k); out.push(r); }
    }
    return out;
  }, [gdata, remote]);
  const photos: string[] = useMemo(() => [...(gdata?.photos ?? []), ...SLIDES], [gdata]);
  const insta = (
    <Pressable style={s.insta} onPress={() => Linking.openURL(INSTAGRAM.url)}>
      <View style={s.instaIcon}>
        {Ionicons ? <Ionicons name="logo-instagram" size={30} color="#E1306C" /> : <Text style={{ fontSize: 22 }}>📷</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.instaH}>@{INSTAGRAM.user}</Text>
        <Text style={s.muted}>{followers ? `${followers} Follower auf Instagram` : 'Kurs-News & Tipps auf Instagram'}</Text>
      </View>
      <View style={s.instaBtn}><Text style={s.instaBtnTxt}>Folgen</Text></View>
    </Pressable>
  );
  const reviews = (
    <View style={s.reviews}>
      <Text style={s.revH}>★ {gdata?.rating ?? GOOGLE.rating} auf Google{gdata?.count ? `  ·  ${gdata.count} Bewertungen` : ''}</Text>
      <ReviewCarousel key={`${seed}-${reviewList.length}`} source={reviewList} />
      <Pressable style={[s.cBtn, { marginHorizontal: 16, flex: 0 }]} onPress={() => Linking.openURL(GOOGLE.url)}>
        <Text style={s.cTxt}>Alle Bewertungen auf Google</Text>
      </Pressable>
      {insta}
    </View>
  );
  const contactBlock = (
      <View style={s.contact}>
        <Text style={s.contactH}>Fragen? Wir helfen gern.</Text>
        <View style={s.contactRow}>
          <Pressable style={s.cBtn} onPress={() => Linking.openURL(contact.phoneUrl)}><Text style={s.cTxt}>📞 {contact.phone}</Text></Pressable>
          <Pressable style={[s.cBtn, s.cRow]} onPress={() => Linking.openURL(contact.whatsappUrl)}><Icon name="logo-whatsapp" color="#25D366" fallback="💬" /><Text style={[s.cTxt, { marginLeft: 6 }]}>WhatsApp</Text></Pressable>
        </View>
        <Pressable style={s.cBtn} onPress={() => Linking.openURL(`mailto:${contact.email}`)}><Text style={s.cTxt}>✉️ {contact.email}</Text></Pressable>
      </View>
  );
  // Am Ende der Kursliste: weiter zur Website (je Stadt die passende, ohne Stadt beide) – öffnet in der App
  const originOf = (cn: string) => { const c0 = COURSES.find((x) => x.city === cn); return c0 ? SITES[c0.site] : null; };
  const hostOf = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '');
  const webBlock = dq || specials ? null : city && originOf(city) ? (
    <View style={s.webCard}>
      <Text style={s.webH}>Mehr Kurse in {city}?</Text>
      <Text style={s.muted}>Alle Kurse und freien Termine für {city} findest du auch direkt auf der Website.</Text>
      <Pressable style={s.btn} onPress={() => openReg(originOf(city)!, `MSG · ${city}`)}><Text style={s.btnTxt}>Zur Website · {hostOf(originOf(city)!)} ›</Text></Pressable>
    </View>
  ) : (
    <View style={s.webCard}>
      <Text style={s.webH}>Noch mehr Kurse?</Text>
      <Text style={s.muted}>Alle Kurse und Termine findest du auch auf unseren Websites.</Text>
      {(Object.keys(SITES) as Site[]).map((k) => (
        <Pressable key={k} style={s.moreBtn} onPress={() => openReg(SITES[k], `MSG · ${k === 'fellbach' ? 'Fellbach' : 'Ludwigsburg'}`)}><Text style={s.moreTxt}>{hostOf(SITES[k])} ›</Text></Pressable>
      ))}
    </View>
  );
  const footer = (
    <View>
      {moreCourses}
      {webBlock}
      <Pressable style={s.ask} onPress={() => setAsk(true)}>
        <Icon name="chatbubbles-outline" color="#fff" fallback="💬" />
        <Text style={s.askTxt}>Kurs anfragen</Text>
      </Pressable>
      {adm.showSlideshow !== false && <Slideshow key={`sl-${seed}-${photos.length}`} images={photos} label={gdata?.photos.length ? 'Fotos: Google Maps & MSG' : 'MSG Erste-Hilfe-Schule'} />}
      {adm.showReviews !== false && reviews}
      {contactBlock}
    </View>
  );
  const team = (
    <ScrollView key={teamKey} ref={teamRef} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={s.hero} onLayout={(e) => setHeroH(e.nativeEvent.layout.height)}>{brand('Unser Team')}</View>
      <Text style={s.teamIntro}>Das Erste-Hilfe-Schulungsteam von MSG</Text>
      {TEAM.map((m) => (
        <Pressable key={m.name} style={[s.member, focus === m.name && s.memberOn]} onPress={() => openPerson(m)} onLayout={(e) => { memberY.current[m.name] = e.nativeEvent.layout.y; }}>
          <View style={s.memberPic}><Photo uri={TEAM_URL + m.photo} w={88} maxH={116} /></View>
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Text style={s.memberName}>{m.name}</Text>
            <Text style={s.memberRole}>{m.role}</Text>
            <Text style={s.memberInfo} numberOfLines={3}>{m.info}</Text>
            <Text style={s.memberMore}>Mehr über {m.name.split(' ')[0]} ›</Text>
          </View>
        </Pressable>
      ))}
      {contactBlock}
    </ScrollView>
  );
  // Verlauf der besuchten Seiten (für „einen Schritt zurück“)
  const hist = useRef<Snap[]>([]);
  const here0 = (): Snap => ({ page, city, category, specials });
  const samePlace = (a: Snap, b: Snap) => a.page === b.page && (a.page !== 'home' || (a.city === b.city && a.category === b.category && a.specials === b.specials));
  const pushHist = (target: Snap) => {
    const cur = here0();
    if (samePlace(cur, target)) return;
    hist.current.push(cur);
    if (hist.current.length > 30) hist.current.shift();
  };
  const restore = (h: Snap) => {
    setFocus(null);
    if (h.page === 'search') { setSq(''); setSearchKey((k) => k + 1); }
    if (h.page === 'team') setTeamKey((k) => k + 1);
    if (h.page === 'calendar') setCalKey((k) => k + 1);
    setPage(h.page); setCity(h.city); setCategory(h.category); setSpecials(h.specials); setQuery('');
    // ohne Ladeanimation: die Seite wurde ja gerade „weggewischt“
    listRef.current?.scrollToOffset({ offset: 0, animated: false }); teamRef.current?.scrollTo({ y: 0, animated: false });
    searchRef.current?.scrollTo({ y: 0, animated: false }); calRef.current?.scrollTo({ y: 0, animated: false });
  };
  // Navigation: gleiche Seite nochmal gewählt = sichtbar neu laden
  const go = (p: Page | 'specials') => {
    setMenu(false); setFocus(null);
    pushHist(p === 'home' ? { page: 'home', city: null, category: null, specials: false }
      : p === 'specials' ? { page: 'home', city: null, category, specials: true }
      : { page: p, city, category, specials });
    if (p === 'search') { setSq(''); setSearchKey((k) => k + 1); }
    if (p === 'calendar') { setCalKey((k) => k + 1); const d = new Date(); setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setCalDay(null); }
    if (p === 'specials') {
      setPage('home'); setCity(null); setQuery(''); setSpecials(true); pulse();
      return;
    }
    if (p === 'home') {
      if (page === 'home') { load(); }
      setCity(null); setCategory(null); setSpecials(false); setQuery('');
    }
    if (p === 'team') setTeamKey((k) => k + 1);
    setPage(p); pulse();
  };
  const openHome = (c: string | null, cat: string | null) => {
    pushHist({ page: 'home', city: c, category: cat, specials: false });
    setPage('home'); setCity(c); setCategory(cat); setSpecials(false); setQuery(''); pulse();
  };
  // Treffer der globalen Suche ausführen
  const run = (a: any) => {
    switch (a.type) {
      case 'course': return SPECIAL_IDS.includes(a.course.id) ? go('specials') : openHome(a.course.city, a.course.category);
      case 'city': return openHome(a.city, null);
      case 'member': { pushHist({ page: 'team', city, category, specials }); setFocus(a.name); setTeamKey((k) => k + 1); setPage('team'); pulse(); const m = TEAM.find((x) => x.name === a.name); return m && setTimeout(() => openPerson(m), LOADER_MIN_MS + 500); }
      case 'page': return go(a.page);
      case 'ask': return setAsk(true);
      case 'tel': case 'wa': case 'mail': return contactVia(a.type);
      case 'insta': return Linking.openURL(INSTAGRAM.url);
      case 'reviews': openHome(null, null); return setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), LOADER_MIN_MS + 400);
      case 'locate': setPage('home'); return locate();
    }
  };
  // Teammitglied aus der Suche: hinscrollen und kurz hervorheben
  useEffect(() => {
    if (!focus || page !== 'team') return;
    const t1 = setTimeout(() => teamRef.current?.scrollTo({ y: Math.max(0, (memberY.current[focus] ?? 0) - 90), animated: true }), LOADER_MIN_MS + 150);
    const t2 = setTimeout(() => setFocus(null), 4000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [focus, page, teamKey]);
  // „Social Media“ / „Julian Reiter“: direkt Instagram + E-Mail zeigen
  const julian = TEAM.find((m) => m.name === 'Julian Reiter')!;
  const social = useMemo(() => socialMatch(sq), [sq]);
  const socialCard = social ? (
    <View style={[s.card, s.cardTop]}>
      <Text style={s.badge}>Social Media</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
        <View style={s.socialPic}><Photo uri={TEAM_URL + julian.photo} w={56} maxH={70} round={10} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{julian.name}</Text>
          <Text style={s.muted}>{julian.role}</Text>
        </View>
      </View>
      <Pressable style={s.socialRow} onPress={() => Linking.openURL(INSTAGRAM.url)}>
        {Ionicons ? <Ionicons name="logo-instagram" size={26} color="#E1306C" /> : <Text style={{ fontSize: 20 }}>📷</Text>}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.socialT}>@{INSTAGRAM.user}</Text>
          <Text style={s.muted}>Instagram öffnen</Text>
        </View>
        <Text style={s.slotGo}>›</Text>
      </Pressable>
      <Pressable style={s.socialRow} onPress={() => Linking.openURL(`mailto:${SOCIAL_MAIL}`)}>
        <Icon name="mail" size={26} fallback="✉️" />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.socialT}>{SOCIAL_MAIL}</Text>
          <Text style={s.muted}>E-Mail schreiben</Text>
        </View>
        <Text style={s.slotGo}>›</Text>
      </Pressable>
    </View>
  ) : null;
  const found = useMemo(() => searchAll(sq), [sq]);
  const nextLabel = (c: Course) => (slots[c.id] ?? []).find((x) => x.bookable && x.start.getTime() > Date.now())?.label;
  const searchPage = (
    <ScrollView key={searchKey} ref={searchRef} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={s.hero} onLayout={(e) => setHeroH(e.nativeEvent.layout.height)}>
        {brand('Durchsuche die ganze App')}
        <TextInput
          style={s.search}
          value={sq}
          onChangeText={setSq}
          placeholder="🔍  Kurse, Orte, Team, Kontakt …"
          placeholderTextColor={colors.muted}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          autoFocus
        />
      </View>
      {socialCard}
      {!sq.trim() ? (
        <View>
          <Text style={s.label}>Beliebte Suchen</Text>
          <View style={s.wrap}>
            {['Führerschein', 'Kinder', 'Betrieb', 'Esslingen', 'Ludwigsburg', 'Team', 'Special', 'Instagram', 'Bewertungen', 'Fragen'].map((t) => (
              <Chip key={t} label={t} active={false} onPress={() => setSq(t)} />
            ))}
          </View>
        </View>
      ) : found.length === 0 && !social ? (
        <View>
          <Text style={s.sorry}>Dazu haben wir nichts gefunden.</Text>
          <Text style={s.empty}>Probier ein anderes Wort oder frag uns direkt.</Text>
          <Pressable style={s.ask} onPress={() => setAsk(true)}><Icon name="chatbubbles-outline" color="#fff" fallback="💬" /><Text style={s.askTxt}>Kurs anfragen</Text></Pressable>
        </View>
      ) : (
        ['Kurse', 'Orte', 'Team', 'Mehr'].map((g) => {
          const list = found.filter((x) => x.group === g);
          if (!list.length) return null;
          return (
            <View key={g}>
              <Text style={s.label}>{g === 'Mehr' ? 'Kontakt & mehr' : g}</Text>
              {list.slice(0, 8).map((it) => {
                const nd = it.action.type === 'course' ? nextLabel(it.action.course) : undefined;
                const tm = it.action.type === 'member' ? TEAM.find((m) => m.name === it.action.name) : undefined;
                return (
                  <Pressable key={it.key} style={s.result} onPress={() => run(it.action)}>
                    {tm ? <View style={s.resultPic}><Photo uri={TEAM_URL + tm.photo} w={40} maxH={50} round={8} /></View> : (
                      <View style={s.resultIcon}><Icon name={it.icon} color={it.icon === 'logo-whatsapp' ? '#25D366' : it.icon === 'logo-instagram' ? '#E1306C' : colors.accent} fallback={it.fb} /></View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={s.resultT}>{it.title}</Text>
                      <Text style={s.muted} numberOfLines={1}>{nd ? `${it.sub} · nächster Termin ${nd}` : it.sub}</Text>
                    </View>
                    <Text style={s.slotGo}>›</Text>
                  </Pressable>
                );
              })}
            </View>
          );
        })
      )}
    </ScrollView>
  );
  // ---- Kalender: alle Termine aller Orte/Kursarten, optional gefiltert ----
  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const calByDay = useMemo(() => {
    const map: Record<string, { c: Course; n: Slot }[]> = {};
    const now = Date.now();
    for (const c of COURSES) {
      if (calCities.length && !calCities.includes(c.city)) continue;
      if (calCats.length && !calCats.includes(c.category)) continue;
      for (const n of slots[c.id] ?? []) {
        if (n.start.getTime() <= now) continue;
        const isMine = !!n.url && !!booked[n.url];
        if (!n.bookable && !(calMine && isMine)) continue;
        if (calMine && !isMine) continue;
        if (calFav && !(n.url && marks[n.url])) continue;
        const k = dayKey(n.start); if (!map[k]) map[k] = []; map[k].push({ c, n });
      }
    }
    for (const k of Object.keys(map)) map[k].sort((a, b) => a.n.start.getTime() - b.n.start.getTime());
    return map;
  }, [slots, calCities, calCats, calFav, calMine, booked, marks]);
  // Ohne Auswahl: erster Tag mit Terminen im angezeigten Monat (ab heute)
  const calSel = useMemo(() => {
    if (calDay) return calDay;
    const t = day0(new Date());
    const last = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= last; d++) {
      const x = new Date(calMonth.getFullYear(), calMonth.getMonth(), d);
      if (x >= t && calByDay[dayKey(x)]) return x;
    }
    return calMonth.getMonth() === t.getMonth() && calMonth.getFullYear() === t.getFullYear() ? t : calMonth;
  }, [calDay, calMonth, calByDay]);
  const monthCount = useMemo(() => Object.entries(calByDay).filter(([k]) => k.startsWith(`${calMonth.getFullYear()}-${calMonth.getMonth()}-`)).reduce((n, [, v]) => n + v.length, 0), [calByDay, calMonth]);
  const shiftMonth = (n: number) => { setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1)); setCalDay(null); };
  const filterCount = calCities.length + calCats.length + (calFav ? 1 : 0) + (calMine ? 1 : 0);
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const CELL = Math.floor((SW - 32) / 7);
  const calendar = (() => {
    const first = calMonth;
    const lead = (first.getDay() + 6) % 7; // Montag zuerst
    const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1))];
    while (cells.length % 7) cells.push(null);
    const today = day0(new Date());
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const sel = calByDay[dayKey(calSel)] ?? [];
    const myMarks = Object.values(marks).filter((m) => m.start > Date.now()).sort((a, b) => a.start - b.start);
    const bookedAll = Object.values(booked).sort((a, b) => a.start - b.start);
    const bookedList = bookedAll.filter((b) => b.start + 86400000 > Date.now());
    const bookedDays = new Set(bookedAll.map((b) => dayKey(new Date(b.start))));
    const marksByDay: Record<string, string[]> = {};
    for (const m of myMarks) { const k = dayKey(new Date(m.start)); (marksByDay[k] = marksByDay[k] ?? []).push(m.color); }
    return (
      <ScrollView key={calKey} ref={calRef} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={s.hero} onLayout={(e) => setHeroH(e.nativeEvent.layout.height)}>{brand('Alle Termine im Kalender')}</View>
        <View style={s.calTop}>
          <Pressable style={[s.calFilterBtn, filterCount > 0 && s.calFilterOn]} onPress={() => { setDraftCities(calCities); setDraftCats(calCats); setDraftFav(calFav); setDraftMine(calMine); setCalFilter(true); }}>
            <Icon name="options-outline" color={filterCount ? '#fff' : colors.accent} fallback="⚙︎" />
            <Text style={[s.calFilterTxt, filterCount > 0 && { color: '#fff' }]}>{filterCount ? `Filter (${filterCount})` : 'Filter'}</Text>
          </Pressable>
          {filterCount > 0 && (
            <Pressable onPress={() => { setCalCities([]); setCalCats([]); setCalFav(false); setCalMine(false); setCalDay(null); }} hitSlop={8}><Text style={s.moreTxt}>Zurücksetzen</Text></Pressable>
          )}
        </View>
        {filterCount > 0 && <Text style={s.calActive} numberOfLines={2}>{[...(calMine ? ['✓ Meine Kurse'] : []), ...(calFav ? ['★ Favoriten'] : []), ...calCities, ...calCats].join(' · ')}</Text>}
        <View style={s.calCard}>
          <View style={s.calHead}>
            <Pressable disabled={calMonth <= thisMonth} onPress={() => shiftMonth(-1)} hitSlop={12}><Text style={[s.calArrow, calMonth <= thisMonth && { color: colors.border }]}>‹</Text></Pressable>
            <View style={{ alignItems: 'center' }}>
              <Text style={s.calMonth}>{MN[calMonth.getMonth()]} {calMonth.getFullYear()}</Text>
              <Text style={s.muted}>{busy && hint ? 'Termine werden geladen …' : `${monthCount} freie Termine`}</Text>
            </View>
            <Pressable onPress={() => shiftMonth(1)} hitSlop={12}><Text style={s.calArrow}>›</Text></Pressable>
          </View>
          <View style={s.calRow}>{['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => <Text key={w} style={[s.calWd, { width: CELL }]}>{w}</Text>)}</View>
          <View style={s.calGrid}>
            {cells.map((d, i) => {
              if (!d) return <View key={'x' + i} style={{ width: CELL, height: CELL }} />;
              const list = calByDay[dayKey(d)];
              const isSel = dayKey(d) === dayKey(calSel);
              const isToday = dayKey(d) === dayKey(today);
              const past = d < today;
              const mcol = marksByDay[dayKey(d)]?.[0] ?? null;      // markierter Tag: ganze Fläche in der gewählten Farbe
              const mtxt = mcol ? onColor(mcol) : '';
              const bk = bookedDays.has(dayKey(d));
              return (
                <Pressable key={i} style={{ width: CELL, height: CELL, alignItems: 'center', justifyContent: 'center' }} onPress={() => setCalDay(d)}>
                  <View style={[s.calDay, { width: CELL - 6, height: CELL - 6 }, list && s.calHas, !!mcol && { backgroundColor: mcol }, isToday && s.calToday, bk && { borderWidth: 3, borderColor: BOOK_GREEN }, isSel && !mcol && s.calSel, isSel && !!mcol && { borderWidth: 3, borderColor: colors.text }]}>
                    <Text style={[s.calNum, past && { color: colors.faint }, list && { color: colors.primaryDark, fontWeight: '800' }, !!mcol && { color: mtxt, fontWeight: '800' }, isSel && !mcol && { color: '#fff' }]}>{d.getDate()}</Text>
                    {list && <Text style={[s.calCount, isSel && !mcol && { color: colors.soft }, !!mcol && { color: mtxt }]}>{list.length}</Text>}
                    {bk && <View style={s.bkBadge}><Text style={s.bkBadgeTxt}>✓</Text></View>}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
        {bookedList.length > 0 && (
          <View>
            <Text style={s.label}>✓ Meine Anmeldungen ({bookedList.length})</Text>
            <View style={[s.card, { marginTop: 8, borderColor: BOOK_GREEN }]}>
              {bookedList.map((b, i) => (
                <View key={b.url} style={[s.slot, { flexDirection: 'column', alignItems: 'stretch' }, i === 0 && { borderTopWidth: 0, paddingTop: 0 }]}>
                  <Pressable onPress={() => { const d = new Date(b.start); setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setCalDay(day0(d)); }}>
                    <Text style={s.bkTag}>✓ Angemeldet</Text>
                    <Text style={s.slotDate}>{b.label}</Text>
                    <Text style={s.dCourse}>{b.title} · {b.city}</Text>
                    <Text style={s.muted}>{b.time}</Text>
                    <PersonLines b={b} small onEdit={() => openParts(b)} />
                  </Pressable>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <Pressable style={[s.dBtn, { flex: 1 }]} onPress={() => { if (b.eventId) Alert.alert('Im Handy-Kalender', `Gespeichert in „${b.calName ?? 'Kalender'}“.`); else setCalAsk(b.url); }}>
                      <Text style={s.moreTxt}>{b.eventId ? '✓ Im Handy-Kalender' : '📅 In Handy-Kalender'}</Text>
                    </Pressable>
                    <Pressable style={[s.dBtn, { flex: 1 }]} onPress={() => openAskFor(b)}><Text style={s.moreTxt}>Stornieren / verschieben</Text></Pressable>
                  </View>
                  <Pressable onPress={() => openDel(b)} hitSlop={6} style={{ marginTop: 8, alignItems: 'center' }}><Text style={s.bookLinkDark}>Bei MSG schon storniert? Aus der App löschen ›</Text></Pressable>
                </View>
              ))}
              <Text style={[s.muted, { marginTop: 10 }]}>{CANCEL_INFO}</Text>
            </View>
          </View>
        )}
        {myMarks.length > 0 && (
          <View>
            <Text style={s.label}>★ Gemerkte Termine ({myMarks.length})</Text>
            <View style={[s.card, { marginTop: 8 }]}>
              {myMarks.map((m, i) => (
                <View key={m.url} style={i === 0 ? { marginTop: -10 } : undefined}>
                  <Pressable style={[s.slot, { borderLeftWidth: 4, borderLeftColor: m.color, paddingLeft: 8 }]} onPress={() => { const d = new Date(m.start); setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setCalDay(day0(d)); }}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.slotDate}>{m.label}</Text>
                      <Text style={s.dCourse}>{m.title} · {m.city}</Text>
                      <Text style={s.muted}>{m.time}</Text>
                    </View>
                    <Pressable onPress={() => setPalFor((p) => (p === m.url ? null : m.url))} hitSlop={8} style={[s.colorDot, { backgroundColor: m.color }]} /><Pressable onPress={() => unmark(m.url)} hitSlop={10} style={s.star}><Text style={[s.starTxt, { color: m.color }]}>★</Text></Pressable>
                    <Pressable onPress={() => openReg(m.url, m.title, { title: m.title, city: m.city, label: m.label, time: m.time, start: m.start })} hitSlop={6}><Text style={s.slotGo}>Anmelden ›</Text></Pressable>
                  </Pressable>
                  {palFor === m.url && <Palette value={m.color} onPick={(c) => setMarkColor(m.url, c)} onRemove={() => unmark(m.url)} />}
                </View>
              ))}
            </View>
          </View>
        )}
        <Text style={s.label}>{fmtDay(calSel)}</Text>
        {sel.length ? (
          <View style={[s.card, { marginTop: 8 }]}>
            {sel.map((x, i) => (
              <View key={x.n.url ?? x.c.id + i} style={i === 0 ? { marginTop: -10 } : undefined}>
                <DateRow c={x.c} n={x.n} tag={x.c.category} onRegister={openReg} mark={x.n.url ? marks[x.n.url]?.color ?? null : null} onMark={() => tapMark(x.c, x.n)} onColor={() => { const u = x.n.url; if (u) setPalFor((p) => (p === u ? null : u)); }} />
                {!!x.n.url && palFor === x.n.url && !!marks[x.n.url] && <Palette value={marks[x.n.url].color} onPick={(c) => setMarkColor(x.n.url!, c)} onRemove={() => unmark(x.n.url!)} />}
              </View>
            ))}
          </View>
        ) : (
          <View style={[s.card, { marginTop: 8 }]}>
            <Text style={s.muted}>{busy ? 'Termine werden noch geladen …' : 'An diesem Tag ist kein Termin frei.'}</Text>
            {(() => {
              const keys = Object.keys(calByDay).map((k) => calByDay[k][0].n.start).filter((d) => d > endOf(calSel)).sort((a, b) => a.getTime() - b.getTime());
              const nx = keys[0];
              return nx ? (
                <Pressable style={s.moreBtn} onPress={() => { setCalMonth(new Date(nx.getFullYear(), nx.getMonth(), 1)); setCalDay(day0(nx)); }}>
                  <Text style={s.moreTxt}>Zum nächsten freien Tag: {fmtShort(nx)}</Text>
                </Pressable>
              ) : null;
            })()}
          </View>
        )}
        <Pressable style={s.ask} onPress={() => setAsk(true)}><Icon name="chatbubbles-outline" color="#fff" fallback="💬" /><Text style={s.askTxt}>Kurs anfragen</Text></Pressable>
      </ScrollView>
    );
  })();
  const contactVia = (how: 'tel' | 'wa' | 'mail') => {
    setAsk(false);
    const sig = profile.name ? `\n\nViele Grüße\n${profile.name}${profile.kind ? ` (${KIND_LABEL[profile.kind]})` : ''}` : '';
    const text = encodeURIComponent((askBk
      ? `Hallo MSG-Team, ich habe mich für den Kurs „${askBk.title}“ am ${askBk.label} (${askBk.time}) in ${askBk.city} angemeldet und möchte den Termin stornieren bzw. verschieben.`
      : 'Hallo MSG-Team, ich möchte einen Erste-Hilfe-Kurs anfragen.') + sig);
    if (how === 'tel') Linking.openURL(contact.phoneUrl);
    if (how === 'wa') Linking.openURL(`${contact.whatsappUrl}?text=${text}`);
    if (how === 'mail') Linking.openURL(`mailto:${contact.email}?subject=${encodeURIComponent(askBk ? 'Termin stornieren / verschieben' : 'Kursanfrage')}&body=${text}`);
  };
  useEffect(() => { if (!ask) setAskBk(null); }, [ask]);
  // Nach dem Schließen der Anmeldeseite: anbieten, den Termin im Handy-Kalender zu speichern
  useEffect(() => {
    if (!reg && pendingCal) { const u = pendingCal; setPendingCal(null); setTimeout(() => setCalAsk(u), 500); }
  }, [reg, pendingCal]);
  useEffect(() => { if (calAsk) loadDeviceCals(); }, [calAsk]);
  // Seite neu laden (je nach Seite)
  const reloadPage = () => {
    refreshRemote();
    if (page === 'home') { setShown(3); load(); }
    else if (page === 'team') setTeamKey((k) => k + 1);
    else if (page === 'search') { setSq(''); setSearchKey((k) => k + 1); }
    else if (page === 'calendar') setCalKey((k) => k + 1);
    pulse();
  };
  // Einen Schritt zurück: zuerst offene Fenster schließen, dann die Seitenhistorie
  const goBack = (): boolean => {
    if (menu) { setMenu(false); return true; }
    if (ask) { setAsk(false); return true; }
    if (webAsk) { setWebAsk(null); return true; }
    if (delUrl) { if (delStep > 0) setDelStep(delStep - 1); else setDelUrl(null); return true; }
    if (partWarn && partUrl) { setPartWarn(false); return true; }
    if (partUrl) { setPartUrl(null); return true; }
    if (calFilter) { setCalFilter(false); return true; }
    if (reg) { setReg(null); return true; }
    if (person) { setPerson(null); return true; }
    const h = hist.current.pop();
    if (h) { restore(h); return true; }
    if (page !== 'home' || city || category || specials) { restore({ page: 'home', city: null, category: null, specials: false }); return true; }
    return false;
  };
  // Geste auf einer Hauptseite: je nach Einstellung
  const onEdge = () => {
    if (cfg.action === 'menu') setMenu(true);
    else if (cfg.action === 'reload') reloadPage();
    else goBack();
  };
  const backRef = useRef<() => boolean>(() => false);
  backRef.current = goBack;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => backRef.current());
    return () => sub.remove();
  }, []);
  // Seite folgt dem Finger und gleitet beim „Zurück“ sauber weg
  const px = useRef(new Animated.Value(0)).current;
  const op = useRef(new Animated.Value(1)).current;
  const canBack = hist.current.length > 0 || page !== 'home' || !!city || !!category || specials;
  const edgeMove = (d: number, sd: 'left' | 'right') => { if (cfg.action === 'back' && canBack) px.setValue((sd === 'left' ? 1 : -1) * Math.min(d, SW)); };
  const edgeCancel = () => { Animated.spring(px, { toValue: 0, bounciness: 0, speed: 20, useNativeDriver: true }).start(); };
  const edgeCommit = (sd: 'left' | 'right' = 'left') => {
    if (cfg.action === 'back') {
      if (!canBack) return edgeCancel();
      Animated.timing(px, { toValue: (sd === 'left' ? 1 : -1) * SW, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
        op.setValue(0); px.setValue(0); goBack();
        Animated.timing(op, { toValue: 1, duration: 240, useNativeDriver: true }).start();
      });
    } else { edgeCancel(); onEdge(); }
  };
  const overlay = menu || ask || calFilter || !!reg || !!person || !!partUrl || !!delUrl || !!webAsk || showOnb;
  const historyPage = (() => {
    const now = Date.now();
    const past = Object.values(booked).filter((b) => b.start + 86400000 <= now).map((b) => ({ b, st: 'done' as const, ts: b.start, key: b.url }));
    const canc = cancelled.map((c) => ({ b: c as Booking, st: 'canc' as const, ts: c.start, key: c.key, c }));
    const all = [...past, ...canc].sort((a, z) => z.ts - a.ts);
    return (
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={s.hero} onLayout={(e) => setHeroH(e.nativeEvent.layout.height)}>{brand('Deine Kurshistorie')}</View>
        {all.length === 0 && <Text style={[s.muted, { margin: 20 }]}>Hier erscheinen deine vergangenen Kurse und Termine, die du über MSG storniert und in der App gelöscht hast.</Text>}
        {all.map((x: any) => (
          <View key={x.key} style={[s.card, { marginTop: 12 }]}>
            <View style={[s.histBadge, { backgroundColor: x.st === 'done' ? BOOK_GREEN : '#8A8A8E' }]}>
              <Text style={s.histBadgeTxt}>{x.st === 'done' ? '✓ Hat stattgefunden' : `✕ ${x.c.whole ? 'Storniert' : 'Teilnehmer storniert'} am ${new Date(x.c.cancelledAt).toLocaleDateString('de-DE')}`}</Text>
            </View>
            <Text style={s.slotDate}>{x.b.label}</Text>
            <Text style={s.dCourse}>{x.b.title} · {x.b.city}</Text>
            <Text style={s.muted}>{x.b.time}</Text>
            <PersonLines b={x.b} small />
          </View>
        ))}
        {all.length > 0 && <Text style={[s.muted, { marginHorizontal: 20, marginTop: 14 }]}>„Hat stattgefunden“ heißt: Der Termin ist vorbei und wurde nicht storniert. Ob du wirklich dabei warst, weiß die App nicht.</Text>}
      </ScrollView>
    );
  })();
  const settingsPage = (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={s.hero} onLayout={(e) => setHeroH(e.nativeEvent.layout.height)}>{brand('Einstellungen')}</View>
      <Text style={s.setH}>Dein Profil</Text>
      <Text style={s.setSub}>Benutzername: {profile.user || '–'}. Vor- und Nachname stehen unter Terminbestätigungen, die du aus der App an Teilnehmer schickst.</Text>
      <View style={{ marginHorizontal: 16 }}>
        <TextInput style={s.search} value={profile.first} onChangeText={(t) => setProfile((p) => ({ ...p, first: t, name: dispName({ ...p, first: t }) }))} placeholder="Vorname (optional)" placeholderTextColor={colors.muted} autoCorrect={false} />
        <TextInput style={s.search} value={profile.last} onChangeText={(t) => setProfile((p) => ({ ...p, last: t, name: dispName({ ...p, last: t }) }))} placeholder="Nachname (optional)" placeholderTextColor={colors.muted} autoCorrect={false} />
      </View>
      <View style={s.seg}>
        {([['privat', 'Privat'], ['geschaeftlich', 'Geschäftlich']] as const).map(([k, t]) => (
          <Pressable key={k} style={[s.segBtn, profile.kind === k && s.segOn]} onPress={() => setProfile((p) => ({ ...p, kind: p.kind === k ? '' : k, done: true }))}>
            <Text style={[s.segTxt, profile.kind === k && s.segTxtOn]}>{t}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={s.setH}>Wisch-Geste</Text>
      <Text style={s.setSub}>Vom Bildschirmrand nach innen wischen. Im Menü und in Unterseiten (Profil, Anmeldung, Filter) geht die Geste immer einen Schritt zurück.</Text>
      <View style={s.setCard}>
        {([
          ['back', 'Einen Schritt zurück', 'wie beim iPhone'],
          ['menu', 'Menü anzeigen', 'öffnet das 3-Striche-Menü'],
          ['reload', 'Seite neu laden', 'lädt die aktuelle Seite neu'],
        ] as const).map(([k, t, sub]) => (
          <Pressable key={k} style={s.opt} onPress={() => setC({ action: k })}>
            <View style={[s.radio, cfg.action === k && s.radioOn]}>{cfg.action === k && <View style={s.radioDot} />}</View>
            <View style={{ flex: 1 }}><Text style={s.optT}>{t}</Text><Text style={s.muted}>{sub}</Text></View>
          </Pressable>
        ))}
      </View>
      <Text style={s.setH}>Wisch-Seite</Text>
      <View style={s.seg}>
        {([['left', 'Von links'], ['right', 'Von rechts'], ['both', 'Beide']] as const).map(([k, t]) => (
          <Pressable key={k} style={[s.segBtn, cfg.side === k && s.segOn]} onPress={() => setC({ side: k })}>
            <Text style={[s.segTxt, cfg.side === k && s.segTxtOn]}>{t}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={s.setH}>Darstellung</Text>
      <View style={s.seg}>
        {([['light', 'Hell', 'sunny-outline', '☀️'], ['dark', 'Dunkel', 'moon-outline', '🌙']] as const).map(([k, t, ic, fb]) => (
          <Pressable key={k} style={[s.segBtn, cfg.mode === k && s.segOn, { flexDirection: 'row', justifyContent: 'center' }]} onPress={() => setC({ mode: k })}>
            <Icon name={ic} size={20} color={cfg.mode === k ? '#fff' : colors.accent} fallback={fb} />
            <Text style={[s.segTxt, cfg.mode === k && s.segTxtOn, { marginLeft: 8 }]}>{t}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={s.setH}>App-Farbe</Text>
      <View style={s.swatchRow}>
        {(Object.keys(ACCENTS) as AccentKey[]).map((k) => (
          <Pressable key={k} style={s.swatchWrap} onPress={() => setC({ accent: k })}>
            <View style={[s.swatch, { backgroundColor: ACCENTS[k].main }, cfg.accent === k && { borderColor: colors.text }]}>
              {cfg.accent === k && <Text style={s.swatchCheck}>✓</Text>}
            </View>
            <Text style={[s.swatchTxt, cfg.accent === k && { color: colors.text, fontWeight: '800' }]}>{ACCENTS[k].label}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
  return (
    <View style={s.root}>
      <RNStatusBar barStyle="light-content" />
      <Animated.View style={{ flex: 1, transform: [{ translateX: px }], opacity: op }}>
      {page === 'team' ? team : page === 'search' ? searchPage : page === 'calendar' ? calendar : page === 'settings' ? settingsPage : page === 'history' ? historyPage : (
      <FlatList
        ref={listRef}
        extraData={cfg.mode + cfg.accent}
        data={dq ? [] : results.slice(0, shown)}
        keyExtractor={(r) => r.course.id}
        initialNumToRender={12}
        windowSize={11}
        removeClippedSubviews={false}
        renderItem={({ item, index }) => <Card r={item} top={index === 0} badge={specials ? 'Nächster Special-Kurs' : undefined} onRegister={openReg} />}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ListEmptyComponent={dq ? null : empty}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor="transparent" colors={['transparent']} />}
        contentContainerStyle={{ paddingBottom: 40 }}
      />
      )}
      </Animated.View>
      <Drawer open={menu} onClose={() => setMenu(false)} side={cfg.side}>
        <View style={s.drawerHead}>
          <Image source={{ uri: LOGO }} style={s.drawerLogo} />
          <Text style={s.drawerTitle}>Menü</Text>
        </View>
        {([
          ['home', 'Home', 'home-outline', '🏠'],
          ['search', 'Suche', 'search-outline', '🔍'],
          ['calendar', 'Kalender', 'calendar-outline', '📅'],
          ['mine', 'Meine Kurse', 'checkmark-circle-outline', '✓'],
          ['history', 'Kurshistorie', 'time-outline', '🕘'],
          ['team', 'Team', 'people-outline', '👥'],
          ['specials', 'Special-Kurse', 'star-outline', '★'],
          ['settings', 'Einstellungen', 'settings-outline', '⚙️'],
        ] as const).map(([k, label, icon, fb]) => {
          const on = k === 'specials' ? page === 'home' && specials : k === 'mine' ? page === 'calendar' && calMine : k === 'calendar' ? page === 'calendar' && !calMine : page === k && !(k === 'home' && specials);
          return (
            <Pressable key={k} style={[s.menuItem, on && s.menuItemOn]} onPress={() => {
              if (k === 'mine') {
                go('calendar'); setCalMine(true); setCalCities([]); setCalCats([]); setCalFav(false);
                const f = Object.values(booked).filter((b) => b.start + 86400000 > Date.now()).sort((a, b) => a.start - b.start)[0];
                if (f) { const d = new Date(f.start); setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setCalDay(day0(d)); }
              } else { if (k === 'calendar') setCalMine(false); go(k); }
            }}>
              <Icon name={icon} color={on ? colors.accent : colors.text} fallback={fb} />
              <Text style={[s.menuTxt, on && s.menuTxtOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </Drawer>
      <Modal visible={ask} transparent animationType="fade" onRequestClose={() => setAsk(false)}>
        <View style={{ flex: 1 }}>
        <Pressable style={s.sheetBg} onPress={() => setAsk(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={s.sheetH}>{askBk ? 'Termin stornieren / verschieben' : 'Kurs anfragen'}</Text>
            <Text style={[s.muted, { marginBottom: 12 }]}>{askBk ? CANCEL_INFO : 'Wie möchtest du uns erreichen?'}</Text>
            <Pressable style={s.sheetBtn} onPress={() => contactVia('tel')}>
              <Icon name="call" color={colors.accent} fallback="📞" /><Text style={s.sheetTxt}>Anrufen · {contact.phone}</Text>
            </Pressable>
            <Pressable style={s.sheetBtn} onPress={() => contactVia('wa')}>
              <Icon name="logo-whatsapp" color="#25D366" fallback="💬" /><Text style={s.sheetTxt}>WhatsApp</Text>
            </Pressable>
            <Pressable style={s.sheetBtn} onPress={() => contactVia('mail')}>
              <Icon name="mail" color={colors.accent} fallback="✉️" /><Text style={s.sheetTxt}>E-Mail · {contact.email}</Text>
            </Pressable>
            {!!askBk && (
              <Pressable style={s.sheetBtn} onPress={() => { const b = askBk; setAsk(false); setTimeout(() => openDel(b), 250); }}>
                <Icon name="key-outline" color={colors.accent} fallback="🔑" /><Text style={s.sheetTxt}>Ich habe den Code – Termin löschen</Text>
              </Pressable>
            )}
            <Pressable style={s.sheetCancel} onPress={() => setAsk(false)}><Text style={s.moreTxt}>Abbrechen</Text></Pressable>
          </Pressable>
        </Pressable>
        <Edges side={cfg.side} onTrigger={goBack} />
        </View>
      </Modal>
      <Modal visible={calFilter} transparent animationType="fade" onRequestClose={() => setCalFilter(false)}>
        <View style={{ flex: 1 }}>
        <Pressable style={s.sheetBg} onPress={() => setCalFilter(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={s.sheetH}>Filter</Text>
            <Text style={[s.muted, { marginBottom: 6 }]}>Wähle Orte, Kursarten oder beides – mehrere möglich.</Text>
            <Text style={s.fLabel}>Meine Kurse</Text>
            <View style={s.fWrap}><Chip label="✓ Nur meine Kurse (angemeldet)" active={draftMine} onPress={() => setDraftMine((v) => !v)} /></View>
            <Text style={s.fLabel}>Favoriten</Text>
            <View style={s.fWrap}><Chip label="★ Nur meine Favoriten (mit Stern)" active={draftFav} onPress={() => setDraftFav((v) => !v)} /></View>
            <Text style={s.fLabel}>Ort</Text>
            <View style={s.fWrap}>{Object.keys(CITIES).map((n) => <Chip key={n} label={n} active={draftCities.includes(n)} onPress={() => setDraftCities((l) => toggle(l, n))} />)}</View>
            <Text style={s.fLabel}>Kursart</Text>
            <View style={s.fWrap}>{CATEGORIES.map((n) => <Chip key={n} label={n} active={draftCats.includes(n)} onPress={() => setDraftCats((l) => toggle(l, n))} />)}</View>
            <View style={[s.dNav, { marginTop: 16 }]}>
              <Pressable style={s.dBtn} onPress={() => { setDraftCities([]); setDraftCats([]); setDraftFav(false); setDraftMine(false); }}><Text style={s.moreTxt}>Alles zurücksetzen</Text></Pressable>
              <Pressable style={[s.dBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => { setCalCities(draftCities); setCalCats(draftCats); setCalFav(draftFav); setCalMine(draftMine); setCalDay(null); setCalFilter(false); pulse(); }}>
                <Text style={[s.moreTxt, { color: '#fff' }]}>Anzeigen</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
        <Edges side={cfg.side} onTrigger={goBack} />
        </View>
      </Modal>
      <Modal visible={!!person} animationType="slide" onRequestClose={() => setPerson(null)}>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={s.regBar}>
          <Pressable onPress={() => setPerson(null)} hitSlop={12}><Text style={s.regBack}>‹ Team</Text></Pressable>
          <Text style={s.regTitle} numberOfLines={1}>{person?.name}</Text>
          <Image source={{ uri: LOGO }} style={s.regLogo} />
        </View>
        {person && (() => {
          const bio = bios[person.name];
          return (
            <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 20, paddingBottom: 48, alignItems: 'center' }}>
              <Photo uri={TEAM_URL + person.photo} w={Math.min(SW - 80, 300)} maxH={360} round={20} />
              <Text style={s.pName}>{person.name}</Text>
              <Text style={s.pRole}>{person.role}</Text>
              <View style={s.pCard}>
                {bio === 'loading' || bio === undefined ? (
                  <View style={{ alignItems: 'center', paddingVertical: 20 }}><ActivityIndicator color={colors.accent} /></View>
                ) : bio === 'error' ? (
                  <View>
                    <Text style={s.pTxt}>{person.info}</Text>
                    <Text style={[s.muted, { marginTop: 10 }]}>Der ausführliche Text konnte gerade nicht geladen werden.</Text>
                    <Pressable style={s.moreBtn} onPress={() => openPerson(person)}><Text style={s.moreTxt}>Erneut versuchen</Text></Pressable>
                  </View>
                ) : (
                  bio.lines.map((l, i) => (
                    <Text key={i} style={l.head ? s.pHead : l.bullet ? s.pBullet : s.pTxt}>{l.bullet ? `•  ${l.text}` : l.text}</Text>
                  ))
                )}
              </View>
              <Pressable style={[s.ask, { alignSelf: 'stretch', marginHorizontal: 0 }]} onPress={() => { setPerson(null); setAsk(true); }}>
                <Icon name="chatbubbles-outline" color="#fff" fallback="💬" /><Text style={s.askTxt}>Kurs anfragen</Text>
              </Pressable>
            </ScrollView>
          );
        })()}
        <Edges side={cfg.side} onTrigger={goBack} />
        </View>
      </Modal>
      <Modal visible={!!reg} animationType="slide" onRequestClose={() => setReg(null)}>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={s.regBar}>
          <Pressable onPress={() => setReg(null)} hitSlop={12}><Text style={s.regBack}>‹ Zurück</Text></Pressable>
          <Text style={s.regTitle} numberOfLines={1}>{reg?.title}</Text>
        </View>
        <View style={s.regTools}>
          {!!reg?.info && (
            <Pressable style={[s.regBtn, !!reg && !!booked[reg.url] && s.regBtnOn]} onPress={() => {
              if (reg && booked[reg.url]) Alert.alert('✓ Angemeldet', 'Solange diese Seite geöffnet ist, kannst du hier noch Daten bearbeiten. Danach geht Ändern, Verschieben oder Stornieren nur noch per Telefon, WhatsApp oder E-Mail.');
              else Alert.alert('Noch nicht angemeldet', 'Bitte fülle zuerst alle Pflichtfelder (*) aus und tippe dann auf „Zahlungspflichtig anmelden“. Danach trägt die App den Termin automatisch in deinen Kalender ein.');
            }}>
              <Text style={s.regBtnTxt}>{reg && booked[reg.url] ? '✓ Angemeldet' : 'Angemeldet?'}</Text>
            </Pressable>
          )}
          <Pressable style={s.regBtn} onPress={openExternal}><Text style={s.regBtnTxt}>Im Browser öffnen</Text></Pressable>
        </View>
        {regToast && (
          <Pressable style={s.toast} onPress={openExternal}>
            <Text style={s.toastTxt}>✓ Angemeldet! Der Termin ist jetzt im Kalender der App eingetragen. Wenn du diese Seite schließt, kannst du ihn auch im Handy-Kalender speichern.{'\n'}Daten bearbeiten geht nicht? Hier tippen: Seite im Browser öffnen.</Text>
          </Pressable>
        )}
        {reg && WebView && (
          <WebView
            source={{ uri: reg.url }}
            style={{ flex: 1 }}
            startInLoadingState
            renderLoading={() => <View style={s.webLoad}><ActivityIndicator color={colors.accent} size="large" /><Text style={[s.muted, { marginTop: 10 }]}>Anmeldeseite wird geladen …</Text></View>}
            javaScriptEnabled
            injectedJavaScript={REG_JS}
            onMessage={(e: any) => onRegMsg(e.nativeEvent.data)}
            onNavigationStateChange={(nv: any) => { if (nv?.url) curUrl.current = nv.url; }}
            applicationNameForUserAgent="Version/17.4 Mobile/15E148 Safari/604.1"
            injectedJavaScriptBeforeContentLoaded={'window.open=function(u){if(u){location.href=u;}return null;};true;'}
            javaScriptCanOpenWindowsAutomatically
            thirdPartyCookiesEnabled
            allowsLinkPreview={false}
            allowsInlineMediaPlayback
            cacheEnabled
            domStorageEnabled
            sharedCookiesEnabled
            originWhitelist={['*']}
            setSupportMultipleWindows={false}
            onShouldStartLoadWithRequest={(r: any) => { if (/^(tel|mailto|whatsapp):/i.test(r.url)) { Linking.openURL(r.url); return false; } return true; }}
          />
        )}
        <Edges side={cfg.side} onTrigger={goBack} />
        </View>
      </Modal>
      <Modal visible={!!partUrl} transparent animationType="fade" onRequestClose={() => setPartUrl(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={s.sheetBg} onPress={() => setPartUrl(null)}>
            <Pressable style={[s.sheet, { maxHeight: '90%' }]} onPress={() => {}}>
              <Text style={s.sheetH}>Teilnehmer</Text>
              {!!partUrl && !!booked[partUrl] && <Text style={[s.muted, { marginBottom: 8 }]}>{booked[partUrl].label} · {booked[partUrl].title} · {booked[partUrl].city}</Text>}
              <View style={s.warnBox}><Text style={s.warnTxt}>⚠︎ Nur in der App gespeichert. Änderungen hier werden NICHT an MSG übermittelt und sind nicht verbindlich. Verbindlich ist nur, was du auf der Anmeldeseite von MSG eingetragen hast.</Text></View>
              <ScrollView keyboardShouldPersistTaps="handled" style={{ marginTop: 8 }}>
                {partDraft.map((p, i) => (
                  <View key={i} style={s.pBox}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={s.fLabel}>Teilnehmer {i + 1}</Text>
                      {partDraft.length > 1 && <Pressable onPress={() => setPartDraft((l) => l.filter((_, k) => k !== i))} hitSlop={8}><Text style={s.moreTxt}>Entfernen</Text></Pressable>}
                    </View>
                    <TextInput style={s.search} value={p.name} onChangeText={(t) => setPerson1(i, { name: t })} placeholder="Name" placeholderTextColor={colors.muted} autoCorrect={false} />
                    <TextInput style={s.search} value={p.email ?? ''} onChangeText={(t) => setPerson1(i, { email: t })} placeholder="E-Mail" placeholderTextColor={colors.muted} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
                    <TextInput style={s.search} value={p.phone ?? ''} onChangeText={(t) => setPerson1(i, { phone: t })} placeholder="Telefon (optional)" placeholderTextColor={colors.muted} keyboardType="phone-pad" />
                    {!!p.email?.includes('@') && (
                      <Pressable style={s.dBtn} onPress={() => sendConfirm(p, 'mail')}><Text style={s.moreTxt}>✉️ Termin an {p.name.trim().split(' ')[0] || p.email} senden</Text></Pressable>
                    )}
                    {!!p.phone && !p.email?.includes('@') && (
                      <Pressable style={s.dBtn} onPress={() => sendConfirm(p, 'wa')}><Text style={s.moreTxt}>💬 Termin an {p.name.trim().split(' ')[0] || p.phone} senden</Text></Pressable>
                    )}
                  </View>
                ))}
                {!!partUrl && !!booked[partUrl] && partDraft.length < maxPersons(booked[partUrl]) && <Pressable style={[s.dBtn, { marginTop: 10, flex: 0 }]} onPress={() => setPartDraft((l) => [...l, { name: '' }])}><Text style={s.moreTxt}>+ Teilnehmer hinzufügen</Text></Pressable>}
                {!!partUrl && !!booked[partUrl] && <Text style={[s.muted, { marginTop: 10 }]}>Maximal {maxPersons(booked[partUrl])} Teilnehmer – so viele sind bei MSG angemeldet. Mehr kannst du hier nicht eintragen.</Text>}
                <Text style={[s.muted, { marginTop: 10 }]}>Beim Senden öffnet sich deine Mail-App (bzw. WhatsApp/SMS). Die Bestätigung kommt von dir{profile.name ? ` (${profile.name})` : ''}. MSG kann zusätzlich eine eigene Bestätigung schicken – das ist normal.</Text>
              </ScrollView>
              <View style={[s.dNav, { marginTop: 12 }]}>
                <Pressable style={s.dBtn} onPress={() => setPartUrl(null)}><Text style={s.moreTxt}>Abbrechen</Text></Pressable>
                <Pressable style={[s.dBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={saveParts}><Text style={[s.moreTxt, { color: '#fff' }]}>In der App speichern</Text></Pressable>
              </View>
            </Pressable>
          </Pressable>
          {partWarn && (
            <HintCard title="Hinweis" onClose={() => setPartWarn(false)}>
              <Text style={s.hintTxt}>{PART_HINT}</Text>
            </HintCard>
          )}
          <Edges side={cfg.side} onTrigger={goBack} />
        </KeyboardAvoidingView>
      </Modal>
      <Modal visible={!!delUrl} transparent animationType="fade" onRequestClose={() => setDelUrl(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={s.sheetBg} onPress={() => setDelUrl(null)}>
            <Pressable style={s.sheet} onPress={() => {}}>
              <Text style={s.sheetH}>{delStep === 0 ? 'Termin aus der App löschen' : delStep === 1 ? 'Für wen löschen?' : 'Teilnehmer informieren?'}</Text>
              {!!delBooking && <Text style={[s.muted, { marginTop: 4 }]}>{delBooking.label} · {delBooking.title} · {delBooking.city}</Text>}
              {delStep === 0 && (
                <View>
                  <Text style={[s.muted, { marginVertical: 10 }]}>Das geht erst, nachdem MSG den Termin per Telefon, WhatsApp oder E-Mail storniert hat. Gib dann den 5-stelligen Bestätigungscode ein, den du von MSG bekommst.</Text>
                  <TextInput style={[s.search, { fontSize: 24, textAlign: 'center' }]} value={delCode} onChangeText={(t) => { setDelCode(t.replace(/[^0-9]/g, '').slice(0, 5)); setDelErr(''); }} placeholder="5-stelliger Code" placeholderTextColor={colors.muted} keyboardType="number-pad" maxLength={5} autoFocus />
                </View>
              )}
              {delStep === 1 && (
                <View>
                  <Text style={[s.muted, { marginVertical: 10 }]}>Soll der ganze Termin gelöscht werden oder nur für einzelne Teilnehmer?</Text>
                  <View style={s.fWrap}>
                    <Chip label="Alle Teilnehmer" active={delSel.length === delPeople.length} onPress={() => setDelSel(delSel.length === delPeople.length ? [] : delPeople.map((_, i) => i))} />
                    {delPeople.map((p, i) => <Chip key={i} label={p.name || `Teilnehmer ${i + 1}`} active={delSel.includes(i)} onPress={() => setDelSel((l) => (l.includes(i) ? l.filter((x) => x !== i) : [...l, i]))} />)}
                  </View>
                </View>
              )}
              {delStep === 2 && (
                <View>
                  <Text style={[s.muted, { marginVertical: 10 }]}>Möchtest du die ausgewählten Teilnehmer per E-Mail informieren, dass der Kurs nicht mehr stattfindet? Deine Mail-App öffnet sich mit einer fertigen Nachricht (an alle in einer Mail, die Adressen sind für die anderen nicht sichtbar).</Text>
                  {delSel.map((i) => delPeople[i]).filter((p) => p?.email?.includes('@')).map((p, k) => <Text key={k} style={s.muted}>✉️ {p.name || 'Teilnehmer'} · {p.email}</Text>)}
                </View>
              )}
              {!!delErr && <Text style={[s.muted, { color: '#C62828', fontWeight: '700', marginTop: 6 }]}>{delErr}</Text>}
              <View style={[s.dNav, { marginTop: 14 }]}>
                <Pressable style={s.dBtn} onPress={() => (delStep === 0 ? setDelUrl(null) : setDelStep(delStep - 1))}><Text style={s.moreTxt}>{delStep === 0 ? 'Abbrechen' : 'Zurück'}</Text></Pressable>
                {delStep === 0 && <Pressable style={[s.dBtn, { backgroundColor: colors.primary, borderColor: colors.primary, opacity: delCode.length === 5 ? 1 : 0.4 }]} disabled={delCode.length !== 5 || delBusy} onPress={checkCode}><Text style={[s.moreTxt, { color: '#fff' }]}>Löschen</Text></Pressable>}
                {delStep === 1 && <Pressable style={[s.dBtn, { backgroundColor: colors.primary, borderColor: colors.primary, opacity: delSel.length ? 1 : 0.4 }]} disabled={!delSel.length} onPress={() => (delSel.some((i) => delPeople[i]?.email?.includes('@')) ? setDelStep(2) : finalizeDelete(delSel, false))}><Text style={[s.moreTxt, { color: '#fff' }]}>Weiter</Text></Pressable>}
                {delStep === 2 && <Pressable style={s.dBtn} onPress={() => finalizeDelete(delSel, false)}><Text style={s.moreTxt}>Nein, nur löschen</Text></Pressable>}
                {delStep === 2 && <Pressable style={[s.dBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => finalizeDelete(delSel, true)}><Text style={[s.moreTxt, { color: '#fff' }]}>Ja, informieren</Text></Pressable>}
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
      <Modal visible={showOnb} animationType="fade" onRequestClose={() => {}}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }} keyboardShouldPersistTaps="handled">
            <Image source={{ uri: LOGO }} style={{ width: 84, height: 84, alignSelf: 'center', marginBottom: 18 }} resizeMode="contain" />
            {onbStep === 0 ? (
              <View>
                <Text style={s.onbH}>Willkommen!</Text>
                <Text style={s.onbQ}>Lege deinen Benutzernamen fest</Text>
                <TextInput style={s.search} value={onbFirst} onChangeText={setOnbFirst} placeholder="Vorname (optional)" placeholderTextColor={colors.muted} autoCorrect={false} />
                <TextInput style={s.search} value={onbLast} onChangeText={setOnbLast} placeholder="Nachname (optional)" placeholderTextColor={colors.muted} autoCorrect={false} />
                <TextInput style={s.search} value={onbUser} onChangeText={(t) => { setOnbUser(t); setOnbErr(''); }} placeholder="Benutzername, z. B. Firmenname oder dein Name" placeholderTextColor={colors.muted} autoCorrect={false} autoCapitalize="none" returnKeyType="go" onSubmitEditing={tryLogin} />
                {!!onbErr && <Text style={[s.muted, { color: '#C62828', fontWeight: '700', marginBottom: 6 }]}>{onbErr}</Text>}
                <Text style={[s.muted, { marginBottom: 14 }]}>Der Benutzername kann ein Firmenname oder dein eigener Name sein. Vor- und Nachname sind freiwillig; sie stehen unter Terminbestätigungen, die du an Teilnehmer schickst.</Text>
                <Pressable style={[s.ask, { alignSelf: 'stretch', marginHorizontal: 0, opacity: onbUser.trim() && !onbBusy ? 1 : 0.4 }]} disabled={!onbUser.trim() || onbBusy} onPress={tryLogin}>{onbBusy ? <ActivityIndicator color="#fff" /> : <Text style={s.askTxt}>Anmelden</Text>}</Pressable>
                <Pressable onPress={generateUser} disabled={onbBusy} style={{ alignItems: 'center', padding: 14 }}><Text style={s.moreTxt}>Benutzernamen generieren lassen</Text></Pressable>
              </View>
            ) : (
              <View>
                <Text style={s.onbH}>Hallo {onbFirst.trim() || onbUser.trim()}!</Text>
                <Text style={s.onbQ}>Nutzt du die App privat oder geschäftlich?</Text>
                {([
                  ['privat', 'Privat', 'Du buchst für dich selbst oder deine Familie – z. B. Erste Hilfe für den Führerschein, Erste Hilfe am Kind (Eltern, Tagesmütter, Babysitter), Auffrischung.'],
                  ['geschaeftlich', 'Geschäftlich / Organisation', 'Du buchst für andere oder für eine Einrichtung – z. B. Fahrschule, Kindertagesstätte, Verein, Firma (Betriebliche Ersthelfer), Schule.'],
                ] as const).map(([k, t, info]) => (
                  <View key={k} style={s.onbCard}>
                    <Pressable style={{ flexDirection: 'row', alignItems: 'center' }} onPress={() => finishOnb(k)}>
                      <Text style={[s.onbT, { flex: 1 }]}>{t}</Text>
                      <Pressable onPress={() => setOnbInfo(onbInfo === k ? '' : k)} hitSlop={10} style={s.onbI}><Text style={s.onbITxt}>i</Text></Pressable>
                    </Pressable>
                    {onbInfo === k && <Text style={[s.muted, { marginTop: 8 }]}>{info}</Text>}
                  </View>
                ))}
                <Pressable onPress={() => setOnbStep(0)} style={{ alignItems: 'center', padding: 14 }}><Text style={s.moreTxt}>‹ Zurück</Text></Pressable>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
      <Modal visible={!!webAsk} transparent animationType="fade" onRequestClose={() => setWebAsk(null)}>
        <Pressable style={s.sheetBg} onPress={() => setWebAsk(null)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={s.sheetH}>Hast du dich angemeldet?</Text>
            {!!webAsk && <Text style={[s.muted, { marginTop: 4 }]}>{webAsk.info.label} · {webAsk.title} · {webAsk.info.city}</Text>}
            <Text style={[s.muted, { marginVertical: 10 }]}>Die Anmeldung läuft auf der Seite von MSG in einem neuen Browser-Tab. Sobald du dort auf „Zahlungspflichtig anmelden“ getippt hast, bestätige hier. Dann trägt die App den Termin bei dir ein.</Text>
            <Text style={s.fLabel}>Wie viele Teilnehmer hast du angemeldet?</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 8 }}>
              <Pressable style={s.cntBtn} onPress={() => setWebCnt((n) => Math.max(1, n - 1))}><Text style={s.cntTxt}>−</Text></Pressable>
              <Text style={s.cntNum}>{webCnt}</Text>
              <Pressable style={s.cntBtn} onPress={() => setWebCnt((n) => Math.min(20, n + 1))}><Text style={s.cntTxt}>+</Text></Pressable>
            </View>
            <View style={[s.dNav, { marginTop: 12 }]}>
              <Pressable style={s.dBtn} onPress={() => setWebAsk(null)}><Text style={s.moreTxt}>Noch nicht</Text></Pressable>
              <Pressable style={[s.dBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={confirmWebBooking}><Text style={[s.moreTxt, { color: '#fff' }]}>Ja, angemeldet</Text></Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal visible={!!calAsk} transparent animationType="fade" onRequestClose={() => setCalAsk(null)}>
        <View style={{ flex: 1 }}>
          <Pressable style={s.sheetBg} onPress={() => setCalAsk(null)}>
            <Pressable style={s.sheet} onPress={() => {}}>
              <Text style={s.sheetH}>Im Handy-Kalender speichern?</Text>
              <Text style={[s.muted, { marginBottom: 6 }]}>{calAsk && booked[calAsk] ? `${booked[calAsk].label} · ${booked[calAsk].time}` : ''}</Text>
              <Text style={[s.muted, { marginBottom: 8 }]}>Wähle den Kalender (z. B. iCloud oder Google):</Text>
              {deviceCals === null ? <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} /> : deviceCals.map((c: any) => (
                <Pressable key={c.id} style={s.sheetBtn} onPress={() => saveToCalendar(c)}>
                  <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: c.color ?? colors.accent }} />
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={[s.sheetTxt, { marginLeft: 0 }]}>{c.title}</Text>
                    {!!c.source?.name && <Text style={s.muted}>{c.source.name}</Text>}
                  </View>
                </Pressable>
              ))}
              {!!calErr && <Text style={[s.muted, { marginTop: 8, color: colors.text }]}>{calErr}</Text>}
              <Pressable style={s.sheetCancel} onPress={() => setCalAsk(null)}><Text style={s.moreTxt}>Nein danke</Text></Pressable>
            </Pressable>
          </Pressable>
        </View>
      </Modal>
      <Loader visible={switching} top={heroH} />
      {!overlay && <Edges side={cfg.side} onTrigger={edgeCommit} onMove={edgeMove} onCancel={edgeCancel} />}
      <View style={s.hidden} pointerEvents="none">
        {active.map((c) => <Hidden key={c.id} course={c} onDone={onDone} />)}
      </View>
    </View>
  );
}
// Stile werden pro Modus + Farbe einmal gebaut und gemerkt
const makeStyles = () => StyleSheet.create(withFont({
  root: { flex: 1, backgroundColor: colors.bg, ...(Platform.OS === 'web' ? { maxWidth: 560, width: '100%', alignSelf: 'center' } : {}) } as any,
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0.01, overflow: 'hidden' },
  hero: { backgroundColor: colors.hero, paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 24) + 16 : 62, paddingHorizontal: 20, paddingBottom: 22, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  h1: { color: '#fff', fontSize: 21, fontWeight: '800' },
  sub: { color: colors.soft, marginTop: 6 },
  locBtn: { backgroundColor: colors.inputBg, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  locTxt: { color: colors.accent, fontWeight: '700', fontSize: 16 },
  locMsg: { color: '#fff', marginTop: 10 },
  label: { marginTop: 16, marginHorizontal: 20, fontWeight: '700', color: colors.text },
  row: { paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, marginRight: 8 },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.accent },
  chipTxt: { color: colors.text }, chipTxtOn: { color: '#fff', fontWeight: '700' },
  card: { backgroundColor: colors.card, marginHorizontal: 16, marginTop: 12, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  cardTop: { borderColor: colors.accent, borderWidth: 2 },
  badge: { color: colors.accent, fontWeight: '800', marginBottom: 4, fontSize: 12, textTransform: 'uppercase' },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  muted: { color: colors.muted, marginTop: 2 },
  date: { fontSize: 20, fontWeight: '800', color: colors.primaryDark, marginTop: 10 },
  btn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 14 },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  slot: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  slotDate: { fontWeight: '700', color: colors.text },
  slotGo: { color: colors.accent, fontWeight: '800' },
  moreH: { marginTop: 16, marginBottom: 4, fontWeight: '700', color: colors.text },
  moreBtn: { borderWidth: 1.5, borderColor: colors.accent, borderRadius: 12, paddingVertical: 11, alignItems: 'center', marginTop: 10 },
  moreTxt: { color: colors.accent, fontWeight: '700' },
  regBar: { backgroundColor: colors.hero, paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 24) + 10 : 56, paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center' },
  regBack: { color: '#fff', fontSize: 17, fontWeight: '800', marginRight: 14 },
  regTitle: { color: '#fff', flex: 1, fontWeight: '600' },
  brand: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  logo: { width: 62, height: 62, borderRadius: 31, borderWidth: 3, borderColor: '#fff', backgroundColor: colors.logo, alignItems: 'center', justifyContent: 'center', marginRight: 14, overflow: 'hidden', elevation: 6, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  logoImg: { width: 56, height: 56 },
  msg: { color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: 6, marginBottom: 4 },
  wordmark: { width: 230, height: 230 / WM_AR },
  search: { letterSpacing: 0, backgroundColor: colors.inputBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, marginBottom: 8, color: colors.text },
  hint: { color: '#fff', marginBottom: 8 },
  revH: { fontWeight: '800', fontSize: 17, color: colors.text, marginHorizontal: 20 },
  rCard: { width: CW, marginHorizontal: GAP / 2, backgroundColor: colors.card, borderRadius: 20, padding: 20, minHeight: 210, borderWidth: 1, borderColor: colors.border, elevation: 4, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  rQuote: { position: 'absolute', right: 16, top: -4, fontSize: 70, color: colors.border, fontWeight: '800' },
  rName: { fontWeight: '800', color: colors.text, marginTop: 4 },
  dots: { flexDirection: 'row', justifyContent: 'center', marginBottom: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border, marginHorizontal: 3 },
  dotOn: { backgroundColor: colors.accent, width: 20 },
  burger: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginLeft: 8, alignSelf: 'flex-start' },
  bar: { width: 22, height: 3, borderRadius: 2, backgroundColor: '#fff', marginVertical: 2 },
  menuBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  drawer: { position: 'absolute', top: 0, bottom: 0, right: 0, width: DRAWER_W, backgroundColor: colors.card, paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 24) + 16 : 60, borderTopLeftRadius: 20, borderBottomLeftRadius: 20, elevation: 12, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: -4, height: 0 } },
  drawerHead: { alignItems: 'center', paddingBottom: 16, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border, marginHorizontal: 14 },
  drawerLogo: { width: 58, height: 58, marginBottom: 8 },
  drawerTitle: { fontWeight: '800', fontSize: 16, color: colors.accent, letterSpacing: 1 },
  cRow: { flexDirection: 'row', justifyContent: 'center' },
  ask: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, marginHorizontal: 16, marginTop: 18, borderRadius: 14, paddingVertical: 15, elevation: 3, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  askTxt: { color: '#fff', fontWeight: '800', fontSize: 17, marginLeft: 8 },
  sheetBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 34 },
  sheetH: { fontSize: 19, fontWeight: '800', color: colors.text },
  sheetBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, marginTop: 10 },
  sheetTxt: { marginLeft: 12, fontSize: 16, fontWeight: '700', color: colors.text },
  sheetCancel: { alignItems: 'center', paddingVertical: 14, marginTop: 6 },
  menu: { position: 'absolute', right: 16, top: Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 24) + 60 : 106, backgroundColor: colors.card, borderRadius: 16, paddingVertical: 6, minWidth: 190, elevation: 8, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, marginHorizontal: 8, borderRadius: 12 },
  menuItemOn: { backgroundColor: colors.tint },
  menuIcon: { fontSize: 18, marginRight: 12 },
  menuTxt: { fontSize: 16, fontWeight: '700', color: colors.text, marginLeft: 12 },
  menuTxtOn: { color: colors.accent },
  memberOn: { borderColor: colors.accent, borderWidth: 2, backgroundColor: colors.tint2 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingTop: 8, rowGap: 8 },
  result: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, marginHorizontal: 16, marginTop: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  resultIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  resultImg: { width: 40, height: 40, borderRadius: 20, marginRight: 12, backgroundColor: colors.border },
  resultT: { fontWeight: '700', fontSize: 16, color: colors.text },
  dTag: { color: colors.accent, fontWeight: '800', fontSize: 11, textTransform: 'uppercase', marginBottom: 2 },
  dCourse: { color: colors.text, marginTop: 1 },
  dNone: { marginTop: 12, marginBottom: 4, fontWeight: '700', color: colors.primaryDark },
  dNav: { flexDirection: 'row', gap: 8, marginTop: 6 },
  dBtn: { flex: 1, borderWidth: 1.5, borderColor: colors.accent, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  dOff: { borderColor: colors.border },
  dOffTxt: { color: colors.faint },
  calTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 16 },
  calFilterBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.accent, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: colors.card },
  calFilterOn: { backgroundColor: colors.primary },
  calFilterTxt: { color: colors.accent, fontWeight: '800', marginLeft: 8, fontSize: 15 },
  calActive: { marginHorizontal: 20, marginTop: 8, color: colors.primaryDark, fontWeight: '600' },
  calCard: { backgroundColor: colors.card, marginHorizontal: 16, marginTop: 12, paddingVertical: 12, borderRadius: 18, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch', paddingHorizontal: 18, marginBottom: 8 },
  calArrow: { fontSize: 32, fontWeight: '800', color: colors.accent, paddingHorizontal: 6 },
  calMonth: { fontSize: 18, fontWeight: '800', color: colors.text },
  calRow: { flexDirection: 'row' },
  calWd: { textAlign: 'center', color: colors.muted, fontWeight: '700', fontSize: 12, marginBottom: 4 },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap', width: Math.floor((SW - 32) / 7) * 7 },
  calDay: { borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  calHas: { backgroundColor: colors.tint },
  calToday: { borderWidth: 1.5, borderColor: colors.accent },
  calSel: { backgroundColor: colors.primary },
  calNum: { fontSize: 15, color: colors.text },
  calCount: { fontSize: 10, fontWeight: '800', color: colors.accent, marginTop: -1 },
  fLabel: { fontWeight: '800', color: colors.text, marginTop: 12, marginBottom: 6 },
  fWrap: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 },
  teamIntro: { fontSize: 18, fontWeight: '800', color: colors.text, marginHorizontal: 20, marginTop: 20, marginBottom: 4 },
  member: { flexDirection: 'row', backgroundColor: colors.card, marginHorizontal: 16, marginTop: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  memberPic: { width: 88, marginRight: 14, alignItems: 'center', justifyContent: 'center' },
  memberMore: { color: colors.accent, fontWeight: '800', marginTop: 8 },
  photoFrame: { overflow: 'hidden', backgroundColor: colors.tint2, alignItems: 'center', justifyContent: 'center' },
  resultPic: { width: 40, marginRight: 12, alignItems: 'center' },
  pName: { fontSize: 24, fontWeight: '800', color: colors.text, marginTop: 16, textAlign: 'center' },
  pRole: { fontSize: 16, fontWeight: '700', color: colors.accent, marginTop: 4, textAlign: 'center' },
  pCard: { alignSelf: 'stretch', backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 18, marginTop: 18 },
  pHead: { fontSize: 16, fontWeight: '800', color: colors.primaryDark, marginTop: 14, marginBottom: 4 },
  pTxt: { fontSize: 15, lineHeight: 23, color: colors.text, marginTop: 6 },
  pBullet: { fontSize: 15, lineHeight: 22, color: colors.text, marginTop: 4, paddingLeft: 4 },
  memberName: { fontSize: 17, fontWeight: '800', color: colors.text },
  memberRole: { color: colors.accent, fontWeight: '700', marginTop: 2 },
  memberInfo: { color: colors.muted, marginTop: 6, lineHeight: 19 },
  photo: { width: 220, height: 140, borderRadius: 14, marginRight: 10, backgroundColor: colors.border },
  photoCap: { color: colors.muted, fontSize: 11, marginHorizontal: 20, marginTop: 4 },
  avatar: { width: 24, height: 24, borderRadius: 12, marginRight: 8 },
  insta: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 8, padding: 12, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  instaIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.instaBg, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  instaH: { fontWeight: '800', color: colors.text, fontSize: 15 },
  instaBtn: { backgroundColor: '#E1306C', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9, marginLeft: 8 },
  instaBtnTxt: { color: '#fff', fontWeight: '800' },
  special: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 6, marginBottom: 4, padding: 12, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.accent },
  specialOn: { backgroundColor: colors.primary },
  specialStar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#F5A623', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  specialStarTxt: { color: '#fff', fontSize: 20, fontWeight: '800' },
  specialH: { fontWeight: '800', fontSize: 15, color: colors.accent },
  specialHOn: { color: '#fff' },
  specialSub: { color: colors.muted, marginTop: 2, fontSize: 13 },
  specialSubOn: { color: colors.soft },
  specialGo: { fontSize: 22, fontWeight: '800', color: colors.accent, marginLeft: 8 },
  loader: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', zIndex: 10, elevation: 10 },
  loaderBox: { width: 136, height: 136, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 136, height: 136, borderRadius: 68, borderWidth: 7, borderColor: colors.ringBg, borderTopColor: colors.accent, borderRightColor: colors.accent },
  loaderLogo: { width: 104, height: 104 },
  sorry: { textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.primaryDark, marginTop: 28, marginHorizontal: 20 },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 6, marginHorizontal: 30 },
  reviews: { marginTop: 24 },
  revImg: { height: 130, borderRadius: 12, marginBottom: 12, backgroundColor: colors.border },
  rev: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 12 },
  stars: { color: '#F5A623', fontSize: 16, marginBottom: 4 },
  revTxt: { color: colors.text, lineHeight: 20, marginBottom: 6 },
  contact: { margin: 16, marginTop: 8, padding: 16, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  contactH: { fontWeight: '800', fontSize: 16, marginBottom: 10, color: colors.text },
  contactRow: { flexDirection: 'row', gap: 8 },
  cBtn: { flex: 1, borderWidth: 1.5, borderColor: colors.accent, borderRadius: 12, paddingVertical: 11, alignItems: 'center', marginBottom: 8 },
  cTxt: { color: colors.accent, fontWeight: '700' },

  hwBox: { height: 150, borderRadius: 12, overflow: 'hidden', marginBottom: 10, backgroundColor: '#2A0E46' },
  hwImg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  hwShade: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 10, backgroundColor: 'rgba(20,6,34,0.6)' },
  hwTitle: { color: '#FFB347', fontWeight: '900', fontSize: 18 },
  hwAge: { color: '#fff', fontWeight: '700', marginTop: 2 },
  ageNote: { color: colors.text, marginTop: 6, fontWeight: '600' },
  star: { paddingHorizontal: 10, paddingVertical: 4 },
  starTxt: { fontSize: 26 },
  pal: { backgroundColor: colors.tint2, borderRadius: 12, padding: 12, marginTop: 2, marginBottom: 8 },
  palH: { fontWeight: '800', color: colors.text, marginBottom: 8 },
  palRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  palDot: { width: 34, height: 34, borderRadius: 17, borderWidth: 3, borderColor: 'transparent' },
  palDotOn: { borderColor: colors.text },
  palX: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 6 },
  calMarks: { position: 'absolute', bottom: 2, flexDirection: 'row' },
  calMark: { width: 6, height: 6, borderRadius: 3, marginHorizontal: 1 },
  band: { position: 'absolute', top: -1400, left: -20, right: -20, height: 1400, backgroundColor: colors.hero },
  webLoad: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  webCard: { backgroundColor: colors.card, marginHorizontal: 16, marginTop: 16, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  webH: { fontWeight: '800', fontSize: 17, color: colors.text, marginBottom: 4 },
  slideLoad: { color: colors.muted, marginTop: 8, fontWeight: '600' },
  msgImg: { height: 26, width: 26 * MSG_AR, marginBottom: 7 },
  viewer: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  viewerX: { position: 'absolute', top: Platform.OS === 'android' ? 30 : 56, right: 18, width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  viewerXTxt: { color: '#fff', fontSize: 20, fontWeight: '800' },
  colorDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, marginRight: 2 },
  palNone: { borderWidth: 1.5, borderColor: colors.accent, borderRadius: 17, paddingHorizontal: 12, height: 34, justifyContent: 'center' },
  palNoneTxt: { color: colors.accent, fontWeight: '800' },
  hintBg: { backgroundColor: 'rgba(0,0,0,0.28)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  hintCard: { backgroundColor: colors.card, borderRadius: 22, padding: 20, width: '100%', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  hintHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  hintI: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  hintITxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  hintH: { flex: 1, fontSize: 18, fontWeight: '800', color: colors.text },
  hintX: { fontSize: 18, color: colors.muted, fontWeight: '700' },
  hintTxt: { fontSize: 16, color: colors.text, lineHeight: 23 },
  hintOk: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginTop: 16 },
  hintOkTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  histBadge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 4 },
  histBadgeTxt: { fontWeight: '800', fontSize: 12, color: '#fff' },
  warnBg: { backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  warnBig: { backgroundColor: '#FFF1CC', borderRadius: 24, padding: 26, alignItems: 'center', width: '100%' },
  warnX: { position: 'absolute', top: 10, right: 14, padding: 6 },
  warnXTxt: { fontSize: 24, color: '#5A4300', fontWeight: '800' },
  warnIcon: { fontSize: 56, color: '#B26A00' },
  warnH: { fontSize: 30, fontWeight: '900', color: '#5A4300', marginTop: 4 },
  warnBigTxt: { fontSize: 20, fontWeight: '800', color: '#5A4300', textAlign: 'center', marginTop: 10, lineHeight: 28 },
  warnOk: { backgroundColor: '#5A4300', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 34, marginTop: 22 },
  warnOkTxt: { color: '#fff', fontWeight: '800', fontSize: 17 },
  bookLinkDark: { color: colors.muted, fontWeight: '700', textDecorationLine: 'underline' },
  warnBox: { backgroundColor: '#FFF1CC', borderRadius: 12, padding: 10 },
  warnTxt: { color: '#5A4300', fontWeight: '600' },
  pBox: { marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  onbH: { fontSize: 30, fontWeight: '800', color: colors.text, textAlign: 'center' },
  onbQ: { fontSize: 19, fontWeight: '700', color: colors.text, textAlign: 'center', marginTop: 8, marginBottom: 16 },
  onbCard: { backgroundColor: colors.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1.5, borderColor: colors.accent },
  onbT: { fontSize: 18, fontWeight: '800', color: colors.text },
  onbI: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  onbITxt: { color: colors.accent, fontWeight: '800' },
  cntBtn: { width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  cntTxt: { fontSize: 26, color: colors.accent, fontWeight: '800' },
  cntNum: { fontSize: 28, fontWeight: '900', color: colors.text, marginHorizontal: 28 },
  bkTag: { color: BOOK_GREEN, fontWeight: '800', fontSize: 12, marginBottom: 2 },
  bkBadge: { position: 'absolute', top: -2, right: -2, width: 16, height: 16, borderRadius: 8, backgroundColor: BOOK_GREEN, alignItems: 'center', justifyContent: 'center' },
  bkBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: '900' },
  regPill: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8 },
  regPillTxt: { color: '#fff', fontWeight: '800', fontSize: 12 },
  toast: { backgroundColor: BOOK_GREEN, paddingHorizontal: 14, paddingVertical: 10 },
  toastTxt: { color: '#fff', fontWeight: '700', lineHeight: 19 },
  regTools: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: colors.hero },
  regBtn: { flex: 1, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  regBtnOn: { backgroundColor: BOOK_GREEN, borderColor: BOOK_GREEN },
  regBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  bookCard: { marginHorizontal: 16, marginTop: 14, backgroundColor: BOOK_GREEN, borderRadius: 16, padding: 12 },
  bookRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  bookCheck: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  bookCheckTxt: { color: BOOK_GREEN, fontWeight: '900', fontSize: 20 },
  bookH: { color: '#fff', fontWeight: '900', fontSize: 16 },
  bookT: { color: '#fff', fontWeight: '800', marginTop: 1 },
  bookS: { color: 'rgba(255,255,255,0.9)', marginTop: 1 },
  bookGo: { color: '#fff', fontSize: 26, fontWeight: '800', marginLeft: 8 },
  bookLink: { color: '#fff', fontWeight: '700', marginTop: 8, textDecorationLine: 'underline' },
  regLogo: { width: 30, height: 30, marginLeft: 10 },
  edge: { position: 'absolute', top: 0, bottom: 0, width: 22, zIndex: 99, elevation: 99 },
  partial: { color: colors.muted, fontSize: 12, fontStyle: 'italic', marginBottom: 4 },
  rCount: { textAlign: 'center', color: colors.muted, fontSize: 12, marginBottom: 6 },
  slides: { marginHorizontal: 16, marginTop: 20, height: SLIDE_H, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.border, elevation: 3, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  slideTag: { position: 'absolute', left: 12, bottom: 12, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  slideTagTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  slideDots: { position: 'absolute', right: 12, bottom: 16, flexDirection: 'row' },
  slideDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)', marginLeft: 4 },
  slideDotOn: { backgroundColor: '#fff', width: 14 },
  socialPic: { width: 56, marginRight: 12, alignItems: 'center' },
  socialRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, marginTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  socialT: { fontWeight: '800', color: colors.text, fontSize: 15 },
  setH: { marginTop: 22, marginHorizontal: 20, fontWeight: '800', fontSize: 17, color: colors.text },
  setSub: { marginHorizontal: 20, marginTop: 4, color: colors.muted, lineHeight: 19 },
  setCard: { backgroundColor: colors.card, marginHorizontal: 16, marginTop: 10, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14 },
  opt: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
  optT: { fontWeight: '700', fontSize: 16, color: colors.text },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  radioOn: { borderColor: colors.accent },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.accent },
  seg: { flexDirection: 'row', marginHorizontal: 16, marginTop: 10, gap: 8 },
  segBtn: { flex: 1, borderWidth: 1.5, borderColor: colors.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: colors.card },
  segOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  segTxt: { color: colors.accent, fontWeight: '800', fontSize: 15 },
  segTxtOn: { color: '#fff' },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, marginTop: 10 },
  swatchWrap: { width: '33.33%', alignItems: 'center', marginBottom: 14 },
  swatch: { width: 58, height: 58, borderRadius: 29, borderWidth: 3, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  swatchCheck: { color: '#fff', fontSize: 26, fontWeight: '800' },
  swatchTxt: { marginTop: 6, color: colors.muted, fontSize: 13, fontWeight: '600' },
}));
const styleCache: Record<string, any> = {};
// ===== Fernsteuerung durch die Admin-App (Supabase-Tabelle app_config) =====
type Remote = {
  accentHex?: string; font?: string;
  announce?: { on?: boolean; title?: string; text?: string };
  phone?: string; whatsapp?: string; email?: string;
  cancelInfo?: string; partHint?: string;
  showReviews?: boolean; showSlideshow?: boolean;
};
const REMOTE_KEY = 'msg_remote_v1';
const ACC_DEFAULT = { ...ACCENTS.rot };
const DEFAULT_CONTACT = { ...contact };
const DEFAULT_CANCEL = CANCEL_INFO;
const DEFAULT_PART_HINT = PART_HINT;
const FONT_CHOICES: Record<string, { label: string; ios?: string; android?: string }> = {
  helvetica: { label: 'Helvetica Neue (Standard)', ios: 'Helvetica Neue' },
  system: { label: 'System' },
  georgia: { label: 'Georgia (Serife)', ios: 'Georgia', android: 'serif' },
  avenir: { label: 'Avenir Next', ios: 'Avenir Next' },
  trebuchet: { label: 'Trebuchet', ios: 'Trebuchet MS' },
  verdana: { label: 'Verdana', ios: 'Verdana' },
  palatino: { label: 'Palatino', ios: 'Palatino', android: 'serif' },
  courier: { label: 'Courier (Schreibmaschine)', ios: 'Courier New', android: 'monospace' },
};
let REMOTE_STYLE_KEY = '';
function applyRemote(r: Remote) {
  const hex = r.accentHex && /^#[0-9a-fA-F]{6}$/.test(r.accentHex) ? r.accentHex : '';
  ACCENTS.rot = hex ? { label: 'MSG-Farbe', main: hex, deep: mix(hex, '#000000', 0.7), lite: mix(hex, '#FFFFFF', 0.45) } : { ...ACC_DEFAULT };
  const f = FONT_CHOICES[r.font ?? 'helvetica'] ?? FONT_CHOICES.helvetica;
  FONT = Platform.OS === 'ios' ? f.ios : f.android;
  const dg = (t: string) => t.replace(/[^0-9]/g, '');
  contact.phone = r.phone?.trim() || DEFAULT_CONTACT.phone;
  contact.phoneUrl = r.phone?.trim() ? 'tel:' + (r.phone.trim().startsWith('+') ? '+' : '') + dg(r.phone) : DEFAULT_CONTACT.phoneUrl;
  contact.whatsappUrl = r.whatsapp?.trim() ? 'https://wa.me/' + dg(r.whatsapp) : DEFAULT_CONTACT.whatsappUrl;
  contact.email = r.email?.trim() || DEFAULT_CONTACT.email;
  CANCEL_INFO = r.cancelInfo?.trim() || DEFAULT_CANCEL;
  PART_HINT = r.partHint?.trim() || DEFAULT_PART_HINT;
  REMOTE_STYLE_KEY = `${hex}|${FONT ?? ''}`;
}
const fetchRemote = async (): Promise<Remote | null> => {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try { const r = await fetch(`${SUPABASE_URL}/rest/v1/app_config?id=eq.1&select=data`, { headers: sbHeaders() }); const j = await r.json(); return Array.isArray(j) && j[0]?.data ? j[0].data : null; } catch (e) { return null; }
};
const codeRpc = async (fn: 'check_code' | 'consume_code', code: string, user: string): Promise<string> => {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: sbHeaders(), body: JSON.stringify({ p_code: code, p_user: user || 'default' }) });
    if (!r.ok) return 'error';
    const j = await r.json(); return typeof j === 'string' ? j : 'error';
  } catch (e) { return 'error'; }
};
let s: any = null;
function applyStyles(mode: Mode, accent: AccentKey) {
  applyTheme(mode, accent);
  const k = mode + accent + '|' + REMOTE_STYLE_KEY;
  if (!styleCache[k]) styleCache[k] = makeStyles();
  s = styleCache[k];
}
applyStyles('light', 'rot');


