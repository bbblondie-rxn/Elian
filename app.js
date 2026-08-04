/* ===================================================
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
