/* ===================================================
   ELIAN — Page Import / Export
   Lit un fichier CSV et crée les classes + élèves.
   =================================================== */

import { sb } from "./supabase.js";

/* ---------------------------------------------------
   Outils pour lire le CSV
   --------------------------------------------------- */

// Enlève les espaces autour d'un texte
function propre(texte) {
  return String(texte ?? "").trim();
}

// Transforme "M", "Masculin", "f"… en "M" / "F" / "Autre"
function normaliserGenre(valeur) {
  const v = propre(valeur).toLowerCase();
  if (!v) return "";
  if (v.startsWith("f")) return "F";
  if (v.startsWith("m")) return "M";
  return "Autre";
}

// Découpe le fichier en lignes
function decouperLignes(texte) {
  return String(texte ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

// Lit le CSV : détecte le séparateur (; ou ,) et range en colonnes
function lireCSV(contenu) {
  const lignes = decouperLignes(contenu);
  if (!lignes.length) throw new Error("Le fichier est vide.");

  // Séparateur : celui le plus présent dans la première ligne
  const enTete = lignes[0];
  const pointsVirgule = (enTete.match(/;/g) || []).length;
  const virgules = (enTete.match(/,/g) || []).length;
  const sep = pointsVirgule >= virgules ? ";" : ",";

  const colonnes = enTete.split(sep).map((c) => propre(c).toLowerCase());
  const donnees = lignes.slice(1).map((ligne) => ligne.split(sep).map(propre));

  return { colonnes, donnees };
}

/* ---------------------------------------------------
   Créer et activer une année scolaire
   --------------------------------------------------- */
async function creerAnnee(libelle) {
  // libelle attendu : "2026-2027"
  const debut = libelle.split("-")[0];
  if (!/^\d{4}-\d{4}$/.test(libelle)) {
    throw new Error('Format attendu : "2026-2027".');
  }

  // Désactiver l'année active actuelle (s'il y en a une)
  await sb.from("annees").update({ active: false }).eq("active", true);

  // Créer la nouvelle, active
  const { error } = await sb.from("annees").insert([
    {
      libelle,
      active: true,
      date_debut: `${debut}-09-01`,
      date_fin: `${parseInt(debut) + 1}-08-31`,
    },
  ]);

  if (error) throw new Error("Création de l'année : " + error.message);
}

/* ---------------------------------------------------
   Créer les classes et les élèves dans Supabase
   --------------------------------------------------- */
async function importerCSV(contenu) {
  const { colonnes, donnees } = lireCSV(contenu);

  // Vérifier les colonnes obligatoires
  const obligatoires = ["prenom", "nom", "classe"];
  for (const c of obligatoires) {
    if (!colonnes.includes(c)) {
      throw new Error(`Colonne manquante dans le fichier : "${c}"`);
    }
  }

  const posDe = (nom) => colonnes.indexOf(nom);

  // Construire la liste des élèves depuis le fichier
  const elevesLus = [];
  for (const ligne of donnees) {
    const prenom = propre(ligne[posDe("prenom")]);
    const nom = propre(ligne[posDe("nom")]);
    const classe = propre(ligne[posDe("classe")]);
    const genre = colonnes.includes("genre")
      ? normaliserGenre(ligne[posDe("genre")])
      : "";
    const groupe = colonnes.includes("groupe")
      ? propre(ligne[posDe("groupe")])
      : "";

    if (!prenom || !nom || !classe) continue; // ligne incomplète, on saute
    elevesLus.push({ prenom, nom, classe, genre, groupe });
  }

  if (!elevesLus.length) throw new Error("Aucun élève valide trouvé.");

  // 1. Trouver l'année active
  const { data: annee, error: errAnnee } = await sb
    .from("annees")
    .select("id")
    .eq("active", true)
    .maybeSingle();

  if (errAnnee) throw new Error("Lecture de l'année : " + errAnnee.message);
  if (!annee) throw new Error("Aucune année active. Crée d'abord une année.");

  // 2. Créer les classes manquantes
  const nomsClasses = [...new Set(elevesLus.map((e) => e.classe))];

  const { data: classesExistantes } = await sb
    .from("classes")
    .select("id, nom")
    .eq("annee_id", annee.id);

  const dejaLa = new Set((classesExistantes || []).map((c) => c.nom));
  const aCreer = nomsClasses
    .filter((nom) => !dejaLa.has(nom))
    .map((nom) => ({ annee_id: annee.id, nom }));

  if (aCreer.length) {
    const { error } = await sb.from("classes").insert(aCreer);
    if (error) throw new Error("Création des classes : " + error.message);
  }

  // 3. Relire toutes les classes pour connaître leur identifiant
  const { data: toutesClasses } = await sb
    .from("classes")
    .select("id, nom")
    .eq("annee_id", annee.id);

  const idParNom = new Map((toutesClasses || []).map((c) => [c.nom, c.id]));

  // 4. Créer les élèves
  const payload = elevesLus.map((e) => ({
    classe_id: idParNom.get(e.classe),
    prenom: e.prenom,
    nom: e.nom,
    genre: e.genre || null,
    groupe: e.groupe || null,
  }));

  const { error: errEleves } = await sb.from("eleves").insert(payload);
  if (errEleves) throw new Error("Création des élèves : " + errEleves.message);

  return { nbEleves: payload.length, nbClasses: nomsClasses.length };
}

/* ---------------------------------------------------
   L'affichage de la page
   --------------------------------------------------- */
export function renderImport() {
  // Propose l'année en cours par défaut (ex : 2026-2027)
  const maintenant = new Date();
  const debut = maintenant.getMonth() < 8 // avant septembre
    ? maintenant.getFullYear() - 1
    : maintenant.getFullYear();
  const anneeDefaut = `${debut}-${debut + 1}`;

  return `
    <h1>Import / Export</h1>
    <p class="hint">Créer les classes et les élèves à partir d'un fichier.</p>

    <div class="carte">
      <h2>Année scolaire</h2>
      <p class="hint">
        Une année active est nécessaire avant d'importer des élèves.
      </p>
      <input type="text" id="champAnnee" value="${anneeDefaut}" style="padding:8px;">
      <button class="bouton" id="boutonAnnee">Créer et activer</button>
      <div id="messageAnnee" class="status"></div>
    </div>

    <div class="carte">
      <h2>Importer des élèves (CSV)</h2>
      <p class="hint">
        Colonnes attendues : <strong>prenom ; nom ; classe</strong>
        (et si tu veux : genre, groupe). Séparateur ; ou ,
      </p>
      <input type="file" id="fichierCSV" accept=".csv">
      <div id="messageImport" class="status"></div>
    </div>
  `;
}

/* ---------------------------------------------------
   Les interactions de la page
   --------------------------------------------------- */
export function bindImport() {
  // --- Bouton : créer et activer une année ---
  const boutonAnnee = document.getElementById("boutonAnnee");
  const messageAnnee = document.getElementById("messageAnnee");

  if (boutonAnnee) {
    boutonAnnee.addEventListener("click", async () => {
      const libelle = document.getElementById("champAnnee").value.trim();
      messageAnnee.textContent = "⏳ Création…";
      try {
        await creerAnnee(libelle);
        messageAnnee.textContent = `✅ Année ${libelle} créée et active.`;
      } catch (e) {
        messageAnnee.textContent = "❌ " + e.message;
      }
    });
  }

  // --- Import du fichier CSV ---
  const champ = document.getElementById("fichierCSV");
  const message = document.getElementById("messageImport");

  if (!champ) return;

  champ.addEventListener("change", async () => {
    const fichier = champ.files && champ.files[0];
    if (!fichier) return;

    message.textContent = "⏳ Lecture du fichier…";

    try {
      const contenu = await lireFichier(fichier);
      const res = await importerCSV(contenu);
      message.textContent = `✅ Import réussi : ${res.nbEleves} élèves, ${res.nbClasses} classe(s).`;
    } catch (e) {
      message.textContent = "❌ " + e.message;
    }
  });
}

// Lit le fichier, en gérant les accents (UTF-8, sinon Latin-1)
function lireFichier(fichier) {
  return new Promise((resolve) => {
    const lecteur = new FileReader();
    lecteur.onload = () => {
      if (lecteur.result.includes("\ufffd")) {
        const lecteur2 = new FileReader();
        lecteur2.onload = () => resolve(lecteur2.result);
        lecteur2.readAsText(fichier, "ISO-8859-1");
      } else {
        resolve(lecteur.result);
      }
    };
    lecteur.readAsText(fichier, "UTF-8");
  });
}
