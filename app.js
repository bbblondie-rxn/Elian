/* ===================================================
   ELIAN — Chef d'orchestre
   Gère le menu et affiche la bonne page.
   =================================================== */

import { renderPlan, bindPlan, ouvrirPlan } from "./plan.js";
import { renderEDT, bindEDT, ouvrirEDT } from "./edt.js";
import { renderCalendrier, bindCalendrier, ouvrirCalendrier } from "./calendrier.js";
import { renderSuivi, bindSuivi, ouvrirSuivi } from "./suivi.js";
import { renderCahier, bindCahier, ouvrirCahier } from "./cahier.js";
import { renderImport, bindImport } from "./import.js";

const zoneApp = document.getElementById("app");

/* Les 6 pages.
   - "ouvrir" : pour les pages qui chargent des données au départ.
   - "afficher" + "brancher" : pour les pages instantanées. */
const pages = {
  plan:       { ouvrir: ouvrirPlan },
  edt:        { ouvrir: ouvrirEDT },
  calendrier: { ouvrir: ouvrirCalendrier },
  suivi:      { ouvrir: ouvrirSuivi },
  cahier:     { ouvrir: ouvrirCahier },
  import:     { afficher: renderImport, brancher: bindImport },
};

function afficherPage(nom) {
  const page = pages[nom];
  if (!page) return;

  // Surligner l'onglet actif
  document.querySelectorAll(".menu-item").forEach((bouton) => {
    bouton.classList.toggle("actif", bouton.dataset.page === nom);
  });

  // Page avec chargement initial
  if (page.ouvrir) {
    zoneApp.innerHTML = `<p class="hint">⏳ Chargement…</p>`;
    page.ouvrir();
    return;
  }

  // Page instantanée
  zoneApp.innerHTML = page.afficher();
  if (page.brancher) page.brancher();
}

// Brancher les clics du menu
document.querySelectorAll(".menu-item").forEach((bouton) => {
  bouton.addEventListener("click", () => afficherPage(bouton.dataset.page));
});

// Au démarrage : le Plan
afficherPage("plan");
