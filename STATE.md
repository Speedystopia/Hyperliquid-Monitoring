# État du projet — 13 octobre 2026

- Application Windows x64 C17, compilée avec MSVC 2022, runtime statique. Interface locale `http://127.0.0.1:18764/`.
- Marchés canoniques : `xyz:BRENTOIL` et `xyz:CL` (WTIOIL dans l’interface Hyperliquid).
- Graphiques 4H et 1D uniquement ; funding horaire conservé comme source pour les agrégations exactes et l’annualisation historique.
- Premier historique : 5 340 paiements Brent depuis le 4 mars, 6 709 paiements WTI depuis le 6 janvier ; 1 334 / 1 677 clôtures 4H et 223 / 280 clôtures daily. Aucun trou dans les séries récupérées, au paiement du 13 octobre 03:00 UTC.
- Collecte au démarrage et à HH:01, rattrapage des trous, retry à cinq minutes, sauvegarde atomique avec backup, erreurs codées dans le JSON et le journal.
- Positions : adresse saisie uniquement en mémoire, principal et sous-comptes, prix pondérés, liquidations réelles et moyenne indicative, funding net depuis ouverture. Adresse de test exclue des livrables.
- Indicateurs : moyenne historique des taux horaires annualisée, cumuls réalisés total et 12 mois avec couverture partielle ; corrélation de Pearson des prix appariés sur tout l’historique commun.
- Langues : anglais par défaut, français, chinois simplifié, coréen, japonais, italien et espagnol. Sélecteur centré dans la bannière ; synchronisation à côté de l’état ; liens discrets vers les marchés dans les cartes de prix.
- Vérifications : tests C et JS, scan de deux positions réelles, sept langues et graphiques inspectés ; rattrapage réel de 502 paiements supprimés et de clôtures supprimées sur une copie ; récupération d’un JSON corrompu depuis sa sauvegarde ; test injecté de code HTTP_503.
- Limites : collecte pendant la session Windows active ; rétention API de 5 000 bougies par intervalle ; historique annuel encore inférieur à un an. Sous-comptes multiples vérifiés avec données de calcul simulées, le compte réel de test n’en possédait pas.

Reprise : modifier les sources, exécuter `build.cmd`, vérifier le parcours concerné, arrêter le collecteur avant de recopier le dossier. Ne jamais enregistrer une adresse utilisateur dans les fixtures, le JSON public ou les captures distribuées.
