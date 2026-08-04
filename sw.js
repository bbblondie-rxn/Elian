/* ===================================================
   ELIAN — Service worker (fonctionnement hors-ligne)

   ⚠️ RÈGLE D'OR :
   À CHAQUE modification d'un fichier de l'appli,
   augmente le numéro de version ci-dessous (v1 → v2 → v3…).
   Sinon l'appli garde l'ancienne version en mémoire.
   =================================================== */

const VERSION = "elian-v3";

// Les fichiers gardés en copie pour le hors-ligne
const FICHIERS = [
  "index.html",
  "style.css",
  "app.js",
  "supabase.js",
  "pages/import.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

/* Installation : on met les fichiers en copie */
self.addEventListener("install", (evenement) => {
  evenement.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(FICHIERS))
  );
  self.skipWaiting();
});

/* Activation : on efface les vieilles versions */
self.addEventListener("activate", (evenement) => {
  evenement.waitUntil(
    caches.keys().then((noms) =>
      Promise.all(
        noms.filter((nom) => nom !== VERSION).map((nom) => caches.delete(nom))
      )
    )
  );
  self.clients.claim();
});

/* Navigation : on sert la copie si pas de réseau */
self.addEventListener("fetch", (evenement) => {
  evenement.respondWith(
    caches.match(evenement.request).then((reponse) => {
      return reponse || fetch(evenement.request);
    })
  );
});/* ===================================================
   ELIAN — Service worker (fonctionnement hors-ligne)

   ⚠️ RÈGLE D'OR :
   À CHAQUE modification d'un fichier de l'appli,
   augmente le numéro de version ci-dessous (v1 → v2 → v3…).
   Sinon l'appli garde l'ancienne version en mémoire.
   =================================================== */

const VERSION = "elian-v1";

// Les fichiers gardés en copie pour le hors-ligne
const FICHIERS = [
  "index.html",
  "style.css",
  "app.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

/* Installation : on met les fichiers en copie */
self.addEventListener("install", (evenement) => {
  evenement.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(FICHIERS))
  );
  self.skipWaiting();
});

/* Activation : on efface les vieilles versions */
self.addEventListener("activate", (evenement) => {
  evenement.waitUntil(
    caches.keys().then((noms) =>
      Promise.all(
        noms.filter((nom) => nom !== VERSION).map((nom) => caches.delete(nom))
      )
    )
  );
  self.clients.claim();
});

/* Navigation : on sert la copie si pas de réseau */
self.addEventListener("fetch", (evenement) => {
  evenement.respondWith(
    caches.match(evenement.request).then((reponse) => {
      return reponse || fetch(evenement.request);
    })
  );
});
