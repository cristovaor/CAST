import numpy as np

class MockInferenceEngine:
    """
    Simulates a trained Keras model for the E2E pipeline.
    It expects the input shape (batch, 7, features) and outputs (batch, 2).
    """
    def __init__(self, action: str):
        self.action = action
        # Probabilidade base heurística pra não gerar eventos sempre vazios
        self.trigger_prob = 0.05 if action != "VR" else 0.01

    def predict(self, X: np.ndarray) -> np.ndarray:
        batch_size = X.shape[0]
        out = np.zeros((batch_size, 2))
        
        # Gera valores aleatórios baseados no limiar do trigger_prob
        rand_vals = np.random.rand(batch_size)
        is_positive = rand_vals < self.trigger_prob
        
        out[:, 1] = np.where(is_positive, 0.8, 0.1)  # prob_pos
        out[:, 0] = 1.0 - out[:, 1]                  # prob_neg
        
        return out
