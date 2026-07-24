import numpy as np

def make_windows(X: np.ndarray, y: np.ndarray, sequence_length: int = 7) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Generates sliding windows of length sequence_length.
    The target label corresponds to the last frame of the window.
    
    Returns:
        X_windows: (n_samples, sequence_length, n_features)
        y_windows: (n_samples, ...)
        target_indices: original frame indices for the targets
    """
    n_frames = X.shape[0]
    n_samples = n_frames - sequence_length + 1
    
    if n_samples <= 0:
        return np.array([]), np.array([]), np.array([])
        
    X_windows = np.zeros((n_samples, sequence_length, X.shape[1]), dtype=X.dtype)
    y_windows = np.zeros((n_samples, *y.shape[1:]), dtype=y.dtype) if y is not None else None
    target_indices = np.zeros(n_samples, dtype=int)
    
    for i in range(n_samples):
        X_windows[i] = X[i : i + sequence_length]
        target_idx = i + sequence_length - 1
        target_indices[i] = target_idx
        if y is not None:
            y_windows[i] = y[target_idx]
            
    return X_windows, y_windows, target_indices
