import numpy as np
from typing import Dict

def collapse_consecutive_positives(pred: np.ndarray) -> np.ndarray:
    """
    Converte sequência binária frame a frame em eventos.
    Mantém apenas a primeira posição positiva de cada bloco consecutivo.
    """
    pred = np.asarray(pred).astype(int)
    if pred.size == 0:
        return pred

    collapsed = np.zeros_like(pred)
    collapsed[0] = pred[0]

    for i in range(1, len(pred)):
        if pred[i] == 1 and pred[i - 1] == 0:
            collapsed[i] = 1

    return collapsed

def count_events(pred: np.ndarray) -> int:
    """Conta o número de eventos colapsados."""
    return int(collapse_consecutive_positives(pred).sum())

def build_video_descriptor(predictions_by_action: Dict[str, np.ndarray]) -> Dict[str, int]:
    """
    Gera o descritor final do vídeo.
    Ex: {'OF': 71, 'OC': 113, 'ML': 2, 'VR': 0}
    """
    return {
        action: count_events(pred)
        for action, pred in predictions_by_action.items()
    }
