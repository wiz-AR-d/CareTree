
import os
import pickle
import re
import numpy as np
from dotenv import load_dotenv
from pymongo import MongoClient
from sentence_transformers import SentenceTransformer

load_dotenv()

MONGO_URI  = os.environ.get('MONGO_URI')
DB_NAME    = "healthdb"
COLLECTION = "protocols"
OUTPUT_PKL = "model.pkl"

COMMON_DISEASES = {
    "Common cold": 1.30, "Flu": 1.30, "Influenza": 1.30,
    "Fever": 1.25, "Headache": 1.25, "Migraine": 1.25,
    "Diarrhea": 1.25, "Vomiting": 1.20, "Nausea": 1.20,
    "Cough": 1.20, "Sore throat": 1.20, "Allergic reactions": 1.20,
    "Urinary tract infection": 1.20, "Gastroenteritis": 1.20,
    "Food poisoning": 1.20, "Hypertension": 1.20,
    "Type 2 diabetes": 1.20, "Asthma": 1.20, "Anemia": 1.15,
    "Back pain": 1.15, "Anxiety": 1.15, "Depression": 1.15,
    "Pneumonia": 1.15, "Bronchitis": 1.15, "Sinusitis": 1.15,
    "Prune belly syndrome": 0.80, "Agranulocytosis": 0.85,
    "Toxoplasmosis": 0.85, "Herpangina": 0.90,
}

def process(text):
    return re.sub(r"[^a-z\s]", "", text.lower()).strip()

# ── 1. Load from MongoDB ──────────────────────────────────────────────────────
print("Connecting to MongoDB...")
client     = MongoClient(MONGO_URI)
collection = client[DB_NAME][COLLECTION]

# name = disease name, description = comma-separated symptoms string
docs = list(collection.find({}, {"_id": 0, "name": 1, "description": 1}))
print(f"Loaded {len(docs)} protocols from MongoDB")

if not docs:
    raise ValueError("No documents found. Did you run seed_mongo.py first?")

# ── 2. Build parallel arrays ──────────────────────────────────────────────────
disease_names   = [d["name"] for d in docs]
descriptions    = [d["description"] for d in docs]   # plain string symptoms
symptoms_texts  = [process(d) for d in descriptions] # cleaned for encoding

freq_weights = np.array([
    COMMON_DISEASES.get(name, 1.0) for name in disease_names
])

# ── 3. Encode with SBERT ──────────────────────────────────────────────────────
print("Loading SBERT model...")
model = SentenceTransformer("all-MiniLM-L6-v2")

print(f"Encoding {len(symptoms_texts)} diseases...")
disease_vectors = model.encode(
    symptoms_texts,
    batch_size=64,
    show_progress_bar=True,
    convert_to_numpy=True
)

# ── 4. Save pickle ────────────────────────────────────────────────────────────
payload = {
    "disease_names":   disease_names,   # list[str]
    "descriptions":    descriptions,    # list[str]  — raw for display
    "disease_vectors": disease_vectors, # np.ndarray (N, 384)
    "freq_weights":    freq_weights,    # np.ndarray (N,)
}

with open(OUTPUT_PKL, "wb") as f:
    pickle.dump(payload, f)

print(f"\nSaved to {OUTPUT_PKL}")
print(f"  diseases:     {len(disease_names)}")
print(f"  vector shape: {disease_vectors.shape}")
client.close()