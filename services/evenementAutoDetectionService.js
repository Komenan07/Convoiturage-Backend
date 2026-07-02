// ...existing code...
const EvenementService = require('./evenementService');
const FacebookConnector = require('./connectors/facebookConnector');
const GooglePlacesConnector = require('./connectors/googlePlacesConnector');
const RssConnector = require('./connectors/rssConnector');
const Normalizer = require('./utils/normalizer');
const Dedupe = require('./utils/dedupe');
const Cache = require('./utils/cache');

class EvenementAutoDetectionService {
  constructor(opts = {}) {
    this.connectors = opts.connectors || [
      new FacebookConnector(),
      new GooglePlacesConnector(),
      new RssConnector([{ url: 'https://www.abidjan.net/rss' }])
    ];

    this.geofence = {
      latitude: parseFloat(process.env.ABIDJAN_LATITUDE) || 5.3599517,
      longitude: parseFloat(process.env.ABIDJAN_LONGITUDE) || -3.9615917,
      rayonKm: parseFloat(process.env.ABIDJAN_RAYON_KM) || 50
    };

    this.sourcePriority = Object.assign({
      PARTENAIRE: 100,
      EVENTBRITE: 90,
      FACEBOOK: 80,
      GOOGLE_PLACES: 70,
      RSS: 50,
      TEST: 10
    }, opts.sourcePriority || {});

    this.cache = new Cache({ ttlMinutes: parseInt(process.env.EVENT_CACHE_MINUTES) || 60 });
    this.pollIntervalMs = parseInt(process.env.EVENT_DETECT_POLL_MS) || 1000 * 60 * 15;
    this.running = false;
    this.maxFetchRetries = parseInt(process.env.EVENT_FETCH_RETRIES) || 2;
  }

  async _retry(fn, retries = 2) {
    let err;
    for (let i = 0; i <= retries; i++) {
      try { return await fn(); } catch (e) { err = e; await new Promise(r => setTimeout(r, 500 * (i + 1))); }
    }
    throw err;
  }

  async detecterEtImporterEvenements_once() {
    const resultatsGlobaux = { total: 0, nouveaux: 0, miseAJour: 0, erreurs: 0, sources: {}, details: [] };

    for (const connector of this.connectors) {
      const name = connector.name || connector.constructor.name || 'UNKNOWN';
      try {
        const raw = await this._retry(() => connector.fetchEvenements(), this.maxFetchRetries);

        const normalized = (raw || []).map(r => Normalizer.normalize(r, name)).filter(Boolean);

        const filtres = normalized.filter(ev => {
          if (!ev.lieu || !ev.lieu.coordonnees || !Array.isArray(ev.lieu.coordonnees.coordinates)) return false;
          const [lon, lat] = ev.lieu.coordonnees.coordinates;
          return Normalizer.isWithinGeofence(lat, lon, this.geofence);
        });

        const toImport = [];
        for (const ev of filtres) {
          const key = Dedupe.getKey(ev);
          if (this.cache.has(key)) continue;
          this.cache.set(key, { ts: Date.now(), source: name });
          toImport.push(ev);
        }

        const res = await this._sauvegarderEvenements(toImport, name);
        resultatsGlobaux.total += res.total;
        resultatsGlobaux.nouveaux += res.nouveaux;
        resultatsGlobaux.miseAJour += res.miseAJour;
        resultatsGlobaux.erreurs += res.erreurs;
        resultatsGlobaux.sources[name] = res;
      } catch (err) {
        resultatsGlobaux.erreurs++;
        resultatsGlobaux.details.push({ source: name, erreur: err.message || err.toString() });
        console.error(`[EvenementAuto] erreur connector ${name}:`, err);
      }
    }
    return resultatsGlobaux;
  }

  // Garder compatibilité avec l'ancien nom
  async detecterEtImporterEvenements() {
    return this.detecterEtImporterEvenements_once();
  }

  async _sauvegarderEvenements(evenements, source) {
    const resultats = { total: evenements.length, nouveaux: 0, miseAJour: 0, erreurs: 0, details: [] };

    for (const eventData of evenements) {
      try {
        eventData.source = eventData.source || source;
        eventData.sourceDetection = 'AUTOMATIQUE';
        eventData.confiance = this._scoreConfiance(eventData.source);

        const resultat = await EvenementService.creerOuMettreAJour(eventData);
        if (resultat.isNew) resultats.nouveaux++; else resultats.miseAJour++;
        resultats.details.push({ nom: eventData.nom, action: resultat.isNew ? 'créé' : 'mis à jour', id: resultat.evenement._id });
      } catch (error) {
        resultats.erreurs++;
        resultats.details.push({ nom: eventData.nom || 'unknown', erreur: error.message || error.toString() });
        console.error('[EvenementAuto] erreur sauvegarde:', error);
      }
    }
    return resultats;
  }

  _scoreConfiance(source) {
    return this.sourcePriority[source] || 10;
  }

  async runOnce() {
    console.log('🔎 runOnce: détection automatique démarrée');
    const r = await this.detecterEtImporterEvenements_once();
    console.log('✅ runOnce terminé:', r);
    return r;
  }

  startScheduler() {
    if (this.running) return;
    this.running = true;
    this._runLoop();
  }

  stopScheduler() {
    this.running = false;
    if (this._timeout) clearTimeout(this._timeout);
  }

  async _runLoop() {
    while (this.running) {
      try {
        await this.runOnce();
      } catch (e) {
        console.error('[EvenementAuto] boucle erreur:', e);
      }
      await new Promise(res => { this._timeout = setTimeout(res, this.pollIntervalMs); });
    }
  }
}

module.exports = new EvenementAutoDetectionService();
