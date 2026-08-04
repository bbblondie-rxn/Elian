/* ===================================================
   ELIAN — Page Calendrier
   Morceau 1 : créer et remplir une séquence.
   (Pose sur le calendrier et vues : morceaux suivants.)
   =================================================== */

import { sb } from "./supabase.js";

// État
let anneeId = null;
let classes = [];
let sequences = [];        // les séquences existantes
let sequenceOuverte = null; // la séquence en cours d'édition (détail)
let criteres = [];         // critères de la séquence ouverte
let seances = [];          // séances de la séquence ouverte

// Vue planning (prévu/réel)
let vuePlanning = false;       // affiche-t-on la vue planning ?
let planningClasse = null;     // classe choisie pour le planning
let planningLignes = [];       // les lignes du planning
let afficherReel = false;      // interrupteur prévu / réel

/* ---------------------------------------------------
   Chargement
   --------------------------------------------------- */
async function chargerBase() {
  const { data: annee } = await sb
    .from("annees")
    .select("id")
    .eq("active", true)
    .maybeSingle();
  if (!annee) { anneeId = null; classes = []; sequences = []; return; }
  anneeId = annee.id;

  const { data: cls } = await sb
    .from("classes")
    .select("id, nom")
    .eq("annee_id", anneeId)
    .order("nom");
  classes = cls || [];

  await chargerSequences();
}

async function chargerSequences() {
  const { data } = await sb
    .from("sequences")
    .select("id, nom, niveau, classe_id, date_debut, date_fin")
    .order("date_debut", { ascending: false });
  sequences = data || [];
}

async function ouvrirSequence(id) {
  const { data: seq } = await sb
    .from("sequences")
    .select("id, nom, niveau, classe_id, date_debut, date_fin, vocabulaire")
    .eq("id", id)
    .maybeSingle();
  sequenceOuverte = seq || null;

  if (sequenceOuverte) {
    const { data: crit } = await sb
      .from("criteres_sequence")
      .select("id, libelle, bareme")
      .eq("sequence_id", id);
    criteres = crit || [];

    const { data: seas } = await sb
      .from("seances")
      .select("id, numero, objectif, minutage, date, creneau")
      .eq("sequence_id", id)
      .order("numero");
    seances = seas || [];
  }
}

/* ---------------------------------------------------
   Créer une séquence (cadre de base + séances vides)
   --------------------------------------------------- */
async function creerSequence(donnees) {
  // donnees : { nom, cible, dateDebut, dateFin, nbSeances }
  // cible = "6" / "5" / "4" / "3" (niveau) ou "classe:<id>"
  let niveau = null;
  let classe_id = null;
  if (donnees.cible.startsWith("classe:")) {
    classe_id = donnees.cible.split(":")[1];
  } else {
    niveau = donnees.cible;
  }

  const { data: seq, error } = await sb
    .from("sequences")
    .insert([{
      nom: donnees.nom,
      niveau,
      classe_id,
      date_debut: donnees.dateDebut || null,
      date_fin: donnees.dateFin || null,
    }])
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  // Créer les séances vides (numérotées)
  const nb = parseInt(donnees.nbSeances) || 1;
  const lignes = [];
  for (let i = 1; i <= nb; i++) {
    lignes.push({ sequence_id: seq.id, numero: i });
  }
  await sb.from("seances").insert(lignes);

  return seq.id;
}

/* ---------------------------------------------------
   Ajouter / retirer une séance
   --------------------------------------------------- */
async function ajouterSeance() {
  const prochain = (seances.length ? Math.max(...seances.map((s) => s.numero)) : 0) + 1;
  await sb.from("seances").insert([{ sequence_id: sequenceOuverte.id, numero: prochain }]);
  await ouvrirSequence(sequenceOuverte.id);
}

async function retirerSeance(id) {
  await sb.from("seances").delete().eq("id", id);
  await ouvrirSequence(sequenceOuverte.id);
}

/* ---------------------------------------------------
   Enregistrer le cadre (vocabulaire, critères) et séances
   --------------------------------------------------- */
async function enregistrerDetail(champs) {
  // Vocabulaire
  await sb
    .from("sequences")
    .update({ vocabulaire: champs.vocabulaire })
    .eq("id", sequenceOuverte.id);

  // Séances : objectif + minutage
  for (const s of champs.seances) {
    await sb
      .from("seances")
      .update({ objectif: s.objectif, minutage: s.minutage })
      .eq("id", s.id);
  }
}

/* ---------------------------------------------------
   Ajouter un critère
   --------------------------------------------------- */
async function ajouterCritere(libelle, bareme) {
  await sb.from("criteres_sequence").insert([{
    sequence_id: sequenceOuverte.id,
    libelle,
    bareme: bareme ? Number(bareme) : null,
  }]);
  await ouvrirSequence(sequenceOuverte.id);
}

async function retirerCritere(id) {
  await sb.from("criteres_sequence").delete().eq("id", id);
  await ouvrirSequence(sequenceOuverte.id);
}

/* ---------------------------------------------------
   Reconstruire la liste des cours à venir d'une classe
   à partir de l'EDT, en sautant vacances et annulations.
   --------------------------------------------------- */
const JOURS_SEM = ["lundi", "mardi", "mercredi", "jeudi", "vendredi"];
const ORDRE_CRENEAUX = ["M1", "M2", "M3", "M4", "S1", "S2", "S3", "S4"];

function ajouterJoursISO(iso, n) {
  const [a, m, j] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j + n));
  return d.toISOString().slice(0, 10);
}

async function coursAVenir(classeId, aPartirDe) {
  const { data: cases } = await sb
    .from("edt_cases")
    .select("iso_lundi, jour, creneau")
    .eq("annee_id", anneeId)
    .eq("classe_id", classeId);
  if (!cases || !cases.length) return [];

  const { data: vac } = await sb
    .from("jours_speciaux")
    .select("date")
    .eq("annee_id", anneeId)
    .eq("type", "vacances");
  const joursVacances = new Set((vac || []).map((v) => v.date));

  const { data: annuls } = await sb
    .from("annulations")
    .select("date, creneau")
    .eq("annee_id", anneeId);
  const annulSet = new Set((annuls || []).map((a) => `${a.date}|${a.creneau}`));

  const cours = [];
  cases.forEach((c) => {
    const decalage = JOURS_SEM.indexOf(c.jour);
    if (decalage < 0) return;
    const date = ajouterJoursISO(c.iso_lundi, decalage);
    if (date < aPartirDe) return;
    if (joursVacances.has(date)) return;
    if (annulSet.has(`${date}|${c.creneau}`)) return;
    cours.push({ date, creneau: c.creneau });
  });

  cours.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return ORDRE_CRENEAUX.indexOf(a.creneau) - ORDRE_CRENEAUX.indexOf(b.creneau);
  });
  return cours;
}

async function poserSeances(classeId, dateDepart) {
  const cours = await coursAVenir(classeId, dateDepart);
  if (!cours.length) return { ok: false, message: "Aucun cours à venir pour cette classe." };

  const seancesTriees = [...seances].sort((a, b) => a.numero - b.numero);
  for (let i = 0; i < seancesTriees.length && i < cours.length; i++) {
    await sb
      .from("seances")
      .update({ classe_id: classeId, annee_id: anneeId, date: cours[i].date })
      .eq("id", seancesTriees[i].id);
  }

  const posees = Math.min(seancesTriees.length, cours.length);
  const reste = seancesTriees.length - posees;
  let msg = `${posees} séance(s) posée(s).`;
  if (reste > 0) msg += ` ${reste} sans cours disponible.`;
  return { ok: true, message: msg };
}

/* ---------------------------------------------------
   Charger le planning d'une classe : les séances posées
   (prévu) + le réel (faites, annulations, évènements)
   --------------------------------------------------- */
async function chargerPlanning(classeId) {
  planningLignes = [];

  // Les séances posées de cette classe, avec le nom de leur séquence
  const { data: seas } = await sb
    .from("seances")
    .select("id, numero, date, notes_seance, sequence_id")
    .eq("classe_id", classeId)
    .not("date", "is", null)
    .order("date");

  // Noms des séquences
  const seqIds = [...new Set((seas || []).map((s) => s.sequence_id).filter(Boolean))];
  let nomSeq = new Map();
  if (seqIds.length) {
    const { data: seqs } = await sb
      .from("sequences")
      .select("id, nom")
      .in("id", seqIds);
    nomSeq = new Map((seqs || []).map((s) => [s.id, s.nom]));
  }

  (seas || []).forEach((s) => {
    planningLignes.push({
      type: "seance",
      date: s.date,
      libelle: `${nomSeq.get(s.sequence_id) || "Séquence"} — séance ${s.numero}`,
      fait: !!s.notes_seance, // "réel" = des notes ont été saisies
    });
  });

  // Les annulations (réel)
  const { data: annuls } = await sb
    .from("annulations")
    .select("date, motif")
    .eq("annee_id", anneeId)
    .eq("classe_id", classeId);
  (annuls || []).forEach((a) => {
    planningLignes.push({ type: "annulation", date: a.date, libelle: `Annulé — ${a.motif || ""}`, fait: true });
  });

  // Les évènements (réel) — non liés à une classe précise, on les montre tous
  const { data: evs } = await sb
    .from("evenements")
    .select("date, type, intitule")
    .eq("annee_id", anneeId);
  (evs || []).forEach((e) => {
    planningLignes.push({ type: "evenement", date: e.date, libelle: `${e.type}${e.intitule ? " : " + e.intitule : ""}`, fait: true });
  });

  planningLignes.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/* ---------------------------------------------------
   Les classes concernées par une séquence (niveau ou classe)
   --------------------------------------------------- */
function classesDeLaSequence(seq) {
  if (seq.classe_id) return classes.filter((c) => c.id === seq.classe_id);
  if (seq.niveau) return classes.filter((c) => String(c.nom).startsWith(seq.niveau));
  return [];
}

/* ---------------------------------------------------
   Affichage : nom lisible de la cible d'une séquence
   --------------------------------------------------- */
function cibleLisible(seq) {
  if (seq.niveau) return `Niveau ${seq.niveau}`;
  if (seq.classe_id) {
    const c = classes.find((x) => x.id === seq.classe_id);
    return c ? c.nom : "Classe";
  }
  return "—";
}

/* ---------------------------------------------------
   Affichage de la page
   --------------------------------------------------- */
export function renderCalendrier() {
  if (!anneeId) {
    return `
      <h1>Calendrier</h1>
      <div class="carte"><p>Aucune année active. Crée-la d'abord dans la page Import.</p></div>
    `;
  }

  // Si une séquence est ouverte : son détail
  if (sequenceOuverte) return renderDetailSequence();

  // Si la vue planning est demandée
  if (vuePlanning) return renderPlanning();

  // Sinon : la liste des séquences + le formulaire de création
  const liste = sequences.length
    ? sequences
        .map(
          (s) => `
        <tr>
          <td><button class="lien-seq" data-id="${s.id}">${s.nom}</button></td>
          <td>${cibleLisible(s)}</td>
          <td>${s.date_debut || "—"}</td>
        </tr>`
        )
        .join("")
    : `<tr><td colspan="3" class="hint">Aucune séquence pour l'instant.</td></tr>`;

  // Options de cible : niveaux + classes
  const optionsCible = `
    <option value="6">Niveau 6e</option>
    <option value="5">Niveau 5e</option>
    <option value="4">Niveau 4e</option>
    <option value="3">Niveau 3e</option>
    ${classes.map((c) => `<option value="classe:${c.id}">${c.nom}</option>`).join("")}
  `;

  return `
    <h1>Calendrier</h1>
    <p class="hint">Crée et remplis tes séquences pédagogiques.</p>

    <button class="bouton-doux" id="voirPlanning">Voir le planning d'une classe ›</button>

    <div class="carte">
      <h2>Nouvelle séquence</h2>
      <div class="form-seq">
        <input type="text" id="seqNom" placeholder="Nom (ex : Autoportrait)">
        <select id="seqCible">${optionsCible}</select>
        <label>Début <input type="date" id="seqDebut"></label>
        <label>Fin <input type="date" id="seqFin"></label>
        <label>Nb séances <input type="number" id="seqNb" value="4" min="1" style="width:70px"></label>
        <button class="bouton" id="creerSeq">Créer</button>
      </div>
      <div id="msgSeq" class="status"></div>
    </div>

    <div class="carte">
      <h2>Mes séquences</h2>
      <table class="grille-edt">
        <tr><th>Nom</th><th>Cible</th><th>Début</th></tr>
        ${liste}
      </table>
    </div>
  `;
}

/* ---------------------------------------------------
   Affichage du détail d'une séquence (le gros écran)
   --------------------------------------------------- */
function renderDetailSequence() {
  const s = sequenceOuverte;

  const critLignes = criteres.length
    ? criteres
        .map(
          (c) => `
        <li>${c.libelle} <span class="hint">/ ${c.bareme ?? "?"}</span>
          <button class="lien-suppr" data-critere="${c.id}">✕</button>
        </li>`
        )
        .join("")
    : `<li class="hint">Aucun critère.</li>`;

  const seancesBloc = seances
    .map(
      (se) => `
      <div class="carte carte-seance">
        <div class="seance-titre">
          Séance ${se.numero}
          ${se.date ? `<span class="hint">— ${se.date}</span>` : ""}
          <button class="lien-suppr" data-seance="${se.id}">retirer</button>
        </div>
        <label>Objectif<br>
          <input type="text" class="ch-objectif" data-id="${se.id}" value="${se.objectif || ""}">
        </label>
        <label>Minutage (déroulé de l'heure)<br>
          <textarea class="ch-minutage" data-id="${se.id}" rows="2">${se.minutage || ""}</textarea>
        </label>
      </div>`
    )
    .join("");

  return `
    <button class="bouton-doux" id="retourListe">‹ Retour aux séquences</button>
    <h1>${s.nom}</h1>
    <p class="hint">${cibleLisible(s)} · ${s.date_debut || "?"} → ${s.date_fin || "?"}</p>

    <div class="carte">
      <h2>Critères d'évaluation</h2>
      <ul class="liste-criteres">${critLignes}</ul>
      <div class="form-seq">
        <input type="text" id="critLibelle" placeholder="Critère (ex : soin)">
        <input type="number" id="critBareme" placeholder="Points" style="width:80px">
        <button class="bouton-doux" id="ajoutCritere">+ Ajouter</button>
      </div>
    </div>

    <div class="carte">
      <h2>Vocabulaire</h2>
      <textarea id="seqVocab" rows="3" style="width:100%">${s.vocabulaire || ""}</textarea>
    </div>

    <h2>Déroulé par séance</h2>
    ${seancesBloc}
    <button class="bouton-doux" id="ajoutSeance">+ Ajouter une séance</button>

    <div class="carte" style="margin-top:16px;">
      <h2>Poser sur le calendrier</h2>
      <p class="hint">La séance 1 démarre au cours choisi, les suivantes s'enchaînent (vacances et annulations sautées).</p>
      <div class="form-seq">
        <select id="poseClasse">
          ${classesDeLaSequence(s).map((c) => `<option value="${c.id}">${c.nom}</option>`).join("")}
        </select>
        <label>1re séance à partir du <input type="date" id="poseDate" value="${s.date_debut || ""}"></label>
        <button class="bouton" id="poserSeances">Poser les séances</button>
      </div>
      <div id="msgPose" class="status"></div>
    </div>

    <div style="margin-top:16px;">
      <button class="bouton" id="enregistrerDetail">Enregistrer</button>
      <span id="msgDetail" class="status"></span>
    </div>
  `;
}

/* ---------------------------------------------------
   Affichage de la vue planning (prévu / réel)
   --------------------------------------------------- */
function renderPlanning() {
  const optionsClasses = classes
    .map(
      (c) =>
        `<option value="${c.id}" ${c.id === planningClasse ? "selected" : ""}>${c.nom}</option>`
    )
    .join("");

  // Filtrer selon l'interrupteur : prévu = séances ; réel = tout ce qui est "fait"
  const lignes = planningLignes.filter((l) =>
    afficherReel ? true : l.type === "seance"
  );

  const corps = lignes.length
    ? lignes
        .map(
          (l) => `
        <tr class="ligne-${l.type} ${l.fait ? "est-fait" : ""}">
          <td>${l.date}</td>
          <td>${l.libelle}</td>
          <td>${l.type === "seance" ? (l.fait ? "faite" : "prévue") : l.type}</td>
        </tr>`
        )
        .join("")
    : `<tr><td colspan="3" class="hint">Rien à afficher. Choisis une classe.</td></tr>`;

  return `
    <button class="bouton-doux" id="retourListe">‹ Retour aux séquences</button>
    <h1>Planning</h1>

    <div class="barre-semaine">
      <label>Classe :
        <select id="planningClasse">
          <option value="">— choisir —</option>
          ${optionsClasses}
        </select>
      </label>
      <label class="ligne-report">
        <input type="checkbox" id="switchReel" ${afficherReel ? "checked" : ""}>
        Superposer le réel (fait, annulations, évènements)
      </label>
    </div>

    <div class="carte">
      <table class="grille-edt">
        <tr><th>Date</th><th>Contenu</th><th>État</th></tr>
        ${corps}
      </table>
    </div>
  `;
}

/* ---------------------------------------------------
   Interactions
   --------------------------------------------------- */
export function bindCalendrier() {
  // Accès à la vue planning
  const voirPlanning = document.getElementById("voirPlanning");
  if (voirPlanning) {
    voirPlanning.addEventListener("click", () => {
      vuePlanning = true;
      rafraichir();
    });
  }

  // Vue planning : choix de classe
  const planClasse = document.getElementById("planningClasse");
  if (planClasse) {
    planClasse.addEventListener("change", async (e) => {
      planningClasse = e.target.value || null;
      if (planningClasse) await chargerPlanning(planningClasse);
      else planningLignes = [];
      rafraichir();
    });
  }

  // Vue planning : interrupteur prévu/réel
  const switchReel = document.getElementById("switchReel");
  if (switchReel) {
    switchReel.addEventListener("change", (e) => {
      afficherReel = e.target.checked;
      rafraichir();
    });
  }

  // --- Écran liste + création ---
  const creer = document.getElementById("creerSeq");
  if (creer) {
    creer.addEventListener("click", async () => {
      const msg = document.getElementById("msgSeq");
      const donnees = {
        nom: document.getElementById("seqNom").value.trim(),
        cible: document.getElementById("seqCible").value,
        dateDebut: document.getElementById("seqDebut").value,
        dateFin: document.getElementById("seqFin").value,
        nbSeances: document.getElementById("seqNb").value,
      };
      if (!donnees.nom) { msg.textContent = "❌ Donne un nom."; return; }
      try {
        const id = await creerSequence(donnees);
        await chargerSequences();
        await ouvrirSequence(id);
        rafraichir();
      } catch (e) {
        msg.textContent = "❌ " + e.message;
      }
    });
  }

  document.querySelectorAll(".lien-seq").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await ouvrirSequence(btn.dataset.id);
      rafraichir();
    });
  });

  // --- Écran détail ---
  const retour = document.getElementById("retourListe");
  if (retour) {
    retour.addEventListener("click", () => {
      sequenceOuverte = null;
      vuePlanning = false;
      rafraichir();
    });
  }

  const ajoutCrit = document.getElementById("ajoutCritere");
  if (ajoutCrit) {
    ajoutCrit.addEventListener("click", async () => {
      const lib = document.getElementById("critLibelle").value.trim();
      const bar = document.getElementById("critBareme").value;
      if (!lib) return;
      await ajouterCritere(lib, bar);
      rafraichir();
    });
  }

  document.querySelectorAll(".lien-suppr[data-critere]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await retirerCritere(btn.dataset.critere);
      rafraichir();
    });
  });

  const ajoutSea = document.getElementById("ajoutSeance");
  if (ajoutSea) {
    ajoutSea.addEventListener("click", async () => {
      await ajouterSeance();
      rafraichir();
    });
  }

  document.querySelectorAll(".lien-suppr[data-seance]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await retirerSeance(btn.dataset.seance);
      rafraichir();
    });
  });

  const enr = document.getElementById("enregistrerDetail");
  if (enr) {
    enr.addEventListener("click", async () => {
      const msg = document.getElementById("msgDetail");
      const champs = {
        vocabulaire: document.getElementById("seqVocab").value,
        seances: seances.map((s) => ({
          id: s.id,
          objectif: document.querySelector(`.ch-objectif[data-id="${s.id}"]`).value,
          minutage: document.querySelector(`.ch-minutage[data-id="${s.id}"]`).value,
        })),
      };
      try {
        await enregistrerDetail(champs);
        msg.textContent = "✅ Enregistré.";
      } catch (e) {
        msg.textContent = "❌ " + e.message;
      }
    });
  }

  // Poser les séances sur le calendrier
  const poser = document.getElementById("poserSeances");
  if (poser) {
    poser.addEventListener("click", async () => {
      const msg = document.getElementById("msgPose");
      const classeId = document.getElementById("poseClasse").value;
      const dateDepart = document.getElementById("poseDate").value;
      if (!classeId || !dateDepart) { msg.textContent = "❌ Choisis une classe et une date."; return; }
      msg.textContent = "⏳ Pose en cours…";
      try {
        const res = await poserSeances(classeId, dateDepart);
        msg.textContent = (res.ok ? "✅ " : "❌ ") + res.message;
        await ouvrirSequence(sequenceOuverte.id);
      } catch (e) {
        msg.textContent = "❌ " + e.message;
      }
    });
  }
}

/* ---------------------------------------------------
   Redessiner
   --------------------------------------------------- */
function rafraichir() {
  const zone = document.getElementById("app");
  zone.innerHTML = renderCalendrier();
  bindCalendrier();
}

/* ---------------------------------------------------
   À l'ouverture
   --------------------------------------------------- */
export async function ouvrirCalendrier() {
  sequenceOuverte = null;
  await chargerBase();
  rafraichir();
}
