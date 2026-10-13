# Oil Perps Hyperliquid

Application Windows portable : historique du funding et des clôtures du Brent (`xyz:BRENTOIL`) et du WTI (`xyz:CL`, affiché **WTIOIL**). Collecteur, stockage et serveur local écrits en **C17**, compilés avec Microsoft Visual C. Interface locale HTML/CSS/JavaScript sans bibliothèque, CDN ou service d’hébergement.

## Lancer

1. Téléchargez le ZIP de la release et extrayez **tout** le dossier dans un emplacement où vous pouvez écrire.
2. Double-cliquez sur **Lancer.cmd** ou **OilPerps.exe**. L’interface s’ouvre à `http://127.0.0.1:18764/` dans le navigateur par défaut.
3. Pour garder la collecte après les redémarrages, lancez **Installer-demarrage.cmd**. Aucun droit administrateur n’est nécessaire. Le collecteur démarre discrètement à l’ouverture de votre session Windows.

Fermer l’onglet ne ferme pas le collecteur. Son icône dans la zone de notification permet d’ouvrir l’interface, synchroniser ou quitter. **Retirer-demarrage.cmd** retire uniquement le démarrage automatique. Pour arrêter le collecteur en ligne de commande : `OilPerps.exe --stop`.

Windows 10/11 x64 ; connexion Internet pour les nouvelles données ; navigateur moderne. L’exécutable utilise le runtime C statique : aucun Python, Node.js ou Visual Studio n’est nécessaire à l’utilisation. Le port 18764 doit être libre. Une seule instance par session Windows.

## Données et horaire

- **data/history.json** contient les historiques de marché. Il est livré avec un premier téléchargement puis mis à jour automatiquement.
- Collecte au démarrage, puis chaque heure à **HH:01 UTC**, soit également minute 01 dans les fuseaux à décalage entier, dont Europe/Paris. Une erreur réseau ou un dernier paiement encore absent déclenche une nouvelle tentative sous cinq minutes.
- Au retour après une fermeture, veille ou coupure réseau, les intervalles absents sont redemandés à l’API. Le programme conserve toutes les observations déjà téléchargées.
- Le funding source est horaire parce que l’API ne propose pas de funding natif 4H/1D. La pagination récupère l’historique disponible depuis le premier paiement, sans limite locale de 500 observations.
- Les graphiques **4H** et **Daily** additionnent respectivement 4 ou 24 taux horaires. Aucune annualisation ni capitalisation. Une période manquant d’un paiement n’est pas affichée comme complète.
- Les prix sont les **clôtures natives 4H et 1D**. Les bougies en formation sont exclues. L’API expose les 5 000 dernières bougies par intervalle. Au téléchargement initial, les 4H remontaient au début du funding des deux marchés ; cette couverture devra être revue si une installation future intervient plus de 5 000 périodes après leur lancement.
- Les timestamps sont des millisecondes Unix UTC et représentent la **fin** de période. Le timestamp réel du paiement de funding est également conservé dans `sourceTime` ; `time` est arrondi à l’heure pour aligner les paiements et les clôtures.
- Chaque série fournit son nombre de lignes, sa couverture et ses `missingRanges`. Aucune donnée absente n’est interpolée. Des trous devenus antérieurs à la rétention de l’API restent signalés, sans prix inventé.

À 04:01 UTC, par exemple, le programme récupère le paiement de 04:00 et la bougie 4H clôturée à 04:00. Le funding 00:00–04:00 est la somme des paiements de 01:00, 02:00, 03:00 et 04:00. En daily, la période se termine à 00:00 UTC le lendemain.

Le JSON est écrit dans un fichier temporaire, vidé sur disque puis remplacé atomiquement. La version précédente est conservée dans `history.backup.json`. Si le fichier principal est corrompu, une sauvegarde valide est restaurée ; si les deux sont illisibles, le programme refuse de les écraser. Les erreurs publiques de collecte sont consignées dans `data/collector.log`.

Le collecteur ne s’exécute pas lorsque Windows est arrêté ou en veille. Le rattrapage intervient au réveil/démarrage. La machine doit rester allumée pour une collecte ponctuelle à chaque HH:01.

Le bouton **Sync now** demande une collecte supplémentaire ; il ne remplace pas la synchronisation automatique au lancement et à HH:01. Un échec affiche un code (`HTTP_429`, `HTTP_503`, `WINHTTP_12007`, etc.), conservé dans `lastError` du JSON et dans le journal avec l’heure UTC et le numéro de tentative. Les erreurs d’écriture sont également journalisées (`STORE_WIN32_...`).

## Langues

L’interface s’affiche en anglais par défaut. Le sélecteur propose anglais, français, chinois simplifié, coréen, japonais, italien et espagnol. Le choix de langue est conservé localement dans le navigateur ; il ne contient aucune adresse de compte. Dates et nombres utilisent également la langue choisie. Les noms des marchés, les noms personnels de sous-comptes et les codes d’erreur ne nécessitent pas de traduction.

## Graphiques

Une ligne claire en pointillés indique **0 % · zéro funding** sur le graphique de funding et sur le graphique combiné.

Le sélecteur de langue est centré dans la bannière. Le bouton de collecte manuelle se trouve à côté de son état. Les noms **Brent ↗** et **WTI ↗** dans les cartes de prix ouvrent leurs marchés Hyperliquid.

Trois graphiques synchronisés : funding des deux marchés, clôtures des deux marchés, puis les quatre courbes superposées. Dans la vue combinée : funding en % sur l’axe gauche, prix USD sur l’axe droit ; les prix sont en pointillés. Choix 4H/Daily, 7/30/90 jours ou tout l’historique, horaires UTC ou locaux, zoom à la molette, déplacement par glisser et valeurs au survol. Double-clic pour réinitialiser.

## Indicateurs historiques

Les indicateurs se recalculent à chaque nouveau JSON, même si le graphique est zoomé sur une courte période :

- **Funding annualisé réalisé** = moyenne de tous les taux horaires disponibles × 8 760 × 100. Il décrit un rythme annuel calculé à partir de paiements passés ; il ne représente pas un paiement effectivement reçu sur une année entière. Les taux positifs correspondent au funding payé par un long et reçu par un short.
- **Funding cumulé sur les 12 derniers mois** = somme des taux horaires réalisés sur les 365 jours précédant le dernier paiement. L’historique disponible étant initialement inférieur à un an, la couverture est explicitement indiquée comme partielle. Le cumul total et le nombre de jours observés sont affichés à côté.
- **Corrélation des prix** = coefficient de Pearson × 100 sur les clôtures Brent/WTI aux timestamps communs de tout l’historique, en 4H ou daily selon la sélection. Les périodes avant le lancement du Brent sont exclues faute de prix Brent. −100 % représente une relation linéaire inverse parfaite, +100 % une relation positive parfaite. Il s’agit de la corrélation des niveaux de prix, pas de leurs rendements. La taille de l’échantillon et les dates communes sont affichées. Si les séries sont constantes ou trop courtes, la valeur reste indisponible.

## Positions du compte

Saisissez une **adresse publique** dans le champ vide et cliquez sur **Scanner le compte**. Le programme consulte les positions ouvertes sur le DEX `xyz` du compte principal et de ses sous-comptes, puis actualise chaque minute. Le funding des positions concerne les deux marchés pétroliers uniquement.

- Prix d’entrée moyen pondéré par la **taille absolue** des positions. Les moyennes longues et courtes sont indiquées séparément lorsque les deux directions coexistent : leur moyenne globale n’est pas un prix de revient d’une position nette.
- Funding net en USDC **depuis l’ouverture des positions encore ouvertes**, additionné entre comptes. Positif = reçu ; négatif = payé. La valeur provient de `-cumFunding.sinceOpen` ; la convention a été comparée aux paiements `userFunding.delta.usdc`. Il ne s’agit ni du taux de marché ni du funding historique de toutes les positions déjà fermées.
- Lignes horizontales d’entrée moyenne et de liquidation dans les graphiques prix et combiné. Les seuils de liquidation de chaque compte restent visibles. S’il y en a plusieurs, une moyenne pondérée supplémentaire est affichée, explicitement **indicative**. Elle ne représente pas un seuil auquel les comptes se liquideraient ensemble.
- Les seuils absents (`liquidationPx: null`) restent indisponibles ; ils ne sont pas remplacés par zéro. Ils sont exclus de la moyenne indicative. Les calculs des montants et des moyennes utilisent des entiers décimaux en JavaScript et sont arrondis uniquement à l’affichage.
- Le tableau détaille tailles, entrées, liquidations et funding par compte. Un échec de sous-compte est signalé comme résultat partiel.

Le champ est **toujours vierge au lancement de la page**. L’adresse et les résultats du compte restent uniquement en mémoire, sans stockage dans le JSON, les journaux, les préférences navigateur ou le dépôt. **Effacer** retire les données en mémoire. L’adresse est transmise à l’API publique Hyperliquid pour la consultation. Aucun portefeuille à connecter, signature, clé privée ou ordre de trading.

La lecture automatique est limitée à 100 sous-comptes, avec avertissement au-delà. Les données API peuvent changer pendant la lecture de comptes distincts. Les lignes actuelles sont des repères horizontaux et ne reconstituent pas l’historique de votre position.

## Compiler et vérifier

Installez Visual Studio 2022 Build Tools avec la charge **Développement Desktop en C++** puis exécutez **build.cmd**. Il détecte MSVC, compile un exécutable x64 C17 avec `/MT`, et exécute les tests C. Si Node.js est installé, les tests de calculs de l’interface sont aussi exécutés.

```powershell
.\build.cmd
Start-Process .\OilPerps.exe -ArgumentList '--sync' -Wait
```

`--sync` effectue une collecte unique, écrit le JSON puis quitte (code 0 : succès, 1 : échec partiel, 2 : erreur locale, 3 : collecteur déjà actif). `--background` démarre le collecteur sans ouvrir d’onglet. Pour recopier le dossier, arrêter d’abord le collecteur afin d’emporter un JSON cohérent.

Organisation : `src/` collecteur C et intégration Windows ; `web/` interface ; `vendor/` cJSON 1.7.19 sous licence MIT ; `tests/` tests de fusion, déduplication, trous, sauvegarde/lecture, agrégation et précision ; `.github/workflows/` compilation automatisée Windows.

## Sources

- [API info Hyperliquid : pagination, bougies, sous-comptes](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint)
- [API perps : funding et état des positions](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals)
- [`meta` du DEX xyz](https://api.hyperliquid.xyz/info) : requête POST `{"type":"meta","dex":"xyz"}` pour les noms canoniques.
- [cJSON v1.7.19](https://github.com/DaveGamble/cJSON/releases/tag/v1.7.19)

Le dépôt et le paquet distribuent uniquement le code et des données publiques de marché. Licence MIT pour le logiciel, licence tierce conservée dans `vendor/LICENSE.cJSON`.
