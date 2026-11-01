// WestOS configuration — the only place secrets-that-aren't-secret and tunables live.
// (Firebase web keys are public by design; the security is in database.rules.json, not in hiding them.)
const OS_CONFIG = {
  firebase: {
    apiKey: "AIzaSyBNT1jvi0El_txSKTjCGS5MeBbVz15DKs4",
    authDomain: "mrwestfiles.firebaseapp.com",
    databaseURL: "https://mrwestfiles-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "mrwestfiles",
    storageBucket: "mrwestfiles.firebasestorage.app",
    messagingSenderId: "761539070041",
    appId: "1:761539070041:web:392762db7b305b2b3e4948"
  },
  // The ONE administrator. Must match the email in database.rules.json. Admin tools appear only for this verified account.
  adminEmail: 'kirattdhaliwal@gmail.com',

  // ---- free-tier protection (Firebase Spark: 10 GB/month download, 1 GB stored) ----
  syncDebounceMs: 20000,        // cloud writes are batched: at most one write burst per 20 s, only the fields that changed
  leaderboardEveryMs: 300000,   // net-worth entry refreshed at most every 5 minutes
  galleryBudgetBytes: 7e9,      // the Photos archive's share of the monthly allowance (enforced in the rules too)
  newsImageCount: 6,            // News only ever loads this many (tiny, cached) thumbnails per session

  // ---- economy ----
  startCash: 1000,
  tax: { threshold: 100000, base: 0.01, growth: 0.35, maxRate: 0.50, dueHours: 48, remindHours: 12, seizeMultiple: 2, catchupDays: 7 },
  game: { dailySoftcap: 75, dropChance: 0.18 },

  // ---- world clock: tick 0 of the shared market / news / property calendars ----
  epoch: Date.UTC(2026, 7, 21)
};
