def calculate_quality_score(metrics: dict) -> dict:
    processed_frames = metrics.get("processed_frames", 0)
    face_detected_count = metrics.get("face_detected_count", 0)
    fps = metrics.get("fps", 0)
    
    if processed_frames == 0:
        return {"face_detection_rate": 0.0, "quality_score": 0.0, "warnings": ["empty_video"]}
        
    detection_rate = face_detected_count / processed_frames
    
    warnings = []
    if detection_rate < 0.85:
        warnings.append("low_face_detection")
    if fps < 15:
        warnings.append("low_fps")
        
    quality_score = detection_rate * 1.0 # simplified scoring for MVP
    
    return {
        "face_detection_rate": detection_rate,
        "quality_score": quality_score,
        "warnings": warnings
    }
