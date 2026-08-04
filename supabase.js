/* ===================================================
   ELIAN — Connexion à Supabase
   Ce fichier ouvre le lien vers ta base de données.
   =================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Tes deux valeurs (récupérées dans Supabase)
const URL_PROJET = "https://qurwzbjneklkriazgjox.supabase.co";
const CLE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1cnd6YmpuZWtsa3JpYXpnam94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MzIyNzMsImV4cCI6MjEwMTQwODI3M30.lJkM6eZF3pp6slxX--fNK9wEKKF5cKHNX8Iz0786Z8k";

// On ouvre la connexion, en visant l'espace "elian"
export const sb = createClient(URL_PROJET, CLE_ANON, {
  db: { schema: "elian" },
});

// Pratique : accessible partout dans l'appli
window.sb = sb;
