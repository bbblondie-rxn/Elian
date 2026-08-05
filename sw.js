/* ===================================================
   ELIAN — Service worker (fonctionnement hors-ligne)

   ⚠️ RÈGLE D'OR :
   À CHAQUE modification d'un fichier, augmente le numéro
   de version ci-dessous. Sinon l'app garde l'ancienne
   version en mémoire.
   =================================================== */

const VERSION = "elian-v10";

const FICHIERS = [
  "index.html",
  "style.css",
  "app.js",
  "supabase.js",
  "plan.js",
  "edt.js",
  "calendrier.js",
  "calendrier-logique.js",
  "suivi.js",
  "cahier.js",
  "import.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FICHIERS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((noms) =>
      Promise.all(noms.filter((n) => n !== VERSION).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request))
  );
});
