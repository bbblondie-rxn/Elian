/* ===================================================
   ELIAN — Page Plan de classe
   Morceau 1 : la salle vue du dessus (mode portrait tablette).
   Disposition fixe fidèle au PDF, ajustable plus tard.
   =================================================== */

import { sb } from "../supabase.js";

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
  { code: "T", libelle: "utilise une table haute", valeur: 0 },
  { code: "F", libelle: "utilise un fidget", valeur: 0 },
  { code: "B", libelle: "utilise un ballon", valeur: 0 },
  { code: "BC", libelle: "utilise un coussin", valeur: 0 },
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
  const cherche = texteSaisi.trim();
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

  await chargerSequenceEnCours(classeId);

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
    if (eleve) {
      sieges.push(`
        <div class="siege" data-eleve="${eleve.id}">
          <div class="siege-nom">${eleve.prenom}</div>
          <input type="text" class="siege-saisie" data-eleve="${eleve.id}"
                 placeholder="code ou ↳ note" />
          <canvas class="siege-dessin" data-eleve="${eleve.id}"></canvas>
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
    ${modaleEval()}
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

  // Détection d'entourage sur chaque siège (canvas transparent)
  document.querySelectorAll(".siege-dessin[data-eleve]").forEach((canvas) => {
    let points = [];
    let dessine = false;

    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      const p = e.touches ? e.touches[0] : e;
      return { x: p.clientX - r.left, y: p.clientY - r.top };
    };

    const debut = (e) => { dessine = true; points = [pos(e)]; };
    const bouge = (e) => { if (dessine) points.push(pos(e)); };
    const fin = () => {
      if (!dessine) return;
      dessine = false;
      if (estBoucle(points)) {
        // Entourage détecté → ouvrir l'évaluation
        evalEleve = eleves.find((el) => el.id === canvas.dataset.eleve);
        rafraichir();
      }
      points = [];
    };

    canvas.addEventListener("pointerdown", debut);
    canvas.addEventListener("pointermove", bouge);
    canvas.addEventListener("pointerup", fin);
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
