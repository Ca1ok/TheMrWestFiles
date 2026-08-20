// Name-filter moderation data: leetspeak normalization map + blocklist.
// BLOCKED_TERMS intentionally ships with only a couple of generic placeholders — add your own
// terms (and their broken-up/leetspeak variants) here. See chat notes for why this assistant
// won't pre-populate an actual slur list.

const BLOCKED_TERMS = ['admin', 'moderator', 'fuck', 'shit', 'bitch']; // starter list — expand as needed
const LEET_MAP = { '4':'a', '@':'a', '3':'e', '1':'i', '!':'i', '0':'o', '5':'s', '$':'s', '7':'t', '+':'t' };
