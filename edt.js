/* ===================================================
   ELIAN — Page Emploi du temps
   Morceau 1 : grille + palette.
   Morceau 2 : générer les semaines, naviguer, enregistrer.
   =================================================== */

import { sb } from "./supabase.js";
import {
  importerCalendrier,
  calculerTypes,
  chargerJoursVacances,
} from "./calendrier-logique.js";

// Le type A/B/V calculé de chaque semaine : iso_lundi -> {type, trimestre, semestre}
let typesSemaines = new Map();
// Faut-il recopier la grille sur les semaines jumelles à l'enregistrement ?
let reporterJumelles = false;

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

// Les motifs qu'on peut poser dans l'EDT, comme des classes
const MOTIFS = [
  { id: "motif-annulation", nom: "Annulation", couleur: "#f3d0d0" },
  { id: "motif-reunion", nom: "Réunion", couleur: "#d6e4f0" },
  { id: "motif-formation", nom: "Formation", couleur: "#e0d9f0" },
  { id: "motif-visite", nom: "Visite stagiaire", couleur: "#d9efdd" },
];

// --- État de la page (en mémoire) ---
let anneeId = null;        // l'année active
let classes = [];          // les classes de l'année
let semaines = [];         // toutes les semaines de l'année
let indexSemaine = 0;      // quelle semaine on regarde
let grille = new Map();    // la grille affichée : "jour|creneau" -> {id, nom}
let classeChoisie = null;  // la classe choisie dans la palette
let modifie = false;       // y a-t-il des changements non enregistrés ?

/* ---------------------------------------------------
   Outils dates
   --------------------------------------------------- */
// Ajoute n jours à une date "2026-09-07"
function ajouterJours(iso, n) {
  const [a, m, j] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j + n));
  return d.toISOString().slice(0, 10);
}

// Lundi de la semaine du 1er septembre d'une année
function premierLundiSeptembre(annee) {
  const d = new Date(Date.UTC(annee, 8, 1)); // 8 = septembre
  const jour = d.getUTCDay() || 7; // dimanche = 7
  d.setUTCDate(d.getUTCDate() - (jour - 1));
  return d.toISOString().slice(0, 10);
}

// Affichage court d'une date : "07/09"
function dateCourte(iso) {
  const [, m, j] = iso.split("-");
  return `${j}/${m}`;
}

/* ---------------------------------------------------
   Charger l'année active, ses classes et ses semaines
   --------------------------------------------------- */
async function chargerTout() {
  const { data: annee } = await sb
    .from("annees")
    .select("id, libelle")
    .eq("active", true)
    .maybeSingle();

  if (!annee) {
    anneeId = null;
    classes = [];
    semaines = [];
    return;
  }
  anneeId = annee.id;

  const { data: cls } = await sb
    .from("classes")
    .select("id, nom")
    .eq("annee_id", anneeId)
    .order("nom");
  classes = cls || [];

  const { data: sem } = await sb
    .from("semaines")
    .select("id, iso_lundi, libelle")
    .eq("annee_id", anneeId)
    .order("iso_lundi");
  semaines = sem || [];

  // Calculer les types A/B/V à partir des repères de l'année
  await calculerTypesSemaines();

  // Si on a des semaines, charger la grille de la première
  if (semaines.length) {
    indexSemaine = Math.min(indexSemaine, semaines.length - 1);
    await chargerGrille();
  }
}

/* ---------------------------------------------------
   Calculer les types A/B/V (lit les repères + vacances)
   --------------------------------------------------- */
async function calculerTypesSemaines() {
  typesSemaines = new Map();
  if (!anneeId || !semaines.length) return;

  const { data: reperes } = await sb
    .from("annees")
    .select("premiere_semaine_a, debut_t2, debut_t3, debut_s2")
    .eq("id", anneeId)
    .maybeSingle();

  if (!reperes) return;

  const joursVacances = await chargerJoursVacances(anneeId);
  typesSemaines = calculerTypes(semaines, reperes, joursVacances);
}

/* ---------------------------------------------------
   Générer les semaines de l'année (comme Agora)
   Du lundi de la semaine du 1er sept. au 31 août.
   --------------------------------------------------- */
async function genererSemaines(libelleAnnee) {
  // libelleAnnee : "2026-2027"
  const [debut, fin] = libelleAnnee.split("-").map(Number);
  const premier = premierLundiSeptembre(debut);
  const limite = `${fin}-08-31`;

  // Semaines déjà présentes (pour ne pas dupliquer)
  const { data: dejaLa } = await sb
    .from("semaines")
    .select("iso_lundi")
    .eq("annee_id", anneeId);
  const connues = new Set((dejaLa || []).map((s) => s.iso_lundi));

  const aCreer = [];
  let courant = premier;
  let numero = 1;
  while (courant <= limite) {
    if (!connues.has(courant)) {
      aCreer.push({
        annee_id: anneeId,
        iso_lundi: courant,
        libelle: `Semaine ${numero}`,
      });
    }
    courant = ajouterJours(courant, 7);
    numero++;
  }

  if (aCreer.length) {
    const { error } = await sb.from("semaines").insert(aCreer);
    if (error) throw new Error(error.message);
  }
  return aCreer.length;
}

/* ---------------------------------------------------
   Charger la grille d'une semaine depuis Supabase
   --------------------------------------------------- */
async function chargerGrille() {
  grille = new Map();
  const semaine = semaines[indexSemaine];
  if (!semaine) return;

  // 1. Les classes posées (edt_cases)
  const { data: cases } = await sb
    .from("edt_cases")
    .select("jour, creneau, classe_id")
    .eq("annee_id", anneeId)
    .eq("iso_lundi", semaine.iso_lundi);

  const nomParId = new Map(classes.map((c) => [c.id, c.nom]));
  (cases || []).forEach((c) => {
    if (c.classe_id) {
      grille.set(`${c.jour}|${c.creneau}`, {
        genre: "classe",
        id: c.classe_id,
        nom: nomParId.get(c.classe_id) || "—",
      });
    }
  });

  // Bornes de dates de la semaine (lundi → vendredi)
  const lundi = semaine.iso_lundi;
  const vendredi = ajouterJours(lundi, 4);

  // 2. Les annulations de la semaine
  const { data: annuls } = await sb
    .from("annulations")
    .select("date, creneau")
    .eq("annee_id", anneeId)
    .gte("date", lundi)
    .lte("date", vendredi);
  (annuls || []).forEach((a) => {
    const jour = JOURS[dureeEnJours(lundi, a.date)];
    if (jour) grille.set(`${jour}|${a.creneau}`, { genre: "motif", id: "motif-annulation", nom: "Annulation" });
  });

  // 3. Les évènements de la semaine (réunion, formation, visite…)
  const { data: evs } = await sb
    .from("evenements")
    .select("date, creneau, type")
    .eq("annee_id", anneeId)
    .gte("date", lundi)
    .lte("date", vendredi);
  (evs || []).forEach((e) => {
    const jour = JOURS[dureeEnJours(lundi, e.date)];
    const motif = MOTIFS.find((m) => m.nom === e.type);
    if (jour && motif) grille.set(`${jour}|${e.creneau}`, { genre: "motif", id: motif.id, nom: motif.nom });
  });

  modifie = false;
}

/* Nombre de jours entre deux dates ISO (0 = même jour) */
function dureeEnJours(depuis, jusqua) {
  const [a1, m1, j1] = depuis.split("-").map(Number);
  const [a2, m2, j2] = jusqua.split("-").map(Number);
  const d1 = Date.UTC(a1, m1 - 1, j1);
  const d2 = Date.UTC(a2, m2 - 1, j2);
  return Math.round((d2 - d1) / 86400000);
}

/* ---------------------------------------------------
   Enregistrer la grille de la semaine affichée
   --------------------------------------------------- */
async function enregistrerGrille() {
  const semaine = semaines[indexSemaine];
  if (!semaine) return;

  // La liste des semaines où écrire : celle affichée + éventuellement les jumelles
  let cibles = [semaine.iso_lundi];

  if (reporterJumelles) {
    const infoSource = typesSemaines.get(semaine.iso_lundi);
    if (infoSource && infoSource.type !== "V") {
      semaines.forEach((s) => {
        if (s.iso_lundi <= semaine.iso_lundi) return; // seulement vers l'avant
        const info = typesSemaines.get(s.iso_lundi);
        if (!info) return;
        // même type (A ou B) et même trimestre
        if (info.type === infoSource.type && info.trimestre === infoSource.trimestre) {
          cibles.push(s.iso_lundi);
        }
      });
    }
  }

  // Pour chaque semaine cible : effacer puis réécrire
  for (const iso of cibles) {
    const vendrediCible = ajouterJours(iso, 4);

    // Effacer les données existantes de la semaine
    await sb.from("edt_cases").delete().eq("annee_id", anneeId).eq("iso_lundi", iso);
    await sb.from("annulations").delete().eq("annee_id", anneeId).gte("date", iso).lte("date", vendrediCible);
    await sb.from("evenements").delete().eq("annee_id", anneeId).gte("date", iso).lte("date", vendrediCible);

    const casesClasses = [];
    const lignesAnnul = [];
    const lignesEven = [];

    grille.forEach((valeur, cle) => {
      const [jour, creneau] = cle.split("|");
      const date = ajouterJours(iso, JOURS.indexOf(jour));

      if (valeur.genre === "classe") {
        casesClasses.push({ annee_id: anneeId, iso_lundi: iso, jour, creneau, classe_id: valeur.id });
      } else if (valeur.id === "motif-annulation") {
        lignesAnnul.push({ annee_id: anneeId, date, creneau, motif: "Annulation" });
      } else {
        const motif = MOTIFS.find((m) => m.id === valeur.id);
        lignesEven.push({ annee_id: anneeId, date, creneau, type: motif ? motif.nom : "Évènement" });
      }
    });

    if (casesClasses.length) {
      const { error } = await sb.from("edt_cases").insert(casesClasses);
      if (error) throw new Error(error.message);
    }
    if (lignesAnnul.length) {
      const { error } = await sb.from("annulations").insert(lignesAnnul);
      if (error) throw new Error(error.message);
    }
    if (lignesEven.length) {
      const { error } = await sb.from("evenements").insert(lignesEven);
      if (error) throw new Error(error.message);
    }
  }

  modifie = false;
}

/* ---------------------------------------------------
   Couleur douce et stable par classe
   --------------------------------------------------- */
function couleurClasse(nom) {
  let somme = 0;
  for (const c of String(nom)) somme += c.charCodeAt(0);
  return `hsl(${somme % 360}, 45%, 88%)`;
}

/* ---------------------------------------------------
   L'affichage de la page
   --------------------------------------------------- */
export function renderEDT() {
  // Cas : aucune année active
  if (!anneeId) {
    return `
      <h1>Emploi du temps</h1>
      <div class="carte"><p>Aucune année active. Crée-la d'abord dans la page Import.</p></div>
    `;
  }

  // Cas : pas encore de semaines → écran "préparer l'année"
  if (!semaines.length) {
    return `
      <h1>Emploi du temps</h1>
      <p class="hint">Prépare d'abord l'année : les semaines, les repères A/B et le calendrier des vacances.</p>
      <div class="carte">
        <h2>Préparer l'année</h2>
        <p class="hint">Ces dates doivent toutes être des lundis.</p>

        <label>1re semaine A<br><input type="date" id="repSemA"></label><br><br>
        <label>Début du 2e trimestre<br><input type="date" id="repT2"></label><br><br>
        <label>Début du 3e trimestre<br><input type="date" id="repT3"></label><br><br>
        <label>Début du 2e semestre<br><input type="date" id="repS2"></label><br><br>

        <button class="bouton" id="genererSemaines">Préparer l'année</button>
        <div id="messageSemaines" class="status"></div>
      </div>
    `;
  }

  const semaine = semaines[indexSemaine];
  const info = typesSemaines.get(semaine.iso_lundi) || { type: "?", trimestre: "?" };

  // La palette
  const pastilles = classes
    .map((c) => {
      const actif = classeChoisie && classeChoisie.id === c.id ? " actif" : "";
      return `<button class="pastille${actif}" data-id="${c.id}" data-nom="${c.nom}" data-genre="classe"
                 style="background:${couleurClasse(c.nom)}">${c.nom}</button>`;
    })
    .join("");

  // Les motifs (réunion, formation…) dans la palette
  const pastillesMotifs = MOTIFS.map((m) => {
    const actif = classeChoisie && classeChoisie.id === m.id ? " actif" : "";
    return `<button class="pastille${actif}" data-id="${m.id}" data-nom="${m.nom}" data-genre="motif"
               style="background:${m.couleur}">${m.nom}</button>`;
  }).join("");

  const gommeActive = classeChoisie && classeChoisie.id === "gomme" ? " actif" : "";

  // Couleur d'une case selon ce qu'elle contient
  function fondCase(posee) {
    if (!posee) return "";
    if (posee.genre === "motif") {
      const m = MOTIFS.find((x) => x.id === posee.id);
      return m ? `background:${m.couleur}` : "";
    }
    return `background:${couleurClasse(posee.nom)}`;
  }

  // La grille
  const lignes = CRENEAUX.map((cr) => {
    const cases = JOURS.map((jour) => {
      if (cr.code === "PM") return `<td class="case-pause">—</td>`;
      const posee = grille.get(`${jour}|${cr.code}`);
      const texte = posee ? posee.nom : "";
      return `<td class="case-edt" data-jour="${jour}" data-creneau="${cr.code}"
                 style="${fondCase(posee)}">${texte}</td>`;
    }).join("");
    return `<tr>
              <th class="entete-creneau">${cr.code}<br><small>${cr.debut}-${cr.fin}</small></th>
              ${cases}
            </tr>`;
  }).join("");

  return `
    <h1>Emploi du temps</h1>

    <div class="barre-semaine">
      <button class="bouton-doux" id="semPrec" ${indexSemaine === 0 ? "disabled" : ""}>‹</button>
      <select id="choixSemaine">
        ${semaines
          .map(
            (s, i) =>
              `<option value="${i}" ${i === indexSemaine ? "selected" : ""}>${s.libelle} (${dateCourte(s.iso_lundi)})</option>`
          )
          .join("")}
      </select>
      <button class="bouton-doux" id="semSuiv" ${indexSemaine >= semaines.length - 1 ? "disabled" : ""}>›</button>
      <strong class="badge-type">${info.type} · ${info.trimestre}</strong>
      <button class="bouton" id="enregistrer">Enregistrer${modifie ? " •" : ""}</button>
    </div>

    ${
      info.type === "V"
        ? `<p class="hint">Semaine de vacances.</p>`
        : `<label class="ligne-report">
             <input type="checkbox" id="reportCheck" ${reporterJumelles ? "checked" : ""}>
             Appliquer aussi aux semaines ${info.type} du ${info.trimestre} (à partir de celle-ci)
           </label>`
    }

    <p class="hint">Choisis une classe, puis clique les cases où elle a lieu.</p>

    <div class="palette">
      ${pastilles}
      <span class="separateur-palette"></span>
      ${pastillesMotifs}
      <button class="pastille${gommeActive}" id="gomme"
              style="background:#fff;border:1px dashed #999">Gomme</button>
    </div>

    <div class="carte" style="overflow-x:auto;">
      <table class="grille-edt">
        <tr><th></th>${JOURS.map((j) => `<th>${j}</th>`).join("")}</tr>
        ${lignes}
      </table>
    </div>
  `;
}

/* ---------------------------------------------------
   Les interactions
   --------------------------------------------------- */
export function bindEDT() {
  // Bouton : générer les semaines
  const btnGen = document.getElementById("genererSemaines");
  if (btnGen) {
    btnGen.addEventListener("click", async () => {
      const msg = document.getElementById("messageSemaines");

      // Récupérer les 4 repères saisis
      const reperes = {
        premiere_semaine_a: document.getElementById("repSemA").value || null,
        debut_t2: document.getElementById("repT2").value || null,
        debut_t3: document.getElementById("repT3").value || null,
        debut_s2: document.getElementById("repS2").value || null,
      };

      // Vérifier que ce sont des lundis
      const pasLundi = Object.entries(reperes)
        .filter(([, v]) => v && new Date(v + "T12:00:00").getDay() !== 1)
        .map(([k]) => k);
      if (pasLundi.length) {
        msg.textContent = "❌ Ces dates ne sont pas des lundis : " + pasLundi.join(", ");
        return;
      }

      try {
        const { data: annee } = await sb
          .from("annees")
          .select("libelle")
          .eq("id", anneeId)
          .maybeSingle();

        msg.textContent = "⏳ Création des semaines…";
        await genererSemaines(annee.libelle);

        msg.textContent = "⏳ Enregistrement des repères…";
        await sb.from("annees").update(reperes).eq("id", anneeId);

        msg.textContent = "⏳ Récupération du calendrier des vacances…";
        try {
          await importerCalendrier(anneeId, annee.libelle);
        } catch (e) {
          msg.textContent = "⚠ Semaines créées, mais calendrier non récupéré : " + e.message;
        }

        await chargerTout();
        rafraichir();
      } catch (e) {
        msg.textContent = "❌ " + e.message;
      }
    });
    return; // rien d'autre à brancher sur cet écran
  }

  // Case à cocher : reporter sur les jumelles
  const report = document.getElementById("reportCheck");
  if (report) {
    report.addEventListener("change", (e) => {
      reporterJumelles = e.target.checked;
    });
  }

  // Navigation entre semaines
  const choix = document.getElementById("choixSemaine");
  if (choix) {
    choix.addEventListener("change", async (e) => {
      indexSemaine = Number(e.target.value);
      await chargerGrille();
      rafraichir();
    });
  }
  const prec = document.getElementById("semPrec");
  if (prec) prec.addEventListener("click", async () => {
    if (indexSemaine > 0) { indexSemaine--; await chargerGrille(); rafraichir(); }
  });
  const suiv = document.getElementById("semSuiv");
  if (suiv) suiv.addEventListener("click", async () => {
    if (indexSemaine < semaines.length - 1) { indexSemaine++; await chargerGrille(); rafraichir(); }
  });

  // Bouton enregistrer
  const btnSave = document.getElementById("enregistrer");
  if (btnSave) {
    btnSave.addEventListener("click", async () => {
      btnSave.textContent = "⏳…";
      try {
        await enregistrerGrille();
        rafraichir();
      } catch (e) {
        alert("Enregistrement impossible : " + e.message);
      }
    });
  }

  // Choisir une classe ou un motif
  document.querySelectorAll(".pastille[data-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      classeChoisie =
        classeChoisie && classeChoisie.id === id
          ? null
          : { id, nom: btn.dataset.nom, genre: btn.dataset.genre };
      rafraichir();
    });
  });

  // Gomme
  const gomme = document.getElementById("gomme");
  if (gomme) {
    gomme.addEventListener("click", () => {
      classeChoisie =
        classeChoisie && classeChoisie.id === "gomme"
          ? null
          : { id: "gomme", nom: "" };
      rafraichir();
    });
  }

  // Cliquer une case
  document.querySelectorAll(".case-edt").forEach((td) => {
    td.addEventListener("click", () => {
      if (!classeChoisie) return;
      const cle = `${td.dataset.jour}|${td.dataset.creneau}`;
      if (classeChoisie.id === "gomme") grille.delete(cle);
      else grille.set(cle, {
        genre: classeChoisie.genre || "classe",
        id: classeChoisie.id,
        nom: classeChoisie.nom,
      });
      modifie = true;
      rafraichir();
    });
  });
}

/* ---------------------------------------------------
   Redessiner
   --------------------------------------------------- */
function rafraichir() {
  const zone = document.getElementById("app");
  zone.innerHTML = renderEDT();
  bindEDT();
}

/* ---------------------------------------------------
   À l'ouverture de la page
   --------------------------------------------------- */
export async function ouvrirEDT() {
  await chargerTout();
  rafraichir();
}
