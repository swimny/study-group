@echo off
cd /d "C:\Users\rlatn\Desktop\studygroup\backend"
echo ==== %date% %time% ==== >> scripts\weekly_report.log
"C:\Users\rlatn\Desktop\studygroup\backend\.venv\Scripts\python.exe" scripts\generate_weekly_report.py >> scripts\weekly_report.log 2>&1