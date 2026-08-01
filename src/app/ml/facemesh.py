"""MediaPipe FaceMesh extraction adapter."""
from __future__ import annotations

from cast.vision.facemesh_extractor import FaceMeshExtractor
import pandas as pd

class FaceMeshAdapter:
    """Adapter for FaceMesh landmark extraction."""
    
    def __init__(self, **extractor_options):
        self.extractor = FaceMeshExtractor(**extractor_options)

    def extract_from_video(self, video_path: str, video_id: str) -> pd.DataFrame:
        """Extract landmarks from a video file.
        
        Args:
            video_path: Path to the local video file.
            video_id: Stable video identifier persisted with every landmark.
            
        Returns:
            DataFrame containing extracted landmarks.
        """
        return self.extractor.extract_from_video(video_path, video_id)
