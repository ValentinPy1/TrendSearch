import pickle
import numpy as np
import json
import sys

# Load pickle file
with open('new_keywords/vector_database.pkl', 'rb') as f:
    data = pickle.load(f)

embeddings = data['embeddings']
keywords = data['keywords']

# Convert embeddings to list for JSON serialization
embeddings_list = embeddings.tolist()

# Save keywords
with open('new_keywords/keywords_list.json', 'w') as f:
    json.dump(keywords, f)

print(f"Extracted {len(keywords)} keywords and embeddings with shape {embeddings.shape}")

