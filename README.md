# 🎨 ELIAN

Application de suivi des cours d'arts plastiques.
Fichiers hébergés sur GitHub, données sur Supabase.
Architecture inspirée d'AgoraMosaïque (application à page unique, données par année scolaire, écriture stylet convertie en texte cherchable).

---

## 🗄️ Base de données (Supabase)

La structure est en place : un schéma dédié `elian` contenant **23 tables**.
Rien n'est stocké en double sans raison : beaucoup d'informations (note du mois en cours, total d'une séquence, roulement du matériel, absents récents) se **calculent** à partir des annotations et des visites, plutôt que d'être enregistrées.

### Principes
- Tout est rangé par **année scolaire** ; une seule année est active à la fois.
- Un élève n'a pas d'année propre : son année vient de sa classe.
- Deux tables sont centrales : `seances` (une heure de cours, presque tout s'y rattache) et `annotations` (chaque code posé sur un élève).

### Les 23 tables par famille

**Socle** — `annees`, `classes`, `eleves`

**Emploi du temps** — `semaines`, `edt_semaines` (type A/B/vacances), `edt_cases` (grille), `jours_speciaux` (vacances et fériés)

**Table centrale** — `seances`

**Plan de classe** — `ilots`, `sieges` (places fixes), `objets_tournants` (poste à colle, tables grise/blanche, ballon, coussin), `visites`

**Codes & annotations** — `codes` (le tableau de critères), `annotations` (le cœur : comportement, absences, matériel)

**Évaluation de séquence** — `sequences`, `criteres_sequence`, `notes_sequence`

**Suivi** — `notes_engagement` (mois écoulés), `documents_positionnement`, `vocabulaire`

**Compléments emploi du temps** — `annulations` (avec motif), `evenements` (visites stagiaires, formations…)

**Cahier** — `cahier_onglets`, `cahier_blocs`

---

## 📱 L'application, page par page

L'application fonctionne comme une seule fenêtre où l'on change de page via un menu.
Ordre du menu : Plan de classe · Emploi du temps · Calendrier · Suivi · Cahier · Import/Export.
Les réglages (tableau des codes, gestion des classes) s'ouvrent en fenêtre depuis là où on en a besoin.

### 📍 Plan de classe
Le cœur de l'application : la salle vue du dessus.
- En haut : nom de la classe et professeur principal. Au démarrage d'un cours, une fenêtre rappelle le contenu du cours précédent.
- **Places fixes** (9 îlots) : chaque élève a sa place, attribuée en amont.
- **Places tournantes** : la table grise, la blanche, le ballon et le coussin affichent les derniers élèves qui y sont passés (roulement juste) ; le poste à colle sert à évaluer le nettoyage.
- **Annotation au stylet** : on écrit un code directement sur le nom (comportement, absence « A », matériel…).
- **Évaluation de séquence sans quitter le plan** : un clic long ou un entourage du prénom ouvre le barème de la séquence en cours.
- Les noms d'élèves absents récemment se colorent (bleu pour une séance manquée, rouge dès deux d'affilée).
- Passage au cours suivant **manuel** : à l'heure de fin, une fenêtre propose de passer à la classe suivante ; rien n'est forcé.

### 🗓️ Emploi du temps
La grille jours × créneaux, avec report intelligent.
- On pose les classes case par case ; une semaine type se recopie sur ses semaines jumelles (types A / B, vacances détectées automatiquement).
- Un repère visuel signale les heures déjà faites.
- **Annulation** de cours (sélection d'une ou plusieurs cases) avec motif, et **évènements** personnels (visite stagiaire, formation…) posés sur n'importe quel créneau. Les deux remontent dans le Calendrier réel.
- « Préparer une année » génère les semaines et récupère le calendrier des vacances.

### 📅 Calendrier
L'outil de planification pédagogique.
- Chaque case affiche le nom de la séquence et le numéro de séance ; un clic ouvre la fiche détaillée.
- La **séquence** porte le cadre commun (critères d'évaluation propres à la séquence, vocabulaire) ; chaque **séance** porte son objectif et son minutage.
- **Évaluation de séquence** : plusieurs critères notés séparément, puis un total. Les absences apparaissent à côté des notes pour adapter l'évaluation.
- Trois vues : prévisionnel, réel (avec annulations et évènements), et fusion des deux.

> Deux notes distinctes cohabitent sans se mélanger : la **note d'engagement** (comportement, issue des codes) et l'**évaluation de séquence** (travail).

### 📄 Suivi
Tout ce qui découle des annotations du plan.
- **Document de positionnement** par élève et par trimestre : des faits rédigés automatiquement en clair, complétés par une zone de synthèse libre. Modifiable avant remise à la famille.
- **Note d'engagement et de responsabilité** : part de 10/20 chaque mois, évolue selon les points. Les notes des mois écoulés sont archivées pour suivre la progression.
- **Suivi du matériel** : qui a utilisé quoi et quand, pour un roulement juste.
- **Suivi des absences** par trimestre.

### 📓 Cahier
Un cahier à intercalaires pour les notes personnelles.
- Onglets : Baroque, Réunion, Projet, Séquences en réflexion, Progression, Organisation idéale, Stagiaire, et un onglet libre.
- Chaque onglet est une toile libre où l'on pose des blocs datés (texte, dessins au stylet, images collées).
- Recherche par mot-clé dans tout le cahier ou dans un onglet (porte sur le texte).

### 📥 Import / Export
La porte d'entrée et la sortie des données.
- **Import CSV** des élèves (colonnes : prénom, nom, classe, genre) ; les classes se créent automatiquement.
- Gestion **individuelle** en cours d'année : ajouter, corriger ou supprimer un élève. À la suppression, choix entre effacement définitif et **archivage** (l'historique est conservé).
- Bascule d'une **année scolaire** à l'autre sans perdre les données précédentes.
- **Export** des données par classe au format CSV.

---

*Projet en cours. La base de données est en place ; l'étape suivante est le branchement de l'application.*
