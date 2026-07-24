import cv2
import mediapipe as mp
import pandas as pd
import numpy as np

class FaceMeshExtractor:
    def __init__(self, refine_landmarks=True, min_detection_confidence=0.5, min_tracking_confidence=0.5):
        self.mp_face_mesh = mp.solutions.face_mesh
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            static_image_mode=False,
            max_num_faces=1,
            refine_landmarks=refine_landmarks,
            min_detection_confidence=min_detection_confidence,
            min_tracking_confidence=min_tracking_confidence,
        )
        
    def extract_from_video(self, video_path: str, video_id: str) -> pd.DataFrame:
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        
        records = []
        frame_idx = 0
        
        while cap.isOpened():
            success, image = cap.read()
            if not success:
                break
                
            timestamp_ms = (frame_idx / fps) * 1000 if fps > 0 else 0.0
            
            # To improve performance, optionally mark the image as not writeable to
            # pass by reference.
            image.flags.writeable = False
            image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            results = self.face_mesh.process(image_rgb)
            
            face_detected = bool(results.multi_face_landmarks)
            
            if face_detected:
                face_landmarks = results.multi_face_landmarks[0]
                for idx, landmark in enumerate(face_landmarks.landmark):
                    records.append({
                        "video_id": video_id,
                        "frame_idx": frame_idx,
                        "timestamp_ms": timestamp_ms,
                        "face_detected": True,
                        "landmark_idx": idx,
                        "x": landmark.x,
                        "y": landmark.y,
                        "z": landmark.z,
                        "visibility": getattr(landmark, "visibility", None),
                        "presence": getattr(landmark, "presence", None)
                    })
            else:
                records.append({
                    "video_id": video_id,
                    "frame_idx": frame_idx,
                    "timestamp_ms": timestamp_ms,
                    "face_detected": False,
                    "landmark_idx": -1,
                    "x": np.nan,
                    "y": np.nan,
                    "z": np.nan,
                    "visibility": np.nan,
                    "presence": np.nan
                })
                
            frame_idx += 1
            
        cap.release()
        return pd.DataFrame(records)
