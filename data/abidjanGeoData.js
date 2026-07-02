// data/abidjanGeoData.js

/**
 * Données géographiques des communes et quartiers d'Abidjan
 * Coordonnées GPS (latitude, longitude) pour chaque zone
 * 
 * Structure:
 * - Clé principale = nom de la commune (en minuscules)
 * - centre = coordonnées du centre de la commune
 * - quartiers = liste des quartiers avec leurs coordonnées
 */

const ABIDJAN_GEO_DATA = {

  // =============================================
  // COCODY
  // =============================================
  cocody: {
    centre: { lat: 5.3600, lng: -3.9800 },
    quartiers: {
      'saint jean':         { lat: 5.3601, lng: -3.9969 },
      'angré':              { lat: 5.3900, lng: -3.9600 },
      'angrè':              { lat: 5.3900, lng: -3.9600 },
      'riviera 1':          { lat: 5.3550, lng: -3.9700 },
      'riviera 2':          { lat: 5.3570, lng: -3.9600 },
      'riviera 3':          { lat: 5.3600, lng: -3.9500 },
      'riviera 4':          { lat: 5.3620, lng: -3.9400 },
      'riviera palmeraie':  { lat: 5.3650, lng: -3.9350 },
      'blockhaus':          { lat: 5.3480, lng: -3.9820 },
      'deux plateaux':      { lat: 5.3700, lng: -3.9750 },
      '2 plateaux':         { lat: 5.3700, lng: -3.9750 },
      'vallon':             { lat: 5.3750, lng: -3.9680 },
      'bonoumin':           { lat: 5.3800, lng: -3.9500 },
      'palmeraie':          { lat: 5.3850, lng: -3.9450 },
      'attoban':            { lat: 5.3950, lng: -3.9700 },
      'anoumabo':           { lat: 5.3400, lng: -3.9850 },
      'danga':              { lat: 5.3450, lng: -3.9900 },
      'williamsville':      { lat: 5.3500, lng: -4.0050 },
      'cité des arts':      { lat: 5.3550, lng: -3.9900 },
      'pharmacie':          { lat: 5.3580, lng: -3.9850 },
      'm\'badon':           { lat: 5.3520, lng: -3.9780 },
    }
  },

  // =============================================
  // PLATEAU
  // =============================================
  plateau: {
    centre: { lat: 5.3196, lng: -4.0167 },
    quartiers: {
      'plateau centre':     { lat: 5.3196, lng: -4.0167 },
      'centre':             { lat: 5.3196, lng: -4.0167 },
      'indénié':            { lat: 5.3250, lng: -4.0100 },
      'indenié':            { lat: 5.3250, lng: -4.0100 },
      'hotel de ville':     { lat: 5.3200, lng: -4.0200 },
      'la pyramide':        { lat: 5.3180, lng: -4.0180 },
      'ebrie':              { lat: 5.3150, lng: -4.0220 },
    }
  },

  // =============================================
  // YOPOUGON
  // =============================================
  yopougon: {
    centre: { lat: 5.3667, lng: -4.0667 },
    quartiers: {
      'yopougon centre':    { lat: 5.3667, lng: -4.0667 },
      'niangon':            { lat: 5.3700, lng: -4.0800 },
      'niangon nord':       { lat: 5.3750, lng: -4.0850 },
      'niangon sud':        { lat: 5.3650, lng: -4.0750 },
      'selmer':             { lat: 5.3600, lng: -4.0700 },
      'ananeraie':          { lat: 5.3550, lng: -4.0600 },
      'kouté':              { lat: 5.3800, lng: -4.0900 },
      'koute':              { lat: 5.3800, lng: -4.0900 },
      'wassakara':          { lat: 5.3500, lng: -4.0900 },
      'banco':              { lat: 5.3900, lng: -4.1000 },
      'ficgyo':             { lat: 5.3450, lng: -4.0650 },
      'zone industrielle':  { lat: 5.3400, lng: -4.0550 },
      'marché':             { lat: 5.3680, lng: -4.0680 },
      'toits rouges':       { lat: 5.3720, lng: -4.0720 },
      'siporex':            { lat: 5.3850, lng: -4.0950 },
      'sicogi':             { lat: 5.3750, lng: -4.0780 },
    }
  },

  // =============================================
  // MARCORY
  // =============================================
  marcory: {
    centre: { lat: 5.3000, lng: -3.9833 },
    quartiers: {
      'marcory centre':     { lat: 5.3000, lng: -3.9833 },
      'zone 4':             { lat: 5.3050, lng: -3.9900 },
      'anoumabo':           { lat: 5.2950, lng: -3.9800 },
      'belle-ville':        { lat: 5.3100, lng: -3.9750 },
      'belleville':         { lat: 5.3100, lng: -3.9750 },
      'remblais':           { lat: 5.2900, lng: -3.9850 },
    }
  },

  // =============================================
  // TREICHVILLE
  // =============================================
  treichville: {
    centre: { lat: 5.2950, lng: -4.0100 },
    quartiers: {
      'treichville centre': { lat: 5.2950, lng: -4.0100 },
      'port bouet 1':       { lat: 5.2900, lng: -4.0050 },
      'gare':               { lat: 5.2980, lng: -4.0120 },
      'stade':              { lat: 5.2920, lng: -4.0150 },
    }
  },

  // =============================================
  // ADJAMÉ
  // =============================================
  adjamé: {
    centre: { lat: 5.3600, lng: -4.0300 },
    quartiers: {
      'adjamé centre':      { lat: 5.3600, lng: -4.0300 },
      'washington':         { lat: 5.3650, lng: -4.0250 },
      'williamsville':      { lat: 5.3700, lng: -4.0350 },
      'gare nord':          { lat: 5.3550, lng: -4.0300 },
      '220 logements':      { lat: 5.3580, lng: -4.0350 },
      'marché':             { lat: 5.3620, lng: -4.0280 },
      'liberté':            { lat: 5.3670, lng: -4.0230 },
    }
  },

  // =============================================
  // ABOBO
  // =============================================
  abobo: {
    centre: { lat: 5.4200, lng: -4.0100 },
    quartiers: {
      'abobo centre':       { lat: 5.4200, lng: -4.0100 },
      'abobo baoulé':       { lat: 5.4250, lng: -4.0050 },
      'baoulé':             { lat: 5.4250, lng: -4.0050 },
      'pk 18':              { lat: 5.4300, lng: -4.0000 },
      'sogefiha':           { lat: 5.4150, lng: -4.0150 },
      'gendarmerie':        { lat: 5.4180, lng: -4.0200 },
      'sagbé':              { lat: 5.4100, lng: -4.0250 },
      'sagbe':              { lat: 5.4100, lng: -4.0250 },
      'avocatier':          { lat: 5.4050, lng: -4.0300 },
      'clouetcha':          { lat: 5.4350, lng: -3.9950 },
      'habitat':            { lat: 5.4220, lng: -4.0120 },
    }
  },

  // =============================================
  // KOUMASSI
  // =============================================
  koumassi: {
    centre: { lat: 5.3100, lng: -3.9700 },
    quartiers: {
      'koumassi centre':    { lat: 5.3100, lng: -3.9700 },
      'koumassi remblais':  { lat: 5.3050, lng: -3.9650 },
      'grand campement':    { lat: 5.3150, lng: -3.9750 },
      'campement':          { lat: 5.3150, lng: -3.9750 },
      'sicogi':             { lat: 5.3200, lng: -3.9800 },
      'résidentiel':        { lat: 5.3100, lng: -3.9720 },
    }
  },

  // =============================================
  // PORT-BOUËT
  // =============================================
  'port-bouët': {
    centre: { lat: 5.2550, lng: -3.9300 },
    quartiers: {
      'port bouet centre':  { lat: 5.2550, lng: -3.9300 },
      'aéroport':           { lat: 5.2611, lng: -3.9267 },
      'aeroport':           { lat: 5.2611, lng: -3.9267 },
      'vridi':              { lat: 5.2700, lng: -3.9500 },
      'gonzagueville':      { lat: 5.2400, lng: -3.9200 },
      'koumassi prolongé':  { lat: 5.2800, lng: -3.9600 },
    }
  },

  // =============================================
  // BINGERVILLE
  // =============================================
  bingerville: {
    centre: { lat: 5.3550, lng: -3.8900 },
    quartiers: {
      'bingerville centre': { lat: 5.3550, lng: -3.8900 },
      'sogephia':           { lat: 5.3600, lng: -3.8950 },
      'lycée':              { lat: 5.3520, lng: -3.8870 },
    }
  },

  // =============================================
  // ATTÉCOUBÉ
  // =============================================
  attécoubé: {
    centre: { lat: 5.3450, lng: -4.0450 },
    quartiers: {
      'attécoubé centre':   { lat: 5.3450, lng: -4.0450 },
      'attecoube centre':   { lat: 5.3450, lng: -4.0450 },
      'zoo':                { lat: 5.3480, lng: -4.0400 },
      'williamsville':      { lat: 5.3500, lng: -4.0380 },
    }
  },

  // =============================================
  // SONGON
  // =============================================
  songon: {
    centre: { lat: 5.3800, lng: -4.1800 },
    quartiers: {
      'songon centre':      { lat: 5.3800, lng: -4.1800 },
      'agban':              { lat: 5.3750, lng: -4.1750 },
    }
  },
};

// =============================================
// ALIAS / VARIANTES DE NOMS
// =============================================

/**
 * Permet de gérer les fautes de frappe et variantes de noms courants
 */
const COMMUNE_ALIASES = {
  'adjame':     'adjamé',
  'attecoube':  'attécoubé',
  'attécoube':  'attécoubé',
  'port bouet': 'port-bouët',
  'portbouet':  'port-bouët',
  'port bouët': 'port-bouët',
};

module.exports = { ABIDJAN_GEO_DATA, COMMUNE_ALIASES };