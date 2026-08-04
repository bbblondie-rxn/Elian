/* ===================================================
   ELIAN — Page Plan de classe
   Morceau 1 : la salle vue du dessus (mode portrait tablette).
   Disposition fixe fidèle au PDF, ajustable plus tard.
   =================================================== */

import { sb } from "../supabase.js";

// État
let anneeId = null;
let classes = [];
let classeChoisie = null; // { id, nom, prof_principal }
let eleves = [];          // élèves de la classe
let placements = new Map(); // siège -> élève (siège = "ilot:position")

/* ---------------------------------------------------
   Disposition fixe de la salle (fidèle au PDF)
   Coordonnées en % de la largeur/hauteur d'une zone
   portrait. On ajustera finement plus tard.
   Les 9 îlots : 7 de 4 places, 2 de 2 places.
   --------------------------------------------------- */
const ILOTS = [
  { id: "A", places: 4, x: 8,  y: 22 },
  { id: "B", places: 4, x: 38, y: 22 },
  { id: "C", places: 4, x: 68, y: 22 },
  { id: "D", places: 4, x: 8,  y: 42 },
  { id: "E", places: 4, x: 38, y: 42 },
  { id: "F", places: 4, x: 68, y: 42 },
  { id: "G", places: 4, x: 8,  y: 62 },
  { id: "H", places: 2, x: 38, y: 62 },
  { id: "I", places: 2, x: 68, y: 62 },
];

// Les objets de la salle (tables tournantes + repères)
const OBJETS = [
  { id: "grise",   nom: "Grise",   x: 38, y: 6 },
  { id: "blanche", nom: "Blanche", x: 68, y: 6 },
  { id: "ballon",  nom: "Ballon",  x: 8,  y: 6 },
  { id: "coussin", nom: "Coussin", x: 8,  y: 84 },
  { id: "colle",   nom: "Poste à colle", x: 38, y: 84 },
  { id: "bureau",  nom: "Bureau",  x: 70, y: 84 },
];

/* ---------------------------------------------------
   Chargement
   --------------------------------------------------- */
async function chargerClasses() {
  const { data: annee } = await sb
    .from("annees")
    .select("id")
    .eq("active", true)
    .maybeSingle();
  if (!annee) { anneeId = null; classes = []; return; }
  anneeId = annee.id;

  const { data } = await sb
    .from("classes")
    .select("id, nom, prof_principal")
    .eq("annee_id", anneeId)
    .order("nom");
  classes = data || [];
}

async function chargerEleves(classeId) {
  const { data } = await sb
    .from("eleves")
    .select("id, prenom, nom, genre, statut")
    .eq("classe_id", classeId)
    .order("nom");
  eleves = (data || []).filter((e) => e.statut !== "archivé");

  // Placement : pour l'instant on remplit les sièges dans l'ordre
  // (le vrai placement viendra du Suivi / glisser-déposer).
  placements = new Map();
  let i = 0;
  for (const ilot of ILOTS) {
    for (let p = 0; p < ilot.places; p++) {
      if (i < eleves.length) {
        placements.set(`${ilot.id}:${p}`, eleves[i]);
        i++;
      }
    }
  }
}

/* ---------------------------------------------------
   Affichage d'un îlot (avec ses sièges)
   --------------------------------------------------- */
function afficherIlot(ilot) {
  const sieges = [];
  for (let p = 0; p < ilot.places; p++) {
    const eleve = placements.get(`${ilot.id}:${p}`);
    const nom = eleve ? eleve.prenom : "";
    sieges.push(`<div class="siege">${nom}</div>`);
  }
  return `
    <div class="ilot ilot-${ilot.places}" style="left:${ilot.x}%; top:${ilot.y}%;">
      ${sieges.join("")}
    </div>
  `;
}

/* ---------------------------------------------------
   Affichage d'un objet de la salle
   --------------------------------------------------- */
function afficherObjet(obj) {
  return `
    <div class="objet-salle objet-${obj.id}" style="left:${obj.x}%; top:${obj.y}%;">
      ${obj.nom}
    </div>
  `;
}

/* ---------------------------------------------------
   Affichage de la page
   --------------------------------------------------- */
export function renderPlan() {
  if (!anneeId) {
    return `
      <h1>Plan de classe</h1>
      <div class="carte"><p>Aucune année active. Crée-la d'abord dans la page Import.</p></div>
    `;
  }

  const optionsClasses = classes
    .map(
      (c) =>
        `<option value="${c.id}" ${classeChoisie && c.id === classeChoisie.id ? "selected" : ""}>${c.nom}</option>`
    )
    .join("");

  // En-tête : classe + professeur principal
  const entete = classeChoisie
    ? `<div class="plan-entete">
         <strong>${classeChoisie.nom}</strong>
         <span class="hint">PP : ${classeChoisie.prof_principal || "—"}</span>
       </div>`
    : "";

  const salle = classeChoisie
    ? `<div class="salle">
         ${OBJETS.map(afficherObjet).join("")}
         ${ILOTS.map(afficherIlot).join("")}
       </div>`
    : `<div class="carte"><p>Choisis une classe pour afficher la salle.</p></div>`;

  return `
    <h1>Plan de classe</h1>

    <div class="barre-semaine">
      <label>Classe :
        <select id="choixClassePlan">
          <option value="">— choisir —</option>
          ${optionsClasses}
        </select>
      </label>
    </div>

    ${entete}
    ${salle}
  `;
}

/* ---------------------------------------------------
   Interactions
   --------------------------------------------------- */
export function bindPlan() {
  const choix = document.getElementById("choixClassePlan");
  if (choix) {
    choix.addEventListener("change", async (e) => {
      const id = e.target.value || null;
      classeChoisie = id ? classes.find((c) => c.id === id) : null;
      if (classeChoisie) await chargerEleves(id);
      else eleves = [];
      rafraichir();
    });
  }
}

/* ---------------------------------------------------
   Redessiner
   --------------------------------------------------- */
function rafraichir() {
  const zone = document.getElementById("app");
  zone.innerHTML = renderPlan();
  bindPlan();
}

/* ---------------------------------------------------
   À l'ouverture
   --------------------------------------------------- */
export async function ouvrirPlan() {
  await chargerClasses();
  rafraichir();
}
