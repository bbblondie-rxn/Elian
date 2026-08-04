/* ===================================================
   ELIAN — Page Cahier
   Onglets + blocs texte datés + recherche.
   Tout sur Supabase (les images locales viendront après).
   =================================================== */

import { sb } from "../supabase.js";

// Onglets par défaut (créés au premier lancement s'ils manquent)
const ONGLETS_DEPART = [
  "Baroque",
  "Réunion",
  "Projet",
  "Séquences en réflexion",
  "Progression",
  "Organisation idéale",
  "Stagiaire",
  "Divers",
];

// État
let onglets = [];          // { id, nom, ordre }
let ongletActif = null;    // id de l'onglet ouvert
let blocs = [];            // blocs de l'onglet actif
let recherche = "";        // texte recherché
let resultatsRecherche = null; // null = pas de recherche en cours

/* ---------------------------------------------------
   Chargement des onglets (création auto si vide)
   --------------------------------------------------- */
async function chargerOnglets() {
  const { data } = await sb
    .from("cahier_onglets")
    .select("id, nom, ordre")
    .order("ordre");

  if (data && data.length) {
    onglets = data;
  } else {
    // Créer les onglets de départ
    const lignes = ONGLETS_DEPART.map((nom, i) => ({ nom, ordre: i }));
    await sb.from("cahier_onglets").insert(lignes);
    const { data: apres } = await sb
      .from("cahier_onglets")
      .select("id, nom, ordre")
      .order("ordre");
    onglets = apres || [];
  }

  if (!ongletActif && onglets.length) ongletActif = onglets[0].id;
}

/* ---------------------------------------------------
   Charger les blocs de l'onglet actif
   --------------------------------------------------- */
async function chargerBlocs() {
  if (!ongletActif) { blocs = []; return; }
  const { data } = await sb
    .from("cahier_blocs")
    .select("id, date, type, contenu_texte")
    .eq("onglet_id", ongletActif)
    .order("date", { ascending: false });
  blocs = data || [];
}

/* ---------------------------------------------------
   Ajouter un bloc texte (daté d'aujourd'hui)
   --------------------------------------------------- */
async function ajouterBloc(texte) {
  const contenu = (texte || "").trim();
  if (!contenu) return;
  const aujourdhui = new Date().toISOString().slice(0, 10);
  await sb.from("cahier_blocs").insert([{
    onglet_id: ongletActif,
    date: aujourdhui,
    type: "texte",
    contenu_texte: contenu,
  }]);
  await chargerBlocs();
}

async function supprimerBloc(id) {
  await sb.from("cahier_blocs").delete().eq("id", id);
  await chargerBlocs();
}

/* ---------------------------------------------------
   Recherche par mot-clé
   portee : "tout" ou l'id d'un onglet
   --------------------------------------------------- */
async function lancerRecherche(mot, portee) {
  const terme = (mot || "").trim();
  if (!terme) { resultatsRecherche = null; return; }

  let requete = sb
    .from("cahier_blocs")
    .select("id, date, contenu_texte, onglet_id")
    .ilike("contenu_texte", `%${terme}%`)
    .order("date", { ascending: false });

  if (portee !== "tout") requete = requete.eq("onglet_id", portee);

  const { data } = await requete;
  resultatsRecherche = data || [];
}

/* ---------------------------------------------------
   Nom d'un onglet depuis son id
   --------------------------------------------------- */
function nomOnglet(id) {
  const o = onglets.find((x) => x.id === id);
  return o ? o.nom : "—";
}

/* ---------------------------------------------------
   Affichage
   --------------------------------------------------- */
export function renderCahier() {
  // Barre d'onglets
  const barre = onglets
    .map(
      (o) =>
        `<button class="sous-onglet${o.id === ongletActif ? " actif" : ""}" data-onglet="${o.id}">${o.nom}</button>`
    )
    .join("");

  // Zone de recherche
  const zoneRecherche = `
    <div class="carte">
      <div class="form-seq">
        <input type="text" id="champRecherche" placeholder="Rechercher un mot…" value="${recherche}">
        <select id="porteeRecherche">
          <option value="tout">Tout le cahier</option>
          <option value="${ongletActif}">Cet onglet</option>
        </select>
        <button class="bouton-doux" id="btnRecherche">Rechercher</button>
        ${resultatsRecherche !== null ? `<button class="bouton-doux" id="effacerRecherche">Effacer</button>` : ""}
      </div>
    </div>
  `;

  // Si une recherche est en cours : afficher les résultats
  if (resultatsRecherche !== null) {
    const res = resultatsRecherche.length
      ? resultatsRecherche
          .map(
            (r) => `
        <div class="carte carte-bloc">
          <div class="bloc-entete">
            <span class="hint">${r.date} · ${nomOnglet(r.onglet_id)}</span>
          </div>
          <div>${surligner(r.contenu_texte, recherche)}</div>
        </div>`
          )
          .join("")
      : `<p class="hint">Aucun résultat pour « ${recherche} ».</p>`;

    return `
      <h1>Cahier</h1>
      <div class="sous-onglets">${barre}</div>
      ${zoneRecherche}
      <h2>Résultats</h2>
      ${res}
    `;
  }

  // Affichage normal : les blocs de l'onglet actif
  const listeBlocs = blocs.length
    ? blocs
        .map(
          (b) => `
        <div class="carte carte-bloc">
          <div class="bloc-entete">
            <span class="hint">${b.date}</span>
            <button class="lien-suppr" data-bloc="${b.id}">✕</button>
          </div>
          <div>${echapper(b.contenu_texte)}</div>
        </div>`
        )
        .join("")
    : `<p class="hint">Aucune note dans cet onglet.</p>`;

  return `
    <h1>Cahier</h1>
    <div class="sous-onglets">${barre}</div>
    ${zoneRecherche}

    <div class="carte">
      <h2>Nouvelle note</h2>
      <textarea id="nouvelleNote" rows="3" style="width:100%" placeholder="Écris ici (clavier ou stylet)…"></textarea>
      <button class="bouton" id="ajouterBloc" style="margin-top:8px;">Ajouter</button>
    </div>

    ${listeBlocs}
  `;
}

/* Échapper le texte pour l'affichage (sécurité) */
function echapper(t) {
  return String(t ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[m]));
}

/* Surligner le terme recherché */
function surligner(texte, terme) {
  const propre = echapper(texte);
  if (!terme) return propre;
  const t = echapper(terme);
  return propre.replace(new RegExp(`(${t})`, "gi"), "<mark>$1</mark>");
}

/* ---------------------------------------------------
   Interactions
   --------------------------------------------------- */
export function bindCahier() {
  // Changer d'onglet
  document.querySelectorAll(".sous-onglet[data-onglet]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      ongletActif = btn.dataset.onglet;
      resultatsRecherche = null;
      await chargerBlocs();
      rafraichir();
    });
  });

  // Ajouter une note
  const ajout = document.getElementById("ajouterBloc");
  if (ajout) {
    ajout.addEventListener("click", async () => {
      const texte = document.getElementById("nouvelleNote").value;
      await ajouterBloc(texte);
      rafraichir();
    });
  }

  // Supprimer un bloc
  document.querySelectorAll(".lien-suppr[data-bloc]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await supprimerBloc(btn.dataset.bloc);
      rafraichir();
    });
  });

  // Recherche
  const btnR = document.getElementById("btnRecherche");
  if (btnR) {
    btnR.addEventListener("click", async () => {
      recherche = document.getElementById("champRecherche").value;
      const portee = document.getElementById("porteeRecherche").value;
      await lancerRecherche(recherche, portee);
      rafraichir();
    });
  }

  const effacer = document.getElementById("effacerRecherche");
  if (effacer) {
    effacer.addEventListener("click", () => {
      recherche = "";
      resultatsRecherche = null;
      rafraichir();
    });
  }
}

/* ---------------------------------------------------
   Redessiner
   --------------------------------------------------- */
function rafraichir() {
  const zone = document.getElementById("app");
  zone.innerHTML = renderCahier();
  bindCahier();
}

/* ---------------------------------------------------
   À l'ouverture
   --------------------------------------------------- */
export async function ouvrirCahier() {
  await chargerOnglets();
  await chargerBlocs();
  rafraichir();
}
