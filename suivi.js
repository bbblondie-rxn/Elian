/* ===================================================
   ELIAN — Page Suivi
   6 sous-onglets : Placement, Besoins, Documents,
   Engagement, Matériel, Absences.
   Version "grandes lignes" : la logique de fond est là,
   les liens fins (Plan, îlots) seront ajustés plus tard.
   =================================================== */

import { sb } from "./supabase.js";

// Les sous-onglets
const ONGLETS = [
  { id: "placement", nom: "Placement" },
  { id: "besoins", nom: "Besoins" },
  { id: "documents", nom: "Documents" },
  { id: "engagement", nom: "Note d'engagement" },
  { id: "materiel", nom: "Matériel" },
  { id: "absences", nom: "Absences" },
];

// État de la page
let ongletActif = "placement";
let anneeId = null;
let classes = [];
let classeChoisie = null; // id de la classe sélectionnée
let eleves = [];

/* ---------------------------------------------------
   Chargement de base
   --------------------------------------------------- */
async function chargerClasses() {
  const { data: annee } = await sb
    .from("annees")
    .select("id")
    .eq("active", true)
    .maybeSingle();

  if (!annee) {
    anneeId = null;
    classes = [];
    return;
  }
  anneeId = annee.id;

  const { data } = await sb
    .from("classes")
    .select("id, nom")
    .eq("annee_id", anneeId)
    .order("nom");
  classes = data || [];
}

async function chargerEleves(classeId) {
  const { data } = await sb
    .from("eleves")
    .select("id, prenom, nom, genre, groupe, besoins, statut")
    .eq("classe_id", classeId)
    .order("nom");
  // On ignore les élèves archivés
  eleves = (data || []).filter((e) => e.statut !== "archivé");
}

/* ---------------------------------------------------
   Pré-positionnement filles / garçons (au mieux)
   Pour l'instant : calcule et affiche l'ordre proposé.
   Le lien vers les vrais sièges du Plan viendra ensuite.
   --------------------------------------------------- */
function prePositionner(liste) {
  const filles = liste.filter((e) => e.genre === "F");
  const garcons = liste.filter((e) => e.genre === "M");
  const autres = liste.filter((e) => e.genre !== "F" && e.genre !== "M");

  const ordre = [];
  let i = 0;
  // Alterner tant que les deux groupes ont des élèves
  while (filles.length || garcons.length) {
    if (i % 2 === 0 && filles.length) ordre.push(filles.shift());
    else if (garcons.length) ordre.push(garcons.shift());
    else if (filles.length) ordre.push(filles.shift());
    i++;
  }
  // Placer le reste (genre non renseigné) à la suite
  return ordre.concat(autres);
}

/* ---------------------------------------------------
   Contenu de chaque sous-onglet
   --------------------------------------------------- */
function contenuOnglet() {
  // Il faut une classe choisie pour la plupart des onglets
  if (!classeChoisie) {
    return `<div class="carte"><p>Choisis une classe ci-dessus.</p></div>`;
  }

  if (ongletActif === "placement") {
    const ordre = prePositionner([...eleves]);
    const liste = ordre
      .map(
        (e, i) =>
          `<li>${i + 1}. ${e.prenom} ${e.nom} <span class="genre-tag">${e.genre || "?"}</span></li>`
      )
      .join("");
    return `
      <div class="carte">
        <p class="hint">Répartition proposée en alternant filles / garçons au mieux.</p>
        <button class="bouton" id="btnPrepositionner">Pré-positionner</button>
        <ol class="liste-placement">${liste}</ol>
        <p class="hint">Le placement sur les vrais sièges se fera avec la page Plan.</p>
      </div>
    `;
  }

  if (ongletActif === "besoins") {
    const lignes = eleves
      .map(
        (e) => `
        <tr>
          <td>${e.prenom} ${e.nom}</td>
          <td>${e.besoins || "<span class='hint'>—</span>"}</td>
        </tr>`
      )
      .join("");
    return `
      <div class="carte">
        <p class="hint">Besoins par élève (lunettes, près de moi, au calme…). Édition à venir.</p>
        <table class="grille-edt">
          <tr><th>Élève</th><th>Besoins</th></tr>
          ${lignes}
        </table>
      </div>
    `;
  }

  if (ongletActif === "engagement") {
    return `
      <div class="carte">
        <p class="hint">Note d'engagement (10/20 par mois). Calcul à brancher sur les annotations du Plan.</p>
        <table class="grille-edt">
          <tr><th>Élève</th><th>Note du mois</th></tr>
          ${eleves.map((e) => `<tr><td>${e.prenom} ${e.nom}</td><td>10,00</td></tr>`).join("")}
        </table>
      </div>
    `;
  }

  if (ongletActif === "absences") {
    return `
      <div class="carte">
        <p class="hint">Absences par trimestre (issues du code A du Plan). À brancher.</p>
        <table class="grille-edt">
          <tr><th>Élève</th><th>Absences</th></tr>
          ${eleves.map((e) => `<tr><td>${e.prenom} ${e.nom}</td><td>0</td></tr>`).join("")}
        </table>
      </div>
    `;
  }

  if (ongletActif === "materiel") {
    return `<div class="carte"><p class="hint">Suivi du matériel (roulement). À brancher sur les visites du Plan.</p></div>`;
  }

  if (ongletActif === "documents") {
    return `<div class="carte"><p class="hint">Documents de positionnement par trimestre. À construire (rédaction auto + synthèse libre).</p></div>`;
  }

  return "";
}

/* ---------------------------------------------------
   Affichage de la page
   --------------------------------------------------- */
export function renderSuivi() {
  if (!anneeId) {
    return `
      <h1>Suivi</h1>
      <div class="carte"><p>Aucune année active. Crée-la d'abord dans la page Import.</p></div>
    `;
  }

  const barreOnglets = ONGLETS.map(
    (o) =>
      `<button class="sous-onglet${o.id === ongletActif ? " actif" : ""}" data-onglet="${o.id}">${o.nom}</button>`
  ).join("");

  const optionsClasses = classes
    .map(
      (c) =>
        `<option value="${c.id}" ${c.id === classeChoisie ? "selected" : ""}>${c.nom}</option>`
    )
    .join("");

  return `
    <h1>Suivi</h1>

    <div class="barre-semaine">
      <label>Classe :
        <select id="choixClasseSuivi">
          <option value="">— choisir —</option>
          ${optionsClasses}
        </select>
      </label>
    </div>

    <div class="sous-onglets">${barreOnglets}</div>

    ${contenuOnglet()}
  `;
}

/* ---------------------------------------------------
   Interactions
   --------------------------------------------------- */
export function bindSuivi() {
  // Choix de la classe
  const choix = document.getElementById("choixClasseSuivi");
  if (choix) {
    choix.addEventListener("change", async (e) => {
      classeChoisie = e.target.value || null;
      if (classeChoisie) await chargerEleves(classeChoisie);
      else eleves = [];
      rafraichir();
    });
  }

  // Changement de sous-onglet
  document.querySelectorAll(".sous-onglet").forEach((btn) => {
    btn.addEventListener("click", () => {
      ongletActif = btn.dataset.onglet;
      rafraichir();
    });
  });

  // Bouton pré-positionner (pour l'instant, réaffiche l'ordre)
  const btnPre = document.getElementById("btnPrepositionner");
  if (btnPre) {
    btnPre.addEventListener("click", () => rafraichir());
  }
}

/* ---------------------------------------------------
   Redessiner
   --------------------------------------------------- */
function rafraichir() {
  const zone = document.getElementById("app");
  zone.innerHTML = renderSuivi();
  bindSuivi();
}

/* ---------------------------------------------------
   À l'ouverture
   --------------------------------------------------- */
export async function ouvrirSuivi() {
  await chargerClasses();
  rafraichir();
}
