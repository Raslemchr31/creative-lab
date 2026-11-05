#!/usr/bin/env node
// ad-engine :: tools/validate-compliance.mjs
// Executable multilingual compliance gate (G1 personal-attributes, G2 banned-claims,
// G4 SAC mis-declaration, G3 authorization-only) driven by config/compliance-lexicon.json.
// Turns the "HARD-BLOCK" from prose into a real check. Node v22, ZERO dependencies.
//
// This is the machine gate invoked by skills/compliance-check + agents/compliance-officer
// and by tools/run-tests.mjs golden cases. A clean scan NEVER auto-approves — a human still
// signs off (see lexicon _notes). It is a DETECTION AID.
//
// CLI:
//   node tools/validate-compliance.mjs --lang ar-DZ --sac "[]" --text "..."
//   node tools/validate-compliance.mjs --lang fr --sac '["EMPLOYMENT"]' --auth "" --file creative.txt
//   echo '{"lang":"en","sac":[],"text":"..."}' | node tools/validate-compliance.mjs --stdin
// Exit code: 0 = PASS, 2 = BLOCK, 1 = usage/error.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LEXICON_PATH = path.join(ROOT, 'config', 'compliance-lexicon.json');

// ---------- normalization (mirrors lexicon.matching_rules) ----------
const ZERO_WIDTH = /[‌‍‎‏]/g;
const TASHKEEL = /[ً-ٰٟ]/g;
const TATWEEL = /ـ/g;

export function normalize(s) {
  if (!s) return '';
  let t = String(s).toLowerCase();
  t = t.replace(ZERO_WIDTH, '');
  t = t.replace(TASHKEEL, '').replace(TATWEEL, '');
  // alef variants -> ا
  t = t.replace(/[أإآٱ]/g, 'ا');
  t = t.replace(/ى/g, 'ي'); // ى -> ي
  t = t.replace(/ة/g, 'ه'); // ة -> ه
  t = t.replace(/ؤ/g, 'و'); // ؤ -> و
  t = t.replace(/ئ/g, 'ي'); // ئ -> ي
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

const isLatinTerm = (term) => /^[\x00-\x7f]*$/.test(term);

// substring match with word boundaries for ASCII terms (avoids "cure" in "secure"),
// plain normalized includes for Arabic/Darija-script terms.
function contains(normText, term) {
  const nt = normalize(term);
  if (!nt) return false;
  if (isLatinTerm(term) && /[a-z]/.test(nt)) {
    const esc = nt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // allow the term to be bounded by non-word chars or string edges
    const re = new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, 'i');
    return re.test(' ' + normText + ' ');
  }
  return normText.includes(nt);
}

function tokenize(normText) {
  return normText.split(/[^\p{L}\p{N}%#]+/u).filter(Boolean);
}

// index positions (token index) where any term in `terms` occurs
function tokenHits(tokens, normText, terms) {
  const hits = [];
  for (const term of terms) {
    const nt = normalize(term);
    if (!nt) continue;
    if (nt.includes(' ')) {
      // phrase: approximate by checking presence, place at first token of first word
      if (normText.includes(nt)) {
        const first = nt.split(' ')[0];
        const idx = tokens.findIndex((tk) => tk === first || tk.includes(first));
        hits.push({ term, idx: idx < 0 ? 0 : idx });
      }
    } else {
      tokens.forEach((tk, i) => {
        if (tk === nt || (isLatinTerm(term) ? false : tk.includes(nt))) hits.push({ term, idx: i });
      });
    }
  }
  return hits;
}

// ---------- the gate ----------
export function loadLexicon(p = LEXICON_PATH) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function validateCreative({ lang = 'en', sac = [], authorized = [], text = '', fields = null }, lexicon = loadLexicon()) {
  const declaredSac = Array.isArray(sac) ? sac.map((s) => String(s).toUpperCase()) : [];
  const auth = Array.isArray(authorized) ? authorized : (authorized ? [authorized] : []);
  const body = fields ? Object.values(fields).join('  \n') : text;
  const norm = normalize(body);
  const tokens = tokenize(norm);
  const findings = [];
  const window = 8;

  const langsToScan = Array.from(new Set([lang, 'en', 'fr', 'ar', 'ar-DZ']));

  // G2 — banned claims
  for (const L of langsToScan) {
    const list = lexicon.banned_claims[L] || [];
    for (const term of list) {
      if (contains(norm, term)) {
        findings.push({ rule: 'G2', severity: 'HARD_BLOCK', lang: L, term, msg: `Banned/absolute claim "${term}" — rewrite to a qualified, product-benefit claim.` });
      }
    }
  }

  // G1 — personal attributes (pronoun WITHIN window of a protected attribute)
  for (const L of langsToScan) {
    const pron = lexicon.personal_attribute_triggers.second_person_pronouns[L] || [];
    const pronHits = tokenHits(tokens, norm, pron);
    if (!pronHits.length) continue;
    const attrGroups = lexicon.personal_attribute_triggers.protected_attributes;
    for (const [cls, byLang] of Object.entries(attrGroups)) {
      if (cls === '_comment') continue;
      const attrs = byLang[L] || [];
      const attrHits = tokenHits(tokens, norm, attrs);
      for (const a of attrHits) {
        for (const p of pronHits) {
          if (Math.abs(a.idx - p.idx) <= window) {
            findings.push({ rule: 'G1', severity: 'HARD_BLOCK', lang: L, class: cls, term: `${p.term}~${a.term}`, msg: `Personal-attribute trap: 2nd-person pronoun near protected attribute (${cls}). Reframe to product benefit — never imply the viewer HAS the attribute.` });
          }
        }
      }
    }
  }

  // G4 — restricted category / SAC mis-declaration
  for (const L of langsToScan) {
    const byCat = lexicon.restricted_category_terms[L];
    if (!byCat) continue;
    for (const [cat, terms] of Object.entries(byCat)) {
      if (cat.startsWith('_')) continue;
      if ((terms || []).some((t) => contains(norm, t))) {
        if (!declaredSac.includes(cat)) {
          findings.push({ rule: 'G4', severity: 'HARD_BLOCK', lang: L, category: cat, msg: `Restricted-category language detected but special_ad_categories does not declare ${cat} (declared: [${declaredSac.join(', ')}]). SAC mis-declaration.` });
        }
      }
    }
    // G3 authorization-only
    const authList = (lexicon.restricted_category_terms._authorization_only || {})[L] || [];
    for (const term of authList) {
      if (contains(norm, term) && !auth.length) {
        findings.push({ rule: 'G3', severity: 'HARD_BLOCK', lang: L, term, msg: `Authorization-required subject "${term}" with no authorization on file.` });
      }
    }
  }

  const verdict = findings.some((f) => f.severity === 'HARD_BLOCK') ? 'BLOCK' : 'PASS';
  return { verdict, findings, note: 'Detection aid — a clean scan does NOT auto-approve; human sign-off still required.' };
}

// ---------- CLI ----------
function parseArgs(argv) {
  const a = { lang: 'en', sac: '[]', auth: '', text: '', file: null, stdin: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--stdin') a.stdin = true;
    else if (k === '--lang') a.lang = argv[++i];
    else if (k === '--sac') a.sac = argv[++i];
    else if (k === '--auth') a.auth = argv[++i];
    else if (k === '--text') a.text = argv[++i];
    else if (k === '--file') a.file = argv[++i];
  }
  return a;
}

function main() {
  const a = parseArgs(process.argv);
  let input;
  if (a.stdin) {
    input = JSON.parse(fs.readFileSync(0, 'utf8'));
  } else {
    const text = a.file ? fs.readFileSync(a.file, 'utf8') : a.text;
    let sac = [];
    try { sac = JSON.parse(a.sac); } catch { sac = a.sac ? a.sac.split(',').map((s) => s.trim()).filter(Boolean) : []; }
    input = { lang: a.lang, sac, authorized: a.auth ? a.auth.split(',').map((s) => s.trim()).filter(Boolean) : [], text };
  }
  const res = validateCreative(input);
  console.log(JSON.stringify(res, null, 2));
  process.exit(res.verdict === 'BLOCK' ? 2 : 0);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('validate-compliance.mjs')) {
  main();
}
