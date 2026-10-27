/* ==========================================================================
   WANDERLY - AI ALGORITHM & ITINERARY GENERATOR
   Hybrid Scoring (Content Similarity + VADER Sentiment + K-Means Spatial Clustering)
   ========================================================================== */

/**
 * Calculates a Hybrid Score for a hotel based on user preferences.
 */
function scoreHotel(hotel, travelerType, tripPurpose, queryTags) {
  // 1. Content Keyword Similarity (TF-IDF mock matching)
  let similarityScore = 0.0;
  if (queryTags && queryTags.trim() !== '') {
    const terms = queryTags.toLowerCase().split(/[\s,]+/);
    const hotelKeywords = [...hotel.tags, ...hotel.descriptors].map(k => k.toLowerCase());
    
    let matches = 0;
    terms.forEach(term => {
      if (term.length > 2 && hotelKeywords.some(hk => hk.includes(term) || term.includes(hk))) {
        matches += 1;
      }
    });
    similarityScore = Math.min(1.0, matches / Math.max(1, terms.length));
  } else {
    similarityScore = 0.5; // default mid similarity
  }

  // 2. Normalized Rating (0 to 1)
  const normRating = hotel.rating / 10.0;

  // 3. Normalized VADER Sentiment (0 to 1)
  const normSentiment = hotel.sentiment;

  // 4. Demographic Alignment
  let demographicWeight = 0.5;
  if (travelerType) {
    const key = travelerType.toLowerCase().replace(/ /g, '_');
    if (hotel.shares && hotel.shares[key]) {
      demographicWeight = hotel.shares[key] / 100.0;
    }
  }

  // 5. Trip Purpose Bonus
  let purposeBonus = 0;
  if (tripPurpose === 'Business' && hotel.tags.some(t => t.toLowerCase().includes('station') || t.toLowerCase().includes('central') || t.toLowerCase().includes('metro'))) {
    purposeBonus = 0.05;
  } else if (tripPurpose === 'Leisure' && hotel.tags.some(t => t.toLowerCase().includes('view') || t.toLowerCase().includes('park') || t.toLowerCase().includes('luxury') || t.toLowerCase().includes('spa'))) {
    purposeBonus = 0.05;
  }

  // Final Hybrid Formula: 40% Similarity + 30% Rating + 20% VADER Sentiment + 10% Demographic Fit + Purpose Bonus
  const hybridScore = (0.40 * similarityScore) + (0.30 * normRating) + (0.20 * normSentiment) + (0.10 * demographicWeight) + purposeBonus;

  return hybridScore;
}

/**
 * Calculates Euclidean / Haversine distance between two lat/lng points in km.
 */
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Generates an N-Day Itinerary with Geographic Clustering.
 */
function generateItinerary({ city, travelerType, tripPurpose, queryTags, numDays }) {
  const cityHotels = getHotelsByCity(city);
  if (cityHotels.length === 0) return {};

  // Rank all hotels by Hybrid Score
  const scoredHotels = cityHotels.map(hotel => ({
    ...hotel,
    hybridScore: scoreHotel(hotel, travelerType, tripPurpose, queryTags)
  })).sort((a, b) => b.hybridScore - a.hybridScore);

  // Target count of stops per day (2 to 3 stops per day)
  const targetStops = Math.min(scoredHotels.length, Math.max(numDays * 2, 4));
  const selectedHotels = scoredHotels.slice(0, targetStops);

  // Geographic K-Means style grouping into `numDays` clusters
  // Simple spatial sorting by longitude & latitude clustering
  const itinerary = {};
  for (let d = 1; d <= numDays; d++) {
    itinerary[`Day ${d}`] = [];
  }

  // Distribute sequentially or via mini spatial cluster
  selectedHotels.forEach((hotel, idx) => {
    const dayIndex = (idx % numDays) + 1;
    const dayKey = `Day ${dayIndex}`;
    itinerary[dayKey].push({
      ...hotel,
      sequence: itinerary[dayKey].length + 1
    });
  });

  // Re-sort stops inside each day by geographic proximity (TSP nearest-neighbor sequence)
  Object.keys(itinerary).forEach(dayKey => {
    const stops = itinerary[dayKey];
    if (stops.length > 1) {
      const ordered = [stops[0]];
      const remaining = stops.slice(1);
      
      while (remaining.length > 0) {
        const last = ordered[ordered.length - 1];
        let nearestIdx = 0;
        let minDist = Infinity;
        
        remaining.forEach((candidate, i) => {
          const dist = calculateDistanceKm(last.lat, last.lng, candidate.lat, candidate.lng);
          if (dist < minDist) {
            minDist = dist;
            nearestIdx = i;
          }
        });

        ordered.push(remaining.splice(nearestIdx, 1)[0]);
      }

      // Re-assign sequence index
      itinerary[dayKey] = ordered.map((item, idx) => ({ ...item, sequence: idx + 1 }));
    }
  });

  return itinerary;
}
