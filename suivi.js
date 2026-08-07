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

  await chargerStats();
}

/* ---------------------------------------------------
   Calculer, pour chaque élève :
   - la note d'engagement du mois (10 + somme des points du mois)
   - le nombre d'absences (code A) sur l'année
   --------------------------------------------------- */
let statsEleves = {}; // eleve_id -> { note, absences }

async function chargerStats() {
  statsEleves = {};
  if (!eleves.length) return;

  const ids = eleves.map((e) => e.id);

  // Charger les codes (pour connaître valeur + repérer le code A)
  const { data: codes } = await sb.from("codes").select("id, code, valeur");
  const valeurParId = new Map((codes || []).map((c) => [c.id, c.valeur || 0]));
  const codeAId = (codes || []).find((c) => c.code === "A")?.id;

  // Le mois en cours (AAAA-MM)
  const moisCourant = new Date().toISOString().slice(0, 7);

  // Toutes les annotations des élèves
  const { data: annots } = await sb
    .from("annotations")
    .select("eleve_id, code_id, date")
    .in("eleve_id", ids);

  // Initialiser
  eleves.forEach((e) => { statsEleves[e.id] = { note: 10, absences: 0 }; });

  (annots || []).forEach((a) => {
    const st = statsEleves[a.eleve_id];
    if (!st) return;
    // Note d'engagement : points du mois en cours
    if (a.date && a.date.slice(0, 7) === moisCourant) {
      st.note += valeurParId.get(a.code_id) || 0;
    }
    // Absences : code A sur toute l'année
    if (codeAId && a.code_id === codeAId) {
      st.absences += 1;
    }
  });
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
        <p class="hint">Note d'engagement du mois : 10 + somme des points des codes du mois.</p>
        <table class="grille-edt">
          <tr><th>Élève</th><th>Note du mois</th></tr>
          ${eleves.map((e) => {
            const note = statsEleves[e.id] ? statsEleves[e.id].note : 10;
            return `<tr><td>${e.prenom} ${e.nom}</td><td>${note.toFixed(2).replace(".", ",")}</td></tr>`;
          }).join("")}
        </table>
      </div>
    `;
  }

  if (ongletActif === "absences") {
    return `
      <div class="carte">
        <p class="hint">Nombre d'absences (code A posé dans le Plan).</p>
        <table class="grille-edt">
          <tr><th>Élève</th><th>Absences</th></tr>
          ${eleves.map((e) => {
            const abs = statsEleves[e.id] ? statsEleves[e.id].absences : 0;
            return `<tr><td>${e.prenom} ${e.nom}</td><td>${abs}</td></tr>`;
          }).join("")}
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
