from __future__ import annotations

import hashlib
import json
import math
import subprocess
from dataclasses import dataclass
from pathlib import Path

MODEL_SHA256 = "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff"


@dataclass
class FaceLandmarkerOutput:
    landmarks: object
    features: object
    quality: object


def verify_model(path: str, expected_sha256: str = MODEL_SHA256) -> str:
    digest = hashlib.sha256(Path(path).read_bytes()).hexdigest()
    if digest != expected_sha256:
        raise ValueError(f"Face Landmarker model checksum mismatch: {digest}")
    return digest


def probe_pts_us(video_path: str) -> list[int]:
    completed = subprocess.run(
        [
            "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_frames",
            "-show_entries", "frame=best_effort_timestamp_time", "-of", "json", video_path,
        ],
        check=True, capture_output=True, text=True,
    )
    frames = json.loads(completed.stdout).get("frames") or []
    points = [round(float(frame["best_effort_timestamp_time"]) * 1_000_000) for frame in frames if frame.get("best_effort_timestamp_time") is not None]
    if any(right < left for left, right in zip(points, points[1:])):
        raise ValueError("Video PTS are not monotonic")
    return points


def rotation_matrix_to_euler(matrix) -> tuple[float, float, float]:
    sy = math.sqrt(float(matrix[0][0]) ** 2 + float(matrix[1][0]) ** 2)
    singular = sy < 1e-6
    if not singular:
        roll = math.atan2(float(matrix[2][1]), float(matrix[2][2]))
        pitch = math.atan2(-float(matrix[2][0]), sy)
        yaw = math.atan2(float(matrix[1][0]), float(matrix[0][0]))
    else:
        roll = math.atan2(-float(matrix[1][2]), float(matrix[1][1]))
        pitch = math.atan2(-float(matrix[2][0]), sy)
        yaw = 0.0
    return tuple(math.degrees(value) for value in (yaw, pitch, roll))


class FaceLandmarkerV2:
    def __init__(self, model_path: str, *, expected_sha256: str = MODEL_SHA256, min_confidence: float = 0.5):
        self.model_path = model_path
        self.model_checksum = verify_model(model_path, expected_sha256)
        self.min_confidence = min_confidence

    def extract_from_video(self, video_path: str, video_id: str) -> FaceLandmarkerOutput:
        import cv2
        import mediapipe as mp
        import numpy as np
        import pandas as pd

        pts_us = probe_pts_us(video_path)
        options = mp.tasks.vision.FaceLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=self.model_path),
            running_mode=mp.tasks.vision.RunningMode.VIDEO,
            num_faces=2,
            min_face_detection_confidence=self.min_confidence,
            min_face_presence_confidence=self.min_confidence,
            min_tracking_confidence=self.min_confidence,
            output_face_blendshapes=True,
            output_facial_transformation_matrixes=True,
        )
        landmarks_rows: list[dict] = []
        feature_rows: list[dict] = []
        quality_rows: list[dict] = []
        capture = cv2.VideoCapture(video_path)
        previous_timestamp_ms = -1
        frame_index = 0
        with mp.tasks.vision.FaceLandmarker.create_from_options(options) as landmarker:
            while capture.isOpened():
                success, bgr = capture.read()
                if not success:
                    break
                source_time_us = pts_us[frame_index] if frame_index < len(pts_us) else round(capture.get(cv2.CAP_PROP_POS_MSEC) * 1000)
                timestamp_ms = max(previous_timestamp_ms + 1, round(source_time_us / 1000))
                previous_timestamp_ms = timestamp_ms
                rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
                result = landmarker.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), timestamp_ms)
                faces = result.face_landmarks or []
                blur_score = float(cv2.Laplacian(cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var())
                flags: list[str] = []
                if len(faces) > 1:
                    flags.append("multiple_faces")
                if blur_score < 50.0:
                    flags.append("blur")
                detected = bool(faces)
                if detected:
                    for landmark_index, landmark in enumerate(faces[0]):
                        landmarks_rows.append({
                            "video_id": video_id, "frame_idx": frame_index,
                            "timestamp_ms": source_time_us / 1000.0, "source_time_us": source_time_us,
                            "source_clock_id": "video-pts", "face_detected": True,
                            "landmark_idx": landmark_index, "x": landmark.x, "y": landmark.y, "z": landmark.z,
                            "visibility": getattr(landmark, "visibility", None), "presence": getattr(landmark, "presence", None),
                        })
                else:
                    landmarks_rows.append({
                        "video_id": video_id, "frame_idx": frame_index,
                        "timestamp_ms": source_time_us / 1000.0, "source_time_us": source_time_us,
                        "source_clock_id": "video-pts", "face_detected": False,
                        "landmark_idx": -1, "x": np.nan, "y": np.nan, "z": np.nan,
                        "visibility": np.nan, "presence": np.nan,
                    })
                blendshapes = {
                    category.category_name: float(category.score)
                    for category in ((result.face_blendshapes or [[]])[0] if detected else [])
                }
                matrix = (result.facial_transformation_matrixes or [None])[0] if detected else None
                yaw = pitch = roll = None
                if matrix is not None:
                    yaw, pitch, roll = rotation_matrix_to_euler(matrix)
                    if max(abs(yaw), abs(pitch)) > 45:
                        flags.append("extreme_pose")
                feature_rows.append({
                    "frame_idx": frame_index, "source_time_us": source_time_us,
                    "source_clock_id": "video-pts", "canonical_time_us": None,
                    "uncertainty_us": 0, "quality_flags": flags, "valid": detected,
                    "head_yaw_deg": yaw, "head_pitch_deg": pitch, "head_roll_deg": roll,
                    "eye_openness_left": 1.0 - blendshapes.get("eyeBlinkLeft", 0.0) if detected else None,
                    "eye_openness_right": 1.0 - blendshapes.get("eyeBlinkRight", 0.0) if detected else None,
                    "blendshapes": json.dumps(blendshapes, separators=(",", ":")),
                    "facial_transformation_matrix": json.dumps(matrix.tolist(), separators=(",", ":")) if matrix is not None else None,
                })
                quality_rows.append({
                    "frame_idx": frame_index, "source_time_us": source_time_us,
                    "source_clock_id": "video-pts", "canonical_time_us": None,
                    "uncertainty_us": 0, "quality_flags": flags, "valid": detected,
                    "face_count": len(faces), "blur_score": blur_score,
                })
                frame_index += 1
        capture.release()
        return FaceLandmarkerOutput(pd.DataFrame(landmarks_rows), pd.DataFrame(feature_rows), pd.DataFrame(quality_rows))
