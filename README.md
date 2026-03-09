# 🦊 Kiro PWA — kreuille.github.io/Gouda

Interface multi-IA (Kiro v2.2) transformée en **Progressive Web App** avec backup JSON sur GitHub.

## 🚀 Déploiement

### 1. Pousser le repo sur GitHub

```bash
git init
git remote add origin https://github.com/kreuille/Gouda.git
git add .
git commit -m "feat: Kiro PWA v2.2"
git push -u origin main
```

### 2. Activer GitHub Pages

Dans `Settings → Pages` du repo Gouda :
- **Source** : `GitHub Actions`

Le workflow `.github/workflows/deploy.yml` déploie automatiquement à chaque push sur `main`.

L'app sera disponible sur : **https://kreuille.github.io/Gouda/**

---

## 🔑 Backup GitHub — Configuration

Le backup JSON (`kiro-backup.json`) est stocké directement dans ce repo via l'API GitHub Contents.

### Créer un Personal Access Token (PAT)

1. Aller sur [github.com/settings/tokens/new](https://github.com/settings/tokens/new?scopes=repo&description=Kiro+Backup)
2. Cocher le scope **`repo`** (lecture + écriture)
3. Générer et copier le token (`ghp_...`)

### Dans Kiro

Dans la sidebar, section **GitHub Backup** :
- ⚙️ **Bouton engrenage** → coller votre PAT → Enregistrer
- ⬆️ **Push** → sauvegarder toutes vos données vers `kiro-backup.json` dans ce repo
- ⬇️ **Pull** → restaurer depuis le dernier backup GitHub

> Le PAT est stocké dans votre `localStorage` local et n'est jamais envoyé ailleurs que `api.github.com`.

---

## 📱 Installer comme app (PWA)

- **Chrome/Edge (desktop)** : icône d'installation dans la barre d'adresse
- **Android (Chrome)** : menu → "Ajouter à l'écran d'accueil"
- **iOS (Safari)** : bouton partage → "Sur l'écran d'accueil"

## 🗂️ Structure

```
Gouda/
├── index.html              # App principale
├── manifest.json           # Config PWA
├── sw.js                   # Service Worker (cache offline)
├── models.js               # Définitions des modèles IA
├── css/style.css
├── js/
│   ├── api.js              # Appels API IA
│   ├── app.js              # Logique principale
│   ├── filemanager.js      # IndexedDB / localStorage
│   └── github-backup.js   # Sync backup ↔ GitHub
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
├── kiro-backup.json        # ← créé automatiquement par le Push
└── .github/workflows/deploy.yml
```
