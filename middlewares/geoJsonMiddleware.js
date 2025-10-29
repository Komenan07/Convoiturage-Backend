// middlewares/geoJsonMiddleware.js

/**
 * Middleware pour transformer les coordonnées simples en format GeoJSON
 * 
 * Transforme:
 * "coordonnees": [-4.0135, 5.3600]
 * 
 * En:
 * "coordonnees": {
 *   "type": "Point",
 *   "coordinates": [-4.0135, 5.3600]
 * }
 */

const transformerCoordonneesEnGeoJSON = (req, res, next) => {
  try {
    // Fonction utilitaire pour transformer un objet de coordonnées
    const transformerPoint = (point) => {
      if (!point) return point;

      // Si coordonnees est un array, le transformer en objet GeoJSON
      if (point.coordonnees && Array.isArray(point.coordonnees)) {
        point.coordonnees = {
          type: 'Point',
          coordinates: point.coordonnees
        };
      }

      return point;
    };

    // Transformer le point de départ
    if (req.body.pointDepart) {
      req.body.pointDepart = transformerPoint(req.body.pointDepart);
    }

    // Transformer le point d'arrivée
    if (req.body.pointArrivee) {
      req.body.pointArrivee = transformerPoint(req.body.pointArrivee);
    }

    // Transformer les arrêts intermédiaires
    if (req.body.arretsIntermediaires && Array.isArray(req.body.arretsIntermediaires)) {
      req.body.arretsIntermediaires = req.body.arretsIntermediaires.map(arret => 
        transformerPoint(arret)
      );
    }

    // Alias possible
    if (req.body.pointsArretIntermedaires && Array.isArray(req.body.pointsArretIntermedaires)) {
      req.body.arretsIntermediaires = req.body.pointsArretIntermedaires.map(arret => 
        transformerPoint(arret)
      );
      delete req.body.pointsArretIntermedaires;
    }

    next();
  } catch (error) {
    console.error('Erreur lors de la transformation des coordonnées:', error);
    next(error);
  }
};

module.exports = { transformerCoordonneesEnGeoJSON };