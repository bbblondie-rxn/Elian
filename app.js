/* ===================================================
   ELIAN — Chef d'orchestre
   Gère le menu et affiche la bonne page.
   =================================================== */

import { renderImport, bindImport } from "./pages/import.js";
import { renderEDT, bindEDT, ouvrirEDT } from "./pages/edt.js";

// La zone où s'affiche le contenu
const zoneApp = document.getElementById("app");

/* ---------------------------------------------------
   Les pages de l'appli.
   - "afficher" : construit le contenu de la page.
   - "brancher" : active les interactions (facultatif).
   Les pages encore vides afficheront juste leur titre.
   --------------------------------------------------- */
const pages = {
  plan: {
    afficher: () => `
      <h1>Plan de classe</h1>
      <p class="hint">Le cœur de l'appli. À construire.</p>
    `,
  },
  edt: {
    afficher: renderEDT,
    brancher: bindEDT,
    ouvrir: ouvrirEDT,
  },
  calendrier: {
    afficher: () => `
      <h1>Calendrier</h1>
      <p class="hint">La planification des séquences. À construire.</p>
    `,
  },
  suivi: {
    afficher: () => `
      <h1>Suivi</h1>
      <p class="hint">Documents, notes, matériel, absences. À construire.</p>
    `,
  },
  cahier: {
    afficher: () => `
      <h1>Cahier</h1>
      <p class="hint">Les notes personnelles. À construire.</p>
    `,
  },
  import: {
    afficher: renderImport,
    brancher: bindImport,
  },
};

/* ---------------------------------------------------
   Afficher une page
   --------------------------------------------------- */
function afficherPage(nom) {
  const page = pages[nom];
  if (!page) return;

  // Surligner l'onglet actif
  document.querySelectorAll(".menu-item").forEach((bouton) => {
    if (bouton.dataset.page === nom) {
      bouton.classList.add("actif");
    } else {
      bouton.classList.remove("actif");
    }
  });

  // Si la page a besoin de charger des données au départ,
  // on lui laisse la main (elle se dessinera elle-même).
  if (page.ouvrir) {
    zoneApp.innerHTML = `<p class="hint">⏳ Chargement…</p>`;
    page.ouvrir();
    return;
  }

  // Sinon : affichage simple + interactions
  zoneApp.innerHTML = page.afficher();
  if (page.brancher) page.brancher();
}

/* ---------------------------------------------------
   Brancher les clics du menu
   --------------------------------------------------- */
document.querySelectorAll(".menu-item").forEach((bouton) => {
  bouton.addEventListener("click", () => {
    afficherPage(bouton.dataset.page);
  });
});

/* ---------------------------------------------------
   Au démarrage : afficher le Plan de classe
   --------------------------------------------------- */
afficherPage("plan");/* ===================================================
   ELIAN — Chef d'orchestre
   Gère le menu et affiche la bonne page.
   =================================================== */

// La zone où s'affiche le contenu
const zoneApp = document.getElementById("app");

/* ---------------------------------------------------
   Les pages de l'appli.
   Pour l'instant chacune affiche juste son titre.
   On remplacera ces fonctions par les vraies pages,
   une par une.
   --------------------------------------------------- */
const pages = {
  plan: () => `
    <h1>Plan de classe</h1>
    <p class="hint">Le cœur de l'appli. À construire.</p>
  `,
  edt: () => `
    <h1>Emploi du temps</h1>
    <p class="hint">La grille des cours. À construire.</p>
  `,
  calendrier: () => `
    <h1>Calendrier</h1>
    <p class="hint">La planification des séquences. À construire.</p>
  `,
  suivi: () => `
    <h1>Suivi</h1>
    <p class="hint">Documents, notes, matériel, absences. À construire.</p>
  `,
  cahier: () => `
    <h1>Cahier</h1>
    <p class="hint">Les notes personnelles. À construire.</p>
  `,
  import: () => `
    <h1>Import / Export</h1>
    <p class="hint">Créer les classes et les élèves. À construire.</p>
  `,
};

/* ---------------------------------------------------
   Afficher une page
   --------------------------------------------------- */
function afficherPage(nom) {
  // 1. Mettre le contenu de la page dans la zone
  const construirePage = pages[nom];
  if (construirePage) {
    zoneApp.innerHTML = construirePage();
  }

  // 2. Surligner l'onglet actif dans le menu
  document.querySelectorAll(".menu-item").forEach((bouton) => {
    if (bouton.dataset.page === nom) {
      bouton.classList.add("actif");
    } else {
      bouton.classList.remove("actif");
    }
  });
}

/* ---------------------------------------------------
   Brancher les clics du menu
   --------------------------------------------------- */
document.querySelectorAll(".menu-item").forEach((bouton) => {
  bouton.addEventListener("click", () => {
    afficherPage(bouton.dataset.page);
  });
});

/* ---------------------------------------------------
   Au démarrage : afficher le Plan de classe
   --------------------------------------------------- */
afficherPage("plan");
