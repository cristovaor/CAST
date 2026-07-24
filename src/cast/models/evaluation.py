import numpy as np
from sklearn.metrics import confusion_matrix, classification_report
import pandas as pd

def predict_action(model, X, threshold=0.5):
    """
    Prediz a probabilidade e a classe final com base no limiar especificado.
    """
    proba = model.predict(X)[:, 1]
    pred = (proba >= threshold).astype(int)
    return proba, pred

def evaluate_frame_level(y_true, y_pred):
    """
    Avalia métricas frame a frame.
    y_true e y_pred devem ser arrays 1D binários.
    """
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    if cm.shape == (2, 2):
        tn, fp, fn, tp = cm.ravel()
    else:
        tn, fp, fn, tp = 0, 0, 0, 0
        if y_true[0] == 0:
            tn = cm[0, 0]
        else:
            tp = cm[0, 0]
            
    accuracy = (tp + tn) / max((tp + tn + fp + fn), 1)
    precision = tp / max((tp + fp), 1)
    recall = tp / max((tp + fn), 1)
    specificity = tn / max((tn + fp), 1)
    f1 = 2 * (precision * recall) / max((precision + recall), 1e-8)
    
    return {
        "TN": int(tn),
        "FP": int(fp),
        "FN": int(fn),
        "TP": int(tp),
        "accuracy": float(accuracy),
        "precision": float(precision),
        "recall": float(recall),
        "specificity": float(specificity),
        "f1": float(f1)
    }

def calculate_descriptor_errors(annotated: dict, predicted: dict) -> pd.DataFrame:
    """
    Calcula erro absoluto e relativo para descritores agregados.
    """
    records = []
    for action in annotated.keys():
        ann = annotated[action]
        pred = predicted.get(action, 0)
        abs_err = abs(ann - pred)
        rel_err = abs_err / max(ann, 1)
        records.append({
            "action": action,
            "annotated": ann,
            "predicted": pred,
            "absolute_error": abs_err,
            "relative_error": rel_err
        })
    return pd.DataFrame(records)
