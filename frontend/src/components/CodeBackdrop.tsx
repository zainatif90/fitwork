import { memo } from "react";

/*
 * Decorative background: faint columns of FitWork's own code (Match Score, pgvector search, Skill Gap,
 * the frontend click effect) slowly scrolling behind the page, like the system working underneath.
 *
 * Cheap on purpose: the text is drawn ONCE; each column is then only moved with a CSS transform
 * (the graphics card scrolls it, no JavaScript runs per frame). Visitors who ask for less motion
 * see it standing still. Styles: `.code-backdrop` in index.css.
 */

// Short excerpts of the real code (backend/app/services and frontend/src/lib), lightly condensed.
const SNIPPETS: string[] = [
  `# scoring.py - Match Score (0-100)
def semantic_score(cosine: float) -> float:
    low, high = settings.SEM_LOW, settings.SEM_HIGH
    return min(1.0, max(0.0, (cosine - low) / (high - low)))

def match_score(semantic, budget_fit, recency):
    fit_gate = min(1, semantic / settings.FIT_GATE)
    return 100 * (W_SEM * semantic
                  + fit_gate * (W_BUDGET * budget_fit
                                + W_RECENCY * recency))

def budget_fit(budget_type, lo, hi, hourly_rate):
    if budget_type == "hourly":
        if lo <= hourly_rate <= hi:
            return 1.0
        return _linear_falloff((lo - hourly_rate) / lo, 0.5)
    hours = hi / hourly_rate
    if hours < 1:
        return 0.0
    return 1.0 if hours <= 200 else 0.5`,

  `-- matching.py - nearest jobs with pgvector (HNSW)
SELECT id, title, budget_min, budget_max,
       1 - (embedding <=> :profile) AS cosine
FROM jobs
WHERE is_active = true
ORDER BY embedding <=> :profile
LIMIT 50;

# embeddings.py - all-MiniLM-L6-v2, 384 dims
vectors = model.embed(texts, batch_size=4)
emb = np.asarray(next(vectors), dtype=np.float32)
emb /= np.linalg.norm(emb)  # L2-normalised

# matching.py - one card per posting
seen: set[str] = set()
for job, cosine in candidates:
    key = posting_key(job.title, job.description)
    if key in seen:
        continue
    seen.add(key)`,

  `# skill_gap.py - which skill unlocks most jobs
with _compute_lock:
    jobs = _active_jobs(db, limit=SKILL_GAP_MAX_JOBS)
    field = top_k(jobs, profile_vec, k=200)
    for skill in candidate_skills:
        vec = embed(profile_text + skill)
        gained = sum(1 for j in field
                     if score(vec, j) >= MATCH_THRESHOLD
                     and score(base, j) < MATCH_THRESHOLD)
        radar.append((skill, gained))
radar.sort(key=lambda r: -r[1])

# agency.py - route each job to the best member
for job in candidate_jobs:
    best = max(members, key=lambda m: fit[m.id][job.id])
    assign(job, best, status="assigned")`,

  `// format.ts - how a score is labelled
export function scoreTone(score: number) {
  if (score >= 75) return { label: "Strong fit" };
  if (score >= 50) return { label: "Possible fit" };
  return { label: "Weak fit" };
}

# proposals.py - protect the free AI quota
used = int(redis_client.get(_rate_limit_key(GLOBAL_USER)) or 0)
return used < settings.PROPOSALS_GLOBAL_PER_DAY

// api.ts - remembered pages open at once
export function peek<T>(path: string): T | undefined {
  return remembered.get(buildUrl(path)) as T;
}

# auth.py - refresh tokens rotate
session = db.get(AuthSession, claims["sid"])
if session is None or session.revoked_at:
    raise HTTPException(401, "Session ended")
token = create_refresh_token(user.id, session.id)`,
];

const KEYWORDS = new Set([
  "def", "return", "if", "else", "for", "in", "and", "or", "not", "with", "is", "None", "True", "False", "raise",
  "continue", "lambda", "const", "export", "function", "as", "SELECT", "FROM", "WHERE", "ORDER", "BY", "LIMIT", "AS", "true",
]);

/** Tiny syntax colouring: comments, strings, numbers, keywords, function calls. Runs once per snippet. */
function highlight(code: string) {
  const re = /(#.*|\/\/.*|--.*)|("[^"]*"|`[^`]*`)|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_]\w*\b)(?=\s*\()|(\b[A-Za-z_]\w*\b)/g;
  const parts: { text: string; cls?: string }[] = [];
  let last = 0;
  for (const m of code.matchAll(re)) {
    if (m.index! > last) parts.push({ text: code.slice(last, m.index) });
    const cls = m[1] ? "cb-com" : m[2] ? "cb-str" : m[3] ? "cb-num" : m[4] ? "cb-fn" : KEYWORDS.has(m[5]) ? "cb-kw" : undefined;
    parts.push({ text: m[0], cls });
    last = m.index! + m[0].length;
  }
  parts.push({ text: code.slice(last) });
  return parts.map((p, i) => (p.cls ? <span key={i} className={p.cls}>{p.text}</span> : p.text));
}

const COLUMNS = SNIPPETS.map(highlight);

function CodeBackdropInner() {
  return (
    <div className="code-backdrop-anchor" aria-hidden>
      <div className="code-backdrop">
        {COLUMNS.map((code, i) => (
          <div key={i} className={`cb-col cb-col-${i}`}>
            {/* the text twice, so the loop has no visible jump */}
            <pre className="cb-text">{code}{"\n\n"}{code}{"\n\n"}</pre>
          </div>
        ))}
        <span className="cb-scan" />
      </div>
    </div>
  );
}

export const CodeBackdrop = memo(CodeBackdropInner);
