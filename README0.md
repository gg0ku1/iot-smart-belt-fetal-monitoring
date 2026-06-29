<div align="center">

# IoT-Based Smart Belt for Fetal Movement and Maternal Health Monitoring

A wearable IoT healthcare prototype that combines **ESP32**, **Firebase Realtime Database**, **Machine Learning**, and a **real-time dashboard** for continuous maternal health monitoring.

<p align="center">
  <img src="docs/poster_sem2.png" width="900">
</p>

</div>

---

## 📖 Overview

Continuous monitoring of fetal movement and maternal health is important for identifying potential pregnancy-related complications at an early stage. This project presents an IoT-enabled wearable smart belt capable of collecting physiological data, transmitting it to the cloud, performing machine learning-based prediction, and displaying real-time information through an interactive dashboard.

The prototype integrates hardware sensing, cloud computing, and machine learning into a single modular architecture suitable for academic demonstration and future healthcare applications.

> **Note:** The prototype combines real sensor acquisition with controlled simulation during demonstrations to validate the complete cloud communication, dashboard visualization, and machine learning workflow.

---

# ✨ Features

- ESP32-based IoT data acquisition
- Pulse, temperature, and fetal movement monitoring
- Firebase Realtime Database integration
- Python-based Random Forest prediction
- Interactive web dashboard
- Real-time graphical visualization
- Automated health status classification
- Modular and scalable architecture

---

# 🏗️ System Architecture

```
Pulse Sensor
Temperature Sensor
Vibration Sensor
        │
        ▼
      ESP32
        │
        ▼
Firebase Realtime Database
        │
        ▼
Python ML Processing
(Random Forest)
        │
        ▼
Prediction Results
        │
        ▼
Firebase
        │
        ▼
Dashboard
        │
        ▼
Graphs • Alerts • Status
```

<p align="center">
  <img src="screenshots/architecture.png" width="850">
</p>

---

# ⚙️ Technology Stack

| Category | Technologies |
|-----------|--------------|
| Hardware | ESP32, Pulse Sensor, DHT11, SW-420 |
| Cloud | Firebase Realtime Database |
| Machine Learning | Python, Random Forest, Scikit-learn |
| Frontend | HTML, CSS, JavaScript |
| Development Tools | Arduino IDE, VS Code, Google Colab |

---

# 📂 Repository Structure

```
iot-smart-belt-fetal-monitoring/

├── dashboard/
├── docs/
├── firebase/
├── hardware/
├── ml_model/
├── screenshots/
├── README.md
└── LICENSE
```

---

# 📸 Project Screenshots

## Hardware Prototype

| Semester VII | Semester VIII |
|---------------|----------------|
| <img src="screenshots/setup_initial.jpg" width="420"> | <img src="screenshots/setup_final.jpg" width="420"> |

---

## Dashboard

<p align="center">
  <img src="screenshots/dashboard1.png" width="900">
</p>

<p align="center">
  <img src="screenshots/dashboard2.png" width="900">
</p>

<p align="center">
  <img src="screenshots/dashboard3.png" width="900">
</p>

<p align="center">
  <img src="screenshots/dashboard4.png" width="900">
</p>

---

## Firebase Realtime Database

<p align="center">
  <img src="screenshots/firebase.png" width="900">
</p>

---

## Physiological Data Visualization

<p align="center">
  <img src="screenshots/graph.png" width="900">
</p>

---

# 🤖 Machine Learning Pipeline

```
ESP32
   │
Firebase
   │
Python Prediction Script
(Random Forest Model)
   │
Prediction
   │
Firebase
   │
Dashboard
```

The Python inference module continuously retrieves sensor data from Firebase, performs prediction using the trained Random Forest model, and writes the predicted health status back to Firebase. The dashboard automatically updates to display the latest prediction alongside the incoming sensor readings.

---

# 📊 Results

The implemented prototype successfully demonstrates:

- ✅ Real-time sensor interfacing using ESP32
- ✅ Cloud synchronization using Firebase
- ✅ Machine learning-based health prediction
- ✅ Interactive dashboard visualization
- ✅ Live physiological graphs
- ✅ Automated health status classification

---

# 📚 Documentation

| Document | Description |
|-----------|-------------|
| 📘 Project Report | Complete implementation, methodology, and results |
| 📄 Research Paper | IRJMETS research paper |
| 🖼️ Semester VII Poster | Initial project presentation |
| 🖼️ Semester VIII Poster | Final implementation poster |

---

# 🔮 Future Scope

- 📱 Mobile application for remote monitoring
- 🔔 Push notifications for emergency alerts
- 🧠 Edge AI deployment on embedded hardware
- 🏥 Integration of medical-grade sensors
- ☁️ Cloud scalability and analytics
- 📡 Clinical validation with real-world datasets

---

# 👥 Team

| Name |
|------|
| Gokul Gopakumar |
| Rohit Ghoghare |
| Naeem Mulla |
| Kunal Bansal |

---

# 👨‍🏫 Project Guide

**Dr. Soumitra Das**

Department of Computer Engineering

Indira College of Engineering and Management

---

# ⚠️ Disclaimer

This project was developed as an academic prototype for educational and research purposes. It is **not intended to replace professional medical equipment or clinical diagnosis**. Some demonstrations utilize controlled simulation to validate the complete cloud and machine learning workflow.

---

# 📄 License

This project is licensed under the MIT License.