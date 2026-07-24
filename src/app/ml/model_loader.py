"""Model loading utilities for the ML worker.

This module contains the heavy ML framework imports (tensorflow, torch, onnxruntime)
and should ONLY be imported by the Celery worker, never by the API server.
"""
from __future__ import annotations

import os
import tempfile
from typing import Any, Tuple

from cast.models.manifest import ModelManifest


def load_model_artifact(path: str, architecture: str) -> Any:
    """Load a model artifact from disk using the appropriate ML framework.
    
    Args:
        path: Path to the model file on disk.
        architecture: One of 'keras', 'tensorflow', 'pytorch', 'torch', 'onnx'.
    
    Returns:
        The loaded model object.
    """
    arch = architecture.lower()
    if arch == "onnx":
        import onnxruntime as ort
        return ort.InferenceSession(path)
    elif arch in ("pytorch", "torch"):
        import torch
        return torch.load(path, weights_only=False)
    else:
        import tensorflow as tf
        return tf.keras.models.load_model(path)


def load_active_model_artifact(
    artifact_uri: str,
    manifest: ModelManifest,
    storage_service: Any = None,
) -> Any:
    """Download (if needed) and load a model artifact.
    
    Args:
        artifact_uri: Local path or s3:// URI to the model artifact.
        manifest: The model manifest with architecture info.
        storage_service: The storage service instance for S3/MinIO downloads.
    
    Returns:
        The loaded model object.
    """
    if artifact_uri.startswith("s3://"):
        if storage_service is None:
            from app.services.storage_service import storage_service as _ss
            storage_service = _ss
        
        bucket = storage_service.bucket_name
        key = artifact_uri.replace(f"s3://{bucket}/", "")
        
        # Determine file suffix
        suffix = ".keras"
        arch = manifest.architecture.lower()
        if arch == "onnx":
            suffix = ".onnx"
        elif arch in ("pytorch", "torch"):
            suffix = ".pt"
        
        fd, temp_path = tempfile.mkstemp(suffix=suffix)
        os.close(fd)
        
        storage_service.s3.download_file(bucket, key, temp_path)
        try:
            model = load_model_artifact(temp_path, manifest.architecture)
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)
    else:
        if not os.path.exists(artifact_uri):
            raise FileNotFoundError(f"Local model artifact not found at {artifact_uri}")
        model = load_model_artifact(artifact_uri, manifest.architecture)
    
    return model
