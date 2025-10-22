#!/usr/bin/env python3
"""
Convert vector database from pickle format to Node.js/TypeScript compatible formats
"""

import pickle
import json
import numpy as np
import os
from typing import Dict, List, Any
import struct

def load_pickle_database(pickle_path: str) -> Dict[str, Any]:
    """Load the pickle database"""
    print(f"Loading pickle database from {pickle_path}...")
    with open(pickle_path, 'rb') as f:
        database = pickle.load(f)
    
    print(f"Loaded {len(database['keywords'])} keywords")
    print(f"Embeddings shape: {database['embeddings'].shape}")
    return database

def convert_to_json_format(database: Dict[str, Any], output_path: str):
    """Convert to single JSON file format (Option 2)"""
    print(f"Converting to JSON format: {output_path}")
    
    # Convert numpy arrays to lists for JSON serialization
    embeddings_list = database['embeddings'].tolist()
    
    json_data = {
        "keywords": database['keywords'],
        "embeddings": embeddings_list,
        "version": "1.0.0",
        "total_keywords": len(database['keywords']),
        "embedding_dimension": database['embeddings'].shape[1]
    }
    
    with open(output_path, 'w') as f:
        json.dump(json_data, f, indent=2)
    
    file_size = os.path.getsize(output_path) / (1024 * 1024)
    print(f"JSON file created: {file_size:.2f} MB")

def convert_to_binary_chunks(database: Dict[str, Any], output_dir: str, chunk_size: int = 8000):
    """Convert to binary chunk format (Option 1)"""
    print(f"Converting to binary chunks in {output_dir}...")
    
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    keywords = database['keywords']
    embeddings = database['embeddings']
    total_keywords = len(keywords)
    
    # Calculate number of chunks needed
    num_chunks = (total_keywords + chunk_size - 1) // chunk_size
    print(f"Creating {num_chunks} chunks of ~{chunk_size} keywords each")
    
    chunk_metadata = {
        "version": "1.0.0",
        "total_keywords": total_keywords,
        "embedding_dimension": embeddings.shape[1],
        "chunk_size": chunk_size,
        "num_chunks": num_chunks,
        "chunks": []
    }
    
    for chunk_idx in range(num_chunks):
        start_idx = chunk_idx * chunk_size
        end_idx = min(start_idx + chunk_size, total_keywords)
        
        # Get chunk data
        chunk_keywords = keywords[start_idx:end_idx]
        chunk_embeddings = embeddings[start_idx:end_idx]
        
        # Save binary chunk
        chunk_filename = f"chunk_{chunk_idx:02d}.bin"
        chunk_path = os.path.join(output_dir, chunk_filename)
        
        # Save embeddings as binary Float32Array
        with open(chunk_path, 'wb') as f:
            # Write as little-endian float32
            chunk_embeddings.astype(np.float32).tobytes()
            f.write(chunk_embeddings.astype(np.float32).tobytes())
        
        # Add to metadata
        chunk_info = {
            "chunk_id": chunk_idx,
            "filename": chunk_filename,
            "start_index": start_idx,
            "end_index": end_idx,
            "keyword_count": len(chunk_keywords),
            "keywords": chunk_keywords
        }
        chunk_metadata["chunks"].append(chunk_info)
        
        print(f"Created chunk {chunk_idx}: {len(chunk_keywords)} keywords -> {chunk_filename}")
    
    # Save metadata
    metadata_path = os.path.join(output_dir, "metadata.json")
    with open(metadata_path, 'w') as f:
        json.dump(chunk_metadata, f, indent=2)
    
    print(f"Binary chunks created in {output_dir}")
    print(f"Metadata saved to {metadata_path}")

def convert_to_csv_and_binary(database: Dict[str, Any], output_dir: str):
    """Convert to CSV + binary format (Option 3)"""
    print(f"Converting to CSV + binary format in {output_dir}...")
    
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    # Save keywords as CSV
    import pandas as pd
    keywords_df = database['keywords_df']
    csv_path = os.path.join(output_dir, "keywords.csv")
    keywords_df.to_csv(csv_path, index=False)
    print(f"Keywords CSV saved: {csv_path}")
    
    # Save embeddings as binary numpy array
    embeddings_path = os.path.join(output_dir, "embeddings.npy")
    np.save(embeddings_path, database['embeddings'])
    print(f"Embeddings binary saved: {embeddings_path}")
    
    # Create metadata
    metadata = {
        "version": "1.0.0",
        "total_keywords": len(database['keywords']),
        "embedding_dimension": database['embeddings'].shape[1],
        "keywords_file": "keywords.csv",
        "embeddings_file": "embeddings.npy"
    }
    
    metadata_path = os.path.join(output_dir, "metadata.json")
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"Metadata saved: {metadata_path}")

def main():
    """Main conversion function"""
    pickle_path = "/home/valentin/Home/Pioneers/InnovationMachine/vector_database.pkl"
    
    if not os.path.exists(pickle_path):
        print(f"Error: Pickle file not found at {pickle_path}")
        return
    
    # Load the database
    database = load_pickle_database(pickle_path)
    
    print("\n" + "="*60)
    print("CONVERTING VECTOR DATABASE")
    print("="*60)
    
    # Option 1: Binary chunks (most efficient for Node.js)
    print("\n1. Creating binary chunks format...")
    convert_to_binary_chunks(database, "vector_database_chunks")
    
    # Option 2: Single JSON file (simpler but larger)
    print("\n2. Creating single JSON file...")
    convert_to_json_format(database, "vector_database.json")
    
    # Option 3: CSV + Binary
    print("\n3. Creating CSV + binary format...")
    convert_to_csv_and_binary(database, "vector_database_csv_binary")
    
    print("\n" + "="*60)
    print("CONVERSION COMPLETE!")
    print("="*60)
    print("Available formats:")
    print("1. Binary chunks: ./vector_database_chunks/ (most efficient)")
    print("2. Single JSON: ./vector_database.json (simplest)")
    print("3. CSV + Binary: ./vector_database_csv_binary/ (most flexible)")

if __name__ == "__main__":
    main()
