import cv2
import mediapipe as mp
import pandas as pd
import numpy as np

from cast.config.landmarks import FACEMESH_REGIONS


FLOW_WIDTH = 320


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

    @staticmethod
    def _flow_mean(
        magnitude: np.ndarray | None,
        landmarks,
        point_ids,
    ) -> float:
        if magnitude is None:
            return 0.0
        height, width = magnitude.shape
        coordinates = [
            (
                int(np.clip(landmarks[index].x * width, 0, width - 1)),
                int(np.clip(landmarks[index].y * height, 0, height - 1)),
            )
            for index in point_ids
            if 0 <= index < len(landmarks)
        ]
        if not coordinates:
            return 0.0
        xs, ys = zip(*coordinates)
        pad_x = max(2, round((max(xs) - min(xs) + 1) * 0.15))
        pad_y = max(2, round((max(ys) - min(ys) + 1) * 0.15))
        x0, x1 = max(0, min(xs) - pad_x), min(width, max(xs) + pad_x + 1)
        y0, y1 = max(0, min(ys) - pad_y), min(height, max(ys) + pad_y + 1)
        region = magnitude[y0:y1, x0:x1]
        return float(np.mean(region)) if region.size else 0.0

    @staticmethod
    def _frame_metrics(image, previous_gray, landmarks=None):
        height, width = image.shape[:2]
        target_height = max(1, round(height * FLOW_WIDTH / max(width, 1)))
        gray = cv2.cvtColor(
            cv2.resize(image, (FLOW_WIDTH, target_height)),
            cv2.COLOR_BGR2GRAY,
        )
        blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        illumination_mean = float(np.mean(gray) / 255.0)
        magnitude = None
        if previous_gray is not None and previous_gray.shape == gray.shape:
            flow = cv2.calcOpticalFlowFarneback(
                previous_gray,
                gray,
                None,
                0.5,
                3,
                15,
                3,
                5,
                1.2,
                0,
            )
            magnitude = cv2.magnitude(flow[..., 0], flow[..., 1])
        metrics = {
            "flow_eyes": 0.0,
            "flow_mouth": 0.0,
            "flow_brows": 0.0,
            "flow_face": float(np.mean(magnitude)) if magnitude is not None else 0.0,
            "blur_score": blur_score,
            "illumination_mean": illumination_mean,
        }
        if landmarks is not None:
            metrics.update(
                {
                    "flow_eyes": FaceMeshExtractor._flow_mean(
                        magnitude,
                        landmarks,
                        (
                            *FACEMESH_REGIONS["olho_direito"],
                            *FACEMESH_REGIONS["olho_esquerdo"],
                        ),
                    ),
                    "flow_mouth": FaceMeshExtractor._flow_mean(
                        magnitude,
                        landmarks,
                        FACEMESH_REGIONS["labios"],
                    ),
                    "flow_brows": FaceMeshExtractor._flow_mean(
                        magnitude,
                        landmarks,
                        (
                            *FACEMESH_REGIONS["sobrancelha_direita"],
                            *FACEMESH_REGIONS["sobrancelha_esquerda"],
                        ),
                    ),
                    "flow_face": FaceMeshExtractor._flow_mean(
                        magnitude,
                        landmarks,
                        FACEMESH_REGIONS["contorno_rosto"],
                    ),
                }
            )
        return gray, metrics
        
    def extract_from_video(self, video_path: str, video_id: str) -> pd.DataFrame:
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        
        records = []
        frame_idx = 0
        previous_gray = None
        
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
                previous_gray, frame_metrics = self._frame_metrics(
                    image,
                    previous_gray,
                    face_landmarks.landmark,
                )
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
                        "presence": getattr(landmark, "presence", None),
                        **frame_metrics,
                    })
            else:
                previous_gray, frame_metrics = self._frame_metrics(
                    image,
                    previous_gray,
                )
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
                    "presence": np.nan,
                    **frame_metrics,
                })
                
            frame_idx += 1
            
        cap.release()
        return pd.DataFrame(records)
