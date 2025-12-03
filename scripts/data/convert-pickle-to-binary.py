#!/usr/bin/env python3
"""
Convert pickle vector database to binary chunk format compatible with keyword-vector-service.ts
"""

import pickle
import numpy as np
import json
import os
from pathlib import Path

CHUNK_SIZE = 2000
EMBEDDING_DIM = 384

def main():
    print('=== Converting Pickle Database to Binary Chunks ===\n')
    
    # Load pickle file
    print('[1/4] Loading pickle file...')
    pickle_path = Path('new_keywords/vector_database.pkl')
    if not pickle_path.exists():
        raise FileNotFoundError(f'Pickle file not found at {pickle_path}')
    
    with open(pickle_path, 'rb') as f:
        data = pickle.load(f)
    
    embeddings = data['embeddings']
    keywords = data['keywords']
    
    total_keywords = len(keywords)
    print(f'✓ Loaded {total_keywords} keywords and embeddings with shape {embeddings.shape}\n')
    
    # Verify embeddings shape
    if embeddings.shape != (total_keywords, EMBEDDING_DIM):
        raise ValueError(f'Embeddings shape mismatch: expected ({total_keywords}, {EMBEDDING_DIM}), got {embeddings.shape}')
    
    # Create embeddings directory
    embeddings_dir = Path('data/embeddings_chunks')
    embeddings_dir.mkdir(parents=True, exist_ok=True)
    
    # Split into chunks
    print('[2/4] Splitting into binary chunks...')
    chunks = []
    keyword_index = []
    
    total_chunks = (total_keywords + CHUNK_SIZE - 1) // CHUNK_SIZE
    
    for chunk_id in range(total_chunks):
        start_index = chunk_id * CHUNK_SIZE
        end_index = min(start_index + CHUNK_SIZE, total_keywords)
        chunk_keyword_count = end_index - start_index
        
        print(f'  Chunk {chunk_id + 1}/{total_chunks}: Keywords {start_index}-{end_index - 1}...')
        
        # Extract chunk embeddings
        chunk_embeddings = embeddings[start_index:end_index].astype(np.float32)
        
        # Save as binary file
        chunk_filename = f'chunk_{chunk_id:03d}.bin'
        chunk_path = embeddings_dir / chunk_filename
        with open(chunk_path, 'wb') as f:
            f.write(chunk_embeddings.tobytes())
        
        # Build keyword index
        for i in range(chunk_keyword_count):
            keyword_index.append({
                'keyword': keywords[start_index + i],
                'chunk_id': chunk_id,
                'local_index': i,
            })
        
        chunk_size_kb = chunk_path.stat().st_size / 1024
        print(f'  ✓ Saved chunk {chunk_id} ({chunk_size_kb:.0f} KB)')
        
        chunks.append({
            'chunk_id': chunk_id,
            'start_index': start_index,
            'end_index': end_index - 1,
            'keyword_count': chunk_keyword_count,
            'file_path': chunk_filename,
        })
    
    print(f'✓ Generated {len(chunks)} binary chunks\n')
    
    # Save metadata
    print('[3/4] Saving metadata...')
    metadata = {
        'version': '3.0.0',
        'created_at': np.datetime64('now').astype(str),
        'total_keywords': total_keywords,
        'embedding_dimensions': EMBEDDING_DIM,
        'chunk_size': CHUNK_SIZE,
        'chunks': chunks,
        'keywords': keyword_index,
    }
    
    metadata_path = Path('data/embeddings_metadata.json')
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    metadata_size_kb = metadata_path.stat().st_size / 1024
    print(f'✓ Saved metadata ({metadata_size_kb:.0f} KB)\n')
    
    # Calculate total size
    total_size = sum((embeddings_dir / chunk['file_path']).stat().st_size for chunk in chunks)
    total_size_mb = total_size / 1024 / 1024
    
    print('=== Conversion Complete ===')
    print(f'Total keywords: {total_keywords}')
    print(f'Total chunks: {len(chunks)}')
    print(f'Chunk size: {CHUNK_SIZE} keywords')
    print(f'Embedding dimensions: {EMBEDDING_DIM}')
    print(f'Total binary size: {total_size_mb:.2f} MB')
    print(f'Metadata size: {metadata_size_kb:.0f} KB')

if __name__ == '__main__':
    main()

