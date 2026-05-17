const defaults = new Set([
  // Adult
  'pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com', 'onlyfans.com',
  'redtube.com', 'youporn.com', 'tube8.com',
  // Gambling
  'bet365.com', 'pokerstars.com', 'betway.com', 'williamhill.com',
  'draftkings.com', 'fanduel.com', 'betcris.com',
  // High-risk dating
  'tinder.com', 'badoo.com', 'grindr.com', 'scruff.com', 'jackd.com',
  // Ad/tracking networks
  'doubleclick.net', 'googleadservices.com', 'adnxs.com', 'scorecardresearch.com',
  'outbrain.com', 'taboola.com',
]);

// Runtime-mutable copy
const blocklist = new Set(defaults);

module.exports = blocklist;
