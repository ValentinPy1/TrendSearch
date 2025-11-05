import pickle
import numpy as np

# Load pickle file
with open('new_keywords/vector_database.pkl', 'rb') as f:
    data = pickle.load(f)

embeddings = data['embeddings']

# Save as binary file that Node.js can read
# We'll use numpy to save, then Node will read it
embeddings_bytes = embeddings.astype(np.float32).tobytes()

with open('new_keywords/embeddings.bin', 'wb') as f:
    f.write(embeddings_bytes)

print(f"Saved embeddings binary: {len(embeddings_bytes)} bytes")

