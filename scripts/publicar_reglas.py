"""Publica firestore.rules en Firebase (reglas de seguridad de la base de usuarios).
Lo corre el workflow "Reglas de Firestore" cuando cambia el archivo. Usa la cuenta de servicio (secreto FIREBASE_SA)."""
import json
import os
import pathlib

import google.auth.transport.requests
from google.oauth2 import service_account

sa = json.loads(os.environ["FIREBASE_SA"])
proy = sa["project_id"]
cred = service_account.Credentials.from_service_account_info(sa, scopes=["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/firebase"])
s = google.auth.transport.requests.AuthorizedSession(cred)
fuente = (pathlib.Path(__file__).resolve().parent.parent / "firestore.rules").read_text(encoding="utf-8")
r = s.post(f"https://firebaserules.googleapis.com/v1/projects/{proy}/rulesets", json={"source": {"files": [{"name": "firestore.rules", "content": fuente}]}})
r.raise_for_status()
nombre = r.json()["name"]
rel = f"projects/{proy}/releases/cloud.firestore"
r = s.patch(f"https://firebaserules.googleapis.com/v1/{rel}", json={"release": {"name": rel, "rulesetName": nombre}})
r.raise_for_status()
print("Reglas publicadas:", nombre)
