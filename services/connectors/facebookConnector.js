// services/connectors/facebookConnector.js
const axios = require('axios');

/**
 * Connecteur pour récupérer les événements depuis Facebook Graph API
 * Documentation: https://developers.facebook.com/docs/graph-api/reference/event
 */
class FacebookConnector {
  constructor(options = {}) {
    this.name = 'FACEBOOK';
    this.accessToken = options.accessToken || process.env.FACEBOOK_ACCESS_TOKEN;
    this.baseURL = 'https://graph.facebook.com/v18.0';
    this.enabled = !!this.accessToken;
    
    // Pages Facebook à surveiller pour les événements d'Abidjan
    this.pageIds = options.pageIds || [
      // Exemples de pages (à remplacer par de vraies pages)
      '100064234567890', // Page événements Abidjan
      '100064234567891', // Page culture CI
    ];

    if (!this.enabled) {
      console.warn('⚠️  FacebookConnector: Access token manquant. Désactivé.');
    }
  }

  /**
   * Récupère les événements depuis Facebook
   */
  async fetchEvenements() {
    if (!this.enabled) {
      console.log('ℹ️  FacebookConnector: Désactivé (pas de token)');
      return [];
    }

    console.log(`🔍 FacebookConnector: Récupération depuis ${this.pageIds.length} pages...`);
    
    const allEvents = [];

    for (const pageId of this.pageIds) {
      try {
        const events = await this._fetchPageEvents(pageId);
        allEvents.push(...events);
        console.log(`   ✅ Page ${pageId}: ${events.length} événements trouvés`);
      } catch (error) {
        console.error(`   ❌ Erreur page ${pageId}:`, error.message);
      }
    }

    console.log(`✅ FacebookConnector: Total ${allEvents.length} événements`);
    return allEvents;
  }

  /**
   * Récupère les événements d'une page Facebook
   */
  async _fetchPageEvents(pageId) {
    try {
      const url = `${this.baseURL}/${pageId}/events`;
      
      const response = await axios.get(url, {
        params: {
          access_token: this.accessToken,
          fields: [
            'id',
            'name',
            'description',
            'start_time',
            'end_time',
            'place',
            'cover',
            'attending_count',
            'interested_count',
            'is_online',
            'ticket_uri',
            'category'
          ].join(','),
          time_filter: 'upcoming',
          limit: 100
        },
        timeout: 10000
      });

      return response.data.data || [];
    } catch (error) {
      if (error.response) {
        throw new Error(`Facebook API Error: ${error.response.status} - ${error.response.data.error?.message || 'Unknown'}`);
      }
      throw error;
    }
  }

  /**
   * Recherche d'événements par mots-clés (optionnel)
   */
  async searchEvents(query = 'Abidjan') {
    if (!this.enabled) return [];

    try {
      const url = `${this.baseURL}/search`;
      
      const response = await axios.get(url, {
        params: {
          access_token: this.accessToken,
          q: query,
          type: 'event',
          fields: 'id,name,description,start_time,place',
          limit: 50
        },
        timeout: 10000
      });

      return response.data.data || [];
    } catch (error) {
      console.error('❌ FacebookConnector search error:', error.message);
      return [];
    }
  }
}

module.exports = FacebookConnector;