# Hardware Wiring Guide

This document explains how to connect each sensor to the ESP32 DevKit V1 (38-pin).

## Components

- ESP32 DevKit V1 (38-pin)
- KY-039 Pulse Sensor
- DHT11 Temperature Sensor (3-pin module)
- SW-420 Vibration Sensor Module

---

## ESP32 Pin Connections

| Sensor | Sensor Pin | ESP32 Pin |
|---------|------------|-----------|
| KY-039 Pulse Sensor | VCC | 3.3V |
| | GND | GND |
| | OUT | GPIO34 |
| DHT11 | VCC | 3.3V |
| | GND | GND |
| | DATA | GPIO4 |
| SW-420 | VCC | 3.3V |
| | GND | GND |
| | DO / OUT | GPIO5 |

---

## Wiring Notes

- Connect all sensor GND pins to the ESP32 GND.
- Connect all sensor VCC pins to the ESP32 3.3V pin.
- Ensure the Pulse Sensor OUT pin is connected to GPIO34 (ADC input).
- The DHT11 DATA pin must be connected to GPIO4.
- The SW-420 digital output pin must be connected to GPIO5.

---

## Physical Setup

See the setup photographs in:

hardware/circuit_setup/

- setup.jpg

These images show the exact wiring used in this project.
