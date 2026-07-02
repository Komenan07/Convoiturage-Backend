// services/utils/normalizer.js
/**
 * Normalise les données d'événements provenant de différentes sources
 * Pour les rendre compatibles avec le modèle Evenement de WAYZ-ECO
 */
class Normalizer {
  
  /**
   * Normalise un événement brut en format WAYZ-ECO
   * @param {Object} rawEvent - Événement brut de la source
   * @param {String} source - Nom de la source (FACEBOOK, GOOGLE_PLACES, RSS, EVENTBRITE)
   * @returns {Object} Événement normalisé ou null si invalide
   */
  static normalize(rawEvent, source) {
    if (!rawEvent) return null;

    try {
      const normalized = {
        // Identifiant externe unique
        identifiantExterne: this._extractId(rawEvent, source),
        source: source || 'UNKNOWN',
        sourceDetection: 'AUTOMATIQUE',

        // Informations de base
        nom: this._extractNom(rawEvent),
        description: this._extractDescription(rawEvent, source),
        typeEvenement: this._extractType(rawEvent, source),

        // Dates
        dateDebut: this._extractDateDebut(rawEvent),
        dateFin: this._extractDateFin(rawEvent),

        // Lieu
        lieu: this._extractLieu(rawEvent, source),

        // Organisateur
        organisateur: this._extractOrganisateur(rawEvent, source),

        // Images
        images: this._extractImages(rawEvent, source),

        // Métadonnées
        urlSource: this._extractLienExterne(rawEvent),
        capaciteEstimee: this._extractCapacite(rawEvent),
        tarifEstime: this._extractTarif(rawEvent),

        // Statut par défaut
        statutEvenement: 'PROGRAMME',
        
        // Score de confiance (sera défini par le service)
        confiance: 0
      };

      // Validation minimale
      if (!normalized.nom || !normalized.dateDebut) {
        console.warn(`⚠️  Événement invalide (nom ou date manquant): ${JSON.stringify(rawEvent).substring(0, 100)}`);
        return null;
      }

      return normalized;
    } catch (error) {
      console.error(`❌ Erreur normalisation événement (${source}):`, error);
      return null;
    }
  }

  // ========================================================================
  // EXTRACTEURS PAR CHAMP
  // ========================================================================

  /**
   * Extrait l'identifiant unique d'un événement
   */
  static _extractId(raw, source) {
    if (raw.id) return String(raw.id);
    if (raw.eventId) return String(raw.eventId);
    if (raw.guid) return String(raw.guid);
    if (raw.place_id) return String(raw.place_id);
    
    // Générer un ID basé sur le nom et la date
    const name = (raw.name || raw.title || raw.nom || '').substring(0, 20);
    const date = raw.start_time || raw.dateDebut || raw.pubDate || Date.now();
    return `${source}_${name}_${new Date(date).getTime()}`.replace(/[^a-zA-Z0-9_]/g, '');
  }

  /**
   * Extrait le nom de l'événement
   */
  static _extractNom(raw) {
    return raw.name || raw.title || raw.nom || raw.summary || 'Événement sans titre';
  }

  /**
   * Extrait la description selon la source
   */
  static _extractDescription(raw, source) {
    if (source === 'FACEBOOK') {
      return raw.description || raw.about || '';
    }
    if (source === 'GOOGLE_PLACES') {
      return raw.editorial_summary?.overview || raw.types?.join(', ') || '';
    }
    if (source === 'RSS') {
      const desc = raw.description || raw.content || '';
      return this._stripHtml(desc);
    }
    if (source === 'EVENTBRITE') {
      return raw.description?.text || raw.summary || '';
    }
    return raw.description || '';
  }

  /**
   * Extrait et déduit le type d'événement
   */
  static _extractType(raw, source) {
    const types = {
      'concert': 'CONCERT',
      'music': 'CONCERT',
      'musique': 'CONCERT',
      'festival': 'FESTIVAL',
      'conference': 'CONFERENCE',
      'conférence': 'CONFERENCE',
      'seminar': 'CONFERENCE',
      'séminaire': 'CONFERENCE',
      'workshop': 'CONFERENCE',
      'atelier': 'CONFERENCE',
      'exposition': 'SALON',
      'trade show': 'SALON',
      'salon': 'SALON',
      'wedding': 'MARIAGE',
      'mariage': 'MARIAGE',
      'ceremony': 'CEREMONIE',
      'cérémonie': 'CEREMONIE',
      'sport': 'SPORT',
      'match': 'SPORT',
      'compétition': 'SPORT',
      'stadium': 'SPORT',
      'stade': 'SPORT',
      'museum': 'SALON',
      'musée': 'SALON',
      'musee': 'SALON',
      'gallery': 'SALON',
      'galerie': 'SALON',
      'art': 'SALON'
    };

    // Chercher dans le nom et la description
    const searchText = `${this._extractNom(raw)} ${this._extractDescription(raw, source)}`.toLowerCase();
    
    for (const [keyword, type] of Object.entries(types)) {
      if (searchText.includes(keyword)) {
        return type;
      }
    }

    // Type depuis les métadonnées
    if (raw.category) {
      const cat = String(raw.category).toLowerCase();
      if (types[cat]) return types[cat];
    }

    return 'AUTRE';
  }

  /**
   * Extrait la date de début
   */
  static _extractDateDebut(raw) {
    const dateFields = [
      'start_time',
      'dateDebut',
      'startDate',
      'start',
      'pubDate',
      'published',
      'date'
    ];

    for (const field of dateFields) {
      if (raw[field]) {
        const date = new Date(raw[field]);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    return null;
  }

  /**
   * Extrait la date de fin (ou calcule +3h si absente)
   */
  static _extractDateFin(raw) {
    const dateFields = [
      'end_time',
      'dateFin',
      'endDate',
      'end'
    ];

    for (const field of dateFields) {
      if (raw[field]) {
        const date = new Date(raw[field]);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    // Si pas de date de fin, utiliser date début + 3 heures par défaut
    const dateDebut = this._extractDateDebut(raw);
    if (dateDebut) {
      const dateFin = new Date(dateDebut);
      dateFin.setHours(dateFin.getHours() + 3);
      return dateFin;
    }

    return null;
  }

  /**
   * Extrait les informations du lieu
   */
  static _extractLieu(raw, source) {
    const lieu = {
      nom: '',
      adresse: 'Abidjan, Côte d\'Ivoire', // ✅ MODIFIÉ : Valeur par défaut
      ville: 'Abidjan',
      commune: 'COCODY', // ✅ MODIFIÉ : Valeur par défaut en MAJUSCULES
      quartier: '',
      coordonnees: null
    };

    // Extraction du nom du lieu
    if (raw.place || raw.venue) {
      const place = raw.place || raw.venue;
      lieu.nom = place.name || '';
      const adresseExtracted = this._extractAdresse(place);
      if (adresseExtracted && adresseExtracted.trim() !== '') {
        lieu.adresse = adresseExtracted;
      }
    } else if (raw.location) {
      lieu.nom = raw.location.name || '';
      const adresseExtracted = this._extractAdresse(raw.location);
      if (adresseExtracted && adresseExtracted.trim() !== '') {
        lieu.adresse = adresseExtracted;
      }
    }

    // Extraction des coordonnées
    const coords = this._extractCoordonnees(raw, source);
    if (coords) {
      lieu.coordonnees = {
        type: 'Point',
        coordinates: coords
      };
    }

    // Extraction commune/quartier pour Abidjan
    if (lieu.adresse && lieu.adresse !== 'Abidjan, Côte d\'Ivoire') {
      const extracted = this._extractCommuneQuartier(lieu.adresse);
      if (extracted.commune && extracted.commune.trim() !== '') {
        lieu.commune = extracted.commune.toUpperCase(); // ✅ AJOUTÉ : Conversion en majuscules
      }
      if (extracted.quartier) {
        lieu.quartier = extracted.quartier;
      }
    }

    // ✅✅✅ CRITIQUE : Garantir que commune n'est JAMAIS vide
    if (!lieu.commune || lieu.commune.trim() === '') {
      lieu.commune = 'COCODY';
    }

    return lieu;
  }

  /**
   * Compose une adresse depuis un objet location
   */
  static _extractAdresse(location) {
    if (!location) return '';

    if (typeof location === 'string') return location;

    // Composer l'adresse depuis les champs disponibles
    const parts = [];
    
    if (location.street || location.address || location.address_1) {
      parts.push(location.street || location.address || location.address_1);
    }
    if (location.city) parts.push(location.city);
    if (location.country) parts.push(location.country);

    if (parts.length > 0) return parts.join(', ');

    // Fallback
    return location.formatted_address || location.display_name || '';
  }

  /**
   * Extrait les coordonnées GPS selon la source
   */
  static _extractCoordonnees(raw, _source) {
    // Facebook
    if (raw.place?.location) {
      const loc = raw.place.location;
      if (loc.latitude && loc.longitude) {
        return [parseFloat(loc.longitude), parseFloat(loc.latitude)];
      }
    }

    // Google Places
    if (raw.geometry?.location) {
      const loc = raw.geometry.location;
      if (loc.lat && loc.lng) {
        return [parseFloat(loc.lng), parseFloat(loc.lat)];
      }
    }

    // Eventbrite
    if (raw.venue) {
      const venue = raw.venue;
      if (venue.latitude && venue.longitude) {
        return [parseFloat(venue.longitude), parseFloat(venue.latitude)];
      }
    }

    // Format générique
    if (raw.latitude && raw.longitude) {
      return [parseFloat(raw.longitude), parseFloat(raw.latitude)];
    }
    if (raw.lat && raw.lon) {
      return [parseFloat(raw.lon), parseFloat(raw.lat)];
    }
    if (raw.lat && raw.lng) {
      return [parseFloat(raw.lng), parseFloat(raw.lat)];
    }

    // Coordonnées GeoJSON
    if (raw.coordinates && Array.isArray(raw.coordinates)) {
      return raw.coordinates;
    }

    return null;
  }

  /**
   * Extrait la commune et le quartier depuis une adresse
   */
  static _extractCommuneQuartier(adresse) {
    const result = { commune: '', quartier: '' };
    if (!adresse) return result;

    const adresseLower = adresse.toLowerCase();

    // Communes d'Abidjan (13 communes) - Retourner en MAJUSCULES
    const communesMap = {
      'plateau': 'PLATEAU',
      'cocody': 'COCODY',
      'yopougon': 'YOPOUGON',
      'abobo': 'ABOBO',
      'adjamé': 'ADJAMÉ',
      'adjame': 'ADJAMÉ',
      'attécoubé': 'ATTÉCOUBÉ',
      'attecoube': 'ATTÉCOUBÉ',
      'koumassi': 'KOUMASSI',
      'marcory': 'MARCORY',
      'port-bouët': 'PORT_BOUET',
      'port-bouet': 'PORT_BOUET',
      'port bouet': 'PORT_BOUET',
      'treichville': 'TREICHVILLE',
      'bingerville': 'BINGERVILLE',
      'songon': 'SONGON',
      'anyama': 'ANYAMA'
    };

    for (const [key, value] of Object.entries(communesMap)) {
      if (adresseLower.includes(key)) {
        result.commune = value; // ✅ Déjà en majuscules
        break;
      }
    }

    // Quartiers populaires d'Abidjan
    const quartiersMap = {
      'riviera': 'Riviera',
      'deux plateaux': 'Deux Plateaux',
      '2 plateaux': 'Deux Plateaux',
      'angré': 'Angré',
      'angre': 'Angré',
      'blockhaus': 'Blockhaus',
      'washington': 'Washington',
      'zone 4': 'Zone 4',
      'adjamé liberté': 'Adjamé Liberté',
      'williamsville': 'Williamsville',
      'niangon': 'Niangon',
      'abobo-gare': 'Abobo-Gare',
      'abobo gare': 'Abobo-Gare',
      'abobo-té': 'Abobo-Té',
      'abobo te': 'Abobo-Té',
      'banco': 'Banco',
      'sicogi': 'Sicogi',
      'champroux': 'Champroux',
      'cocovico': 'Cocovico',
      'valéry giscard': 'Valéry Giscard',
      'valery giscard': 'Valéry Giscard',
      'vridi': 'Vridi',
      'gonzagueville': 'Gonzagueville'
    };

    for (const [key, value] of Object.entries(quartiersMap)) {
      if (adresseLower.includes(key)) {
        result.quartier = value;
        break;
      }
    }

    return result;
  }

  /**
   * Extrait les informations de l'organisateur
   */
  static _extractOrganisateur(raw, source) {
    const org = {
      nom: '',
      contact: '',
      email: '',
      telephone: ''
    };

    if (source === 'FACEBOOK') {
      org.nom = raw.owner?.name || '';
    } else if (source === 'EVENTBRITE') {
      org.nom = raw.organizer?.name || '';
      org.email = raw.organizer?.email || '';
    } else if (raw.organizer) {
      if (typeof raw.organizer === 'string') {
        org.nom = raw.organizer;
      } else {
        org.nom = raw.organizer.name || '';
        org.email = raw.organizer.email || '';
      }
    }

    return org;
  }

  /**
   * Extrait les images de l'événement
   */
  static _extractImages(raw, source) {
    const images = [];

    if (source === 'FACEBOOK') {
      if (raw.cover?.source) images.push(raw.cover.source);
    } else if (source === 'EVENTBRITE') {
      if (raw.logo?.url) images.push(raw.logo.url);
      if (raw.logo?.original?.url) images.push(raw.logo.original.url);
    } else if (source === 'GOOGLE_PLACES') {
      // Pour Google Places, stocker les photo_reference directement
      // Ils seront convertis en URLs côté frontend si nécessaire
      if (raw.photos && Array.isArray(raw.photos)) {
        raw.photos.forEach(photo => {
          if (photo.photo_reference) {
            // Stocker le photo_reference tel quel
            images.push(photo.photo_reference);
          }
        });
      }
    } else {
      // Format générique
      if (raw.image) images.push(raw.image);
      if (raw.images && Array.isArray(raw.images)) {
        images.push(...raw.images);
      }
    }

    return images.slice(0, 5); // Max 5 images
  }

  /**
   * Extrait le lien externe vers l'événement
   */
  static _extractLienExterne(raw) {
    return raw.url || raw.link || raw.event_url || '';
  }

  /**
   * Extrait la capacité estimée de l'événement
   */
  static _extractCapacite(raw) {
    if (raw.capacity) return parseInt(raw.capacity);
    if (raw.attending_count) return parseInt(raw.attending_count);
    if (raw.interested_count) return parseInt(raw.interested_count);
    return null;
  }

  /**
   * Extrait le tarif estimé de l'événement
   */
  static _extractTarif(raw) {
    if (raw.ticket_price) return parseFloat(raw.ticket_price);
    if (raw.is_free === true) return 0;
    return null;
  }

  // ========================================================================
  // UTILITAIRES
  // ========================================================================

  /**
   * Supprime les balises HTML d'une chaîne
   */
  static _stripHtml(html) {
    if (!html) return '';
    return html
      .replace(/<[^>]*>/g, '') // Supprime les balises
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
      .trim();
  }

  /**
   * Vérifie si un point GPS est dans un geofence circulaire
   * @param {Number} lat - Latitude du point à vérifier
   * @param {Number} lon - Longitude du point à vérifier
   * @param {Object} geofence - { latitude, longitude, rayonKm }
   * @returns {Boolean}
   */
  static isWithinGeofence(lat, lon, geofence) {
    if (!lat || !lon || !geofence) return false;

    const distance = this._haversineDistance(
      lat, lon,
      geofence.latitude, geofence.longitude
    );

    return distance <= geofence.rayonKm;
  }

  /**
   * Calcule la distance entre deux points GPS (Haversine)
   * @param {Number} lat1 - Latitude point 1
   * @param {Number} lon1 - Longitude point 1
   * @param {Number} lat2 - Latitude point 2
   * @param {Number} lon2 - Longitude point 2
   * @returns {Number} Distance en kilomètres
   */
  static _haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Rayon de la Terre en km
    const dLat = this._toRad(lat2 - lat1);
    const dLon = this._toRad(lon2 - lon1);
    
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this._toRad(lat1)) *
        Math.cos(this._toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Convertit des degrés en radians
   */
  static _toRad(degrees) {
    return (degrees * Math.PI) / 180;
  }
}

module.exports = Normalizer;