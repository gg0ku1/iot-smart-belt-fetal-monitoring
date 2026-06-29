import time
import pyrebase
import pandas as pd
import joblib

# ---------------- FIREBASE CONFIG ----------------
config = {
    "apiKey": "YOUR_API_KEY",
    "authDomain": "YOUR_AUTHDOMAIN",
    "databaseURL": "YOUR_FIRBASE_URL",
    "projectId": "YOUR_PROJECT_ID",
    "storageBucket": "STORAGE_BUCKET_DETAILS",
    "messagingSenderId": "123456789",   # not critical
    "appId": "1:123456789:web:test"     # not critical
}

firebase = pyrebase.initialize_app(config)
db = firebase.database()

# ---------------- LOAD ML MODEL ----------------
model = joblib.load("fetal_rf_model.joblib")
cols = joblib.load("fetal_rf_columns.joblib")
le = joblib.load("label_encoder.joblib")

print("🔥 ML Prediction System Running...\n")

while True:
    try:
        # -------- FETCH DATA FROM FIREBASE --------
        data = db.child("data").get().val()
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   
        pulse = data.get("pulse", 0)
        temp = data.get("temp", 0)
        movement = data.get("movement", 0)

        # -------- PREPARE INPUT --------
        sample = pd.DataFrame([[pulse, temp, movement]], columns=cols)

        # -------- PREDICT --------
        pred = model.predict(sample)
        result = le.inverse_transform(pred)[0]

        # -------- UPDATE FIREBASE --------
        db.child("data").update({
            "status": result
        })

        print(f"Pulse: {pulse} | Temp: {temp} | Movement: {movement} → {result}")

    except Exception as e:
        print("❌ Error:", e)

    time.sleep(5)