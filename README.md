<img width="1905" height="1036" alt="Screenshot 2026-05-13 151041" src="https://github.com/user-attachments/assets/5c885c4f-85b9-447a-9924-05ea1cd014af" />1. Deskripsi Singkat Projek
Proyek ini adalah simulasi sistem Internet of Things (IoT) berbasis protokol MQTT untuk manajemen
fasilitas ruangan (Facility Management Dashboard - Smart Campus). Sistem ini dibangun tanpa
menggunakan perangkat keras fisik, melainkan menggunakan simulasi berbasis Node.js sebagai
publisher. Data yang dikirimkan mencakup suhu ruangan, intensitas cahaya, pelacakan status
perangkat, dan konsumsi daya.
Sistem ini menggunakan Mosquitto sebagai MQTT Broker. Data yang dipublikasikan kemudian diterima
oleh dua subscriber utama: sebuah Controller Backend (Node.js) yang menjalankan logika otomasi, dan
sebuah Frontend Dashboard (Vite/React) yang berfungsi untuk pemantauan secara real-time serta
memberikan antarmuka kendali bagi pengguna. Seluruh fitur utama MQTT termasuk pengelompokan
Topic terstruktur, level Quality of Service (QoS), Retained Message, dan fitur pemantauan Last Will and
Testament (LWT) telah diimplementasikan.

2. Arsitektur
Sistem ini terdiri dari tiga komponen utama yang saling terhubung melalui protokol MQTT (port 1883
untuk koneksi lokal backend Node.js dan port WebSocket 9001 untuk koneksi web Frontend):
MQTT Broker (Mosquitto): Pusat perutean pesan antar klien IoT.
Publishers (Node.js): Terdapat simulasi untuk 4 entitas perangkat dengan role berbeda, yaitu:
Environment Sensor, Device Tracker, Power Monitor, dan Auto Controller.
Subscriber 1 (Controller - Node.js): Berfungsi memantau data sensor secara terus-menerus dan
mengeksekusi aksi cerdas otomatis (misal: mengirimkan payload kontrol aktuator jika metrik
lingkungan melewati batas tertentu).
Subscriber 2 (Dashboard - Web Frontend): Bertindak ganda sebagai subscriber untuk
memantau metrik lingkungan dan indikator health node, sekaligus sebagai publisher saat
pengguna mengirimkan perintah manual.

3. Design Topic (Topic Tree)

Struktur topik pada sistem ini didesain secara hierarkis untuk memisahkan data sensor, status perangkat, dan jalur instruksi kendali.

| Topik MQTT | Arah (Aksi) | Deskripsi / Payload |
| :--- | :--- | :--- |
| `campus/room1/sensor/environment` | **Publish** | Data Suhu (°C) dan Intensitas Cahaya (Lux) |
| `campus/room1/device/status` | **Publish** | Status aktuator Lampu (ON/OFF) dan AC (ON/OFF) |
| `campus/room1/power/usage` | **Publish** | Konsumsi daya (Watt) untuk Lampu, AC, dan Standby |
| `campus/room1/control/lamp` | **Subscribe** | Menerima perintah ON/OFF untuk kontrol Lampu |
| `campus/room1/health/lwt` | **LWT (Will)** | Status "Offline" otomatis jika koneksi node terputus |

4. Fitur-fitur Implementasi MQTT

A. Publisher & Subscriber Real-time
Sistem ini sudah merealisasikan komunikasi asinkron antara 3 entitas publisher data metrik dan 2 entitas
subscriber (Backend Controller dan User Dashboard) tanpa adanya delay HTTP request konvensional.
B. Last Will and Testament (LWT)
Sistem dilengkapi kapabilitas deteksi perangkat mati secara otomatis. Berdasarkan bukti terminal
Controller, saat Environment Sensor terputus secara tiba-tiba akibat koneksi paksa/error
(ECONNABORTED), broker langsung merilis pesan Will yang tersimpan ke topik deteksi sehingga memicu
peringatan berbunyi ALERT : SENSOR has gone OFFLINE!.

<img width="1905" height="1036" alt="Screenshot 2026-05-13 151041" src="https://github.com/user-attachments/assets/6a785979-0559-47c2-9b74-2a0da09eb590" />

C. Implementasi Logika Otomasi (Controller Sub-Pub)
Selain sebagai UI monitoring, terdapat kapabilitas kendali tertutup (closed-loop). Node Controller
membaca nilai intensitas cahaya secara periodik. Saat Lux berada di bawah 100, controller mengirimkan
sinyal kendali sehingga Lamp status updated -> ON secara mandiri. Begitu juga sebaliknya ketika
ruangan menjadi cukup terang.

<img width="1857" height="931" alt="Screenshot 2026-05-13 151048" src="https://github.com/user-attachments/assets/252d89eb-822b-4703-ad64-a8885b4c0d2a" />

D. Retained Messages
Metode penyimpanan pesan terakhir diaplikasikan pada status perangkat. Hal ini dibuktikan saat
pengguna baru membuka antarmuka web, panel Lampu dan panel AC akan langsung mengetahui wujud
terakhirnya tanpa harus menunggu siklus transmisi data dari hardware/script Node.js mengirimkan
kembali state status yang redundan.

5. Dashboard Monitoring
Frontend application bertugas sebagai gerbang utama interaksi dengan pengguna akhir. Panel telah
dibekali dengan beberapa fitur spesifik:
Status Koneksi Socket: Notifikasi pita hijau di atas "Connected to MQTT Broker (WebSocket)".
Pemantauan Metrik Tiga Pilar: Modul visibilitas data lingkungan real-time yang memisahkan
pembacaan Temperature (dalam satuan °C) dan nilai Light Intensity (Lux), serta integrasi data
simulasi daya listrik Power Usage dalam satuan Watt.
Panel Remote Control: Interaksi dua arah memungkinkan staf operasional meremote AC dan
Lampu ruangan dengan tombol *Turn ON / OFF*.
Service Health Monitor: Bar status indikator hijau/merah di bagian bawah memberikan
pandangan instan atas integritas infrastruktur (Status Online/Offline dari Sensor, Pelacak, maupun
Monitor Daya).

<img width="1860" height="981" alt="Screenshot 2026-05-13 151103" src="https://github.com/user-attachments/assets/3ef4d8f2-0bef-4e20-afd4-91dcdfab49df" />
