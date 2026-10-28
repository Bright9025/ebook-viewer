@echo off
rem Chromium's sandbox cannot initialize in some Windows sessions (this app is
rem built under a CJK path and a restricted job). This launcher starts the
rem reader with the sandbox disabled. Run "Ebook Viewer.exe" directly on
rem machines where Chromium's sandbox works.
cd /d "%~dp0"
start "" "Ebook Viewer.exe" --no-sandbox
