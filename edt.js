/* ===================================================
   ELIAN — Page Emploi du temps
   Morceau 1 : la grille (jours × créneaux) + la palette.
   (Pas encore d'enregistrement Supabase : viendra au morceau 2.)
   =================================================== */

import { sb } from "../supabase.js";

// Les créneaux, repris d'Agora
const CRENEAUX = [
  { code: "M1", debut: "08:30", fin: "09:25" },
  { code: "M2", debut: "09:25", fin: "10:20" },
  { code: "M3", debut: "10:35", fin: "11:30" },
  { code: "M4", debut: "11:30", fin: "12:30" },
  { code: "PM", debut: "12:30", fin: "13:55" }, // pause déjeuner
  { code: "S1", debut: "13:55", fin: "14:55" },
  { code: "S2", debut: "14:55", fin: "15:50" },
  { code: "S3", debut: "16:05", fin: "17:05" },
  { code: "S4", debut: "17:05", fin: "18:00" },
];

const JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi"];

// La grille en mémoire : pour chaque case "jour|creneau", la classe posée
let grille = new Map();

// La classe actuellement choisie dans la palette (ou null)
let classeChoisie = null;

// La liste des classes de l'année active
let classes = [];

/* ---------------------------------------------------
   Charger les classes de l'année active
   --------------------------------------------------- */
async function chargerClasses() {
  const { data: annee } = await sb
    .from("annees")
    .select("id")
    .eq("active", true)
    .maybeSingle();

  if (!annee) {
    classes = [];
    return;
  }

  const { data } = await sb
    .from("classes")
    .select("id, nom")
    .eq("annee_id", annee.id)
    .order("nom");

  classes = data || [];
}

/* ---------------------------------------------------
   Une couleur douce et stable par classe
   (teinte calculée à partir du nom)
   --------------------------------------------------- */
function couleurClasse(nom) {
  let somme = 0;
  for (const c of String(nom)) somme += c.charCodeAt(0);
  const teinte = somme % 360;
  return `hsl(${teinte}, 45%, 88%)`;
}

/* ---------------------------------------------------
   L'affichage de la page
   --------------------------------------------------- */
export function renderEDT() {
  // La palette : une pastille par classe + une gomme
  const pastilles = classes
    .map((c) => {
      const actif =
        classeChoisie && classeChoisie.id === c.id ? " actif" : "";
      return `<button class="pastille${actif}"
                 data-id="${c.id}" data-nom="${c.nom}"
                 style="background:${couleurClasse(c.nom)}">
                 ${c.nom}
               </button>`;
    })
    .join("");

  const gommeActive =
    classeChoisie && classeChoisie.id === "gomme" ? " actif" : "";

  // La grille : une ligne par créneau, une colonne par jour
  const lignes = CRENEAUX.map((cr) => {
    const cases = JOURS.map((jour) => {
      if (cr.code === "PM") {
        return `<td class="case-pause">—</td>`;
      }
      const posee = grille.get(`${jour}|${cr.code}`);
      const fond = posee ? `background:${couleurClasse(posee.nom)}` : "";
      const texte = posee ? posee.nom : "";
      return `<td class="case-edt" data-jour="${jour}" data-creneau="${cr.code}"
                 style="${fond}">${texte}</td>`;
    }).join("");

    return `<tr>
              <th class="entete-creneau">${cr.code}<br><small>${cr.debut}-${cr.fin}</small></th>
              ${cases}
            </tr>`;
  }).join("");

  return `
    <h1>Emploi du temps</h1>
    <p class="hint">Choisis une classe, puis clique les cases où elle a lieu.</p>

    ${
      classes.length === 0
        ? `<div class="carte"><p>Aucune classe. Importe d'abord tes élèves dans la page Import.</p></div>`
        : `
      <div class="palette">
        ${pastilles}
        <button class="pastille${gommeActive}" id="gomme"
                style="background:#fff;border:1px dashed #999">Gomme</button>
      </div>

      <div class="carte" style="overflow-x:auto;">
        <table class="grille-edt">
          <tr>
            <th></th>
            ${JOURS.map((j) => `<th>${j}</th>`).join("")}
          </tr>
          ${lignes}
        </table>
      </div>
    `
    }
  `;
}

/* ---------------------------------------------------
   Les interactions de la page
   --------------------------------------------------- */
export function bindEDT() {
  // Choisir une classe dans la palette
  document.querySelectorAll(".pastille[data-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const nom = btn.dataset.nom;
      // Reclic sur la même classe = désélection
      if (classeChoisie && classeChoisie.id === id) {
        classeChoisie = null;
      } else {
        classeChoisie = { id, nom };
      }
      rafraichir();
    });
  });

  // Choisir la gomme
  const gomme = document.getElementById("gomme");
  if (gomme) {
    gomme.addEventListener("click", () => {
      if (classeChoisie && classeChoisie.id === "gomme") {
        classeChoisie = null;
      } else {
        classeChoisie = { id: "gomme", nom: "" };
      }
      rafraichir();
    });
  }

  // Cliquer une case
  document.querySelectorAll(".case-edt").forEach((td) => {
    td.addEventListener("click", () => {
      if (!classeChoisie) return; // rien de choisi : on ne fait rien
      const cle = `${td.dataset.jour}|${td.dataset.creneau}`;

      if (classeChoisie.id === "gomme") {
        grille.delete(cle);
      } else {
        grille.set(cle, { id: classeChoisie.id, nom: classeChoisie.nom });
      }
      rafraichir();
    });
  });
}

/* ---------------------------------------------------
   Redessiner la page après un changement
   --------------------------------------------------- */
function rafraichir() {
  const zone = document.getElementById("app");
  zone.innerHTML = renderEDT();
  bindEDT();
}

/* ---------------------------------------------------
   À l'ouverture de la page : charger les classes
   --------------------------------------------------- */
export async function ouvrirEDT() {
  await chargerClasses();
  rafraichir();
}
