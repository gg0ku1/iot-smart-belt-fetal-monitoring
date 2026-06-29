# Hardware Components

This document lists the hardware components used in the **IoT-Based Smart Belt for Fetal Movement and Maternal Health Monitoring** prototype.

> **Note:** This project is a prototype developed for academic and research purposes. The selected components were chosen based on availability, affordability, and ease of prototyping.

---

## Bill of Materials (BOM)

| Component                | Quantity | Description                                                                                                               |
| ------------------------ | :------: | ------------------------------------------------------------------------------------------------------------------------- |
| ESP32 DevKit V1          |     1    | Primary microcontroller responsible for sensor interfacing, data processing, Wi-Fi communication, and cloud connectivity. |
| Pulse Sensor             |     1    | Used to obtain maternal pulse readings during controlled monitoring sessions.                                             |
| DHT11 Temperature Sensor |     1    | Measures ambient/body-adjacent temperature for demonstration and monitoring purposes.                                     |
| SW-420 Vibration Sensor  |     1    | Used to simulate and detect fetal movement events within the prototype.                                                   |
| Breadboard               |     1    | Provides a solderless platform for circuit prototyping.                                                                   |
| Jumper Wires             | Multiple | Used for electrical connections between sensors and the ESP32.                                                            |
| USB Cable                |     1    | Powers and programs the ESP32 development board.                                                                          |

---

## Hardware Overview

The prototype follows a modular architecture where the ESP32 acts as the central controller. Sensor readings are collected and transmitted to the Firebase Realtime Database through the built-in Wi-Fi module. A Python-based machine learning module retrieves the data, performs prediction, and writes the classification back to Firebase for visualization on the dashboard.

```
Sensors
   │
   ▼
ESP32
   │
   ▼
Firebase Realtime Database
   │
   ▼
Python ML Module
   │
   ▼
Firebase
   │
   ▼
Web Dashboard
```

---

## Sensor Summary

| Sensor       | Parameter Monitored | Purpose                                                   |
| ------------ | ------------------- | --------------------------------------------------------- |
| Pulse Sensor | Maternal Pulse      | Collect physiological input for monitoring and analysis   |
| DHT11        | Temperature         | Monitor temperature trends                                |
| SW-420       | Movement            | Detect movement events used for fetal activity simulation |

---

## Development Tools

### Hardware

* ESP32 DevKit V1
* Breadboard
* Jumper wires

### Software

* Arduino IDE
* Python 3.x
* Firebase Realtime Database
* Google Colab
* HTML, CSS & JavaScript
* Visual Studio Code

---

## Notes

* The system is intended as a proof-of-concept prototype and is **not a certified medical device**.
* Sensor data may be combined with controlled simulation during demonstrations to validate cloud communication, dashboard visualization, and machine learning inference.
* The modular architecture allows additional medical-grade sensors to be integrated with minimal software modifications.
