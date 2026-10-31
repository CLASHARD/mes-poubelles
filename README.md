# Mes poubelles

Petit site statique pour suivre les collectes jaune et ménagère.

## Publication GitHub Pages
1. Déposer tous les fichiers et dossiers de cette archive à la racine du dépôt `mes-poubelles`.
2. Dans GitHub : **Settings → Pages**.
3. Dans **Build and deployment**, choisir **Deploy from a branch**.
4. Choisir la branche `main` et le dossier `/ (root)`, puis enregistrer.
5. Attendre la publication. L'adresse sera `https://clashard.github.io/mes-poubelles/`.

## Fonctionnement actuel
- Calendrier 2026 prérempli dans `collectes.json`.
- Ajout, modification et suppression des dates depuis l'interface.
- Confirmation « Sortie » pour chaque collecte.
- Les changements sont enregistrés dans le stockage local du navigateur.

## Important
Cette première version n'envoie pas encore de notification Telegram et ne synchronise pas les changements entre plusieurs téléphones/ordinateurs. Le branchement sécurisé des rappels Telegram et du stockage partagé sera ajouté dans une prochaine étape. Ne place jamais un jeton de bot Telegram dans les fichiers publics du site.
