

import ast
import pandas as pd
from pymongo import MongoClient

MONGO_URI  = "mongodb://localhost:27017"
DB_NAME    = "healthdb"
COLLECTION = "protocols"
CSV_PATH   = "medline_diseases_symptoms.csv"

client = MongoClient(MONGO_URI)
col    = client[DB_NAME][COLLECTION]

# ── Get a real user ID from your users collection ─────────────────────────────
system_user = client[DB_NAME]["users"].find_one({}, {"_id": 1})
if not system_user:
    raise ValueError("No users found. Create at least one user before seeding.")
system_user_id = system_user["_id"]

# ── Import CSV ────────────────────────────────────────────────────────────────
df   = pd.read_csv(CSV_PATH)
docs = []

for _, row in df.iterrows():
    symptoms_list = ast.literal_eval(row["Symptoms"])
    docs.append({
        "name":        row["Disease_Name"],
        "description": ", ".join(symptoms_list),  # symptoms as plain string
        "createdBy":   system_user_id,
    })

col.insert_many(docs)
print(f"Inserted {len(docs)} documents into {DB_NAME}.{COLLECTION}")

col.create_index("name")
client.close()