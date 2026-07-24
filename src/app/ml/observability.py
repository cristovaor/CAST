"""Observability middleware for the inference engine."""
import logging
import time
from functools import wraps
from typing import Callable, Any

from app.schemas.inference import InferenceRunResult

logger = logging.getLogger(__name__)

def log_inference_run(func: Callable) -> Callable:
    """Decorator to log latency, status, and anomalies of an inference run."""
    @wraps(func)
    def wrapper(*args, **kwargs) -> InferenceRunResult:
        t_start = time.perf_counter()
        
        try:
            result: InferenceRunResult = func(*args, **kwargs)
            duration_ms = (time.perf_counter() - t_start) * 1000
            
            logger.info(
                f"[INFERENCE] request_id={result.request_id} "
                f"video_id={result.video_id} "
                f"model_version={result.model_version} "
                f"latency_ms={duration_ms:.1f} "
                f"status={result.status}"
            )
            
            # Log any anomalies
            for action_res in result.actions:
                if action_res.error:
                    logger.error(
                        f"[INFERENCE_ERROR] request_id={result.request_id} "
                        f"action={action_res.action} error={action_res.error}"
                    )
                elif action_res.events_per_minute > 50:
                    logger.warning(
                        f"[INFERENCE_ANOMALY] request_id={result.request_id} "
                        f"action={action_res.action} "
                        f"high_rate={action_res.events_per_minute} events/min"
                    )
            
            return result
            
        except Exception as e:
            duration_ms = (time.perf_counter() - t_start) * 1000
            logger.exception(
                f"[INFERENCE_CRITICAL] Failed after {duration_ms:.1f}ms: {e}"
            )
            raise
            
    return wrapper
