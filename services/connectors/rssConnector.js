// services/connectors/rssConnector.js
const axios = require('axios');
const xml2js = require('xml2js');

/**
 * Connecteur pour récupérer les événements depuis des flux RSS
 * Supporte les formats RSS 2.0 et Atom
 */
class RssConnector {
  constructor(feeds = []) {
    this.name = 'RSS';
    
    // Flux RSS par défaut pour Abidjan
    this.feeds = feeds.length > 0 ? feeds : [
      { url: 'https://www.abidjan.net/rss', name: 'Abidjan.net' },
      { url: 'https://news.abidjan.net/rss/agenda', name: 'Abidjan News Agenda' },
      // Ajouter d'autres flux RSS ivoiriens ici
    ];

    this.parser = new xml2js.Parser({
      trim: true,
      explicitArray: false,
      mergeAttrs: true
    });

    this.enabled = true;
  }

  /**
   * Récupère les événements depuis tous les flux RSS
   */
  async fetchEvenements() {
    console.log(`🔍 RssConnector: Récupération depuis ${this.feeds.length} flux RSS...`);
    
    const allEvents = [];

    for (const feed of this.feeds) {
      try {
        const events = await this._fetchFeed(feed);
        allEvents.push(...events);
        console.log(`   ✅ ${feed.name}: ${events.length} événements trouvés`);
      } catch (error) {
        console.error(`   ❌ Erreur flux ${feed.name}:`, error.message);
      }
    }

    console.log(`✅ RssConnector: Total ${allEvents.length} événements`);
    return allEvents;
  }

  /**
   * Récupère et parse un flux RSS
   */
  async _fetchFeed(feed) {
    try {
      const response = await axios.get(feed.url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'WAYZ-ECO/1.0 Event Detector'
        }
      });

      const parsed = await this.parser.parseStringPromise(response.data);
      
      // Déterminer le format (RSS ou Atom)
      if (parsed.rss) {
        return this._parseRss(parsed.rss, feed.name);
      } else if (parsed.feed) {
        return this._parseAtom(parsed.feed, feed.name);
      } else {
        throw new Error('Format RSS non reconnu');
      }
    } catch (error) {
      if (error.response) {
        throw new Error(`HTTP ${error.response.status}: ${error.response.statusText}`);
      }
      throw error;
    }
  }

  /**
   * Parse un flux RSS 2.0
   */
  _parseRss(rss, sourceName) {
    const items = rss.channel?.item || [];
    const itemsArray = Array.isArray(items) ? items : [items];

    return itemsArray
      .filter(item => this._isEventItem(item))
      .map(item => this._transformRssItem(item, sourceName));
  }

  /**
   * Parse un flux Atom
   */
  _parseAtom(feed, sourceName) {
    const entries = feed.entry || [];
    const entriesArray = Array.isArray(entries) ? entries : [entries];

    return entriesArray
      .filter(entry => this._isEventItem(entry))
      .map(entry => this._transformAtomEntry(entry, sourceName));
  }

  /**
   * Détermine si un item RSS est un événement
   */
  _isEventItem(item) {
    const content = JSON.stringify(item).toLowerCase();
    
    const eventKeywords = [
      'événement', 'event',
      'concert', 'festival',
      'conférence', 'conference',
      'spectacle', 'show',
      'exposition', 'exhibition',
      'salon', 'foire',
      'match', 'compétition',
      'cérémonie', 'ceremony'
    ];

    return eventKeywords.some(keyword => content.includes(keyword));
  }

  /**
   * Transforme un item RSS en événement
   */
  _transformRssItem(item, sourceName) {
    return {
      id: item.guid || item.link || this._generateId(item.title),
      guid: item.guid,
      name: item.title || 'Sans titre',
      title: item.title,
      description: this._extractDescription(item),
      content: item['content:encoded'] || item.description,
      link: item.link,
      url: item.link,
      pubDate: item.pubDate,
      date: item.pubDate,
      start_time: this._extractDate(item.pubDate),
      category: item.category,
      author: item.author || item['dc:creator'],
      enclosure: item.enclosure,
      source: sourceName,
      
      // Métadonnées supplémentaires
      _raw: item
    };
  }

  /**
   * Transforme une entrée Atom en événement
   */
  _transformAtomEntry(entry, sourceName) {
    return {
      id: entry.id || this._generateId(entry.title),
      name: entry.title || 'Sans titre',
      title: entry.title,
      description: entry.summary || entry.content,
      link: entry.link?.href || entry.link,
      url: entry.link?.href || entry.link,
      pubDate: entry.published || entry.updated,
      date: entry.published || entry.updated,
      start_time: this._extractDate(entry.published || entry.updated),
      author: entry.author?.name,
      category: entry.category?.term,
      source: sourceName,
      
      _raw: entry
    };
  }

  /**
   * Extrait la description d'un item RSS
   */
  _extractDescription(item) {
    if (item['content:encoded']) {
      return this._stripHtml(item['content:encoded']);
    }
    if (item.description) {
      return this._stripHtml(item.description);
    }
    return '';
  }

  /**
   * Extrait et normalise une date
   */
  _extractDate(dateString) {
    if (!dateString) return new Date().toISOString();
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return new Date().toISOString();
      }
      return date.toISOString();
    } catch (error) {
      return new Date().toISOString();
    }
  }

  /**
   * Génère un ID unique pour un item sans GUID
   */
  _generateId(title) {
    const timestamp = Date.now();
    const hash = this._simpleHash(title || '');
    return `rss_${hash}_${timestamp}`;
  }

  /**
   * Hash simple pour générer des IDs
   */
  _simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Supprime les balises HTML
   */
  _stripHtml(html) {
    if (!html) return '';
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
      .trim();
  }

  /**
   * Ajoute un nouveau flux RSS
   */
  addFeed(url, name) {
    this.feeds.push({ url, name: name || url });
    console.log(`➕ Flux RSS ajouté: ${name || url}`);
  }

  /**
   * Supprime un flux RSS
   */
  removeFeed(url) {
    const initialLength = this.feeds.length;
    this.feeds = this.feeds.filter(feed => feed.url !== url);
    
    if (this.feeds.length < initialLength) {
      console.log(`➖ Flux RSS supprimé: ${url}`);
      return true;
    }
    return false;
  }
}

module.exports = RssConnector;