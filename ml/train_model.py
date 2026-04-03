#!/usr/bin/env python3
"""
ML Model Training Script para LogiTrack
Entrena un modelo de regresión para predecir tiempo de entrega
Lee datos del CSV generado por el sistema
"""

import sys
import json
import pandas as pd
from pathlib import Path
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import cross_val_score
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import numpy as np

def entrenar_modelo(csv_path):
    """
    Entrena modelo de regresión para predecir días de entrega

    Args:
        csv_path: Ruta al archivo training_data.csv

    Returns:
        dict: Métricas del modelo
    """
    try:
        # Verificar que el archivo existe
        if not Path(csv_path).exists():
            return {
                "error": f"Archivo no encontrado: {csv_path}",
                "ok": False
            }

        # Leer CSV
        df = pd.read_csv(csv_path)

        # Validar que tenga datos
        if df.shape[0] < 5:
            return {
                "error": f"Datos insuficientes: {df.shape[0]} registros (mínimo 5)",
                "ok": False
            }

        # Separar features y target
        X = df[['len_direccion', 'len_producto', 'hora_creacion', 'dia_semana']]
        y = df['dias_entrega']

        # Validar que no haya NaN
        if X.isnull().any().any() or y.isnull().any():
            X = X.fillna(X.mean())
            y = y.fillna(y.mean())

        # Usar todo el dataset para entrenar (no hacer split si es pequeño)
        # Ya que tenemos pocos datos, entrenamos con todo e usamos cross-validation
        modelo = RandomForestRegressor(
            n_estimators=50,
            random_state=42,
            max_depth=5,
            min_samples_split=2
        )
        modelo.fit(X, y)

        # Predicciones en el mismo set
        y_pred = modelo.predict(X)

        # Métricas del modelo
        r2 = r2_score(y, y_pred)
        mae = mean_absolute_error(y, y_pred)
        rmse = np.sqrt(mean_squared_error(y, y_pred))

        # Cross-validation score
        cv_scores = cross_val_score(modelo, X, y, cv=min(5, df.shape[0]), scoring='r2')
        cv_mean = cv_scores.mean()
        cv_std = cv_scores.std()
        cv_score = f"{cv_mean:.4f} ± {cv_std:.4f}"

        # Validar que los valores no sean NaN
        if pd.isna(r2) or pd.isna(mae) or pd.isna(rmse):
            return {
                "error": "Error al calcular métricas: valores inválidos",
                "ok": False
            }

        # Retornar métricas
        return {
            "ok": True,
            "r2Score": float(r2),
            "mae": float(mae),
            "rmse": float(rmse),
            "cvScore": cv_score,
            "registrosUsados": int(df.shape[0]),
            "modelo": "RandomForestRegressor",
            "mensaje": f"Modelo entrenado con {df.shape[0]} registros"
        }

    except Exception as e:
        return {
            "error": f"Error al entrenar: {str(e)}",
            "ok": False
        }

if __name__ == '__main__':
    # Ruta por defecto o proporcionada como argumento
    if len(sys.argv) > 1:
        csv_path = sys.argv[1]
    else:
        csv_path = 'datasets/training_data.csv'

    resultado = entrenar_modelo(csv_path)

    # Imprimir JSON para que Node.js lo pueda parsear
    print(json.dumps(resultado))

    # Exit code basado en éxito/error
    sys.exit(0 if resultado.get('ok') else 1)

