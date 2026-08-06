/* ===================================================
   ELIAN — Page Plan de classe
   Morceau 1 : la salle vue du dessus (mode portrait tablette).
   Disposition fixe fidèle au PDF, ajustable plus tard.
   =================================================== */

import { sb } from "./supabase.js";

// Ton tableau de codes de départ (rempli auto si la table est vide).
// "R" apparaissait 2 fois : la remarque négative devient "Rq".
const CODES_DEPART = [
  { code: "++", libelle: "a levé la main pour prendre la parole", valeur: 0.75 },
  { code: "+", libelle: "prise de parole pertinente sans être interrogé", valeur: 0.25 },
  { code: "-", libelle: "bavardage", valeur: -0.5 },
  { code: "Rt", libelle: "a rangé la salle de sa propre initiative", valeur: 0.75 },
  { code: "N", libelle: "a nettoyé la salle ou un espace", valeur: 0.75 },
  { code: "-Rt", libelle: "n'a pas rangé son poste", valeur: -0.75 },
  { code: "-N", libelle: "est parti en laissant son poste sale", valeur: -0.75 },
  { code: "C", libelle: "n'a pas repoussé sa chaise", valeur: -0.25 },
  { code: "D", libelle: "volontaire pour la distribution", valeur: 0.25 },
  { code: "R", libelle: "volontaire pour le ramassage", valeur: 0.25 },
  { code: "M", libelle: "a emprunté du matériel qu'il devait avoir", valeur: -0.5 },
  { code: "FR", libelle: "ne travaille pas sur cette séance", valeur: -0.5 },
  { code: "+FR", libelle: "refus de produire sur la séquence", valeur: -0.5 },
  { code: "Q", libelle: "pose des questions pour réaliser son travail", valeur: 0.5 },
  { code: "W", libelle: "chahute, empêche les autres de travailler", valeur: -1 },
  { code: "F", libelle: "utilise un fidget", valeur: 0 },
  { code: "Cq", libelle: "utilise un casque anti-bruit", valeur: 0 },
  { code: "É", libelle: "utilise des écouteurs", valeur: 0 },
  { code: "A", libelle: "absent", valeur: 0 },
  { code: "P", libelle: "punition", valeur: -0.15 },
  { code: "Rq", libelle: "remarque négative sur le comportement", valeur: -0.25 },
  { code: "PG", libelle: "punition générale (attitude du groupe)", valeur: -1 },
  { code: "Colle", libelle: "heure de colle", valeur: -1 },
];

// État
let anneeId = null;
let classes = [];
let classeChoisie = null; // { id, nom, prof_principal }
let eleves = [];          // élèves de la classe
let placements = new Map(); // siège -> élève (siège = "ilot:position")
let codes = [];           // le tableau de codes (depuis Supabase)

// Roulement affiché sur les objets tournants : objet -> [prénoms]
let rouleauObjets = { ballon: [], coussin: [], grise: [], blanche: [], colle: [] };
// Modales ouvertes
let modaleVocab = false;
let modaleCodes = false;
let menuEleve = null;       // élève dont le menu clic-long est ouvert
let noteEleve = null;       // élève dont la modale note libre est ouverte
let deplaceEleve = null;    // élève dont on choisit l'objet de déplacement
let absenceCouleur = {};    // eleve_id -> "bleu" | "rouge" | null

/* ---------------------------------------------------
   Disposition fixe de la salle (fidèle au PDF)
   Coordonnées en % de la largeur/hauteur d'une zone
   portrait. On ajustera finement plus tard.
   Les 9 îlots : 7 de 4 places, 2 de 2 places.
   --------------------------------------------------- */
/* Disposition fidèle à la salle réelle.
   y = 0 en HAUT (fond de classe), y élevé en BAS (front, tableau).
   3 colonnes : gauche ~6%, centre ~37%, droite ~68%.
   Du bas vers le haut :
     Rang 1 (bas, front) : poste à colle · tableau · bureau
     Rang 2 : îlot 4 · îlot 2 · îlot 4
     Rang 3 : îlot 4 · îlot 4 · îlot 4
     Rang 4 : îlot 4 · îlot 4 · îlot 2
     Rang 5 (haut, fond) : ballon+coussin · grise · blanche
*/
const ILOTS = [
  // Rang 4 (près du fond) — y le plus petit
  { id: "A", places: 4, x: 3,  y: 18 },
  { id: "B", places: 4, x: 36, y: 18 },
  { id: "C", places: 2, x: 69, y: 18 },
  // Rang 3 (milieu)
  { id: "D", places: 4, x: 3,  y: 40 },
  { id: "E", places: 4, x: 36, y: 40 },
  { id: "F", places: 4, x: 69, y: 40 },
  // Rang 2 (près du front)
  { id: "G", places: 4, x: 3,  y: 62 },
  { id: "H", places: 2, x: 36, y: 62 },
  { id: "I", places: 4, x: 69, y: 62 },
];

// Les objets de la salle.
const OBJETS = [
  // Rang 5 (tout en haut, le fond)
  { id: "ballon",  nom: "Ballon",  x: 6,  y: 3 },
  { id: "coussin", nom: "Coussin", x: 6,  y: 11 },
  { id: "grise",   nom: "Grise",   x: 37, y: 4 },
  { id: "blanche", nom: "Blanche", x: 68, y: 4 },
  // Rang 1 (tout en bas, le front de classe)
  { id: "colle",   nom: "Poste à colle", x: 6,  y: 84 },
  { id: "tableau", nom: "TABLEAU",       x: 37, y: 84 },
  { id: "bureau",  nom: "Bureau",        x: 68, y: 84 },
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

  await chargerCodes();
}

/* ---------------------------------------------------
   Charger les codes ; remplir automatiquement si vide
   --------------------------------------------------- */
async function chargerCodes() {
  const { data } = await sb.from("codes").select("id, code, libelle, valeur");
  if (data && data.length) {
    codes = data;
    return;
  }
  // Table vide : on insère les codes de départ, puis on relit
  await sb.from("codes").insert(CODES_DEPART);
  const { data: apres } = await sb.from("codes").select("id, code, libelle, valeur");
  codes = apres || [];
}

/* ---------------------------------------------------
   Poser un code sur un élève (vérifie qu'il existe)
   --------------------------------------------------- */
async function poserCode(eleve, texteSaisi) {
  // Le stylet transforme souvent "-" en "_" : on rétablit.
  const cherche = texteSaisi.trim().replace(/_/g, "-");
  // Comparaison souple (sans tenir compte de la casse/accent simple)
  const trouve = codes.find(
    (c) => c.code.toLowerCase() === cherche.toLowerCase()
  );
  if (!trouve) {
    return { ok: false, message: `Code "${cherche}" inconnu.` };
  }

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const { error } = await sb.from("annotations").insert([
    {
      eleve_id: eleve.id,
      code_id: trouve.id,
      date: aujourdhui,
    },
  ]);
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: `${trouve.code} posé sur ${eleve.prenom}.` };
}

/* ---------------------------------------------------
   Enregistrer une note libre de comportement
   (remonte dans le Suivi, avec la date)
   --------------------------------------------------- */
async function poserNote(eleve, texte) {
  const contenu = texte.trim();
  if (!contenu) return { ok: false, message: "Note vide." };

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const { error } = await sb.from("observations").insert([
    {
      eleve_id: eleve.id,
      texte: contenu,
      date: aujourdhui,
    },
  ]);
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: `Note enregistrée pour ${eleve.prenom}.` };
}

async function chargerEleves(classeId) {
  const { data } = await sb
    .from("eleves")
    .select("id, prenom, nom, genre, statut")
    .eq("classe_id", classeId)
    .order("nom");
  eleves = (data || []).filter((e) => e.statut !== "archivé");

  await chargerAbsencesRecentes();
  await chargerSequenceEnCours(classeId);

  // Placement : on remplit en partant du BAS (front de classe).
  // Les îlots du bas ont un "y" plus grand → on trie par y décroissant.
  placements = new Map();
  const ilotsDuBas = [...ILOTS].sort((a, b) => b.y - a.y);
  let i = 0;
  for (const ilot of ilotsDuBas) {
    for (let p = 0; p < ilot.places; p++) {
      if (i < eleves.length) {
        placements.set(`${ilot.id}:${p}`, eleves[i]);
        i++;
      }
    }
  }
}

/* ---------------------------------------------------
   Couleurs d'absence :
   bleu = absent la dernière séance,
   rouge = absent les 2 dernières (ou plus) d'affilée.
   Basé sur le code A dans les annotations.
   --------------------------------------------------- */
async function chargerAbsencesRecentes() {
  absenceCouleur = {};
  if (!eleves.length) return;

  const codeA = codes.find((c) => c.code === "A");
  if (!codeA) return;

  const ids = eleves.map((e) => e.id);

  // Les absences (code A) de ces élèves
  const { data: absA } = await sb
    .from("annotations")
    .select("eleve_id, date")
    .eq("code_id", codeA.id)
    .in("eleve_id", ids);

  // Les dates de séances distinctes (toutes annotations), récentes d'abord
  const { data: toutes } = await sb
    .from("annotations")
    .select("date")
    .in("eleve_id", ids)
    .order("date", { ascending: false });
  const datesSeances = [...new Set((toutes || []).map((r) => r.date))];

  const derniere = datesSeances[0];
  const avantDerniere = datesSeances[1];

  // Pour chaque élève : absent la dernière ? l'avant-dernière ?
  const absParEleve = {};
  (absA || []).forEach((a) => {
    (absParEleve[a.eleve_id] = absParEleve[a.eleve_id] || new Set()).add(a.date);
  });

  eleves.forEach((e) => {
    const set = absParEleve[e.id] || new Set();
    const absDerniere = derniere && set.has(derniere);
    const absAvant = avantDerniere && set.has(avantDerniere);
    if (absDerniere && absAvant) absenceCouleur[e.id] = "rouge";
    else if (absDerniere) absenceCouleur[e.id] = "bleu";
  });
}

/* ---------------------------------------------------
   Affichage d'un îlot (avec ses sièges)
   --------------------------------------------------- */
function afficherIlot(ilot) {
  const sieges = [];
  for (let p = 0; p < ilot.places; p++) {
    const eleve = placements.get(`${ilot.id}:${p}`);
    if (eleve) {
      const couleur = absenceCouleur[eleve.id]; // "bleu", "rouge" ou undefined
      const classeAbs = couleur ? ` siege-absent-${couleur}` : "";
      sieges.push(`
        <div class="siege${classeAbs}" data-eleve="${eleve.id}">
          <div class="siege-nom">${eleve.prenom}</div>
          <input type="text" class="siege-saisie" data-eleve="${eleve.id}"
                 aria-label="Écrire un code sur ${eleve.prenom}" />
        </div>
      `);
    } else {
      sieges.push(`<div class="siege siege-vide"></div>`);
    }
  }
  return `
    <div class="ilot ilot-${ilot.places}" style="left:${ilot.x}%; top:${ilot.y}%;">
      ${sieges.join("")}
    </div>
  `;
}

/* ---------------------------------------------------
   Évaluation de séquence
   --------------------------------------------------- */
let evalEleve = null;      // élève dont la modale d'éval est ouverte
let evalSequence = null;   // la séquence en cours
let evalCriteres = [];     // ses critères

// Trouver la séquence en cours de la classe (la plus récente pour l'instant)
async function chargerSequenceEnCours(classeId) {
  const { data: seqs } = await sb
    .from("sequences")
    .select("id, nom, date_debut")
    .eq("classe_id", classeId)
    .order("date_debut", { ascending: false })
    .limit(1);

  evalSequence = seqs && seqs.length ? seqs[0] : null;
  evalCriteres = [];

  if (evalSequence) {
    const { data: crit } = await sb
      .from("criteres_sequence")
      .select("id, libelle, bareme")
      .eq("sequence_id", evalSequence.id);
    evalCriteres = crit || [];
  }
}

// Enregistrer les notes saisies dans la modale
async function enregistrerEval(notesParCritere) {
  const lignes = [];
  for (const [critereId, note] of Object.entries(notesParCritere)) {
    if (note !== "" && note != null) {
      lignes.push({
        eleve_id: evalEleve.id,
        critere_id: critereId,
        note: Number(note),
      });
    }
  }
  if (!lignes.length) return { ok: true };
  const { error } = await sb.from("notes_sequence").insert(lignes);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/* ---------------------------------------------------
   La modale d'évaluation (barème de la séquence)
   --------------------------------------------------- */
function modaleEval() {
  if (!evalEleve) return "";

  if (!evalSequence) {
    return `
      <div class="modale-fond" id="evalFond">
        <div class="modale">
          <strong>Évaluation — ${evalEleve.prenom}</strong>
          <p class="hint">Aucune séquence en cours pour cette classe. Crée-la dans le Calendrier.</p>
          <button class="bouton-doux" id="evalFermer">Fermer</button>
        </div>
      </div>
    `;
  }

  const champs = evalCriteres.length
    ? evalCriteres
        .map(
          (c) => `
          <div class="ligne-critere">
            <label>${c.libelle} <span class="hint">/ ${c.bareme ?? "?"}</span></label>
            <input type="number" class="note-critere" data-critere="${c.id}" min="0" step="0.5">
          </div>`
        )
        .join("")
    : `<p class="hint">Cette séquence n'a pas encore de critères.</p>`;

  return `
    <div class="modale-fond" id="evalFond">
      <div class="modale">
        <strong>Évaluation — ${evalEleve.prenom}</strong>
        <p class="hint">Séquence : ${evalSequence.nom}</p>
        ${champs}
        <div id="evalMessage" class="status"></div>
        <div style="display:flex; gap:8px; margin-top:10px;">
          <button class="bouton" id="evalValider">Enregistrer</button>
          <button class="bouton-doux" id="evalFermer">Annuler</button>
        </div>
      </div>
    </div>
  `;
}

/* ---------------------------------------------------
   Traiter ce qui a été écrit sur un élève.
   - commence par ↳ (ou ->) : note libre
   - sinon : code
   --------------------------------------------------- */
async function traiterSaisie(eleve, texte) {
  const brut = (texte || "").trim();
  if (!brut) return null;

  // Détection de la flèche de note libre : ↳ ou -> au début
  const estNote = brut.startsWith("↳") || brut.startsWith("->");
  if (estNote) {
    const contenu = brut.replace(/^↳|^->/, "").trim();
    return await poserNote(eleve, contenu);
  }
  return await poserCode(eleve, brut);
}

/* ---------------------------------------------------
   Affichage d'un objet de la salle
   --------------------------------------------------- */
function afficherObjet(obj) {
  // Le tableau ouvre le vocabulaire (pas une zone de dépôt)
  if (obj.id === "tableau") {
    return `
      <div class="objet-salle objet-tableau" data-tableau="1"
           style="left:${obj.x}%; top:${obj.y}%;">
        ${obj.nom}
        <div class="objet-sous">vocabulaire</div>
      </div>
    `;
  }
  // Le bureau : rappel des codes
  if (obj.id === "bureau") {
    return `
      <div class="objet-salle objet-bureau" data-codes="1"
           style="left:${obj.x}%; top:${obj.y}%;">
        ${obj.nom}
        <div class="objet-sous">codes</div>
      </div>
    `;
  }

  // Objets tournants : zones de dépôt, avec les derniers élèves passés
  const estTournant = ["ballon", "coussin", "grise", "blanche", "colle"].includes(obj.id);
  const roulement = (rouleauObjets[obj.id] || [])
    .slice(-6)
    .map((n) => `<span class="roule-nom">${n}</span>`)
    .join("");

  return `
    <div class="objet-salle ${estTournant ? "objet-depot" : ""} objet-${obj.id}"
         data-objet="${obj.id}" style="left:${obj.x}%; top:${obj.y}%;">
      <div class="objet-titre">${obj.nom}</div>
      ${estTournant ? `<div class="objet-roulement">${roulement}</div>` : ""}
    </div>
  `;
}

/* ---------------------------------------------------
   Déposer un élève sur un objet tournant
   → enregistre une visite + met à jour le roulement affiché
   --------------------------------------------------- */
async function deposerSurObjet(eleveId, objetId) {
  const eleve = eleves.find((e) => e.id === eleveId);
  if (!eleve) return;

  // Mettre à jour l'affichage du roulement (file des derniers passés)
  if (rouleauObjets[objetId]) {
    rouleauObjets[objetId].push(eleve.prenom);
    if (rouleauObjets[objetId].length > 8) rouleauObjets[objetId].shift();
  }

  // Enregistrer la visite (si la table objets_tournants est remplie plus tard,
  // on reliera l'id ; pour l'instant on note la visite avec le type d'objet).
  const aujourdhui = new Date().toISOString().slice(0, 10);
  try {
    await sb.from("visites").insert([{
      eleve_id: eleveId,
      date: aujourdhui,
    }]);
  } catch (e) { /* la visite est surtout visuelle pour l'instant */ }
}

/* ---------------------------------------------------
   Modale vocabulaire (ouverte par le tableau)
   --------------------------------------------------- */
function afficherModaleVocab() {
  if (!modaleVocab) return "";
  return `
    <div class="modale-fond" id="vocabFond">
      <div class="modale">
        <strong>Vocabulaire du cours</strong>
        <p class="hint">Les mots vus aujourd'hui (un par ligne).</p>
        <textarea id="vocabTexte" rows="6" style="width:100%"></textarea>
        <div style="display:flex; gap:8px; margin-top:10px;">
          <button class="bouton" id="vocabValider">Enregistrer</button>
          <button class="bouton-doux" id="vocabFermer">Fermer</button>
        </div>
        <div id="vocabMsg" class="status"></div>
      </div>
    </div>
  `;
}

async function enregistrerVocab(texte) {
  const mots = texte.split("\n").map((m) => m.trim()).filter(Boolean);
  if (!mots.length || !classeChoisie) return;
  const lignes = mots.map((mot) => ({ classe_id: classeChoisie.id, mot }));
  await sb.from("vocabulaire").insert(lignes);
}

/* ---------------------------------------------------
   Modale rappel des codes (ouverte par le bureau)
   --------------------------------------------------- */
function afficherModaleCodes() {
  if (!modaleCodes) return "";
  const lignes = codes
    .map((c) => `<tr><td><strong>${c.code}</strong></td><td>${c.libelle || ""}</td><td>${c.valeur > 0 ? "+" : ""}${c.valeur}</td></tr>`)
    .join("");
  return `
    <div class="modale-fond" id="codesFond">
      <div class="modale modale-large">
        <strong>Rappel des codes</strong>
        <table class="grille-edt" style="margin-top:10px;">
          <tr><th>Code</th><th>Signification</th><th>Points</th></tr>
          ${lignes}
        </table>
        <button class="bouton-doux" id="codesFermer" style="margin-top:10px;">Fermer</button>
      </div>
    </div>
  `;
}

/* ---------------------------------------------------
   Menu clic-long : Déplacer / Évaluer / Note libre
   --------------------------------------------------- */
function afficherMenuEleve() {
  if (!menuEleve) return "";
  const eleve = eleves.find((e) => e.id === menuEleve);
  if (!eleve) return "";
  return `
    <div class="modale-fond" id="menuFond">
      <div class="modale modale-menu">
        <strong>${eleve.prenom} ${eleve.nom}</strong>
        <div class="menu-actions">
          <button class="bouton" data-action="deplacer">Déplacer</button>
          <button class="bouton" data-action="evaluer">Évaluer</button>
          <button class="bouton" data-action="note">Note libre</button>
          <button class="bouton-doux" data-action="fermer">Annuler</button>
        </div>
      </div>
    </div>
  `;
}

/* Choix de l'objet vers lequel déplacer l'élève */
function afficherChoixObjet() {
  if (!deplaceEleve) return "";
  const eleve = eleves.find((e) => e.id === deplaceEleve);
  const objets = [
    { id: "ballon", nom: "Ballon" },
    { id: "coussin", nom: "Coussin" },
    { id: "colle", nom: "Poste à colle" },
    { id: "grise", nom: "Table grise" },
    { id: "blanche", nom: "Table blanche" },
  ];
  const boutons = objets
    .map((o) => `<button class="bouton" data-objet-cible="${o.id}">${o.nom}</button>`)
    .join("");
  return `
    <div class="modale-fond" id="objetFond">
      <div class="modale modale-menu">
        <strong>Déplacer ${eleve ? eleve.prenom : ""} vers…</strong>
        <div class="menu-actions">
          ${boutons}
          <button class="bouton-doux" data-objet-cible="annuler">Annuler</button>
        </div>
      </div>
    </div>
  `;
}

/* Modale note libre */
function afficherModaleNote() {
  if (!noteEleve) return "";
  const eleve = eleves.find((e) => e.id === noteEleve);
  return `
    <div class="modale-fond" id="noteFond">
      <div class="modale">
        <strong>Note sur ${eleve ? eleve.prenom : ""}</strong>
        <p class="hint">Information libre (remonte dans le Suivi).</p>
        <textarea id="noteTexte" rows="4" style="width:100%"></textarea>
        <div style="display:flex; gap:8px; margin-top:10px;">
          <button class="bouton" id="noteValider">Enregistrer</button>
          <button class="bouton-doux" id="noteFermer">Annuler</button>
        </div>
      </div>
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
    ${modaleEval()}
    ${afficherModaleVocab()}
    ${afficherModaleCodes()}
    ${afficherMenuEleve()}
    ${afficherChoixObjet()}
    ${afficherModaleNote()}
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

  // Écriture directe sur chaque siège
  document.querySelectorAll(".siege-saisie[data-eleve]").forEach((champ) => {
    const traiter = async () => {
      const texte = champ.value;
      if (!texte.trim()) return;
      const eleve = eleves.find((el) => el.id === champ.dataset.eleve);
      const res = await traiterSaisie(eleve, texte);
      // Retour visuel bref, puis on vide le champ
      if (res && res.ok) {
        champ.value = "";
        champ.classList.add("saisie-ok");
        setTimeout(() => champ.classList.remove("saisie-ok"), 800);
      } else if (res) {
        champ.classList.add("saisie-erreur");
        setTimeout(() => champ.classList.remove("saisie-erreur"), 1200);
      }
    };

    // Validation : touche Entrée, ou quand on quitte le champ
    champ.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); traiter(); }
    });
    champ.addEventListener("blur", traiter);
  });

  // Clic long sur un élève → menu Déplacer / Évaluer / Note libre
  document.querySelectorAll(".siege[data-eleve]").forEach((siege) => {
    let timer = null;

    const demarrer = (e) => {
      timer = setTimeout(() => {
        timer = null;
        menuEleve = siege.dataset.eleve;   // ouvre le menu pour cet élève
        rafraichir();
      }, 500); // 0,5 s = clic long
    };
    const annuler = () => { if (timer) { clearTimeout(timer); timer = null; } };

    siege.addEventListener("pointerdown", demarrer);
    siege.addEventListener("pointerup", annuler);
    siege.addEventListener("pointerleave", annuler);
    siege.addEventListener("pointermove", annuler);
  });

  // Modale d'évaluation : fermer / enregistrer
  const evalFond = document.getElementById("evalFond");
  const evalFermer = document.getElementById("evalFermer");
  const evalValider = document.getElementById("evalValider");

  if (evalFermer) evalFermer.addEventListener("click", () => { evalEleve = null; rafraichir(); });
  if (evalFond) evalFond.addEventListener("click", (e) => {
    if (e.target === evalFond) { evalEleve = null; rafraichir(); }
  });

  if (evalValider) {
    evalValider.addEventListener("click", async () => {
      const notes = {};
      document.querySelectorAll(".note-critere").forEach((champ) => {
        notes[champ.dataset.critere] = champ.value;
      });
      const res = await enregistrerEval(notes);
      if (res.ok) { evalEleve = null; rafraichir(); }
      else document.getElementById("evalMessage").textContent = "❌ " + res.message;
    });
  }

  // --- Menu clic-long : les 3 actions ---
  const menuFond = document.getElementById("menuFond");
  if (menuFond) {
    menuFond.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        const id = menuEleve;
        menuEleve = null;
        if (action === "deplacer") deplaceEleve = id;
        else if (action === "evaluer") evalEleve = eleves.find((e) => e.id === id);
        else if (action === "note") noteEleve = id;
        rafraichir();
      });
    });
    menuFond.addEventListener("click", (e) => {
      if (e.target === menuFond) { menuEleve = null; rafraichir(); }
    });
  }

  // --- Choix de l'objet pour déplacer ---
  const objetFond = document.getElementById("objetFond");
  if (objetFond) {
    objetFond.querySelectorAll("[data-objet-cible]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const cible = btn.dataset.objetCible;
        const id = deplaceEleve;
        deplaceEleve = null;
        if (cible !== "annuler") await deposerSurObjet(id, cible);
        rafraichir();
      });
    });
  }

  // --- Modale note libre ---
  const noteValider = document.getElementById("noteValider");
  if (noteValider) {
    noteValider.addEventListener("click", async () => {
      const eleve = eleves.find((e) => e.id === noteEleve);
      await poserNote(eleve, document.getElementById("noteTexte").value);
      noteEleve = null;
      rafraichir();
    });
  }
  const noteFermer = document.getElementById("noteFermer");
  if (noteFermer) noteFermer.addEventListener("click", () => { noteEleve = null; rafraichir(); });

  // --- Tableau → modale vocabulaire ---
  const tableau = document.querySelector("[data-tableau]");
  if (tableau) tableau.addEventListener("click", () => { modaleVocab = true; rafraichir(); });

  const vocabFermer = document.getElementById("vocabFermer");
  if (vocabFermer) vocabFermer.addEventListener("click", () => { modaleVocab = false; rafraichir(); });
  const vocabValider = document.getElementById("vocabValider");
  if (vocabValider) vocabValider.addEventListener("click", async () => {
    await enregistrerVocab(document.getElementById("vocabTexte").value);
    modaleVocab = false; rafraichir();
  });

  // --- Bureau → modale rappel des codes ---
  const bureau = document.querySelector("[data-codes]");
  if (bureau) bureau.addEventListener("click", () => { modaleCodes = true; rafraichir(); });
  const codesFermer = document.getElementById("codesFermer");
  if (codesFermer) codesFermer.addEventListener("click", () => { modaleCodes = false; rafraichir(); });
}

/* ---------------------------------------------------
   Détecter si un tracé forme une boucle fermée
   (le dernier point revient près du premier)
   --------------------------------------------------- */
function estBoucle(points) {
  if (points.length < 8) return false; // trop court = pas un cercle
  const a = points[0];
  const b = points[points.length - 1];
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  // La boucle se referme si début et fin sont proches
  // et que le tracé a une certaine ampleur.
  let largeur = 0, hauteur = 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  points.forEach((p) => {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  });
  largeur = maxX - minX; hauteur = maxY - minY;
  return dist < 25 && largeur > 20 && hauteur > 20;
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
}/* ===================================================
   ELIAN — Page Plan de classe
   Morceau 1 : la salle vue du dessus (mode portrait tablette).
   Disposition fixe fidèle au PDF, ajustable plus tard.
   =================================================== */

import { sb } from "./supabase.js";

// Ton tableau de codes de départ (rempli auto si la table est vide).
// "R" apparaissait 2 fois : la remarque négative devient "Rq".
const CODES_DEPART = [
  { code: "++", libelle: "a levé la main pour prendre la parole", valeur: 0.75 },
  { code: "+", libelle: "prise de parole pertinente sans être interrogé", valeur: 0.25 },
  { code: "-", libelle: "bavardage", valeur: -0.5 },
  { code: "Rt", libelle: "a rangé la salle de sa propre initiative", valeur: 0.75 },
  { code: "N", libelle: "a nettoyé la salle ou un espace", valeur: 0.75 },
  { code: "-Rt", libelle: "n'a pas rangé son poste", valeur: -0.75 },
  { code: "-N", libelle: "est parti en laissant son poste sale", valeur: -0.75 },
  { code: "C", libelle: "n'a pas repoussé sa chaise", valeur: -0.25 },
  { code: "D", libelle: "volontaire pour la distribution", valeur: 0.25 },
  { code: "R", libelle: "volontaire pour le ramassage", valeur: 0.25 },
  { code: "M", libelle: "a emprunté du matériel qu'il devait avoir", valeur: -0.5 },
  { code: "FR", libelle: "ne travaille pas sur cette séance", valeur: -0.5 },
  { code: "+FR", libelle: "refus de produire sur la séquence", valeur: -0.5 },
  { code: "Q", libelle: "pose des questions pour réaliser son travail", valeur: 0.5 },
  { code: "W", libelle: "chahute, empêche les autres de travailler", valeur: -1 },
  { code: "F", libelle: "utilise un fidget", valeur: 0 },
  { code: "Cq", libelle: "utilise un casque anti-bruit", valeur: 0 },
  { code: "É", libelle: "utilise des écouteurs", valeur: 0 },
  { code: "A", libelle: "absent", valeur: 0 },
  { code: "P", libelle: "punition", valeur: -0.15 },
  { code: "Rq", libelle: "remarque négative sur le comportement", valeur: -0.25 },
  { code: "PG", libelle: "punition générale (attitude du groupe)", valeur: -1 },
  { code: "Colle", libelle: "heure de colle", valeur: -1 },
];

// État
let anneeId = null;
let classes = [];
let classeChoisie = null; // { id, nom, prof_principal }
let eleves = [];          // élèves de la classe
let placements = new Map(); // siège -> élève (siège = "ilot:position")
let codes = [];           // le tableau de codes (depuis Supabase)

// Roulement affiché sur les objets tournants : objet -> [prénoms]
let rouleauObjets = { ballon: [], coussin: [], grise: [], blanche: [], colle: [] };
// Modales ouvertes
let modaleVocab = false;
let modaleCodes = false;
let menuEleve = null;       // élève dont le menu clic-long est ouvert
let noteEleve = null;       // élève dont la modale note libre est ouverte
let deplaceEleve = null;    // élève dont on choisit l'objet de déplacement
let absenceCouleur = {};    // eleve_id -> "bleu" | "rouge" | null

/* ---------------------------------------------------
   Disposition fixe de la salle (fidèle au PDF)
   Coordonnées en % de la largeur/hauteur d'une zone
   portrait. On ajustera finement plus tard.
   Les 9 îlots : 7 de 4 places, 2 de 2 places.
   --------------------------------------------------- */
/* Disposition fidèle à la salle réelle.
   y = 0 en HAUT (fond de classe), y élevé en BAS (front, tableau).
   3 colonnes : gauche ~6%, centre ~37%, droite ~68%.
   Du bas vers le haut :
     Rang 1 (bas, front) : poste à colle · tableau · bureau
     Rang 2 : îlot 4 · îlot 2 · îlot 4
     Rang 3 : îlot 4 · îlot 4 · îlot 4
     Rang 4 : îlot 4 · îlot 4 · îlot 2
     Rang 5 (haut, fond) : ballon+coussin · grise · blanche
*/
const ILOTS = [
  // Rang 4 (près du fond) — y le plus petit
  { id: "A", places: 4, x: 6,  y: 20 },
  { id: "B", places: 4, x: 37, y: 20 },
  { id: "C", places: 2, x: 68, y: 20 },
  // Rang 3 (milieu)
  { id: "D", places: 4, x: 6,  y: 40 },
  { id: "E", places: 4, x: 37, y: 40 },
  { id: "F", places: 4, x: 68, y: 40 },
  // Rang 2 (près du front)
  { id: "G", places: 4, x: 6,  y: 60 },
  { id: "H", places: 2, x: 37, y: 60 },
  { id: "I", places: 4, x: 68, y: 60 },
];

// Les objets de la salle.
const OBJETS = [
  // Rang 5 (tout en haut, le fond)
  { id: "ballon",  nom: "Ballon",  x: 6,  y: 3 },
  { id: "coussin", nom: "Coussin", x: 6,  y: 11 },
  { id: "grise",   nom: "Grise",   x: 37, y: 4 },
  { id: "blanche", nom: "Blanche", x: 68, y: 4 },
  // Rang 1 (tout en bas, le front de classe)
  { id: "colle",   nom: "Poste à colle", x: 6,  y: 84 },
  { id: "tableau", nom: "TABLEAU",       x: 37, y: 84 },
  { id: "bureau",  nom: "Bureau",        x: 68, y: 84 },
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

  await chargerCodes();
}

/* ---------------------------------------------------
   Charger les codes ; remplir automatiquement si vide
   --------------------------------------------------- */
async function chargerCodes() {
  const { data } = await sb.from("codes").select("id, code, libelle, valeur");
  if (data && data.length) {
    codes = data;
    return;
  }
  // Table vide : on insère les codes de départ, puis on relit
  await sb.from("codes").insert(CODES_DEPART);
  const { data: apres } = await sb.from("codes").select("id, code, libelle, valeur");
  codes = apres || [];
}

/* ---------------------------------------------------
   Poser un code sur un élève (vérifie qu'il existe)
   --------------------------------------------------- */
async function poserCode(eleve, texteSaisi) {
  // Le stylet transforme souvent "-" en "_" : on rétablit.
  const cherche = texteSaisi.trim().replace(/_/g, "-");
  // Comparaison souple (sans tenir compte de la casse/accent simple)
  const trouve = codes.find(
    (c) => c.code.toLowerCase() === cherche.toLowerCase()
  );
  if (!trouve) {
    return { ok: false, message: `Code "${cherche}" inconnu.` };
  }

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const { error } = await sb.from("annotations").insert([
    {
      eleve_id: eleve.id,
      code_id: trouve.id,
      date: aujourdhui,
    },
  ]);
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: `${trouve.code} posé sur ${eleve.prenom}.` };
}

/* ---------------------------------------------------
   Enregistrer une note libre de comportement
   (remonte dans le Suivi, avec la date)
   --------------------------------------------------- */
async function poserNote(eleve, texte) {
  const contenu = texte.trim();
  if (!contenu) return { ok: false, message: "Note vide." };

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const { error } = await sb.from("observations").insert([
    {
      eleve_id: eleve.id,
      texte: contenu,
      date: aujourdhui,
    },
  ]);
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: `Note enregistrée pour ${eleve.prenom}.` };
}

async function chargerEleves(classeId) {
  const { data } = await sb
    .from("eleves")
    .select("id, prenom, nom, genre, statut")
    .eq("classe_id", classeId)
    .order("nom");
  eleves = (data || []).filter((e) => e.statut !== "archivé");

  await chargerAbsencesRecentes();
  await chargerSequenceEnCours(classeId);

  // Placement : on remplit en partant du BAS (front de classe).
  // Les îlots du bas ont un "y" plus grand → on trie par y décroissant.
  placements = new Map();
  const ilotsDuBas = [...ILOTS].sort((a, b) => b.y - a.y);
  let i = 0;
  for (const ilot of ilotsDuBas) {
    for (let p = 0; p < ilot.places; p++) {
      if (i < eleves.length) {
        placements.set(`${ilot.id}:${p}`, eleves[i]);
        i++;
      }
    }
  }
}

/* ---------------------------------------------------
   Couleurs d'absence :
   bleu = absent la dernière séance,
   rouge = absent les 2 dernières (ou plus) d'affilée.
   Basé sur le code A dans les annotations.
   --------------------------------------------------- */
async function chargerAbsencesRecentes() {
  absenceCouleur = {};
  if (!eleves.length) return;

  const codeA = codes.find((c) => c.code === "A");
  if (!codeA) return;

  const ids = eleves.map((e) => e.id);

  // Les absences (code A) de ces élèves
  const { data: absA } = await sb
    .from("annotations")
    .select("eleve_id, date")
    .eq("code_id", codeA.id)
    .in("eleve_id", ids);

  // Les dates de séances distinctes (toutes annotations), récentes d'abord
  const { data: toutes } = await sb
    .from("annotations")
    .select("date")
    .in("eleve_id", ids)
    .order("date", { ascending: false });
  const datesSeances = [...new Set((toutes || []).map((r) => r.date))];

  const derniere = datesSeances[0];
  const avantDerniere = datesSeances[1];

  // Pour chaque élève : absent la dernière ? l'avant-dernière ?
  const absParEleve = {};
  (absA || []).forEach((a) => {
    (absParEleve[a.eleve_id] = absParEleve[a.eleve_id] || new Set()).add(a.date);
  });

  eleves.forEach((e) => {
    const set = absParEleve[e.id] || new Set();
    const absDerniere = derniere && set.has(derniere);
    const absAvant = avantDerniere && set.has(avantDerniere);
    if (absDerniere && absAvant) absenceCouleur[e.id] = "rouge";
    else if (absDerniere) absenceCouleur[e.id] = "bleu";
  });
}

/* ---------------------------------------------------
   Affichage d'un îlot (avec ses sièges)
   --------------------------------------------------- */
function afficherIlot(ilot) {
  const sieges = [];
  for (let p = 0; p < ilot.places; p++) {
    const eleve = placements.get(`${ilot.id}:${p}`);
    if (eleve) {
      const couleur = absenceCouleur[eleve.id]; // "bleu", "rouge" ou undefined
      const classeAbs = couleur ? ` siege-absent-${couleur}` : "";
      sieges.push(`
        <div class="siege${classeAbs}" data-eleve="${eleve.id}">
          <div class="siege-nom">${eleve.prenom}</div>
          <input type="text" class="siege-saisie" data-eleve="${eleve.id}"
                 aria-label="Écrire un code sur ${eleve.prenom}" />
        </div>
      `);
    } else {
      sieges.push(`<div class="siege siege-vide"></div>`);
    }
  }
  return `
    <div class="ilot ilot-${ilot.places}" style="left:${ilot.x}%; top:${ilot.y}%;">
      ${sieges.join("")}
    </div>
  `;
}

/* ---------------------------------------------------
   Évaluation de séquence
   --------------------------------------------------- */
let evalEleve = null;      // élève dont la modale d'éval est ouverte
let evalSequence = null;   // la séquence en cours
let evalCriteres = [];     // ses critères

// Trouver la séquence en cours de la classe (la plus récente pour l'instant)
async function chargerSequenceEnCours(classeId) {
  const { data: seqs } = await sb
    .from("sequences")
    .select("id, nom, date_debut")
    .eq("classe_id", classeId)
    .order("date_debut", { ascending: false })
    .limit(1);

  evalSequence = seqs && seqs.length ? seqs[0] : null;
  evalCriteres = [];

  if (evalSequence) {
    const { data: crit } = await sb
      .from("criteres_sequence")
      .select("id, libelle, bareme")
      .eq("sequence_id", evalSequence.id);
    evalCriteres = crit || [];
  }
}

// Enregistrer les notes saisies dans la modale
async function enregistrerEval(notesParCritere) {
  const lignes = [];
  for (const [critereId, note] of Object.entries(notesParCritere)) {
    if (note !== "" && note != null) {
      lignes.push({
        eleve_id: evalEleve.id,
        critere_id: critereId,
        note: Number(note),
      });
    }
  }
  if (!lignes.length) return { ok: true };
  const { error } = await sb.from("notes_sequence").insert(lignes);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/* ---------------------------------------------------
   La modale d'évaluation (barème de la séquence)
   --------------------------------------------------- */
function modaleEval() {
  if (!evalEleve) return "";

  if (!evalSequence) {
    return `
      <div class="modale-fond" id="evalFond">
        <div class="modale">
          <strong>Évaluation — ${evalEleve.prenom}</strong>
          <p class="hint">Aucune séquence en cours pour cette classe. Crée-la dans le Calendrier.</p>
          <button class="bouton-doux" id="evalFermer">Fermer</button>
        </div>
      </div>
    `;
  }

  const champs = evalCriteres.length
    ? evalCriteres
        .map(
          (c) => `
          <div class="ligne-critere">
            <label>${c.libelle} <span class="hint">/ ${c.bareme ?? "?"}</span></label>
            <input type="number" class="note-critere" data-critere="${c.id}" min="0" step="0.5">
          </div>`
        )
        .join("")
    : `<p class="hint">Cette séquence n'a pas encore de critères.</p>`;

  return `
    <div class="modale-fond" id="evalFond">
      <div class="modale">
        <strong>Évaluation — ${evalEleve.prenom}</strong>
        <p class="hint">Séquence : ${evalSequence.nom}</p>
        ${champs}
        <div id="evalMessage" class="status"></div>
        <div style="display:flex; gap:8px; margin-top:10px;">
          <button class="bouton" id="evalValider">Enregistrer</button>
          <button class="bouton-doux" id="evalFermer">Annuler</button>
        </div>
      </div>
    </div>
  `;
}

/* ---------------------------------------------------
   Traiter ce qui a été écrit sur un élève.
   - commence par ↳ (ou ->) : note libre
   - sinon : code
   --------------------------------------------------- */
async function traiterSaisie(eleve, texte) {
  const brut = (texte || "").trim();
  if (!brut) return null;

  // Détection de la flèche de note libre : ↳ ou -> au début
  const estNote = brut.startsWith("↳") || brut.startsWith("->");
  if (estNote) {
    const contenu = brut.replace(/^↳|^->/, "").trim();
    return await poserNote(eleve, contenu);
  }
  return await poserCode(eleve, brut);
}

/* ---------------------------------------------------
   Affichage d'un objet de la salle
   --------------------------------------------------- */
function afficherObjet(obj) {
  // Le tableau ouvre le vocabulaire (pas une zone de dépôt)
  if (obj.id === "tableau") {
    return `
      <div class="objet-salle objet-tableau" data-tableau="1"
           style="left:${obj.x}%; top:${obj.y}%;">
        ${obj.nom}
        <div class="objet-sous">vocabulaire</div>
      </div>
    `;
  }
  // Le bureau : rappel des codes
  if (obj.id === "bureau") {
    return `
      <div class="objet-salle objet-bureau" data-codes="1"
           style="left:${obj.x}%; top:${obj.y}%;">
        ${obj.nom}
        <div class="objet-sous">codes</div>
      </div>
    `;
  }

  // Objets tournants : zones de dépôt, avec les derniers élèves passés
  const estTournant = ["ballon", "coussin", "grise", "blanche", "colle"].includes(obj.id);
  const roulement = (rouleauObjets[obj.id] || [])
    .slice(-6)
    .map((n) => `<span class="roule-nom">${n}</span>`)
    .join("");

  return `
    <div class="objet-salle ${estTournant ? "objet-depot" : ""} objet-${obj.id}"
         data-objet="${obj.id}" style="left:${obj.x}%; top:${obj.y}%;">
      <div class="objet-titre">${obj.nom}</div>
      ${estTournant ? `<div class="objet-roulement">${roulement}</div>` : ""}
    </div>
  `;
}

/* ---------------------------------------------------
   Déposer un élève sur un objet tournant
   → enregistre une visite + met à jour le roulement affiché
   --------------------------------------------------- */
async function deposerSurObjet(eleveId, objetId) {
  const eleve = eleves.find((e) => e.id === eleveId);
  if (!eleve) return;

  // Mettre à jour l'affichage du roulement (file des derniers passés)
  if (rouleauObjets[objetId]) {
    rouleauObjets[objetId].push(eleve.prenom);
    if (rouleauObjets[objetId].length > 8) rouleauObjets[objetId].shift();
  }

  // Enregistrer la visite (si la table objets_tournants est remplie plus tard,
  // on reliera l'id ; pour l'instant on note la visite avec le type d'objet).
  const aujourdhui = new Date().toISOString().slice(0, 10);
  try {
    await sb.from("visites").insert([{
      eleve_id: eleveId,
      date: aujourdhui,
    }]);
  } catch (e) { /* la visite est surtout visuelle pour l'instant */ }
}

/* ---------------------------------------------------
   Modale vocabulaire (ouverte par le tableau)
   --------------------------------------------------- */
function afficherModaleVocab() {
  if (!modaleVocab) return "";
  return `
    <div class="modale-fond" id="vocabFond">
      <div class="modale">
        <strong>Vocabulaire du cours</strong>
        <p class="hint">Les mots vus aujourd'hui (un par ligne).</p>
        <textarea id="vocabTexte" rows="6" style="width:100%"></textarea>
        <div style="display:flex; gap:8px; margin-top:10px;">
          <button class="bouton" id="vocabValider">Enregistrer</button>
          <button class="bouton-doux" id="vocabFermer">Fermer</button>
        </div>
        <div id="vocabMsg" class="status"></div>
      </div>
    </div>
  `;
}

async function enregistrerVocab(texte) {
  const mots = texte.split("\n").map((m) => m.trim()).filter(Boolean);
  if (!mots.length || !classeChoisie) return;
  const lignes = mots.map((mot) => ({ classe_id: classeChoisie.id, mot }));
  await sb.from("vocabulaire").insert(lignes);
}

/* ---------------------------------------------------
   Modale rappel des codes (ouverte par le bureau)
   --------------------------------------------------- */
function afficherModaleCodes() {
  if (!modaleCodes) return "";
  const lignes = codes
    .map((c) => `<tr><td><strong>${c.code}</strong></td><td>${c.libelle || ""}</td><td>${c.valeur > 0 ? "+" : ""}${c.valeur}</td></tr>`)
    .join("");
  return `
    <div class="modale-fond" id="codesFond">
      <div class="modale modale-large">
        <strong>Rappel des codes</strong>
        <table class="grille-edt" style="margin-top:10px;">
          <tr><th>Code</th><th>Signification</th><th>Points</th></tr>
          ${lignes}
        </table>
        <button class="bouton-doux" id="codesFermer" style="margin-top:10px;">Fermer</button>
      </div>
    </div>
  `;
}

/* ---------------------------------------------------
   Menu clic-long : Déplacer / Évaluer / Note libre
   --------------------------------------------------- */
function afficherMenuEleve() {
  if (!menuEleve) return "";
  const eleve = eleves.find((e) => e.id === menuEleve);
  if (!eleve) return "";
  return `
    <div class="modale-fond" id="menuFond">
      <div class="modale modale-menu">
        <strong>${eleve.prenom} ${eleve.nom}</strong>
        <div class="menu-actions">
          <button class="bouton" data-action="deplacer">Déplacer</button>
          <button class="bouton" data-action="evaluer">Évaluer</button>
          <button class="bouton" data-action="note">Note libre</button>
          <button class="bouton-doux" data-action="fermer">Annuler</button>
        </div>
      </div>
    </div>
  `;
}

/* Choix de l'objet vers lequel déplacer l'élève */
function afficherChoixObjet() {
  if (!deplaceEleve) return "";
  const eleve = eleves.find((e) => e.id === deplaceEleve);
  const objets = [
    { id: "ballon", nom: "Ballon" },
    { id: "coussin", nom: "Coussin" },
    { id: "colle", nom: "Poste à colle" },
    { id: "grise", nom: "Table grise" },
    { id: "blanche", nom: "Table blanche" },
  ];
  const boutons = objets
    .map((o) => `<button class="bouton" data-objet-cible="${o.id}">${o.nom}</button>`)
    .join("");
  return `
    <div class="modale-fond" id="objetFond">
      <div class="modale modale-menu">
        <strong>Déplacer ${eleve ? eleve.prenom : ""} vers…</strong>
        <div class="menu-actions">
          ${boutons}
          <button class="bouton-doux" data-objet-cible="annuler">Annuler</button>
        </div>
      </div>
    </div>
  `;
}

/* Modale note libre */
function afficherModaleNote() {
  if (!noteEleve) return "";
  const eleve = eleves.find((e) => e.id === noteEleve);
  return `
    <div class="modale-fond" id="noteFond">
      <div class="modale">
        <strong>Note sur ${eleve ? eleve.prenom : ""}</strong>
        <p class="hint">Information libre (remonte dans le Suivi).</p>
        <textarea id="noteTexte" rows="4" style="width:100%"></textarea>
        <div style="display:flex; gap:8px; margin-top:10px;">
          <button class="bouton" id="noteValider">Enregistrer</button>
          <button class="bouton-doux" id="noteFermer">Annuler</button>
        </div>
      </div>
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
    ${modaleEval()}
    ${afficherModaleVocab()}
    ${afficherModaleCodes()}
    ${afficherMenuEleve()}
    ${afficherChoixObjet()}
    ${afficherModaleNote()}
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

  // Écriture directe sur chaque siège
  document.querySelectorAll(".siege-saisie[data-eleve]").forEach((champ) => {
    const traiter = async () => {
      const texte = champ.value;
      if (!texte.trim()) return;
      const eleve = eleves.find((el) => el.id === champ.dataset.eleve);
      const res = await traiterSaisie(eleve, texte);
      // Retour visuel bref, puis on vide le champ
      if (res && res.ok) {
        champ.value = "";
        champ.classList.add("saisie-ok");
        setTimeout(() => champ.classList.remove("saisie-ok"), 800);
      } else if (res) {
        champ.classList.add("saisie-erreur");
        setTimeout(() => champ.classList.remove("saisie-erreur"), 1200);
      }
    };

    // Validation : touche Entrée, ou quand on quitte le champ
    champ.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); traiter(); }
    });
    champ.addEventListener("blur", traiter);
  });

  // Clic long sur un élève → menu Déplacer / Évaluer / Note libre
  document.querySelectorAll(".siege[data-eleve]").forEach((siege) => {
    let timer = null;

    const demarrer = (e) => {
      timer = setTimeout(() => {
        timer = null;
        menuEleve = siege.dataset.eleve;   // ouvre le menu pour cet élève
        rafraichir();
      }, 500); // 0,5 s = clic long
    };
    const annuler = () => { if (timer) { clearTimeout(timer); timer = null; } };

    siege.addEventListener("pointerdown", demarrer);
    siege.addEventListener("pointerup", annuler);
    siege.addEventListener("pointerleave", annuler);
    siege.addEventListener("pointermove", annuler);
  });

  // Modale d'évaluation : fermer / enregistrer
  const evalFond = document.getElementById("evalFond");
  const evalFermer = document.getElementById("evalFermer");
  const evalValider = document.getElementById("evalValider");

  if (evalFermer) evalFermer.addEventListener("click", () => { evalEleve = null; rafraichir(); });
  if (evalFond) evalFond.addEventListener("click", (e) => {
    if (e.target === evalFond) { evalEleve = null; rafraichir(); }
  });

  if (evalValider) {
    evalValider.addEventListener("click", async () => {
      const notes = {};
      document.querySelectorAll(".note-critere").forEach((champ) => {
        notes[champ.dataset.critere] = champ.value;
      });
      const res = await enregistrerEval(notes);
      if (res.ok) { evalEleve = null; rafraichir(); }
      else document.getElementById("evalMessage").textContent = "❌ " + res.message;
    });
  }

  // --- Menu clic-long : les 3 actions ---
  const menuFond = document.getElementById("menuFond");
  if (menuFond) {
    menuFond.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        const id = menuEleve;
        menuEleve = null;
        if (action === "deplacer") deplaceEleve = id;
        else if (action === "evaluer") evalEleve = eleves.find((e) => e.id === id);
        else if (action === "note") noteEleve = id;
        rafraichir();
      });
    });
    menuFond.addEventListener("click", (e) => {
      if (e.target === menuFond) { menuEleve = null; rafraichir(); }
    });
  }

  // --- Choix de l'objet pour déplacer ---
  const objetFond = document.getElementById("objetFond");
  if (objetFond) {
    objetFond.querySelectorAll("[data-objet-cible]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const cible = btn.dataset.objetCible;
        const id = deplaceEleve;
        deplaceEleve = null;
        if (cible !== "annuler") await deposerSurObjet(id, cible);
        rafraichir();
      });
    });
  }

  // --- Modale note libre ---
  const noteValider = document.getElementById("noteValider");
  if (noteValider) {
    noteValider.addEventListener("click", async () => {
      const eleve = eleves.find((e) => e.id === noteEleve);
      await poserNote(eleve, document.getElementById("noteTexte").value);
      noteEleve = null;
      rafraichir();
    });
  }
  const noteFermer = document.getElementById("noteFermer");
  if (noteFermer) noteFermer.addEventListener("click", () => { noteEleve = null; rafraichir(); });

  // --- Tableau → modale vocabulaire ---
  const tableau = document.querySelector("[data-tableau]");
  if (tableau) tableau.addEventListener("click", () => { modaleVocab = true; rafraichir(); });

  const vocabFermer = document.getElementById("vocabFermer");
  if (vocabFermer) vocabFermer.addEventListener("click", () => { modaleVocab = false; rafraichir(); });
  const vocabValider = document.getElementById("vocabValider");
  if (vocabValider) vocabValider.addEventListener("click", async () => {
    await enregistrerVocab(document.getElementById("vocabTexte").value);
    modaleVocab = false; rafraichir();
  });

  // --- Bureau → modale rappel des codes ---
  const bureau = document.querySelector("[data-codes]");
  if (bureau) bureau.addEventListener("click", () => { modaleCodes = true; rafraichir(); });
  const codesFermer = document.getElementById("codesFermer");
  if (codesFermer) codesFermer.addEventListener("click", () => { modaleCodes = false; rafraichir(); });
}

/* ---------------------------------------------------
   Détecter si un tracé forme une boucle fermée
   (le dernier point revient près du premier)
   --------------------------------------------------- */
function estBoucle(points) {
  if (points.length < 8) return false; // trop court = pas un cercle
  const a = points[0];
  const b = points[points.length - 1];
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  // La boucle se referme si début et fin sont proches
  // et que le tracé a une certaine ampleur.
  let largeur = 0, hauteur = 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  points.forEach((p) => {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  });
  largeur = maxX - minX; hauteur = maxY - minY;
  return dist < 25 && largeur > 20 && hauteur > 20;
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
