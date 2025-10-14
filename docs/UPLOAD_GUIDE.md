# Guide d'utilisation des modules d'upload

## Vue d'ensemble

Ce projet utilise Multer pour gérer l'upload de fichiers avec une configuration sécurisée et organisée. Trois modules d'upload sont disponibles :

- **Photos** : Photos de profil utilisateur
- **Documents** : Documents d'identité (CNI, passeport)
- **Véhicules** : Photos de véhicules et certificats

## Structure des répertoires

```
public/
└── uploads/
    ├── photos/          # Photos de profil utilisateur
    ├── documents/       # Documents d'identité
    └── vehicules/       # Photos et certificats de véhicules
```

## Configuration Multer

### Photos de profil (`uploads/photos/index.js`)
- **Taille max** : 5MB
- **Types acceptés** : JPEG, PNG, JPG, WebP
- **Champ** : `photo`
- **URL publique** : `/uploads/photos/filename`

### Documents d'identité (`uploads/documents/index.js`)
- **Taille max** : 10MB
- **Types acceptés** : PDF, JPEG, PNG, JPG, WebP
- **Champ** : `photoDocument`
- **URL publique** : `/uploads/documents/filename`

### Photos de véhicules (`uploads/vehicules/index.js`)
- **Taille max** : 8MB
- **Types acceptés** : JPEG, PNG, JPG, WebP
- **Champ** : `photoVehicule`
- **URL publique** : `/uploads/vehicules/filename`

## Utilisation dans les routes

### Upload photo de profil
```javascript
const { uploadSingle } = require('../uploads/photos');

router.post('/photo-profil', 
  protect, 
  uploadSingle, 
  uploadPhotoProfil
);
```

### Upload document d'identité
```javascript
const { uploadDocument } = require('../uploads/documents');

router.post('/document-identite', 
  protect, 
  uploadDocument, 
  validateDocumentUpload, 
  uploadDocumentIdentite
);
```

### Upload photo de véhicule
```javascript
const { uploadPhotoVehicule } = require('../uploads/vehicules');

router.post('/vehicule', 
  protect, 
  uploadPhotoVehicule, 
  creerVehicule
);
```

## Fonctions utilitaires

Chaque module d'upload expose des fonctions utilitaires :

### `getPublicUrl(filename)`
Génère l'URL publique d'un fichier uploadé.

```javascript
const { getPublicUrl } = require('../uploads/photos');
const photoUrl = getPublicUrl('photo-1234567890.jpg');
// Résultat: /uploads/photos/photo-1234567890.jpg
```

### `deleteFile(filename)`
Supprime un fichier du serveur.

```javascript
const { deleteFile } = require('../uploads/photos');
const deleted = deleteFile('photo-1234567890.jpg');
// Supprime le fichier et retourne true si succès
```

## Gestion des erreurs

### Types d'erreurs courantes
- **Fichier trop volumineux** : Limite de taille dépassée
- **Type de fichier non supporté** : Format non autorisé
- **Aucun fichier uploadé** : Champ `req.file` manquant

### Exemple de gestion d'erreur
```javascript
const uploadPhotoProfil = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'Aucun fichier uploadé' 
      });
    }

    // Traitement du fichier...
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: "Erreur lors de l'upload", 
      error: error.message 
    });
  }
};
```

## Sécurité

### Validation des fichiers
- Vérification des types MIME
- Limitation de la taille
- Nettoyage des noms de fichiers
- Validation des extensions

### Stockage sécurisé
- Fichiers stockés hors du répertoire public
- URLs générées dynamiquement
- Suppression automatique des anciens fichiers

## Exemple complet

### Route d'upload
```javascript
// routes/utilisateur.js
const { uploadSingle } = require('../uploads/photos');

router.post('/photo-profil', protect, uploadSingle, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'Aucun fichier uploadé' 
      });
    }

    // Générer l'URL publique
    const { getPublicUrl } = require('../uploads/photos');
    const photoUrl = getPublicUrl(req.file.filename);

    // Mettre à jour l'utilisateur
    const utilisateur = await Utilisateur.findByIdAndUpdate(
      req.user.id,
      { photoProfil: photoUrl },
      { new: true }
    );

    res.json({ 
      success: true, 
      data: { photoProfil: utilisateur.photoProfil } 
    });

  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Erreur serveur' 
    });
  }
});
```

### Test côté client
```javascript
// Test avec FormData
const formData = new FormData();
formData.append('photo', fileInput.files[0]);

fetch('/api/utilisateurs/photo-profil', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
})
.then(response => response.json())
.then(data => {
  if (data.success) {
    console.log('Photo uploadée:', data.data.photoProfil);
  }
});
```

## Maintenance

### Nettoyage des fichiers
Les anciens fichiers sont automatiquement supprimés lors du remplacement :
- Photo de profil : ancienne photo supprimée
- Document d'identité : ancien document supprimé
- Photo de véhicule : ancienne photo supprimée

### Surveillance des répertoires
- Vérification de l'espace disque
- Rotation des logs d'upload
- Archivage des anciens fichiers si nécessaire

## Dépannage

### Problèmes courants
1. **Erreur "ENOENT"** : Répertoire d'upload manquant
2. **Erreur "LIMIT_FILE_SIZE"** : Fichier trop volumineux
3. **Erreur "LIMIT_FILE_COUNT"** : Trop de fichiers uploadés

### Solutions
1. Vérifier que les répertoires existent
2. Augmenter les limites dans la configuration
3. Vérifier la configuration Multer

## Support

Pour toute question ou problème :
- Vérifier les logs du serveur
- Tester avec le fichier `test/upload-test.js`
- Consulter la documentation Multer
