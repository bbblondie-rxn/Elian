/* ===================================================
   ELIAN — Logique du calendrier (repris d'Agora)
   - récupère vacances et fériés automatiquement
   - calcule le type A / B / V de chaque semaine
   =================================================== */

import { sb } from "./supabase.js";

// À ajuster selon l'académie / la zone de l'utilisatrice
const ACADEMIE = "Versailles";
const ZONE = "Zone C";

/* Ajoute n jours à une date "2026-09-07" */
export function ajouterJours(iso, n) {
  const [a, m, j] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j + n));
  return d.toISOString().slice(0, 10);
}

/* ---------------------------------------------------
   Récupérer les vacances scolaires (API gouv)
   --------------------------------------------------- */
async function fetchVacances(libelleAnnee) {
  const where = encodeURIComponent(
    `zones="${ZONE}" and annee_scolaire="${libelleAnnee}" and location="${ACADEMIE}"`
  );
  const url =
    `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/` +
    `fr-en-calendrier-scolaire/records?where=${where}&limit=100`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API vacances: HTTP ${res.status}`);
  const json = await res.json();
  return json.results || [];
}

/* Développe les périodes de vacances en jours individuels */
function developperVacances(periodes, libelleAnnee) {
  const finAnnee = `${libelleAnnee.split("-")[1]}-08-31`;
  const jours = new Map(); // date -> libellé

  periodes.forEach((p) => {
    const debutSource = String(p.start_date).slice(0, 10);
    const finSource = String(p.end_date).slice(0, 10);
    const libelle = p.description || "Vacances";

    // Les vacances commencent le lendemain du dernier jour de classe
    const premier = ajouterJours(debutSource, 1);
    let dernier;
    if (libelle.includes("Été")) dernier = finAnnee;
    else if (debutSource === finSource) dernier = premier;
    else dernier = ajouterJours(finSource, -1);

    let courant = premier;
    while (courant <= dernier) {
      jours.set(courant, libelle);
      courant = ajouterJours(courant, 1);
    }
  });
  return jours;
}

/* ---------------------------------------------------
   Récupérer les jours fériés (API gouv)
   --------------------------------------------------- */
async function fetchFeries(anneeCivile) {
  const url = `https://calendrier.api.gouv.fr/jours-feries/metropole/${anneeCivile}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API fériés ${anneeCivile}: HTTP ${res.status}`);
  return await res.json();
}

/* ---------------------------------------------------
   Récupérer tout le calendrier et l'écrire en base
   (table jours_speciaux)
   --------------------------------------------------- */
export async function importerCalendrier(anneeId, libelleAnnee) {
  const [an1, an2] = libelleAnnee.split("-").map(Number);
  const debut = `${an1}-08-01`;
  const fin = `${an2}-08-31`;

  // Vacances
  const periodes = await fetchVacances(libelleAnnee);
  const vacances = developperVacances(periodes, libelleAnnee);

  // Fériés (des deux années civiles)
  const feries = new Map();
  for (const an of [an1, an2]) {
    const data = await fetchFeries(an);
    Object.entries(data).forEach(([date, nom]) => {
      if (date >= debut && date <= fin) feries.set(date, nom);
    });
  }

  // Construire les lignes (un férié en vacances reste "vacances")
  const lignes = [];
  vacances.forEach((libelle, date) =>
    lignes.push({ annee_id: anneeId, date, type: "vacances", libelle })
  );
  feries.forEach((libelle, date) => {
    if (!vacances.has(date))
      lignes.push({ annee_id: anneeId, date, type: "ferie", libelle });
  });

  // On efface l'ancien calendrier de l'année, puis on réécrit
  await sb.from("jours_speciaux").delete().eq("annee_id", anneeId);
  if (lignes.length) {
    const { error } = await sb.from("jours_speciaux").insert(lignes);
    if (error) throw new Error(error.message);
  }

  return { vacances: vacances.size, feries: feries.size };
}

/* ---------------------------------------------------
   Calculer le type A / B / V de chaque semaine
   à partir des repères + des jours de vacances
   --------------------------------------------------- */
export function calculerTypes(semaines, reperes, joursVacances) {
  // reperes : { premiere_semaine_a, debut_t2, debut_t3, debut_s2 }
  const debutA = reperes.premiere_semaine_a || null;
  const debutT2 = reperes.debut_t2 || null;
  const debutT3 = reperes.debut_t3 || null;
  const debutS2 = reperes.debut_s2 || null;

  // Une semaine est "vacances" si ses 5 jours ouvrés sont tous en vacances
  function estVacances(isoLundi) {
    for (let i = 0; i < 5; i++) {
      if (!joursVacances.has(ajouterJours(isoLundi, i))) return false;
    }
    return true;
  }

  const resultat = new Map(); // iso_lundi -> { type, trimestre, semestre }
  let compteur = 0;
  let alternanceDemarree = false;

  semaines.forEach((s) => {
    const iso = s.iso_lundi;

    const trimestre =
      debutT3 && iso >= debutT3 ? "T3" : debutT2 && iso >= debutT2 ? "T2" : "T1";
    const semestre = debutS2 && iso >= debutS2 ? "S2" : "S1";

    let type;
    if (estVacances(iso)) {
      type = "V"; // ne consomme pas de tour d'alternance
    } else if (!debutA || iso < debutA) {
      type = "A";
    } else {
      if (!alternanceDemarree) {
        alternanceDemarree = true;
        compteur = 0;
      }
      type = compteur % 2 === 0 ? "A" : "B";
      compteur++;
    }

    resultat.set(iso, { type, trimestre, semestre });
  });

  return resultat;
}

/* Charger les jours de vacances de l'année (pour le calcul) */
export async function chargerJoursVacances(anneeId) {
  const { data } = await sb
    .from("jours_speciaux")
    .select("date, type")
    .eq("annee_id", anneeId)
    .eq("type", "vacances");
  return new Set((data || []).map((r) => r.date));
}
