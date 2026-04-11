
import sys
import json
import re
import pickle
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from sentence_transformers import SentenceTransformer

# ── Load pickle ───────────────────────────────────────────────────────────────
with open("model.pkl", "rb") as f:
    data = pickle.load(f)

disease_names   = data["disease_names"]    # list[str]
descriptions    = data["descriptions"]     # list[str] — comma-separated symptoms
disease_vectors = data["disease_vectors"]  # np.ndarray
freq_weights    = data["freq_weights"]     # np.ndarray

# ── Load SBERT encoder ────────────────────────────────────────────────────────
encoder = SentenceTransformer("all-MiniLM-L6-v2")

# ── Preprocessing ─────────────────────────────────────────────────────────────
def process(text):
    return re.sub(r"[^a-z\s]", "", text.lower()).strip()

# ── Read input from Node (stdin) ──────────────────────────────────────────────
input_data = json.loads(sys.stdin.read())
user_text  = input_data.get("symptoms", "")
top_n      = input_data.get("top_n", 5)

# ── Predict ───────────────────────────────────────────────────────────────────
user_vec    = encoder.encode([process(user_text)], convert_to_numpy=True)
similarity  = cosine_similarity(user_vec, disease_vectors).flatten()
final_score = similarity * freq_weights
top_idx     = final_score.argsort()[::-1][:top_n]

results = []
for i in top_idx:
    results.append({
        "disease":    disease_names[i],
        "symptoms":   [s.strip() for s in descriptions[i].split(",")],  # split for frontend
        "similarity": round(float(similarity[i]), 3),
        "score":      round(float(final_score[i]), 3),
    })

# ── Write output to Node (stdout) ─────────────────────────────────────────────
print(json.dumps(results))